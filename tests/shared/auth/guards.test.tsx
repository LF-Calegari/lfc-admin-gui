import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@/shared/api';
import type { AuthContextValue, VerifyTokenResponse } from '@/shared/auth';

import {
  AuthContext,
  AuthProvider,
  RequireAuth,
  RequirePermission,
} from '@/shared/auth';
import { STORAGE_KEYS } from '@/shared/auth/storage';

/**
 * Stub mínimo de `ApiClient`: nenhum teste daqui depende de transporte
 * real. `client.get` retorna por padrão uma Promise pendente para
 * evitar que `setState` da hidratação aconteça depois do teste capturar
 * a árvore (gera warnings de `act` em assertivas síncronas). O estado
 * otimista vindo de `localStorage` já é suficiente para os cenários
 * cobertos.
 */
function createClientStub(): ApiClient & {
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(),
    get: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
  } as unknown as ApiClient & {
    get: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
  };
}

/**
 * Espelha o contrato real do `auth-service`: payload achatado com
 * `id/name/email/identity` + `permissions: Guid[]` +
 * `permissionCodes: string[]` + `routeCodes: string[]`. Mantemos o tipo
 * aqui apenas para documentar o shape; nenhum teste deste arquivo
 * dispara o verify-token de fato (o stub de `client.get` devolve
 * Promise pendente por padrão para evitar setState pós-assert).
 */
const VERIFY_RESPONSE: VerifyTokenResponse = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@lfc.com.br',
  identity: 42,
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read'],
  routeCodes: ['KURTTO_V1_URLS_HOME'],
};

/**
 * Projeção de `User` derivada do verify (id/name/email/identity) — usada
 * nos asserts e no seed do `localStorage` para garantir que o shape
 * gravado bate com o que o Provider espera ler na hidratação.
 */
const VERIFY_USER = {
  id: VERIFY_RESPONSE.id,
  name: VERIFY_RESPONSE.name,
  email: VERIFY_RESPONSE.email,
  identity: VERIFY_RESPONSE.identity,
};

/**
 * Pré-popula `localStorage` com sessão válida — espelha o setup usado
 * em `tests/shared/auth/AuthProvider.test.tsx` para os cenários de
 * hidratação otimista.
 */
function seedSession(permissions: ReadonlyArray<string> = ['perm:Systems.Read']): void {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-test');
  window.localStorage.setItem(
    STORAGE_KEYS.user,
    JSON.stringify({
      user: VERIFY_USER,
      permissions,
    }),
  );
}

/**
 * Sonda que captura o pathname e o `state.from` recebidos pela rota
 * destino. Permite asserir o redirect e a preservação do `state` sem
 * mocar o `Navigate`.
 */
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
  window.localStorage.clear();
});

describe('RequireAuth', () => {
  it('renderiza children quando o usuário está autenticado', () => {
    seedSession();
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
    // Cenário: hidratação inicial com sessão local presente. O Provider
    // marca `isAuthenticated: true, isLoading: true` enquanto o
    // `verify-token` está em curso. O guard deve permitir o render para
    // não bloquear a árvore (a splash do Provider cobre o intervalo em
    // produção; aqui usamos `disableSplash` para testar o guard isolado).
    const value: AuthContextValue = {
      user: { id: 'u-1', name: 'Ada', email: 'ada@lfc.com.br', identity: 42 },
      permissions: ['perm:Systems.Read'],
      isAuthenticated: true,
      isLoading: true,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      hasPermission: (code: string) => code === 'perm:Systems.Read',
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
    // Cenário defensivo: `isLoading: true` com `isAuthenticated: false`.
    // Não renderiza children nem dispara redirect prematuro.
    const value: AuthContextValue = {
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      hasPermission: () => false,
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
});

/**
 * Helper local para reduzir duplicação dos cenários de `RequirePermission`.
 * Concentra o boilerplate `MemoryRouter` + `AuthProvider` + `Routes` +
 * `Route` + `RequirePermission` + `Route /error/:code` em um único lugar.
 *
 * Pontos de variação cobertos:
 * - `protectedRoute` / `initialEntries` para roteamento.
 * - `code` exigido pelo guard.
 * - `sessionPermissions` para o `seedSession` (ou seed vazio com `[]`).
 * - `protectedTestId` / `protectedLabel` para o conteúdo protegido.
 * - `errorTestId` para o conteúdo de fallback.
 * - `withProbe` para anexar a sonda de location na rota `/error/:code`
 *   quando o teste asserir o redirect (`captured.current?.pathname`).
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

function renderRequirePermissionScenario(
  options: RenderRequirePermissionOptions,
): RenderRequirePermissionResult {
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

  seedSession(sessionPermissions);
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

/**
 * Tabela de cenários do `RequirePermission`. Cada caso é um teste
 * independente, mas o esqueleto (chamada do helper + asserts de
 * presença/ausência + assert opcional do redirect) é idêntico, então
 * usamos `it.each` para colapsar a repetição estrutural — preservando
 * a granularidade dos testes (1 caso = 1 `it`) sem mudar o que cada
 * cenário valida.
 *
 * - `expectsContent: true` → permissão satisfeita; conteúdo protegido
 *   aparece e a `error-page` não aparece.
 * - `expectsContent: false` → permissão ausente; `error-page` aparece
 *   e o conteúdo protegido não. Quando `expectedRedirectPath` é
 *   informado, asserimos também o pathname capturado pela sonda (e o
 *   helper é instruído a anexá-la via `withProbe`).
 */
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
    // Sessão sem nenhum code: sempre 403 em rotas com gating.
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
    // Caso explícito do contrato pós-#116: o code precisa bater
    // exatamente com o item em `permissions` (alimentado por
    // `permissionCodes` do verify-token). Usar o nome `SystemsRoutes`
    // do backend valida que os codes não-óbvios também são respeitados.
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
    // Cenário do bug original (#116): se o catálogo `permissions` no
    // estado vier sem o code exato esperado pelo guard, o usuário cai
    // em 403 — confirmando que o match continua estritamente por igualdade.
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
  it.each(REQUIRE_PERMISSION_CASES)('$name', ({ options, expectsContent, expectedRedirectPath }) => {
    const { captured } = renderRequirePermissionScenario(options);
    const protectedQuery = screen.queryByTestId(options.protectedTestId);
    const errorQuery = screen.queryByTestId(options.errorTestId ?? 'error-page');

    if (expectsContent) {
      expect(protectedQuery).toBeInTheDocument();
      expect(errorQuery).not.toBeInTheDocument();
    } else {
      expect(protectedQuery).not.toBeInTheDocument();
      expect(errorQuery).toBeInTheDocument();
    }

    if (expectedRedirectPath !== undefined) {
      expect(captured.current?.pathname).toBe(expectedRedirectPath);
    }
  });
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

    // Sem sessão: o guard externo intercepta antes do RequirePermission.
    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('error-page')).not.toBeInTheDocument();
    expect(captured.current?.fromPathname).toBe('/users');
  });
});
