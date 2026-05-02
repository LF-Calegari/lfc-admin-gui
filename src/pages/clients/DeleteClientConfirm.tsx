import React, { useMemo } from 'react';

import { deleteClient } from '../../shared/api';
import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from '../systems/MutationConfirmModal';

import {
  toClientMutationTarget,
  type ClientMutationTarget,
} from './clientMutationTarget';

import type { ApiClient, ClientDto } from '../../shared/api';

/**
 * Copy do diálogo de confirmação para soft-delete de cliente
 * (Issue #76, EPIC #49). Espelha `DELETE_COPY` de
 * `DeleteSystemConfirm`/`ToggleUserActiveConfirm`, com vocabulário
 * adaptado para clientes.
 *
 * O slot `errorCopy.conflictMessage` está preenchido por previsão:
 * o backend atual (`ClientsController.DeleteById`) não devolve 409
 * quando há usuários vinculados — apenas faz o soft-delete sem
 * detachar os vínculos. Mas o critério de aceite #76 exige
 * "Tratamento de erro caso o cliente tenha usuários ativos
 * vinculados.". Pré-projetar o slot agora cobre o cenário se o
 * backend evoluir para split de 404/409 (paridade com `RestoreSystem`),
 * sem reabrir esta sub-issue. Lição PR #128: pré-projetar o helper
 * compartilhado é mais barato do que abrir um PR adicional.
 */
const DELETE_COPY: MutationConfirmCopy = {
  title: 'Desativar cliente?',
  descriptionPrefix: 'O cliente ',
  descriptionSuffix:
    ' será desativado e sumirá da listagem padrão. Você poderá restaurá-lo depois ativando "Mostrar inativos".',
  confirmLabel: 'Desativar',
  successMessage: 'Cliente desativado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao desativar cliente',
    genericFallback: 'Não foi possível desativar o cliente. Tente novamente.',
    notFoundMessage:
      'Cliente não encontrado ou foi removido. Atualize a lista.',
    conflictMessage:
      'Não é possível desativar este cliente porque há usuários ativos vinculados.',
  },
};

/**
 * O adapter `ClientDto` → `MutationTarget` vive em
 * `clientMutationTarget.ts` para que `DeleteClientConfirm` e
 * `RestoreClientConfirm` reusem a mesma transformação sem
 * duplicar a `interface` + a função (lição PR #128/#134/#135 — bloco
 * ≥10 linhas idêntico em 2 arquivos vira `New Code Duplication` no
 * Sonar). O shell `MutationConfirmModal` exibe `target.name` em
 * destaque + `target.code` em monoespaçado entre parênteses.
 */
interface DeleteClientConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Cliente selecionado para soft-delete. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `client`.
   * Mantemos o objeto completo (não só `id`) para que a copy exiba
   * `name`/`document` sem precisar de re-fetch.
   */
  client: ClientDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após desativação bem-sucedida ou após detecção
   * de 404 (cliente já removido por outra sessão) — em ambos casos a
   * UI quer refetch para sincronizar a tabela com o estado real do
   * backend.
   */
  onDeleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `deleteClient` cai no singleton `apiClient`.
   */
  apiClient?: ApiClient;
}

/**
 * Modal de confirmação para soft-delete de cliente (Issue #76, EPIC
 * #49 — fecha o CRUD básico de clientes junto com o restore).
 *
 * Wrapper fino sobre `MutationConfirmModal` (extraído na #61 e
 * generalizado na #65 para servir múltiplos recursos) — toda a
 * estrutura visual + lógica de submissão/erro vive no shell
 * compartilhado. Aqui só injetamos:
 *
 * - **Copy** (`DELETE_COPY`): título, descrição, label do botão,
 *   mensagens de toast e `errorCopy.conflictMessage` defensivo (#76).
 * - **Mutate**: adapta `deleteClient(id)` para a assinatura
 *   `(target, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`danger`): destaca o caráter destrutivo. Já existe
 *   no design system local (`Button.tsx`); não precisamos hardcodar
 *   cor.
 * - **`testIdPrefix`** (`delete-client`): identifica os elementos do
 *   modal nas suítes de teste sem colidir com o
 *   `delete-system`/`delete-route`.
 *
 * O `MutationConfirmModal` cuida de:
 *
 * - **Confirmação obrigatória** (critério de aceite #76): o botão só
 *   dispara `DELETE` após clique explícito. O foco vai para o botão
 *   Cancelar (ordem do DOM) — Enter acidental fecha sem destruir.
 * - **Cancelar/Esc/backdrop fecham sem persistir** (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela flag
 *   `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError`:
 *
 *   - `404` → fecha modal + toast vermelho + refetch (cliente removido
 *     por outra sessão entre abertura e submit). Backend devolve 404
 *     com mensagem `"Cliente não encontrado."`; o frontend exibe a copy
 *     traduzida.
 *   - `409` → toast vermelho com `DELETE_COPY.errorCopy.conflictMessage`.
 *     Hoje o backend não devolve esse status no DELETE — apenas faz o
 *     soft-delete sem detachar vínculos —, mas o slot fica preparado
 *     para evolução de contrato (critério de aceite #76).
 *   - `401`/`403` → toast vermelho com mensagem do backend (UI continua
 *     no estado atual; cliente HTTP cuida do redirect 401).
 *   - Network/parse/5xx → toast vermelho genérico com fallback.
 *
 * **Por que reusar `MutationConfirmModal` em vez de criar um modal
 * próprio?** Sonar tokeniza ≥10 linhas idênticas como `New Code
 * Duplication` (lições PR #119/#123/#127/#128/#134/#135 — 6
 * recorrências). Recriar o shell aqui duplicaria ~80 linhas de
 * estrutura visual + try/catch/classify. Reusar mantém a fonte
 * deduplicada por construção.
 */
export const DeleteClientConfirm: React.FC<DeleteClientConfirmProps> = ({
  open,
  client,
  onClose,
  onDeleted,
  apiClient,
}) => {
  const target = toClientMutationTarget(client);

  /**
   * Função adapter `(target, http?) => Promise<unknown>` que delega
   * para `deleteClient(client.id, undefined, http)`. Memoizada com
   * `useMemo` (não `useCallback` para preservar o tipo de retorno) —
   * o `MutationConfirmModal` consome `mutate` em `useCallback`,
   * então uma referência estável evita invalidação desnecessária
   * quando o `client` não muda. Se `client` for `null` (modal
   * fechado), o shell não chega a invocar `mutate` (`target=null`
   * curto-circuita o render).
   */
  const performDelete = useMemo(
    () =>
      function (
        _target: ClientMutationTarget,
        http?: ApiClient,
      ): Promise<unknown> {
        if (!client) {
          return Promise.reject(new Error('Client unavailable.'));
        }
        return deleteClient(client.id, undefined, http);
      },
    [client],
  );

  return (
    <MutationConfirmModal<ClientMutationTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onDeleted}
      client={apiClient}
      mutate={performDelete}
      copy={DELETE_COPY}
      confirmVariant="danger"
      testIdPrefix="delete-client"
    />
  );
};
