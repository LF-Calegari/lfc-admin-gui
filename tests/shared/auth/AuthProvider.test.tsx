import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from './__helpers__/fakeIndexedDB';

import type { ApiClient, ApiError } from '@/shared/api';
import type {
  CachedPermissions,
  LoginResponse,
  PermissionsResponse,
  VerifyTokenResponse,
} from '@/shared/auth';

import { AuthProvider, useAuth } from '@/shared/auth';
import { permissionsCache } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';


/**
 * UUID fake usado pelos stubs nos testes do Provider — qualquer valor
 * estável serve, desde que coincida com o que o `AuthContext.login()`
 * espera ler via `client.getSystemId()` para popular o body do POST
 * `/auth/login` (Issue #118).
 */
const STUB_SYSTEM_ID = 'system-test-uuid';

/**
 * Constrói um stub de `ApiClient` que registra chamadas e devolve
 * respostas controladas. Cada teste configura o comportamento de `post`
 * via `mockResolvedValue` / `mockRejectedValue`.
 *
 * `getSystemId` retorna `STUB_SYSTEM_ID` por padrão para que os asserts
 * de body do `/auth/login` capturem o campo `systemId` esperado em
 * produção (Issue #118). Testes que precisem simular o cliente sem
 * `systemId` configurado podem reescrever `getSystemId` localmente.
 */
function createClientStub(): ApiClient & {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => STUB_SYSTEM_ID),
  } as unknown as ApiClient & {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
    getSystemId: ReturnType<typeof vi.fn>;
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
};

/**
 * Resposta do novo `GET /auth/permissions` (Issue #122). Usado em
 * cenários de login feliz e hidratação a partir de cache vazio.
 */
const SAMPLE_PERMISSIONS: PermissionsResponse = {
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
    identity: 42,
  },
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read', 'perm:Systems.Create'],
  routeCodes: ['AUTH_ADMIN_V1_SYSTEMS'],
};

const SAMPLE_USER = SAMPLE_PERMISSIONS.user;
const SAMPLE_PERMISSION_CODES = SAMPLE_PERMISSIONS.permissionCodes;

/**
 * Resposta do novo `verify-token` reduzido (Issue #122).
 */
const VERIFY_OK: VerifyTokenResponse = {
  valid: true,
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T01:00:00Z',
};

const UNAUTHORIZED_ERROR: ApiError = {
  kind: 'http',
  status: 401,
  code: 'TOKEN_INVALID',
  message: 'Sessão expirada.',
};

const FORBIDDEN_ERROR: ApiError = {
  kind: 'http',
  status: 403,
  message: 'Acesso negado para a rota.',
};

const NETWORK_ERROR: ApiError = {
  kind: 'network',
  message: 'Falha de conexão com o servidor.',
};

/**
 * Pré-popula token (`localStorage`) e catálogo (IndexedDB) para
 * simular sessão persistida — usado nos testes de hidratação otimista.
 */
async function seedPersistedSession(): Promise<void> {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
  await permissionsCache.save({
    user: SAMPLE_USER,
    permissions: SAMPLE_PERMISSIONS.permissions,
    permissionCodes: SAMPLE_PERMISSION_CODES,
    routeCodes: SAMPLE_PERMISSIONS.routeCodes,
  } as Omit<CachedPermissions, 'cachedAt'>);
}

/**
 * Garante storage limpo antes de cada teste — evita vazar sessão
 * persistida entre cenários, especialmente nos testes de hidratação
 * que dependem do estado de `localStorage`/IndexedDB no momento do mount.
 */
beforeEach(() => {
  installFakeIndexedDB();
  window.localStorage.clear();
});

afterEach(() => {
  uninstallFakeIndexedDB();
  vi.useRealTimers();
});

describe('useAuth fora do Provider', () => {
  test('lança erro descritivo', () => {
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
  test('expõe estado deslogado e finaliza isLoading sem token', async () => {
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
    // Sem token, NÃO chama nem /auth/permissions nem /auth/verify-token.
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

  test('migração: clearLegacyKeys remove lfc-admin-auth-user no boot', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.legacyUser,
      JSON.stringify({ user: SAMPLE_USER, permissions: [] }),
    );
    const client = createClientStub();
    renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    expect(window.localStorage.getItem(STORAGE_KEYS.legacyUser)).toBeNull();
  });
});

describe('AuthProvider — login (Issue #122)', () => {
  test('caminho feliz: encadeia POST /auth/login + GET /auth/permissions e popula estado', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
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
      systemId: STUB_SYSTEM_ID,
    });
    // Issue #122: chama o NOVO endpoint /auth/permissions, não verify-token.
    expect(client.get).toHaveBeenCalledWith('/auth/permissions', undefined);
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSION_CODES);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  test('login persiste catálogo em IndexedDB', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    // Aguarda o `void permissionsCache.save(...)` resolver.
    await waitFor(async () => {
      const cached = await permissionsCache.load();
      expect(cached?.user.email).toBe('ada@lfc.com.br');
    });
    const cached = await permissionsCache.load();
    expect(cached?.permissionCodes).toEqual(SAMPLE_PERMISSION_CODES);
    expect(cached?.routeCodes).toEqual(SAMPLE_PERMISSIONS.routeCodes);
  });

  test('login persiste token em localStorage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');
  });

  test('tokenRef é setado ANTES do /auth/permissions (header Authorization presente)', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);

    let tokenAtPermissions: string | null | undefined;
    client.get.mockImplementationOnce(async () => {
      tokenAtPermissions = lastCall(client.setAuth.mock.calls)?.[0]?.getToken?.();
      return SAMPLE_PERMISSIONS;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(tokenAtPermissions).toBe('jwt-xyz');
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
    // /auth/permissions nunca chega a ser chamado quando o login rejeita.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('falha em /auth/permissions pós-login limpa sessão parcial e propaga erro', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockRejectedValueOnce(NETWORK_ERROR);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let captured: unknown;
    await act(async () => {
      try {
        await result.current.login('ada@lfc.com.br', 'secret');
      } catch (e) {
        captured = e;
      }
    });

    expect(captured).toMatchObject({ kind: 'network' });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    // Storage limpo — a sessão parcial foi descartada.
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();

    // Token injetado no client também foi zerado.
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });

  test.each([
    {
      name: 'login envia systemId no body lendo do client.getSystemId() (Issue #118)',
      stubReturnsNull: false,
      expectedBody: {
        email: 'ada@lfc.com.br',
        password: 'secret',
        systemId: STUB_SYSTEM_ID,
      },
    },
    {
      name: 'login omite systemId do body quando client.getSystemId() retorna null',
      stubReturnsNull: true,
      expectedBody: { email: 'ada@lfc.com.br', password: 'secret' },
    },
  ])('$name', async ({ stubReturnsNull, expectedBody }) => {
    const client = createClientStub();
    if (stubReturnsNull) {
      client.getSystemId.mockReturnValueOnce(null);
    }
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(client.post).toHaveBeenCalledWith('/auth/login', expectedBody);
  });

  test('/auth/permissions com payload inválido pós-login limpa sessão e propaga ApiError(parse)', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // Resposta sem campos obrigatórios — o type guard deve rejeitar.
    client.get.mockResolvedValueOnce({ permissions: [] } as unknown);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let captured: unknown;
    await act(async () => {
      try {
        await result.current.login('ada@lfc.com.br', 'secret');
      } catch (e) {
        captured = e;
      }
    });

    expect(captured).toMatchObject({ kind: 'parse' });
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });
});

describe('AuthProvider — logout', () => {
  test('limpa estado, token e cache após logout', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // 1ª chamada: /auth/permissions; 2ª: /auth/logout.
    client.get
      .mockResolvedValueOnce(SAMPLE_PERMISSIONS)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });
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
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    // Cache em IndexedDB também é limpo (best-effort, async).
    await waitFor(async () => {
      expect(await permissionsCache.load()).toBeNull();
    });
  });

  test('chama GET /auth/logout para invalidar tokenVersion remoto', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get
      .mockResolvedValueOnce(SAMPLE_PERMISSIONS)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenCalledWith('/auth/logout');
  });

  test('logout sem sessão ativa NÃO chama o endpoint remoto', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('falha de rede no logout remoto ainda limpa estado e storage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get
      .mockResolvedValueOnce(SAMPLE_PERMISSIONS)
      .mockRejectedValueOnce(NETWORK_ERROR);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

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

    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('logout em 401 (já deslogado no backend) limpa local sem warning', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get
      .mockResolvedValueOnce(SAMPLE_PERMISSIONS)
      .mockImplementationOnce(async () => {
        const config = lastCall(client.setAuth.mock.calls)?.[0];
        config?.onUnauthorized?.();
        throw UNAUTHORIZED_ERROR;
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('logout redireciona para /login após sucesso remoto', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    // Após Issue #122, hidratação de sessão persistida usa o cache local
    // (sem chamada de rede); logout ainda chama /auth/logout.
    client.get.mockResolvedValueOnce({ message: 'Sessão encerrada.' });

    let capturedPath = '';
    const PathProbe: React.FC = () => {
      const location = useLocation();
      capturedPath = location.pathname;
      return null;
    };

    const TriggerScreen: React.FC = () => {
      const authValue = useAuth();
      return (
        <>
          <PathProbe />
          <button
            type="button"
            data-testid="trigger-logout"
            onClick={() => {
              void authValue.logout();
            }}
          >
            sair
          </button>
        </>
      );
    };

    const LoginScreen: React.FC = () => (
      <>
        <PathProbe />
        <div data-testid="login-screen">login</div>
      </>
    );

    render(
      <MemoryRouter initialEntries={['/systems']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/systems" element={<TriggerScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(capturedPath).toBe('/systems'));

    await act(async () => {
      screen.getByTestId('trigger-logout').click();
    });

    await waitFor(() => expect(capturedPath).toBe('/login'));
    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });
});

describe('AuthProvider — hasPermission', () => {
  test('retorna false enquanto deslogado', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasPermission('perm:Systems.Read')).toBe(false);
  });

  test('retorna true para permissões presentes após login', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(result.current.hasPermission('perm:Systems.Read')).toBe(true);
    expect(result.current.hasPermission('perm:Systems.Create')).toBe(true);
    expect(result.current.hasPermission('perm:Systems.Delete')).toBe(false);
  });
});

describe('AuthProvider — onUnauthorized', () => {
  test('callback injetado no client limpa sessão quando disparado', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
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

describe('AuthProvider — hidratação (Issue #122)', () => {
  test('com cache vivo, hidrata SEM chamar /auth/permissions', async () => {
    await seedPersistedSession();
    const client = createClientStub();

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // Render inicial já é autenticado (otimista, antes do effect rodar).
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(true);

    // Aguarda o effect ler o cache de IndexedDB.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSION_CODES);
    // Cache hit: nenhuma chamada de rede.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('com cache vazio mas token presente, dispara /auth/permissions', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).toHaveBeenCalledWith(
      '/auth/permissions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSION_CODES);
  });

  test('sem token, NÃO chama /auth/permissions nem /auth/verify-token', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).not.toHaveBeenCalled();
  });

  test('hidratação com /auth/permissions em 401 limpa sessão', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createClientStub();
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { initialEntries: ['/systems'] }),
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('hidratação com falha de rede mantém sessão local intacta (warning)', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClientStub();
    client.get.mockRejectedValueOnce(NETWORK_ERROR);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Sessão local preservada — usuário continua autenticado.
    expect(result.current.isAuthenticated).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-persistido');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('renderiza splash enquanto hidratação está em curso (token sem cache)', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createClientStub();
    let resolveFetch: ((value: PermissionsResponse) => void) | null = null;
    client.get.mockImplementationOnce(
      () =>
        new Promise<PermissionsResponse>(resolve => {
          resolveFetch = resolve;
        }),
    );

    render(
      <MemoryRouter>
        <AuthProvider client={client} verifyIntervalMs={0}>
          <div data-testid="protected-content">conteúdo protegido</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('auth-splash')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // O Provider primeiro tenta `permissionsCache.load()` (assíncrono);
    // só depois cai em `client.get('/auth/permissions')`. Aguardamos a
    // chamada do client antes de tentar resolver o mock — sem isso, o
    // `resolveFetch` ainda é null e não dispara nada.
    await waitFor(() => expect(client.get).toHaveBeenCalled());
    await waitFor(() => expect(resolveFetch).not.toBeNull());

    await act(async () => {
      resolveFetch?.(SAMPLE_PERMISSIONS);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('auth-splash')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  test('sem token, NÃO exibe splash e renderiza children imediatamente', () => {
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

  test('unmount cancela /auth/permissions pendente via AbortController', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createClientStub();
    let abortSignal: AbortSignal | undefined;
    client.get.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
      abortSignal = options?.signal;
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(abortSignal).toBeDefined());
    expect(abortSignal?.aborted).toBe(false);

    unmount();
    expect(abortSignal?.aborted).toBe(true);
  });
});

describe('AuthProvider — verifyRoute (Issue #122 / adendo)', () => {
  test('200 retorna true e envia X-Route-Code', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValueOnce(VERIFY_OK);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(true);
    expect(client.get).toHaveBeenCalledWith(
      '/auth/verify-token',
      expect.objectContaining({
        headers: { 'X-Route-Code': 'AUTH_ADMIN_V1_SYSTEMS' },
      }),
    );
  });

  test('403 retorna false e redireciona para /error/403 com state.from', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockRejectedValueOnce(FORBIDDEN_ERROR);

    let capturedPath = '';
    let capturedFrom: string | undefined;
    const PathProbe: React.FC = () => {
      const location = useLocation();
      capturedPath = location.pathname;
      const state = location.state as { from?: { pathname?: string } } | null;
      capturedFrom = state?.from?.pathname;
      return null;
    };

    const TriggerScreen: React.FC = () => {
      const authValue = useAuth();
      const location = useLocation();
      return (
        <>
          <PathProbe />
          <button
            type="button"
            data-testid="trigger-verify"
            onClick={() => {
              void authValue.verifyRoute(
                'AUTH_ADMIN_V1_USERS',
                undefined,
                location.pathname,
              );
            }}
          >
            verificar
          </button>
        </>
      );
    };

    const ErrorScreen: React.FC = () => (
      <>
        <PathProbe />
        <div data-testid="forbidden-screen">403</div>
      </>
    );

    render(
      <MemoryRouter initialEntries={['/users']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route path="/users" element={<TriggerScreen />} />
            <Route path="/error/403" element={<ErrorScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(capturedPath).toBe('/users'));

    await act(async () => {
      screen.getByTestId('trigger-verify').click();
    });

    await waitFor(() => expect(capturedPath).toBe('/error/403'));
    expect(capturedFrom).toBe('/users');
  });

  test('falha de rede retorna true (libera navegação) e loga warning', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockRejectedValueOnce(NETWORK_ERROR);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('400 (Rota inválida) retorna true (libera navegação)', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'http',
      status: 400,
      message: 'Rota inválida.',
    } satisfies ApiError);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(true);
    warnSpy.mockRestore();
  });

  test('401 retorna false (cliente HTTP já limpou sessão)', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = true;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('sem token, retorna false sem chamar a rede', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = true;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(false);
    expect(client.get).not.toHaveBeenCalled();
  });

  test('payload inválido retorna true (libera navegação por segurança de UX)', async () => {
    await seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValueOnce({ valid: 'sim' } as unknown);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_ADMIN_V1_SYSTEMS');
    });

    expect(outcome).toBe(true);
  });
});
