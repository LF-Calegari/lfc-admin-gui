import { isApiError } from '../api';

/**
 * Helper genérico de classificação de erros de submit em formulários
 * que falam com o `lfc-authenticator`.
 *
 * **Por que existe (lição PR #134 — duplicação Sonar):**
 *
 * Cada recurso (sistemas, rotas, futuramente roles/users/clients/
 * permissions) tem o mesmo `switch` de status code no `catch` do submit
 * dos modals: 409 → conflict no campo único; 400 → bad-request com
 * `ValidationProblemDetails`; 404 → not-found (relevante só no edit);
 * 401/403 → toast de forbidden; outros → unhandled. O Sonar tokeniza
 * essa cascata como bloco duplicado entre `systemFormShared.ts` e
 * `routeFormShared.ts` (26 linhas idênticas — disparou 4.7% New Code
 * Duplication na PR #134).
 *
 * Centralizando aqui:
 *
 * - Cada `<recurso>FormShared.ts` continua exportando seu próprio
 *   `classify*SubmitError` para preservar compatibilidade dos testes
 *   unitários e do tipo discriminado específico.
 * - A implementação delega para `classifyApiSubmitError`, que é a
 *   única cópia da máquina de estados.
 * - Adicionar um novo recurso (ex.: roles, users) só exige reusar o
 *   helper genérico — nenhum código novo de classificação.
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários consumam diretamente sem provider/render.
 */

/**
 * Copy textual injetada para diferenciar create de edit (e cada
 * recurso) sem duplicar a lógica de classificação. Cada modal injeta
 * sua versão (`'um sistema'` vs `'outro sistema'`, `'criar'` vs
 * `'atualizar'`, `'uma rota'`, etc.).
 */
export interface ApiSubmitErrorCopy {
  /** Mensagem default em 409 quando o backend não envia uma. */
  conflictDefault: string;
  /** Título do toast em 401/403/erro genérico. */
  forbiddenTitle: string;
  /** Mensagem do toast quando o erro não é classificável (rede/parse/5xx). */
  genericFallback: string;
}

/**
 * Resultado da classificação de um erro de submit. O caller usa o
 * `kind` num `switch` curto para chamar o side-effect correto (set
 * field error, applyBadRequest, toast, etc.).
 *
 * Genérico em `TField` para preservar o tipo do nome de campo do
 * conflito (`'code'` para sistemas/rotas; `'email'` ou outro para
 * recursos futuros). Discrimina pelos mesmos `kind`s usados pelos
 * call sites originais (`SubmitErrorAction` em `systemFormShared.ts`
 * e `RouteSubmitErrorAction` em `routeFormShared.ts`) — são aliases
 * desta união.
 *
 * Separar a **decisão** (puro) do **efeito** (com setState/show/etc.)
 * mantém o helper testável e idêntico entre todos os recursos.
 * Bonus: o switch curto mantém Cognitive Complexity < 10 no
 * `handleSubmit` de cada modal (lição PR #128).
 */
export type ApiSubmitErrorAction<TField extends string> =
  | { kind: 'conflict'; field: TField; message: string }
  | { kind: 'bad-request'; details: unknown; fallbackMessage: string }
  | { kind: 'not-found' }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; title: string; fallback: string };

/**
 * Classifica um erro lançado pelas mutações de form (`createSystem`,
 * `updateSystem`, `createRoute`, `updateRoute`, futuras) numa
 * `ApiSubmitErrorAction` discriminada.
 *
 * - `409` → `conflict` no `conflictField` informado, com mensagem do
 *   backend (ou `copy.conflictDefault`). Caller exibe inline.
 * - `400` → `bad-request` com `details` cru. Caller chama
 *   `applyBadRequest` que decide entre erros por campo (mapeáveis de
 *   `ValidationProblemDetails`) e `Alert` no topo.
 * - `404` → `not-found`. Só relevante para o caminho de edit (item
 *   removido entre abertura e submit). Caller dispara refetch + close.
 * - `401`/`403` → `toast` vermelho com mensagem do backend e título
 *   de `forbidden` (caller continua aberto, deixa cliente HTTP cuidar
 *   do redirect 401).
 * - Qualquer outro `ApiError`/erro não-`ApiError` → `unhandled` com a
 *   copy genérica de fallback. Caller só dispara o toast.
 */
export function classifyApiSubmitError<TField extends string>(
  error: unknown,
  copy: ApiSubmitErrorCopy,
  conflictField: TField,
): ApiSubmitErrorAction<TField> {
  if (!isApiError(error) || error.kind !== 'http') {
    return { kind: 'unhandled', title: copy.forbiddenTitle, fallback: copy.genericFallback };
  }
  const status = error.status;
  if (status === 409) {
    return {
      kind: 'conflict',
      field: conflictField,
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
