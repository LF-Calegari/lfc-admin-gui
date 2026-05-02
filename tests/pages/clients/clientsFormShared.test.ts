import { describe, expect, it } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  classifyClientSubmitError,
  CNPJ_LENGTH,
  CORPORATE_NAME_MAX,
  CPF_LENGTH,
  decideClientBadRequestHandling,
  digitsOnly,
  extractClientValidationErrors,
  FULL_NAME_MAX,
  INITIAL_CLIENT_FORM_STATE,
  isValidCnpj,
  isValidCpf,
  validateClientForm,
} from '@/pages/clients/clientsFormShared';

/**
 * Suíte unitária do `clientsFormShared.ts` (Issue #74). Cobre:
 *
 * - `digitsOnly` — normalização para apenas dígitos.
 * - `isValidCpf`/`isValidCnpj` — algoritmo de DV (espelha o
 *   backend `IsValidCpf`/`IsValidCnpj`).
 * - `validateClientForm` — validação por tipo (PF/PJ) com mensagens
 *   idênticas às do backend.
 * - `extractClientValidationErrors` — parsing de
 *   `ValidationProblemDetails` do ASP.NET para chaves do form.
 * - `decideClientBadRequestHandling` — decisão entre erros por
 *   campo (mapeáveis) e Alert genérico.
 * - `classifyClientSubmitError` — classificação de status code +
 *   field do conflito (cpf/cnpj).
 */

describe('digitsOnly', () => {
  it('extrai apenas dígitos', () => {
    expect(digitsOnly('123.456.789-01')).toBe('12345678901');
    expect(digitsOnly('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('devolve string vazia quando não há dígitos', () => {
    expect(digitsOnly('---')).toBe('');
    expect(digitsOnly('')).toBe('');
    expect(digitsOnly('abc')).toBe('');
  });

  it('preserva ordem dos dígitos', () => {
    expect(digitsOnly('a1b2c3')).toBe('123');
  });
});

describe('isValidCpf', () => {
  it('aceita CPF válido (DVs corretos)', () => {
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('rejeita comprimento ≠ 11', () => {
    expect(isValidCpf('1234567890')).toBe(false); // 10 dígitos
    expect(isValidCpf('123456789012')).toBe(false); // 12 dígitos
    expect(isValidCpf('')).toBe(false);
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('99999999999')).toBe(false);
  });

  it('rejeita CPF com DVs incorretos', () => {
    expect(isValidCpf('12345678900')).toBe(false);
    expect(isValidCpf('52998224726')).toBe(false); // último DV inválido
  });

  it(`expõe constante CPF_LENGTH = ${CPF_LENGTH}`, () => {
    expect(CPF_LENGTH).toBe(11);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ válido (DVs corretos)', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('rejeita comprimento ≠ 14', () => {
    expect(isValidCnpj('1122233300018')).toBe(false); // 13 dígitos
    expect(isValidCnpj('112223330001811')).toBe(false); // 15 dígitos
    expect(isValidCnpj('')).toBe(false);
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('rejeita CNPJ com DVs incorretos', () => {
    expect(isValidCnpj('11222333000182')).toBe(false); // último DV inválido
    expect(isValidCnpj('12345678901234')).toBe(false);
  });

  it(`expõe constante CNPJ_LENGTH = ${CNPJ_LENGTH}`, () => {
    expect(CNPJ_LENGTH).toBe(14);
  });
});

describe('validateClientForm — PF', () => {
  it('aceita PF válido (CPF e FullName)', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana Cliente',
      cnpj: '',
      corporateName: '',
    });
    expect(result).toBeNull();
  });

  it('aceita PF com CPF formatado (digitsOnly aplica antes da validação)', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '529.982.247-25',
      fullName: 'Ana',
      cnpj: '',
      corporateName: '',
    });
    expect(result).toBeNull();
  });

  it('rejeita CPF vazio com mensagem do backend', () => {
    const result = validateClientForm({
      ...INITIAL_CLIENT_FORM_STATE,
      type: 'PF',
      fullName: 'Ana',
    });
    expect(result?.cpf).toBe('CPF é obrigatório.');
  });

  it('rejeita CPF inválido com mensagem do backend', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '11111111111',
      fullName: 'Ana',
      cnpj: '',
      corporateName: '',
    });
    expect(result?.cpf).toBe('CPF inválido para cliente PF.');
  });

  it('rejeita FullName vazio com mensagem do backend', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '52998224725',
      fullName: '',
      cnpj: '',
      corporateName: '',
    });
    expect(result?.fullName).toBe('FullName é obrigatório para cliente PF.');
  });

  it('rejeita FullName apenas whitespace', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '52998224725',
      fullName: '   ',
      cnpj: '',
      corporateName: '',
    });
    expect(result?.fullName).toBe('FullName é obrigatório para cliente PF.');
  });

  it(`rejeita FullName acima de ${FULL_NAME_MAX} caracteres`, () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '52998224725',
      fullName: 'a'.repeat(FULL_NAME_MAX + 1),
      cnpj: '',
      corporateName: '',
    });
    expect(result?.fullName).toContain(`máximo ${FULL_NAME_MAX}`);
  });

  it('NÃO valida campos de PJ quando type=PF (preserva o que usuário digitou)', () => {
    const result = validateClientForm({
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana',
      cnpj: 'lixo',
      corporateName: 'lixo',
    });
    expect(result).toBeNull();
  });
});

describe('validateClientForm — PJ', () => {
  it('aceita PJ válido (CNPJ e CorporateName)', () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: '',
      fullName: '',
      cnpj: '11222333000181',
      corporateName: 'Acme Indústria S/A',
    });
    expect(result).toBeNull();
  });

  it('rejeita CNPJ vazio', () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: '',
      fullName: '',
      cnpj: '',
      corporateName: 'Acme',
    });
    expect(result?.cnpj).toBe('CNPJ é obrigatório.');
  });

  it('rejeita CNPJ inválido', () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: '',
      fullName: '',
      cnpj: '11111111111111',
      corporateName: 'Acme',
    });
    expect(result?.cnpj).toBe('CNPJ inválido para cliente PJ.');
  });

  it('rejeita CorporateName vazio', () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: '',
      fullName: '',
      cnpj: '11222333000181',
      corporateName: '',
    });
    expect(result?.corporateName).toBe('CorporateName é obrigatório para cliente PJ.');
  });

  it(`rejeita CorporateName acima de ${CORPORATE_NAME_MAX} caracteres`, () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: '',
      fullName: '',
      cnpj: '11222333000181',
      corporateName: 'a'.repeat(CORPORATE_NAME_MAX + 1),
    });
    expect(result?.corporateName).toContain(`máximo ${CORPORATE_NAME_MAX}`);
  });

  it('NÃO valida campos de PF quando type=PJ', () => {
    const result = validateClientForm({
      type: 'PJ',
      cpf: 'lixo',
      fullName: 'lixo',
      cnpj: '11222333000181',
      corporateName: 'Acme',
    });
    expect(result).toBeNull();
  });
});

describe('extractClientValidationErrors', () => {
  it('mapeia chaves PascalCase → camelCase', () => {
    const result = extractClientValidationErrors({
      errors: {
        Type: ['Type deve ser PF ou PJ.'],
        Cpf: ['CPF inválido.'],
        FullName: ['FullName é obrigatório.'],
        Cnpj: ['CNPJ inválido.'],
        CorporateName: ['CorporateName é obrigatório.'],
      },
    });
    expect(result).toEqual({
      type: 'Type deve ser PF ou PJ.',
      cpf: 'CPF inválido.',
      fullName: 'FullName é obrigatório.',
      cnpj: 'CNPJ inválido.',
      corporateName: 'CorporateName é obrigatório.',
    });
  });

  it('aceita string solta (não-array)', () => {
    const result = extractClientValidationErrors({
      errors: { Cpf: 'erro literal' },
    });
    expect(result).toEqual({ cpf: 'erro literal' });
  });

  it('ignora chaves desconhecidas', () => {
    const result = extractClientValidationErrors({
      errors: {
        Cpf: ['ok'],
        UnknownField: ['lixo'],
      },
    });
    expect(result).toEqual({ cpf: 'ok' });
  });

  it('retorna null para payloads não-mapeáveis', () => {
    expect(extractClientValidationErrors(null)).toBeNull();
    expect(extractClientValidationErrors('string')).toBeNull();
    expect(extractClientValidationErrors({ noErrors: true })).toBeNull();
    expect(extractClientValidationErrors({ errors: null })).toBeNull();
    expect(extractClientValidationErrors({ errors: {} })).toBeNull();
  });
});

describe('decideClientBadRequestHandling', () => {
  it('devolve field-errors quando mapeável', () => {
    const result = decideClientBadRequestHandling(
      {
        errors: {
          Cpf: ['CPF inválido para cliente PF.'],
        },
      },
      'fallback',
    );
    expect(result).toEqual({
      kind: 'field-errors',
      errors: { cpf: 'CPF inválido para cliente PF.' },
    });
  });

  it('devolve submit-error quando payload não-mapeável', () => {
    const result = decideClientBadRequestHandling(null, 'mensagem fallback');
    expect(result).toEqual({
      kind: 'submit-error',
      message: 'mensagem fallback',
    });
  });
});

describe('classifyClientSubmitError', () => {
  const COPY = {
    conflictDefault: 'Já existe cliente com este documento.',
    forbiddenTitle: 'Falha ao criar cliente',
    genericFallback: 'Não foi possível criar o cliente. Tente novamente.',
  };

  it('classifica 409 com conflictField=cpf (PF)', () => {
    const error: ApiError = {
      kind: 'http',
      status: 409,
      message: 'Já existe cliente com este CPF.',
    };
    const action = classifyClientSubmitError(error, COPY, 'cpf');
    expect(action.kind).toBe('conflict');
    if (action.kind === 'conflict') {
      expect(action.field).toBe('cpf');
      expect(action.message).toBe('Já existe cliente com este CPF.');
    }
  });

  it('classifica 409 com conflictField=cnpj (PJ)', () => {
    const error: ApiError = {
      kind: 'http',
      status: 409,
      message: 'Já existe cliente com este CNPJ.',
    };
    const action = classifyClientSubmitError(error, COPY, 'cnpj');
    expect(action.kind).toBe('conflict');
    if (action.kind === 'conflict') {
      expect(action.field).toBe('cnpj');
    }
  });

  it('classifica 400 como bad-request', () => {
    const error: ApiError = {
      kind: 'http',
      status: 400,
      message: 'Erro de validação.',
      details: { errors: { Cpf: ['x'] } },
    };
    const action = classifyClientSubmitError(error, COPY, 'cpf');
    expect(action.kind).toBe('bad-request');
  });

  it('classifica 401 como toast', () => {
    const error: ApiError = {
      kind: 'http',
      status: 401,
      message: 'Sessão expirada.',
    };
    const action = classifyClientSubmitError(error, COPY, 'cpf');
    expect(action.kind).toBe('toast');
  });

  it('classifica erro de rede como unhandled', () => {
    const action = classifyClientSubmitError(
      { kind: 'network', message: 'falha' },
      COPY,
      'cpf',
    );
    expect(action.kind).toBe('unhandled');
  });
});
