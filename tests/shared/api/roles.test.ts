import { describe, expect, it, vi } from "vitest";

import type { ApiClient, RoleDto } from "@/shared/api";

import {
  createRole,
  deleteRole,
  isPagedRolesResponse,
  isRoleDto,
  listRoles,
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
 * `null` por default para refletir o estado **atual** do backend.
 */
function makeRoleDto(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: ROLE_ID,
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

describe("listRoles — endpoint atual /roles (GET cru, adapter client-side)", () => {
  it("emite GET /roles e devolve envelope paginado quando backend devolve array", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([makeRoleDto()]);

    const result = await listRoles(
      { systemId: SYS_ID },
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

  it("passa signal/options adiante para o cliente", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([makeRoleDto()]);
    const controller = new AbortController();

    await listRoles(
      { systemId: SYS_ID },
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("lança ApiError(parse) quando o backend devolve payload inválido (não-array)", async () => {
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

  it("lança ApiError(parse) quando algum item do array não é RoleDto", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([makeRoleDto(), { broken: true }]);

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
});

describe("listRoles — adapter client-side (filtros/ordem/paginação)", () => {
  it("filtra deletedAt quando includeDeleted=false (default)", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRoleDto({ id: "a", code: "aroot" }),
      makeRoleDto({
        id: "b",
        code: "bdeleted",
        deletedAt: "2026-02-01T00:00:00Z",
      }),
    ]);

    const result = await listRoles(
      { systemId: SYS_ID },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("a");
    expect(result.total).toBe(1);
  });

  it("inclui deletedAt quando includeDeleted=true", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRoleDto({ id: "a", code: "aroot" }),
      makeRoleDto({
        id: "b",
        code: "bdeleted",
        deletedAt: "2026-02-01T00:00:00Z",
      }),
    ]);

    const result = await listRoles(
      { systemId: SYS_ID, includeDeleted: true },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("filtra por q (case-insensitive em name e code) após trim", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRoleDto({ id: "a", name: "Root", code: "root" }),
      makeRoleDto({ id: "b", name: "Admin", code: "admin" }),
      makeRoleDto({ id: "c", name: "Viewer", code: "viewer" }),
    ]);

    const result = await listRoles(
      { systemId: SYS_ID, q: "  ROO  " },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.data.map((r) => r.id)).toEqual(["a"]);
    expect(result.total).toBe(1);
  });

  it("q vazio após trim devolve todos os resultados", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRoleDto({ id: "a", code: "a" }),
      makeRoleDto({ id: "b", code: "b" }),
    ]);

    const result = await listRoles(
      { systemId: SYS_ID, q: "   " },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.total).toBe(2);
  });

  it("ordena por code (estabilidade visual entre refetches)", async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce([
      makeRoleDto({ id: "c", code: "charlie" }),
      makeRoleDto({ id: "a", code: "alpha" }),
      makeRoleDto({ id: "b", code: "bravo" }),
    ]);

    const result = await listRoles(
      { systemId: SYS_ID },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.data.map((r) => r.code)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("aplica page/pageSize em memória; total reflete o conjunto após filtros", async () => {
    const client = createStub();
    const rows = Array.from({ length: 25 }, (_, i) =>
      makeRoleDto({ id: `id-${i}`, code: `r${String(i).padStart(2, "0")}` }),
    );
    client.get.mockResolvedValueOnce(rows);

    const result = await listRoles(
      { systemId: SYS_ID, page: 2, pageSize: 10 },
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.total).toBe(25);
    expect(result.data).toHaveLength(10);
    expect(result.data[0].code).toBe("r10");
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
