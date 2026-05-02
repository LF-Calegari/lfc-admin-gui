import React from "react";

import { deleteRoute } from "../../shared/api";
import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from "../systems/MutationConfirmModal";

import type { ApiClient, RouteDto } from "../../shared/api";

/**
 * Copy do diálogo de confirmação para soft-delete de rota (Issue #65,
 * última sub-issue da EPIC #46 — fecha o CRUD completo de rotas).
 *
 * O backend (`RoutesController.DeleteById`) faz **soft-delete**: seta
 * `DeletedAt = UtcNow` e responde `204 No Content`. Por isso a copy usa
 * "desativar" em vez de "excluir" — espelha o vocabulário consagrado em
 * Sistemas (#60). Restaurar é endpoint cooperativo
 * (`POST /systems/routes/{id}/restore`) e fica para uma issue futura
 * que feche a paridade com `RestoreSystemConfirm` (#61).
 *
 * O slot `errorCopy.conflictMessage` está preenchido porque o backend
 * **bloqueia o delete com 409** quando há `Permissions` ativas
 * vinculadas à rota — `RoutesController.DeleteBlockedByPermissionsMessage`
 * é a copy estável devolvida pelo controller. O `classifyMutationError`
 * usa o `error.message` quando presente (mensagem do backend) e cai no
 * `conflictMessage` apenas se o backend não enviar nenhuma — manter o
 * slot tipado garante que o switch encontre um branch `conflict` mesmo
 * sem mensagem do servidor (defensive default).
 */
const DELETE_COPY: MutationConfirmCopy = {
  title: "Desativar rota?",
  descriptionPrefix: "A rota ",
  descriptionSuffix:
    ' será desativada e sumirá da listagem padrão. Você poderá restaurá-la depois ativando "Mostrar inativas".',
  confirmLabel: "Desativar",
  successMessage: "Rota desativada.",
  errorCopy: {
    forbiddenTitle: "Falha ao desativar rota",
    genericFallback: "Não foi possível desativar a rota. Tente novamente.",
    notFoundMessage: "Rota não encontrada ou foi removida. Atualize a lista.",
    conflictMessage:
      "Esta rota está vinculada a permissões ativas. Remova os vínculos antes de desativá-la.",
  },
};

/**
 * Função adapter `(route, client?) => Promise<void>` que delega para
 * `deleteRoute(route.id, undefined, client)`. Mantemos a função fora do
 * componente para não recriá-la a cada render — o `MutationConfirmModal`
 * usa `mutate` em `useCallback`, então uma referência estável evita
 * invalidação desnecessária. Espelha `performDelete` em
 * `DeleteSystemConfirm`.
 */
function performDelete(route: RouteDto, client?: ApiClient): Promise<void> {
  return deleteRoute(route.id, undefined, client);
}

interface DeleteRouteConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Rota selecionada para soft-delete. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `route`.
   * Mantemos o objeto completo (não só `id`) para que a copy exiba
   * `name`/`code` sem precisar de re-fetch.
   */
  route: RouteDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após desativação bem-sucedida ou após detecção
   * de 404 (rota foi removida em paralelo ou nunca existiu) — em ambos
   * casos a UI quer refetch para sincronizar a tabela com o estado real
   * do backend.
   */
  onDeleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `deleteRoute` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação para soft-delete de rota (Issue #65, última
 * sub-issue da EPIC #46).
 *
 * Wrapper fino sobre `MutationConfirmModal` (extraído na #61 e
 * generalizado na #65) — toda a estrutura visual + lógica de submissão/
 * erro vive no shell compartilhado. Aqui só injetamos:
 *
 * - **Copy** (`DELETE_COPY`): título, descrição, label do botão,
 *   mensagens de toast e a copy de 409 (mensagem de bloqueio por
 *   permissões vinculadas vinda do backend).
 * - **Mutate** (`performDelete`): adapta `deleteRoute(id)` para a
 *   assinatura `(route, client?) => Promise<unknown>` esperada pelo shell.
 * - **Variant** (`danger`): destaca o caráter destrutivo. Já existe no
 *   design system local (`Button.tsx`); não precisamos hardcodar cor.
 * - **`testIdPrefix`** (`delete-route`): identifica os elementos do
 *   modal nas suítes de teste sem colidir com `delete-system`.
 *
 * O `MutationConfirmModal` cuida de:
 *
 * - **Confirmação obrigatória** (critério de aceite #65): o botão só
 *   dispara `DELETE` após clique explícito. O foco vai para o botão
 *   Cancelar (ordem do DOM) — Enter acidental fecha sem destruir.
 * - **Cancelar/Esc/backdrop fecham sem persistir** (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela flag
 *   `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError` em
 *   `systemFormShared.ts`:
 *
 *   - `204` → fecha modal + toast verde + refetch.
 *   - `404` → fecha modal + toast vermelho informativo + refetch (rota
 *     removida em paralelo ou nunca existiu).
 *   - `409` → toast vermelho com a **mensagem do backend**
 *     (`DeleteBlockedByPermissionsMessage` — `"Não é possível excluir a
 *     rota: existem permissões ativas vinculadas. Remova as permissões
 *     antes."`); modal permanece aberto para o usuário entender o
 *     bloqueio. Esse caminho é o critério de aceite "tratamento de
 *     erro caso a rota tenha vínculos".
 *   - `401`/`403` → toast vermelho com mensagem do backend.
 *   - Network/parse/5xx → toast vermelho com fallback genérico.
 *
 * Sobre **hard vs soft delete**: o controller faz soft (`DeletedAt =
 * UtcNow`) — o vocabulário "Desativar/Inativa" mantém paridade com
 * Sistemas (#60). O endpoint `POST /systems/routes/{id}/restore` já
 * existe no backend mas a UI de restore é uma issue futura (não está
 * no escopo da #65).
 */
export const DeleteRouteConfirm: React.FC<DeleteRouteConfirmProps> = ({
  open,
  route,
  onClose,
  onDeleted,
  client,
}) => (
  <MutationConfirmModal<RouteDto>
    open={open}
    target={route}
    onClose={onClose}
    onSuccess={onDeleted}
    client={client}
    mutate={performDelete}
    copy={DELETE_COPY}
    confirmVariant="danger"
    testIdPrefix="delete-route"
  />
);
