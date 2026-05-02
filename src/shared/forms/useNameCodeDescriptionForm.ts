import { useCallback, useState } from "react";

import { useFieldChangeHandlers } from "./createFieldChangeHandler";
import {
  decideNameCodeDescriptionBadRequestHandling,
  validateNameCodeDescriptionForm,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormState,
} from "./NameCodeDescriptionForm";

/**
 * Hook genérico que encapsula o ciclo completo de form para
 * recursos com shape `Name`/`Code`/`Description` (sistemas hoje;
 * roles a partir do PR #68; potencialmente outros recursos
 * futuros).
 *
 * **Por que existe (lição PR #134/#135 reforçada):**
 *
 * Sonar tokenizou ~50 linhas idênticas entre `useSystemForm`,
 * `useRouteForm` e `useRoleForm` (interface
 * `Use<Recurso>FormReturn`, declaração de `useState`, handlers
 * `prepareSubmit`/`applyBadRequest`). Centralizando aqui:
 *
 * - Cada `use<Recurso>Form` consome este hook e devolve o resultado
 *   praticamente as-is (apenas decora o `prepareSubmit` quando
 *   precisa do `systemId`).
 * - Os tipos de retorno passam a ser alias estruturais (em vez de
 *   interfaces declaradas independentemente).
 * - Adicionar um recurso futuro com mesmo shape só exige um wrapper
 *   de 5–10 linhas no domínio do recurso.
 *
 * **Não cobre rotas porque** `useRouteForm` tem 4 campos (extra
 * `systemTokenTypeId`) — manter o hook genérico no shape de 3
 * campos preserva o tipo estreito; o caller de rotas continua com
 * sua versão adaptada (a duplicação remanescente entre
 * `useRouteForm` e `useSystemForm` sobre os 3 campos em comum é
 * pré-existente ao PR #68 e fica para uma refatoração isolada).
 */

export interface UseNameCodeDescriptionFormReturn {
  formState: NameCodeDescriptionFormState;
  fieldErrors: NameCodeDescriptionFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<
    React.SetStateAction<NameCodeDescriptionFormState>
  >;
  setFieldErrors: React.Dispatch<
    React.SetStateAction<NameCodeDescriptionFieldErrors>
  >;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleNameChange: (value: string) => void;
  handleCodeChange: (value: string) => void;
  handleDescriptionChange: (value: string) => void;
  /**
   * Roda a validação client-side e, se passar, prepara o payload
   * trimado + zera erros + marca `isSubmitting`. Devolve o objeto
   * `{ name, code, description }` com trim aplicado e `description`
   * podendo ser string vazia (caller decide como tratar — sistemas
   * envia inline; roles trima e omite quando vazio na camada HTTP).
   *
   * Devolve `null` quando há erros client-side (que já foram
   * propagados via `setFieldErrors`).
   *
   * O caller compõe o payload final adicionando outros campos
   * (`systemId` para roles/rotas) por cima do retorno.
   */
  prepareSubmit: () => NameCodeDescriptionFormState | null;
  /**
   * Aplica o tratamento de uma resposta 400 do backend: distribui
   * erros por campo quando `ValidationProblemDetails` é mapeável,
   * ou popula `submitError` com a mensagem do backend quando não.
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

/**
 * Lista fixa dos campos do form genérico. `as const` preserva os
 * literais para o helper `useFieldChangeHandlers` inferir as chaves
 * do `NameCodeDescriptionFormState`.
 */
const NAME_CODE_DESCRIPTION_FIELDS = ["name", "code", "description"] as const;

export function useNameCodeDescriptionForm(
  initialState: NameCodeDescriptionFormState,
): UseNameCodeDescriptionFormReturn {
  const [formState, setFormState] =
    useState<NameCodeDescriptionFormState>(initialState);
  const [fieldErrors, setFieldErrors] =
    useState<NameCodeDescriptionFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const {
    name: handleNameChange,
    code: handleCodeChange,
    description: handleDescriptionChange,
  } = useFieldChangeHandlers<
    NameCodeDescriptionFormState,
    NameCodeDescriptionFieldErrors
  >(NAME_CODE_DESCRIPTION_FIELDS, setFormState, setFieldErrors);

  const prepareSubmit = useCallback((): NameCodeDescriptionFormState | null => {
    const clientErrors = validateNameCodeDescriptionForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    return {
      name: formState.name.trim(),
      code: formState.code.trim(),
      description: formState.description.trim(),
    };
  }, [formState]);

  const applyBadRequest = useCallback(
    (details: unknown, fallbackMessage: string): void => {
      const decision = decideNameCodeDescriptionBadRequestHandling(
        details,
        fallbackMessage,
      );
      if (decision.kind === "field-errors") {
        setFieldErrors(decision.errors);
        setSubmitError(null);
      } else {
        setSubmitError(decision.message);
      }
    },
    [],
  );

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
