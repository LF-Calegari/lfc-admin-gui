import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  createRolePermissionsClientStub,
  ID_PERM_A,
  ID_PERM_B,
  ID_ROLE,
  ID_SYS,
  makePagedPermissions,
  makePermission,
  primeStubResponses,
  renderRolePermissionsPage,
  waitForInitialFetch,
} from "./__helpers__/rolePermissionsTestHelpers";

import { ToastProvider } from "@/components/ui";
import { RolePermissionsShellPage } from "@/pages/roles/RolePermissionsShellPage";

/**
 * Helper que cria uma Promise que nunca resolve. Necessário para
 * simular um fetch travado (loading state) — `() => {}` em arrow
 * function dispara o lint `no-empty-function`. Wrapper documentado
 * mantém a intenção legível e satisfaz a regra. Espelha o helper
 * homônimo de `UserPermissionsPage.test.tsx` (Issue #70).
 */
const NEVER_RESOLVES = (): Promise<never> =>
  new Promise<never>(() => undefined);

/**
 * Suíte da `RolePermissionsShellPage` (Issue #69).
 *
 * Cobre: estados de loading, erro, vazio, render do agrupamento por
 * sistema, badge "Vinculada", diff client-side ao salvar (assign +
 * remove em paralelo), tratamento de :systemId/:roleId inválidos, e
 * tratamento de falha parcial no salvar.
 *
 * Stub do `ApiClient` injetado via prop `client` — espelha o pattern
 * de `RolesPage`/`UserPermissionsShellPage`. Roteador configurado para
 * `/systems/:systemId/roles/:roleId/permissoes` para que `useParams`
 * devolva os ids reais.
 */

describe("RolePermissionsShellPage — :ids inválidos", () => {
  it("exibe InvalidIdNotice quando :systemId é só whitespace", () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client);

    render(
      <ToastProvider>
        <MemoryRouter
          initialEntries={[`/systems/%20/roles/${ID_ROLE}/permissoes`]}
        >
          <Routes>
            <Route
              path="/systems/:systemId/roles/:roleId/permissoes"
              element={<RolePermissionsShellPage client={client} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(
      screen.getByTestId("role-permissions-invalid-id"),
    ).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("exibe InvalidIdNotice quando :roleId é só whitespace", () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/systems/${ID_SYS}/roles/%20/permissoes`]}>
          <Routes>
            <Route
              path="/systems/:systemId/roles/:roleId/permissoes"
              element={<RolePermissionsShellPage client={client} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(
      screen.getByTestId("role-permissions-invalid-id"),
    ).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe("RolePermissionsShellPage — loading e erro inicial", () => {
  it("exibe spinner enquanto as requests não retornam", () => {
    const client = createRolePermissionsClientStub();
    client.get.mockImplementation(NEVER_RESOLVES);

    renderRolePermissionsPage(client);

    expect(screen.getByTestId("role-permissions-loading")).toBeInTheDocument();
  });

  it("exibe ErrorRetryBlock quando catálogo falha", async () => {
    const client = createRolePermissionsClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith("/permissions")) {
        return Promise.reject({
          kind: "http",
          status: 500,
          message: "Falha interna no servidor.",
        });
      }
      return Promise.resolve([]);
    });

    renderRolePermissionsPage(client);

    await waitFor(() => {
      expect(
        screen.getByText("Falha interna no servidor."),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("role-permissions-retry")).toBeInTheDocument();
  });

  it("retry refaz fetch e renderiza grupo após sucesso", async () => {
    const client = createRolePermissionsClientStub();
    let attempt = 0;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith("/permissions")) {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject({
            kind: "network",
            message: "Falha de conexão.",
          });
        }
        return Promise.resolve(makePagedPermissions([makePermission()]));
      }
      return Promise.resolve([]);
    });

    renderRolePermissionsPage(client);

    await waitFor(() => {
      expect(screen.getByTestId("role-permissions-retry")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("role-permissions-retry"));

    await waitForInitialFetch();
    expect(
      screen.getByTestId("role-permissions-group-authenticator"),
    ).toBeInTheDocument();
  });
});

describe("RolePermissionsShellPage — render do catálogo", () => {
  it("dispara listPermissions com systemId da URL e listRolePermissions com roleId", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client);

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    // Verifica que as duas chamadas (catálogo filtrado e role
    // permissions) foram disparadas com os ids da URL.
    const calls = client.get.mock.calls.map(([path]) => path as string);
    const catalogCall = calls.find((p) => p.startsWith("/permissions"));
    expect(catalogCall).toBeDefined();
    expect(catalogCall).toContain(`systemId=${ID_SYS}`);

    expect(calls).toContain(`/roles/${ID_ROLE}/permissions`);
  });

  it("renderiza permissão como linha do grupo com routeName", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_A, routeName: "Listar usuários" }),
      ]),
      assigned: [],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    expect(
      screen.getByTestId(`role-permissions-item-${ID_PERM_A}`),
    ).toHaveTextContent("Listar usuários");
  });

  it("exibe estado vazio quando o catálogo é vazio", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([]),
      assigned: [],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    expect(screen.getByTestId("role-permissions-empty")).toBeInTheDocument();
  });

  it("marca permissão atualmente vinculada com badge 'Vinculada'", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [ID_PERM_A],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const item = screen.getByTestId(`role-permissions-item-${ID_PERM_A}`);
    expect(item).toHaveTextContent("Vinculada");
  });

  it("checkbox vem desmarcado quando permissão não está vinculada", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const checkbox = screen.getByTestId(
      `role-permissions-checkbox-${ID_PERM_A}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("checkbox vem marcado quando permissão está vinculada", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [ID_PERM_A],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const checkbox = screen.getByTestId(
      `role-permissions-checkbox-${ID_PERM_A}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

describe("RolePermissionsShellPage — interação e diff client-side", () => {
  it("botão Salvar fica desabilitado quando não há mudanças", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [ID_PERM_A],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const save = screen.getByTestId(
      "role-permissions-save",
    ) as HTMLButtonElement;
    expect(save).toBeDisabled();
  });

  it("marcar uma permissão habilita Salvar e mostra 'Adição pendente'", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const checkbox = screen.getByTestId(
      `role-permissions-checkbox-${ID_PERM_A}`,
    );
    fireEvent.click(checkbox);

    expect(screen.getByTestId("role-permissions-save")).not.toBeDisabled();
    expect(
      screen.getByTestId(`role-permissions-item-${ID_PERM_A}`),
    ).toHaveTextContent("Adição pendente");
  });

  it("desmarcar uma permissão vinculada mostra 'Remoção pendente'", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [ID_PERM_A],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    fireEvent.click(
      screen.getByTestId(`role-permissions-checkbox-${ID_PERM_A}`),
    );

    expect(
      screen.getByTestId(`role-permissions-item-${ID_PERM_A}`),
    ).toHaveTextContent("Remoção pendente");
  });

  it("Descartar alterações volta o checkbox ao estado original", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_A })]),
      assigned: [],
    });

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    const checkbox = screen.getByTestId(
      `role-permissions-checkbox-${ID_PERM_A}`,
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByTestId("role-permissions-reset"));
    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId("role-permissions-save")).toBeDisabled();
  });
});

describe("RolePermissionsShellPage — salvar diff", () => {
  it("chama assign apenas para adições e remove apenas para remoções", async () => {
    const client = createRolePermissionsClientStub();
    // Catálogo com 2 permissões: PERM_A (estará marcada) e PERM_B
    // (será desmarcada). Originalmente só PERM_B vinculada — depois
    // do click esperamos: toAdd=[PERM_A], toRemove=[PERM_B].
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_A }),
        makePermission({
          id: ID_PERM_B,
          routeCode: "AUTH_V1_USERS_UPDATE",
          routeName: "Atualizar usuário",
          permissionTypeCode: "Update",
          permissionTypeName: "Edição",
        }),
      ]),
      assigned: [ID_PERM_B],
    });
    client.post.mockResolvedValue({
      id: "link-1",
      roleId: ID_ROLE,
      permissionId: ID_PERM_A,
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-01T10:00:00Z",
      deletedAt: null,
    });
    client.delete.mockResolvedValue(undefined);

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    // marca PERM_A
    fireEvent.click(
      screen.getByTestId(`role-permissions-checkbox-${ID_PERM_A}`),
    );
    // desmarca PERM_B
    fireEvent.click(
      screen.getByTestId(`role-permissions-checkbox-${ID_PERM_B}`),
    );

    fireEvent.click(screen.getByTestId("role-permissions-save"));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });

    const [postPath, postBody] = client.post.mock.calls[0];
    expect(postPath).toBe(`/roles/${ID_ROLE}/permissions`);
    expect(postBody).toEqual({ permissionId: ID_PERM_A });

    expect(client.delete.mock.calls[0][0]).toBe(
      `/roles/${ID_ROLE}/permissions/${ID_PERM_B}`,
    );
  });

  it("falha pontual no assign não aborta o lote (remove ainda é executado)", async () => {
    const client = createRolePermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_A }),
        makePermission({
          id: ID_PERM_B,
          routeCode: "AUTH_V1_USERS_UPDATE",
          permissionTypeCode: "Update",
        }),
      ]),
      assigned: [ID_PERM_B],
    });
    client.post.mockRejectedValue({
      kind: "http",
      status: 400,
      message: "PermissionId inválido.",
    });
    client.delete.mockResolvedValue(undefined);

    renderRolePermissionsPage(client);
    await waitForInitialFetch();

    fireEvent.click(
      screen.getByTestId(`role-permissions-checkbox-${ID_PERM_A}`),
    );
    fireEvent.click(
      screen.getByTestId(`role-permissions-checkbox-${ID_PERM_B}`),
    );
    fireEvent.click(screen.getByTestId("role-permissions-save"));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });
  });
});
