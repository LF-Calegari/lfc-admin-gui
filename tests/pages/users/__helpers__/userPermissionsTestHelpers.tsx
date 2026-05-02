import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import type {
  ApiClient,
  EffectivePermissionDto,
  PagedResponse,
  PermissionDto,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { UserPermissionsShellPage } from '@/pages/users';

/**
 * Helpers compartilhados pela suíte da `UserPermissionsShellPage`
 * (Issue #70). Espelha o pattern `routesTestHelpers.tsx`/
 * `rolesTestHelpers.tsx` (lição PR #128 — projetar shared helpers
 * desde o primeiro PR do recurso). A tela tem 3 fontes de dados
 * (`listPermissions`, `listEffectiveUserPermissions`, e as duas
 * mutações `assign`/`remove`), então o stub pré-configura todos os
 * `client.get/post/delete` em estado feliz e os testes só
 * sobrescrevem o que importa por cenário.
 */

export const ID_USER = '11111111-1111-1111-1111-111111111111';
export const ID_PERM_USERS_LIST = '22222222-2222-2222-2222-222222222222';
export const ID_PERM_USERS_UPDATE = '33333333-3333-3333-3333-333333333333';
export const ID_PERM_ROLES_LIST = '44444444-4444-4444-4444-444444444444';
export const ID_SYS_AUTH = '55555555-5555-5555-5555-555555555555';
export const ID_SYS_KURTTO = '66666666-6666-6666-6666-666666666666';
export const ID_ROLE_ADMIN = '77777777-7777-7777-7777-777777777777';

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

export function createUserPermissionsClientStub(): ApiClientStub {
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

export function makePermission(overrides: Partial<PermissionDto> = {}): PermissionDto {
  return {
    id: ID_PERM_USERS_LIST,
    routeId: 'route-uuid',
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'Listar usuários',
    systemId: ID_SYS_AUTH,
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    permissionTypeId: 'pt-uuid',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    description: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

export function makePagedPermissions(
  items: ReadonlyArray<PermissionDto>,
  overrides: Partial<PagedResponse<PermissionDto>> = {},
): PagedResponse<PermissionDto> {
  return {
    data: items,
    page: 1,
    pageSize: 100,
    total: items.length,
    ...overrides,
  };
}

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

interface SetupOptions {
  /** Catálogo devolvido pelo `listPermissions`. */
  catalog?: PagedResponse<PermissionDto>;
  /** Permissões efetivas do usuário. */
  effective?: ReadonlyArray<EffectivePermissionDto>;
}

/**
 * Configura o stub para retornar catálogo + effective em estado feliz.
 * A página dispara as duas requests em paralelo no mount; este helper
 * resolve ambas via `mockImplementation` baseado na URL para evitar
 * acoplar o teste à ordem de chamadas.
 */
export function primeStubResponses(
  client: ApiClientStub,
  options: SetupOptions = {},
): void {
  const catalog = options.catalog ?? makePagedPermissions([makePermission()]);
  const effective = options.effective ?? [makeEffective()];

  client.get.mockImplementation((path: string) => {
    if (path.startsWith('/permissions')) {
      return Promise.resolve(catalog);
    }
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

export function renderUserPermissionsPage(
  client: ApiClientStub,
  userId: string = ID_USER,
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/usuarios/${userId}/permissoes`]}>
        <Routes>
          <Route
            path="/usuarios/:id/permissoes"
            element={<UserPermissionsShellPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a finalização do mount: o spinner de loading desaparece
 * quando ambas as promises (catálogo + effective) resolvem. Centraliza
 * o pattern para reduzir boilerplate por teste.
 */
export async function waitForInitialFetch(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId('user-permissions-loading')).not.toBeInTheDocument();
  });
}
