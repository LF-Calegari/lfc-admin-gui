import { isApiError } from '../../shared/api';

/**
 * Helpers compartilhados pelos formulários de criação e edição de rotas.
 *
 * Antes da Issue #63, a `RoutesPage` carregava só listagem (#62) sem
 * mutação. Com a primeira mutação chegando agora e a #64 (editar)
 * espelhando o mesmo shape (`UpdateRouteRequest === CreateRouteRequest`
 * no `lfc-authenticator`), repetir os blocos de validação/parsing nos
 * dois modals dispararia BLOCKER de duplicação Sonar (lição PR #128 —
 * 4ª recorrência). Centralizamos desde o **primeiro PR do recurso**.
 *
 * Este módulo concentra:
 *
 * - Limites de tamanho de cada campo (espelham `CreateRouteRequest` no
 *   `RoutesController.cs`).
 * - Tipos `RouteFormState`/`RouteFieldErrors` consumidos pelos modals
 *   e pelo componente compartilhado `RouteFormFields`.
 * - `validateRouteForm` — replica as regras `Required`/`MaxLength`/
 *   `SystemTokenTypeId` do backend para feedback imediato sem round-
 *   trip.
 * - `extractRouteValidationErrors` — mapeia
 *   `ValidationProblemDetails` do ASP.NET (`{ errors: { Name: ['msg']
 *   } }`) para `RouteFieldErrors`.
 * - `classifyRouteSubmitError` — converte um `unknown` lançado por
 *   `createRoute`/`updateRoute` em uma `RouteSubmitErrorAction`
 *   discriminada, eliminando a cadeia de `if (apiError.status ===
 *   ...)` que duplicaria entre `NewRouteModal.handleSubmit` e
 *   `EditRouteModal.handleSubmit` (lição PR #128).
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários possam consumir diretamente sem precisar de provider/render.
 *
 * **Por que não usar `systemFormShared.ts`?** O shape do form de rota
 * tem 4 campos (`name`/`code`/`description`/`systemTokenTypeId`) contra
 * 3 do sistema, e o `systemTokenTypeId` é um `<Select>` com regras
 * próprias (não-vazio, é UUID). Acoplar os dois recursos num único
 * módulo `formShared` violaria coesão (mudanças em rotas afetariam
 * sistemas) — manter os módulos paralelos preserva a independência.
 */

/** Tamanho máximo do campo `Name` (espelha `CreateRouteRequest.Name`). */
export const NAME_MAX = 80;
/** Tamanho máximo do campo `Code` (espelha `CreateRouteRequest.Code`). */
export const CODE_MAX = 50;
/** Tamanho máximo do campo `Description` (espelha `CreateRouteRequest.Description`). */
export const DESCRIPTION_MAX = 500;

/**
 * Estado controlado dos campos do form de rota. Usamos `string` em
 * todos os campos para que o React lide com inputs vazios sem `null`/
 * `undefined` — o trim é responsabilidade do submit. `systemTokenTypeId`
 * começa como string vazia (representa "nenhum selecionado") até o
 * usuário escolher uma opção do `<Select>`.
 */
export interface RouteFormState {
  name: string;
  code: string;
  description: string;
  systemTokenTypeId: string;
}

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado).
 */
export interface RouteFieldErrors {
  name?: string;
  code?: string;
  description?: string;
  systemTokenTypeId?: string;
}

/** Estado inicial vazio reutilizado no modal de criação. */
export const INITIAL_ROUTE_FORM_STATE: RouteFormState = {
  name: '',
  code: '',
  description: '',
  systemTokenTypeId: '',
};

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateRouteRequest`/`UpdateRouteRequest`). Retorna `null` quando
 * válido, ou um objeto com mensagens por campo. Usamos pt-BR e textos
 * próximos aos do backend para que a UX seja coerente entre validação
 * client e server.
 *
 * O `systemTokenTypeId` aceita qualquer string não-vazia — a validação
 * de UUID e existência fica no backend (que devolve 400 com
 * "SystemTokenTypeId inválido ou inativo." caso o id não exista). O
 * frontend só garante que o usuário fez uma escolha no `<Select>`.
 */
export function validateRouteForm(state: RouteFormState): RouteFieldErrors | null {
  const errors: RouteFieldErrors = {};
  const name = state.name.trim();
  const code = state.code.trim();
  const description = state.description.trim();
  const systemTokenTypeId = state.systemTokenTypeId.trim();

  if (name.length === 0) {
    errors.name = 'Nome é obrigatório.';
  } else if (name.length > NAME_MAX) {
    errors.name = `Nome deve ter no máximo ${NAME_MAX} caracteres.`;
  }

  if (code.length === 0) {
    errors.code = 'Código é obrigatório.';
  } else if (code.length > CODE_MAX) {
    errors.code = `Código deve ter no máximo ${CODE_MAX} caracteres.`;
  }

  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`;
  }

  if (systemTokenTypeId.length === 0) {
    errors.systemTokenTypeId = 'Selecione a política JWT alvo.';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Normaliza o nome de campo do backend (PascalCase) para o nome usado
 * no estado do form (camelCase). Mantém a função interna estática
 * porque a lista é fechada (4 campos do contrato).
 *
 * O backend manda `Name`/`Code`/`Description`/`SystemTokenTypeId` —
 * `SystemId` também aparece em algumas mensagens (`SystemId inválido
 * ou sistema inativo.`), mas nunca o exibimos inline porque o usuário
 * não controla esse valor (vem da URL). Ignoramos a chave no mapping.
 */
function normalizeRouteFieldName(serverField: string): keyof RouteFieldErrors | null {
  const lower = serverField.toLowerCase();
  if (lower === 'name') return 'name';
  if (lower === 'code') return 'code';
  if (lower === 'description') return 'description';
  if (lower === 'systemtokentypeid') return 'systemTokenTypeId';
  return null;
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET (`{ errors: { Name: ['msg'], ... } }`). Tolerante: se o
 * payload não bate com o shape esperado, devolve `null` para que o
 * caller caia no fallback genérico.
 *
 * Espelha `extractSystemValidationErrors` de `systemFormShared.ts`,
 * mas com a lista de campos do recurso "rotas".
 */
export function extractRouteValidationErrors(details: unknown): RouteFieldErrors | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const errors = (details as Record<string, unknown>).errors;
  if (!errors || typeof errors !== 'object') {
    return null;
  }
  const result: RouteFieldErrors = {};
  for (const [serverField, raw] of Object.entries(errors)) {
    const field = normalizeRouteFieldName(serverField);
    if (!field) continue;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      result[field] = raw[0];
    } else if (typeof raw === 'string') {
      result[field] = raw;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resultado do mapeamento de uma `ApiError` 400 do backend. O caller
 * usa essa decisão para chamar `setFieldErrors` (campos mapeados) ou
 * `setSubmitError` (mensagem genérica para Alert) — separar a decisão
 * do efeito colateral mantém o helper testável e idêntico entre os
 * dois modals.
 */
export type RouteSubmitDecision =
  | { kind: 'field-errors'; errors: RouteFieldErrors }
  | { kind: 'submit-error'; message: string };

/**
 * Decide o tratamento de uma resposta 400 do backend para o form de
 * rota:
 *
 * - Se o payload bate com `ValidationProblemDetails` e o backend
 *   identificou ao menos um campo, devolve `field-errors` com as
 *   mensagens mapeadas → caller exibe inline.
 * - Caso contrário, devolve `submit-error` com a mensagem do backend
 *   → caller exibe `Alert` no topo do form.
 *
 * Centralizar essa decisão evita o bloco `if (validation) { ... } else
 * { setSubmitError(...) }` duplicado entre `NewRouteModal` e
 * `EditRouteModal` (lição PR #123/#127 — qualquer trecho de 10+
 * linhas em 2+ arquivos é `New Code Duplication` no Sonar).
 */
export function decideRouteBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): RouteSubmitDecision {
  const validation = extractRouteValidationErrors(details);
  if (validation) {
    return { kind: 'field-errors', errors: validation };
  }
  return { kind: 'submit-error', message: fallbackMessage };
}

/**
 * Copy textual usado por `classifyRouteSubmitError` para diferenciar
 * create de edit sem duplicar a lógica de classificação. Cada modal
 * injeta sua versão (`'uma rota'` vs `'outra rota'`, `'criar'` vs
 * `'atualizar'`).
 */
export interface RouteSubmitErrorCopy {
  /** Mensagem default em 409 quando o backend não envia uma. */
  conflictDefault: string;
  /** Título do toast em 401/403/erro genérico. */
  forbiddenTitle: string;
  /** Mensagem do toast quando o erro não é classificável (rede/parse/5xx). */
  genericFallback: string;
}

/**
 * Resultado da classificação de um erro lançado por `createRoute` ou
 * `updateRoute`. O caller usa o `kind` num `switch` curto para chamar o
 * side-effect correto (set field error, applyBadRequest, toast, etc.).
 *
 * Separar a **decisão** (puro) do **efeito** (com setState/show/etc.)
 * elimina o bloco de ~25 linhas `if (apiError.status === 409) { ... }
 * if (... === 400) { ... } if (... === 401 || ... === 403) { ... }`
 * que ficaria duplicado entre `NewRouteModal.handleSubmit` e
 * `EditRouteModal.handleSubmit`. Mesma estratégia de
 * `classifySubmitError` em `systemFormShared.ts` (lição PR #128).
 *
 * Bonus: o switch curto mantém Cognitive Complexity < 10 no
 * `handleSubmit` de cada modal.
 */
export type RouteSubmitErrorAction =
  | { kind: 'conflict'; field: keyof RouteFieldErrors; message: string }
  | { kind: 'bad-request'; details: unknown; fallbackMessage: string }
  | { kind: 'not-found' }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; title: string; fallback: string };

/**
 * Classifica um erro lançado por `createRoute`/`updateRoute` em uma
 * `RouteSubmitErrorAction` discriminada. Não toca em React state — é
 * puro, fácil de testar isoladamente, e idêntico entre os dois modals.
 *
 * - `409` → `conflict` no campo `code` com mensagem do backend (ou
 *   copy default). Caller exibe inline.
 * - `400` → `bad-request` com `details` cru. Caller chama
 *   `applyBadRequest` que decide entre erros por campo (mapeáveis de
 *   `ValidationProblemDetails`) e `Alert` no topo.
 * - `404` → `not-found`. Só relevante para o `EditRouteModal` (rota
 *   removida entre abertura e submit). Caller dispara refetch + close.
 * - `401`/`403` → `toast` vermelho com mensagem do backend e título
 *   de `forbidden`.
 * - Qualquer outro `ApiError`/erro não-`ApiError` → `unhandled` com
 *   a copy genérica de fallback. Caller só dispara o toast.
 */
export function classifyRouteSubmitError(
  error: unknown,
  copy: RouteSubmitErrorCopy,
): RouteSubmitErrorAction {
  if (!isApiError(error) || error.kind !== 'http') {
    return { kind: 'unhandled', title: copy.forbiddenTitle, fallback: copy.genericFallback };
  }
  const status = error.status;
  if (status === 409) {
    return {
      kind: 'conflict',
      field: 'code',
      message: error.message ?? copy.conflictDefault,
    };
  }
  if (status === 400) {
    return { kind: 'bad-request', details: error.details, fallbackMessage: error.message };
  }
  if (status === 404) {
    return { kind: 'not-found' };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'toast',
      message: error.message ?? 'Você não tem permissão para esta ação.',
      title: copy.forbiddenTitle,
    };
  }
  return { kind: 'unhandled', title: copy.forbiddenTitle, fallback: copy.genericFallback };
}
