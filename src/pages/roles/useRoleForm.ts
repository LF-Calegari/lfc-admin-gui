import { useCallback } from "react";

import {
  useNameCodeDescriptionForm,
  type NameCodeDescriptionFormFieldProps,
  type UseNameCodeDescriptionFormReturn,
} from "../../shared/forms";

import { type RoleFormState } from "./rolesFormShared";

import type { CreateRolePayload } from "../../shared/api";

export { useNameCodeDescriptionFormFieldProps as useRoleFormFieldProps } from "../../shared/forms";

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

/**
 * Tipo do conjunto de props consumido por `<RoleFormBody>` — alias
 * estrutural de `NameCodeDescriptionFormFieldProps` (helper genérico
 * em `src/shared/forms/`).
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** antes deste alias,
 * cada `use<Recurso>Form.ts` declarava sua própria interface idêntica
 * em estrutura (~10 linhas). JSCPD detectou a duplicação entre
 * `useRoleForm.ts` e `useTokenTypeForm.ts`. Centralizar a declaração
 * em `src/shared/forms/useNameCodeDescriptionFormFieldProps.ts`
 * eliminou a duplicação na raiz; o alias aqui preserva a API local
 * (`RoleFormFieldProps`) sem duplicar implementação.
 */
export type RoleFormFieldProps = NameCodeDescriptionFormFieldProps;

