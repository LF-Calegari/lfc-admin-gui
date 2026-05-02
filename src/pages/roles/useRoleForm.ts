import { useCallback, useMemo, type FormEvent } from "react";

import {
  useNameCodeDescriptionForm,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormState,
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

/**
 * Tipo do conjunto de props consumido por `<RoleFormBody>` —
 * compartilhado entre `NewRoleModal` (Issue #67) e `EditRoleModal`
 * (Issue #68). Centralizar o tipo aqui (em vez de inferir inline em
 * cada modal) elimina o bloco repetido de ~10 linhas (`onChangeName`/
 * `onChangeCode`/`onChangeDescription` + props comuns) que JSCPD/Sonar
 * tokenizam como `New Code Duplication` (lição PR #134/#135 — call-
 * sites dos helpers também precisam ficar deduplicados, não só os
 * helpers em si).
 *
 * Os tipos `values`/`errors` referenciam diretamente os shapes
 * genéricos `NameCodeDescriptionFormState`/`...FieldErrors` para
 * preservar simetria com o tipo aceito pelo `<RoleFormBody>` (ver
 * `RoleFormFields.tsx`) — `RoleFormState` é alias estrutural, então
 * as duas formas são intercambiáveis no consumo.
 */
export interface RoleFormFieldProps {
  submitError: string | null;
  values: NameCodeDescriptionFormState;
  errors: NameCodeDescriptionFieldErrors;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

/**
 * Constrói o objeto de props para `<RoleFormBody>` a partir de uma
 * instância de `useRoleForm` + `handleSubmit` + `handleClose` do
 * modal. Memoizado em `useMemo` para preservar identidade entre
 * renders quando nada mudou — útil pra spread `{...fieldProps}` sem
 * causar re-render desnecessário no body.
 *
 * Esse helper transforma o "objeto duplicado de 10+ linhas" em uma
 * única chamada `useRoleFormFieldProps(roleForm, handleSubmit,
 * handleClose)` em cada modal — espelha o desenho de
 * `useUserFormFieldProps` (lição PR #134/#135 reforçada). Pré-
 * fabricado para evitar a 7ª recorrência de `New Code Duplication` no
 * Sonar quando o `NewRoleModal` (Issue #67) e o `EditRoleModal` (Issue
 * #68) compartilharem o mesmo bloco de props sequenciais.
 */
export function useRoleFormFieldProps(
  roleForm: UseRoleFormReturn,
  onSubmit: (event: FormEvent<HTMLFormElement>) => void,
  onCancel: () => void,
): RoleFormFieldProps {
  const {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    handleNameChange,
    handleCodeChange,
    handleDescriptionChange,
  } = roleForm;

  return useMemo(
    () => ({
      submitError,
      values: formState,
      errors: fieldErrors,
      onChangeName: handleNameChange,
      onChangeCode: handleCodeChange,
      onChangeDescription: handleDescriptionChange,
      onSubmit,
      onCancel,
      isSubmitting,
    }),
    [
      submitError,
      formState,
      fieldErrors,
      handleNameChange,
      handleCodeChange,
      handleDescriptionChange,
      onSubmit,
      onCancel,
      isSubmitting,
    ],
  );
}
