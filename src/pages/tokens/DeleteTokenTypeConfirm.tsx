import React, { useMemo } from 'react';

import { deleteTokenType } from '../../shared/api';
import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from '../systems/MutationConfirmModal';

import {
  toTokenTypeMutationTarget,
  type TokenTypeMutationTarget,
} from './tokenTypeMutationTarget';

import type { ApiClient, TokenTypeDto } from '../../shared/api';

/**
 * Copy do diálogo de confirmação para soft-delete de tipo de token
 * (Issue #175). Espelha `DELETE_COPY` de
 * `DeleteSystemConfirm`/`DeleteClientConfirm`, com vocabulário
 * adaptado para token types.
 *
 * O slot `errorCopy.conflictMessage` está preenchido por previsão: o
 * backend atual (`TokenTypesController.DeleteById`) não devolve 409
 * quando há rotas vinculadas ao token type — apenas faz o soft-delete
 * (rotas que referenciam um token type soft-deletado renderizam strings
 * vazias em `systemTokenTypeCode`/`systemTokenTypeName` na listagem de
 * `RoutesPage`). Pré-projetar o slot agora cobre o cenário se o
 * backend evoluir para split de 404/409, sem reabrir esta sub-issue.
 * Lição PR #128: pré-projetar o helper compartilhado é mais barato do
 * que abrir um PR adicional.
 */
const DELETE_COPY: MutationConfirmCopy = {
  title: 'Desativar tipo de token?',
  descriptionPrefix: 'O tipo de token ',
  descriptionSuffix:
    ' será desativado e sumirá da listagem padrão. Você poderá restaurá-lo depois ativando "Mostrar inativos". Atenção: rotas que referenciam este tipo passarão a exibir o token associado como inativo.',
  confirmLabel: 'Desativar',
  successMessage: 'Tipo de token desativado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao desativar tipo de token',
    genericFallback:
      'Não foi possível desativar o tipo de token. Tente novamente.',
    notFoundMessage:
      'Tipo de token não encontrado ou foi removido. Atualize a lista.',
    conflictMessage:
      'Não é possível desativar este tipo de token porque há rotas ativas vinculadas.',
  },
};

interface DeleteTokenTypeConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Tipo de token selecionado para soft-delete. Quando `null`, o modal
   * não renderiza — caller controla `open` em conjunto com `tokenType`.
   * Mantemos o objeto completo (não só `id`) para que a copy exiba
   * `name`/`code` sem precisar de re-fetch.
   */
  tokenType: TokenTypeDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após desativação bem-sucedida ou após detecção
   * de 404 (token type já removido por outra sessão) — em ambos casos
   * a UI quer refetch para sincronizar a tabela com o estado real do
   * backend.
   */
  onDeleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `deleteTokenType` cai no singleton `apiClient`.
   */
  apiClient?: ApiClient;
}

/**
 * Modal de confirmação para soft-delete de tipo de token (Issue #175).
 *
 * Wrapper fino sobre `MutationConfirmModal` (extraído na #61 e
 * generalizado na #65 para servir múltiplos recursos) — toda a
 * estrutura visual + lógica de submissão/erro vive no shell
 * compartilhado. Aqui só injetamos:
 *
 * - **Copy** (`DELETE_COPY`): título, descrição, label do botão,
 *   mensagens de toast e `errorCopy.conflictMessage` defensivo.
 * - **Mutate**: adapta `deleteTokenType(id)` para a assinatura
 *   `(target, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`danger`): destaca o caráter destrutivo. Já existe
 *   no design system local (`Button.tsx`); não precisamos hardcodar
 *   cor.
 * - **`testIdPrefix`** (`delete-token-type`): identifica os elementos
 *   do modal nas suítes de teste sem colidir com o
 *   `delete-system`/`delete-client`.
 *
 * O `MutationConfirmModal` cuida do ciclo inteiro (confirmação,
 * submissão, mapeamento de erros 404/401/403/network, refetch após
 * sucesso ou 404) — espelha o pattern já validado em sistemas, rotas e
 * clientes.
 */
export const DeleteTokenTypeConfirm: React.FC<DeleteTokenTypeConfirmProps> = ({
  open,
  tokenType,
  onClose,
  onDeleted,
  apiClient,
}) => {
  const target = toTokenTypeMutationTarget(tokenType);

  /**
   * Função adapter `(target, http?) => Promise<unknown>` que delega
   * para `deleteTokenType(tokenType.id, undefined, http)`. Memoizada
   * com `useMemo` (não `useCallback` para preservar o tipo de retorno)
   * — o `MutationConfirmModal` consome `mutate` em `useCallback`,
   * então uma referência estável evita invalidação desnecessária
   * quando o `tokenType` não muda. Se `tokenType` for `null` (modal
   * fechado), o shell não chega a invocar `mutate` (`target=null`
   * curto-circuita o render).
   */
  const performDelete = useMemo(
    () =>
      function (
        _target: TokenTypeMutationTarget,
        http?: ApiClient,
      ): Promise<unknown> {
        if (!tokenType) {
          return Promise.reject(new Error('TokenType unavailable.'));
        }
        return deleteTokenType(tokenType.id, undefined, http);
      },
    [tokenType],
  );

  return (
    <MutationConfirmModal<TokenTypeMutationTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onDeleted}
      client={apiClient}
      mutate={performDelete}
      copy={DELETE_COPY}
      confirmVariant="danger"
      testIdPrefix="delete-token-type"
    />
  );
};
