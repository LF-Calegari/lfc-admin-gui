import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createAuthClientStub,
  FORBIDDEN_ERROR,
  lastCall,
  loginInHook,
  makeAuthWrapper,
  mockSuccessfulLogin,
  NETWORK_ERROR,
  renderAuthHook,
  renderAuthTree,
  SAMPLE_LOGIN,
  SAMPLE_PERMISSION_CODES,
  SAMPLE_PERMISSIONS,
  SAMPLE_USER,
  seedPersistedSession,
  setupLoggedInProvider,
  STUB_SYSTEM_ID,
  UNAUTHORIZED_ERROR,
  VERIFY_OK,
} from './__helpers__/authTestHelpers';
import {
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from './__helpers__/fakeIndexedDB';


import type { ApiError } from '@/shared/api';
import type { PermissionsResponse } from '@/shared/auth';

import { AuthProvider, useAuth } from '@/shared/auth';
import { permissionsCache } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';

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
    const client = createAuthClientStub();
    const { result } = await renderAuthHook(client);

    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isAuthenticated).toBe(false);
    // Sem token, NÃO chama nem /auth/permissions nem /auth/verify-token.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('injeta getToken e onUnauthorized no client via setAuth', () => {
    const client = createAuthClientStub();
    renderHook(() => useAuth(), { wrapper: makeAuthWrapper(client) });

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
    const client = createAuthClientStub();
    renderHook(() => useAuth(), { wrapper: makeAuthWrapper(client) });

    expect(window.localStorage.getItem(STORAGE_KEYS.legacyUser)).toBeNull();
  });
});

describe('AuthProvider — login (Issue #122)', () => {
  test('caminho feliz: encadeia POST /auth/login + GET /auth/permissions e popula estado', async () => {
    const client = createAuthClientStub();
    mockSuccessfulLogin(client);
    const { result } = await renderAuthHook(client);

    await loginInHook(result);

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
    const { result: _ } = await setupLoggedInProvider();

    // Aguarda o `void permissionsCache.save(...)` resolver.
    await waitFor(async () => {
      const cached = await permissionsCache.load();
      expect(cached?.user.email).toBe('ada@lfc.com.br');
    });
    const cached = await permissionsCache.load();
    expect(cached?.routes).toEqual(SAMPLE_PERMISSIONS.routes);
    void _;
  });

  test('login persiste token em localStorage', async () => {
    await setupLoggedInProvider();

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');
  });

  test('tokenRef é setado ANTES do /auth/permissions (header Authorization presente)', async () => {
    const client = createAuthClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);

    let tokenAtPermissions: string | null | undefined;
    client.get.mockImplementationOnce(async () => {
      tokenAtPermissions = lastCall(client.setAuth.mock.calls)?.[0]?.getToken?.();
      return SAMPLE_PERMISSIONS;
    });

    const { result } = await renderAuthHook(client);
    await loginInHook(result);

    expect(tokenAtPermissions).toBe('jwt-xyz');
  });

  test('falha de credenciais propaga ApiError e mantém estado deslogado', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    };
    const client = createAuthClientStub();
    client.post.mockRejectedValueOnce(apiError);
    const { result } = await renderAuthHook(client);

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
    const client = createAuthClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockRejectedValueOnce(NETWORK_ERROR);
    const { result } = await renderAuthHook(client);

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
    const client = createAuthClientStub();
    if (stubReturnsNull) {
      client.getSystemId.mockReturnValueOnce(null);
    }
    mockSuccessfulLogin(client);
    const { result } = await renderAuthHook(client);
    await loginInHook(result);

    expect(client.post).toHaveBeenCalledWith('/auth/login', expectedBody);
  });

  test('/auth/permissions com payload inválido pós-login limpa sessão e propaga ApiError(parse)', async () => {
    const client = createAuthClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // Resposta sem `routes`/`user` — o type guard deve rejeitar.
    client.get.mockResolvedValueOnce({ routes: 'no' } as unknown);
    const { result } = await renderAuthHook(client);

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
  /**
   * Tabela colapsando 3 cenários do logout que diferiam apenas no
   * mock da 2ª chamada `client.get` (sucesso, falha de rede, 401).
   * Asserts comuns: estado/storage limpos. Variações: presença/ausência
   * de warning no console.
   */
  const LOGOUT_OUTCOMES = [
    {
      name: 'limpa estado, token e cache após logout (sucesso remoto)',
      mockSecondGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockResolvedValueOnce({ message: 'Sessão encerrada.' }),
      expectsWarning: false,
    },
    {
      name: 'falha de rede no logout remoto ainda limpa estado e storage',
      mockSecondGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockRejectedValueOnce(NETWORK_ERROR),
      expectsWarning: true,
    },
  ] as const;

  test.each(LOGOUT_OUTCOMES)('$name', async ({ mockSecondGet, expectsWarning }) => {
    const client = createAuthClientStub();
    mockSuccessfulLogin(client);
    mockSecondGet(client.get);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = await renderAuthHook(client);
    await loginInHook(result);
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    if (expectsWarning) {
      expect(warnSpy).toHaveBeenCalled();
    } else {
      expect(warnSpy).not.toHaveBeenCalled();
    }
    // Cache em IndexedDB também é limpo (best-effort, async).
    await waitFor(async () => {
      expect(await permissionsCache.load()).toBeNull();
    });

    warnSpy.mockRestore();
  });

  test('logout sem sessão ativa NÃO chama o endpoint remoto', async () => {
    const client = createAuthClientStub();
    const { result } = await renderAuthHook(client);

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('logout em 401 (já deslogado no backend) limpa local sem warning', async () => {
    const client = createAuthClientStub();
    mockSuccessfulLogin(client);
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = await renderAuthHook(client);
    await loginInHook(result);

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
    const client = createAuthClientStub();
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

    renderAuthTree(
      client,
      {
        '/login': (
          <>
            <PathProbe />
            <div data-testid="login-screen">login</div>
          </>
        ),
        '/systems': <TriggerScreen />,
      },
      '/systems',
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
    const client = createAuthClientStub();
    const { result } = await renderAuthHook(client);

    expect(result.current.hasPermission('AUTH_V1_SYSTEMS_LIST')).toBe(false);
  });

  test('retorna true para codes presentes em routes após login', async () => {
    const { result } = await setupLoggedInProvider();

    expect(result.current.hasPermission('AUTH_V1_SYSTEMS_LIST')).toBe(true);
    expect(result.current.hasPermission('AUTH_V1_SYSTEMS_CREATE')).toBe(true);
    expect(result.current.hasPermission('AUTH_V1_SYSTEMS_DELETE')).toBe(false);
  });
});

describe('AuthProvider — onUnauthorized', () => {
  test('callback injetado no client limpa sessão quando disparado', async () => {
    const { client, result } = await setupLoggedInProvider();
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
    const client = createAuthClientStub();
    const { result } = await renderAuthHook(client);

    // Após hidratação, o estado reflete o cache.
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSION_CODES);
    expect(result.current.isAuthenticated).toBe(true);
    // Cache hit: nenhuma chamada de rede.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('com cache vazio mas token presente, dispara /auth/permissions', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createAuthClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);

    const { result } = await renderAuthHook(client);

    expect(client.get).toHaveBeenCalledWith(
      '/auth/permissions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSION_CODES);
  });

  test('sem token, NÃO chama /auth/permissions nem /auth/verify-token', async () => {
    const client = createAuthClientStub();
    await renderAuthHook(client);

    expect(client.get).not.toHaveBeenCalled();
  });

  test('hidratação com /auth/permissions em 401 limpa sessão', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createAuthClientStub();
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeAuthWrapper(client, { initialEntries: ['/systems'] }),
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('hidratação com falha de rede mantém sessão local intacta (warning)', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createAuthClientStub();
    client.get.mockRejectedValueOnce(NETWORK_ERROR);

    const { result } = await renderAuthHook(client);

    // Sessão local preservada — usuário continua autenticado.
    expect(result.current.isAuthenticated).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-persistido');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('renderiza splash enquanto hidratação está em curso (token sem cache)', async () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    const client = createAuthClientStub();
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
    const client = createAuthClientStub();
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
    const client = createAuthClientStub();
    let abortSignal: AbortSignal | undefined;
    client.get.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
      abortSignal = options?.signal;
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeAuthWrapper(client),
    });

    await waitFor(() => expect(abortSignal).toBeDefined());
    expect(abortSignal?.aborted).toBe(false);

    unmount();
    expect(abortSignal?.aborted).toBe(true);
  });
});

describe('AuthProvider — verifyRoute (Issue #122 / adendo)', () => {
  /**
   * Tabela colapsando 4 cenários do `verifyRoute` que diferiam apenas
   * em (mock do client.get, retorno esperado, presença de warning).
   * Os asserts comuns ficam concentrados no `it.each` — variações
   * específicas (redirect 403, sessão limpa em 401) ficam em testes
   * dedicados abaixo.
   */
  const VERIFY_OUTCOMES = [
    {
      name: '200 retorna true e envia X-Route-Code',
      mockGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockResolvedValueOnce(VERIFY_OK),
      expectedOutcome: true,
      expectsWarning: false,
    },
    {
      name: 'falha de rede retorna true (libera navegação) e loga warning',
      mockGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockRejectedValueOnce(NETWORK_ERROR),
      expectedOutcome: true,
      expectsWarning: true,
    },
    {
      name: '400 (Rota inválida) retorna true (libera navegação)',
      mockGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockRejectedValueOnce({
          kind: 'http',
          status: 400,
          message: 'Rota inválida.',
        } satisfies ApiError),
      expectedOutcome: true,
      expectsWarning: true,
    },
    {
      name: 'payload inválido retorna true (libera navegação por segurança de UX)',
      mockGet: (get: ReturnType<typeof vi.fn>) =>
        get.mockResolvedValueOnce({ valid: 'sim' } as unknown),
      expectedOutcome: true,
      expectsWarning: false,
    },
  ] as const;

  test.each(VERIFY_OUTCOMES)('$name', async ({ mockGet, expectedOutcome, expectsWarning }) => {
    await seedPersistedSession();
    const client = createAuthClientStub();
    mockGet(client.get);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = await renderAuthHook(client);

    let outcome = false;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_V1_SYSTEMS_LIST');
    });

    expect(outcome).toBe(expectedOutcome);
    if (expectsWarning) {
      expect(warnSpy).toHaveBeenCalled();
    }
    warnSpy.mockRestore();
  });

  test('200 envia X-Route-Code no header (asserção isolada do payload)', async () => {
    await seedPersistedSession();
    const client = createAuthClientStub();
    client.get.mockResolvedValueOnce(VERIFY_OK);

    const { result } = await renderAuthHook(client);
    await act(async () => {
      await result.current.verifyRoute('AUTH_V1_SYSTEMS_LIST');
    });

    expect(client.get).toHaveBeenCalledWith(
      '/auth/verify-token',
      expect.objectContaining({
        headers: { 'X-Route-Code': 'AUTH_V1_SYSTEMS_LIST' },
      }),
    );
  });

  test('403 retorna false e redireciona para /error/403 com state.from', async () => {
    await seedPersistedSession();
    const client = createAuthClientStub();
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
                'AUTH_V1_USERS_LIST',
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

    renderAuthTree(
      client,
      {
        '/users': <TriggerScreen />,
        '/error/403': (
          <>
            <PathProbe />
            <div data-testid="forbidden-screen">403</div>
          </>
        ),
      },
      '/users',
    );

    await waitFor(() => expect(capturedPath).toBe('/users'));

    await act(async () => {
      screen.getByTestId('trigger-verify').click();
    });

    await waitFor(() => expect(capturedPath).toBe('/error/403'));
    expect(capturedFrom).toBe('/users');
  });

  test('401 retorna false (cliente HTTP já limpou sessão)', async () => {
    await seedPersistedSession();
    const client = createAuthClientStub();
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = await renderAuthHook(client);

    let outcome = true;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_V1_SYSTEMS_LIST');
    });

    expect(outcome).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('sem token, retorna false sem chamar a rede', async () => {
    const client = createAuthClientStub();
    const { result } = await renderAuthHook(client);

    let outcome = true;
    await act(async () => {
      outcome = await result.current.verifyRoute('AUTH_V1_SYSTEMS_LIST');
    });

    expect(outcome).toBe(false);
    expect(client.get).not.toHaveBeenCalled();
  });
});
