import { describe, expect, it, vi } from "vitest";

import type { ApiClient, RoleDto, RolePermissionLinkDto } from "@/shared/api";

import {
  assignPermissionToRole,
  createRole,
  deleteRole,
  isPagedRolesResponse,
  isRoleDto,
  isRolePermissionLinkDto,
  listRolePermissions,
  listRoles,
  removePermissionFromRole,
  updateRole,
} from "@/shared/api";

/**
 * Suíte do módulo `src/shared/api/roles.ts` (Issue #66, EPIC #47).
 *
 * Estratégia: stubar o `ApiClient` injetado e validar paths, body,
 * type guards e propagação de `ApiError`. Não bate em `fetch` —
 * cobertura de transporte HTTP é responsabilidade dos testes em
 * `client.test.ts`.
 *
 * Nesta primeira sub-issue só `listRoles` é consumido pela UI; os
 * wrappers `createRole`/`updateRole`/`deleteRole` foram declarados
 * já agora para evitar PR destrutivo nas próximas sub-issues
 * (lição PR #128 — projetar shared helpers desde o primeiro PR do
 * recurso), portanto cobrimos todos com asserts mínimos.
 *
 * **Importante (TODO no backend):** o `RoleDto` aceita
 * `description`/`permissionsCount`/`usersCount` opcionais — o
 * backend hoje não devolve esses campos. Os testes exercitam ambos
 * os caminhos (campo presente vs. ausente) para que quando o
 * backend evoluir não seja preciso reescrever a suíte.
 *
 * **Adapter client-side:** como o backend `/roles` não tem
 * paginação/busca/includeDeleted nativos, `listRoles` aplica os
 * filtros em memória sobre o array cru devolvido pelo controller.
 * A suíte cobre o adapter (filtragem por `q`, `includeDeleted`,
 * paginação) — quando o backend ganhar paginação real, basta
 * reescrever `listRoles` e ajustar dois testes do bloco "adapter".
 */

const SYS_ID = "11111111-1111-1111-1111-111111111111";
const ROLE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
 * `tests/shared/api/routes.test.ts`/`tests/pages/__helpers__/`. O
 * teste de API não precisa do DOM, então mantemos local em vez de
 * importar dos helpers de página (manter independência reduz custo
 * de boot da suíte).
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
    getSystemId: vi.fn(() => "system-test-uuid"),
  };
}

/**
 * Constrói um `RoleDto` válido — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos. Campos
 * opcionais (`description`/`permissionsCount`/`usersCount`) ficam
 * `null` por default para refletir mocks que datam de antes da
 * evolução do backend; testes que querem o caminho "campo presente"
 * sobrescrevem.
 *
 * `systemId` é incluído por default casando com o contrato pós-
 * `lfc-authenticator#163` (campo passou a ser obrigatório no model);
 * testes que precisam exercer o cenário "fixture legado sem
 * systemId" sobrescrevem para `null`.
 */
function makeRoleDto(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: ROLE_ID,
    systemId: SYS_ID,
    name: "Root",
    code: "root",
    description: null,
    permissionsCount: null,
    usersCount: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("isRoleDto", () => {
  it("aceita payload completo do contrato (com todos os campos opcionais)", () => {
    expect(
      isRoleDto(
        makeRoleDto({
          description: "Acesso irrestrito",
          permissionsCount: 12,
          usersCount: 2,
        }),
      ),
    ).toBe(true);
  });

  it("aceita payload sem os campos opcionais (estado atual do backend)", () => {
    expect(isRoleDto(makeRoleDto())).toBe(true);
    const {
      description: _d,
      permissionsCount: _p,
      usersCount: _u,
      ...lean
    } = makeRoleDto();
    expect(isRoleDto(lean)).toBe(true);
  });

  it("aceita description ausente/null/undefined", () => {
    expect(isRoleDto(makeRoleDto({ description: null }))).toBe(true);
    const { description: _omit, ...withoutDescription } = makeRoleDto();
    expect(isRoleDto(withoutDescription)).toBe(true);
  });

  it("aceita deletedAt ausente/null/undefined", () => {
    expect(isRoleDto(makeRoleDto({ deletedAt: null }))).toBe(true);
    const { deletedAt: _omit, ...withoutDeleted } = makeRoleDto();
    expect(isRoleDto(withoutDeleted)).toBe(true);
  });

  it("rejeita objetos sem campos obrigatórios", () => {
    expect(isRoleDto(null)).toBe(false);
    expect(isRoleDto(undefined)).toBe(false);
    expect(isRoleDto({})).toBe(false);
    expect(isRoleDto({ id: 1, code: "root" })).toBe(false);
    const missingCode = makeRoleDto();
    delete (missingCode as Partial<RoleDto>).code;
    expect(isRoleDto(missingCode)).toBe(false);
  });

  it("rejeita campos com tipos inválidos", () => {
    expect(
      isRoleDto(makeRoleDto({ description: 123 as unknown as string })),
    ).toBe(false);
    expect(isRoleDto(makeRoleDto({ deletedAt: 0 as unknown as string }))).toBe(
      false,
    );
    expect(
      isRoleDto(
        makeRoleDto({
          permissionsCount: "doze" as unknown as number,
        }),
      ),
    ).toBe(false);
    expect(
      isRoleDto(makeRoleDto({ usersCount: "12" as unknown as number })),
    ).toBe(false);
  });
});

describe("isPagedRolesResponse", () => {
  it("aceita envelope válido com dados", () => {
    const envelope = {
      data: [makeRoleDto()],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    expect(isPagedRolesResponse(envelope)).toBe(true);
  });

  it("aceita envelope vazio", () => {
    expect(
      isPagedRolesResponse({ data: [], page: 1, pageSize: 20, total: 0 }),
    ).toBe(true);
  });

  it("rejeita envelope sem campos", () => {
    expect(isPagedRolesResponse(null)).toBe(false);
    expect(isPagedRolesResponse({ data: [] })).toBe(false);
    expect(
      isPagedRolesResponse({ data: [], page: "1", pageSize: 20, total: 0 }),
    ).toBe(false);
  });

  it("rejeita data com itens inválidos", () => {
    expect(
      isPagedRolesResponse({
        data: [{ broken: true }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toBe(false);
  });
});

/**
 * Helper para o envelope paginado server-side. Após
 * `lfc-authenticator#163`/`#164`, o backend devolve
 * `PagedResponse<RoleResponse>` nativo — `listRoles` valida e
 * propaga sem adapter cliente.
 */
function makePagedRolesEnvelope(
  data: ReadonlyArray<RoleDto>,
  overrides: Partial<{
    page: number;
    pageSize: number;
    total: number;
  }> = {},
) {
  return {
    data,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total ?? data.length,
  };
}

describe("listRoles — envelope paginado server-side", () => {
  it("emite GET /roles com querystring vazia quando todos os params são default", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([makeRoleDto()]));

    const result = await listRoles(
      {},
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe("/roles");
    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
  });

  it("inclui systemId na querystring quando informado", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([makeRoleDto()]));

    await listRoles(
      { systemId: SYS_ID },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(`/roles?systemId=${SYS_ID}`);
  });

  it("inclui q após trim quando informado", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([]));

    await listRoles(
      { q: "  admin  " },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe("/roles?q=admin");
  });

  it("omite q vazio após trim", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([]));

    await listRoles(
      { q: "   " },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe("/roles");
  });

  it("inclui page/pageSize/includeDeleted quando diferentes do default", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([]));

    await listRoles(
      { page: 2, pageSize: 50, includeDeleted: true },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(
      "/roles?page=2&pageSize=50&includeDeleted=true",
    );
  });

  it("passa signal/options adiante para o cliente", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce(makePagedRolesEnvelope([makeRoleDto()]));
    const controller = new AbortController();

    await listRoles(
      { systemId: SYS_ID },
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("lança ApiError(parse) quando o backend devolve payload inválido", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      listRoles(
        { systemId: SYS_ID },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({
      kind: "parse",
      message: "Resposta inválida do servidor.",
    });
  });

  it("lança ApiError(parse) quando algum item do envelope não é RoleDto", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [makeRoleDto(), { broken: true }],
      page: 1,
      pageSize: 20,
      total: 2,
    });

    await expect(
      listRoles(
        { systemId: SYS_ID },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("propaga rejeições do cliente sem traduzir", async () => {
    const client = createStub();
    const apiError = { kind: "http", status: 401, message: "Sessão expirada." };
    client.get.mockRejectedValueOnce(apiError);

    await expect(
      listRoles(
        { systemId: SYS_ID },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });

  it("respeita o page/pageSize/total devolvidos pelo backend (sem reaplicar paginação)", async () => {
    const client = createStub();
    const data = Array.from({ length: 10 }, (_, i) =>
      makeRoleDto({ id: `id-${i}`, code: `r${String(i).padStart(2, "0")}` }),
    );
    client.get.mockResolvedValueOnce(
      makePagedRolesEnvelope(data, { page: 2, pageSize: 10, total: 25 }),
    );

    const result = await listRoles(
      { page: 2, pageSize: 10 },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.total).toBe(25);
    expect(result.data).toHaveLength(10);
  });
});

describe("createRole", () => {
  it("emite POST /roles com body trimado (incluindo systemId) e devolve RoleDto", async () => {
    const client = createStub();
    const created = makeRoleDto();
    client.post.mockResolvedValueOnce(created);

    const result = await createRole(
      {
        systemId: SYS_ID,
        name: "  Root  ",
        code: " root ",
        description: "  desc  ",
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe("/roles");
    // `systemId` é exigido pelo backend após o enriquecimento do
    // contrato em `lfc-authenticator#163`/`#164` — wrapper sempre o
    // propaga sem trim (vem da URL já normalizada). `name`/`code`/
    // `description` recebem trim defensivo.
    expect(body).toEqual({
      systemId: SYS_ID,
      name: "Root",
      code: "root",
      description: "desc",
    });
    expect(result).toEqual(created);
  });

  it("omite description quando string vazia/whitespace após trim", async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce(makeRoleDto());

    await createRole(
      { systemId: SYS_ID, name: "Root", code: "root", description: "   " },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post.mock.calls[0][1]).toEqual({
      systemId: SYS_ID,
      name: "Root",
      code: "root",
    });
  });

  it("lança ApiError(parse) quando resposta não é RoleDto", async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      createRole(
        { systemId: SYS_ID, name: "X", code: "X" },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("updateRole", () => {
  it("emite PUT /roles/{id} com body trimado (incluindo systemId) e devolve RoleDto", async () => {
    const client = createStub();
    const updated = makeRoleDto({ name: "Root (atualizado)" });
    client.put.mockResolvedValueOnce(updated);

    const result = await updateRole(
      ROLE_ID,
      {
        systemId: SYS_ID,
        name: "  Root (atualizado)  ",
        code: "root",
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.put).toHaveBeenCalledTimes(1);
    const [path, body] = client.put.mock.calls[0];
    expect(path).toBe(`/roles/${ROLE_ID}`);
    // `systemId` é exigido pelo backend (`UpdateRoleRequest` herda
    // `SystemId` de `RoleRequestBase`). Tentar mudá-lo retorna 400
    // com "SystemId é imutável após a criação do role." — o wrapper
    // só repassa, é responsabilidade do caller injetar o valor
    // correto (vindo da URL `/systems/:systemId/roles`).
    expect(body).toEqual({
      systemId: SYS_ID,
      name: "Root (atualizado)",
      code: "root",
    });
    expect(result).toEqual(updated);
  });

  it("lança ApiError(parse) quando resposta não é RoleDto", async () => {
    const client = createStub();
    client.put.mockResolvedValueOnce(null);

    await expect(
      updateRole(
        ROLE_ID,
        { systemId: SYS_ID, name: "X", code: "X" },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("deleteRole", () => {
  it("emite DELETE /roles/{id} e resolve void", async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    await expect(
      deleteRole(ROLE_ID, undefined, client as unknown as ApiClient),
    ).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete.mock.calls[0][0]).toBe(`/roles/${ROLE_ID}`);
  });

  it("propaga rejeições do cliente sem traduzir", async () => {
    const client = createStub();
    const apiError = {
      kind: "http",
      status: 404,
      message: "Role não encontrada.",
    };
    client.delete.mockRejectedValueOnce(apiError);

    await expect(
      deleteRole(ROLE_ID, undefined, client as unknown as ApiClient),
    ).rejects.toEqual(apiError);
  });
});

const PERM_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeRolePermissionLinkDto(
  overrides: Partial<RolePermissionLinkDto> = {},
): RolePermissionLinkDto {
  return {
    id: "link-uuid",
    roleId: ROLE_ID,
    permissionId: PERM_ID,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("isRolePermissionLinkDto", () => {
  it("aceita payload válido com deletedAt null", () => {
    expect(isRolePermissionLinkDto(makeRolePermissionLinkDto())).toBe(true);
  });

  it("aceita deletedAt ausente (tratado como null)", () => {
    const { deletedAt: _omit, ...withoutDeleted } = makeRolePermissionLinkDto();
    expect(isRolePermissionLinkDto(withoutDeleted)).toBe(true);
  });

  it("rejeita objetos sem campos obrigatórios", () => {
    expect(isRolePermissionLinkDto(null)).toBe(false);
    expect(isRolePermissionLinkDto({})).toBe(false);
    expect(
      isRolePermissionLinkDto({ id: "x", roleId: "y", permissionId: 1 }),
    ).toBe(false);
  });
});

describe("listRolePermissions", () => {
  it("emite GET /roles/{roleId}/permissions e devolve array de ids quando backend retorna string[]", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([PERM_ID, "outra-perm"]);

    const result = await listRolePermissions(
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe(`/roles/${ROLE_ID}/permissions`);
    expect(result).toEqual([PERM_ID, "outra-perm"]);
  });

  it("aceita formato RolePermissionLinkDto[] e extrai os ids", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRolePermissionLinkDto({ permissionId: PERM_ID }),
      makeRolePermissionLinkDto({
        id: "link-2",
        permissionId: "outra-perm",
      }),
    ]);

    const result = await listRolePermissions(
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual([PERM_ID, "outra-perm"]);
  });

  it("aceita array vazio", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([]);

    const result = await listRolePermissions(
      ROLE_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(result).toEqual([]);
  });

  it("passa signal/options adiante para o cliente", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([]);
    const controller = new AbortController();

    await listRolePermissions(
      ROLE_ID,
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("lança ApiError(parse) quando resposta não é array", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      listRolePermissions(
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("lança ApiError(parse) quando itens têm shape inválido", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([{ broken: true }]);

    await expect(
      listRolePermissions(
        ROLE_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("assignPermissionToRole", () => {
  it("emite POST /roles/{roleId}/permissions com body { permissionId }", async () => {
    const client = createStub();
    const link = makeRolePermissionLinkDto();
    client.post.mockResolvedValueOnce(link);

    const result = await assignPermissionToRole(
      ROLE_ID,
      PERM_ID,
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    const [path, body] = client.post.mock.calls[0];
    expect(path).toBe(`/roles/${ROLE_ID}/permissions`);
    expect(body).toEqual({ permissionId: PERM_ID });
    expect(result).toEqual(link);
  });

  it("lança ApiError(parse) quando resposta não é RolePermissionLinkDto", async () => {
    const client = createStub();
    client.post.mockResolvedValueOnce({ malformed: true });

    await expect(
      assignPermissionToRole(
        ROLE_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("propaga rejeições do cliente sem traduzir", async () => {
    const client = createStub();
    const apiError = {
      kind: "http",
      status: 400,
      message: "PermissionId inválido.",
    };
    client.post.mockRejectedValueOnce(apiError);

    await expect(
      assignPermissionToRole(
        ROLE_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });
});

describe("removePermissionFromRole", () => {
  it("emite DELETE /roles/{roleId}/permissions/{permissionId} e resolve void", async () => {
    const client = createStub();
    client.delete.mockResolvedValueOnce(undefined);

    await expect(
      removePermissionFromRole(
        ROLE_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).resolves.toBeUndefined();
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(client.delete.mock.calls[0][0]).toBe(
      `/roles/${ROLE_ID}/permissions/${PERM_ID}`,
    );
  });

  it("propaga rejeições do cliente sem traduzir", async () => {
    const client = createStub();
    const apiError = {
      kind: "http",
      status: 404,
      message: "Vínculo não encontrado.",
    };
    client.delete.mockRejectedValueOnce(apiError);

    await expect(
      removePermissionFromRole(
        ROLE_ID,
        PERM_ID,
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toEqual(apiError);
  });
});

