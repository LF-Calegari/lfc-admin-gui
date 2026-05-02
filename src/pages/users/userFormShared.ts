import {
  classifyApiSubmitError,
  type ApiSubmitErrorAction,
  type ApiSubmitErrorCopy,
} from '../../shared/forms';

/**
 * Helpers compartilhados pelos formulários de criação (Issue #78) e
 * futuras edições (sub-issues seguintes da EPIC #49) de usuários.
 *
 * Antes da Issue #78, a `UsersListShellPage` (#77) carregava só a
 * listagem sem mutações. Com a primeira mutação chegando agora,
 * projetar este módulo desde o início evita BLOCKER de duplicação
 * Sonar quando a issue de edição (`updateUser`/`updatePassword`)
 * espelhar o mesmo shape (lição PR #128 — projetar
 * `<recurso>FormShared.ts` desde o **primeiro PR do recurso**).
 *
 * Este módulo concentra:
 *
 * - Limites de tamanho de cada campo (espelham `CreateUserRequest` em
 *   `UsersController.cs`).
 * - Tipos `UserFormState`/`UserFieldErrors` consumidos pelo modal e
 *   pelo componente compartilhado `UserFormFields`.
 * - `validateUserForm` — replica as regras `Required`/`MaxLength`/
 *   `EmailAddress`/`Identity (int)` do backend para feedback imediato
 *   sem round-trip.
 * - `extractUserValidationErrors` — mapeia
 *   `ValidationProblemDetails` do ASP.NET (`{ errors: { Name: ['msg']
 *   } }`) para `UserFieldErrors`.
 * - `classifyUserSubmitError` — converte um `unknown` lançado por
 *   `createUser`/`updateUser` (futuro) em uma `UserSubmitErrorAction`
 *   discriminada com `conflictField: 'email'` (campo único de
 *   unicidade do backend).
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários consumam diretamente sem provider/render.
 *
 * **Por que não usar `systemFormShared.ts`?** O shape do form de user
 * tem 6 campos (`name`/`email`/`password`/`identity`/`clientId`/
 * `active`) contra 3 do sistema, com tipos diferentes (`int` para
 * `identity`, formato `email` para `email`, `bool?` para `active`).
 * Acoplar os dois recursos num único módulo `formShared` violaria
 * coesão (mudanças em users afetariam sistemas) — manter os módulos
 * paralelos preserva a independência.
 */

/** Tamanho máximo do campo `Name` (espelha `CreateUserRequest.Name`). */
export const NAME_MAX = 80;
/** Tamanho máximo do campo `Email` (espelha `CreateUserRequest.Email`). */
export const EMAIL_MAX = 320;
/**
 * Tamanho máximo do campo `Password` em texto plano antes do hash
 * (espelha `CreateUserRequest.Password.MaxLength`). 60 chars é
 * suficiente para senhas geradas em gerenciadores típicos sem expor
 * o tamanho real do hash bcrypt.
 */
export const PASSWORD_MAX = 60;
/**
 * Tamanho mínimo "sensato" da senha exigido client-side. O backend
 * não declara um mínimo formal (apenas `Required`/`MaxLength`), mas a
 * UX administrativa exige uma senha minimamente forte para o usuário
 * inicial. 8 chars é o consenso OWASP/NIST para "razoável" em formulários
 * administrativos onde a senha será trocada na primeira sessão.
 *
 * Mantemos como constante exportada para que o copy do helper de
 * validação use a mesma fonte de verdade da regra — qualquer ajuste
 * (ex.: subir para 12) acontece em um único lugar e o teste unitário
 * pega regressão silenciosa.
 */
export const PASSWORD_MIN = 8;

/**
 * Estado controlado dos campos do form de user. Usamos `string` em
 * todos os campos textuais para que o React lide com inputs vazios
 * sem `null`/`undefined` — o trim/parse é responsabilidade do submit.
 *
 * - `identity` é `string` (não `number`) no estado para preservar a
 *   experiência do `<Input type="number">` (que reporta string vazia
 *   quando o usuário apaga o valor — `Number('')` daria `0`, falso
 *   positivo de "informado"). O parse para `int` acontece no
 *   `prepareSubmit`.
 * - `clientId` é `string` (não `string | null`) — string vazia
 *   representa "deixar o backend gerar via `LegacyClientFactory`".
 * - `active` é `boolean` desde o estado porque o `<Switch>`/`<Checkbox>`
 *   já trabalha com bool nativo, e ausência (`undefined`) seria
 *   ambiguidade desnecessária.
 */
export interface UserFormState {
  name: string;
  email: string;
  password: string;
  identity: string;
  clientId: string;
  active: boolean;
}

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado).
 * `active` não tem erro inline (o toggle nunca dispara validação).
 */
export interface UserFieldErrors {
  name?: string;
  email?: string;
  password?: string;
  identity?: string;
  clientId?: string;
}

/**
 * Estado inicial reutilizado no modal de criação. `active: true`
 * casa com o default do backend (`CreateUserRequest.Active = true`)
 * — o usuário só desliga explicitamente quando quer cadastrar
 * inativo.
 */
export const INITIAL_USER_FORM_STATE: UserFormState = {
  name: '',
  email: '',
  password: '',
  identity: '',
  clientId: '',
  active: true,
};

/**
 * Validação simples de e-mail sem regex. Não é "regex perfeita" (essa
 * não existe — a RFC 5322 é gigantesca), mas captura erros de digitação
 * óbvios (sem `@`, sem TLD, espaços) sem rejeitar e-mails válidos
 * legítimos. O backend (`[EmailAddress]` do ASP.NET) faz a validação
 * autoritativa; o client-side é só feedback imediato.
 *
 * Implementação manual (em vez de regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
 * para evitar `typescript:S5852` — Sonar marca a regex tripla `[^\s@]+`
 * como vulnerável a backtracking super-linear (DoS hotspot). A versão
 * sem regex é equivalente em intenção e linear no comprimento da
 * string.
 */
function isValidEmailSyntax(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1) return false;
  if (at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  if (domain.length === 0) return false;
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

/**
 * Confere se a string parseia para um inteiro finito (positivo ou
 * negativo, incluindo `0`). Aceita `"0"`/`"1"`/`"42"` mas rejeita
 * `""`/`"abc"`/`"1.5"`/`"1e2"` para evitar interpretações ambíguas
 * com `Number()` (que aceita notação científica). O backend espera
 * `int?` em `Identity` — qualquer valor não-inteiro retorna 400
 * com mensagem do binder ASP.NET ("The JSON value could not be
 * converted to System.Int32.").
 *
 * Mantemos function pura para reusar no teste sem acoplar com regex
 * inline — qualquer ajuste (ex.: aceitar negativos zero-padded como
 * `'-0'`) acontece num lugar.
 */
function isIntegerString(raw: string): boolean {
  if (raw.length === 0) return false;
  // Aceita opcional sinal `-` no início; rejeita `+` para evitar
  // confusão com encoding URL.
  return /^-?\d+$/.test(raw);
}

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateUserRequest`). Retorna `null` quando válido, ou um objeto
 * com mensagens por campo. Usamos pt-BR e textos próximos aos do
 * backend para que a UX seja coerente entre validação client e server.
 *
 * Regras:
 *
 * - `name`: `Required` + `MaxLength(80)`.
 * - `email`: `Required` + `MaxLength(320)` + formato (`isValidEmailSyntax`).
 * - `password`: `Required` + `MinLength(8)` + `MaxLength(60)`. O
 *   mínimo de 8 chars é client-side only (backend não declara mínimo)
 *   — UX defensiva para senhas iniciais administrativas.
 * - `identity`: `Required` + tem que ser inteiro válido. Backend
 *   rejeita não-inteiros via JSON binder.
 * - `clientId`: opcional. Quando informado, valida formato UUID
 *   básico (8-4-4-4-12 hex). Inválido client-side evita round-trip
 *   por digitação errada — backend rejeita com `400 { message:
 *   "ClientId informado não existe." }` se o UUID não estiver na
 *   base, mas isso é um caso runtime distinto (UUID válido, recurso
 *   ausente).
 * - `active`: nunca falha (toggle bool).
 */
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function validateUserForm(state: UserFormState): UserFieldErrors | null {
  const errors: UserFieldErrors = {};
  const name = state.name.trim();
  const email = state.email.trim();
  // Senha não é trimada — espaços no início/fim podem ser
  // intencionais para senhas geradas em gerenciadores. O backend
  // hasheia o valor literal sem trim no `UserPasswordHasher`.
  const password = state.password;
  const identity = state.identity.trim();
  const clientId = state.clientId.trim();

  if (name.length === 0) {
    errors.name = 'Nome é obrigatório.';
  } else if (name.length > NAME_MAX) {
    errors.name = `Nome deve ter no máximo ${NAME_MAX} caracteres.`;
  }

  if (email.length === 0) {
    errors.email = 'E-mail é obrigatório.';
  } else if (email.length > EMAIL_MAX) {
    errors.email = `E-mail deve ter no máximo ${EMAIL_MAX} caracteres.`;
  } else if (!isValidEmailSyntax(email)) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (password.length === 0) {
    errors.password = 'Senha é obrigatória.';
  } else if (password.length < PASSWORD_MIN) {
    errors.password = `Senha deve ter ao menos ${PASSWORD_MIN} caracteres.`;
  } else if (password.length > PASSWORD_MAX) {
    errors.password = `Senha deve ter no máximo ${PASSWORD_MAX} caracteres.`;
  }

  if (identity.length === 0) {
    errors.identity = 'Identity é obrigatório.';
  } else if (!isIntegerString(identity)) {
    errors.identity = 'Identity deve ser um número inteiro.';
  }

  if (clientId.length > 0 && !UUID_REGEX.test(clientId)) {
    errors.clientId = 'ClientId deve ser um UUID válido.';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Normaliza o nome de campo do backend (PascalCase) para o nome usado
 * no estado do form (camelCase). Mantém a função interna estática
 * porque a lista é fechada (5 campos do contrato — `active` nunca
 * recebe erro inline).
 *
 * O backend manda `Name`/`Email`/`Password`/`Identity`/`ClientId`.
 */
function normalizeUserFieldName(serverField: string): keyof UserFieldErrors | null {
  const lower = serverField.toLowerCase();
  if (lower === 'name') return 'name';
  if (lower === 'email') return 'email';
  if (lower === 'password') return 'password';
  if (lower === 'identity') return 'identity';
  if (lower === 'clientid') return 'clientId';
  return null;
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET (`{ errors: { Name: ['msg'], ... } }`). Tolerante: se o
 * payload não bate com o shape esperado, devolve `null` para que o
 * caller caia no fallback genérico.
 *
 * Espelha `extractSystemValidationErrors` de `systemFormShared.ts`,
 * mas com a lista de campos do recurso "users".
 */
export function extractUserValidationErrors(details: unknown): UserFieldErrors | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const errors = (details as Record<string, unknown>).errors;
  if (!errors || typeof errors !== 'object') {
    return null;
  }
  const result: UserFieldErrors = {};
  for (const [serverField, raw] of Object.entries(errors)) {
    const field = normalizeUserFieldName(serverField);
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
export type UserSubmitDecision =
  | { kind: 'field-errors'; errors: UserFieldErrors }
  | { kind: 'submit-error'; message: string };

/**
 * Decide o tratamento de uma resposta 400 do backend para o form de
 * user:
 *
 * - Se o payload bate com `ValidationProblemDetails` e o backend
 *   identificou ao menos um campo, devolve `field-errors` com as
 *   mensagens mapeadas → caller exibe inline.
 * - Caso contrário (ex.: `{ message: "ClientId informado não existe."
 *   }`), devolve `submit-error` com a mensagem do backend → caller
 *   exibe `Alert` no topo do form.
 *
 * Centralizar essa decisão evita o bloco `if (validation) { ... } else
 * { setSubmitError(...) }` que duplicaria entre `NewUserModal` e o
 * futuro `EditUserModal` (lição PR #123/#127).
 */
export function decideUserBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): UserSubmitDecision {
  const validation = extractUserValidationErrors(details);
  if (validation) {
    return { kind: 'field-errors', errors: validation };
  }
  return { kind: 'submit-error', message: fallbackMessage };
}

/**
 * Copy textual usado por `classifyUserSubmitError` para diferenciar
 * create de edit (e mensagens específicas do recurso) sem duplicar a
 * lógica de classificação. Cada modal injeta sua versão (`'um
 * usuário'` vs `'outro usuário'`, `'criar'` vs `'atualizar'`).
 *
 * Estrutural: alias de `ApiSubmitErrorCopy` (helper genérico em
 * `shared/forms`). Mantemos o nome local para preservar imports
 * existentes (lição PR #134 — extrair sem quebrar callsites).
 */
export type UserSubmitErrorCopy = ApiSubmitErrorCopy;

/**
 * Resultado da classificação de um erro lançado por `createUser` ou
 * `updateUser` (futuro). O caller usa o `kind` num `switch` curto
 * para chamar o side-effect correto (set field error, applyBadRequest,
 * toast, etc.).
 *
 * Estrutural: alias de `ApiSubmitErrorAction<keyof UserFieldErrors>`.
 * A lógica vive em `shared/forms/classifySubmitError.ts` — centralizada
 * entre todos os recursos para eliminar a duplicação Sonar (lição PR
 * #134 — bloco de 26 linhas idênticas detectado no PR de routes).
 */
export type UserSubmitErrorAction = ApiSubmitErrorAction<keyof UserFieldErrors>;

/**
 * Classifica um erro lançado por `createUser`/`updateUser` em uma
 * `UserSubmitErrorAction` discriminada. Delegação de uma linha para o
 * helper genérico — preserva a assinatura pública usada pelos modals
 * de user e pelos testes unitários.
 *
 * - `409` → `conflict` no campo `email` com mensagem do backend (ou
 *   `copy.conflictDefault`). Caller exibe inline.
 * - `400` → `bad-request` com `details` cru. Caller chama
 *   `applyBadRequest` que decide entre erros por campo (mapeáveis de
 *   `ValidationProblemDetails`) e `Alert` no topo (caso `ClientId
 *   informado não existe.`, sem `details.errors`).
 * - `404` → `not-found` (relevante só no futuro `EditUserModal`).
 * - `401`/`403` → `toast` vermelho.
 * - Outros → `unhandled` com a copy genérica.
 *
 * O `conflictField` é fixo em `'email'` — campo único de unicidade do
 * contrato `CreateUserRequest`/`UpdateUserRequest` (`UX_Users_Email`
 * no backend é único globalmente).
 */
export function classifyUserSubmitError(
  error: unknown,
  copy: UserSubmitErrorCopy,
): UserSubmitErrorAction {
  return classifyApiSubmitError<keyof UserFieldErrors>(error, copy, 'email');
}
