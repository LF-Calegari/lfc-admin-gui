import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type { ApiClient, ClientDto, PagedResponse } from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { ClientsListShellPage } from '@/pages/clients';

/**
 * Helpers de teste compartilhados pelas suítes de Clientes (Issue
 * #73 — listagem; e as próximas #74/#75/#76/#146/#147 — mutações e
 * gerenciamento de contatos).
 *
 * Estratégia espelha `systemsTestHelpers.tsx`/`rolesTestHelpers.tsx`:
 *
 * - `ApiClientStub` + `createClientsClientStub` para isolar a página
 *   da camada de transporte;
 * - `makeClient`/`makePagedClientsResponse` para construir payloads
 *   do contrato `ClientDto`/`PagedResponse<ClientDto>` sem repetir
 *   todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderClientsListPage` envolvendo a página num `ToastProvider`
 *   (sub-issues seguintes consumirão `useToast()` para feedback);
 * - `waitForInitialList` e `lastGetPath` colapsando o boilerplate
 *   recorrente.
 *
 * Pré-fabricados desde o primeiro PR do recurso para evitar
 * refatoração destrutiva nas próximas sub-issues (lição PR #128 —
 * "projetar shared helpers desde o primeiro PR do recurso").
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_CLIENT_PF_ANA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const ID_CLIENT_PF_BRUNO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const ID_CLIENT_PJ_ACME = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const ID_CLIENT_PJ_GLOBAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/**
 * Stub de `ApiClient` injetado em
 * `<ClientsListShellPage client={stub} />` — mesmo padrão de
 * injeção usado nos testes de Systems/Roles.
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

export function createClientsClientStub(): ApiClientStub {
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
 * Constrói um `ClientDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do
 * contrato.
 *
 * Default é PF (`Ana Cliente`) porque é o caminho mais comum nas
 * asserts; suítes que precisam de PJ chamam com `type: 'PJ'` +
 * `cnpj`/`corporateName`. As coleções (`userIds`, `extraEmails`,
 * `mobilePhones`, `landlinePhones`) são vazias por default — backend
 * sempre devolve arrays mesmo sem dados.
 */
export function makeClient(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: ID_CLIENT_PF_ANA,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Ana Cliente',
    cnpj: null,
    corporateName: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    userIds: [],
    extraEmails: [],
    mobilePhones: [],
    landlinePhones: [],
    ...overrides,
  };
}

/**
 * Constrói um `ClientDto` PJ pré-configurado para reduzir overrides
 * repetidos nos cenários. `corporateName` e `cnpj` ficam preenchidos
 * com valores válidos por default; `cpf`/`fullName` ficam `null`
 * espelhando a regra de mutual-exclusão do backend.
 */
export function makeClientPj(overrides: Partial<ClientDto> = {}): ClientDto {
  return makeClient({
    id: ID_CLIENT_PJ_ACME,
    type: 'PJ',
    cpf: null,
    fullName: null,
    cnpj: '12345678000190',
    corporateName: 'Acme Indústria S/A',
    ...overrides,
  });
}

/**
 * Constrói o envelope paginado mockado pelo backend — `total`
 * reflete `data.length` por default; testes que cobrem paginação
 * sobrescrevem.
 */
export function makePagedClientsResponse(
  data: ReadonlyArray<ClientDto>,
  overrides: Partial<PagedResponse<ClientDto>> = {},
): PagedResponse<ClientDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `ClientsListShellPage` envolvendo num `ToastProvider`
 * — alguns subcomponentes da família (modais futuros das #74/#75)
 * consumirão `useToast()`. Centraliza para que cada suíte não repita
 * o boilerplate.
 */
export function renderClientsListPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <ClientsListShellPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a
 * `ClientsListShellPage` faz `listClients` no mount). Centraliza o
 * "esperar listagem" para que cada teste comece em estado estável
 * sem precisar replicar `waitFor` para `client.get`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('clients-loading')).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `path` passado a `client.get` na chamada
 * mais recente. Usado em asserts que verificam o endpoint consumido
 * (incluindo querystring montada por `buildQueryString`). Espelha
 * `lastGetPath` em `routesTestHelpers.tsx`/`systemsTestHelpers.tsx`.
 */
export function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return '';
  const path = calls[calls.length - 1][0];
  return typeof path === 'string' ? path : '';
}
