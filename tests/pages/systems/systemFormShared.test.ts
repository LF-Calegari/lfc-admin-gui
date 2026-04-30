import { describe, expect, it } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  classifyMutationError,
  type MutationErrorCopy,
} from '@/pages/systems/systemFormShared';

/**
 * Testes unitários puros do `classifyMutationError` (Issue #60).
 *
 * Validar a função pura isoladamente garante que a tabela de
 * classificação está correta independente do contexto React — os testes
 * de integração (`SystemsPage.delete.test.tsx`) cobrem o lado do
 * side-effect (toast/close/refetch). Isolar a lógica em TS puro sem
 * provider/render é o padrão recomendado pela lição PR #128 ("separar
 * a decisão do efeito").
 *
 * Como o helper foi pré-projetado para servir tanto delete (#60) quanto
 * o futuro restore (#61), os testes cobrem **ambos** os caminhos:
 *
 * - `delete` usa `MutationErrorCopy` SEM `conflictMessage` → 409 cai
 *   em `unhandled` (backend nunca devolve 409 nesse path; tratamos
 *   defensivamente).
 * - `restore` usa `MutationErrorCopy` COM `conflictMessage` → 409 vira
 *   `conflict` com mensagem do backend ou da copy.
 *
 * Cobrir os dois caminhos no mesmo arquivo evita que o PR de #61
 * adicione lógica nova ao helper sem testes — tudo já está guardado
 * desde a entrada.
 */

const DELETE_COPY: MutationErrorCopy = {
  forbiddenTitle: 'Falha ao desativar sistema',
  genericFallback: 'Não foi possível desativar o sistema. Tente novamente.',
  notFoundMessage: 'Sistema não encontrado ou foi removido. Atualize a lista.',
};

const RESTORE_COPY: MutationErrorCopy = {
  forbiddenTitle: 'Falha ao restaurar sistema',
  genericFallback: 'Não foi possível restaurar o sistema. Tente novamente.',
  notFoundMessage: 'Sistema não encontrado ou foi removido. Atualize a lista.',
  conflictMessage: 'Sistema já está ativo.',
};

describe('classifyMutationError', () => {
  it('404 → not-found com message do copy e título', () => {
    const error: ApiError = {
      kind: 'http',
      status: 404,
      message: 'Sistema não encontrado.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'not-found',
      message: DELETE_COPY.notFoundMessage,
      title: DELETE_COPY.forbiddenTitle,
    });
  });

  it('401 → toast com mensagem do backend e título do copy', () => {
    const error: ApiError = {
      kind: 'http',
      status: 401,
      message: 'Sessão expirada.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message: 'Sessão expirada.',
      title: DELETE_COPY.forbiddenTitle,
    });
  });

  it('403 → toast com mensagem do backend e título do copy', () => {
    const error: ApiError = {
      kind: 'http',
      status: 403,
      message: 'Você não tem permissão.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'toast',
      message: 'Você não tem permissão.',
      title: DELETE_COPY.forbiddenTitle,
    });
  });

  it('401 sem message → toast com fallback genérico', () => {
    const error = {
      kind: 'http' as const,
      status: 401,
      message: '',
    } as ApiError;
    const action = classifyMutationError(error, DELETE_COPY);
    if (action.kind !== 'toast') throw new Error('expected toast');
    // Mensagem vazia/falsy cai no fallback do helper.
    expect(action.title).toBe(DELETE_COPY.forbiddenTitle);
  });

  it('500 → unhandled com fallback genérico', () => {
    const error: ApiError = {
      kind: 'http',
      status: 500,
      message: 'Internal server error.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
  });

  it('network error → unhandled com fallback genérico', () => {
    const error: ApiError = {
      kind: 'network',
      message: 'Falha de conexão.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
  });

  it('parse error → unhandled com fallback genérico', () => {
    const error: ApiError = {
      kind: 'parse',
      message: 'Resposta inválida.',
    };
    const action = classifyMutationError(error, DELETE_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
  });

  it('erro arbitrário (não-ApiError) → unhandled com fallback genérico', () => {
    const action = classifyMutationError(new Error('boom'), DELETE_COPY);
    expect(action).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
  });

  it('null/undefined → unhandled com fallback genérico', () => {
    expect(classifyMutationError(null, DELETE_COPY)).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
    expect(classifyMutationError(undefined, DELETE_COPY)).toEqual({
      kind: 'unhandled',
      title: DELETE_COPY.forbiddenTitle,
      fallback: DELETE_COPY.genericFallback,
    });
  });

  describe('com conflictMessage configurado (caso restore #61)', () => {
    it('409 → conflict com mensagem do backend', () => {
      const error: ApiError = {
        kind: 'http',
        status: 409,
        message: 'Sistema já está ativo.',
      };
      const action = classifyMutationError(error, RESTORE_COPY);
      expect(action).toEqual({
        kind: 'conflict',
        message: 'Sistema já está ativo.',
        title: RESTORE_COPY.forbiddenTitle,
      });
    });

    it('409 sem message do backend cai em conflict mas com a do copy', () => {
      const error = {
        kind: 'http' as const,
        status: 409,
        message: '',
      } as ApiError;
      const action = classifyMutationError(error, RESTORE_COPY);
      expect(action.kind).toBe('conflict');
      if (action.kind !== 'conflict') throw new Error('expected conflict');
      // Mensagem vazia cai no fallback do copy.
      expect(action.title).toBe(RESTORE_COPY.forbiddenTitle);
    });
  });

  describe('sem conflictMessage configurado (caso delete #60)', () => {
    it('409 → unhandled (delete não recebe 409 do backend; defensivo)', () => {
      const error: ApiError = {
        kind: 'http',
        status: 409,
        message: 'Conflict.',
      };
      const action = classifyMutationError(error, DELETE_COPY);
      expect(action).toEqual({
        kind: 'unhandled',
        title: DELETE_COPY.forbiddenTitle,
        fallback: DELETE_COPY.genericFallback,
      });
    });
  });
});
