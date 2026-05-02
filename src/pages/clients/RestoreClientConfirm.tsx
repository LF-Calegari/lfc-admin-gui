import React, { useMemo } from 'react';

import { restoreClient } from '../../shared/api';
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
 * Copy do diálogo de confirmação para restauração de cliente
 * (Issue #76, EPIC #49 — última sub-issue do CRUD básico de clientes,
 * em paralelo com o `DeleteClientConfirm`).
 *
 * Espelha `RESTORE_COPY` de `RestoreSystemConfirm` (#61), com
 * vocabulário adaptado para clientes. O slot
 * `errorCopy.conflictMessage` está preenchido por previsão: o backend
 * atual (`ClientsController.RestoreById`) devolve **404** com mensagem
 * específica quando o cliente já está ativo (em vez de 409), mas o
 * `classifyMutationError` trata o eventual 409 com `kind: 'conflict'`
 * quando esse slot existe — assim, qualquer mudança futura do
 * contrato (split de 404/409) fica coberta sem reabrir o modal.
 * Lição PR #128: pré-projetar o helper compartilhado é mais barato
 * do que abrir um PR adicional.
 */
const RESTORE_COPY: MutationConfirmCopy = {
  title: 'Restaurar cliente?',
  descriptionPrefix: 'O cliente ',
  descriptionSuffix: ' voltará a aparecer na listagem padrão.',
  confirmLabel: 'Restaurar',
  successMessage: 'Cliente restaurado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao restaurar cliente',
    genericFallback: 'Não foi possível restaurar o cliente. Tente novamente.',
    notFoundMessage: 'Cliente não encontrado ou já está ativo.',
    conflictMessage: 'O cliente já está ativo.',
  },
};

/**
 * O adapter `ClientDto` → `MutationTarget` vive em
 * `clientMutationTarget.ts` para que `DeleteClientConfirm` e este
 * componente reusem a mesma transformação sem duplicar a `interface`
 * + a função (lição PR #128/#134/#135).
 */
interface RestoreClientConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Cliente soft-deletado selecionado para restauração. Quando `null`,
   * o modal não renderiza — caller controla `open` em conjunto com
   * `client`. Mantemos o objeto completo (não só `id`) para que a
   * copy exiba `name`/`document` sem precisar de re-fetch.
   */
  client: ClientDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após restauração bem-sucedida ou após
   * detecção de 404 (cliente não encontrado ou já ativo) — em ambos
   * casos a UI quer refetch para sincronizar a tabela com o estado
   * real do backend.
   */
  onRestored: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `restoreClient` cai no singleton `apiClient`.
   */
  apiClient?: ApiClient;
}

/**
 * Modal de confirmação para restauração de cliente soft-deletado
 * (Issue #76, EPIC #49 — fecha o CRUD básico de clientes ao lado do
 * `DeleteClientConfirm`).
 *
 * Wrapper fino sobre `MutationConfirmModal` — espelha o
 * `RestoreSystemConfirm` em estrutura, mas injeta:
 *
 * - **Copy** (`RESTORE_COPY`): "Restaurar cliente?" + descrição
 *   contextual; sem aviso de "ativar Mostrar inativos" porque o
 *   cliente volta diretamente para a listagem padrão após o restore.
 * - **Mutate**: adapta `restoreClient(id)` para a assinatura
 *   `(target, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`primary`): ação positiva (restaura/ativa) — o
 *   token `--clr-lime`/`--clr-forest` do design system reforça o
 *   significado sem hardcode de cor (paridade com
 *   `RestoreSystemConfirm`).
 * - **`testIdPrefix`** (`restore-client`): identifica os elementos
 *   do modal nas suítes de teste sem colidir com o
 *   `restore-system`.
 *
 * O `MutationConfirmModal` cuida de:
 *
 * - **Confirmação obrigatória** (critério de aceite #76).
 * - **Cancelar/Esc/backdrop** fecham sem persistir (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela
 *   flag interna `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError`:
 *
 *   - `404` → fecha modal + toast vermelho + refetch (cliente removido
 *     ou já ativo entre abertura e submit). Backend devolve 404 com
 *     mensagem `"Cliente não encontrado ou não está deletado."`; o
 *     frontend exibe a copy traduzida `"Cliente não encontrado ou já
 *     está ativo."`.
 *   - `401`/`403` → toast vermelho com mensagem do backend (UI continua
 *     no estado atual; cliente HTTP cuida do redirect 401).
 *   - `409` → toast vermelho com `RESTORE_COPY.errorCopy.conflictMessage`
 *     (defensivo). Hoje o backend não devolve esse status, mas o slot
 *     fica preparado.
 *   - Network/parse/5xx → toast vermelho genérico com fallback.
 */
export const RestoreClientConfirm: React.FC<RestoreClientConfirmProps> = ({
  open,
  client,
  onClose,
  onRestored,
  apiClient,
}) => {
  const target = toClientMutationTarget(client);

  /**
   * Função adapter `(target, http?) => Promise<unknown>` que delega
   * para `restoreClient(client.id, undefined, http)`. Memoizada com
   * `useMemo` para preservar referência estável entre renders —
   * espelha o padrão de `DeleteClientConfirm`/`ToggleUserActiveConfirm`.
   */
  const performRestore = useMemo(
    () =>
      function (
        _target: ClientMutationTarget,
        http?: ApiClient,
      ): Promise<unknown> {
        if (!client) {
          return Promise.reject(new Error('Client unavailable.'));
        }
        return restoreClient(client.id, undefined, http);
      },
    [client],
  );

  return (
    <MutationConfirmModal<ClientMutationTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onRestored}
      client={apiClient}
      mutate={performRestore}
      copy={RESTORE_COPY}
      confirmVariant="primary"
      testIdPrefix="restore-client"
    />
  );
};
