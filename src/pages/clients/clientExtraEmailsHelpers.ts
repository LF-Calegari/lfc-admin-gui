import { isApiError } from '../../shared/api';
import { isValidEmailSyntax } from '../../shared/forms';

/**
 * Helpers compartilhados pelo `ClientExtraEmailsTab` (Issue #146).
 *
 * Concentra:
 *
 * - Constantes de validação (`EXTRA_EMAIL_MAX`) — espelha
 *   `AddEmailRequest.Email.MaxLength(320)` no `lfc-authenticator`.
 * - `validateExtraEmailInput` — feedback client-side antes do submit
 *   (formato de email + tamanho máx.). Replica o suficiente para
 *   evitar round-trip por digitação trivial; o backend permanece
 *   autoritativo (`[EmailAddress]` + `EmailValidator.IsValid`).
 * - `classifyAddExtraEmailError` — converte um `unknown` lançado por
 *   `addClientExtraEmail` em uma ação discriminada para que o
 *   componente decida com `switch` curto se exibe inline (409/400
 *   validável), toast (401/403/network) ou refetch (404).
 * - `classifyRemoveExtraEmailError` — espelha o classify do `add`
 *   para o caminho `DELETE /clients/{id}/emails/{emailId}`. Diferença
 *   chave é o 400 quando o email é username (mensagem orientadora
 *   exibida em toast em vez de inline).
 *
 * **Por que módulo dedicado e não dentro de `clientsFormShared.ts`?**
 * O form de email extra é minúsculo (1 campo) e tem fluxo próprio
 * (modal de adicionar + confirm de remover) — manter helpers
 * separados preserva a coesão do `clientsFormShared.ts` (focado em
 * PF/PJ) e evita acoplar mudanças entre as duas camadas.
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários consumam diretamente sem provider/render.
 */

/**
 * Tamanho máximo do email extra — espelha
 * `AddEmailRequest.Email.MaxLength(320)` no `ClientsController`. Mesma
 * regra geral do `userFormShared.EMAIL_MAX` (RFC 5321 limita o local
 * part a 64 chars + domínio a 255 chars; total prático ~320).
 */
export const EXTRA_EMAIL_MAX = 320;

/**
 * Valida o input de email extra contra as mesmas regras do backend
 * (`Required` + `MaxLength(320)` + formato `EmailAddress`/
 * `EmailValidator.IsValid`).
 *
 * Retorna `null` quando válido, ou string com mensagem amigável em
 * pt-BR. Trim defensivo aplicado antes da checagem — o backend
 * faz `Email.Trim().ToLowerInvariant()`, então digitar
 * `"  ana@ex.com  "` é tratado como `"ana@ex.com"`. A UI espelha
 * trimando antes de validar para alinhar feedback com o que o
 * servidor faria.
 */
export function validateExtraEmailInput(raw: string): string | null {
  const email = raw.trim();
  if (email.length === 0) {
    return 'Email é obrigatório.';
  }
  if (email.length > EXTRA_EMAIL_MAX) {
    return `Email deve ter no máximo ${EXTRA_EMAIL_MAX} caracteres.`;
  }
  if (!isValidEmailSyntax(email)) {
    return 'Informe um email válido.';
  }
  return null;
}

/**
 * Cópia textual injetada nos `classify*` desta camada. Mantém os
 * literais em pt-BR centralizados num único objeto — qualquer
 * ajuste de copy acontece em uma referência só.
 */
export interface ExtraEmailErrorCopy {
  /**
   * Mensagem genérica usada quando o erro não é classificável
   * (`network`/`parse`/5xx). Exibida em toast vermelho.
   */
  genericFallback: string;
  /**
   * Título do toast vermelho exibido para 401/403/network/parse —
   * dá hierarquia visual ao operador identificar o tipo do erro.
   */
  forbiddenTitle: string;
  /**
   * Mensagem específica para o 404 (recurso já removido entre
   * abertura e submit). Exibida em toast vermelho + força refetch.
   */
  notFoundMessage: string;
}

/**
 * Ação discriminada decorrente da classificação de erro do `add`.
 *
 * - `inline` → mensagem associada ao input (`409` duplicado ou
 *   coincidência com username). Componente seta `inputError`.
 * - `limit-reached` → 400 "Limite de 3 emails extras...". Componente
 *   seta `inputError` e fecha o modal porque a UI já oferece o
 *   botão "Adicionar" desabilitado quando atinge o limite — chegar
 *   aqui significa race com outra sessão; refetch sincroniza.
 * - `not-found` → cliente removido (404). Componente fecha modal +
 *   refetch + toast.
 * - `toast` → 401/403 com mensagem do backend.
 * - `unhandled` → fallback (network/parse/5xx). Toast vermelho com
 *   `genericFallback`.
 */
export type AddExtraEmailErrorAction =
  | { kind: 'inline'; message: string }
  | { kind: 'limit-reached'; message: string }
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

/**
 * Branch comum entre `classifyAddExtraEmailError` e
 * `classifyRemoveExtraEmailError` — encapsula os casos compartilhados
 * (não-HTTP, 404, 401/403, fallback) num único helper para que o
 * Sonar/JSCPD não tokenize ~15 linhas idênticas como duplicação
 * (lição PR #128/#134/#135 — bloco ≥10 linhas em 2+ funções vira
 * `New Code Duplication`).
 *
 * Retorna a ação compartilhada quando o caso é coberto, ou `null`
 * quando o status precisa de tratamento específico do call site (400/
 * 409 no `add`; 400 no `remove`). O caller decide o que fazer com o
 * `null` — tipicamente ramifica em casos próprios e cai no fallback
 * `unhandled` se nenhum bater.
 *
 * Mantemos retorno tipado como união ampla (`SharedExtraEmailAction`)
 * para que o caller faça `narrowing` no kind sem precisar
 * re-classificar — TypeScript infere o subset depois do `if`.
 */
type SharedExtraEmailAction =
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

function classifySharedExtraEmailError(
  error: unknown,
  copy: ExtraEmailErrorCopy,
): SharedExtraEmailAction | null {
  if (!isApiError(error) || error.kind !== 'http') {
    return {
      kind: 'unhandled',
      message: copy.genericFallback,
      title: copy.forbiddenTitle,
    };
  }
  if (error.status === 404) {
    return {
      kind: 'not-found',
      message: copy.notFoundMessage,
      title: copy.forbiddenTitle,
    };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      kind: 'toast',
      message: error.message || copy.genericFallback,
      title: copy.forbiddenTitle,
    };
  }
  // 400/409 são specific-by-endpoint — caller resolve antes de cair
  // no fallback comum.
  return null;
}

/**
 * Fallback `unhandled` reusado pelo `add` e `remove` quando nenhum
 * caso específico cobre o erro. Centralizar evita que a estrutura
 * `{ kind: 'unhandled', message, title }` apareça duas vezes em cada
 * função e dispare detecção de duplicação no Sonar/JSCPD.
 */
function unhandledExtraEmailAction(
  copy: ExtraEmailErrorCopy,
): SharedExtraEmailAction {
  return {
    kind: 'unhandled',
    message: copy.genericFallback,
    title: copy.forbiddenTitle,
  };
}

/**
 * Classifica o erro do `addClientExtraEmail` em uma ação
 * discriminada. Centraliza a árvore de switch que viveria duplicada
 * em cada call site (lição PR #128/#134/#135 — quando o `try/catch`
 * tem 5+ branches diferentes, o switch direto vira hotspot de
 * complexidade cognitiva e duplicação Sonar).
 *
 * **Casos cobertos (espelham o backend `ClientsController.AddEmail`):**
 *
 * - 400 com mensagem `"Limite de 3 emails extras..."` →
 *   `limit-reached`. Componente exibe inline e refetch para
 *   sincronizar (cliente teve outro email adicionado por outra
 *   sessão). Defensivo — UI normalmente desabilita o botão antes.
 * - 400 com mensagem `"Email extra inválido."` → `inline`. Caso
 *   raro (validação client-side já cobriu).
 * - 409 com mensagem `"Email extra já cadastrado..."` ou `"Este
 *   email está sendo usado como username..."` → `inline` com a
 *   mensagem do backend (que já é orientadora).
 * - 404 → `not-found` (cliente removido entre abertura e submit).
 *   Tratado em `classifySharedExtraEmailError`.
 * - 401/403 → `toast` com mensagem do backend. Tratado em
 *   `classifySharedExtraEmailError`.
 * - Demais → `unhandled` com `genericFallback`.
 */
export function classifyAddExtraEmailError(
  error: unknown,
  copy: ExtraEmailErrorCopy,
): AddExtraEmailErrorAction {
  const shared = classifySharedExtraEmailError(error, copy);
  if (shared !== null) {
    return shared;
  }
  // `shared === null` significa que `error` é HTTP com `status` que
  // exige decisão específica do `add` (400/409). Reabrimos o type
  // guard para que TS saiba que `isApiError(error) === true` aqui
  // (refinamento perdido no retorno do helper).
  if (!isApiError(error) || error.kind !== 'http') {
    return unhandledExtraEmailAction(copy);
  }
  if (error.status === 400) {
    // Distinção pela mensagem do backend — `limit-reached` precisa
    // disparar refetch (cliente foi tocado por outra sessão).
    const message = error.message || copy.genericFallback;
    if (message.toLowerCase().includes('limite')) {
      return { kind: 'limit-reached', message };
    }
    return { kind: 'inline', message };
  }
  if (error.status === 409) {
    const message = error.message || copy.genericFallback;
    return { kind: 'inline', message };
  }
  return unhandledExtraEmailAction(copy);
}

/**
 * Ação discriminada decorrente da classificação de erro do `remove`.
 *
 * - `username` → 400 "Não é permitido remover email que esteja sendo
 *   usado como username.". Toast vermelho orientador.
 * - `not-found` → email não pertence ao cliente (404). Refetch +
 *   toast.
 * - `toast` → 401/403 com mensagem do backend.
 * - `unhandled` → fallback. Toast vermelho com `genericFallback`.
 *
 * Diferente do `Add`, não há caso `inline` porque o remove não tem
 * input — a confirmação é binária (clicar ou cancelar) e o feedback
 * é sempre via toast.
 */
export type RemoveExtraEmailErrorAction =
  | { kind: 'username'; message: string; title: string }
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

/**
 * Classifica o erro do `removeClientExtraEmail` em uma ação
 * discriminada. Espelha `classifyAddExtraEmailError` mas com casos
 * próprios do `DELETE /clients/{id}/emails/{emailId}`.
 *
 * **Casos cobertos (espelham `ClientsController.RemoveEmail`):**
 *
 * - 400 com qualquer mensagem → `username` (o backend só devolve 400
 *   nesse endpoint quando o email é username). Toast com mensagem
 *   do backend, que já é orientadora.
 * - 404 → `not-found` (email já removido por outra sessão entre
 *   abertura e submit, ou id inconsistente).
 * - 401/403 → `toast` com mensagem do backend.
 * - Demais → `unhandled` com `genericFallback`.
 */
export function classifyRemoveExtraEmailError(
  error: unknown,
  copy: ExtraEmailErrorCopy,
): RemoveExtraEmailErrorAction {
  const shared = classifySharedExtraEmailError(error, copy);
  if (shared !== null) {
    return shared;
  }
  if (!isApiError(error) || error.kind !== 'http') {
    return unhandledExtraEmailAction(copy);
  }
  if (error.status === 400) {
    return {
      kind: 'username',
      message: error.message || copy.genericFallback,
      title: copy.forbiddenTitle,
    };
  }
  return unhandledExtraEmailAction(copy);
}
