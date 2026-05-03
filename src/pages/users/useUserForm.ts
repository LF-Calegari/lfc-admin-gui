import { useCallback, useMemo, useState, type SyntheticEvent } from 'react';

import { useFieldChangeHandlers } from '../../shared/forms';

import {
  buildCreateUserPayload,
  buildUpdateUserPayload,
  decideUserBadRequestHandling,
  validateUserForm,
  validateUserUpdateForm,
  type UserFieldErrors,
  type UserFormState,
} from './userFormShared';

import type { CreateUserPayload, UpdateUserPayload } from '../../shared/api';

/**
 * Lista fixa dos campos textuais do form de user, usada por
 * `useFieldChangeHandlers` para gerar os handlers em uma única linha.
 * `as const` preserva os literais para o helper genérico inferir as
 * chaves do `UserFormState`.
 *
 * `active` fica fora porque é boolean (toggle) e não usa o mesmo
 * handler de mudança de string — o caller injeta um handler dedicado
 * `handleActiveChange` que aceita `boolean`.
 */
const USER_FORM_TEXT_FIELDS = [
  'name',
  'email',
  'password',
  'identity',
  'clientId',
] as const;

/**
 * Hook compartilhado pelos formulários de criação (`NewUserModal` —
 * Issue #78) e edição (`EditUserModal` — sub-issue futura) de
 * usuários.
 *
 * Encapsula:
 *
 * - O estado do form (`UserFormState`) e dos erros inline por campo.
 * - O estado do `Alert` no topo (erro genérico de submissão).
 * - A flag `isSubmitting`.
 * - Os handlers de mudança de cada campo textual + o toggle `active`.
 *
 * Centralizamos aqui desde o **primeiro PR do recurso** (#78) para
 * evitar a 6ª recorrência de duplicação Sonar (lição PR #128 — quando
 * a issue de edição chegar, ela vai herdar o boilerplate inteiro sem
 * copiar uma linha sequer). Os handlers seriam idênticos entre os
 * dois modals (~24 linhas × 2 arquivos = 48 linhas duplicadas).
 *
 * O caller é dono da lógica de submit (que precisa do contexto de
 * `createUser` vs `updateUser`), do reset entre aberturas e do
 * mapping de erros — o hook só cuida do que é genuinamente
 * compartilhado.
 */

interface UseUserFormReturn {
  formState: UserFormState;
  fieldErrors: UserFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<React.SetStateAction<UserFormState>>;
  setFieldErrors: React.Dispatch<React.SetStateAction<UserFieldErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleNameChange: (value: string) => void;
  handleEmailChange: (value: string) => void;
  handlePasswordChange: (value: string) => void;
  handleIdentityChange: (value: string) => void;
  handleClientIdChange: (value: string) => void;
  handleActiveChange: (value: boolean) => void;
  /**
   * Roda a validação client-side de criação (com senha) e, se passar,
   * prepara o `CreateUserPayload` trimado + zera erros + marca
   * `isSubmitting`. Devolve o payload pronto para envio quando válido,
   * ou `null` quando não (já tendo populado `fieldErrors`).
   *
   * O parse de `identity` (string -> int) acontece aqui com
   * `Number.parseInt` (radix 10) — `validateUserForm` já garantiu
   * formato `^-?\d+$`, então nunca devolve `NaN`.
   *
   * `clientId` vazio (após trim) é omitido do payload para que o
   * backend acione `LegacyClientFactory` e gere um cliente PF
   * derivado automaticamente (ver `UsersController.cs` linha 250).
   */
  prepareSubmit: () => CreateUserPayload | null;
  /**
   * Roda a validação client-side de edição (**sem senha**) e, se
   * passar, prepara o `UpdateUserPayload` trimado + zera erros + marca
   * `isSubmitting`. Devolve o payload pronto para envio quando válido,
   * ou `null` quando não.
   *
   * Diferença essencial vs `prepareSubmit`:
   * - Não exige `password` (campo é ignorado no estado e omitido do
   *   payload) — reset de senha é endpoint separado.
   * - `active` é sempre incluído (backend exige `[Required]` no PUT).
   *
   * Centralizar a versão de update no mesmo hook (em vez de duplicar
   * `useUserUpdateForm`) preserva a lição PR #128 — o `EditUserModal`
   * herda 100% do estado/handlers/parsing de `useUserForm` sem copiar
   * uma linha sequer.
   */
  prepareUpdateSubmit: () => UpdateUserPayload | null;
  /**
   * Aplica o tratamento de uma resposta 400 do backend: distribui
   * erros por campo quando `ValidationProblemDetails` é mapeável, ou
   * popula `submitError` com a mensagem do backend quando não.
   * Centraliza ~10 linhas de side-effect idênticas que apareceriam
   * nos dois modals (lição PR #127).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

export function useUserForm(initialState: UserFormState): UseUserFormReturn {
  const [formState, setFormState] = useState<UserFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Handlers `name`/`email`/`password`/`identity`/`clientId` gerados
  // pelo helper genérico (lição PR #134 — bloco de 24 linhas
  // duplicado com `useSystemForm`/`useRouteForm` foi um dos motivos do
  // SonarCloud Quality Gate FAILED). Cada handler atualiza o campo
  // correspondente e limpa o erro inline associado.
  const {
    name: handleNameChange,
    email: handleEmailChange,
    password: handlePasswordChange,
    identity: handleIdentityChange,
    clientId: handleClientIdChange,
  } = useFieldChangeHandlers<UserFormState, UserFieldErrors>(
    USER_FORM_TEXT_FIELDS,
    setFormState,
    setFieldErrors,
  );

  /**
   * Toggle `active` é dedicado porque o tipo do valor é `boolean` (não
   * `string`). Não tem erro inline associado (o toggle nunca falha
   * client-side), então não precisa limpar `fieldErrors.active` —
   * `UserFieldErrors` nem declara o slot.
   */
  const handleActiveChange = useCallback((value: boolean) => {
    setFormState((prev) => ({ ...prev, active: value }));
  }, []);

  const prepareSubmit = useCallback((): CreateUserPayload | null => {
    const clientErrors = validateUserForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    return buildCreateUserPayload(formState);
  }, [formState]);

  const prepareUpdateSubmit = useCallback((): UpdateUserPayload | null => {
    const clientErrors = validateUserUpdateForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    return buildUpdateUserPayload(formState);
  }, [formState]);

  const applyBadRequest = useCallback((details: unknown, fallbackMessage: string): void => {
    const decision = decideUserBadRequestHandling(details, fallbackMessage);
    if (decision.kind === 'field-errors') {
      setFieldErrors(decision.errors);
      setSubmitError(null);
    } else {
      setSubmitError(decision.message);
    }
  }, []);

  return {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    handleNameChange,
    handleEmailChange,
    handlePasswordChange,
    handleIdentityChange,
    handleClientIdChange,
    handleActiveChange,
    prepareSubmit,
    prepareUpdateSubmit,
    applyBadRequest,
  };
}

/**
 * Tipo do conjunto de props consumido por `<UserFormBody>` —
 * compartilhado entre `NewUserModal` e `EditUserModal`. Centralizar
 * o tipo aqui (em vez de inferir inline em cada modal) elimina o
 * bloco repetido de 13 linhas (`onChangeName/Email/Password/...`)
 * que JSCPD/Sonar tokenizavam como `New Code Duplication` (lição
 * PR #134/#135 — call-sites dos helpers também precisam ficar
 * deduplicados, não só os helpers em si).
 */
export interface UserFormFieldProps {
  submitError: string | null;
  values: UserFormState;
  errors: UserFieldErrors;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeIdentity: (value: string) => void;
  onChangeClientId: (value: string) => void;
  onChangeActive: (value: boolean) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

/**
 * Constrói o objeto de props para `<UserFormBody>` a partir de uma
 * instância de `useUserForm` + `handleSubmit` + `handleClose` do
 * modal. Memoizado em `useMemo` para preservar identidade entre
 * renders quando nada mudou — útil pra spread `{...fieldProps}` sem
 * causar re-render desnecessário no body.
 *
 * Esse helper transforma o "objeto duplicado de 13 linhas" em uma
 * única chamada `useUserFormFieldProps(userForm, handleSubmit,
 * handleClose)` em cada modal — eliminando o BLOCKER de duplicação
 * Sonar entre `NewUserModal` e `EditUserModal` na fonte.
 */
export function useUserFormFieldProps(
  userForm: UseUserFormReturn,
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void,
  onCancel: () => void,
): UserFormFieldProps {
  const {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    handleNameChange,
    handleEmailChange,
    handlePasswordChange,
    handleIdentityChange,
    handleClientIdChange,
    handleActiveChange,
  } = userForm;

  return useMemo(
    () => ({
      submitError,
      values: formState,
      errors: fieldErrors,
      onChangeName: handleNameChange,
      onChangeEmail: handleEmailChange,
      onChangePassword: handlePasswordChange,
      onChangeIdentity: handleIdentityChange,
      onChangeClientId: handleClientIdChange,
      onChangeActive: handleActiveChange,
      onSubmit,
      onCancel,
      isSubmitting,
    }),
    [
      submitError,
      formState,
      fieldErrors,
      handleNameChange,
      handleEmailChange,
      handlePasswordChange,
      handleIdentityChange,
      handleClientIdChange,
      handleActiveChange,
      onSubmit,
      onCancel,
      isSubmitting,
    ],
  );
}
