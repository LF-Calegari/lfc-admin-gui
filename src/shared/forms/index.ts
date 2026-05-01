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
} from './classifySubmitError';
export { useFieldChangeHandlers, type FieldChangeHandlers } from './createFieldChangeHandler';
export {
  applyEditSubmitAction,
  type EditSubmitActionCopy,
  type EditSubmitActionDispatchers,
} from './applyEditSubmitAction';
