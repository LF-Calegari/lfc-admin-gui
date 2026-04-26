import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from './__helpers__/fakeIndexedDB';

import type { ApiClient } from '@/shared/api';
import type {
  AuthContextValue,
  CachedPermissions,
  PermissionsResponse,
  VerifyTokenResponse,
} from '@/shared/auth';

import {
  AuthContext,
  AuthProvider,
  RequireAuth,
  RequirePermission,
} from '@/shared/auth';
import { permissionsCache } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';


/**
 * Stub mínimo de `ApiClient`: nenhum teste daqui depende de transporte
 * real. `client.get` retorna por padrão uma Promise pendente para
 * evitar que `setState` da hidratação aconteça depois do teste capturar
 * a árvore (gera warnings de `act` em assertivas síncronas). O estado
 * otimista vindo do cache em IndexedDB já é suficiente para os cenários
 * cobertos.
 */
function createClientStub(): ApiClient & {
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(),
    get: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  } as unknown as ApiClient & {
    get: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
    getSystemId: ReturnType<typeof vi.fn>;
  };
}

/**
 * Espelha o contrato do `lfc-authenticator` no novo split (Issue #122):
 * `/auth/permissions` carrega o catálogo completo. Mantemos o tipo aqui
 * apenas para documentar o shape; nenhum teste deste arquivo dispara o
 * endpoint de fato (o stub de `client.get` devolve Promise pendente por
 * padrão para evitar setState pós-assert).
 */
const PERMISSIONS_RESPONSE: PermissionsResponse = {
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
    identity: 42,
  },
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read'],
  routeCodes: ['AUTH_ADMIN_V1_SYSTEMS'],
};

const VERIFY_USER = PERMISSIONS_RESPONSE.user;

/**
 * Resposta de `verify-token` usada nos cenários do `RequireAuth` quando
 * o teste precisa permitir que o disparo automático de verify-token na
 * mudança de rota resolva sem efeito colateral observável.
 */
const VERIFY_OK: VerifyTokenResponse = {
  valid: true,
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T01:00:00Z',
};

/**
 * Pré-popula token (`localStorage`) e catálogo (IndexedDB).
 */
async function seedSession(
  permissionCodes: ReadonlyArray<string> = ['perm:Systems.Read'],
): Promise<void> {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-test');
  await permissionsCache.save({
    user: VERIFY_USER,
    permissions: PERMISSIONS_RESPONSE.permissions,
    permissionCodes,
    routeCodes: PERMISSIONS_RESPONSE.routeCodes,
  } as Omit<CachedPermissions, 'cachedAt'>);
}

interface CapturedLocation {
  pathname: string;
  fromPathname?: string;
}

function makeLocationProbe(captured: { current: CapturedLocation | null }): React.FC {
  const Probe: React.FC = () => {
    const location = useLocation();
    const fromPathname =
      location.state &&
      typeof location.state === 'object' &&
      'from' in location.state &&
      location.state.from &&
      typeof (location.state as { from: { pathname?: string } }).from === 'object'
        ? (location.state as { from: { pathname?: string } }).from.pathname
        : undefined;
    captured.current = {
      pathname: location.pathname,
      fromPathname,
    };
    return null;
  };
  Probe.displayName = 'LocationProbe';
  return Probe;
}

beforeEach(() => {
  installFakeIndexedDB();
  window.localStorage.clear();
});

afterEach(() => {
  uninstallFakeIndexedDB();
});

describe('RequireAuth', () => {
  it('renderiza children quando o usuário está autenticado', async () => {
    await seedSession();
    const client = createClientStub();

    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route
              path="/private"
              element={
                <RequireAuth>
                  <div data-testid="private-content">conteúdo protegido</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div data-testid="login-screen">login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('private-content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
  });

  it('redireciona para /login preservando state.from quando deslogado', () => {
    const client = createClientStub();
    const captured = { current: null as CapturedLocation | null };
    const LoginProbe = makeLocationProbe(captured);

    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route
              path="/private"
              element={
                <RequireAuth>
                  <div data-testid="private-content">não deveria aparecer</div>
                </RequireAuth>
              }
            />
            <Route
              path="/login"
              element={
                <>
                  <LoginProbe />
                  <div data-testid="login-screen">login</div>
                </>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
    expect(captured.current?.pathname).toBe('/login');
    expect(captured.current?.fromPathname).toBe('/private');
  });

  it('preserva o pathname original mesmo em rotas aninhadas', () => {
    const client = createClientStub();
    const captured = { current: null as CapturedLocation | null };
    const LoginProbe = makeLocationProbe(captured);

    render(
      <MemoryRouter initialEntries={['/admin/users/42']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route
              path="/admin/users/:id"
              element={
                <RequireAuth>
                  <div>private</div>
                </RequireAuth>
              }
            />
            <Route
              path="/login"
              element={
                <>
                  <LoginProbe />
                  <div>login</div>
                </>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(captured.current?.fromPathname).toBe('/admin/users/42');
  });

  it('renderiza children com sessão otimista mesmo enquanto isLoading=true', () => {
    const value: AuthContextValue = {
      user: { id: 'u-1', name: 'Ada', email: 'ada@lfc.com.br', identity: 42 },
      permissions: ['perm:Systems.Read'],
      isAuthenticated: true,
      isLoading: true,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      hasPermission: (code: string) => code === 'perm:Systems.Read',
      verifyRoute: vi.fn().mockResolvedValue(true),
    };

    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthContext.Provider value={value}>
          <Routes>
            <Route
              path="/private"
              element={
                <RequireAuth>
                  <div data-testid="private-content">conteúdo protegido</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div data-testid="login-screen">login</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('private-content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
  });

  it('retorna null durante isLoading sem sessão (transição rara, sem flicker)', () => {
    const value: AuthContextValue = {
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      hasPermission: () => false,
      verifyRoute: vi.fn().mockResolvedValue(true),
    };

    const { container } = render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthContext.Provider value={value}>
          <Routes>
            <Route
              path="/private"
              element={
                <RequireAuth>
                  <div data-testid="private-content">conteúdo protegido</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div data-testid="login-screen">login</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  describe('verify-token por navegação (Issue #122 / adendo)', () => {
    it('dispara verifyRoute com X-Route-Code da rota destino', async () => {
      const verifyRouteMock = vi.fn().mockResolvedValue(true);
      const value: AuthContextValue = {
        user: VERIFY_USER,
        permissions: ['perm:Systems.Read'],
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        hasPermission: () => true,
        verifyRoute: verifyRouteMock,
      };

      render(
        <MemoryRouter initialEntries={['/systems']}>
          <AuthContext.Provider value={value}>
            <Routes>
              <Route
                path="/systems"
                element={
                  <RequireAuth>
                    <div data-testid="systems-page">systems</div>
                  </RequireAuth>
                }
              />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(verifyRouteMock).toHaveBeenCalledWith(
          'AUTH_ADMIN_V1_SYSTEMS',
          expect.any(AbortSignal),
          '/systems',
        );
      });
    });

    it('não dispara verifyRoute quando a rota não está mapeada', async () => {
      const verifyRouteMock = vi.fn().mockResolvedValue(true);
      const value: AuthContextValue = {
        user: VERIFY_USER,
        permissions: ['perm:Systems.Read'],
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        hasPermission: () => true,
        verifyRoute: verifyRouteMock,
      };

      render(
        <MemoryRouter initialEntries={['/rota-nao-mapeada']}>
          <AuthContext.Provider value={value}>
            <Routes>
              <Route
                path="*"
                element={
                  <RequireAuth>
                    <div data-testid="content">x</div>
                  </RequireAuth>
                }
              />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      // Aguarda um pouco para garantir que NENHUMA chamada aconteceu.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(verifyRouteMock).not.toHaveBeenCalled();
    });

    it('cancela request anterior via AbortController em navegações rápidas', async () => {
      const abortSignals: AbortSignal[] = [];
      const verifyRouteMock = vi.fn().mockImplementation(
        async (_code: string, signal?: AbortSignal) => {
          if (signal) abortSignals.push(signal);
          return true;
        },
      );
      const value: AuthContextValue = {
        user: VERIFY_USER,
        permissions: ['perm:Systems.Read', 'perm:Users.Read'],
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        hasPermission: () => true,
        verifyRoute: verifyRouteMock,
      };

      // Componente com botão que dispara navegação real via useNavigate
      // — `initialEntries` só inicializa o histórico no mount, então
      // `rerender` com novo array não muda a rota; navegar via hook
      // simula corretamente a transição de rotas.
      const NavigationTrigger: React.FC<{ to: string }> = ({ to }) => {
        const navigate = useNavigate();
        return (
          <button
            type="button"
            data-testid={`go-${to.replace('/', '')}`}
            onClick={() => navigate(to)}
          >
            ir para {to}
          </button>
        );
      };

      render(
        <MemoryRouter initialEntries={['/systems']}>
          <AuthContext.Provider value={value}>
            <Routes>
              <Route
                path="/systems"
                element={
                  <RequireAuth>
                    <NavigationTrigger to="/users" />
                  </RequireAuth>
                }
              />
              <Route
                path="/users"
                element={
                  <RequireAuth>
                    <div data-testid="users-page">users</div>
                  </RequireAuth>
                }
              />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      await waitFor(() => expect(verifyRouteMock).toHaveBeenCalledTimes(1));

      // Navega para /users via botão (mudança real de pathname).
      await act(async () => {
        screen.getByTestId('go-users').click();
      });

      await waitFor(() => expect(verifyRouteMock).toHaveBeenCalledTimes(2));
      // O primeiro signal (rota /systems) foi cancelado pelo cleanup do
      // effect ao navegar para /users.
      expect(abortSignals[0]?.aborted).toBe(true);
    });

    it('não dispara verifyRoute quando deslogado', async () => {
      const verifyRouteMock = vi.fn().mockResolvedValue(true);
      const value: AuthContextValue = {
        user: null,
        permissions: [],
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        hasPermission: () => false,
        verifyRoute: verifyRouteMock,
      };

      render(
        <MemoryRouter initialEntries={['/systems']}>
          <AuthContext.Provider value={value}>
            <Routes>
              <Route
                path="/systems"
                element={
                  <RequireAuth>
                    <div>x</div>
                  </RequireAuth>
                }
              />
              <Route path="/login" element={<div>login</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(verifyRouteMock).not.toHaveBeenCalled();
    });

    it('integração: AuthProvider real envia X-Route-Code para a rota corrente', async () => {
      await seedSession(['perm:Systems.Read']);
      const client = createClientStub();
      // Reset para resolver imediatamente em vez de Promise pendente.
      client.get.mockReset();
      client.get.mockResolvedValue(VERIFY_OK);

      render(
        <MemoryRouter initialEntries={['/systems']}>
          <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
            <Routes>
              <Route
                path="/systems"
                element={
                  <RequireAuth>
                    <div data-testid="systems-page">systems</div>
                  </RequireAuth>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      await act(async () => {
        await waitFor(() => {
          expect(client.get).toHaveBeenCalledWith(
            '/auth/verify-token',
            expect.objectContaining({
              headers: { 'X-Route-Code': 'AUTH_ADMIN_V1_SYSTEMS' },
            }),
          );
        });
      });
    });
  });
});

/**
 * Helper local para reduzir duplicação dos cenários de `RequirePermission`.
 * Concentra o boilerplate `MemoryRouter` + `AuthProvider` + `Routes` +
 * `Route` + `RequirePermission` + `Route /error/:code` em um único lugar.
 */
interface RenderRequirePermissionOptions {
  protectedRoute: string;
  initialEntries?: string[];
  code: string;
  sessionPermissions: ReadonlyArray<string>;
  protectedTestId: string;
  protectedLabel: string;
  errorTestId?: string;
  withProbe?: boolean;
}

interface RenderRequirePermissionResult {
  captured: { current: CapturedLocation | null };
}

async function renderRequirePermissionScenario(
  options: RenderRequirePermissionOptions,
): Promise<RenderRequirePermissionResult> {
  const {
    protectedRoute,
    initialEntries = [protectedRoute],
    code,
    sessionPermissions,
    protectedTestId,
    protectedLabel,
    errorTestId = 'error-page',
    withProbe = false,
  } = options;

  await seedSession(sessionPermissions);
  const client = createClientStub();
  const captured = { current: null as CapturedLocation | null };
  const ErrorProbe = makeLocationProbe(captured);

  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
        <Routes>
          <Route
            path={protectedRoute}
            element={
              <RequirePermission code={code}>
                <div data-testid={protectedTestId}>{protectedLabel}</div>
              </RequirePermission>
            }
          />
          <Route
            path="/error/:code"
            element={
              withProbe ? (
                <>
                  <ErrorProbe />
                  <div data-testid={errorTestId}>erro</div>
                </>
              ) : (
                <div data-testid={errorTestId}>erro</div>
              )
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  return { captured };
}

interface RequirePermissionCase {
  name: string;
  options: RenderRequirePermissionOptions;
  expectsContent: boolean;
  expectedRedirectPath?: string;
}

const REQUIRE_PERMISSION_CASES: ReadonlyArray<RequirePermissionCase> = [
  {
    name: 'renderiza children quando a permissão exigida está presente',
    options: {
      protectedRoute: '/users',
      code: 'perm:Users.Read',
      sessionPermissions: ['perm:Systems.Read', 'perm:Users.Read'],
      protectedTestId: 'users-page',
      protectedLabel: 'users',
    },
    expectsContent: true,
  },
  {
    name: 'redireciona para /error/403 quando o code não está presente',
    options: {
      protectedRoute: '/users',
      code: 'perm:Users.Read',
      sessionPermissions: ['perm:Systems.Read'],
      protectedTestId: 'users-page',
      protectedLabel: 'users',
      withProbe: true,
    },
    expectsContent: false,
    expectedRedirectPath: '/error/403',
  },
  {
    name: 'redireciona para /error/403 quando o usuário não tem permissões',
    options: {
      protectedRoute: '/permissions',
      code: 'perm:Permissions.Read',
      sessionPermissions: [],
      protectedTestId: 'permissions-page',
      protectedLabel: 'permissões',
    },
    expectsContent: false,
  },
  {
    name: 'renderiza children com o code exato presente em permissionCodes',
    options: {
      protectedRoute: '/routes',
      code: 'perm:SystemsRoutes.Read',
      sessionPermissions: ['perm:SystemsRoutes.Read', 'perm:Systems.Read'],
      protectedTestId: 'routes-page',
      protectedLabel: 'rotas',
    },
    expectsContent: true,
  },
  {
    name: 'redireciona para /error/403 quando o code com prefixo perm: não existe em permissionCodes',
    options: {
      protectedRoute: '/tokens',
      code: 'perm:SystemTokensTypes.Read',
      sessionPermissions: ['perm:Systems.Read'],
      protectedTestId: 'tokens-page',
      protectedLabel: 'tokens',
      withProbe: true,
    },
    expectsContent: false,
    expectedRedirectPath: '/error/403',
  },
];

describe('RequirePermission', () => {
  it.each(REQUIRE_PERMISSION_CASES)(
    '$name',
    async ({ options, expectsContent, expectedRedirectPath }) => {
      const { captured } = await renderRequirePermissionScenario(options);
      // Após a Issue #122, a hidratação do catálogo é assíncrona — espera
      // o conteúdo certo aparecer antes de afirmar.
      await waitFor(() => {
        const protectedQuery = screen.queryByTestId(options.protectedTestId);
        const errorQuery = screen.queryByTestId(options.errorTestId ?? 'error-page');
        if (expectsContent) {
          expect(protectedQuery).toBeInTheDocument();
          expect(errorQuery).not.toBeInTheDocument();
        } else {
          expect(protectedQuery).not.toBeInTheDocument();
          expect(errorQuery).toBeInTheDocument();
        }
      });

      if (expectedRedirectPath !== undefined) {
        expect(captured.current?.pathname).toBe(expectedRedirectPath);
      }
    },
  );
});

describe('RequireAuth + RequirePermission combinados', () => {
  it('redireciona para /login quando deslogado, sem chegar no 403', () => {
    const client = createClientStub();
    const captured = { current: null as CapturedLocation | null };
    const LoginProbe = makeLocationProbe(captured);

    render(
      <MemoryRouter initialEntries={['/users']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route
              path="/users"
              element={
                <RequireAuth>
                  <RequirePermission code="perm:Users.Read">
                    <div data-testid="users-page">users</div>
                  </RequirePermission>
                </RequireAuth>
              }
            />
            <Route
              path="/login"
              element={
                <>
                  <LoginProbe />
                  <div data-testid="login-screen">login</div>
                </>
              }
            />
            <Route
              path="/error/:code"
              element={<div data-testid="error-page">erro</div>}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('error-page')).not.toBeInTheDocument();
    expect(captured.current?.fromPathname).toBe('/users');
  });
});
