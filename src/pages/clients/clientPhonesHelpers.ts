import {
  classifyAddCollectionApiError,
  classifySharedHttpError,
  unhandledHttpAction,
  type AddCollectionApiAction,
  type SharedHttpErrorAction,
  type SharedHttpErrorCopy,
} from '../../shared/forms';

/**
 * Helpers compartilhados pelo `ClientPhonesTab` (Issue #147 — gerenciar
 * celulares e telefones fixos do cliente).
 *
 * Concentra:
 *
 * - Constantes de validação (`PHONE_MAX_LENGTH`, `PHONE_E164_REGEX`)
 *   — espelham `AddPhoneRequest.Number.MaxLength(20)` e
 *   `ClientsController.PhoneRegex` (`^\+[1-9]\d{11,14}$`) no
 *   `lfc-authenticator`.
 * - `validatePhoneInput` — feedback client-side antes do submit
 *   (formato E.164 + tamanho máx.). Replica o suficiente para evitar
 *   round-trip por digitação trivial; o backend permanece autoritativo
 *   (`PhoneRegex.IsMatch` em `AddPhoneInternal`).
 * - `classifyAddPhoneError` — converte um `unknown` lançado por
 *   `addClientMobilePhone`/`addClientLandlinePhone` em uma ação
 *   discriminada para que o componente decida com `switch` curto se
 *   exibe inline (400 inválido / 409 duplicado), toast (401/403/network)
 *   ou refetch (404, 400 limite).
 * - `classifyRemovePhoneError` — espelha o classify do `add` para o
 *   caminho `DELETE /clients/{id}/(mobiles|phones)/{phoneId}`. Diferença
 *   chave é a ausência de 400 distintivo (o backend só devolve 404
 *   nesse endpoint quando o id não bate).
 *
 * **Reuso entre mobile e landline:** o backend usa o mesmo
 * `AddPhoneInternal`/`RemovePhoneInternal` para os dois tipos,
 * divergindo apenas no `Type` discriminador e na mensagem de limite
 * (`"Limite de 3 celulares por cliente."` vs `"Limite de 3 telefones
 * por cliente."`). Os helpers aqui são agnósticos quanto ao tipo —
 * extraem informação por inspeção da mensagem do backend (palavra
 * "limite" para distinguir cap vs formato), o que mantém o componente
 * `ClientPhonesTab` simples e único.
 *
 * **Por que módulo dedicado e não dentro de `clientsFormShared.ts` ou
 * `clientExtraEmailsHelpers.ts`?**
 * Os helpers de email têm regras próprias (anti-username, formato
 * RFC 5321) que não se aplicam a telefone; e o `clientsFormShared.ts`
 * concentra validação PF/PJ. Manter um módulo por subdomínio preserva
 * a coesão e evita acoplar mudanças entre as três camadas (lição PR
 * #128 — projetar shared helpers desde o primeiro PR do recurso).
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários consumam diretamente sem provider/render.
 */

/**
 * Tamanho máximo do número de telefone — espelha
 * `AddPhoneRequest.Number.MaxLength(20)` no `ClientsController`. A
 * regex E.164 já restringe para 13–16 caracteres (`+` + 12–15
 * dígitos), mas mantemos a checagem de tamanho pelo MaxLength por
 * defesa em profundidade — o input HTML aceita até `PHONE_MAX_LENGTH`
 * caracteres antes de bloquear digitação.
 */
export const PHONE_MAX_LENGTH = 20;

/**
 * Regex E.164 idêntica ao `ClientsController.PhoneRegex` no
 * `lfc-authenticator`:
 *
 * - `^\+` — sempre começa com `+` (DDI internacional obrigatório).
 * - `[1-9]` — primeiro dígito do código do país é não-zero.
 * - `\d{11,14}$` — seguido de 11 a 14 dígitos (totalizando 12–15
 *   dígitos após o `+`, ou 13–16 caracteres no total).
 *
 * Exemplos válidos:
 *   +5518981789845  (Brasil celular — 14 chars: + + 13 dígitos)
 *   +551832345678   (Brasil fixo — 13 chars: + + 12 dígitos, limite inferior)
 *   +442083661177   (Reino Unido — 13 chars: + + 12 dígitos)
 *   +551234567890123 (limite superior — 16 chars: + + 15 dígitos)
 *
 * Exemplos inválidos:
 *   18981789845     (sem +)
 *   +0123456789012  (segundo dígito é 0)
 *   +14155552671    (EUA — só 11 dígitos após +; o backend rejeita
 *                   números norte-americanos por escolha do contrato)
 *   +1234567890     (curto demais — só 10 dígitos após +)
 *   +12345678901234567 (longo demais — 17 dígitos após +)
 */
export const PHONE_E164_REGEX = /^\+[1-9]\d{11,14}$/;

/**
 * Valida o input de telefone contra as mesmas regras do backend
 * (`Required` + `MaxLength(20)` + formato `PhoneRegex`).
 *
 * Retorna `null` quando válido, ou string com mensagem amigável em
 * pt-BR. Trim defensivo aplicado antes da checagem — o backend
 * faz `Number.Trim()`, então digitar `"  +5518981789845  "` é tratado
 * como `"+5518981789845"`. A UI espelha trimando antes de validar
 * para alinhar feedback com o que o servidor faria.
 */
export function validatePhoneInput(raw: string): string | null {
  const number = raw.trim();
  if (number.length === 0) {
    return 'Número é obrigatório.';
  }
  if (number.length > PHONE_MAX_LENGTH) {
    return `Número deve ter no máximo ${PHONE_MAX_LENGTH} caracteres.`;
  }
  if (!PHONE_E164_REGEX.test(number)) {
    return 'Use o formato internacional com DDI e DDD, ex.: +5518981789845.';
  }
  return null;
}

/**
 * Cópia textual injetada nos `classify*` desta camada. Alias do
 * `SharedHttpErrorCopy` em `src/shared/forms/` — manter o nome
 * `PhoneErrorCopy` no domínio de telefones torna o call-site mais
 * legível, mas o shape é idêntico para que o classifier compartilhado
 * `classifySharedHttpError` consuma diretamente sem cast.
 *
 * Espelha `ExtraEmailErrorCopy` (#146) — qualquer evolução do contrato
 * (ex.: campo extra para 5xx) propaga para os dois consumidores via
 * `SharedHttpErrorCopy`.
 */
export type PhoneErrorCopy = SharedHttpErrorCopy;

/**
 * Ação discriminada decorrente da classificação de erro do `add`.
 * Alias de `AddCollectionApiAction` em `src/shared/forms/` —
 * `classifyAddCollectionApiError` cobre exatamente o conjunto que o
 * call site precisa (`inline`/`limit-reached` específico do add +
 * `not-found`/`toast`/`unhandled` do shared).
 *
 * Mantemos o nome `AddPhoneErrorAction` no domínio de telefones para
 * preservar a clareza do call-site existente.
 */
export type AddPhoneErrorAction = AddCollectionApiAction;

/**
 * Classifica o erro do `addClientMobilePhone`/`addClientLandlinePhone`
 * em uma ação discriminada. Centraliza a árvore de switch que viveria
 * duplicada em cada call site (lição PR #128/#134/#135).
 *
 * **Casos cobertos (espelham o backend `ClientsController.AddPhoneInternal`):**
 *
 * - 400 com mensagem contendo "limite" (case-insensitive) →
 *   `limit-reached`. Componente exibe inline e refetch para
 *   sincronizar (cliente teve outro telefone adicionado por outra
 *   sessão). Defensivo — UI normalmente desabilita o botão antes.
 * - 400 com qualquer outra mensagem → `inline`. Tipicamente
 *   `"Telefone inválido. Use o formato internacional..."` (validação
 *   client-side já cobriu, defensivo).
 * - 409 → `inline` com a mensagem do backend (`"Contato já cadastrado
 *   para este cliente."`).
 * - 404 → `not-found` (cliente removido entre abertura e submit).
 *   Tratado em `classifySharedPhoneError`.
 * - 401/403 → `toast` com mensagem do backend.
 * - Demais → `unhandled` com `genericFallback`.
 */
export function classifyAddPhoneError(
  error: unknown,
  copy: PhoneErrorCopy,
): AddPhoneErrorAction {
  // Delega para o helper genérico — branching 400/409/404/401-403 é
  // idêntico ao de `classifyAddExtraEmailError` (#146). O backend
  // sinaliza limite com mensagem `"Limite de 3 (celulares|telefones)
  // por cliente."` — o `includes('limite')` cobre os dois casos sem
  // depender da string completa.
  return classifyAddCollectionApiError(error, copy);
}

/**
 * Ação discriminada decorrente da classificação de erro do `remove`.
 *
 * Diferente de email extra, o backend **não** devolve 400 no remove
 * de telefone (o `RemovePhoneInternal` só pode falhar com 404 quando
 * o id não bate, ou com 401/403). Por isso a união aqui é um subset
 * estrito da do `Add`.
 *
 * - `not-found` → telefone não pertence ao cliente (404). Refetch +
 *   toast.
 * - `toast` → 401/403 com mensagem do backend.
 * - `unhandled` → fallback. Toast vermelho com `genericFallback`.
 */
export type RemovePhoneErrorAction = SharedHttpErrorAction;

/**
 * Classifica o erro do `removeClientMobilePhone`/
 * `removeClientLandlinePhone` em uma ação discriminada. Espelha
 * `classifyAddPhoneError` mas sem o 400 (o backend não devolve esse
 * status no `RemovePhoneInternal`).
 *
 * **Casos cobertos (espelham `ClientsController.RemovePhoneInternal`):**
 *
 * - 404 → `not-found` (telefone já removido por outra sessão entre
 *   abertura e submit, ou id inconsistente).
 * - 401/403 → `toast` com mensagem do backend.
 * - Demais (incluindo 400 inesperado, defensivo) → `unhandled`.
 */
export function classifyRemovePhoneError(
  error: unknown,
  copy: PhoneErrorCopy,
): RemovePhoneErrorAction {
  const shared = classifySharedHttpError(error, copy);
  if (shared !== null) {
    return shared;
  }
  // 400 inesperado nesse endpoint cai no fallback unhandled — mantém
  // o operador informado mesmo num cenário não previsto pelo contrato.
  return unhandledHttpAction(copy);
}
