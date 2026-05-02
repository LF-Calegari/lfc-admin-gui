import React from "react";

import { restoreSystem } from "../../shared/api";

import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from "./MutationConfirmModal";

import type { ApiClient, SystemDto } from "../../shared/api";

/**
 * Copy do diálogo de confirmação para restauração (Issue #61, última
 * sub-issue do CRUD da EPIC #45).
 *
 * O slot `errorCopy.conflictMessage` está preenchido por previsão: o
 * backend atual devolve **404** com mensagem específica quando o sistema
 * já está ativo (em vez de 409 distinto), mas o `classifyMutationError`
 * trata o eventual 409 com `kind: 'conflict'` quando esse slot existe
 * — assim, qualquer mudança futura do contrato (split de 404/409) fica
 * coberta sem reabrir o modal. Lição PR #128: pré-projetar o helper
 * compartilhado é mais barato do que abrir um PR adicional.
 */
const RESTORE_COPY: MutationConfirmCopy = {
  title: "Restaurar sistema?",
  descriptionPrefix: "O sistema ",
  descriptionSuffix: " voltará a aparecer na listagem padrão.",
  confirmLabel: "Restaurar",
  successMessage: "Sistema restaurado.",
  errorCopy: {
    forbiddenTitle: "Falha ao restaurar sistema",
    genericFallback: "Não foi possível restaurar o sistema. Tente novamente.",
    notFoundMessage: "Sistema não encontrado ou já está ativo.",
    conflictMessage: "O sistema já está ativo.",
  },
};

/**
 * Função adapter `(system, client?) => Promise<void>` que delega para
 * `restoreSystem(system.id, undefined, client)`. Espelha o `performDelete`
 * do `DeleteSystemConfirm`. Função fora do componente para preservar
 * referência estável entre renders (o `MutationConfirmModal` consome
 * `mutate` em `useCallback`).
 */
function performRestore(system: SystemDto, client?: ApiClient): Promise<void> {
  return restoreSystem(system.id, undefined, client);
}

interface RestoreSystemConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Sistema soft-deletado selecionado para restauração. Quando `null`,
   * o modal não renderiza — caller controla `open` em conjunto com
   * `system`. Mantemos o objeto completo (não só `id`) para que a copy
   * exiba `name`/`code` sem precisar de re-fetch.
   */
  system: SystemDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após restauração bem-sucedida ou após detecção
   * de 404 (sistema não encontrado ou já ativo) — em ambos casos a UI
   * quer refetch para sincronizar a tabela com o estado real do backend.
   */
  onRestored: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `restoreSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação para restauração de sistema soft-deletado
 * (Issue #61, última sub-issue da EPIC #45 — fecha o CRUD completo).
 *
 * Wrapper fino sobre `MutationConfirmModal` — espelha o
 * `DeleteSystemConfirm` em estrutura, mas injeta:
 *
 * - **Copy** (`RESTORE_COPY`): "Restaurar sistema?" + descrição
 *   contextual; sem aviso de "ativar Mostrar inativos" porque o sistema
 *   volta diretamente para a listagem padrão após o restore.
 * - **Mutate** (`performRestore`): adapta `restoreSystem(id)` para a
 *   assinatura `(system, client?) => Promise<unknown>` esperada pelo
 *   shell.
 * - **Variant** (`primary`): ação positiva (restaura/ativa) — o token
 *   `--clr-lime`/`--clr-forest` do design system reforça o significado
 *   sem hardcode de cor.
 * - **`testIdPrefix`** (`restore-system`): identifica os elementos do
 *   modal nas suítes de teste sem colidir com o delete.
 *
 * O `MutationConfirmModal` cuida de:
 *
 * - **Confirmação obrigatória** (critério de aceite #61, espelhando #60).
 * - **Cancelar/Esc/backdrop** fecham sem persistir (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela flag
 *   interna `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError` em
 *   `systemFormShared.ts`:
 *
 *   - `404` → fecha modal + toast vermelho + refetch (sistema removido
 *     ou já ativo entre abertura e submit). Backend devolve 404 com
 *     mensagem `"Sistema não encontrado ou não está deletado."`; o
 *     frontend exibe a copy traduzida `"Sistema não encontrado ou já
 *     está ativo."`.
 *   - `401`/`403` → toast vermelho com mensagem do backend (UI continua
 *     no estado atual; cliente HTTP cuida do redirect 401).
 *   - `409` → toast vermelho com `RESTORE_COPY.errorCopy.conflictMessage`.
 *     Hoje o backend não devolve esse status, mas o slot fica preparado.
 *   - Network/parse/5xx → toast vermelho genérico com fallback
 *     (`"Não foi possível restaurar o sistema. Tente novamente."`).
 */
export const RestoreSystemConfirm: React.FC<RestoreSystemConfirmProps> = ({
  open,
  system,
  onClose,
  onRestored,
  client,
}) => (
  <MutationConfirmModal<SystemDto>
    open={open}
    target={system}
    onClose={onClose}
    onSuccess={onRestored}
    client={client}
    mutate={performRestore}
    copy={RESTORE_COPY}
    confirmVariant="primary"
    testIdPrefix="restore-system"
  />
);
