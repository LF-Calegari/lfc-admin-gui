import { useMemo, type SyntheticEvent } from 'react';

import type {
  NameCodeDescriptionFieldErrors,
  NameCodeDescriptionFormState,
} from './NameCodeDescriptionForm';
import type { UseNameCodeDescriptionFormReturn } from './useNameCodeDescriptionForm';

/**
 * Subset estrutural de `UseNameCodeDescriptionFormReturn` consumido
 * por `useNameCodeDescriptionFormFieldProps`. Inclui apenas os
 * campos/handlers que o hook lê — exclui `prepareSubmit`/
 * `applyBadRequest`/setters que cada wrapper de domínio
 * (`useRoleForm`/`useTokenTypeForm`) pode tipar de forma diferente.
 *
 * Tipar o parâmetro como `Pick<...>` permite que `useRoleForm` (que
 * sobrescreve `prepareSubmit` com assinatura `(systemId: string) =>
 * CreateRolePayload | null`) use o helper sem perder type-safety.
 * Sem isso, o TypeScript reclamaria que o `UseRoleFormReturn` não é
 * assignable a `UseNameCodeDescriptionFormReturn` (assinaturas
 * incompatíveis em `prepareSubmit`).
 */
type NameCodeDescriptionFormFieldsSlice = Pick<
  UseNameCodeDescriptionFormReturn,
  | 'formState'
  | 'fieldErrors'
  | 'submitError'
  | 'isSubmitting'
  | 'handleNameChange'
  | 'handleCodeChange'
  | 'handleDescriptionChange'
>;

/**
 * Props consumidas pelos `<*FormBody>` que envelopam o
 * `NameCodeDescriptionFormBody` para recursos com 3 campos
 * `Name`/`Code`/`Description` (sistemas, roles, tipos de token, e
 * possíveis novos recursos com mesmo shape).
 *
 * **Por que existe (lição PR #134/#135 reforçada):**
 *
 * Antes desta extração, cada `use<Recurso>Form.ts` declarava sua
 * própria `<Recurso>FormFieldProps` interface idêntica em estrutura
 * (10 linhas) — JSCPD/Sonar tokenizam blocos ≥10 linhas como `New
 * Code Duplication` mesmo quando os literais não diferem. Já temos:
 *
 * - `RoleFormFieldProps` (`useRoleForm.ts`)
 * - `TokenTypeFormFieldProps` (`useTokenTypeForm.ts` — Issue #175)
 *
 * Centralizar aqui garante que qualquer recurso futuro (também
 * recursos atuais que adotarem `NameCodeDescriptionFormBody` em
 * refatorações) compartilhem a mesma fonte de verdade. O alias por
 * recurso (`export type RoleFormFieldProps =
 * NameCodeDescriptionFormFieldProps`) preserva a API local sem
 * duplicar a declaração.
 *
 * Sistemas e rotas ainda têm seus próprios módulos de form pré-
 * datando o `NameCodeDescriptionForm` genérico (`SystemFormFields`/
 * `RouteFormFields` declaram tipos próprios em vez de delegar);
 * migrá-los exigiria PR isolado fora do escopo da Issue #175.
 */
export interface NameCodeDescriptionFormFieldProps {
  submitError: string | null;
  values: NameCodeDescriptionFormState;
  errors: NameCodeDescriptionFieldErrors;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

/**
 * Constrói o objeto `NameCodeDescriptionFormFieldProps` a partir de
 * uma instância de `useNameCodeDescriptionForm` (ou wrapper como
 * `useRoleForm`/`useTokenTypeForm`) + os handlers do modal pai
 * (`handleSubmit`/`handleClose`). Memoizado em `useMemo` para
 * preservar identidade entre renders quando nada mudou — útil para
 * spread `{...fieldProps}` sem causar re-render desnecessário no body.
 *
 * **Por que existe (lição PR #134/#135 reforçada):**
 *
 * O `useMemo` retornando `{ submitError, values, errors,
 * onChangeName, onChangeCode, onChangeDescription, onSubmit,
 * onCancel, isSubmitting }` com a mesma deps array aparecia em
 * `useRoleFormFieldProps` (Issue #67) e `useTokenTypeFormFieldProps`
 * (Issue #175) — JSCPD detectou ~27 linhas idênticas. Centralizar
 * aqui colapsa ambos os hooks de recurso para `useMemo` triviais
 * sobre o helper genérico.
 *
 * O caller passa qualquer hook de form com shape
 * `UseNameCodeDescriptionFormReturn` — incluindo wrappers de domínio
 * (`useRoleForm`/`useTokenTypeForm`) que decoram o `prepareSubmit`
 * mas mantêm os mesmos campos/handlers.
 */
export function useNameCodeDescriptionFormFieldProps(
  form: NameCodeDescriptionFormFieldsSlice,
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void,
  onCancel: () => void,
): NameCodeDescriptionFormFieldProps {
  const {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    handleNameChange,
    handleCodeChange,
    handleDescriptionChange,
  } = form;

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
