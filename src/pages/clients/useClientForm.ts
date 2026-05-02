import { useCallback, useMemo, useState, type FormEvent } from 'react';

import { useApplyBadRequest, useFieldChangeHandlers } from '../../shared/forms';

import {
  decideClientBadRequestHandling,
  digitsOnly,
  validateClientForm,
  type ClientFieldErrors,
  type ClientFormState,
} from './clientsFormShared';

import type {
  ClientType,
  CreateClientPayload,
  UpdateClientPayload,
} from '../../shared/api';

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
   * Roda a validação client-side e, se passar, prepara o
   * `UpdateClientPayload` trimado/normalizado para o `PUT /clients/{id}`
   * (Issue #75).
   *
   * Hoje o body de update é idêntico ao do create — o backend
   * reaproveita o `CreateClientRequest` no PUT. Mantemos um método
   * dedicado em vez de reusar `prepareSubmit` para preservar
   * paridade conceitual com `useUserForm` (que tem `prepareSubmit`/
   * `prepareUpdateSubmit` divergentes — o update de user não envia
   * `password`). Se o backend evoluir e a request de update divergir
   * (ex.: nunca enviar `type` porque é imutável), basta ajustar
   * aqui sem tocar no `prepareSubmit` do create.
   */
  prepareUpdateSubmit: () => UpdateClientPayload | null;
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

  /**
   * Build do payload trimado/normalizado a partir do `formState`
   * atual. Compartilhado por `prepareSubmit` (create) e
   * `prepareUpdateSubmit` (update) — o backend reaproveita o
   * `CreateClientRequest` no PUT, então o body é idêntico em ambos
   * os caminhos. Mantemos como helper interno para preservar
   * tipagem estrita do retorno (`CreateClientPayload`) sem repetir
   * o `if (type === 'PF') ... else ...` em duas funções.
   */
  const buildPayloadFromState = useCallback((): CreateClientPayload => {
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

  /**
   * Núcleo compartilhado por `prepareSubmit` e `prepareUpdateSubmit`:
   * roda a validação client-side, distribui erros via `setFieldErrors`/
   * `setSubmitError` no caminho inválido e marca `isSubmitting=true`
   * + devolve o payload trimado no caminho válido.
   *
   * Centralizado para evitar New Code Duplication detectado pelo
   * JSCPD/Sonar — o create e o update tinham 13 linhas idênticas
   * (validar → branch → setState → return), divergindo apenas no
   * tipo de retorno. Manter o helper interno preserva a inferência
   * estrita do tipo de retorno em cada call-site (lição PR #128/
   * #134/#135 — refatorar **antes** do push, não após o BLOCKER).
   */
  const prepareValidatedPayload = useCallback((): CreateClientPayload | null => {
    const clientErrors = validateClientForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    return buildPayloadFromState();
  }, [buildPayloadFromState, formState]);

  const prepareSubmit = useCallback(
    (): CreateClientPayload | null => prepareValidatedPayload(),
    [prepareValidatedPayload],
  );

  const prepareUpdateSubmit = useCallback(
    (): UpdateClientPayload | null => prepareValidatedPayload(),
    [prepareValidatedPayload],
  );

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
    prepareUpdateSubmit,
    applyBadRequest,
  };
}

/**
 * Tipo do conjunto de props consumido por `<ClientFormBody>` —
 * compartilhado entre `NewClientModal` (Issue #74) e `ClientDataTab`
 * (Issue #75). Centralizar o tipo aqui (em vez de inferir inline em
 * cada caller) elimina o bloco de ~12 linhas de
 * `onChangeType/Cpf/FullName/Cnpj/CorporateName` que JSCPD/Sonar
 * tokenizam como `New Code Duplication` (lição PR #134/#135 —
 * call-sites dos helpers também precisam ficar deduplicados).
 *
 * Espelha `UserFormFieldProps` em `useUserForm.ts`.
 */
export interface ClientFormFieldProps {
  submitError: string | null;
  values: ClientFormState;
  errors: ClientFieldErrors;
  onChangeType: (value: ClientType) => void;
  onChangeCpf: (value: string) => void;
  onChangeFullName: (value: string) => void;
  onChangeCnpj: (value: string) => void;
  onChangeCorporateName: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

/**
 * Constrói o objeto de props para `<ClientFormBody>` a partir de
 * uma instância de `useClientForm` + `handleSubmit` + `handleCancel`
 * do caller. Memoizado em `useMemo` para preservar identidade entre
 * renders quando nada mudou — útil pra spread `{...fieldProps}` sem
 * causar re-render desnecessário no body.
 *
 * Espelha `useUserFormFieldProps` em `useUserForm.ts` (lição PR
 * #134/#135 reaplicada antecipadamente — quando o segundo caller
 * aparece, o objeto de props vira candidato a hook próprio para
 * eliminar a duplicação no nível do call-site, não só do helper
 * em si).
 */
export function useClientFormFieldProps(
  clientForm: UseClientFormReturn,
  onSubmit: (event: FormEvent<HTMLFormElement>) => void,
  onCancel: () => void,
): ClientFormFieldProps {
  const {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    handleTypeChange,
    handleCpfChange,
    handleFullNameChange,
    handleCnpjChange,
    handleCorporateNameChange,
  } = clientForm;

  return useMemo(
    () => ({
      submitError,
      values: formState,
      errors: fieldErrors,
      onChangeType: handleTypeChange,
      onChangeCpf: handleCpfChange,
      onChangeFullName: handleFullNameChange,
      onChangeCnpj: handleCnpjChange,
      onChangeCorporateName: handleCorporateNameChange,
      onSubmit,
      onCancel,
      isSubmitting,
    }),
    [
      submitError,
      formState,
      fieldErrors,
      handleTypeChange,
      handleCpfChange,
      handleFullNameChange,
      handleCnpjChange,
      handleCorporateNameChange,
      onSubmit,
      onCancel,
      isSubmitting,
    ],
  );
}
