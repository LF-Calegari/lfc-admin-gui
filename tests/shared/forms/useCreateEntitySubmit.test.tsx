import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  useCreateEntitySubmit,
  type CreateEntitySubmitCopy,
  type UseCreateEntitySubmitArgs,
} from '@/shared/forms';

/**
 * Suíte do hook compartilhado `useCreateEntitySubmit` (Issue #78 da
 * EPIC #49 — gêmeo do `useEditEntitySubmit` introduzido na PR #135).
 *
 * O hook centraliza o ciclo `try/catch/finally` + `classifyApiSubmitError`
 * + dispatch dos efeitos colaterais que aparecia idêntico em
 * `NewSystemModal` e `NewRouteModal` (~30 linhas duplicadas) — eliminar
 * BLOCKER de Sonar New Code Duplication antes que a issue
 * `NewUserModal` (#78) replique o padrão pela 3ª vez.
 *
 * Estratégia: validar a orquestração com mocks de cada dispatcher,
 * cobrindo os 5 caminhos do `action.kind` + caminho feliz + dedupe via
 * `prepareSubmit` retornando `null`. Os testes end-to-end ficam nos
 * arquivos de página (`UsersPage.create.test.tsx`).
 */

type Field = 'name' | 'email' | 'password';

const SUCCESS_MESSAGE = 'Criado.';

const COPY: CreateEntitySubmitCopy = {
  successMessage: SUCCESS_MESSAGE,
  conflictInlineMessage: 'Conflito inline custom.',
  submitErrorCopy: {
    conflictDefault: 'Já existe.',
    forbiddenTitle: 'Falha ao criar',
    genericFallback: 'Não foi possível criar.',
  },
};

interface SetupOverrides {
  prepareSubmit?: () => object | null;
  mutationFn?: (payload: unknown) => Promise<unknown>;
  copy?: CreateEntitySubmitCopy;
}

function setupHook(overrides: SetupOverrides = {}) {
  const setFieldErrors = vi.fn();
  const setSubmitError = vi.fn();
  const setIsSubmitting = vi.fn();
  const applyBadRequest = vi.fn();
  const showToast = vi.fn();
  const resetForm = vi.fn();
  const onCreated = vi.fn();
  const onClose = vi.fn();

  const prepareSubmit = overrides.prepareSubmit ?? vi.fn(() => ({ payload: 'ok' }));
  const mutationFn = overrides.mutationFn ?? vi.fn(async () => ({ id: 'created' }));

  const args: UseCreateEntitySubmitArgs<Field> = {
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast,
      resetForm,
    },
    copy: overrides.copy ?? COPY,
    callbacks: {
      prepareSubmit,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField: 'email',
  };

  const { result } = renderHook(() => useCreateEntitySubmit<Field>(args));

  return {
    handleSubmit: result.current,
    spies: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast,
      resetForm,
      onCreated,
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

describe('useCreateEntitySubmit — caminho feliz', () => {
  it('chama mutationFn, dispara toast verde, reset, onCreated e onClose após sucesso', async () => {
    const mutationFn = vi.fn(async () => ({ id: 'ok' }));
    const { handleSubmit, spies } = setupHook({ mutationFn });

    const event = makeFakeFormEvent();
    await handleSubmit(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(mutationFn).toHaveBeenCalledWith({ payload: 'ok' });
    expect(spies.showToast).toHaveBeenCalledWith(SUCCESS_MESSAGE, {
      variant: 'success',
    });
    expect(spies.resetForm).toHaveBeenCalledTimes(1);
    expect(spies.onCreated).toHaveBeenCalledTimes(1);
    expect(spies.onClose).toHaveBeenCalledTimes(1);
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('chama resetForm antes de onCreated antes de onClose para coordenar refetch primeiro', async () => {
    const order: string[] = [];
    const resetForm = vi.fn(() => order.push('resetForm'));
    const onCreated = vi.fn(() => order.push('onCreated'));
    const onClose = vi.fn(() => order.push('onClose'));
    const setFieldErrors = vi.fn();
    const setSubmitError = vi.fn();
    const setIsSubmitting = vi.fn();
    const applyBadRequest = vi.fn();
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useCreateEntitySubmit<Field>({
        dispatchers: {
          setFieldErrors,
          setSubmitError,
          setIsSubmitting,
          applyBadRequest,
          showToast,
          resetForm,
        },
        copy: COPY,
        callbacks: {
          prepareSubmit: () => ({ payload: 'x' }),
          mutationFn: async () => ({}),
          onCreated,
          onClose,
        },
        conflictField: 'email',
      }),
    );

    await result.current(makeFakeFormEvent());

    expect(order).toEqual(['resetForm', 'onCreated', 'onClose']);
  });
});

describe('useCreateEntitySubmit — dedupe via prepareSubmit', () => {
  it('aborta sem chamar mutationFn quando prepareSubmit retorna null', async () => {
    const mutationFn = vi.fn(async () => ({ id: 'never' }));
    const prepareSubmit = vi.fn(() => null);
    const { handleSubmit, spies } = setupHook({ mutationFn, prepareSubmit });

    await handleSubmit(makeFakeFormEvent());

    expect(prepareSubmit).toHaveBeenCalledTimes(1);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();
    expect(spies.resetForm).not.toHaveBeenCalled();
    expect(spies.onCreated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    // O `setIsSubmitting(false)` no `finally` NÃO deve ser chamado
    // quando o gate cancela a submissão antes do `try` — preserva o
    // estado original (`isSubmitting=false` se prepareSubmit decidiu
    // que não vale submeter).
    expect(spies.setIsSubmitting).not.toHaveBeenCalled();
  });
});

describe('useCreateEntitySubmit — caminho de erro 409 (conflict)', () => {
  it('seta erro inline no conflictField com a copy custom', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(409, 'Backend conflict message.');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setFieldErrors).toHaveBeenCalledWith({
      email: 'Conflito inline custom.',
    });
    expect(spies.setSubmitError).toHaveBeenCalledWith(null);
    expect(spies.showToast).not.toHaveBeenCalled();
    expect(spies.onCreated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('quando conflictInlineMessage está ausente, usa a mensagem do backend', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(409, 'Backend conflict message.');
    });
    const copyWithoutInline: CreateEntitySubmitCopy = {
      ...COPY,
      conflictInlineMessage: undefined,
    };
    const { handleSubmit, spies } = setupHook({
      mutationFn,
      copy: copyWithoutInline,
    });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.setFieldErrors).toHaveBeenCalledWith({
      email: 'Backend conflict message.',
    });
  });
});

describe('useCreateEntitySubmit — caminho de erro 400 (bad-request)', () => {
  it('delega para applyBadRequest com details e fallbackMessage', async () => {
    const details = { errors: { Name: ['nome curto'] } };
    const mutationFn = vi.fn(async () => {
      throw httpError(400, 'validação falhou', details);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.applyBadRequest).toHaveBeenCalledWith(details, 'validação falhou');
    expect(spies.onCreated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useCreateEntitySubmit — caminho de erro 404 (não esperado em create)', () => {
  it('cai no fallback genérico (sem onCreated/onClose como em edit)', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(404);
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não foi possível criar.', {
      variant: 'danger',
      title: 'Falha ao criar',
    });
    expect(spies.onCreated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useCreateEntitySubmit — caminho 401/403 (toast)', () => {
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
      title: 'Falha ao criar',
    });
    expect(spies.onCreated).not.toHaveBeenCalled();
    expect(spies.onClose).not.toHaveBeenCalled();
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useCreateEntitySubmit — erro não-HTTP (unhandled)', () => {
  it('cai no fallback genérico para erros de rede (Error genérico)', async () => {
    const mutationFn = vi.fn(async () => {
      throw new Error('boom');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não foi possível criar.', {
      variant: 'danger',
      title: 'Falha ao criar',
    });
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it('cai no fallback genérico para status 5xx', async () => {
    const mutationFn = vi.fn(async () => {
      throw httpError(500, 'erro interno');
    });
    const { handleSubmit, spies } = setupHook({ mutationFn });

    await handleSubmit(makeFakeFormEvent());

    expect(spies.showToast).toHaveBeenCalledWith('Não foi possível criar.', {
      variant: 'danger',
      title: 'Falha ao criar',
    });
    expect(spies.setIsSubmitting).toHaveBeenCalledWith(false);
  });
});

describe('useCreateEntitySubmit — finally setIsSubmitting', () => {
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
