import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, TokenTypeDto } from '@/shared/api';

import { isTokenTypeArray, isTokenTypeDto, listTokenTypes } from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/tokenTypes.ts` (Issue #63, EPIC
 * #46). Estratégia: stubar o `ApiClient` injetado e validar paths,
 * type guards e propagação de `ApiError`. Não bate em `fetch` —
 * cobertura de transporte HTTP é responsabilidade dos testes em
 * `client.test.ts`.
 *
 * O wrapper só é consumido pelo `NewRouteModal` (e futuro
 * `EditRouteModal` na #64) para popular o `<Select>` de "política JWT
 * alvo". Não declaramos test casos de mutação (POST/PUT/DELETE) aqui
 * porque o admin-gui não cria/edita token types — gestão deles fica
 * fora do escopo da EPIC #46.
 */

const TOKEN_TYPE_ID = '99999999-9999-9999-9999-999999999999';

interface ClientStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
}

/**
 * Cria um stub mínimo de `ApiClient`. Espelha o pattern em
 * `routes.test.ts`/`systems.test.ts` mas declarado aqui local pra
 * evitar dependência cruzada entre módulos de teste de API (cada um
 * tem responsabilidade isolada).
 */
function createStub(): ClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  };
}

/**
 * Constrói um `TokenTypeDto` válido — testes só sobrescrevem o que
 * importa para o cenário. Local em vez de importado de
 * `routesTestHelpers.tsx` porque os helpers de página dependem de
 * `@testing-library/react` e o teste de API não precisa do DOM.
 */
function makeTokenTypeDto(overrides: Partial<TokenTypeDto> = {}): TokenTypeDto {
  return {
    id: TOKEN_TYPE_ID,
    name: 'Acesso padrão',
    code: 'default',
    description: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('isTokenTypeDto', () => {
  it('retorna true para um TokenTypeDto válido', () => {
    expect(isTokenTypeDto(makeTokenTypeDto())).toBe(true);
  });

  it('aceita description como null/undefined/string', () => {
    expect(isTokenTypeDto(makeTokenTypeDto({ description: null }))).toBe(true);
    expect(isTokenTypeDto(makeTokenTypeDto({ description: 'algo' }))).toBe(true);
    const withoutDescription = { ...makeTokenTypeDto() } as Partial<TokenTypeDto>;
    delete withoutDescription.description;
    expect(isTokenTypeDto(withoutDescription)).toBe(true);
  });

  it('aceita deletedAt como null/string', () => {
    expect(isTokenTypeDto(makeTokenTypeDto({ deletedAt: null }))).toBe(true);
    expect(isTokenTypeDto(makeTokenTypeDto({ deletedAt: '2026-02-01T00:00:00Z' }))).toBe(true);
  });

  it('rejeita valores não-objeto', () => {
    expect(isTokenTypeDto(null)).toBe(false);
    expect(isTokenTypeDto(undefined)).toBe(false);
    expect(isTokenTypeDto('string')).toBe(false);
    expect(isTokenTypeDto(42)).toBe(false);
  });

  it('rejeita objeto faltando campos obrigatórios', () => {
    const incomplete = { ...makeTokenTypeDto() } as Partial<TokenTypeDto>;
    delete incomplete.id;
    expect(isTokenTypeDto(incomplete)).toBe(false);
  });

  it('rejeita campos com tipo errado', () => {
    expect(isTokenTypeDto({ ...makeTokenTypeDto(), id: 42 })).toBe(false);
    expect(isTokenTypeDto({ ...makeTokenTypeDto(), name: null })).toBe(false);
    expect(isTokenTypeDto({ ...makeTokenTypeDto(), description: 42 })).toBe(false);
  });
});

describe('isTokenTypeArray', () => {
  it('retorna true para array vazio', () => {
    expect(isTokenTypeArray([])).toBe(true);
  });

  it('retorna true para array de TokenTypeDto válidos', () => {
    expect(isTokenTypeArray([makeTokenTypeDto(), makeTokenTypeDto({ id: 'other' })])).toBe(true);
  });

  it('retorna false quando algum item não é TokenTypeDto', () => {
    expect(isTokenTypeArray([makeTokenTypeDto(), { foo: 'bar' }])).toBe(false);
  });

  it('rejeita valores não-array', () => {
    expect(isTokenTypeArray(null)).toBe(false);
    expect(isTokenTypeArray({})).toBe(false);
    expect(isTokenTypeArray('lista')).toBe(false);
  });
});

describe('listTokenTypes', () => {
  it('chama GET /tokens/types e devolve a lista validada', async () => {
    const stub = createStub();
    const list = [makeTokenTypeDto()];
    stub.get.mockResolvedValueOnce(list);

    const result = await listTokenTypes(undefined, stub as unknown as ApiClient);

    expect(stub.get).toHaveBeenCalledWith('/tokens/types', undefined);
    expect(result).toEqual(list);
  });

  it('repassa as options (signal) para o cliente', async () => {
    const stub = createStub();
    const controller = new AbortController();
    stub.get.mockResolvedValueOnce([]);

    await listTokenTypes({ signal: controller.signal }, stub as unknown as ApiClient);

    expect(stub.get).toHaveBeenCalledWith('/tokens/types', { signal: controller.signal });
  });

  it('lança ApiError(parse) quando a resposta não bate com o shape esperado', async () => {
    const stub = createStub();
    stub.get.mockResolvedValueOnce({ data: 'invalido' });

    await expect(listTokenTypes(undefined, stub as unknown as ApiClient)).rejects.toMatchObject({
      kind: 'parse',
      message: expect.stringContaining('inválida'),
    });
  });

  it('propaga ApiError do cliente sem reembrulhar', async () => {
    const stub = createStub();
    stub.get.mockRejectedValueOnce({
      kind: 'http',
      status: 401,
      message: 'Sessão expirada.',
    });

    await expect(listTokenTypes(undefined, stub as unknown as ApiClient)).rejects.toMatchObject({
      kind: 'http',
      status: 401,
    });
  });
});
