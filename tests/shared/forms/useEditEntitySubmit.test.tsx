import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type UseEditEntitySubmitArgs,
} from '@/shared/forms';

/**
 * Suíte do hook compartilhado `useEditEntitySubmit` (lição PR #135 —
 * 6ª recorrência potencial de Sonar New Code Duplication).
 *
 * O hook centraliza o ciclo `try/catch/finally` + `classifyApiSubmitError`
 * + `applyEditSubmitAction` + toast de sucesso que aparecia idêntico em
 * `EditSystemModal` e `EditRouteModal` (~33 linhas duplicadas).
 *
 * Estratégia: validar a orquestração com mocks de cada dispatcher,
 * cobrindo os 5 caminhos do `action.kind` + caminho feliz + dedupe via
 * `prepareSubmit` retornando `null`.
 *
 * Os testes de comportamento end-to-end ficam nos arquivos
 * `RoutesPage.edit.test.tsx` e `SystemsPage.edit.test.tsx` que já
 * passam — esta suíte cobre o helper isoladamente sem provider/render
 * (ainda que use `renderHook` para registrar o `useCallback` interno).
 */

type Field = 'name' | 'code' | 'description';

const SUCCESS_MESSAGE = 'Atualizado.';

const COPY: EditEntitySubmitCopy = {
  successMessage: SUCCESS_MESSAGE,
  submitErrorCopy: {
    conflictDefault: 'Já existe.',
    forbiddenTitle: 'Falha ao atualizar',
    genericFallback: 'Não foi possível atualizar.',
  },
  editSubmitActionCopy: {
    conflictInlineMessage: 'Conflito inline.',
    notFoundMessage: 'Não encontrado.',
    forbiddenTitle: 'Falha ao atualizar',
  },
};

interface SetupOverrides {
  prepareSubmit?: () => unknown | null;
  mutationFn?: (payload: unknown) => Promise<unknown>;
  copy?: EditEntitySubmitCopy;
}

function setupHook(overrides: SetupOverrides = {}) {
  const setFieldErrors = vi.fn();
  const setSubmitError = vi.fn();
  const setIsSubmitting = vi.fn();
  const applyBadRequest = vi.fn();
  const showToast = vi.fn();
  const onUpdated = vi.fn();
  const onClose = vi.fn();

  const prepareSubmit = overrides.prepareSubmit ?? vi.fn(() => ({ payload: 'ok' }));
  const mutationFn = overrides.mutationFn ?? vi.fn(async () => ({ id: 'updated' }));

  const args: UseEditEntitySubmitArgs<Field> = {
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast,
    },
    copy: overrides.copy ?? COPY,
    callbacks: {
      prepareSubmit,
      mutationFn,
      onUpdated,
      onClose,
    },
    conflictField: 'code',
  };

  const { result } = renderHook(() => useEditEntitySubmit<Field>(args));

  return {
    handleSubmit: result.current,
    spies: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast,
      onUpdated,
      onClose,
      prepareSubmit,
      mutationFn,
    },
  };
}

function makeFakeFormEvent(): React.FormEvent<HTMLFormElement> {
  const preventDefault = vi.fn();
  return {
    preventDefault,
  } as unknown as React.FormEvent<HTMLFormElement>;
}

function httpError(status: number, message = 'erro', details?: unknown): ApiError {
  return { kind: 'http', status, message, details };
}

describe('useEditEntitySubmit — caminho feliz', () => {
  it('chama mutationFn, dispara toast verde e fecha modal após sucesso', async () => {
    const mutationFn = vi.fn(async () => ({ id: 'ok' }));
    const { handleSubmit, spies } = setupHook({ mutationFn });

    const event = makeFakeFormEvent();
    await handleSubmit(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledWith({ payload: 'ok' });
    expect(spies.showToast).toHaveBeenCalledWith(SUCCESS_MESSAGE, { variant: 'success' });
    expect(spies.setFieldErrors).toHaveBeenCalledWith({});
    expect(spies.setSubmitError).toHaveBeenCalledWith(null);
    expect(spies.onUpdated).toHaveBeenCalledTimes(1);
    expect(spies.onClose).toHaveBeenCalledTimes(1);
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('chama onUpdated antes de onClose para coordenar refetch primeiro', async () => {
    const order: string[] = [];
    const onUpdated = vi.fn(() => order.push('onUpdated'));
    const onClose = vi.fn(() => order.push('onClose'));
    const setFieldErrors = vi.fn();
    const setSubmitError = vi.fn();
    const setIsSubmitting = vi.fn();
    const applyBadRequest = vi.fn();
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useEditEntitySubmit<Field>({
        dispatchers: {
          setFieldErrors,
          setSubmitError,
          setIsSubmitting,
          applyBadRequest,
          showToast,
        },
        copy: COPY,
        callbacks: {
          prepareSubmit: () => ({ payload: 'x' }),
          mutationFn: async () => ({}),
          onUpdated,
          onClose,
        },
        conflictField: 'code',
      }),
    );

    await result.current(makeFakeFormEvent());

    expect(order).toEqual(['onUpdated', 'onClose']);
  });
});

describe('useEditEntitySubmit — dedupe via prepareSubmit', () => {
  it('aborta sem chamar mutationFn quando prepareSubmit retorna null', async () => {
    const mutationFn = vi.fn(async () => ({ id: 'never' }));
    const prepareSubmit = vi.fn(() => null);
    const { handleSubmit, spies } = setupHook({ mutationFn, prepareSubmit });

    await handleSubmit(makeFakeFormEvent());

    expect(prepareSubmit).toHaveBeenCalledTimes(1);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();
    expect(spies.onUpdated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    // O `setIsSubmitting(false)` no `finally` NÃO deve ser chamado
    // quando o gate cancela a submissão antes do `try` — preserva o
    // estado original (`isSubmitting=false` se prepareSubmit decidiu
    // que não vale submeter).
    expect(spies.setIsSubmitting).not.toHaveBeenCalled();
  });
});

describe('useEditEntitySubmit — caminho de erro 409 (conflict)', () => {
  it('seta erro inline no conflictField com a copy custom', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(409, 'Já existe.');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setFieldErrors).toHaveBeenCalledWith({ code: 'Conflito inline.' });
    expect(spies.setSubmitError).toHaveBeenCalledWith(null);
    expect(spies.showToast).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — caminho de erro 400 (bad-request)', () => {
  it('delega para applyBadRequest com details e fallbackMessage', async () => {
    const details = { errors: { Name: ['nome curto'] } };
    const mutationFn = vi.fn(async () => {
      throw httpError(400, 'validação falhou', details);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.applyBadRequest).toHaveBeenCalledWith(details, 'validação falhou');
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — caminho de erro 404 (not-found)', () => {
  it('dispara toast de notFound, onUpdated e onClose', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(404);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não encontrado.', {
      variant: 'danger',
      title: 'Falha ao atualizar',
    });
    expect(spies.onUpdated).toHaveBeenCalledTimes(1);
    expect(spies.onClose).toHaveBeenCalledTimes(1);
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — caminho 401/403 (toast)', () => {
  it.each([
    [401, 'Sem permissão.'],
    [403, 'Acesso negado.'],
  ])('dispara toast vermelho com a mensagem do backend (status %s)', async (status, message) => {
    const mutationFn = vi.fn(async () => {
      throw httpError(status, message);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith(message, {
      variant: 'danger',
      title: 'Falha ao atualizar',
    });
    expect(spies.onUpdated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — erro não-HTTP (unhandled)', () => {
  it('cai no fallback genérico para erros de rede', async () => {
    const mutationFn = vi.fn(async () => {
      throw new Error('boom');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não foi possível atualizar.', {
      variant: 'danger',
      title: 'Falha ao atualizar',
    });
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('cai no fallback genérico para status 5xx (unhandled)', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(500, 'erro interno');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não foi possível atualizar.', {
      variant: 'danger',
      title: 'Falha ao atualizar',
    });
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — finally setIsSubmitting', () => {
  it('chama setIsSubmitting(false) mesmo após sucesso', async () => {
    const mutationFn = vi.fn(async () => ({ id: 'ok' }));
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('chama setIsSubmitting(false) mesmo após erro', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(500);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useEditEntitySubmit — copy de conflictInlineMessage opcional', () => {
  it('quando ausente, usa a mensagem do backend como fallback inline', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(409, 'Backend conflict.');
    });
    const copyWithoutConflictInline: EditEntitySubmitCopy = {
      ...COPY,
      editSubmitActionCopy: {
        notFoundMessage: 'Não encontrado.',
        forbiddenTitle: 'Falha ao atualizar',
      },
    };
    const { handleSubmit, spies } = setupHook({
      mutationFn,
      copy: copyWithoutConflictInline,
    });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setFieldErrors).toHaveBeenCalledWith({ code: 'Backend conflict.' });
  });
});

describe('useEditEntitySubmit — re-renders e estabilidade', () => {
  it('handleSubmit é estável quando os argumentos não mudam (memoização)', async () => {
    const setFieldErrors = vi.fn();
    const setSubmitError = vi.fn();
    const setIsSubmitting = vi.fn();
    const applyBadRequest = vi.fn();
    const showToast = vi.fn();
    const onUpdated = vi.fn();
    const onClose = vi.fn();
    const prepareSubmit = vi.fn(() => ({ payload: 'x' }));
    const mutationFn = vi.fn(async () => ({}));

    const args: UseEditEntitySubmitArgs<Field> = {
      dispatchers: {
        setFieldErrors,
        setSubmitError,
        setIsSubmitting,
        applyBadRequest,
        showToast,
      },
      copy: COPY,
      callbacks: { prepareSubmit, mutationFn, onUpdated, onClose },
      conflictField: 'code',
    };

    const { result, rerender } = renderHook((props: UseEditEntitySubmitArgs<Field>) =>
      useEditEntitySubmit<Field>(props), { initialProps: args },
    );

    const first = result.current;
    rerender(args);
    const second = result.current;

    // Mesmas refs no input → mesma fn no output (useCallback memo).
    expect(first).toBe(second);
  });

  it('handleSubmit muda quando uma callback muda', () => {
    const baseDispatchers = {
      setFieldErrors: vi.fn(),
      setSubmitError: vi.fn(),
      setIsSubmitting: vi.fn(),
      applyBadRequest: vi.fn(),
      showToast: vi.fn(),
    };

    const initialArgs: UseEditEntitySubmitArgs<Field> = {
      dispatchers: baseDispatchers,
      copy: COPY,
      callbacks: {
        prepareSubmit: vi.fn(() => ({})),
        mutationFn: vi.fn(async () => ({})),
        onUpdated: vi.fn(),
        onClose: vi.fn(),
      },
      conflictField: 'code',
    };

    const { result, rerender } = renderHook(
      (props: UseEditEntitySubmitArgs<Field>) => useEditEntitySubmit<Field>(props),
      { initialProps: initialArgs },
    );
    const first = result.current;

    rerender({
      ...initialArgs,
      callbacks: {
        ...initialArgs.callbacks,
        mutationFn: vi.fn(async () => ({})), // nova ref
      },
    });
    const second = result.current;

    expect(first).not.toBe(second);
  });
});

describe('useEditEntitySubmit — ordem de side effects', () => {
  it('preventDefault é chamado antes de qualquer outra ação', async () => {
    const order: string[] = [];
    const event = {
      preventDefault: vi.fn(() => order.push('preventDefault')),
    } as unknown as React.FormEvent<HTMLFormElement>;

    const { handleSubmit } = setupHook({
      prepareSubmit: () => {
        order.push('prepareSubmit');
        return { ok: true };
      },
      mutationFn: async () => {
        order.push('mutationFn');
        return {};
      },
    });

    await handleSubmit(event);

    expect(order[0]).toBe('preventDefault');
    expect(order[1]).toBe('prepareSubmit');
    expect(order[2]).toBe('mutationFn');
  });

  it('em caso de erro, setIsSubmitting(false) ainda é chamado no finally', async () => {
    const order: string[] = [];
    const setIsSubmitting = vi.fn((v: boolean) => order.push(`setIsSubmitting(${v})`));
    const showToast = vi.fn(() => order.push('showToast'));

    const { result } = renderHook(() =>
      useEditEntitySubmit<Field>({
        dispatchers: {
          setFieldErrors: vi.fn(),
          setSubmitError: vi.fn(),
          setIsSubmitting,
          applyBadRequest: vi.fn(),
          showToast,
        },
        copy: COPY,
        callbacks: {
          prepareSubmit: () => ({ ok: true }),
          mutationFn: async () => {
            throw httpError(500);
          },
          onUpdated: vi.fn(),
          onClose: vi.fn(),
        },
        conflictField: 'code',
      }),
    );

    await result.current(makeFakeFormEvent());

    // showToast acontece dentro do catch, setIsSubmitting no finally.
    const showToastIdx = order.indexOf('showToast');
    const finallyIdx = order.indexOf('setIsSubmitting(false)');
    expect(showToastIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(showToastIdx);
  });
});

describe('useEditEntitySubmit — assincronicidade', () => {
  it('aguarda a mutationFn antes de fechar o modal', async () => {
    let resolveMutation: ((value: unknown) => void) | undefined;
    const mutationFn = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveMutation = resolve;
        }),
    );

    const { handleSubmit, spies } = setupHook({ mutationFn });

    const promise = handleSubmit(makeFakeFormEvent());

    // Antes do resolve → onClose não pode ter rodado.
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();

    if (!resolveMutation) throw new Error('mutationFn nunca foi chamada');
    resolveMutation({ id: 'ok' });

    await promise;
    await waitFor(() => {
      expect(spies.onClose).toHaveBeenCalledTimes(1);
    });
    expect(spies.showToast).toHaveBeenCalledWith(SUCCESS_MESSAGE, { variant: 'success' });
  });
});
