import { isApiError } from "../../shared/api";
import {
  classifyApiSubmitError,
  decideNameCodeDescriptionBadRequestHandling,
  extractNameCodeDescriptionValidationErrors,
  NAME_CODE_DESCRIPTION_CODE_MAX,
  NAME_CODE_DESCRIPTION_DESCRIPTION_MAX,
  NAME_CODE_DESCRIPTION_NAME_MAX,
  validateNameCodeDescriptionForm,
  type ApiSubmitErrorAction,
  type ApiSubmitErrorCopy,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormState,
  type NameCodeDescriptionSubmitDecision,
} from "../../shared/forms";

/**
 * Helpers compartilhados pelos formulários de criação e edição de sistemas.
 *
 * Antes da Issue #59, o `NewSystemModal` carregava todas as constantes,
 * tipos e validação inline. Com o `EditSystemModal` herdando o mesmo
 * shape (`UpdateSystemRequest === CreateSystemRequest` no
 * `lfc-authenticator`), repetir o bloco de 50+ linhas de
 * `validateForm`/`extractValidationErrors` em dois arquivos dispararia
 * BLOCKER de duplicação no Sonar (lição PR #123/#127 — qualquer trecho
 * de 10+ linhas em 2+ arquivos vira `New Code Duplication`).
 *
 * Após o PR #68 (lição PR #134/#135 reforçada): os helpers de
 * validação/parsing migraram para
 * `src/shared/forms/NameCodeDescriptionForm.ts` — Sonar tokenizou
 * ~80 linhas idênticas entre `systemFormShared.ts` e
 * `rolesFormShared.ts` (validate/extract/decide). Os exports locais
 * agora são alias finos (delegam para os genéricos) para preservar
 * a API pública dos consumidores existentes.
 *
 * Este módulo segue concentrando o que é específico de "sistemas":
 *
 * - Tipos `SystemFormState`/`SystemFieldErrors` (alias estruturais).
 * - `classifySubmitError` (classificação de erros de submit, herdada
 *   do helper genérico em `shared/forms`).
 * - `MutationErrorCopy`/`classifyMutationError` para os modals de
 *   confirmação simples (delete/restore — cenário sem corpo de form,
 *   exclusivo de sistemas hoje).
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes unitários
 * possam consumir diretamente sem precisar de provider/render.
 */

/** Tamanho máximo do campo `Name` (espelha `CreateSystemRequest.Name`). */
export const NAME_MAX = NAME_CODE_DESCRIPTION_NAME_MAX;
/** Tamanho máximo do campo `Code` (espelha `CreateSystemRequest.Code`). */
export const CODE_MAX = NAME_CODE_DESCRIPTION_CODE_MAX;
/** Tamanho máximo do campo `Description` (espelha `CreateSystemRequest.Description`). */
export const DESCRIPTION_MAX = NAME_CODE_DESCRIPTION_DESCRIPTION_MAX;

/**
 * Estado controlado dos campos do form de sistema. Alias estrutural
 * de `NameCodeDescriptionFormState` (mesmo shape de roles após o
 * extract de PR #68). Usamos `string` em todos os campos para que o
 * React lide com inputs vazios sem `null`/`undefined` — o trim é
 * responsabilidade do submit.
 */
export type SystemFormState = NameCodeDescriptionFormState;

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado). Alias
 * estrutural de `NameCodeDescriptionFieldErrors`.
 */
export type SystemFieldErrors = NameCodeDescriptionFieldErrors;

/** Estado inicial vazio reutilizado no modal de criação. */
export const INITIAL_SYSTEM_FORM_STATE: SystemFormState = {
  name: "",
  code: "",
  description: "",
};

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateSystemRequest`/`UpdateSystemRequest`). Delegação direta
 * para `validateNameCodeDescriptionForm` — todos os limites/mensagens
 * coincidem com roles (lição PR #134/#135).
 */
export function validateSystemForm(
  state: SystemFormState,
): SystemFieldErrors | null {
  return validateNameCodeDescriptionForm(state);
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET. Delegação direta para
 * `extractNameCodeDescriptionValidationErrors` — backend de sistemas
 * envia exatamente as 3 chaves esperadas (Name/Code/Description).
 */
export function extractSystemValidationErrors(
  details: unknown,
): SystemFieldErrors | null {
  return extractNameCodeDescriptionValidationErrors(details);
}

/**
 * Resultado do mapeamento de uma `ApiError` 400 do backend. Alias
 * estrutural de `NameCodeDescriptionSubmitDecision`.
 */
export type SystemSubmitDecision = NameCodeDescriptionSubmitDecision;

/**
 * Decide o tratamento de uma resposta 400 do backend para o form de
 * sistema. Delegação direta para
 * `decideNameCodeDescriptionBadRequestHandling`.
 */
export function decideBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): SystemSubmitDecision {
  return decideNameCodeDescriptionBadRequestHandling(details, fallbackMessage);
}

/**
 * Copy textual usado por `classifySubmitError` para diferenciar create
 * de edit sem duplicar a lógica de classificação. Cada modal injeta sua
 * versão (`'um sistema'` vs `'outro sistema'`, `'criar'` vs `'atualizar'`).
 *
 * Estrutural: alias de `ApiSubmitErrorCopy` (helper genérico em
 * `shared/forms`). Mantemos o nome local para preservar imports
 * existentes (lição PR #134 — extrair sem quebrar callsites).
 */
export type SubmitErrorCopy = ApiSubmitErrorCopy;

/**
 * Resultado da classificação de um erro lançado por `createSystem` ou
 * `updateSystem`. O caller usa o `kind` num `switch` curto para chamar o
 * side-effect correto (set field error, applyBadRequest, toast, etc.).
 *
 * Estrutural: alias de `ApiSubmitErrorAction<keyof SystemFieldErrors>`.
 * A lógica vive em `shared/forms/classifySubmitError.ts` para evitar
 * duplicação Sonar entre `systemFormShared.ts` e `routeFormShared.ts`
 * (lição PR #134 — bloco de 26 linhas idênticas).
 */
export type SubmitErrorAction = ApiSubmitErrorAction<keyof SystemFieldErrors>;

/**
 * Classifica um erro lançado por `createSystem`/`updateSystem` em uma
 * `SubmitErrorAction` discriminada. Delegação de uma linha para o
 * helper genérico — preserva a assinatura pública usada pelos modals
 * de sistemas e pelos testes unitários.
 *
 * - `409` → `conflict` no campo `code` com mensagem do backend (ou
 *   `copy.conflictDefault`). Caller exibe inline.
 * - `400` → `bad-request` com `details` cru. Caller chama
 *   `applyBadRequest` que decide entre erros por campo (mapeáveis de
 *   `ValidationProblemDetails`) e `Alert` no topo.
 * - `404` → `not-found`. Só relevante para o `EditSystemModal`
 *   (sistema removido entre abertura e submit).
 * - `401`/`403` → `toast` vermelho.
 * - Outros → `unhandled` com a copy genérica.
 *
 * (Detalhe: o `conflictField` é fixo em `'code'` — o campo único de
 * unicidade do contrato `CreateSystemRequest`/`UpdateSystemRequest`.)
 */
export function classifySubmitError(
  error: unknown,
  copy: SubmitErrorCopy,
): SubmitErrorAction {
  return classifyApiSubmitError<keyof SystemFieldErrors>(error, copy, "code");
}

/**
 * Copy textual usado por `classifyMutationError` em modals de
 * confirmação simples (sem campos de form) — `DeleteSystemConfirm` (#60)
 * e o futuro `RestoreSystemConfirm` (#61).
 *
 * Diferente de `SubmitErrorCopy`, aqui não há `bad-request` com
 * `field-errors` (delete/restore não têm corpo); o slot
 * `conflictMessage` é opcional para já habilitar o `restore` (que
 * recebe 409 quando o sistema já está ativo) sem reabrir o módulo
 * compartilhado num PR futuro. O `delete` simplesmente não preenche
 * `conflictMessage` — `classifyMutationError` cai no fallback `unhandled`
 * para 409, que já é o comportamento correto para `delete` (backend
 * nunca devolve 409 no soft-delete).
 *
 * Pré-projetar este slot agora antecipa #61 sem expandir escopo de #60:
 * é exatamente a recomendação da lição PR #128 ("ao tocar 2+ arquivos
 * similares, projetar o módulo `<recurso>FormShared.ts` desde o
 * **primeiro PR do recurso**").
 */
export interface MutationErrorCopy {
  /** Título do toast em 401/403/erro genérico (`Falha ao desativar sistema`). */
  forbiddenTitle: string;
  /** Mensagem do toast quando o erro não é classificável (rede/parse/5xx). */
  genericFallback: string;
  /**
   * Mensagem fixa exibida quando o sistema não foi encontrado (404) —
   * o caller fecha o modal + dispara refetch. Default coerente com o
   * `EditSystemModal` ('Sistema não encontrado ou foi removido').
   */
  notFoundMessage: string;
  /**
   * Mensagem default do toast em 409 quando o backend não envia uma.
   * Opcional porque o `delete` não recebe 409 (backend só devolve 409
   * no `restore` quando o sistema já está ativo). Manter o slot
   * tipado-mas-opcional permite que `classifyMutationError` retorne
   * uma ação `conflict` para o `restore` reusando a mesma máquina de
   * estados em vez de duplicar lógica num PR futuro.
   */
  conflictMessage?: string;
}

/**
 * Resultado da classificação de um erro lançado por uma mutação simples
 * sem corpo de form (`deleteSystem` / futuro `restoreSystem`). Espelha
 * o desenho de `SubmitErrorAction` mas sem o caso `bad-request` —
 * mutações sem corpo nunca recebem `ValidationProblemDetails` com
 * `field-errors` para mapear.
 *
 * O caller usa o `kind` num `switch` curto para chamar o side-effect
 * correto (toast + close + refetch).
 */
export type MutationErrorAction =
  | { kind: "not-found"; message: string; title: string }
  | { kind: "conflict"; message: string; title: string }
  | { kind: "toast"; message: string; title: string }
  | { kind: "unhandled"; title: string; fallback: string };

/**
 * Classifica um erro lançado por uma mutação simples sem corpo
 * (`deleteSystem`, `restoreSystem`) em uma `MutationErrorAction`
 * discriminada. Não toca em React state — é puro, fácil de testar
 * isoladamente, e idêntico entre delete e restore.
 *
 * - `404` → `not-found` com `copy.notFoundMessage`. Caller fecha modal +
 *   toast vermelho + dispara refetch (item já removido por outra sessão).
 * - `409` → `conflict` com mensagem do backend (ou `copy.conflictMessage`).
 *   Só usado pelo `restore` (que recebe 409 quando o sistema já está
 *   ativo). O `delete` ignora — backend nunca devolve 409 nessa rota,
 *   mas o switch trata como `unhandled` para ser defensivo.
 * - `401`/`403` → `toast` vermelho com mensagem do backend.
 * - Outros HTTP / network / parse → `unhandled` com a copy genérica.
 *
 * Pré-projetar este helper já com `conflict` ao invés de adicionar no
 * PR de #61 evita 5ª recorrência de duplicação Sonar (lição PR #128).
 */
export function classifyMutationError(
  error: unknown,
  copy: MutationErrorCopy,
): MutationErrorAction {
  if (!isApiError(error) || error.kind !== "http") {
    return {
      kind: "unhandled",
      title: copy.forbiddenTitle,
      fallback: copy.genericFallback,
    };
  }
  const status = error.status;
  if (status === 404) {
    return {
      kind: "not-found",
      message: copy.notFoundMessage,
      title: copy.forbiddenTitle,
    };
  }
  if (status === 409 && typeof copy.conflictMessage === "string") {
    return {
      kind: "conflict",
      message: error.message ?? copy.conflictMessage,
      title: copy.forbiddenTitle,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "toast",
      message: error.message ?? "Você não tem permissão para esta ação.",
      title: copy.forbiddenTitle,
    };
  }
  return {
    kind: "unhandled",
    title: copy.forbiddenTitle,
    fallback: copy.genericFallback,
  };
}
