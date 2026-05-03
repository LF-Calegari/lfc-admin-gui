import {
  classifyApiSubmitError,
  decideNameCodeDescriptionBadRequestHandling,
  extractNameCodeDescriptionValidationErrors,
  validateNameCodeDescriptionForm,
  type ApiSubmitErrorAction,
  type ApiSubmitErrorCopy,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormState,
  type NameCodeDescriptionSubmitDecision,
} from '../../shared/forms';

export {
  NAME_CODE_DESCRIPTION_NAME_MAX as NAME_MAX,
  NAME_CODE_DESCRIPTION_CODE_MAX as CODE_MAX,
  NAME_CODE_DESCRIPTION_DESCRIPTION_MAX as DESCRIPTION_MAX,
} from '../../shared/forms';

/**
 * Helpers compartilhados pelos formulários de criação e edição de
 * tipos de token (Issue #175).
 *
 * O `lfc-authenticator`
 * (`AuthService.Controllers.TokenTypes.TokenTypesController`) trata
 * `UpdateTokenTypeRequest === CreateTokenTypeRequest` (mesmos campos
 * `Name`/`Code`/`Description`), seguindo o padrão já adotado em
 * `systems`/`routes`/`roles`. Centralizamos tipos, validação client-side
 * e parsing de `ValidationProblemDetails` neste módulo desde o
 * **primeiro PR de mutação do recurso** — quando alguma sub-issue
 * extra chegar, ela herda o boilerplate inteiro sem copiar uma linha
 * sequer (lição PR #128 — projetar shared helpers desde o primeiro PR
 * do recurso).
 *
 * **Camada fina sobre `src/shared/forms/NameCodeDescriptionForm.ts`**
 * (lição PR #134/#135 reforçada): Sonar tokenizou ~80 linhas idênticas
 * entre `systemFormShared.ts` e `rolesFormShared.ts` quando estes
 * existiam paralelos. Centralizar no helper genérico evitou recorrência
 * de New Code Duplication. Mantemos os exports locais como aliases
 * porque o `EditTokenTypeModal` e o `NewTokenTypeModal` importam de
 * `./tokenTypesFormShared` para preservar acoplamento de domínio
 * (mudanças no contrato do backend de token types ficam visíveis aqui;
 * mudanças genéricas ficam em `shared/forms`).
 */

/*
 * `NAME_MAX`/`CODE_MAX`/`DESCRIPTION_MAX` são re-exports de
 * `src/shared/forms` (ver bloco `export { … as … } from …` acima).
 * Espelham `CreateTokenTypeRequest.Name`/`.Code`/`.Description` do
 * backend `lfc-authenticator`. Refatoração de `S7763` (Sonar pediu
 * `export…from` em vez de `const = ...`).
 */

/**
 * Estado controlado dos campos do form de tipo de token. Alias
 * estrutural de `NameCodeDescriptionFormState` (3 campos compartilhados
 * com sistemas/roles).
 */
export type TokenTypeFormState = NameCodeDescriptionFormState;

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado). Alias
 * estrutural de `NameCodeDescriptionFieldErrors`.
 */
export type TokenTypeFieldErrors = NameCodeDescriptionFieldErrors;

/** Estado inicial vazio reutilizado pelo modal de criação. */
export const INITIAL_TOKEN_TYPE_FORM_STATE: TokenTypeFormState = {
  name: '',
  code: '',
  description: '',
};

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateTokenTypeRequest`/`UpdateTokenTypeRequest`). Delegação direta
 * para `validateNameCodeDescriptionForm` — todos os limites/mensagens
 * coincidem com sistemas/roles (lição PR #134/#135).
 */
export function validateTokenTypeForm(
  state: TokenTypeFormState,
): TokenTypeFieldErrors | null {
  return validateNameCodeDescriptionForm(state);
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET. Delegação direta para
 * `extractNameCodeDescriptionValidationErrors` — o backend de token
 * types envia `Name`/`Code`/`Description` (mesma lista de
 * sistemas/roles).
 */
export function extractTokenTypeValidationErrors(
  details: unknown,
): TokenTypeFieldErrors | null {
  return extractNameCodeDescriptionValidationErrors(details);
}

/**
 * Resultado do mapeamento de uma `ApiError` 400 do backend. Alias
 * estrutural de `NameCodeDescriptionSubmitDecision`.
 */
export type TokenTypeSubmitDecision = NameCodeDescriptionSubmitDecision;

/**
 * Decide o tratamento de uma resposta 400 do backend para o form de
 * token type. Delegação direta para
 * `decideNameCodeDescriptionBadRequestHandling`.
 */
export function decideTokenTypeBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): TokenTypeSubmitDecision {
  return decideNameCodeDescriptionBadRequestHandling(details, fallbackMessage);
}

/**
 * Copy textual usado por `classifyTokenTypeSubmitError` para diferenciar
 * create de edit sem duplicar a lógica de classificação. Cada modal
 * injeta sua versão (`'um token type'` vs `'outro token type'`,
 * `'criar'` vs `'atualizar'`).
 */
export type TokenTypeSubmitErrorCopy = ApiSubmitErrorCopy;

/**
 * Resultado da classificação de um erro lançado por
 * `createTokenType`/`updateTokenType`. Discriminada (`kind`) para o
 * caller usar num `switch` curto.
 */
export type TokenTypeSubmitErrorAction = ApiSubmitErrorAction<
  keyof TokenTypeFieldErrors
>;

/**
 * Classifica um erro lançado por `createTokenType`/`updateTokenType`
 * em uma `TokenTypeSubmitErrorAction` discriminada. Delegação de uma
 * linha para o helper genérico — preserva a assinatura pública usada
 * pelos modais e pelos testes unitários.
 *
 * - `409` → `conflict` no campo `code` com mensagem do backend (ou
 *   `copy.conflictDefault`). Caller exibe inline. O backend devolve
 *   "Já existe um token type com este Code." em create e "Já existe
 *   outro token type com este Code." em update.
 * - `400` → `bad-request` com `details` cru.
 * - `404` → `not-found` (só relevante no `EditTokenTypeModal`).
 * - `401`/`403` → `toast` vermelho.
 * - Outros → `unhandled`.
 *
 * O `conflictField` é fixo em `'code'` — campo único de unicidade do
 * contrato `CreateTokenTypeRequest`/`UpdateTokenTypeRequest`.
 */
export function classifyTokenTypeSubmitError(
  error: unknown,
  copy: TokenTypeSubmitErrorCopy,
): TokenTypeSubmitErrorAction {
  return classifyApiSubmitError<keyof TokenTypeFieldErrors>(error, copy, 'code');
}
