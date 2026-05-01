import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, vi } from 'vitest';

import type { ApiClient, PagedResponse, RouteDto } from '@/shared/api';

import { RoutesPage } from '@/pages/RoutesPage';

/**
 * Helpers de teste compartilhados pela suíte da `RoutesPage` (Issue
 * #62) e pelas próximas (#63 criar, #64 editar, #65 excluir).
 *
 * Extraídos para evitar duplicação de blocos de fixtures (lição PR
 * #123/#127/#128 — Sonar conta blocos de 10+ linhas como duplicação
 * independente da intenção). Mantemos apenas o que é genuinamente
 * compartilhado:
 *
 * - `ApiClientStub` + `createRoutesClientStub` para isolar a página da
 *   camada de transporte;
 * - `makeRoute` + `makePagedRoutes` para construir payloads do contrato
 *   `RouteDto`/`PagedResponse<RouteDto>` sem repetir todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderRoutesPage` envolvendo a página no `MemoryRouter` apontando
 *   para `/systems/:systemId/routes` (a página lê `useParams`);
 * - `waitForInitialList` colapsando o "esperar listagem" repetido em
 *   praticamente todos os testes.
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYS_AUTH = '11111111-1111-1111-1111-111111111111';
export const ID_ROUTE_LIST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const ID_ROUTE_CREATE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const ID_ROUTE_LEGACY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const ID_TOKEN_TYPE_DEFAULT = '99999999-9999-9999-9999-999999999999';

/**
 * Stub de `ApiClient` injetado em `<RoutesPage client={stub} />` —
 * mesmo padrão de injeção usado nos testes da `SystemsPage`. Reusa o
 * shape de `ApiClientStub` em `systemsTestHelpers.tsx`, mas declarado
 * localmente para que cada suíte mantenha seu próprio módulo de
 * fixtures (acoplar os dois levaria à inversão "tests dependem de
 * tests" que dificulta reorganizar).
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

export function createRoutesClientStub(): ApiClientStub {
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
 * Constrói um `RouteDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos do contrato.
 */
export function makeRoute(overrides: Partial<RouteDto> = {}): RouteDto {
  return {
    id: ID_ROUTE_LIST,
    systemId: ID_SYS_AUTH,
    name: 'Listar sistemas',
    code: 'AUTH_V1_SYSTEMS_LIST',
    description: 'GET /api/v1/systems',
    systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
    systemTokenTypeCode: 'default',
    systemTokenTypeName: 'Acesso padrão',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend — `total` reflete o
 * `data.length` por default; testes que cobrem paginação sobrescrevem.
 */
export function makePagedRoutes(
  data: ReadonlyArray<RouteDto>,
  overrides: Partial<PagedResponse<RouteDto>> = {},
): PagedResponse<RouteDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `RoutesPage` envolvendo no `MemoryRouter` apontando para
 * `/systems/:systemId/routes`. A página consome `useParams<{ systemId }>`
 * — sem o roteador, `systemId` ficaria `undefined` e a página entraria
 * no estado `InvalidIdNotice` em vez de carregar a listagem.
 *
 * `systemId` é parametrizável para que o teste de `:systemId` inválido
 * possa simular a URL `/systems/ /routes` (whitespace) e cair no
 * `InvalidIdNotice` — espelhando o comportamento real do componente.
 */
export function renderRoutesPage(
  client: ApiClientStub,
  systemId: string = ID_SYS_AUTH,
): void {
  render(
    <MemoryRouter initialEntries={[`/systems/${systemId}/routes`]}>
      <Routes>
        <Route path="/systems/:systemId/routes" element={<RoutesPage client={client} />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `RoutesPage` faz
 * `listRoutes` no mount). Centraliza o "esperar listagem" para que cada
 * teste comece em estado estável sem precisar replicar `waitFor` para
 * `client.get`. Espelha `waitForInitialList` em `systemsTestHelpers.tsx`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('routes-loading')).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `query` do path passado a `client.get`. Usado em
 * asserts que verificam a serialização da querystring. Espelha o
 * helper em `SystemsPage.test.tsx` (não centralizado lá porque era
 * privado da suíte; à medida que mais suítes precisam, faz sentido
 * compartilhar).
 */
export function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return '';
  const path = calls[calls.length - 1][0];
  return typeof path === 'string' ? path : '';
}
