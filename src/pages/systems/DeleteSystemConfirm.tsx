import React from 'react';

import { deleteSystem } from '../../shared/api';

import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from './MutationConfirmModal';

import type { ApiClient, SystemDto } from '../../shared/api';

/**
 * Copy do diálogo de confirmação para soft-delete (Issue #60). O slot
 * opcional `errorCopy.conflictMessage` fica intencionalmente ausente —
 * o backend nunca devolve 409 em `DELETE /systems/{id}`, e o helper
 * trata 409 como `unhandled` neste cenário (vide `classifyMutationError`).
 * Esse slot existe na assinatura para que o `RestoreSystemConfirm` (#61)
 * reuse a mesma máquina de classificação sem refator do shared (lição
 * PR #128).
 */
const DELETE_COPY: MutationConfirmCopy = {
  title: 'Desativar sistema?',
  descriptionPrefix: 'O sistema ',
  descriptionSuffix:
    ' será desativado e sumirá da listagem padrão. Você poderá restaurá-lo depois ativando "Mostrar inativos".',
  confirmLabel: 'Desativar',
  successMessage: 'Sistema desativado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao desativar sistema',
    genericFallback: 'Não foi possível desativar o sistema. Tente novamente.',
    notFoundMessage: 'Sistema não encontrado ou foi removido. Atualize a lista.',
  },
};

/**
 * Função adapter `(system, client?) => Promise<void>` que delega para
 * `deleteSystem(system.id, undefined, client)`. Mantemos a função fora
 * do componente para não recriá-la a cada render — o `MutationConfirmModal`
 * usa `mutate` em `useCallback`, então uma referência estável evita
 * invalidação desnecessária.
 */
function performDelete(system: SystemDto, client?: ApiClient): Promise<void> {
  return deleteSystem(system.id, undefined, client);
}

interface DeleteSystemConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Sistema selecionado para soft-delete. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `system`.
   * Mantemos o objeto completo (não só `id`) para que a copy exiba
   * `name`/`code` sem precisar de re-fetch.
   */
  system: SystemDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após desativação bem-sucedida ou após detecção
   * de 404 (item já removido por outra sessão) — em ambos casos a UI
   * quer refetch para sincronizar a tabela com o estado real do backend.
   */
  onDeleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `deleteSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação para soft-delete de sistema (Issue #60).
 *
 * Wrapper fino sobre `MutationConfirmModal` (#61) — toda a estrutura
 * visual + lógica de submissão/erro vive no shell compartilhado. Aqui
 * só injetamos:
 *
 * - **Copy** (`DELETE_COPY`): título, descrição, label do botão e
 *   mensagens de toast.
 * - **Mutate** (`performDelete`): adapta `deleteSystem(id)` para a
 *   assinatura `(system, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`danger`): destaca o caráter destrutivo. Já existe no
 *   design system local (`Button.tsx`); não precisamos hardcodar cor.
 * - **`testIdPrefix`** (`delete-system`): preserva os `data-testid`
 *   legados das suítes de teste sem reescrever asserts.
 *
 * O `MutationConfirmModal` cuida de:
 *
 * - **Confirmação obrigatória** (critério de aceite #60): o botão só
 *   dispara `DELETE` após clique explícito. O foco vai para o botão
 *   Cancelar (ordem do DOM) — Enter acidental fecha sem destruir.
 * - **Cancelar/Esc/backdrop fecham sem persistir** (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela flag
 *   `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError` em
 *   `systemFormShared.ts`. Switch curto evita cascata `if/else` que o
 *   Sonar marca como Cognitive Complexity > 10 (lição PR #128).
 *
 * O `RestoreSystemConfirm` (#61, última sub-issue) reusa o mesmo shell
 * com copy + variant + mutate diferentes — extrair `MutationConfirmModal`
 * eliminou ~150 linhas que seriam duplicadas (BLOCKER de Sonar
 * `New Code Duplication`, 5ª recorrência das lições
 * PR #119/#123/#127/#128 evitada).
 */
export const DeleteSystemConfirm: React.FC<DeleteSystemConfirmProps> = ({
  open,
  system,
  onClose,
  onDeleted,
  client,
}) => (
  <MutationConfirmModal
    open={open}
    system={system}
    onClose={onClose}
    onSuccess={onDeleted}
    client={client}
    mutate={performDelete}
    copy={DELETE_COPY}
    confirmVariant="danger"
    testIdPrefix="delete-system"
  />
);
