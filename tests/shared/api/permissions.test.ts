import { describe, expect, it, vi } from 'vitest';

import type {
  ApiClient,
  EffectivePermissionDto,
  PermissionDto,
} from '@/shared/api';

import {
  assignPermissionToUser,
  isPagedPermissionsResponse,
  isPermissionDto,
  listEffectiveUserPermissions,
  listPermissions,
  removePermissionFromUser,
} from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/permissions.ts` (Issue #70, EPIC #48).
 *
 * Estratégia: stubar o `ApiClient` injetado e validar paths, body,
 * type guards e propagação de `ApiError`. Não bate em `fetch` —
 * cobertura de transporte HTTP é responsabilidade dos testes em
 * `client.test.ts`. Replica o pattern de `tests/shared/api/roles.test.ts`
 * para reduzir custo cognitivo e permitir `it.each` de cenários
 * compartilhados quando aplicável.
 *
 * Cobre:
 *
 * - `isPermissionDto` (campos enriquecidos do backend lfc-authenticator#165:
 *   `routeCode`/`routeName`/`systemId`/`systemCode`/`systemName`/
 *   `permissionTypeCode`/`permissionTypeName`).
 * - `isPagedPermissionsResponse` (envelope paginado).
 * - `listPermissions` (paths + querystring).
 * - `listEffectiveUserPermissions` (path + parsing do array de
 *   `EffectivePermissionResponse` com `sources`).
 * - `assignPermissionToUser` (POST `/users/{id}/permissions`).
 * - `removePermissionFromUser` (DELETE `/users/{id}/permissions/{permissionId}`).
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PERM_ID = '22222222-2222-2222-2222-222222222222';
const SYS_ID = '33333333-3333-3333-3333-333333333333';
const ROLE_ID = '44444444-4444-4444-4444-444444444444';

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

function makePermissionDto(overrides: Partial<PermissionDto> = {}): PermissionDto {
  return {
    id: PERM_ID,
    routeId: 'route-uuid',
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'Listar usuários',
    systemId: SYS_ID,
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

function makeEffective(
  overrides: Partial<EffectivePermissionDto> = {},
): EffectivePermissionDto {
  return {
    permissionId: PERM_ID,
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'Listar usuários',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    systemId: SYS_ID,
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    sources: [{ kind: 'direct' }],
    ...overrides,
  };
}

describe('isPermissionDto', () => {
  it('aceita payload completo enriquecido (lfc-authenticator#165)', () => {
    expect(isPermissionDto(makePermissionDto())).toBe(true);
  });

  it('aceita description/deletedAt ausentes ou null', () => {
    expect(isPermissionDto(makePermissionDto({ description: null, deletedAt: null }))).toBe(true);
    const dto = makePermissionDto();
    const { description: _d, deletedAt: _del, ...lean } = dto;
    expect(isPermissionDto(lean)).toBe(true);
  });

  it('aceita strings vazias nos campos denormalizados (LEFT JOIN sem match)', () => {
    expect(
      isPermissionDto(
        makePermissionDto({
          routeCode: '',
          routeName: '',
          systemCode: '',
          systemName: '',
          permissionTypeCode: '',
          permissionTypeName: '',
        }),
      ),
    ).toBe(true);
  });

  it('rejeita objetos sem campos obrigatórios', () => {
    expect(isPermissionDto(null)).toBe(false);
    expect(isPermissionDto(undefined)).toBe(false);
    expect(isPermissionDto({})).toBe(false);
    const missing = makePermissionDto();
    delete (missing as Partial<PermissionDto>).routeCode;
    expect(isPermissionDto(missing)).toBe(false);
  });

  it('rejeita campos com tipos inválidos', () => {
    expect(
      isPermissionDto(makePermissionDto({ description: 0 as unknown as string })),
    ).toBe(false);
    expect(
      isPermissionDto(makePermissionDto({ deletedAt: 1 as unknown as string })),
    ).toBe(false);
  });
});

describe('isPagedPermissionsResponse', () => {
  it('aceita envelope válido com itens', () => {
    expect(
      isPagedPermissionsResponse({
        data: [makePermissionDto()],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    ).toBe(true);
  });

  it('aceita envelope vazio', () => {
    expect(
      isPagedPermissionsResponse({
        data: [],
        page: 1,
        pageSize: 100,
        total: 0,
      }),
    ).toBe(true);
  });

  it('rejeita envelope sem campos obrigatórios', () => {
    expect(isPagedPermissionsResponse(null)).toBe(false);
    expect(isPagedPermissionsResponse({ data: [] })).toBe(false);
    expect(
      isPagedPermissionsResponse({ data: [], page: '1', pageSize: 20, total: 0 }),
    ).toBe(false);
  });

  it('rejeita envelope com itens inválidos', () => {
    expect(
      isPagedPermissionsResponse({
        data: [{ broken: true }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toBe(false);
  });
});

describe('listPermissions', () => {
  it('emite GET /permissions sem querystring quando params são default', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [makePermissionDto()],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    await listPermissions({}, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe('/permissions');
  });

  it('inclui systemId/routeId/permissionTypeId/q/page/pageSize/includeDeleted na querystring', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 2,
      pageSize: 50,
      total: 0,
    });

    await listPermissions(
      {
        systemId: SYS_ID,
        routeId: 'route-1',
        permissionTypeId: 'pt-1',
        q: '  buscar  ',
        page: 2,
        pageSize: 50,
        includeDeleted: true,
      },
      undefined,
      client as unknown as ApiClient,
    );

    const path = client.get.mock.calls[0][0] as string;
    const search = new URLSearchParams(path.replace('/permissions', ''));
    expect(search.get('systemId')).toBe(SYS_ID);
    expect(search.get('routeId')).toBe('route-1');
    expect(search.get('permissionTypeId')).toBe('pt-1');
    expect(search.get('q')).toBe('buscar');
    expect(search.get('page')).toBe('2');
    expect(search.get('pageSize')).toBe('50');
    expect(search.get('includeDeleted')).toBe('true');
  });

  it('passa signal/options adiante para o cliente', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const controller = new AbortController();

    await listPermissions(
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
      listPermissions({}, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga rejeições do cliente sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 401, message: 'Sessão expirada.' };
    client.get.mockRejectedValueOnce(apiError);

    await expect(
      listPermissions({}, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });
});

describe('listEffectiveUserPermissions', () => {
  it('emite GET /users/{id}/effective-permissions sem querystring por default', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([makeEffective()]);

    const result = await listEffectiveUserPermissions(
      USER_ID,
      undefined,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe(`/users/${USER_ID}/effective-permissions`);
    expect(result).toHaveLength(1);
    expect(result[0].permissionId).toBe(PERM_ID);
  });

  it('inclui systemId quando informado', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([]);

    await listEffectiveUserPermissions(
      USER_ID,
      SYS_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(
      `/users/${USER_ID}/effective-permissions?systemId=${SYS_ID}`,
    );
  });

  it('aceita sources com kind=direct e kind=role no mesmo permissionId', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeEffective({
        sources: [
          { kind: 'direct' },
          { kind: 'role', roleId: ROLE_ID, roleCode: 'admin', roleName: 'Admin' },
        ],
      }),
    ]);

    const result = await listEffectiveUserPermissions(
      USER_ID,
      undefined,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result[0].sources).toHaveLength(2);
    expect(result[0].sources[0].kind).toBe('direct');
    expect(result[0].sources[1].kind).toBe('role');
    expect(result[0].sources[1].roleCode).toBe('admin');
  });

  it('lança ApiError(parse) quando o backend devolve não-array', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ broken: true });

    await expect(
      listEffectiveUserPermissions(
        USER_ID,
        undefined,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('lança ApiError(parse) quando algum item tem source com kind inválido', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeEffective({
        sources: [{ kind: 'unknown' as unknown as 'direct' }],
      }),
    ]);

    await expect(
      listEffectiveUserPermissions(
        USER_ID,
        undefined,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('assignPermissionToUser', () => {
  it('emite POST /users/{id}/permissions com permissionId no body', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({
      id: 'link-uuid',
      userId: USER_ID,
      permissionId: PERM_ID,
      createdAt: '2026-05-01T12:00:00Z',
      updatedAt: '2026-05-01T12:00:00Z',
      deletedAt: null,
    });

    const result = await assignPermissionToUser(
      USER_ID,
      PERM_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe(`/users/${USER_ID}/permissions`);
    expect(body).toEqual({ permissionId: PERM_ID });
    expect(result.permissionId).toBe(PERM_ID);
  });

  it('lança ApiError(parse) quando a resposta não é UserPermissionLink válido', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      assignPermissionToUser(USER_ID, PERM_ID, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 400 do backend (permissionId inválido) sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 400, message: 'PermissionId inválido.' };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      assignPermissionToUser(USER_ID, PERM_ID, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });
});

describe('removePermissionFromUser', () => {
  it('emite DELETE /users/{id}/permissions/{permissionId} e resolve void', async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    await expect(
      removePermissionFromUser(
        USER_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete.mock.calls[0][0]).toBe(
      `/users/${USER_ID}/permissions/${PERM_ID}`,
    );
  });

  it('propaga 404 do backend (vínculo não encontrado) sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 404, message: 'Vínculo não encontrado.' };
    client.delete.mockRejectedValueOnce(apiError);

    await expect(
      removePermissionFromUser(
        USER_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });
});
