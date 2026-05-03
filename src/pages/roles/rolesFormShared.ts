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
} from "../../shared/forms";

export {
  NAME_CODE_DESCRIPTION_NAME_MAX as NAME_MAX,
  NAME_CODE_DESCRIPTION_CODE_MAX as CODE_MAX,
  NAME_CODE_DESCRIPTION_DESCRIPTION_MAX as DESCRIPTION_MAX,
} from "../../shared/forms";

/**
 * Helpers compartilhados pelos formulários de criação e edição de
 * roles.
 *
 * O `lfc-authenticator` (`RolesController.cs`) trata
 * `UpdateRoleRequest === CreateRoleRequest` (mesmos campos), seguindo
 * o padrão já adotado em `systems`/`routes`. Por isso centralizamos
 * tipos, validação client-side e parsing de
 * `ValidationProblemDetails` neste módulo desde o **primeiro PR de
 * mutação do recurso** (Issue #68 — editar) — quando a sub-issue de
 * criação chegar, ela herda o boilerplate inteiro sem copiar uma
 * linha sequer (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 *
 * **Após o PR #68 (lição PR #134/#135 reforçada):** este módulo
 * passou a ser uma **camada fina** que delega para
 * `src/shared/forms/NameCodeDescriptionForm.ts` — Sonar tokenizou
 * ~80 linhas idênticas entre `systemFormShared.ts` e
 * `rolesFormShared.ts` (validate/extract/decide). Centralizar no
 * helper genérico evitou a 7ª recorrência de New Code Duplication.
 *
 * Mantemos os exports locais (`RoleFormState`, `RoleFieldErrors`,
 * `validateRoleForm`, etc.) como aliases por **um motivo prático**:
 * o `EditRoleModal` e o futuro `NewRoleModal` importam de
 * `./rolesFormShared` para preservar acoplamento de domínio
 * (mudanças no contrato do backend de roles ficam visíveis aqui;
 * mudanças genéricas ficam em `shared/forms`).
 */

/*
 * `NAME_MAX`/`CODE_MAX`/`DESCRIPTION_MAX` são re-exports de
 * `src/shared/forms` (ver bloco `export { … as … } from …` acima).
 * Espelham `RoleRequestBase.Name`/`.Code`/`.Description` do backend
 * `lfc-authenticator`. Refatoração de `S7763` (Sonar pediu
 * `export…from` em vez de `const = ...`).
 */

/**
 * Estado controlado dos campos do form de role. Alias estrutural de
 * `NameCodeDescriptionFormState` (3 campos compartilhados com
 * sistemas). O `systemId` **não** vive no estado porque é imutável
 * após criação (ver `RolesController.UpdateById`: tentativa de
 * alterar devolve 400 com "SystemId é imutável após a criação do
 * role.") — o caller injeta o valor já validado via
 * `prepareSubmit(systemId)` no momento do envio.
 */
export type RoleFormState = NameCodeDescriptionFormState;

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado).
 * Alias estrutural de `NameCodeDescriptionFieldErrors`.
 */
export type RoleFieldErrors = NameCodeDescriptionFieldErrors;

/** Estado inicial vazio reutilizado pelo futuro modal de criação. */
export const INITIAL_ROLE_FORM_STATE: RoleFormState = {
  name: "",
  code: "",
  description: "",
};

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateRoleRequest`/`UpdateRoleRequest`). Delegação direta para
 * `validateNameCodeDescriptionForm` — todos os limites/mensagens
 * coincidem com sistemas (lição PR #134/#135).
 */
export function validateRoleForm(state: RoleFormState): RoleFieldErrors | null {
  return validateNameCodeDescriptionForm(state);
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET. Delegação direta para
 * `extractNameCodeDescriptionValidationErrors` — o backend de roles
 * envia `Name`/`Code`/`Description` (mesma lista de sistemas);
 * chaves não-mapeáveis (ex.: `SystemId` em "SystemId é imutável...")
 * caem para o caller via `submitError` no Alert do topo, evitando
 * exibir inline um erro que o usuário não controla.
 */
export function extractRoleValidationErrors(
  details: unknown,
): RoleFieldErrors | null {
  return extractNameCodeDescriptionValidationErrors(details);
}

/**
 * Resultado do mapeamento de uma `ApiError` 400 do backend. Alias
 * estrutural de `NameCodeDescriptionSubmitDecision`.
 */
export type RoleSubmitDecision = NameCodeDescriptionSubmitDecision;

/**
 * Decide o tratamento de uma resposta 400 do backend para o form de
 * role. Delegação direta para
 * `decideNameCodeDescriptionBadRequestHandling`.
 */
export function decideRoleBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): RoleSubmitDecision {
  return decideNameCodeDescriptionBadRequestHandling(details, fallbackMessage);
}

/**
 * Copy textual usado por `classifyRoleSubmitError` para diferenciar
 * create de edit sem duplicar a lógica de classificação. Cada modal
 * injeta sua versão (`'uma role'` vs `'outra role'`, `'criar'` vs
 * `'atualizar'`).
 */
export type RoleSubmitErrorCopy = ApiSubmitErrorCopy;

/**
 * Resultado da classificação de um erro lançado por
 * `createRole`/`updateRole`. Discriminada (`kind`) para o caller
 * usar num `switch` curto.
 */
export type RoleSubmitErrorAction = ApiSubmitErrorAction<keyof RoleFieldErrors>;

/**
 * Classifica um erro lançado por `createRole`/`updateRole` em uma
 * `RoleSubmitErrorAction` discriminada. Delegação de uma linha para
 * o helper genérico — preserva a assinatura pública usada pelo
 * modal de role e pelos testes unitários.
 *
 * - `409` → `conflict` no campo `code` com mensagem do backend (ou
 *   `copy.conflictDefault`). Caller exibe inline. O backend devolve
 *   "Já existe outro role com este Code neste sistema." em update;
 *   a unicidade é por (SystemId, Code), não global.
 * - `400` → `bad-request` com `details` cru.
 * - `404` → `not-found` (só relevante no `EditRoleModal` — role
 *   removida concorrentemente entre abertura e submit).
 * - `401`/`403` → `toast` vermelho.
 * - Outros → `unhandled`.
 *
 * O `conflictField` é fixo em `'code'` — campo único de unicidade
 * do contrato `CreateRoleRequest`/`UpdateRoleRequest`.
 */
export function classifyRoleSubmitError(
  error: unknown,
  copy: RoleSubmitErrorCopy,
): RoleSubmitErrorAction {
  return classifyApiSubmitError<keyof RoleFieldErrors>(error, copy, "code");
}
