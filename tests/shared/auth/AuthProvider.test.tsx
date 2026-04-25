import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, test, vi } from 'vitest';


import type { ApiClient, ApiError } from '@/shared/api';
import type { LoginResponse } from '@/shared/auth';

import { AuthProvider, useAuth } from '@/shared/auth';

/**
 * Constrói um stub de `ApiClient` que registra chamadas e devolve
 * respostas controladas. Cada teste configura o comportamento de `post`
 * via `mockResolvedValue` / `mockRejectedValue`.
 */
function createClientStub(): ApiClient & {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
  } as unknown as ApiClient & {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  };
}

/**
 * Wrapper de teste que monta o Provider com um cliente injetado.
 * Usado por `renderHook` para fornecer contexto ao `useAuth`.
 */
function makeWrapper(client: ApiClient) {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AuthProvider client={client}>{children}</AuthProvider>
  );
  Wrapper.displayName = 'AuthProviderTestWrapper';
  return Wrapper;
}

/**
 * Acessa a última chamada registrada por um mock — alternativa a
 * `Array.prototype.at(-1)`, que exige `lib: ES2022`. Mantém compat com o
 * `target: ES2020` do projeto.
 */
function lastCall<T>(mockCalls: ReadonlyArray<T>): T | undefined {
  return mockCalls.length > 0 ? mockCalls[mockCalls.length - 1] : undefined;
}

const SAMPLE_LOGIN: LoginResponse = {
  token: 'jwt-xyz',
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
  },
  permissions: ['Systems.Read', 'Systems.Create'],
};

describe('useAuth fora do Provider', () => {
  test('lança erro descritivo', () => {
    // Suprime o `console.error` esperado do React durante teste de erro.
    const noop = (): void => {
      // intencionalmente vazio — apenas absorver logs de erro do React.
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(noop);
    expect(() => renderHook(() => useAuth())).toThrow(
      /useAuth deve ser usado dentro de um <AuthProvider>/,
    );
    errorSpy.mockRestore();
  });
});

describe('AuthProvider — estado inicial', () => {
  test('expõe estado deslogado e finaliza isLoading após hidratação', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('injeta getToken e onUnauthorized no client via setAuth', () => {
    const client = createClientStub();
    renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    expect(client.setAuth).toHaveBeenCalled();
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(typeof latest?.getToken).toBe('function');
    expect(typeof latest?.onUnauthorized).toBe('function');
    // Antes do login, getToken() retorna null.
    expect(latest?.getToken?.()).toBeNull();
  });
});

describe('AuthProvider — login', () => {
  test('caminho feliz: atualiza estado e dispara POST /auth/login', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(client.post).toHaveBeenCalledWith('/auth/login', {
      email: 'ada@lfc.com.br',
      password: 'secret',
    });
    expect(result.current.user).toEqual(SAMPLE_LOGIN.user);
    expect(result.current.permissions).toEqual(SAMPLE_LOGIN.permissions);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  test('após login, getToken injetado no client retorna o token recebido', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBe('jwt-xyz');
  });

  test('falha de credenciais propaga ApiError e mantém estado deslogado', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    };
    const client = createClientStub();
    client.post.mockRejectedValueOnce(apiError);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('ada@lfc.com.br', 'wrong');
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('AuthProvider — logout', () => {
  test('limpa estado e zera token após logout', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isAuthenticated).toBe(false);
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });
});

describe('AuthProvider — hasPermission', () => {
  test('retorna false enquanto deslogado', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasPermission('Systems.Read')).toBe(false);
  });

  test('retorna true para permissões presentes após login', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(result.current.hasPermission('Systems.Read')).toBe(true);
    expect(result.current.hasPermission('Systems.Create')).toBe(true);
    expect(result.current.hasPermission('Systems.Delete')).toBe(false);
  });
});

describe('AuthProvider — onUnauthorized', () => {
  test('callback injetado no client limpa sessão quando disparado', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    expect(result.current.isAuthenticated).toBe(true);

    const onUnauthorized = lastCall(client.setAuth.mock.calls)?.[0]
      ?.onUnauthorized as () => void;
    expect(typeof onUnauthorized).toBe('function');

    act(() => {
      onUnauthorized();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
  });
});
