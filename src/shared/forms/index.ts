/**
 * Barrel do módulo `src/shared/forms/`.
 *
 * Concentra os helpers genéricos de formulário compartilhados pelos
 * recursos do `lfc-admin-gui` (sistemas, rotas, e os futuros roles/
 * users/clients/permissions). Cada `<recurso>FormShared.ts` em
 * `src/pages/<recurso>/` continua exportando os helpers específicos
 * do seu domínio (validação, parsing de `ValidationProblemDetails`,
 * tipos de form), mas delegam para estes utilitários quando a lógica
 * é genérica.
 *
 * Lição PR #134 — Sonar tokenizou ~52 linhas idênticas entre os
 * módulos `*FormShared.ts` (4.7% New Code Duplication). Centralizar
 * aqui evita que cada recurso novo (Issues #66+) refaça o mesmo
 * boilerplate.
 */

export {
  classifyApiSubmitError,
  type ApiSubmitErrorAction,
  type ApiSubmitErrorCopy,
} from "./classifySubmitError";
export {
  computeIdSetDiff,
  idSetDiffHasChanges,
  type IdSetDiff,
} from "./computeIdSetDiff";
export {
  useFieldChangeHandlers,
  type FieldChangeHandlers,
} from "./createFieldChangeHandler";
export {
  applyEditSubmitAction,
  type EditSubmitActionCopy,
  type EditSubmitActionDispatchers,
} from "./applyEditSubmitAction";
export {
  applyCreateSubmitAction,
  type CreateSubmitActionCopy,
  type CreateSubmitActionDispatchers,
} from "./applyCreateSubmitAction";
export {
  useEditEntitySubmit,
  type EditEntitySubmitCallbacks,
  type EditEntitySubmitCopy,
  type EditEntitySubmitDispatchers,
  type UseEditEntitySubmitArgs,
} from "./useEditEntitySubmit";
export {
  useCreateEntitySubmit,
  type CreateEntitySubmitCallbacks,
  type CreateEntitySubmitCopy,
  type CreateEntitySubmitDispatchers,
  type UseCreateEntitySubmitArgs,
} from "./useCreateEntitySubmit";
export {
  NameCodeDescriptionFormBody,
  NAME_CODE_DESCRIPTION_NAME_MAX,
  NAME_CODE_DESCRIPTION_CODE_MAX,
  NAME_CODE_DESCRIPTION_DESCRIPTION_MAX,
  decideNameCodeDescriptionBadRequestHandling,
  extractNameCodeDescriptionValidationErrors,
  validateNameCodeDescriptionForm,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormCopy,
  type NameCodeDescriptionFormState,
  type NameCodeDescriptionSubmitDecision,
} from "./NameCodeDescriptionForm";
export {
  useNameCodeDescriptionForm,
  type UseNameCodeDescriptionFormReturn,
} from "./useNameCodeDescriptionForm";
