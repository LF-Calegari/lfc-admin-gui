import React, { useMemo } from 'react';

import { restoreTokenType } from '../../shared/api';
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
 * Copy do diálogo de confirmação para restauração de tipo de token
 * (Issue #175 — fecha o CRUD básico de token types em paralelo com o
 * `DeleteTokenTypeConfirm`).
 *
 * Espelha `RESTORE_COPY` de `RestoreSystemConfirm`/`RestoreClientConfirm`,
 * com vocabulário adaptado para token types. O slot
 * `errorCopy.conflictMessage` está preenchido por previsão: o backend
 * atual (`TokenTypesController.RestoreById`) devolve **404** com
 * mensagem específica quando o token type já está ativo (em vez de
 * 409), mas o `classifyMutationError` trata o eventual 409 com
 * `kind: 'conflict'` quando esse slot existe — assim, qualquer
 * mudança futura do contrato (split de 404/409) fica coberta sem
 * reabrir o modal. Lição PR #128: pré-projetar o helper compartilhado
 * é mais barato do que abrir um PR adicional.
 */
const RESTORE_COPY: MutationConfirmCopy = {
  title: 'Restaurar tipo de token?',
  descriptionPrefix: 'O tipo de token ',
  descriptionSuffix: ' voltará a aparecer na listagem padrão.',
  confirmLabel: 'Restaurar',
  successMessage: 'Tipo de token restaurado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao restaurar tipo de token',
    genericFallback:
      'Não foi possível restaurar o tipo de token. Tente novamente.',
    notFoundMessage: 'Tipo de token não encontrado ou já está ativo.',
    conflictMessage: 'O tipo de token já está ativo.',
  },
};

interface RestoreTokenTypeConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Tipo de token soft-deletado selecionado para restauração. Quando
   * `null`, o modal não renderiza — caller controla `open` em conjunto
   * com `tokenType`. Mantemos o objeto completo (não só `id`) para que
   * a copy exiba `name`/`code` sem precisar de re-fetch.
   */
  tokenType: TokenTypeDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após restauração bem-sucedida ou após detecção
   * de 404 (token type não encontrado ou já ativo) — em ambos casos a
   * UI quer refetch para sincronizar a tabela com o estado real do
   * backend.
   */
  onRestored: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `restoreTokenType` cai no singleton `apiClient`.
   */
  apiClient?: ApiClient;
}

/**
 * Modal de confirmação para restauração de tipo de token soft-deletado
 * (Issue #175 — fecha o CRUD básico de token types ao lado do
 * `DeleteTokenTypeConfirm`).
 *
 * Wrapper fino sobre `MutationConfirmModal` — espelha o
 * `RestoreSystemConfirm`/`RestoreClientConfirm` em estrutura, mas
 * injeta:
 *
 * - **Copy** (`RESTORE_COPY`): "Restaurar tipo de token?" + descrição
 *   contextual; sem aviso de "ativar Mostrar inativos" porque o token
 *   type volta diretamente para a listagem padrão após o restore.
 * - **Mutate**: adapta `restoreTokenType(id)` para a assinatura
 *   `(target, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`primary`): ação positiva (restaura/ativa) — o token
 *   `--clr-lime`/`--clr-forest` do design system reforça o significado
 *   sem hardcode de cor (paridade com `RestoreSystemConfirm`/
 *   `RestoreClientConfirm`).
 * - **`testIdPrefix`** (`restore-token-type`): identifica os elementos
 *   do modal nas suítes de teste sem colidir com o
 *   `restore-system`/`restore-client`.
 *
 * O `MutationConfirmModal` cuida do ciclo inteiro (confirmação,
 * submissão, mapeamento de erros 404/401/403/network, refetch após
 * sucesso ou 404).
 */
export const RestoreTokenTypeConfirm: React.FC<RestoreTokenTypeConfirmProps> = ({
  open,
  tokenType,
  onClose,
  onRestored,
  apiClient,
}) => {
  const target = toTokenTypeMutationTarget(tokenType);

  /**
   * Função adapter `(target, http?) => Promise<unknown>` que delega
   * para `restoreTokenType(tokenType.id, undefined, http)`. Memoizada
   * com `useMemo` para preservar referência estável entre renders —
   * espelha o padrão de `DeleteTokenTypeConfirm`/`RestoreClientConfirm`.
   */
  const performRestore = useMemo(
    () =>
      function (
        _target: TokenTypeMutationTarget,
        http?: ApiClient,
      ): Promise<unknown> {
        if (!tokenType) {
          return Promise.reject(new Error('TokenType unavailable.'));
        }
        return restoreTokenType(tokenType.id, undefined, http);
      },
    [tokenType],
  );

  return (
    <MutationConfirmModal<TokenTypeMutationTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onRestored}
      client={apiClient}
      mutate={performRestore}
      copy={RESTORE_COPY}
      confirmVariant="primary"
      testIdPrefix="restore-token-type"
    />
  );
};
