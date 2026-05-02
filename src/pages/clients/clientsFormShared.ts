import {
  classifyApiSubmitError,
  extractValidationErrorsByField,
  type ApiSubmitErrorAction,
  type ApiSubmitErrorCopy,
} from '../../shared/forms';

import type { ClientDto, ClientType } from '../../shared/api';

/**
 * Helpers compartilhados pelos formulários de criação (Issue #74) e,
 * futuramente, edição (Issue #75) e gerenciamento de contatos (Issues
 * #146/#147) de clientes.
 *
 * **Estratégia (lição PR #128):** projetar este módulo desde o primeiro
 * PR do recurso (#74) com tipos/constantes/validação/classificação
 * compartilhados — ao invés de esperar o `EditClientModal` (#75) e
 * refatorar. Os modals futuros consomem o mesmo `validateClientForm`/
 * `extractClientValidationErrors`/`classifyClientSubmitError`,
 * eliminando duplicação Sonar entre create/edit do mesmo recurso.
 *
 * **Limites (espelham o backend `ClientsController.CreateClientRequest`):**
 *
 * - `Type` ∈ {`PF`, `PJ`} — discriminator imutável após criação.
 * - `Cpf` — exatamente 11 dígitos (apenas dígitos válidos pelo
 *   algoritmo `IsValidCpf` do backend).
 * - `FullName` — obrigatório PF; máx. 140 chars.
 * - `Cnpj` — exatamente 14 dígitos (apenas dígitos válidos pelo
 *   algoritmo `IsValidCnpj` do backend).
 * - `CorporateName` — obrigatório PJ; máx. 180 chars.
 *
 * Mantemos a lógica em TS puro (sem React) para que os testes
 * unitários consumam diretamente sem provider/render.
 */

/* ─── Constantes do contrato (espelham o backend) ────────── */

/** Tamanho exato (em dígitos) do CPF — espelha `MaxLength(11)` no backend. */
export const CPF_LENGTH = 11;

/** Tamanho exato (em dígitos) do CNPJ — espelha `MaxLength(14)` no backend. */
export const CNPJ_LENGTH = 14;

/** Tamanho máximo de `FullName` — espelha `MaxLength(140)` no backend. */
export const FULL_NAME_MAX = 140;

/** Tamanho máximo de `CorporateName` — espelha `MaxLength(180)` no backend. */
export const CORPORATE_NAME_MAX = 180;

/* ─── Tipos públicos ─────────────────────────────────────── */

/**
 * Estado controlado dos campos do form de cliente. Usamos `string`
 * em todos os campos para que o React lide com inputs vazios sem
 * `null`/`undefined`. O `type` é mantido como string para que
 * `<Select>`/`<Radio>` funcione com `value` controlado; a união
 * `ClientType` é validada no submit/parse (não no estado controlado).
 *
 * Os 4 campos PF/PJ coexistem no estado para preservar o que o
 * usuário digitou ao alternar entre tipos — UX comum em forms
 * condicionais. O submit envia apenas o subset correspondente ao
 * tipo selecionado (`buildClientMutationBody` em `clients.ts`).
 */
export interface ClientFormState {
  type: ClientType;
  cpf: string;
  fullName: string;
  cnpj: string;
  corporateName: string;
}

/**
 * Mensagens de erro inline por campo. Cada chave é opcional —
 * `undefined` indica "campo válido" (ou ainda não validado). O
 * campo `type` quase nunca tem erro (o `<Select>` só emite valores
 * válidos), mas mantemos a chave para tolerar o caso de o backend
 * rejeitar o discriminador (ex.: 400 com `Type` em `errors`).
 */
export interface ClientFieldErrors {
  type?: string;
  cpf?: string;
  fullName?: string;
  cnpj?: string;
  corporateName?: string;
}

/** Estado inicial reutilizado pelo modal de criação. */
export const INITIAL_CLIENT_FORM_STATE: ClientFormState = {
  type: 'PF',
  cpf: '',
  fullName: '',
  cnpj: '',
  corporateName: '',
};

/**
 * Constrói o estado inicial do form de edição (Issue #75) a partir
 * de um `ClientDto` já carregado pelo backend. Cada campo tem
 * fallback para string vazia para que o input controlado nunca
 * receba `null`/`undefined` — o backend devolve `null` nos campos
 * do tipo oposto (PF → `cnpj`/`corporateName` `null`; PJ inverso),
 * e o React proíbe inputs alternarem entre controlado e
 * descontrolado.
 *
 * Mantemos os campos do tipo oposto como string vazia para que, se
 * o usuário trocar para o tipo oposto (cenário improvável porque o
 * `<Select>` fica disabled em modo edit), o estado já esteja
 * inicializado. Defesa em profundidade — o backend rejeita a troca
 * com 400, mas a UI não quebra.
 *
 * Espelha `stateFromUser` em `EditUserModal.tsx`. Mantido em
 * `clientsFormShared.ts` em vez de inline na `ClientDataTab` para
 * centralizar a lógica de mapeamento DTO → form e permitir reuso
 * pelas próximas sub-issues (#146/#147 — emails/telefones podem
 * precisar do mesmo bridge).
 */
export function stateFromClient(client: ClientDto): ClientFormState {
  return {
    type: client.type,
    cpf: client.cpf ?? '',
    fullName: client.fullName ?? '',
    cnpj: client.cnpj ?? '',
    corporateName: client.corporateName ?? '',
  };
}

/* ─── Validação de documento (espelha o backend) ─────────── */

/**
 * Extrai apenas os dígitos da string. Espelha o `NormalizeDigits`
 * do backend (`Where(char.IsDigit)`). Usado tanto na validação
 * client-side (para checar se 11/14 dígitos válidos foram
 * informados) quanto antes do submit (para enviar payload
 * normalizado).
 */
export function digitsOnly(value: string): string {
  let result = '';
  for (const char of value) {
    if (char >= '0' && char <= '9') {
      result += char;
    }
  }
  return result;
}

/**
 * Calcula o dígito verificador de uma string numérica usando peso
 * inicial `startWeight` decrescente (algoritmo do CPF).
 *
 * Espelha `CheckDigit(string input, int startWeight)` do
 * `ClientsController` — qualquer divergência aqui faria a UI
 * aceitar CPF que o backend rejeitaria com 400 ("CPF inválido para
 * cliente PF.").
 */
function checkDigitForWeightSequence(input: string, startWeight: number): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += (input.charCodeAt(i) - '0'.charCodeAt(0)) * (startWeight - i);
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

/**
 * Calcula o dígito verificador de uma string numérica usando array
 * de pesos arbitrário (algoritmo do CNPJ).
 *
 * Espelha `CheckDigit(string input, int[] weights)` do
 * `ClientsController`.
 */
function checkDigitForWeights(input: string, weights: ReadonlyArray<number>): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += (input.charCodeAt(i) - '0'.charCodeAt(0)) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

/**
 * Valida CPF (11 dígitos, sem caracteres iguais, dígitos verificadores
 * corretos). Espelha `IsValidCpf` em
 * `AuthService.Controllers.Clients.ClientsController` —
 * implementação fiel para que UI e backend convirjam no mesmo
 * conjunto de strings aceitas.
 *
 * Recebe `digits` já normalizado (apenas dígitos). Caller deve
 * passar a saída de `digitsOnly(formState.cpf)`.
 */
export function isValidCpf(digits: string): boolean {
  if (digits.length !== CPF_LENGTH) {
    return false;
  }
  // Rejeita CPF com todos os dígitos iguais ('11111111111', etc.).
  // Espelha `cpf.Distinct().Count() == 1` do backend.
  if (new Set(digits).size === 1) {
    return false;
  }
  const d1 = checkDigitForWeightSequence(digits.slice(0, 9), 10);
  const d2 = checkDigitForWeightSequence(digits.slice(0, 9) + d1, 11);
  return digits.charCodeAt(9) - '0'.charCodeAt(0) === d1 && digits.charCodeAt(10) - '0'.charCodeAt(0) === d2;
}

/** Pesos do 1º DV do CNPJ (espelha `w1` no backend). */
const CNPJ_WEIGHTS_1: ReadonlyArray<number> = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Pesos do 2º DV do CNPJ (espelha `w2` no backend). */
const CNPJ_WEIGHTS_2: ReadonlyArray<number> = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Valida CNPJ (14 dígitos, sem caracteres iguais, dígitos
 * verificadores corretos). Espelha `IsValidCnpj` em
 * `AuthService.Controllers.Clients.ClientsController`.
 */
export function isValidCnpj(digits: string): boolean {
  if (digits.length !== CNPJ_LENGTH) {
    return false;
  }
  if (new Set(digits).size === 1) {
    return false;
  }
  const d1 = checkDigitForWeights(digits.slice(0, 12), CNPJ_WEIGHTS_1);
  const d2 = checkDigitForWeights(digits.slice(0, 12) + d1, CNPJ_WEIGHTS_2);
  return digits.charCodeAt(12) - '0'.charCodeAt(0) === d1 && digits.charCodeAt(13) - '0'.charCodeAt(0) === d2;
}

/* ─── Validação client-side ──────────────────────────────── */

/**
 * Valida o estado do form contra as regras do backend
 * (`ValidatePfClient`/`ValidatePjClient`). Retorna `null` quando
 * válido, ou um objeto com mensagens por campo. As mensagens são
 * idênticas às do backend para que UI e backend sejam
 * indistinguíveis para o usuário.
 *
 * Validação por tipo:
 *
 * - `type === 'PF'`:
 *   - `cpf` obrigatório e válido (CPF com DVs corretos).
 *   - `fullName` obrigatório (não-whitespace), máx. 140 chars.
 * - `type === 'PJ'`:
 *   - `cnpj` obrigatório e válido (CNPJ com DVs corretos).
 *   - `corporateName` obrigatório (não-whitespace), máx. 180 chars.
 *
 * Os campos do tipo oposto não são validados (o submit os ignora
 * via `buildClientMutationBody`); manter o estado deles preserva
 * o que o usuário digitou caso troque de tipo e volte.
 */
export function validateClientForm(state: ClientFormState): ClientFieldErrors | null {
  const errors: ClientFieldErrors = {};

  if (state.type === 'PF') {
    validatePfFields(state, errors);
  } else {
    validatePjFields(state, errors);
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Valida os campos de PF inline. Extraído do `validateClientForm`
 * para manter Cognitive Complexity < 15 por função (lição PR #128
 * — Sonar reprovaria função com if/else aninhado em cada caminho).
 */
function validatePfFields(state: ClientFormState, errors: ClientFieldErrors): void {
  const cpfDigits = digitsOnly(state.cpf);
  if (cpfDigits.length === 0) {
    errors.cpf = 'CPF é obrigatório.';
  } else if (!isValidCpf(cpfDigits)) {
    errors.cpf = 'CPF inválido para cliente PF.';
  }
  const fullName = state.fullName.trim();
  if (fullName.length === 0) {
    errors.fullName = 'FullName é obrigatório para cliente PF.';
  } else if (fullName.length > FULL_NAME_MAX) {
    errors.fullName = `FullName deve ter no máximo ${FULL_NAME_MAX} caracteres.`;
  }
}

/**
 * Valida os campos de PJ inline. Extraído pelo mesmo motivo de
 * `validatePfFields`.
 */
function validatePjFields(state: ClientFormState, errors: ClientFieldErrors): void {
  const cnpjDigits = digitsOnly(state.cnpj);
  if (cnpjDigits.length === 0) {
    errors.cnpj = 'CNPJ é obrigatório.';
  } else if (!isValidCnpj(cnpjDigits)) {
    errors.cnpj = 'CNPJ inválido para cliente PJ.';
  }
  const corporateName = state.corporateName.trim();
  if (corporateName.length === 0) {
    errors.corporateName = 'CorporateName é obrigatório para cliente PJ.';
  } else if (corporateName.length > CORPORATE_NAME_MAX) {
    errors.corporateName = `CorporateName deve ter no máximo ${CORPORATE_NAME_MAX} caracteres.`;
  }
}

/* ─── Parsing de erros do backend ────────────────────────── */

/**
 * Normaliza o nome de campo do backend (PascalCase) para o nome
 * usado no estado do form (camelCase). Lista fechada nos 5 campos
 * do form — qualquer outra chave é ignorada para que o caller não
 * exiba inline um erro que o usuário não controla; tais erros caem
 * no fallback genérico (`submitError`).
 */
function normalizeClientFieldName(serverField: string): keyof ClientFieldErrors | null {
  const lower = serverField.toLowerCase();
  if (lower === 'type') return 'type';
  if (lower === 'cpf') return 'cpf';
  if (lower === 'fullname') return 'fullName';
  if (lower === 'cnpj') return 'cnpj';
  if (lower === 'corporatename') return 'corporateName';
  return null;
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails`
 * do ASP.NET (`{ errors: { Cpf: ['msg'], ... } }`). Tolerante: se
 * o payload não bate com o shape esperado, devolve `null` para que
 * o caller caia no fallback genérico. Delega para
 * `extractValidationErrorsByField` (helper genérico em
 * `src/shared/forms/`) — preserva a tipagem estreita de
 * `ClientFieldErrors` injetando o `normalizeClientFieldName`.
 *
 * Lição PR #134/#135: o iterador `for-of` sobre `Object.entries(errors)`
 * era idêntico entre `routeFormShared`/`clientsFormShared` (jscpd
 * detectou no PR #74). Centralizar elimina a duplicação preservando
 * o tipo de cada recurso.
 */
export function extractClientValidationErrors(details: unknown): ClientFieldErrors | null {
  return extractValidationErrorsByField<ClientFieldErrors>(details, normalizeClientFieldName);
}

/**
 * Resultado do mapeamento de uma resposta 400 do backend para o
 * form de cliente. O caller usa essa decisão para chamar
 * `setFieldErrors` (campos mapeados) ou `setSubmitError`
 * (mensagem genérica).
 */
export type ClientSubmitDecision =
  | { kind: 'field-errors'; errors: ClientFieldErrors }
  | { kind: 'submit-error'; message: string };

/**
 * Decide o tratamento de uma resposta 400 do backend.
 *
 * - Se o payload bate com `ValidationProblemDetails` e o backend
 *   identificou ao menos um campo, devolve `field-errors` com as
 *   mensagens mapeadas.
 * - Caso contrário, devolve `submit-error` com a mensagem do
 *   backend (caller exibe `Alert` no topo do form).
 */
export function decideClientBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): ClientSubmitDecision {
  const validation = extractClientValidationErrors(details);
  if (validation) {
    return { kind: 'field-errors', errors: validation };
  }
  return { kind: 'submit-error', message: fallbackMessage };
}

/* ─── Classificação de erros de submit ──────────────────── */

/**
 * Copy textual injetada por `NewClientModal` (e, futuramente,
 * `EditClientModal`) em `classifyClientSubmitError`. Alias do
 * helper genérico em `shared/forms`.
 */
export type ClientSubmitErrorCopy = ApiSubmitErrorCopy;

/**
 * Resultado da classificação de um erro lançado por `createClient`
 * ou `updateClient` (futuro). Genérico em `keyof ClientFieldErrors`
 * para preservar a inferência do nome de campo do conflito (`cpf`
 * ou `cnpj`).
 */
export type ClientSubmitErrorAction = ApiSubmitErrorAction<keyof ClientFieldErrors>;

/**
 * Classifica um erro lançado por `createClient` (e futuro
 * `updateClient`) numa `ClientSubmitErrorAction`. Diferente dos
 * outros recursos (sistemas/rotas/roles têm `code` como único
 * campo de unicidade), clientes têm dois campos únicos globais:
 * `cpf` (PF) e `cnpj` (PJ). O caller informa qual é o
 * `conflictField` em runtime, baseado no `state.type`:
 *
 * - PF → `'cpf'`
 * - PJ → `'cnpj'`
 *
 * Manter o `conflictField` como argumento (não fixo no helper)
 * preserva o desenho genérico do `classifyApiSubmitError` e
 * permite que o `EditClientModal` (#75) reuse com a mesma
 * estratégia.
 */
export function classifyClientSubmitError(
  error: unknown,
  copy: ClientSubmitErrorCopy,
  conflictField: keyof ClientFieldErrors,
): ClientSubmitErrorAction {
  return classifyApiSubmitError<keyof ClientFieldErrors>(error, copy, conflictField);
}
