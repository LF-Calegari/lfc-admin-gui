import { useCallback, useState } from 'react';

import { useFieldChangeHandlers } from '../../shared/forms';

import {
  decideBadRequestHandling,
  validateSystemForm,
  type SystemFieldErrors,
  type SystemFormState,
} from './systemFormShared';

import type { CreateSystemPayload } from '../../shared/api';

/**
 * Lista fixa dos campos do form de sistema, usada por
 * `useFieldChangeHandlers` para gerar os handlers `name`/`code`/
 * `description` em uma única linha. `as const` preserva os literais
 * para o helper genérico inferir as chaves do `SystemFormState`.
 */
const SYSTEM_FORM_FIELDS = ['name', 'code', 'description'] as const;

/**
 * Hook compartilhado pelos formulários de criação (`NewSystemModal`) e
 * edição (`EditSystemModal`) de sistemas.
 *
 * Encapsula:
 *
 * - O estado do form (`SystemFormState`) e dos erros inline por campo.
 * - O estado do `Alert` no topo (erro genérico de submissão).
 * - A flag `isSubmitting`.
 * - Os handlers `onChangeName`/`onChangeCode`/`onChangeDescription` que
 *   atualizam o campo correspondente e limpam o erro inline associado.
 *
 * Os handlers eram literalmente idênticos entre os dois modals (~14
 * linhas cada bloco × 2 arquivos = 28 linhas duplicadas) — cenário
 * clássico de BLOCKER de duplicação Sonar (lição PR #123/#127 — Sonar
 * conta blocos de 10+ linhas como `New Code Duplication` independente
 * da intenção). Centralizamos aqui para que o BLOCKER nunca volte.
 *
 * O caller é dono da lógica de submit (que precisa do contexto de
 * `createSystem` vs `updateSystem`), do reset entre aberturas e do
 * mapping de erros — o hook só cuida do que é genuinamente compartilhado.
 */

interface UseSystemFormReturn {
  formState: SystemFormState;
  fieldErrors: SystemFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<React.SetStateAction<SystemFormState>>;
  setFieldErrors: React.Dispatch<React.SetStateAction<SystemFieldErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleNameChange: (value: string) => void;
  handleCodeChange: (value: string) => void;
  handleDescriptionChange: (value: string) => void;
  /**
   * Roda a validação client-side e, se passar, prepara o payload trimado
   * + zera erros + marca `isSubmitting`. Devolve o payload pronto para
   * envio quando válido, ou `null` quando não (já tendo populado
   * `fieldErrors`). Centralizar essa rotina elimina ~14 linhas de
   * boilerplate idênticas entre `NewSystemModal` e `EditSystemModal`
   * (lição PR #127 — Sonar conta 10+ linhas em 2+ arquivos como
   * duplicação independente da intenção).
   */
  prepareSubmit: () => CreateSystemPayload | null;
  /**
   * Aplica o tratamento de uma resposta 400 do backend: distribui erros
   * por campo quando `ValidationProblemDetails` é mapeável, ou popula
   * `submitError` com a mensagem do backend quando não. Centraliza ~10
   * linhas de side-effect idênticas que apareciam nos dois modals
   * (lição PR #127).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

export function useSystemForm(initialState: SystemFormState): UseSystemFormReturn {
  const [formState, setFormState] = useState<SystemFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<SystemFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Handlers `name`/`code`/`description` gerados pelo helper genérico
  // (lição PR #134 — Sonar tokenizou ~19 linhas idênticas entre
  // `useSystemForm` e `useRouteForm`). Cada handler atualiza o campo
  // correspondente e limpa o erro inline associado.
  const {
    name: handleNameChange,
    code: handleCodeChange,
    description: handleDescriptionChange,
  } = useFieldChangeHandlers<SystemFormState, SystemFieldErrors>(
    SYSTEM_FORM_FIELDS,
    setFormState,
    setFieldErrors,
  );

  const prepareSubmit = useCallback((): CreateSystemPayload | null => {
    const clientErrors = validateSystemForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    // `description: ''` é trimado para `''` aqui; a camada HTTP
    // (`buildSystemMutationBody`) omite o campo quando vazio para que o
    // backend grave `null`. Trim duplicado é defensivo — preserva o
    // contrato mesmo se um caller futuro pular a camada HTTP.
    return {
      name: formState.name.trim(),
      code: formState.code.trim(),
      description: formState.description.trim(),
    };
  }, [formState]);

  const applyBadRequest = useCallback((details: unknown, fallbackMessage: string): void => {
    const decision = decideBadRequestHandling(details, fallbackMessage);
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
    handleCodeChange,
    handleDescriptionChange,
    prepareSubmit,
    applyBadRequest,
  };
}
