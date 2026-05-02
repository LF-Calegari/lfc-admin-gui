import { isApiError } from '../api';

/**
 * Cópia genérica usada por `classifySharedHttpError` para parametrizar
 * mensagens. Os módulos consumidores (ex.: `clientPhonesHelpers`,
 * `clientExtraEmailsHelpers`) re-exportam tipos `*ErrorCopy` mais
 * específicos que estendem este shape — preserva clareza no call-site
 * sem acoplar `classifySharedHttpError` aos tipos do consumer.
 */
export interface SharedHttpErrorCopy {
  /**
   * Mensagem genérica usada quando o erro não é classificável
   * (`network`/`parse`/5xx/HTTP fora dos casos esperados). Exibida
   * em toast vermelho.
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
 * Ação compartilhada decorrente da classificação de erro HTTP.
 * Cobre os casos comuns a todos os fluxos de mutação simples
 * (404, 401/403, fallback) — call sites específicos (add email,
 * add telefone, etc.) ramificam em variantes próprias para 400/409
 * antes de cair aqui.
 *
 * - `not-found` → recurso já removido (404). Caller fecha modal +
 *   refetch + toast.
 * - `toast` → 401/403 com mensagem do backend.
 * - `unhandled` → fallback (network/parse/5xx/HTTP fora dos casos
 *   esperados). Toast vermelho com `genericFallback`.
 */
export type SharedHttpErrorAction =
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

/**
 * Classifica os casos comuns de erro HTTP em uma ação discriminada.
 *
 * **Por que extraído (lição PR #128/#134/#135):** os módulos
 * `clientExtraEmailsHelpers` (#146) e `clientPhonesHelpers` (#147)
 * faziam o mesmo branching (~15 linhas: type guard `isApiError`,
 * checks `status === 404`, `=== 401`, `=== 403`, fallback
 * `unhandled`). Sonar/JSCPD tokenizam isso como bloco duplicado
 * entre arquivos. Promover para `src/shared/forms/` deduplica e abre
 * caminho para o terceiro consumidor (futuras coleções de Cliente
 * ou outras entidades) sem refator destrutivo.
 *
 * **Casos cobertos:**
 *
 * - Erro não-HTTP (network/parse/string solta) → `unhandled` com
 *   `genericFallback`.
 * - 404 → `not-found` com `notFoundMessage` da copy + título do
 *   toast.
 * - 401/403 → `toast` com mensagem do backend (ou `genericFallback`
 *   se vazia).
 * - 400/409 → `null` (caller resolve com lógica específica antes de
 *   cair no fallback `unhandled`).
 *
 * Mantemos retorno tipado como união ampla para que o caller faça
 * `narrowing` no kind sem precisar re-classificar — TypeScript infere
 * o subset depois do `if`.
 *
 * @returns Ação compartilhada quando o erro casa um dos casos
 *          comuns; `null` quando o caller precisa decidir
 *          (tipicamente status 400/409 com semântica específica do
 *          endpoint).
 */
export function classifySharedHttpError(
  error: unknown,
  copy: SharedHttpErrorCopy,
): SharedHttpErrorAction | null {
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
 * Fallback `unhandled` reusado quando nenhum caso específico cobre
 * o erro. Centralizar evita que a estrutura
 * `{ kind: 'unhandled', message, title }` apareça duplicada em cada
 * call site e dispare detecção de duplicação no Sonar/JSCPD.
 */
export function unhandledHttpAction(
  copy: SharedHttpErrorCopy,
): SharedHttpErrorAction {
  return {
    kind: 'unhandled',
    message: copy.genericFallback,
    title: copy.forbiddenTitle,
  };
}

/**
 * Subset estendido de `SharedHttpErrorAction` que cobre o classifier
 * de **add** (add email, add telefone): adiciona `inline` (400/409
 * com mensagem específica do endpoint) e `limit-reached` (400 com
 * "limite" — caller faz refetch).
 *
 * Retornado por `classifyAddCollectionApiError` para que ambos os
 * call sites (`classifyAddExtraEmailError` e `classifyAddPhoneError`)
 * deleguem a um helper único e zerem a duplicação que vivia nos dois
 * arquivos.
 */
export type AddCollectionApiAction =
  | SharedHttpErrorAction
  | { kind: 'inline'; message: string }
  | { kind: 'limit-reached'; message: string };

/**
 * Classifica erro do POST de adicionar item em uma coleção de cliente
 * (add email / add telefone). Engloba `classifySharedHttpError` +
 * branching específico de 400/409 que estava duplicado em
 * `clientExtraEmailsHelpers` e `clientPhonesHelpers`.
 *
 * **Casos cobertos:**
 *
 * - 400 com mensagem contendo "limite" → `limit-reached`. Caller
 *   exibe inline e refetch (race com outra sessão).
 * - 400 com qualquer outra mensagem → `inline`. Tipicamente
 *   formato/contrato inválido (validação client-side já cobriu;
 *   defensivo).
 * - 409 → `inline` com a mensagem do backend.
 * - 404/401/403/network/parse → delega ao `classifySharedHttpError`
 *   (mesmas variantes `not-found`/`toast`/`unhandled`).
 *
 * **Por que extraído (lição PR #128/#134/#135):** `classifyAddPhoneError`
 * e `classifyAddExtraEmailError` faziam ~27 linhas idênticas (switch
 * 400/409 + `unhandledHttpAction`). Sonar/JSCPD tokenizava como bloco
 * duplicado entre os dois arquivos. Promover deduplica e abre caminho
 * para um terceiro consumidor (futuras coleções) sem refator
 * destrutivo.
 */
export function classifyAddCollectionApiError(
  error: unknown,
  copy: SharedHttpErrorCopy,
): AddCollectionApiAction {
  const shared = classifySharedHttpError(error, copy);
  if (shared !== null) {
    return shared;
  }
  // `shared === null` significa que `error` é HTTP com `status` que
  // exige decisão específica do `add` (400/409). Reabrimos o type
  // guard porque o refinamento do `classifySharedHttpError` se
  // perde no retorno.
  if (!isApiError(error) || error.kind !== 'http') {
    return unhandledHttpAction(copy);
  }
  if (error.status === 400) {
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
  return unhandledHttpAction(copy);
}
