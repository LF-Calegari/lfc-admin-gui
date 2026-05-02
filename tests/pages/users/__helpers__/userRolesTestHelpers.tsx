import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import type {
  ApiClient,
  PagedResponse,
  RoleDto,
  SystemDto,
  UserDetailDto,
  UserRoleLinkDto,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { UserRolesShellPage } from '@/pages/users';

/**
 * Helpers compartilhados pela suíte da `UserRolesShellPage`
 * (Issue #71). Espelha o pattern `userPermissionsTestHelpers.tsx`
 * (lição PR #128 — projetar shared helpers desde o primeiro PR do
 * recurso). A tela tem 3 fontes de dados (`listAllRoles`,
 * `listSystems`, `getUserById`) e duas mutações (`assignRoleToUser`/
 * `removeRoleFromUser`), então o stub pré-configura todos os
 * `client.get/post/delete` em estado feliz e os testes só sobrescrevem
 * o que importa por cenário.
 */

export const ID_USER = '11111111-1111-1111-1111-111111111111';
export const ID_SYS_AUTH = '22222222-2222-2222-2222-222222222222';
export const ID_SYS_KURTTO = '33333333-3333-3333-3333-333333333333';
export const ID_ROLE_ADMIN = '44444444-4444-4444-4444-444444444444';
export const ID_ROLE_VIEWER = '55555555-5555-5555-5555-555555555555';
export const ID_ROLE_KURTTO = '66666666-6666-6666-6666-666666666666';

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

export function createUserRolesClientStub(): ApiClientStub {
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

export function makeRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: ID_ROLE_ADMIN,
    systemId: ID_SYS_AUTH,
    name: 'Administrator',
    code: 'admin',
    description: null,
    permissionsCount: null,
    usersCount: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Helper genérico para construir um envelope `PagedResponse<T>` com
 * defaults sensatos. Centraliza o corpo idêntico que `makePagedRoles`
 * e `makePagedSystems` precisariam ter — Sonar/eslint-plugin-sonarjs
 * marca funções idênticas como duplicação. Cada wrapper específico
 * só aplica o tipo correto sem repetir o corpo.
 */
function makePaged<T>(
  items: ReadonlyArray<T>,
  overrides: Partial<PagedResponse<T>> = {},
): PagedResponse<T> {
  return {
    data: items,
    page: 1,
    pageSize: 100,
    total: items.length,
    ...overrides,
  };
}

export function makePagedRoles(
  items: ReadonlyArray<RoleDto>,
  overrides: Partial<PagedResponse<RoleDto>> = {},
): PagedResponse<RoleDto> {
  return makePaged(items, overrides);
}

export function makeSystem(overrides: Partial<SystemDto> = {}): SystemDto {
  return {
    id: ID_SYS_AUTH,
    name: 'Authenticator',
    code: 'authenticator',
    description: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

export function makePagedSystems(
  items: ReadonlyArray<SystemDto>,
  overrides: Partial<PagedResponse<SystemDto>> = {},
): PagedResponse<SystemDto> {
  return makePaged(items, overrides);
}

export function makeUserRoleLink(
  overrides: Partial<UserRoleLinkDto> = {},
): UserRoleLinkDto {
  return {
    id: 'link-1',
    userId: ID_USER,
    roleId: ID_ROLE_ADMIN,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

export function makeUserDetail(
  overrides: Partial<UserDetailDto> = {},
): UserDetailDto {
  return {
    id: ID_USER,
    name: 'Maria Silva',
    email: 'maria@example.com',
    clientId: null,
    identity: 0,
    active: true,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    roles: [],
    permissions: [],
    ...overrides,
  };
}

interface SetupOptions {
  /** Catálogo devolvido pelo `listAllRoles`. */
  catalog?: PagedResponse<RoleDto>;
  /** Lookup devolvido pelo `listSystems`. */
  systems?: PagedResponse<SystemDto>;
  /** Detalhe devolvido pelo `getUserById`. */
  user?: UserDetailDto;
}

/**
 * Configura o stub para retornar catálogo + systems + user em estado
 * feliz. A página dispara as três requests em paralelo no mount; este
 * helper resolve todas via `mockImplementation` baseado na URL para
 * evitar acoplar o teste à ordem de chamadas.
 */
export function primeStubResponses(
  client: ApiClientStub,
  options: SetupOptions = {},
): void {
  const catalog =
    options.catalog ??
    makePagedRoles([makeRole({ systemId: ID_SYS_AUTH })]);
  const systems =
    options.systems ?? makePagedSystems([makeSystem({ id: ID_SYS_AUTH })]);
  const user = options.user ?? makeUserDetail();

  client.get.mockImplementation((path: string) => {
    if (path.startsWith('/roles')) {
      return Promise.resolve(catalog);
    }
    if (path.startsWith('/systems')) {
      return Promise.resolve(systems);
    }
    if (path.startsWith(`/users/${ID_USER}`)) {
      return Promise.resolve(user);
    }
    return Promise.reject(
      Object.assign(new Error('URL stub não esperada: ' + path), {
        kind: 'http',
        status: 404,
      }),
    );
  });
}

export function renderUserRolesPage(
  client: ApiClientStub,
  userId: string = ID_USER,
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/usuarios/${userId}/roles`]}>
        <Routes>
          <Route
            path="/usuarios/:id/roles"
            element={<UserRolesShellPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a finalização do mount: o spinner de loading desaparece
 * quando todas as promises (catálogo + systems + user) resolvem.
 */
export async function waitForInitialFetch(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId('user-roles-loading')).not.toBeInTheDocument();
  });
}
