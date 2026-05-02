import { act, render, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import type { ApiClient, ApiError } from '@/shared/api';
import type {
  CachedPermissions,
  LoginResponse,
  PermissionsResponse,
  VerifyTokenResponse,
} from '@/shared/auth';
import type { RenderHookResult } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/shared/auth';
import { permissionsCache } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';


/**
 * UUID fake usado pelos stubs nos testes do auth — coincide com o que
 * o `AuthContext.login()` espera ler via `client.getSystemId()` para
 * popular o body do POST `/auth/login` (Issue #118).
 */
export const STUB_SYSTEM_ID = 'system-test-uuid';

/**
 * Stub completo de `ApiClient` para testes do Provider.
 *
 * `getSystemId` retorna `STUB_SYSTEM_ID` por padrão para que asserts
 * sobre o body do `/auth/login` capturem o campo `systemId`.
 */
export type ApiClientStub = ApiClient & {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
};

export function createAuthClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => STUB_SYSTEM_ID),
  } as unknown as ApiClientStub;
}

/**
 * Variante "inerte" do stub — `client.get` devolve Promise pendente
 * por default. Útil em testes do `RequireAuth`/`AppLayout` que não
 * precisam que `verify-token` ou `/auth/permissions` resolvam para
 * pintar a árvore (estado otimista vindo do cache já é suficiente).
 *
 * Mantém a assinatura de `ApiClientStub` exposta para rebinding em
 * testes que precisem mockar respostas específicas.
 */
export function createInertAuthClientStub(): ApiClientStub {
  const stub = createAuthClientStub();
  stub.get.mockImplementation(() => new Promise<never>(() => undefined));
  return stub;
}

/**
 * Acessa a última chamada registrada por um mock — alternativa a
 * `Array.prototype.at(-1)`, que exige `lib: ES2022`. Mantém compat
 * com o `target: ES2020` do projeto.
 */
export function lastCall<T>(mockCalls: ReadonlyArray<T>): T | undefined {
  return mockCalls.length > 0 ? mockCalls[mockCalls.length - 1] : undefined;
}

interface WrapperOptions {
  initialEntries?: ReadonlyArray<string>;
  verifyIntervalMs?: number;
  /**
   * `false` por padrão nos testes de hook (`renderHook` precisa que o
   * children renderize sempre, senão `result.current` fica `null`
   * enquanto a splash está visível).
   */
  disableSplash?: boolean;
}

/**
 * Wrapper que monta o Provider com o cliente injetado e
 * `MemoryRouter` para satisfazer o `useNavigate` interno.
 */
export function makeAuthWrapper(client: ApiClient, options: WrapperOptions = {}) {
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
 * Monta o `AuthProvider` via `renderHook(() => useAuth())` e aguarda a
 * hidratação inicial concluir (`isLoading=false`). Retorna o `result`
 * estável para asserts subsequentes.
 *
 * Concentra o trio `renderHook + makeAuthWrapper + waitFor(isLoading=false)`
 * que aparecia em quase todos os testes do Provider e era a maior
 * fonte de duplicação no Sonar (PR #123).
 */
export async function renderAuthHook(
  client: ApiClient,
  options: WrapperOptions = {},
): Promise<RenderHookResult<ReturnType<typeof useAuth>, unknown>> {
  const result = renderHook(() => useAuth(), {
    wrapper: makeAuthWrapper(client, options),
  });
  await waitFor(() => {
    expect(result.result.current.isLoading).toBe(false);
  });
  return result;
}

/**
 * Pré-popula token (`localStorage`) e catálogo (IndexedDB) com a
 * sessão de exemplo. Usado em qualquer cenário que precisa de "usuário
 * autenticado já hidratado" (logout, verifyRoute, RequireAuth).
 */
export async function seedPersistedSession(): Promise<void> {
  globalThis.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
  await permissionsCache.save({
    user: SAMPLE_USER,
    routes: SAMPLE_PERMISSIONS.routes,
  } as Omit<CachedPermissions, 'cachedAt'>);
}

/**
 * Atalho que executa `login('ada@lfc.com.br', 'secret')` dentro de
 * `act` no `renderHook` resultante. Centraliza o boilerplate dos
 * testes que precisam do estado pós-login (logout, hasPermission,
 * verifyRoute) sem repetir três linhas em cada `test`.
 */
export async function loginInHook(
  result: { current: ReturnType<typeof useAuth> },
): Promise<void> {
  await act(async () => {
    await result.current.login('ada@lfc.com.br', 'secret');
  });
}

/**
 * Configura `client.post` + `client.get` para o caminho feliz de
 * login: `POST /auth/login` resolve `SAMPLE_LOGIN`, `GET /auth/permissions`
 * resolve `SAMPLE_PERMISSIONS`. Encadeia `.mockResolvedValueOnce` para
 * que cada `get` subsequente possa ser configurado pelo teste (ex.:
 * adicionar 2ª resposta para o `logout`).
 */
export function mockSuccessfulLogin(client: ApiClientStub): void {
  client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
  client.get.mockResolvedValueOnce(SAMPLE_PERMISSIONS);
}

/**
 * Helper para o fluxo padrão: monta o Provider, faz login feliz e
 * retorna o `result` autenticado. Concentra o boilerplate dos testes
 * de `logout`, `hasPermission`, `verifyRoute`, `onUnauthorized`.
 */
export async function setupLoggedInProvider(
  client: ApiClientStub = createAuthClientStub(),
  options: WrapperOptions = {},
): Promise<{
  client: ApiClientStub;
  result: { current: ReturnType<typeof useAuth> };
}> {
  mockSuccessfulLogin(client);
  const { result } = await renderAuthHook(client, options);
  await loginInHook(result);
  return { client, result };
}

// ---------- Fixtures ----------

export const SAMPLE_LOGIN: LoginResponse = {
  token: 'jwt-xyz',
};

/**
 * Resposta de `GET /auth/permissions` (Issue #122). Usado em cenários
 * de login feliz e hidratação a partir de cache vazio.
 *
 * O backend retorna apenas `{ user, routes }` — o array `routes`
 * carrega tanto os codes usados em `hasPermission` quanto em
 * `X-Route-Code`, já que o backend consolidou permissões e rotas em
 * um único catálogo.
 */
export const SAMPLE_PERMISSIONS: PermissionsResponse = {
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
    identity: 42,
  },
  routes: ['AUTH_V1_SYSTEMS_LIST', 'AUTH_V1_SYSTEMS_CREATE'],
};

export const SAMPLE_USER = SAMPLE_PERMISSIONS.user;
/**
 * Alias mantido para reduzir churn em testes que asseriam contra os
 * codes do estado: `state.permissions` é populado com `routes`.
 */
export const SAMPLE_PERMISSION_CODES = SAMPLE_PERMISSIONS.routes;

/**
 * Resposta do novo `verify-token` reduzido (Issue #122) — usado em
 * testes do `verifyRoute` e da revalidação periódica.
 */
export const VERIFY_OK: VerifyTokenResponse = {
  valid: true,
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T01:00:00Z',
};

export const UNAUTHORIZED_ERROR: ApiError = {
  kind: 'http',
  status: 401,
  code: 'TOKEN_INVALID',
  message: 'Sessão expirada.',
};

export const FORBIDDEN_ERROR: ApiError = {
  kind: 'http',
  status: 403,
  message: 'Acesso negado para a rota.',
};

export const NETWORK_ERROR: ApiError = {
  kind: 'network',
  message: 'Falha de conexão com o servidor.',
};

/**
 * Renderiza uma árvore com `MemoryRouter + AuthProvider + Routes`
 * pronta — usada quando o teste precisa de roteamento real (logout
 * disparar redirect para `/login`, verifyRoute redirecionar para
 * `/error/403`).
 *
 * O caller fornece o conteúdo das `<Route>` via `routes` (mapa
 * pathname → element) e o pathname inicial via `initial`.
 */
export function renderAuthTree(
  client: ApiClient,
  routes: Record<string, React.ReactElement>,
  initial: string,
): void {
  const elements = Object.entries(routes).map(([path, element]) => (
    <Route key={path} path={path} element={element} />
  ));
  render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
        <Routes>{elements}</Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
