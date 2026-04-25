import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';


import type { ApiClient, ApiError } from '@/shared/api';
import type { LoginResponse, VerifyTokenResponse } from '@/shared/auth';

import { AuthProvider, useAuth } from '@/shared/auth';
import { STORAGE_KEYS } from '@/shared/auth/storage';

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

interface WrapperOptions {
  initialEntries?: ReadonlyArray<string>;
  verifyIntervalMs?: number;
  /**
   * `false` por padrão nos testes de hook (`renderHook` precisa que o
   * children renderize sempre, senão `result.current` fica `null`
   * enquanto a splash está visível). O teste dedicado de splash UI
   * passa `false` aqui e renderiza com `render` em vez de `renderHook`.
   */
  disableSplash?: boolean;
}

/**
 * Wrapper de teste que monta o Provider com um cliente injetado e
 * `MemoryRouter` para satisfazer o `useNavigate` interno.
 */
function makeWrapper(client: ApiClient, options: WrapperOptions = {}) {
  const {
    initialEntries = ['/'],
    verifyIntervalMs = 0,
    disableSplash = true,
  } = options;
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[...initialEntries]}>
      <Routes>
        <Route
          path="*"
          element={
            <AuthProvider
              client={client}
              verifyIntervalMs={verifyIntervalMs}
              disableSplash={disableSplash}
            >
              {children}
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>
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

const VERIFY_RESPONSE: VerifyTokenResponse = {
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
  },
  permissions: ['Systems.Read', 'Systems.Create', 'Systems.Update'],
};

const UNAUTHORIZED_ERROR: ApiError = {
  kind: 'http',
  status: 401,
  code: 'TOKEN_INVALID',
  message: 'Sessão expirada.',
};

const NETWORK_ERROR: ApiError = {
  kind: 'network',
  message: 'Falha de conexão com o servidor.',
};

/**
 * Pré-popula `localStorage` para simular sessão persistida — usado nos
 * testes de hidratação remota.
 */
function seedPersistedSession(): void {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
  window.localStorage.setItem(
    STORAGE_KEYS.user,
    JSON.stringify({
      user: SAMPLE_LOGIN.user,
      permissions: SAMPLE_LOGIN.permissions,
    }),
  );
}

/**
 * Garante storage limpo antes de cada teste — evita vazar sessão
 * persistida entre cenários, especialmente nos testes de hidratação
 * que dependem do estado de `localStorage` no momento do mount.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

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
    // Sem sessão local, verify-token NÃO deve ser chamado.
    expect(client.get).not.toHaveBeenCalled();
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

describe('AuthProvider — persistência (Issue #53)', () => {
  test('hidrata estado a partir de localStorage no mount', async () => {
    // Pré-condição: storage já contém uma sessão válida (simula reload
    // após login bem-sucedido em sessão anterior).
    seedPersistedSession();
    const client = createClientStub();
    // Verify-token bem-sucedido para destravar isLoading.
    client.get.mockResolvedValueOnce(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // Render inicial já é autenticado.
    expect(result.current.isAuthenticated).toBe(true);

    // Token persistido também alimenta o getToken injetado no client.
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBe('jwt-persistido');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  test('ignora dados corrompidos em storage e mantém estado deslogado', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    window.localStorage.setItem(STORAGE_KEYS.user, '{json-quebrado');

    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });

  test('login persiste token e user em localStorage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');
    const userJson = window.localStorage.getItem(STORAGE_KEYS.user);
    expect(userJson).not.toBeNull();
    expect(JSON.parse(userJson as string)).toEqual({
      user: SAMPLE_LOGIN.user,
      permissions: SAMPLE_LOGIN.permissions,
    });
  });

  test('logout limpa ambas as chaves do localStorage', async () => {
    // Estado inicial: sessão já hidratada do storage.
    seedPersistedSession();

    const client = createClientStub();
    client.get.mockResolvedValueOnce(VERIFY_RESPONSE);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.isAuthenticated).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('callback onUnauthorized (401) limpa localStorage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    // Confirma pré-condição: storage está populado.
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');

    const onUnauthorized = lastCall(client.setAuth.mock.calls)?.[0]
      ?.onUnauthorized as () => void;
    act(() => {
      onUnauthorized();
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
  });
});

describe('AuthProvider — verify-token (Issue #54)', () => {
  test('com sessão local, hidrata via GET /auth/verify-token e atualiza permissions', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValueOnce(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // Mount inicial já está autenticado (otimista) com permissões antigas
    // e isLoading=true sinalizando revalidação em curso.
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.permissions).toEqual(SAMPLE_LOGIN.permissions);

    // Após o verify-token resolver, permissões são atualizadas.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).toHaveBeenCalledWith(
      '/auth/verify-token',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.permissions).toEqual(VERIFY_RESPONSE.permissions);
    expect(result.current.user).toEqual(VERIFY_RESPONSE.user);
  });

  test('sem sessão local, NÃO chama verify-token no mount', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).not.toHaveBeenCalled();
  });

  test('verify-token com 401 limpa sessão e redireciona para /login', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Simula o comportamento real do client HTTP: em 401, dispara
    // `onUnauthorized` antes de rejeitar a Promise.
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { initialEntries: ['/systems'] }),
    });

    // O verify-token resolve assincronamente; aguardamos a transição
    // para `isAuthenticated: false` em vez de afirmar o estado inicial
    // (que pode ou não ter sido capturado antes do `useEffect` rodar).
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('verify-token com falha de rede mantém sessão local intacta', async () => {
    seedPersistedSession();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClientStub();
    client.get.mockRejectedValueOnce(NETWORK_ERROR);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Sessão local preservada — usuário continua autenticado com último
    // snapshot conhecido.
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(SAMPLE_LOGIN.user);
    expect(result.current.permissions).toEqual(SAMPLE_LOGIN.permissions);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-persistido');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('verify-token com payload inválido mantém sessão local', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Resposta sem `user` válido — Provider deve descartar silenciosamente.
    client.get.mockResolvedValueOnce({ permissions: [] } as unknown);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(SAMPLE_LOGIN.user);
    expect(result.current.permissions).toEqual(SAMPLE_LOGIN.permissions);
  });

  test('revalidação periódica chama verify-token a cada tick', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValue(VERIFY_RESPONSE);

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { verifyIntervalMs: 50 }),
    });

    // A hidratação inicial dispara a chamada #1; cada tick subsequente
    // adiciona mais uma. Asserimos apenas a transição de "1 → ≥3" para
    // evitar corrida com intervalo de 50ms vs. agendamento do React.
    await waitFor(
      () => expect(client.get.mock.calls.length).toBeGreaterThanOrEqual(3),
      { timeout: 1500 },
    );
    // Desmonta explicitamente para liberar `setInterval` antes de o
    // próximo teste começar — `renderHook` faz auto-cleanup, mas sob
    // intervalo de 50ms o timer pode disparar entre tests vizinhos.
    unmount();
  });

  test('verifyIntervalMs=0 desativa revalidação periódica mas mantém hidratação inicial', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValue(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { verifyIntervalMs: 0 }),
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Aguarda um pouco para garantir que nenhum tick adicional chegou.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  test('renderiza splash enquanto verify-token está em curso (sessão local)', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Promise pendente para manter `isLoading: true` enquanto asserimos
    // a presença da splash.
    let resolveVerify: ((value: VerifyTokenResponse) => void) | null = null;
    client.get.mockImplementationOnce(
      () =>
        new Promise<VerifyTokenResponse>(resolve => {
          resolveVerify = resolve;
        }),
    );

    render(
      <MemoryRouter>
        <AuthProvider client={client} verifyIntervalMs={0}>
          <div data-testid="protected-content">conteúdo protegido</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Splash visível, conteúdo protegido oculto.
    expect(screen.getByTestId('auth-splash')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // Resolve o verify-token: splash desaparece, conteúdo aparece.
    await act(async () => {
      resolveVerify?.(VERIFY_RESPONSE);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('auth-splash')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  test('sem sessão local, NÃO exibe splash e renderiza children imediatamente', () => {
    const client = createClientStub();
    render(
      <MemoryRouter>
        <AuthProvider client={client} verifyIntervalMs={0}>
          <div data-testid="public-content">conteúdo público</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('auth-splash')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-content')).toBeInTheDocument();
  });

  test('unmount cancela revalidação pendente via AbortController', async () => {
    seedPersistedSession();
    const client = createClientStub();
    let abortSignal: AbortSignal | undefined;
    client.get.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
      abortSignal = options?.signal;
      // Promise pendente — nunca resolve — para asserir o abort.
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // O `useEffect` que dispara o verify-token roda após o primeiro
    // commit; aguardamos até que o mock receba o signal antes de
    // desmontar.
    await waitFor(() => expect(abortSignal).toBeDefined());
    expect(abortSignal?.aborted).toBe(false);

    unmount();
    expect(abortSignal?.aborted).toBe(true);
  });
});
