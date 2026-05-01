import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, PagedResponse, RouteDto } from '@/shared/api';

import {
  createRoute,
  deleteRoute,
  isPagedRoutesResponse,
  isRouteDto,
  listRoutes,
  updateRoute,
} from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/routes.ts` (Issue #62, EPIC #46).
 *
 * Estratégia: stubar o `ApiClient` injetado e validar querystring,
 * paths, body, type guards e propagação de `ApiError`. Não bate em
 * `fetch` — cobertura de transporte HTTP é responsabilidade dos
 * testes em `client.test.ts`.
 *
 * Nesta primeira sub-issue só `listRoutes` é consumido pela UI; os
 * wrappers `createRoute`/`updateRoute`/`deleteRoute` foram declarados
 * já agora para evitar PR destrutivo nas próximas sub-issues (lição
 * PR #128 — projetar shared helpers desde o primeiro PR do recurso),
 * portanto cobrimos todos com asserts mínimos.
 */

/** UUID de sistema sintético — asserts comparam strings estáveis. */
const SYS_ID = '11111111-1111-1111-1111-111111111111';
const ROUTE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
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
 * Cria um stub mínimo de `ApiClient` — espelha o pattern usado em
 * `tests/pages/__helpers__/systemsTestHelpers.tsx` mas sem importar de
 * lá: o módulo de helpers de pages depende do `@testing-library/react`
 * e o teste de API não precisa do DOM. Manter local evita sobrecarga
 * de imports no boot da suíte.
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
 * Constrói um `RouteDto` válido — testes só sobrescrevem o que importa
 * para o cenário sem repetir todos os campos. Espelha `makeRoute` dos
 * helpers de página, mas declarado aqui para evitar dependência cruzada
 * (mesmo motivo do stub local).
 */
function makeRouteDto(overrides: Partial<RouteDto> = {}): RouteDto {
  return {
    id: ROUTE_ID,
    systemId: SYS_ID,
    name: 'Listar sistemas',
    code: 'AUTH_V1_SYSTEMS_LIST',
    description: 'GET /api/v1/systems',
    systemTokenTypeId: TOKEN_TYPE_ID,
    systemTokenTypeCode: 'default',
    systemTokenTypeName: 'Acesso padrão',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

function makePaged(
  data: ReadonlyArray<RouteDto>,
  overrides: Partial<PagedResponse<RouteDto>> = {},
): PagedResponse<RouteDto> {
  return { data, page: 1, pageSize: 20, total: data.length, ...overrides };
}

describe('isRouteDto', () => {
  it('aceita payload completo do contrato', () => {
    expect(isRouteDto(makeRouteDto())).toBe(true);
  });

  it('aceita description ausente/null/undefined', () => {
    expect(isRouteDto(makeRouteDto({ description: null }))).toBe(true);
    const { description: _omit, ...withoutDescription } = makeRouteDto();
    expect(isRouteDto(withoutDescription)).toBe(true);
  });

  it('aceita deletedAt ausente/null/undefined', () => {
    expect(isRouteDto(makeRouteDto({ deletedAt: null }))).toBe(true);
    const { deletedAt: _omit, ...withoutDeleted } = makeRouteDto();
    expect(isRouteDto(withoutDeleted)).toBe(true);
  });

  it('rejeita objetos sem campos obrigatórios', () => {
    expect(isRouteDto(null)).toBe(false);
    expect(isRouteDto(undefined)).toBe(false);
    expect(isRouteDto({})).toBe(false);
    expect(isRouteDto({ id: 1, systemId: SYS_ID })).toBe(false);
    const missingTokenTypeName = makeRouteDto();
    delete (missingTokenTypeName as Partial<RouteDto>).systemTokenTypeName;
    expect(isRouteDto(missingTokenTypeName)).toBe(false);
  });

  it('rejeita description ou deletedAt com tipo inválido', () => {
    expect(isRouteDto(makeRouteDto({ description: 123 as unknown as string }))).toBe(false);
    expect(isRouteDto(makeRouteDto({ deletedAt: 0 as unknown as string }))).toBe(false);
  });
});

describe('isPagedRoutesResponse', () => {
  it('aceita envelope válido com dados', () => {
    expect(isPagedRoutesResponse(makePaged([makeRouteDto()]))).toBe(true);
  });

  it('aceita envelope vazio', () => {
    expect(isPagedRoutesResponse(makePaged([], { total: 0 }))).toBe(true);
  });

  it('rejeita envelope sem campos', () => {
    expect(isPagedRoutesResponse(null)).toBe(false);
    expect(isPagedRoutesResponse({ data: [] })).toBe(false);
    expect(isPagedRoutesResponse({ data: [], page: '1', pageSize: 20, total: 0 })).toBe(false);
  });

  it('rejeita data com itens inválidos', () => {
    expect(isPagedRoutesResponse(makePaged([{ broken: true } as unknown as RouteDto]))).toBe(false);
  });
});

describe('listRoutes', () => {
  it('emite GET com systemId obrigatório e omite defaults', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePaged([makeRouteDto()]));

    await listRoutes({ systemId: SYS_ID }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe(`/systems/routes?systemId=${SYS_ID}`);
  });

  it('serializa q (após trim), page, pageSize, includeDeleted quando diferentes do default', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listRoutes(
      {
        systemId: SYS_ID,
        q: '  auth  ',
        page: 2,
        pageSize: 50,
        includeDeleted: true,
      },
      undefined,
      client as unknown as ApiClient,
    );

    const path = client.get.mock.calls[0][0] as string;
    expect(path).toContain(`systemId=${SYS_ID}`);
    expect(path).toContain('q=auth');
    expect(path).toContain('page=2');
    expect(path).toContain('pageSize=50');
    expect(path).toContain('includeDeleted=true');
  });

  it('omite q quando vazio após trim, mas mantém systemId', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listRoutes(
      { systemId: SYS_ID, q: '   ' },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(`/systems/routes?systemId=${SYS_ID}`);
  });

  it('passa signal/options adiante para o cliente', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePaged([]));
    const controller = new AbortController();

    await listRoutes(
      { systemId: SYS_ID },
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('lança ApiError(parse) quando o backend devolve payload inválido', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      listRoutes({ systemId: SYS_ID }, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({
      kind: 'parse',
      message: 'Resposta inválida do servidor.',
    });
  });

  it('propaga rejeições do cliente sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 401, message: 'Sessão expirada.' };
    client.get.mockRejectedValueOnce(apiError);

    await expect(
      listRoutes({ systemId: SYS_ID }, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });
});

describe('createRoute', () => {
  it('emite POST /systems/routes com body trimado e devolve RouteDto', async () => {
    const client = createStub();
    const created = makeRouteDto();
    client.post.mockResolvedValueOnce(created);

    const result = await createRoute(
      {
        systemId: SYS_ID,
        name: '  Listar  ',
        code: ' AUTH_V1_X ',
        description: '  desc  ',
        systemTokenTypeId: TOKEN_TYPE_ID,
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe('/systems/routes');
    expect(body).toEqual({
      systemId: SYS_ID,
      name: 'Listar',
      code: 'AUTH_V1_X',
      description: 'desc',
      systemTokenTypeId: TOKEN_TYPE_ID,
    });
    expect(result).toEqual(created);
  });

  it('omite description quando string vazia/whitespace após trim', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeRouteDto());

    await createRoute(
      {
        systemId: SYS_ID,
        name: 'Listar',
        code: 'AUTH_V1_X',
        description: '   ',
        systemTokenTypeId: TOKEN_TYPE_ID,
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post.mock.calls[0][1]).toEqual({
      systemId: SYS_ID,
      name: 'Listar',
      code: 'AUTH_V1_X',
      systemTokenTypeId: TOKEN_TYPE_ID,
    });
  });

  it('lança ApiError(parse) quando resposta não é RouteDto', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      createRoute(
        {
          systemId: SYS_ID,
          name: 'X',
          code: 'X',
          systemTokenTypeId: TOKEN_TYPE_ID,
        },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('updateRoute', () => {
  it('emite PUT /systems/routes/{id} com body trimado e devolve RouteDto', async () => {
    const client = createStub();
    const updated = makeRouteDto({ name: 'Listar (atualizado)' });
    client.put.mockResolvedValueOnce(updated);

    const result = await updateRoute(
      ROUTE_ID,
      {
        systemId: SYS_ID,
        name: '  Listar (atualizado)  ',
        code: 'AUTH_V1_SYSTEMS_LIST',
        systemTokenTypeId: TOKEN_TYPE_ID,
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.put).toHaveBeenCalledTimes(1);
    const [path, body] = client.put.mock.calls[0];
    expect(path).toBe(`/systems/routes/${ROUTE_ID}`);
    expect(body).toEqual({
      systemId: SYS_ID,
      name: 'Listar (atualizado)',
      code: 'AUTH_V1_SYSTEMS_LIST',
      systemTokenTypeId: TOKEN_TYPE_ID,
    });
    expect(result).toEqual(updated);
  });

  it('lança ApiError(parse) quando resposta não é RouteDto', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(null);

    await expect(
      updateRoute(
        ROUTE_ID,
        {
          systemId: SYS_ID,
          name: 'X',
          code: 'X',
          systemTokenTypeId: TOKEN_TYPE_ID,
        },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('deleteRoute', () => {
  it('emite DELETE /systems/routes/{id} e resolve void', async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    await expect(
      deleteRoute(ROUTE_ID, undefined, client as unknown as ApiClient),
    ).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete.mock.calls[0][0]).toBe(`/systems/routes/${ROUTE_ID}`);
  });

  it('propaga rejeições do cliente sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 404, message: 'Route não encontrada.' };
    client.delete.mockRejectedValueOnce(apiError);

    await expect(
      deleteRoute(ROUTE_ID, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });
});
