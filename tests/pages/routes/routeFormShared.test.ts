import { describe, expect, it } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  classifyRouteSubmitError,
  decideRouteBadRequestHandling,
  extractRouteValidationErrors,
  validateRouteForm,
  type RouteFormState,
  type RouteSubmitErrorCopy,
} from '@/pages/routes/routeFormShared';

/**
 * Testes unitários puros do módulo `routeFormShared.ts` (Issue #63).
 *
 * Validar as funções puras isoladamente garante que as tabelas de
 * validação/classificação estão corretas independente do contexto
 * React — os testes de integração (`RoutesPage.create.test.tsx`)
 * cobrem o lado do side-effect (setState/toast). Isolar a lógica em
 * TS puro sem provider/render é o padrão recomendado pela lição PR
 * #128 ("separar a decisão do efeito").
 *
 * Cobrimos as 4 funções públicas exportadas:
 *
 * - `validateRouteForm` — regras Required/MaxLength/non-empty
 *   token type id.
 * - `extractRouteValidationErrors` — parse de
 *   `ValidationProblemDetails` do ASP.NET com normalização de
 *   capitalização.
 * - `decideRouteBadRequestHandling` — decisão entre
 *   `field-errors` e `submit-error`.
 * - `classifyRouteSubmitError` — tabela de classificação completa
 *   (409/400/404/401/403/erros não-HTTP).
 *
 * Cobrir as 4 desde o **primeiro PR do recurso** evita que a
 * issue de edição (#64) adicione novos casos sem testes — toda a
 * tabela de classificação já está guardada antes do segundo modal
 * existir (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 */

const VALID_STATE: RouteFormState = {
  name: 'Listar sistemas',
  code: 'AUTH_V1_SYSTEMS_LIST',
  description: 'GET /api/v1/systems',
  systemTokenTypeId: '99999999-9999-9999-9999-999999999999',
};

const SUBMIT_COPY: RouteSubmitErrorCopy = {
  conflictDefault: 'Já existe uma rota com este código.',
  forbiddenTitle: 'Falha ao criar rota',
  genericFallback: 'Não foi possível criar a rota. Tente novamente.',
};

describe('validateRouteForm', () => {
  it('retorna null quando todos os campos são válidos', () => {
    expect(validateRouteForm(VALID_STATE)).toBeNull();
  });

  it('detecta nome vazio (após trim)', () => {
    const result = validateRouteForm({ ...VALID_STATE, name: '   ' });
    expect(result).toEqual({ name: 'Nome é obrigatório.' });
  });

  it('detecta código vazio (após trim)', () => {
    const result = validateRouteForm({ ...VALID_STATE, code: '' });
    expect(result).toEqual({ code: 'Código é obrigatório.' });
  });

  it('detecta política JWT alvo não selecionada', () => {
    const result = validateRouteForm({ ...VALID_STATE, systemTokenTypeId: '' });
    expect(result).toEqual({ systemTokenTypeId: 'Selecione a política JWT alvo.' });
  });

  it('valida tamanho máximo do nome', () => {
    const result = validateRouteForm({ ...VALID_STATE, name: 'a'.repeat(81) });
    expect(result).toEqual({ name: 'Nome deve ter no máximo 80 caracteres.' });
  });

  it('valida tamanho máximo do código', () => {
    const result = validateRouteForm({ ...VALID_STATE, code: 'A'.repeat(51) });
    expect(result).toEqual({ code: 'Código deve ter no máximo 50 caracteres.' });
  });

  it('valida tamanho máximo da descrição', () => {
    const result = validateRouteForm({ ...VALID_STATE, description: 'd'.repeat(501) });
    expect(result).toEqual({ description: 'Descrição deve ter no máximo 500 caracteres.' });
  });

  it('combina múltiplos erros num único objeto', () => {
    const result = validateRouteForm({ name: '', code: '', description: '', systemTokenTypeId: '' });
    expect(result).toEqual({
      name: 'Nome é obrigatório.',
      code: 'Código é obrigatório.',
      systemTokenTypeId: 'Selecione a política JWT alvo.',
    });
  });
});

describe('extractRouteValidationErrors', () => {
  it('retorna null quando details não é objeto', () => {
    expect(extractRouteValidationErrors(null)).toBeNull();
    expect(extractRouteValidationErrors('texto')).toBeNull();
    expect(extractRouteValidationErrors(42)).toBeNull();
  });

  it('retorna null quando errors está ausente', () => {
    expect(extractRouteValidationErrors({ message: 'foo' })).toBeNull();
  });

  it('mapeia campos PascalCase do backend para camelCase do form', () => {
    const result = extractRouteValidationErrors({
      errors: {
        Name: ['Nome obrigatório.'],
        Code: ['Code obrigatório.'],
        Description: ['Description longa.'],
        SystemTokenTypeId: ['ID inválido.'],
      },
    });
    expect(result).toEqual({
      name: 'Nome obrigatório.',
      code: 'Code obrigatório.',
      description: 'Description longa.',
      systemTokenTypeId: 'ID inválido.',
    });
  });

  it('aceita string única além de array de strings', () => {
    const result = extractRouteValidationErrors({
      errors: { Name: 'msg solta' },
    });
    expect(result).toEqual({ name: 'msg solta' });
  });

  it('ignora campos desconhecidos (ex.: SystemId, que não vai inline)', () => {
    const result = extractRouteValidationErrors({
      errors: {
        Name: ['msg'],
        SystemId: ['inválido'],
      },
    });
    expect(result).toEqual({ name: 'msg' });
  });

  it('retorna null quando nenhum campo conhecido foi encontrado', () => {
    expect(
      extractRouteValidationErrors({ errors: { SystemId: ['inválido'] } }),
    ).toBeNull();
  });

  it('ignora arrays vazios e tipos inesperados', () => {
    const result = extractRouteValidationErrors({
      errors: { Name: [], Code: [42], Description: { foo: 'bar' } },
    });
    expect(result).toBeNull();
  });
});

describe('decideRouteBadRequestHandling', () => {
  it('decide field-errors quando há ValidationProblemDetails mapeáveis', () => {
    const result = decideRouteBadRequestHandling(
      { errors: { Name: ['obrigatório'] } },
      'fallback',
    );
    expect(result).toEqual({ kind: 'field-errors', errors: { name: 'obrigatório' } });
  });

  it('decide submit-error quando details não bate com o shape', () => {
    const result = decideRouteBadRequestHandling(undefined, 'fallback amigável');
    expect(result).toEqual({ kind: 'submit-error', message: 'fallback amigável' });
  });

  it('decide submit-error quando errors veio mas todos os campos são desconhecidos', () => {
    const result = decideRouteBadRequestHandling(
      { errors: { SystemId: ['inválido'] } },
      'fallback',
    );
    expect(result).toEqual({ kind: 'submit-error', message: 'fallback' });
  });
});

describe('classifyRouteSubmitError', () => {
  it('409 → conflict no campo code com mensagem do backend', () => {
    const error: ApiError = {
      kind: 'http',
      status: 409,
      message: 'Já existe uma route com este Code.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'conflict',
      field: 'code',
      message: 'Já existe uma route com este Code.',
    });
  });

  it('400 → bad-request com details cru e fallbackMessage', () => {
    const error: ApiError = {
      kind: 'http',
      status: 400,
      message: 'Erro de validação.',
      details: { errors: { Name: ['obrigatório'] } },
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'bad-request',
      details: { errors: { Name: ['obrigatório'] } },
      fallbackMessage: 'Erro de validação.',
    });
  });

  it('404 → not-found (caso usado pelo EditRouteModal na #64)', () => {
    const error: ApiError = {
      kind: 'http',
      status: 404,
      message: 'Não encontrada.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({ kind: 'not-found' });
  });

  it('401 → toast com mensagem do backend e título de forbidden', () => {
    const error: ApiError = {
      kind: 'http',
      status: 401,
      message: 'Sessão expirada.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'toast',
      message: 'Sessão expirada.',
      title: SUBMIT_COPY.forbiddenTitle,
    });
  });

  it('403 → toast com mensagem do backend', () => {
    const error: ApiError = {
      kind: 'http',
      status: 403,
      message: 'Sem permissão.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'toast',
      message: 'Sem permissão.',
      title: SUBMIT_COPY.forbiddenTitle,
    });
  });

  it('500 → unhandled com fallback genérico', () => {
    const error: ApiError = {
      kind: 'http',
      status: 500,
      message: 'Erro do servidor.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'unhandled',
      title: SUBMIT_COPY.forbiddenTitle,
      fallback: SUBMIT_COPY.genericFallback,
    });
  });

  it('network → unhandled com fallback genérico', () => {
    const error: ApiError = {
      kind: 'network',
      message: 'Falha de conexão.',
    };
    expect(classifyRouteSubmitError(error, SUBMIT_COPY)).toEqual({
      kind: 'unhandled',
      title: SUBMIT_COPY.forbiddenTitle,
      fallback: SUBMIT_COPY.genericFallback,
    });
  });

  it('erro arbitrário (não-ApiError) → unhandled com fallback genérico', () => {
    expect(classifyRouteSubmitError(new Error('boom'), SUBMIT_COPY)).toEqual({
      kind: 'unhandled',
      title: SUBMIT_COPY.forbiddenTitle,
      fallback: SUBMIT_COPY.genericFallback,
    });
  });
});
