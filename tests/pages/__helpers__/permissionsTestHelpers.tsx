import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type {
  ApiClient,
  PagedResponse,
  PermissionDto,
  SystemDto,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { PermissionsListShellPage } from '@/pages/permissions';

/**
 * Helpers de teste compartilhados pela suíte da
 * `PermissionsListShellPage` (Issue #174 — substitui o placeholder por
 * catálogo global filtrável).
 *
 * Estratégia espelha `clientsTestHelpers.tsx`/`rolesTestHelpers.tsx`:
 *
 * - `ApiClientStub` + `createPermissionsClientStub` para isolar a
 *   página da camada de transporte;
 * - `makePermission`/`makePagedPermissionsResponse` para construir
 *   payloads do contrato `PermissionDto`/`PagedResponse<PermissionDto>`
 *   sem repetir todos os campos;
 * - `makeSystem`/`makePagedSystemsResponse` para o lado do `<Select>`
 *   de filtro de sistema (a página dispara `listSystems` no mount);
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderPermissionsListPage` envolvendo a página num
 *   `ToastProvider` (futuras sub-issues podem consumir `useToast()`);
 * - `seedDualGetMock` colapsando o despache "se path começa com
 *   `/permissions` devolve `permissionsResponse`; se começa com
 *   `/systems` devolve `systemsResponse`" — a página tem 2 endpoints
 *   sob o mesmo `client.get`, então o stub precisa rotear corretamente
 *   sem que cada teste reescreva a lógica.
 *
 * Pré-fabricados desde o primeiro PR do recurso para evitar refatoração
 * destrutiva nas próximas sub-issues (lição PR #128 — "projetar shared
 * helpers desde o primeiro PR do recurso") e prevenir BLOCKER de
 * duplicação Sonar (lição PR #134/#135 — escanear blocos ≥10 linhas
 * antes do push).
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYSTEM_AUTH = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
export const ID_SYSTEM_BILLING = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

export const ID_PERMISSION_USERS_LIST = 'cccccccc-3333-3333-3333-cccccccccccc';
export const ID_PERMISSION_USERS_CREATE = 'dddddddd-4444-4444-4444-dddddddddddd';
export const ID_PERMISSION_BILLING_READ = 'eeeeeeee-5555-5555-5555-eeeeeeeeeeee';

export const ID_TYPE_READ = 'f0000000-0000-0000-0000-000000000001';
export const ID_TYPE_CREATE = 'f0000000-0000-0000-0000-000000000002';
export const ID_TYPE_UPDATE = 'f0000000-0000-0000-0000-000000000003';

export const ID_ROUTE_USERS_LIST = '11111111-aaaa-aaaa-aaaa-111111111111';
export const ID_ROUTE_USERS_CREATE = '22222222-aaaa-aaaa-aaaa-222222222222';
export const ID_ROUTE_BILLING_INVOICES = '33333333-bbbb-bbbb-bbbb-333333333333';

/**
 * Stub de `ApiClient` injetado em
 * `<PermissionsListShellPage client={stub} />` — mesmo padrão de
 * injeção usado nos testes de Systems/Clients/Users.
 */
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

export function createPermissionsClientStub(): ApiClientStub {
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
 * Constrói um `PermissionDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do contrato
 * denormalizado (rota + sistema + tipo).
 *
 * Default representa "AUTH_V1_USERS_LIST" no sistema "Authenticator"
 * com tipo "read" — caminho mais comum nos asserts. Suítes que
 * precisam de outros tipos sobrescrevem `permissionTypeCode`/
 * `permissionTypeName`/`permissionTypeId`.
 */
export function makePermission(
  overrides: Partial<PermissionDto> = {},
): PermissionDto {
  return {
    id: ID_PERMISSION_USERS_LIST,
    routeId: ID_ROUTE_USERS_LIST,
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'GET /api/v1/users',
    systemId: ID_SYSTEM_AUTH,
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    permissionTypeId: ID_TYPE_READ,
    permissionTypeCode: 'read',
    permissionTypeName: 'Ler',
    description: 'Ler: GET /api/v1/users',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Builder genérico de envelope paginado — espelha o contrato
 * `PagedResponse<T>` do backend. Centraliza o boilerplate compartilhado
 * entre `makePagedPermissionsResponse` e `makePagedSystemsResponse` —
 * Sonar/JSCPD tokenizaria os dois helpers como bloco duplicado se
 * fossem declarados separadamente (lição PR #134/#135).
 */
function makePagedResponse<T>(
  data: ReadonlyArray<T>,
  overrides: Partial<PagedResponse<T>> = {},
): PagedResponse<T> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend para o endpoint de
 * permissões. Wrapper tipado sobre `makePagedResponse` que fixa o
 * parâmetro genérico em `PermissionDto` — preserva ergonomia do call
 * site (`makePagedPermissionsResponse(rows)`) sem duplicar o body.
 */
export function makePagedPermissionsResponse(
  data: ReadonlyArray<PermissionDto>,
  overrides: Partial<PagedResponse<PermissionDto>> = {},
): PagedResponse<PermissionDto> {
  return makePagedResponse(data, overrides);
}

/**
 * Constrói um `SystemDto` com defaults — usado para popular o
 * `<Select>` de filtro de sistema. Centraliza para que cada suíte não
 * repita os campos `code/name/createdAt/updatedAt/deletedAt`.
 */
export function makeSystem(overrides: Partial<SystemDto> = {}): SystemDto {
  return {
    id: ID_SYSTEM_AUTH,
    code: 'authenticator',
    name: 'Authenticator',
    description: 'Sistema de autenticação',
    createdAt: '2026-01-01T12:00:00Z',
    updatedAt: '2026-01-01T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend para o endpoint
 * de sistemas — usado em `seedDualGetMock` para responder ao mount da
 * página (que dispara `listSystems` para popular o `<Select>` de
 * filtro). Wrapper tipado sobre `makePagedResponse`.
 */
export function makePagedSystemsResponse(
  data: ReadonlyArray<SystemDto>,
  overrides: Partial<PagedResponse<SystemDto>> = {},
): PagedResponse<SystemDto> {
  return makePagedResponse(data, overrides);
}

/**
 * Configura `client.get` como um router que despacha para 2 endpoints:
 *
 * - `path` começando com `/systems` (incluindo `/systems?pageSize=100`)
 *   → `systemsResponse` (sempre o mesmo, listSystems é one-shot no
 *   mount).
 * - Qualquer outro `path` (espera-se `/permissions...`) → próximo item
 *   da fila `permissionsResponses` (FIFO — testes podem enfileirar
 *   múltiplas para cobrir paginação/refetch).
 *
 * Centralizar aqui evita o boilerplate de `mockImplementation` em cada
 * teste e mantém o critério "qual response virá" explícito no setup.
 *
 * Lição PR #134/#135: blocos ≥10 linhas idênticos em 2+ testes viram
 * `New Code Duplication` no Sonar. Ter o router compartilhado evita
 * a 7ª recorrência.
 */
export function seedDualGetMock(
  client: ApiClientStub,
  systemsResponse: PagedResponse<SystemDto>,
  ...permissionsResponses: ReadonlyArray<PagedResponse<PermissionDto>>
): void {
  const queue: PagedResponse<PermissionDto>[] = [...permissionsResponses];
  client.get.mockImplementation((path: string): Promise<unknown> => {
    if (path.startsWith('/systems')) {
      return Promise.resolve(systemsResponse);
    }
    const next = queue.shift();
    if (next === undefined) {
      // Fallback: devolve uma página vazia em vez de `undefined` — o
      // type guard `isPagedPermissionsResponse` rejeita undefined e
      // a UI exibiria erro genérico que mascararia a real falha do
      // teste. Devolver `[]` torna o "fim de fila" legível no UI
      // (empty state) e ainda assim falha asserts sobre rows.
      return Promise.resolve(makePagedPermissionsResponse([]));
    }
    return Promise.resolve(next);
  });
}

/**
 * Renderiza a `PermissionsListShellPage` envolvendo num `ToastProvider`
 * — sub-issues futuras (criar/editar permissão fora de
 * `/systems/:id/routes/sync`) podem consumir `useToast()`. Centraliza
 * para que cada suíte não repita o boilerplate.
 */
export function renderPermissionsListPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <PermissionsListShellPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a página dispara
 * `listSystems` + `listPermissions` no mount). Centraliza o "esperar
 * listagem" para que cada teste comece em estado estável sem
 * precisar replicar `waitFor` para o spinner inicial.
 *
 * O hook só chama `client.get` quando há `fetcher` válido, então
 * aguardamos o spinner desaparecer (sinal de que ambas as requests
 * concluíram).
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('permissions-loading')).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `path` passado a `client.get` na chamada mais
 * recente que toca `/permissions` (ignorando `/systems`). Usado em
 * asserts que verificam a querystring montada por `buildPermissionsQueryString`.
 *
 * Diferente de `lastGetPath` em `clientsTestHelpers.tsx` (que pega a
 * última chamada cega), aqui filtramos só pelas requests do endpoint
 * principal — o setup `seedDualGetMock` mistura `/systems` no mount,
 * então pegar a última cega devolveria o sistema, não o filtro de
 * permissões.
 */
export function lastPermissionsGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const path = calls[i][0];
    if (typeof path === 'string' && path.startsWith('/permissions')) {
      return path;
    }
  }
  return '';
}

/**
 * Conta quantas chamadas a `client.get` tocaram o endpoint
 * `/permissions` (ignorando `/systems`). Usado em asserts que
 * acompanham refetch após mudança de filtro/busca/paginação sem que
 * a request one-shot de `listSystems` no mount distorça o número.
 */
export function countPermissionsGetCalls(client: ApiClientStub): number {
  return client.get.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].startsWith('/permissions'),
  ).length;
}
