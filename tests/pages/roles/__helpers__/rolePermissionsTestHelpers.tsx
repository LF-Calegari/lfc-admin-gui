import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import type {
  ApiClient,
  PagedResponse,
  PermissionDto,
} from "@/shared/api";

import { ToastProvider } from "@/components/ui";
import { RolePermissionsShellPage } from "@/pages/roles/RolePermissionsShellPage";

/**
 * Helpers compartilhados pela suíte de `RolePermissionsShellPage`
 * (Issue #69, EPIC #47). Espelha o pattern de
 * `userPermissionsTestHelpers.tsx` (Issue #70) — a tela tem 3 fontes
 * de dados (`listPermissions`, `listRolePermissions`, e as duas
 * mutações `assign`/`remove`), então o stub pré-configura todos os
 * `client.get/post/delete` em estado feliz e os testes só
 * sobrescrevem o que importa por cenário.
 */

export const ID_SYS = "11111111-1111-1111-1111-111111111111";
export const ID_ROLE = "22222222-2222-2222-2222-222222222222";
export const ID_PERM_A = "33333333-3333-3333-3333-333333333333";
export const ID_PERM_B = "44444444-4444-4444-4444-444444444444";
export const ID_PERM_C = "55555555-5555-5555-5555-555555555555";

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

export function createRolePermissionsClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => "system-test-uuid"),
  } as unknown as ApiClientStub;
}

export function makePermission(
  overrides: Partial<PermissionDto> = {},
): PermissionDto {
  return {
    id: ID_PERM_A,
    routeId: "route-uuid",
    routeCode: "AUTH_V1_USERS_LIST",
    routeName: "Listar usuários",
    systemId: ID_SYS,
    systemCode: "authenticator",
    systemName: "Authenticator",
    permissionTypeId: "pt-uuid",
    permissionTypeCode: "Read",
    permissionTypeName: "Leitura",
    description: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
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

interface SetupOptions {
  /** Catálogo devolvido pelo `listPermissions(systemId)`. */
  catalog?: PagedResponse<PermissionDto>;
  /**
   * Ids das permissões já vinculadas à role. Se omitido, default é
   * `[]` (role nova sem permissões).
   */
  assigned?: ReadonlyArray<string>;
}

/**
 * Configura o stub para retornar catálogo + permissões vinculadas em
 * estado feliz. A página dispara as duas requests em paralelo no
 * mount; este helper resolve ambas via `mockImplementation` baseado
 * na URL para evitar acoplar o teste à ordem de chamadas. Mantemos
 * forma idêntica ao `primeStubResponses` de
 * `userPermissionsTestHelpers` para reduzir custo cognitivo de
 * navegar entre as suítes.
 */
export function primeStubResponses(
  client: ApiClientStub,
  options: SetupOptions = {},
): void {
  const catalog = options.catalog ?? makePagedPermissions([makePermission()]);
  const assigned = options.assigned ?? [];

  client.get.mockImplementation((path: string) => {
    if (path.startsWith("/permissions")) {
      return Promise.resolve(catalog);
    }
    if (path.match(/^\/roles\/[^/]+\/permissions$/)) {
      return Promise.resolve(assigned);
    }
    return Promise.reject(
      Object.assign(new Error("URL stub não esperada: " + path), {
        kind: "http",
        status: 404,
      }),
    );
  });
}

export function renderRolePermissionsPage(
  client: ApiClientStub,
  systemId: string = ID_SYS,
  roleId: string = ID_ROLE,
): void {
  render(
    <ToastProvider>
      <MemoryRouter
        initialEntries={[`/systems/${systemId}/roles/${roleId}/permissoes`]}
      >
        <Routes>
          <Route
            path="/systems/:systemId/roles/:roleId/permissoes"
            element={<RolePermissionsShellPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a finalização do mount: o spinner de loading desaparece
 * quando ambas as promises (catálogo + assigned) resolvem. Centraliza
 * o pattern para reduzir boilerplate por teste.
 */
export async function waitForInitialFetch(): Promise<void> {
  await waitFor(() => {
    expect(
      screen.queryByTestId("role-permissions-loading"),
    ).not.toBeInTheDocument();
  });
}
