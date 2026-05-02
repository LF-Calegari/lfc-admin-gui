import { describe, expect, it } from 'vitest';

import {
  classifyAddExtraEmailError,
  classifyRemoveExtraEmailError,
  EXTRA_EMAIL_MAX,
  validateExtraEmailInput,
  type ExtraEmailErrorCopy,
} from '@/pages/clients/clientExtraEmailsHelpers';

/**
 * Suíte do `clientExtraEmailsHelpers` (Issue #146).
 *
 * Cobre as funções puras consumidas pelo `ClientExtraEmailsTab`:
 *
 * - `validateExtraEmailInput` — feedback client-side antes do submit.
 * - `classifyAddExtraEmailError` — mapeamento dos erros do
 *   `addClientExtraEmail` para ações discriminadas.
 * - `classifyRemoveExtraEmailError` — mapeamento dos erros do
 *   `removeClientExtraEmail`.
 *
 * Foco em casos de borda que cobrem os cenários da issue (limite,
 * 409 duplicado, 409 username, 400 username no remove). Testes são
 * em TS puro (sem provider/render) — o componente compõe esses
 * helpers numa árvore visual mas a lógica é testável isoladamente.
 */

const COPY: ExtraEmailErrorCopy = {
  genericFallback: 'Não foi possível concluir a ação. Tente novamente.',
  forbiddenTitle: 'Falha na operação',
  notFoundMessage: 'Recurso não encontrado.',
};

describe('validateExtraEmailInput', () => {
  it('retorna null para email válido', () => {
    expect(validateExtraEmailInput('ana@exemplo.com')).toBeNull();
  });

  it('retorna null após trim quando o resultado é válido', () => {
    expect(validateExtraEmailInput('  ana@exemplo.com  ')).toBeNull();
  });

  it('exige email obrigatório quando vazio', () => {
    expect(validateExtraEmailInput('')).toBe('Email é obrigatório.');
  });

  it('exige email obrigatório quando apenas whitespace', () => {
    expect(validateExtraEmailInput('   ')).toBe('Email é obrigatório.');
  });

  it('rejeita email com tamanho acima do máximo permitido', () => {
    const localPart = 'a'.repeat(EXTRA_EMAIL_MAX);
    const email = `${localPart}@exemplo.com`;
    expect(validateExtraEmailInput(email)).toBe(
      `Email deve ter no máximo ${EXTRA_EMAIL_MAX} caracteres.`,
    );
  });

  it('rejeita email sem arroba', () => {
    expect(validateExtraEmailInput('sem-arroba')).toBe('Informe um email válido.');
  });

  it('rejeita email com formato inválido (sem TLD)', () => {
    expect(validateExtraEmailInput('ana@dominio')).toBe('Informe um email válido.');
  });

  it('rejeita email com mais de uma arroba', () => {
    expect(validateExtraEmailInput('ana@x@y.com')).toBe('Informe um email válido.');
  });

  it('rejeita email com espaços internos', () => {
    expect(validateExtraEmailInput('ana @exemplo.com')).toBe('Informe um email válido.');
  });
});

describe('classifyAddExtraEmailError', () => {
  it('classifica 400 com mensagem "Limite de 3..." como limit-reached', () => {
    const action = classifyAddExtraEmailError(
      {
        kind: 'http',
        status: 400,
        message: 'Limite de 3 emails extras por cliente.',
      },
      COPY,
    );

    expect(action.kind).toBe('limit-reached');
    if (action.kind === 'limit-reached') {
      expect(action.message).toBe('Limite de 3 emails extras por cliente.');
    }
  });

  it('classifica 400 com outras mensagens como inline (defensivo)', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'http', status: 400, message: 'Email extra inválido.' },
      COPY,
    );

    expect(action.kind).toBe('inline');
    if (action.kind === 'inline') {
      expect(action.message).toBe('Email extra inválido.');
    }
  });

  it('classifica 409 (duplicado) como inline com mensagem do backend', () => {
    const action = classifyAddExtraEmailError(
      {
        kind: 'http',
        status: 409,
        message: 'Email extra já cadastrado para este cliente.',
      },
      COPY,
    );

    expect(action.kind).toBe('inline');
    if (action.kind === 'inline') {
      expect(action.message).toBe('Email extra já cadastrado para este cliente.');
    }
  });

  it('classifica 409 (username) como inline com mensagem orientadora', () => {
    const action = classifyAddExtraEmailError(
      {
        kind: 'http',
        status: 409,
        message: 'Este email está sendo usado como username e não pode ser email extra.',
      },
      COPY,
    );

    expect(action.kind).toBe('inline');
    if (action.kind === 'inline') {
      expect(action.message).toContain('username');
    }
  });

  it('classifica 404 como not-found com message do COPY', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'http', status: 404, message: 'Cliente não encontrado.' },
      COPY,
    );

    expect(action.kind).toBe('not-found');
    if (action.kind === 'not-found') {
      expect(action.message).toBe(COPY.notFoundMessage);
      expect(action.title).toBe(COPY.forbiddenTitle);
    }
  });

  it('classifica 401 como toast', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'http', status: 401, message: 'Sessão expirada.' },
      COPY,
    );

    expect(action.kind).toBe('toast');
    if (action.kind === 'toast') {
      expect(action.message).toBe('Sessão expirada.');
    }
  });

  it('classifica 403 como toast', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'http', status: 403, message: 'Sem permissão.' },
      COPY,
    );

    expect(action.kind).toBe('toast');
  });

  it('classifica erros não-HTTP (network) como unhandled', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'network', message: 'Falha de conexão.' },
      COPY,
    );

    expect(action.kind).toBe('unhandled');
    if (action.kind === 'unhandled') {
      expect(action.message).toBe(COPY.genericFallback);
    }
  });

  it('classifica erros arbitrários (não-ApiError) como unhandled', () => {
    const action = classifyAddExtraEmailError(new Error('Algo deu errado'), COPY);
    expect(action.kind).toBe('unhandled');
  });

  it('classifica 5xx como unhandled', () => {
    const action = classifyAddExtraEmailError(
      { kind: 'http', status: 500, message: 'Erro interno.' },
      COPY,
    );

    expect(action.kind).toBe('unhandled');
  });
});

describe('classifyRemoveExtraEmailError', () => {
  it('classifica 400 como username com mensagem do backend', () => {
    const action = classifyRemoveExtraEmailError(
      {
        kind: 'http',
        status: 400,
        message:
          'Não é permitido remover email que esteja sendo usado como username.',
      },
      COPY,
    );

    expect(action.kind).toBe('username');
    if (action.kind === 'username') {
      expect(action.message).toBe(
        'Não é permitido remover email que esteja sendo usado como username.',
      );
    }
  });

  it('classifica 404 como not-found com message do COPY', () => {
    const action = classifyRemoveExtraEmailError(
      { kind: 'http', status: 404, message: 'Email extra não encontrado.' },
      COPY,
    );

    expect(action.kind).toBe('not-found');
    if (action.kind === 'not-found') {
      expect(action.message).toBe(COPY.notFoundMessage);
    }
  });

  it('classifica 401/403 como toast', () => {
    const action = classifyRemoveExtraEmailError(
      { kind: 'http', status: 403, message: 'Sem permissão.' },
      COPY,
    );

    expect(action.kind).toBe('toast');
  });

  it('classifica network como unhandled', () => {
    const action = classifyRemoveExtraEmailError(
      { kind: 'network', message: 'Falha.' },
      COPY,
    );

    expect(action.kind).toBe('unhandled');
  });
});
