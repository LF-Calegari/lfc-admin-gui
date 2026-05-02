import { useCallback } from "react";

import {
  useNameCodeDescriptionForm,
  type UseNameCodeDescriptionFormReturn,
} from "../../shared/forms";

import { type RoleFormState } from "./rolesFormShared";

import type { CreateRolePayload } from "../../shared/api";

/**
 * Hook compartilhado pelo modal de edição (`EditRoleModal` — Issue
 * #68) e pelo futuro modal de criação (`NewRoleModal`) de roles.
 *
 * **Após o PR #68 (lição PR #134/#135 reforçada):** delega para o
 * helper genérico `useNameCodeDescriptionForm` em
 * `src/shared/forms/`, decorando apenas o `prepareSubmit` para
 * injetar o `systemId` no payload (campo exigido pelo backend
 * `lfc-authenticator` após o enriquecimento do contrato em #163/
 * #164). Centralizar evita ~50 linhas de boilerplate idênticas
 * entre `useSystemForm.ts` e `useRoleForm.ts` (interface
 * `Use<Recurso>FormReturn`, `useState`, `prepareSubmit`,
 * `applyBadRequest`).
 *
 * Recebe `systemId` como parâmetro do `prepareSubmit` porque o
 * `:systemId` vive na URL da `RolesPage` (não no form) — o caller
 * passa o valor já validado quando vai construir o
 * `CreateRolePayload`. Espelha o desenho de `useRouteForm` (#63/
 * #64), onde o `systemId` também vem da URL e não é editável pelo
 * usuário (no caso de roles, o backend rejeita até tentativas de
 * mudar com 400 "SystemId é imutável após a criação do role.").
 */

/**
 * Tipo de retorno do hook — espelha o do helper genérico, mas
 * sobrescreve `prepareSubmit` para refletir a assinatura específica
 * de roles (recebe `systemId` e devolve `CreateRolePayload`).
 */
export type UseRoleFormReturn = Omit<
  UseNameCodeDescriptionFormReturn,
  "prepareSubmit"
> & {
  /**
   * Roda a validação client-side e, se passar, prepara o
   * `CreateRolePayload` trimado. `systemId` é injetado pelo caller
   * (vem da URL `/systems/:systemId/roles`) — manter fora do estado
   * do form preserva a separação "form = inputs do usuário" e evita
   * race quando o usuário troca de sistema com o modal aberto.
   */
  prepareSubmit: (systemId: string) => CreateRolePayload | null;
};

export function useRoleForm(initialState: RoleFormState): UseRoleFormReturn {
  const inner = useNameCodeDescriptionForm(initialState);

  const prepareSubmit = useCallback(
    (systemId: string): CreateRolePayload | null => {
      const trimmed = inner.prepareSubmit();
      if (trimmed === null) return null;
      return {
        systemId,
        name: trimmed.name,
        code: trimmed.code,
        description: trimmed.description,
      };
    },
    [inner],
  );

  return {
    ...inner,
    prepareSubmit,
  };
}
