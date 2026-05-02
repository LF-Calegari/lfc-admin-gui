import { describe, expect, it, vi } from 'vitest';

import type {
  ApiClient,
  CreateUserPayload,
  UpdateUserPayload,
  UserDto,
  UserRoleSummary,
} from '@/shared/api';

import {
  assignRoleToUser,
  createUser,
  DEFAULT_USERS_PAGE_SIZE,
  getUserById,
  isPagedUsersResponse,
  isUserDto,
  listUsers,
  resetUserPassword,
  removeRoleFromUser,
  updateUser,
} from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/users.ts` (Issue #77, EPIC #49).
 *
 * Estratégia: stubar o `ApiClient` injetado e validar paths
 * (querystring serializada), type guards e propagação de `ApiError`.
 * Não bate em `fetch` — cobertura de transporte HTTP é
 * responsabilidade dos testes em `client.test.ts`.
 *
 * Diferente de `roles.ts` (que adapta client-side enquanto o backend
 * não pagina), `users.ts` consome o endpoint server-side completo
 * (`PagedResponse<UserResponse>` após PR lfc-authenticator#166).
 * Asserts focam na serialização correta da querystring e no parsing
 * estrito do envelope.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';

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
 * `tests/shared/api/routes.test.ts`/`roles.test.ts`. Mantemos local em
 * vez de importar dos helpers de página para reduzir custo de boot da
 * suíte (sem dependência de DOM).
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
 * Constrói um `UserDto` válido — testes só sobrescrevem o que importa
 * para o cenário sem repetir todos os campos. Campos opcionais
 * (`clientId`/`deletedAt`) ficam definidos por default; testes de
 * type guard usam `Partial<UserDto>` para exercitar omissões.
 */
function makeUserDto(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: USER_ID,
    name: 'Alice Admin',
    email: 'alice@example.com',
    clientId: CLIENT_ID,
    identity: 1,
    active: true,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('isUserDto', () => {
  it('aceita payload completo do contrato', () => {
    expect(isUserDto(makeUserDto())).toBe(true);
  });

  it('aceita clientId null/undefined (usuário sem cliente vinculado)', () => {
    expect(isUserDto(makeUserDto({ clientId: null }))).toBe(true);
    const { clientId: _omit, ...withoutClientId } = makeUserDto();
    expect(isUserDto(withoutClientId)).toBe(true);
  });

  it('aceita deletedAt null/undefined', () => {
    expect(isUserDto(makeUserDto({ deletedAt: null }))).toBe(true);
    const { deletedAt: _omit, ...withoutDeleted } = makeUserDto();
    expect(isUserDto(withoutDeleted)).toBe(true);
  });

  it('rejeita objetos sem campos obrigatórios', () => {
    expect(isUserDto(null)).toBe(false);
    expect(isUserDto(undefined)).toBe(false);
    expect(isUserDto({})).toBe(false);
    expect(isUserDto({ id: 1, name: 'x' })).toBe(false);
    const missingEmail = makeUserDto();
    delete (missingEmail as Partial<UserDto>).email;
    expect(isUserDto(missingEmail)).toBe(false);
  });

  it('rejeita campos com tipos inválidos', () => {
    expect(
      isUserDto(makeUserDto({ active: 'yes' as unknown as boolean })),
    ).toBe(false);
    expect(
      isUserDto(makeUserDto({ identity: '1' as unknown as number })),
    ).toBe(false);
    expect(
      isUserDto(makeUserDto({ clientId: 0 as unknown as string })),
    ).toBe(false);
  });

  it('aceita roles ausente (listagem paginada não traz)', () => {
    expect(isUserDto(makeUserDto())).toBe(true);
  });

  it('aceita roles populado (GET /users/{id})', () => {
    expect(
      isUserDto(
        makeUserDto({
          roles: [
            {
              id: '99999999-9999-9999-9999-999999999999',
              name: 'Admin',
              code: 'admin',
              systemId: '88888888-8888-8888-8888-888888888888',
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('rejeita roles com item de shape inválido', () => {
    expect(
      isUserDto(
        makeUserDto({
          roles: [{ broken: true }] as unknown as UserRoleSummary[],
        }),
      ),
    ).toBe(false);
  });
});

describe('isPagedUsersResponse', () => {
  it('aceita envelope válido com dados', () => {
    const envelope = {
      data: [makeUserDto()],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    expect(isPagedUsersResponse(envelope)).toBe(true);
  });

  it('aceita envelope vazio', () => {
    expect(
      isPagedUsersResponse({ data: [], page: 1, pageSize: 20, total: 0 }),
    ).toBe(true);
  });

  it('rejeita envelope sem campos obrigatórios', () => {
    expect(isPagedUsersResponse(null)).toBe(false);
    expect(isPagedUsersResponse({ data: [] })).toBe(false);
    expect(
      isPagedUsersResponse({
        data: [],
        page: '1' as unknown as number,
        pageSize: 20,
        total: 0,
      }),
    ).toBe(false);
  });

  it('rejeita data com itens inválidos', () => {
    expect(
      isPagedUsersResponse({
        data: [{ broken: true }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toBe(false);
  });
});

describe('listUsers — querystring', () => {
  it('emite GET /users sem querystring quando params são default/omitidos', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [makeUserDto()],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 1,
    });

    await listUsers({}, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe('/users');
  });

  it('serializa q (trimado) na querystring quando informado', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 0,
    });

    await listUsers(
      { q: '  alice  ' },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe('/users?q=alice');
  });

  it('omite q quando vazio depois de trim', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 0,
    });

    await listUsers({ q: '   ' }, undefined, client as unknown as ApiClient);

    expect(client.get.mock.calls[0][0]).toBe('/users');
  });

  it('serializa clientId quando informado', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 0,
    });

    await listUsers(
      { clientId: CLIENT_ID },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(`/users?clientId=${CLIENT_ID}`);
  });

  it('serializa active=true e active=false explicitamente', async () => {
    const client = createStub();
    client.get.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 0,
    });

    await listUsers({ active: true }, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[0][0]).toBe('/users?active=true');

    await listUsers({ active: false }, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[1][0]).toBe('/users?active=false');
  });

  it('omite page=1 (default) e inclui page>1', async () => {
    const client = createStub();
    client.get.mockResolvedValue({
      data: [],
      page: 2,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 30,
    });

    await listUsers({ page: 1 }, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[0][0]).toBe('/users');

    await listUsers({ page: 2 }, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[1][0]).toBe('/users?page=2');
  });

  it('omite pageSize=20 (default) e inclui valores customizados', async () => {
    const client = createStub();
    client.get.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });

    await listUsers(
      { pageSize: DEFAULT_USERS_PAGE_SIZE },
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.get.mock.calls[0][0]).toBe('/users');

    await listUsers(
      { pageSize: 50 },
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.get.mock.calls[1][0]).toBe('/users?pageSize=50');
  });

  it('serializa includeDeleted=true e omite includeDeleted=false (default)', async () => {
    const client = createStub();
    client.get.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 0,
    });

    await listUsers(
      { includeDeleted: false },
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.get.mock.calls[0][0]).toBe('/users');

    await listUsers(
      { includeDeleted: true },
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.get.mock.calls[1][0]).toBe('/users?includeDeleted=true');
  });

  it('combina múltiplos params na ordem correta', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 3,
      pageSize: 50,
      total: 100,
    });

    await listUsers(
      {
        q: 'alice',
        clientId: CLIENT_ID,
        active: true,
        page: 3,
        pageSize: 50,
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(
      `/users?q=alice&clientId=${CLIENT_ID}&active=true&page=3&pageSize=50`,
    );
  });
});

describe('listUsers — comportamento', () => {
  it('passa signal/options adiante para o cliente', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [makeUserDto()],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 1,
    });
    const controller = new AbortController();

    await listUsers(
      {},
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('lança ApiError(parse) quando o backend devolve payload inválido', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      listUsers({}, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({
      kind: 'parse',
      message: 'Resposta inválida do servidor.',
    });
  });

  it('lança ApiError(parse) quando algum item do envelope não é UserDto', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [makeUserDto(), { broken: true }],
      page: 1,
      pageSize: DEFAULT_USERS_PAGE_SIZE,
      total: 2,
    });

    await expect(
      listUsers({}, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga rejeições do cliente sem traduzir', async () => {
    const client = createStub();
    const apiError = { kind: 'http', status: 401, message: 'Sessão expirada.' };
    client.get.mockRejectedValueOnce(apiError);

    await expect(
      listUsers({}, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('devolve o envelope intacto quando válido', async () => {
    const client = createStub();
    const envelope = {
      data: [makeUserDto()],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    client.get.mockResolvedValueOnce(envelope);

    const result = await listUsers(
      {},
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual(envelope);
  });
});

/**
 * Suíte do `createUser` (Issue #78). Cobre serialização do body
 * (trim/omit defensivo), validação do response via `isUserDto` e
 * propagação de erros tipados (`ApiError`).
 *
 * Espelha o padrão de `tests/shared/api/routes.test.ts` para
 * `createRoute` — validar o caminho HTTP unitariamente sem precisar
 * de fetch real.
 */
describe('createUser — body', () => {
  function buildBasicPayload(overrides: Partial<CreateUserPayload> = {}): CreateUserPayload {
    return {
      name: 'Alice Admin',
      email: 'alice@example.com',
      password: 'senha-forte-1',
      identity: 1,
      ...overrides,
    };
  }

  it('emite POST /users com body trimado nos campos texto', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeUserDto());

    await createUser(
      buildBasicPayload({
        name: '  Alice Admin  ',
        email: '  alice@example.com  ',
        password: '  senha-forte-1  ',
      }),
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0][0]).toBe('/users');
    expect(client.post.mock.calls[0][1]).toEqual({
      name: 'Alice Admin',
      email: 'alice@example.com',
      // Senha NÃO é trimada — preserva espaços laterais intencionais.
      password: '  senha-forte-1  ',
      identity: 1,
    });
  });

  it('omite clientId quando vazio (string vazia ou só espaços)', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeUserDto());

    await createUser(
      buildBasicPayload({ clientId: '   ' }),
      undefined,
      client as unknown as ApiClient,
    );

    const body = client.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('clientId');
  });

  it('inclui clientId quando informado e trima', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeUserDto());

    await createUser(
      buildBasicPayload({ clientId: '  ' + CLIENT_ID + '  ' }),
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post.mock.calls[0][1]).toMatchObject({ clientId: CLIENT_ID });
  });

  it('inclui active quando explícito (true ou false)', async () => {
    const client = createStub();
    client.post.mockResolvedValue(makeUserDto());

    await createUser(
      buildBasicPayload({ active: true }),
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.post.mock.calls[0][1]).toMatchObject({ active: true });

    await createUser(
      buildBasicPayload({ active: false }),
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.post.mock.calls[1][1]).toMatchObject({ active: false });
  });

  it('omite active quando ausente (deixa o backend usar default true)', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeUserDto());

    await createUser(buildBasicPayload(), undefined, client as unknown as ApiClient);

    const body = client.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('active');
  });
});

describe('createUser — response e erros', () => {
  function buildBasicPayload(): CreateUserPayload {
    return {
      name: 'Alice Admin',
      email: 'alice@example.com',
      password: 'senha-forte-1',
      identity: 1,
    };
  }

  it('devolve UserDto recém-criado quando o response é válido', async () => {
    const client = createStub();
    const created = makeUserDto({ id: '99999999-9999-9999-9999-999999999999' });
    client.post.mockResolvedValueOnce(created);

    const result = await createUser(
      buildBasicPayload(),
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual(created);
  });

  it('lança ApiError(parse) quando o response não é UserDto', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      createUser(buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 409 do backend (email duplicado) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 409,
      message: 'Já existe um usuário com este Email.',
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      createUser(buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 400 com errors (validação de campo) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'Erro de validação.',
      details: {
        errors: {
          Email: ['Email inválido.'],
          Identity: ['The Identity field is required.'],
        },
      },
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      createUser(buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 400 sem errors (caso ClientId inexistente) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'ClientId informado não existe.',
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      createUser(buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 401/403 sem traduzir', async () => {
    const client = createStub();
    client.post.mockRejectedValueOnce({
      kind: 'http',
      status: 403,
      message: 'Sem permissão.',
    });

    await expect(
      createUser(buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});

/**
 * Suíte do `updateUser` (Issue #79). Cobre serialização do body
 * (trim/omit defensivo, sem `password`, com `active` obrigatório),
 * validação do response via `isUserDto` e propagação de erros
 * tipados (`ApiError`).
 *
 * Espelha o padrão de `updateRole`/`updateSystem` — validar o
 * caminho HTTP unitariamente sem precisar de fetch real.
 */
describe('updateUser — body', () => {
  function buildBasicPayload(
    overrides: Partial<UpdateUserPayload> = {},
  ): UpdateUserPayload {
    return {
      name: 'Alice Admin',
      email: 'alice@example.com',
      identity: 1,
      active: true,
      ...overrides,
    };
  }

  it('emite PUT /users/{id} com body trimado nos campos texto', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await updateUser(
      USER_ID,
      buildBasicPayload({
        name: '  Alice Admin  ',
        email: '  alice@example.com  ',
      }),
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put.mock.calls[0][0]).toBe(`/users/${USER_ID}`);
    expect(client.put.mock.calls[0][1]).toEqual({
      name: 'Alice Admin',
      email: 'alice@example.com',
      identity: 1,
      active: true,
    });
  });

  it('omite clientId quando vazio (string vazia ou só espaços)', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await updateUser(
      USER_ID,
      buildBasicPayload({ clientId: '   ' }),
      undefined,
      client as unknown as ApiClient,
    );

    const body = client.put.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('clientId');
  });

  it('inclui clientId quando informado e trima', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await updateUser(
      USER_ID,
      buildBasicPayload({ clientId: '  ' + CLIENT_ID + '  ' }),
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.put.mock.calls[0][1]).toMatchObject({ clientId: CLIENT_ID });
  });

  it('inclui active explicitamente (true ou false)', async () => {
    const client = createStub();
    client.put.mockResolvedValue(makeUserDto());

    await updateUser(
      USER_ID,
      buildBasicPayload({ active: true }),
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.put.mock.calls[0][1]).toMatchObject({ active: true });

    await updateUser(
      USER_ID,
      buildBasicPayload({ active: false }),
      undefined,
      client as unknown as ApiClient,
    );
    expect(client.put.mock.calls[1][1]).toMatchObject({ active: false });
  });

  it('nunca inclui password no body do update', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await updateUser(
      USER_ID,
      buildBasicPayload(),
      undefined,
      client as unknown as ApiClient,
    );

    const body = client.put.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('password');
  });
});

describe('updateUser — response e erros', () => {
  function buildBasicPayload(): UpdateUserPayload {
    return {
      name: 'Alice Admin',
      email: 'alice@example.com',
      identity: 1,
      active: true,
    };
  }

  it('devolve UserDto atualizado quando o response é válido', async () => {
    const client = createStub();
    const updated = makeUserDto({ name: 'Alice v2' });
    client.put.mockResolvedValueOnce(updated);

    const result = await updateUser(
      USER_ID,
      buildBasicPayload(),
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual(updated);
  });

  it('lança ApiError(parse) quando o response não é UserDto', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce({ malformed: true });

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 409 do backend (email duplicado) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 409,
      message: 'Já existe outro usuário com este Email.',
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 404 do backend (usuário removido) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 404,
      message: 'Usuário não encontrado.',
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 400 com errors (validação de campo) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'Erro de validação.',
      details: {
        errors: {
          Email: ['Email inválido.'],
          Identity: ['The Identity field is required.'],
        },
      },
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 400 sem errors (caso ClientId inexistente) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'ClientId informado não existe.',
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 401/403 sem traduzir', async () => {
    const client = createStub();
    client.put.mockRejectedValueOnce({
      kind: 'http',
      status: 403,
      message: 'Sem permissão.',
    });

    await expect(
      updateUser(USER_ID, buildBasicPayload(), undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});

/* ─── resetUserPassword (Issue #81) ──────────────────────── */

describe('resetUserPassword — body e path', () => {
  it('emite PUT /users/{id}/password com body { password } literal (sem trim)', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await resetUserPassword(
      USER_ID,
      '  senha-com-espacos  ',
/**
 * Suíte do `getUserById` (Issue #71). Cobre a chamada do endpoint
 * `GET /users/{id}`, a propagação do array `roles`
 * (lfc-authenticator#167) e os erros típicos (404 quando o usuário
 * não existe, parse quando o shape diverge).
 */
describe('getUserById', () => {
  const ROLE_ID = '99999999-9999-9999-9999-999999999999';
  const SYSTEM_ID_FOR_ROLE = '88888888-8888-8888-8888-888888888888';

  function makeUserRoleSummary(
    overrides: Partial<UserRoleSummary> = {},
  ): UserRoleSummary {
    return {
      id: ROLE_ID,
      name: 'Administrator',
      code: 'admin',
      systemId: SYSTEM_ID_FOR_ROLE,
      ...overrides,
    };
  }

  it('emite GET /users/{id} e devolve UserDto com roles preenchidas', async () => {
    const client = createStub();
    const userWithRoles = makeUserDto({ roles: [makeUserRoleSummary()] });
    client.get.mockResolvedValueOnce(userWithRoles);

    const result = await getUserById(
      USER_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put.mock.calls[0][0]).toBe(`/users/${USER_ID}/password`);
    // Frontend NÃO trima — backend faz `request.Password.Trim()` ao
    // receber. Preservar literal no transporte garante simetria com
    // o que o operador digitou (e com gerenciadores de senha que
    // produzem strings com prefix/suffix intencionais).
    expect(client.put.mock.calls[0][1]).toEqual({
      password: '  senha-com-espacos  ',
    });
  });

  it('passa options adiante para o cliente (signal/abort)', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());
    const controller = new AbortController();

    await resetUserPassword(
      USER_ID,
      'nova-senha',
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe(`/users/${USER_ID}`);
    expect(result).toEqual(userWithRoles);
    expect(result.roles).toHaveLength(1);
    expect(result.roles?.[0].id).toBe(ROLE_ID);
  });

  it('aceita UserDto sem array roles (payload legado)', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makeUserDto());

    const result = await getUserById(
      USER_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.roles).toBeUndefined();
  });

  it('passa signal/options adiante para o cliente', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makeUserDto());
    const controller = new AbortController();

    await getUserById(
      USER_ID,
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.put.mock.calls[0][2]).toEqual({ signal: controller.signal });
  });

  it('só inclui a chave password no body (não vaza outros campos)', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(makeUserDto());

    await resetUserPassword(
      USER_ID,
      'nova-senha',
      undefined,
      client as unknown as ApiClient,
    );

    const body = client.put.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['password']);
  });
});

describe('resetUserPassword — response e erros', () => {
  it('devolve UserDto atualizado quando o response é válido', async () => {
    const client = createStub();
    const updated = makeUserDto({ updatedAt: '2026-02-01T12:00:00Z' });
    client.put.mockResolvedValueOnce(updated);

    const result = await resetUserPassword(
      USER_ID,
      'nova-senha',
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual(updated);
  });

  it('lança ApiError(parse) quando o response não é UserDto', async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce({ malformed: true });

    await expect(
      resetUserPassword(USER_ID, 'nova-senha', undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 400 com errors.Password (validação de campo) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'Erro de validação.',
      details: {
        errors: {
          Password: ['Password deve ter no máximo 60 caracteres.'],
        },
      },
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      resetUserPassword(USER_ID, 'x'.repeat(120), undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 404 do backend (usuário removido) sem traduzir', async () => {
    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('lança ApiError(parse) quando o backend devolve payload inválido', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      getUserById(USER_ID, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({
      kind: 'parse',
      message: 'Resposta inválida do servidor.',
    });
  });

  it('lança ApiError(parse) quando algum item de roles não é UserRoleSummary', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(
      makeUserDto({
        roles: [{ broken: true }] as unknown as UserRoleSummary[],
      }),
    );

    await expect(
      getUserById(USER_ID, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 404 do backend (usuário não encontrado) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 404,
      message: 'Usuário não encontrado.',
    };
    client.put.mockRejectedValueOnce(apiError);

    await expect(
      resetUserPassword(USER_ID, 'nova-senha', undefined, client as unknown as ApiClient),
    client.get.mockRejectedValueOnce(apiError);

    await expect(
      getUserById(USER_ID, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });

  it('propaga 401/403 sem traduzir', async () => {
    const client = createStub();
    client.put.mockRejectedValueOnce({
    client.get.mockRejectedValueOnce({
      kind: 'http',
      status: 403,
      message: 'Sem permissão.',
    });

    await expect(
      resetUserPassword(USER_ID, 'nova-senha', undefined, client as unknown as ApiClient),
      getUserById(USER_ID, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});

/**
 * Suíte do `assignRoleToUser` (Issue #71). Cobre a chamada do
 * endpoint `POST /users/{userId}/roles` com body `{ roleId }`,
 * validação do response (`UserRoleLinkDto`) e propagação de erros
 * tipados (`ApiError`). Espelha `assignPermissionToUser` (lição
 * PR #128 — mesmo shape de wrapper para o segundo recurso de
 * assignment do mesmo controller).
 */
describe('assignRoleToUser', () => {
  const ROLE_ID = '99999999-9999-9999-9999-999999999999';
  const LINK_ID = '00000000-1111-2222-3333-444444444444';

  function makeLink() {
    return {
      id: LINK_ID,
      userId: USER_ID,
      roleId: ROLE_ID,
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
      deletedAt: null,
    };
  }

  it('emite POST /users/{userId}/roles com body { roleId }', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeLink());

    await assignRoleToUser(
      USER_ID,
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0][0]).toBe(`/users/${USER_ID}/roles`);
    expect(client.post.mock.calls[0][1]).toEqual({ roleId: ROLE_ID });
  });

  it('devolve UserRoleLinkDto válido', async () => {
    const client = createStub();
    const link = makeLink();
    client.post.mockResolvedValueOnce(link);

    const result = await assignRoleToUser(
      USER_ID,
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual(link);
  });

  it('lança ApiError(parse) quando o response não é UserRoleLinkDto', async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      assignRoleToUser(
        USER_ID,
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga 400 (roleId inválido) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 400,
      message: 'RoleId inválido.',
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      assignRoleToUser(
        USER_ID,
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });

  it('propaga 404 (usuário não encontrado) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 404,
      message: 'Usuário não encontrado.',
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      assignRoleToUser(
        USER_ID,
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });
});

/**
 * Suíte do `removeRoleFromUser` (Issue #71). Cobre a chamada do
 * endpoint `DELETE /users/{userId}/roles/{roleId}`, ausência de
 * corpo no retorno (`204 No Content`) e propagação de erros tipados.
 * Espelha `removePermissionFromUser`.
 */
describe('removeRoleFromUser', () => {
  const ROLE_ID = '99999999-9999-9999-9999-999999999999';

  it('emite DELETE /users/{userId}/roles/{roleId}', async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    await removeRoleFromUser(
      USER_ID,
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete.mock.calls[0][0]).toBe(
      `/users/${USER_ID}/roles/${ROLE_ID}`,
    );
  });

  it('passa signal/options adiante para o cliente', async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);
    const controller = new AbortController();

    await removeRoleFromUser(
      USER_ID,
      ROLE_ID,
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.delete.mock.calls[0][1]).toEqual({
      signal: controller.signal,
    });
  });

  it('resolve void em sucesso (204 No Content)', async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    const result = await removeRoleFromUser(
      USER_ID,
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toBeUndefined();
  });

  it('propaga 404 (vínculo não encontrado) sem traduzir', async () => {
    const client = createStub();
    const apiError = {
      kind: 'http',
      status: 404,
      message: 'Vínculo não encontrado.',
    };
    client.delete.mockRejectedValueOnce(apiError);

    await expect(
      removeRoleFromUser(
        USER_ID,
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });

  it('propaga 401/403 sem traduzir', async () => {
    const client = createStub();
    client.delete.mockRejectedValueOnce({
      kind: 'http',
      status: 403,
      message: 'Sem permissão.',
    });

    await expect(
      removeRoleFromUser(
        USER_ID,
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'http', status: 403 });
  });
});
