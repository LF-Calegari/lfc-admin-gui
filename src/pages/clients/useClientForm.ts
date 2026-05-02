import { useCallback, useState } from 'react';

import { useApplyBadRequest, useFieldChangeHandlers } from '../../shared/forms';

import {
  decideClientBadRequestHandling,
  digitsOnly,
  validateClientForm,
  type ClientFieldErrors,
  type ClientFormState,
} from './clientsFormShared';

import type { ClientType, CreateClientPayload } from '../../shared/api';

/**
 * Hook compartilhado pelo modal de criação (`NewClientModal` —
 * Issue #74) e, futuramente, edição (`EditClientModal` — Issue
 * #75) de clientes.
 *
 * **Por que existe (lição PR #128/#134/#135):** projetar o hook
 * desde o primeiro PR do recurso evita refatoração destrutiva
 * quando o segundo modal aparecer. O design espelha
 * `useSystemForm`/`useRouteForm`/`useRoleForm`, mas não delega
 * ao `useNameCodeDescriptionForm` porque o shape do form de
 * cliente diverge (sem `name`/`code`/`description`; com `type`/
 * `cpf`/`fullName`/`cnpj`/`corporateName`).
 *
 * **Comportamento da troca de tipo:** o handler `handleTypeChange`
 * limpa apenas os erros do campo `type` (não os erros dos demais
 * campos PF/PJ). A intenção é não jogar fora o que o usuário
 * digitou — se ele alternar PF→PJ→PF acidentalmente, os dados PF
 * persistem. O submit envia apenas o subset correspondente
 * (`buildClientMutationBody` em `clients.ts`), então não há risco
 * de o backend receber campos do tipo oposto.
 */

export interface UseClientFormReturn {
  formState: ClientFormState;
  fieldErrors: ClientFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<React.SetStateAction<ClientFormState>>;
  setFieldErrors: React.Dispatch<React.SetStateAction<ClientFieldErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleTypeChange: (value: ClientType) => void;
  handleCpfChange: (value: string) => void;
  handleFullNameChange: (value: string) => void;
  handleCnpjChange: (value: string) => void;
  handleCorporateNameChange: (value: string) => void;
  /**
   * Roda a validação client-side e, se passar, prepara o
   * `CreateClientPayload` trimado/normalizado (CPF/CNPJ em apenas
   * dígitos, espelhando `NormalizeDigits` do backend). Devolve
   * `null` quando há erros client-side (que já foram propagados
   * via `setFieldErrors`).
   *
   * O caller não precisa se preocupar com filtrar campos PF/PJ
   * — `buildClientMutationBody` (em `clients.ts`) faz o filtro
   * antes do submit. Aqui devolvemos o payload completo (com
   * apenas os campos do tipo selecionado preenchidos).
   */
  prepareSubmit: () => CreateClientPayload | null;
  /**
   * Aplica o tratamento de uma resposta 400 do backend: distribui
   * erros por campo quando `ValidationProblemDetails` é mapeável,
   * ou popula `submitError` com a mensagem do backend quando não.
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

/**
 * Lista fixa dos campos do form que recebem o handler genérico de
 * change. `type` fica de fora porque a UI usa um `<Select>` que
 * emite valores tipados (`ClientType`), e o handler genérico do
 * `useFieldChangeHandlers` espera `string` — manter `type` com
 * handler dedicado preserva o tipo estreito no call-site.
 */
const CLIENT_TEXT_FIELDS = ['cpf', 'fullName', 'cnpj', 'corporateName'] as const;

export function useClientForm(initialState: ClientFormState): UseClientFormReturn {
  const [formState, setFormState] = useState<ClientFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<ClientFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const {
    cpf: handleCpfChange,
    fullName: handleFullNameChange,
    cnpj: handleCnpjChange,
    corporateName: handleCorporateNameChange,
  } = useFieldChangeHandlers<ClientFormState, ClientFieldErrors>(
    CLIENT_TEXT_FIELDS,
    setFormState,
    setFieldErrors,
  );

  /**
   * Handler dedicado do `type` — atualiza o discriminador e limpa
   * o erro inline associado. Não toca nos campos PF/PJ para
   * preservar o que o usuário digitou ao alternar (UX comum em
   * forms condicionais — usuário pode trocar acidentalmente e
   * voltar).
   */
  const handleTypeChange = useCallback((value: ClientType) => {
    setFormState((prev) => ({ ...prev, type: value }));
    setFieldErrors((prev) => (prev.type === undefined ? prev : { ...prev, type: undefined }));
  }, []);

  const prepareSubmit = useCallback((): CreateClientPayload | null => {
    const clientErrors = validateClientForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    if (formState.type === 'PF') {
      return {
        type: 'PF',
        cpf: digitsOnly(formState.cpf),
        fullName: formState.fullName.trim(),
      };
    }
    return {
      type: 'PJ',
      cnpj: digitsOnly(formState.cnpj),
      corporateName: formState.corporateName.trim(),
    };
  }, [formState]);

  // Helper compartilhado em `src/shared/forms/createApplyBadRequest.ts`
  // — encapsula o `if (decision.kind === 'field-errors') {...} else
  // {...}` que se repetia em cada hook de form (lição PR #134/#135).
  const applyBadRequest = useApplyBadRequest<ClientFieldErrors>(decideClientBadRequestHandling, {
    setFieldErrors,
    setSubmitError,
  });

  return {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    handleTypeChange,
    handleCpfChange,
    handleFullNameChange,
    handleCnpjChange,
    handleCorporateNameChange,
    prepareSubmit,
    applyBadRequest,
  };
}
