import { vi } from 'vitest';

import type { ApiClient, PagedResponse, SystemDto } from '@/shared/api';

/**
 * Helpers de teste compartilhados pelas suítes da `SystemsPage`
 * (listagem em `SystemsPage.test.tsx` e criação em
 * `SystemsPage.create.test.tsx`).
 *
 * Extraídos para evitar duplicação de blocos de fixtures (lição PR #123 —
 * Sonar conta blocos de 10+ linhas como duplicação independente da
 * intenção). Mantemos apenas o que é genuinamente compartilhado:
 *
 * - `ApiClientStub` + `createSystemsClientStub` para isolar a página da
 *   camada de transporte;
 * - `makeSystem` + `makePagedResponse` para construir payloads do
 *   contrato `SystemDto`/`PagedResponse<SystemDto>` sem repetir todos os
 *   campos;
 * - constantes de UUIDs sintéticos para asserts estáveis.
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYS_AUTH = '11111111-1111-1111-1111-111111111111';
export const ID_SYS_KURTTO = '22222222-2222-2222-2222-222222222222';
export const ID_SYS_LEGACY = '33333333-3333-3333-3333-333333333333';

/**
 * Stub de `ApiClient` injetado em `<SystemsPage client={stub} />` —
 * mesmo padrão de injeção usado nos testes de auth (PR #122/#123).
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

export function createSystemsClientStub(): ApiClientStub {
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
 * Constrói um `SystemDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos do contrato.
 */
export function makeSystem(overrides: Partial<SystemDto> = {}): SystemDto {
  return {
    id: ID_SYS_AUTH,
    name: 'lfc-authenticator',
    code: 'AUTH',
    description: null,
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
export function makePagedResponse(
  data: ReadonlyArray<SystemDto>,
  overrides: Partial<PagedResponse<SystemDto>> = {},
): PagedResponse<SystemDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}
