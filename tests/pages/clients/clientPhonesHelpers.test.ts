import { describe, expect, it } from 'vitest';

import {
  classifyAddPhoneError,
  classifyRemovePhoneError,
  PHONE_E164_REGEX,
  PHONE_MAX_LENGTH,
  validatePhoneInput,
  type PhoneErrorCopy,
} from '@/pages/clients/clientPhonesHelpers';

/**
 * Suíte do `clientPhonesHelpers` (Issue #147). Cobre validação E.164
 * client-side e classificação de erros para `add`/`remove` de telefones
 * (mobile ou landline — os helpers são agnósticos quanto ao tipo).
 *
 * Estratégia: TS puro, sem React. Cobertura focada em comportamento —
 * cada caso retorna a ação discriminada esperada para um `error: unknown`.
 */

const ADD_COPY: PhoneErrorCopy = {
  genericFallback: 'Não foi possível adicionar.',
  forbiddenTitle: 'Falha ao adicionar',
  notFoundMessage: 'Cliente removido.',
};

const REMOVE_COPY: PhoneErrorCopy = {
  genericFallback: 'Não foi possível remover.',
  forbiddenTitle: 'Falha ao remover',
  notFoundMessage: 'Telefone já removido.',
};

describe('PHONE_E164_REGEX', () => {
  // A regex `^\+[1-9]\d{11,14}$` exige `+`, seguido de 1 dígito não-zero
  // e 11–14 dígitos adicionais — totalizando 12–15 dígitos após o `+`,
  // ou 13–16 caracteres no total. Os casos abaixo são pinos calibrados
  // contra esse contrato (idêntico ao `ClientsController.PhoneRegex`).
  it.each([
    ['+5518981789845', true, 'BR — celular SP com 13 dígitos após DDI (total 13 chars)'],
    ['+551832345678', true, 'BR — fixo SP com 12 dígitos após + (limite inferior)'],
    ['+442083661177', true, 'UK — 12 dígitos após + (limite inferior)'],
    ['+551234567890123', true, 'limite superior — 15 dígitos após +'],
    ['18981789845', false, 'sem +'],
    ['+0123456789012', false, 'segundo char é 0'],
    ['+14155552671', false, 'curto demais — 11 dígitos após + (mínimo é 12)'],
    ['+1234567890', false, 'curto demais — 10 dígitos após +'],
    ['+12345678901234567', false, 'longo demais — 17 dígitos após +'],
    ['+abc12345678', false, 'contém letras'],
    ['', false, 'vazio'],
    ['+ 551832345678', false, 'espaço entre + e dígitos'],
  ])('regex aceita %s = %s (%s)', (input, expected) => {
    expect(PHONE_E164_REGEX.test(input)).toBe(expected);
  });
});

describe('validatePhoneInput', () => {
  it.each([
    ['+5518981789845', null, 'BR celular válido (13 dígitos após +)'],
    ['+551832345678', null, 'BR fixo válido (12 dígitos após +, limite inferior)'],
    ['  +5518981789845  ', null, 'trima antes de validar'],
  ])('aceita "%s" e devolve %s (%s)', (input, expected) => {
    expect(validatePhoneInput(input)).toBe(expected);
  });

  it('rejeita string vazia com mensagem de obrigatoriedade', () => {
    expect(validatePhoneInput('')).toBe('Número é obrigatório.');
  });

  it('rejeita whitespace puro com mensagem de obrigatoriedade (após trim)', () => {
    expect(validatePhoneInput('   ')).toBe('Número é obrigatório.');
  });

  it('rejeita formato inválido com orientação do exemplo E.164', () => {
    expect(validatePhoneInput('18981789845')).toBe(
      'Use o formato internacional com DDI e DDD, ex.: +5518981789845.',
    );
  });

  it('rejeita string maior que PHONE_MAX_LENGTH com mensagem específica', () => {
    // Construir string maior que 20 chars que casaria a regex se não fosse
    // o gate de tamanho. Como a regex topa até 16 chars, qualquer string
    // de 21+ chars já cai no MaxLength antes da regex. Ainda assim
    // garantimos que o branch de tamanho dispara independente da regex
    // — basta adicionar prefixo `+` + dígitos arbitrários acima do teto.
    const tooLong = `+${'1'.repeat(PHONE_MAX_LENGTH)}`; // 21 chars total
    expect(tooLong.length).toBeGreaterThan(PHONE_MAX_LENGTH);
    expect(validatePhoneInput(tooLong)).toBe(
      `Número deve ter no máximo ${PHONE_MAX_LENGTH} caracteres.`,
    );
  });
});

describe('classifyAddPhoneError', () => {
  it('classifica erro não-HTTP como unhandled', () => {
    const error = { kind: 'network' as const, message: 'Falha de conexão.' };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      message: 'Não foi possível adicionar.',
      title: 'Falha ao adicionar',
    });
  });

  it('classifica error não-objeto (string solta) como unhandled', () => {
    const action = classifyAddPhoneError('boom', ADD_COPY);
    expect(action.kind).toBe('unhandled');
  });

  it('classifica 404 como not-found com cópia específica', () => {
    const error = {
      kind: 'http' as const,
      status: 404,
      message: 'Cliente não encontrado.',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'not-found',
      message: 'Cliente removido.',
      title: 'Falha ao adicionar',
    });
  });

  it.each([
    [401, 'Sessão expirada. Faça login novamente.'],
    [403, 'Você não tem permissão para esta ação.'],
  ])('classifica %s como toast com mensagem do backend', (status, message) => {
    const error = { kind: 'http' as const, status, message };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message,
      title: 'Falha ao adicionar',
    });
  });

  it('cai no genericFallback quando 401/403 não tem mensagem', () => {
    const error = { kind: 'http' as const, status: 403, message: '' };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message: 'Não foi possível adicionar.',
      title: 'Falha ao adicionar',
    });
  });

  it('classifica 400 com "limite" como limit-reached (mobile)', () => {
    const error = {
      kind: 'http' as const,
      status: 400,
      message: 'Limite de 3 celulares por cliente.',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'limit-reached',
      message: 'Limite de 3 celulares por cliente.',
    });
  });

  it('classifica 400 com "limite" como limit-reached (landline)', () => {
    const error = {
      kind: 'http' as const,
      status: 400,
      message: 'Limite de 3 telefones por cliente.',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action.kind).toBe('limit-reached');
  });

  it('classifica 400 sem "limite" (formato inválido) como inline', () => {
    const error = {
      kind: 'http' as const,
      status: 400,
      message: 'Telefone inválido. Use o formato internacional com DDI e DDD, ex.: +5518981789845.',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'inline',
      message:
        'Telefone inválido. Use o formato internacional com DDI e DDD, ex.: +5518981789845.',
    });
  });

  it('classifica 409 como inline com mensagem do backend', () => {
    const error = {
      kind: 'http' as const,
      status: 409,
      message: 'Contato já cadastrado para este cliente.',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'inline',
      message: 'Contato já cadastrado para este cliente.',
    });
  });

  it('cai no genericFallback quando 400 inline não tem mensagem do backend', () => {
    const error = { kind: 'http' as const, status: 400, message: '' };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action).toEqual({
      kind: 'inline',
      message: 'Não foi possível adicionar.',
    });
  });

  it('classifica status HTTP inesperado (500) como unhandled', () => {
    const error = {
      kind: 'http' as const,
      status: 500,
      message: 'Internal Server Error',
    };
    const action = classifyAddPhoneError(error, ADD_COPY);
    expect(action.kind).toBe('unhandled');
  });
});

describe('classifyRemovePhoneError', () => {
  it('classifica erro não-HTTP como unhandled', () => {
    const error = { kind: 'network' as const, message: 'Sem conexão.' };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      message: 'Não foi possível remover.',
      title: 'Falha ao remover',
    });
  });

  it('classifica 404 como not-found com cópia específica', () => {
    const error = {
      kind: 'http' as const,
      status: 404,
      message: 'Contato não encontrado.',
    };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action).toEqual({
      kind: 'not-found',
      message: 'Telefone já removido.',
      title: 'Falha ao remover',
    });
  });

  it.each([
    [401, 'Sessão expirada. Faça login novamente.'],
    [403, 'Você não tem permissão para esta ação.'],
  ])('classifica %s como toast com mensagem do backend', (status, message) => {
    const error = { kind: 'http' as const, status, message };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message,
      title: 'Falha ao remover',
    });
  });

  it('cai no genericFallback quando 401/403 não tem mensagem', () => {
    const error = { kind: 'http' as const, status: 401, message: '' };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message: 'Não foi possível remover.',
      title: 'Falha ao remover',
    });
  });

  it('classifica 400 inesperado nesse endpoint como unhandled (defensivo)', () => {
    const error = {
      kind: 'http' as const,
      status: 400,
      message: 'Erro inesperado.',
    };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action.kind).toBe('unhandled');
  });

  it('classifica status HTTP desconhecido (500) como unhandled', () => {
    const error = {
      kind: 'http' as const,
      status: 500,
      message: 'Internal Server Error',
    };
    const action = classifyRemovePhoneError(error, REMOVE_COPY);
    expect(action.kind).toBe('unhandled');
  });
});
