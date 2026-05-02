import { useCallback, useState } from 'react';

import { useFieldChangeHandlers } from '../../shared/forms';

import {
  decideUserBadRequestHandling,
  validateUserForm,
  type UserFieldErrors,
  type UserFormState,
} from './userFormShared';

import type { CreateUserPayload } from '../../shared/api';

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
 * a issue de edição chegar, ela vai herdar todo este boilerplate sem
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
   * Roda a validação client-side e, se passar, prepara o payload
   * trimado + zera erros + marca `isSubmitting`. Devolve o payload
   * pronto para envio quando válido, ou `null` quando não (já tendo
   * populado `fieldErrors`).
   *
   * O parse de `identity` (string -> int) acontece aqui com
   * `Number.parseInt` (radix 10) — `validateUserForm` já garantiu
   * formato `^-?\d+$`, então nunca devolve `NaN`.
   *
   * `clientId` vazio (após trim) é omitido do payload para que o
   * backend acione `LegacyClientFactory` e gere um cliente PF
   * derivado automaticamente (ver `UsersController.cs` linha 250).
   *
   * Centralizar essa rotina elimina ~18 linhas de boilerplate que
   * apareceriam idênticas entre `NewUserModal` e o futuro
   * `EditUserModal` (lição PR #127/#128).
   */
  prepareSubmit: () => CreateUserPayload | null;
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

    // `identity` chega como string `"^-?\d+$"` (validado), parse com
    // radix 10 explícito é defensivo contra ambientes onde o engine
    // tenta detectar octal/hex.
    const identityInt = Number.parseInt(formState.identity.trim(), 10);
    const trimmedClientId = formState.clientId.trim();

    const payload: CreateUserPayload = {
      name: formState.name.trim(),
      email: formState.email.trim(),
      // Password preservada literal — espaços laterais podem ser
      // intencionais para senhas de gerenciador.
      password: formState.password,
      identity: identityInt,
    };

    if (trimmedClientId.length > 0) {
      payload.clientId = trimmedClientId;
    }

    // `active` é sempre incluído — o estado inicial é `true`, então
    // omitir só quando o usuário deliberadamente liga/desliga seria
    // assimetria desnecessária. O backend trata `Active` como bool
    // simples (`= true` quando ausente; aceita explícito).
    payload.active = formState.active;

    return payload;
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
    applyBadRequest,
  };
}
