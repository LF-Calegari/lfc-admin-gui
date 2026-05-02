import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import type {
  ApiClient,
  EffectivePermissionDto,
  EffectivePermissionSource,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { UserEffectivePermissionsShellPage } from '@/pages/users';

/**
 * Helpers compartilhados pela suíte da `UserEffectivePermissionsShellPage`
 * (Issue #72). Espelha o pattern já adotado em
 * `userPermissionsTestHelpers.tsx` (Issue #70) e
 * `userRolesTestHelpers.tsx` (Issue #71) — manter o stub `ApiClient`,
 * fixtures `make*` e helpers de render/await em uma fonte única reduz
 * duplicação ≥10 linhas que o Sonar/jscpd tokeniza (lições
 * PR #128/#134/#135).
 *
 * Esta página tem apenas **uma** fonte de dados:
 * `GET /users/{id}/effective-permissions`. O stub pré-configura a
 * resposta padrão (1 permissão direta) e os testes sobrescrevem por
 * cenário via `primeStubResponses({ effective: ... })`.
 */

export const ID_USER = '11111111-1111-1111-1111-111111111111';
export const ID_PERM_USERS_LIST = '22222222-2222-2222-2222-222222222222';
export const ID_PERM_USERS_UPDATE = '33333333-3333-3333-3333-333333333333';
export const ID_PERM_ROLES_LIST = '44444444-4444-4444-4444-444444444444';
export const ID_SYS_AUTH = '55555555-5555-5555-5555-555555555555';
export const ID_SYS_KURTTO = '66666666-6666-6666-6666-666666666666';
export const ID_ROLE_ADMIN = '77777777-7777-7777-7777-777777777777';
export const ID_ROLE_VIEWER = '88888888-8888-8888-8888-888888888888';

export type ApiClientStub = ApiClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
};

export function createUserEffectivePermissionsClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  } as unknown as ApiClientStub;
}

/**
 * Fixture-builder para uma `EffectivePermissionDto` "feliz" (uma
 * permissão direta no sistema Authenticator). Cada teste sobrescreve
 * apenas o que importa via `overrides` para manter o cenário focado.
 */
export function makeEffective(
  overrides: Partial<EffectivePermissionDto> = {},
): EffectivePermissionDto {
  return {
    permissionId: ID_PERM_USERS_LIST,
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'Listar usuários',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    systemId: ID_SYS_AUTH,
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    sources: [{ kind: 'direct' }],
    ...overrides,
  };
}

/**
 * Fixture-builder para uma fonte `kind: 'role'` — útil para montar
 * cenários de origem múltipla sem repetir o literal a cada teste.
 */
export function makeRoleSource(
  overrides: Partial<EffectivePermissionSource> = {},
): EffectivePermissionSource {
  return {
    kind: 'role',
    roleId: ID_ROLE_ADMIN,
    roleCode: 'admin',
    roleName: 'Administrator',
    ...overrides,
  };
}

interface SetupOptions {
  /** Permissões efetivas devolvidas pelo backend. */
  effective?: ReadonlyArray<EffectivePermissionDto>;
}

/**
 * Configura o stub para retornar `effective` em estado feliz e responde
 * com o mesmo array independente do `?systemId=` da request — testes
 * de filtro inspecionam `client.get.mock.calls` para validar que a
 * querystring foi montada corretamente, então não precisamos simular
 * o filtro no servidor (basta verificar que a request saiu certa).
 */
export function primeStubResponses(
  client: ApiClientStub,
  options: SetupOptions = {},
): void {
  const effective = options.effective ?? [makeEffective()];
  client.get.mockImplementation((path: string) => {
    if (path.includes('/effective-permissions')) {
      return Promise.resolve(effective);
    }
    return Promise.reject(
      Object.assign(new Error('URL stub não esperada: ' + path), {
        kind: 'http',
        status: 404,
      }),
    );
  });
}

/**
 * Renderiza a página dentro de `MemoryRouter` + `Routes` para que
 * `useParams` resolva o `:id` real. `ToastProvider` é incluído mesmo
 * sem uso direto na página (Issue #72 não dispara toast) por
 * consistência com `userPermissionsTestHelpers` — assim, mover testes
 * entre suítes não quebra o setup.
 */
export function renderUserEffectivePermissionsPage(
  client: ApiClientStub,
  userId: string = ID_USER,
): void {
  render(
    <ToastProvider>
      <MemoryRouter
        initialEntries={[`/usuarios/${userId}/permissoes-efetivas`]}
      >
        <Routes>
          <Route
            path="/usuarios/:id/permissoes-efetivas"
            element={<UserEffectivePermissionsShellPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda o spinner de loading desaparecer — sinal de que a request
 * inicial resolveu. Centraliza o pattern para reduzir boilerplate por
 * teste, espelhando `waitForInitialFetch` em
 * `userPermissionsTestHelpers`.
 */
export async function waitForInitialFetch(): Promise<void> {
  await waitFor(() => {
    expect(
      screen.queryByTestId('user-effective-permissions-loading'),
    ).not.toBeInTheDocument();
  });
}
