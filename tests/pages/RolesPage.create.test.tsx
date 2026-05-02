import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthMock } from "./__helpers__/mockUseAuth";
import {
  buildRolesCloseCases,
  buildSharedRoleSubmitErrorCases,
  createRolesClientStub,
  fillNewRoleForm,
  ID_ROLE_ROOT,
  ID_SYS_AUTH,
  makePagedRolesResponse,
  makeRole,
  openCreateRoleModal,
  renderRolesPage,
  submitNewRoleForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from "./__helpers__/rolesTestHelpers";

import type { RolesErrorCase } from "./__helpers__/rolesTestHelpers";

/**
 * Suíte da `RolesPage` — caminho de criação (Issue #67, EPIC #47).
 *
 * Espelha a estratégia de `SystemsPage.create.test.tsx`/
 * `UsersPage.create.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<RolesPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `rolesTestHelpers.tsx` (`openCreateRoleModal`,
 *   `fillNewRoleForm`, `submitNewRoleForm`) para colapsar o boilerplate
 *   "abrir modal → preencher → submeter" e evitar `New Code Duplication`
 *   no Sonar (lição PR #134).
 *
 * Diferenças relativas à suíte de criação de Sistemas:
 *
 * - O backend exige `SystemId` no body do POST (após enriquecimento do
 *   contrato em `lfc-authenticator#163`/`#164`); a UI sempre propaga o
 *   valor lido da URL `/systems/:systemId/roles` — testes asseguram que
 *   o body inclui `systemId`.
 * - 409 cita "neste sistema" (unicidade `(SystemId, Code)` no backend);
 *   a UI usa copy custom em pt-BR ("Já existe uma role com este código
 *   neste sistema.") em vez de propagar a do controller.
 * - 404 não é tratado pelo create (backend não devolve 404 nesse path
 *   — não há entidade para "sumir entre abertura e submit"). Os 5
 *   cenários comuns (400 com/sem errors, 401, 403, network) vêm de
 *   `buildSharedRoleSubmitErrorCases('criar')`.
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock("@/shared/auth", () => buildAuthMock(() => permissionsMock));

const ROLES_CREATE_PERMISSION = "AUTH_V1_ROLES_CREATE";

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = "";
});

describe("RolesPage — criação (Issue #67)", () => {
  describe('gating do botão "Nova role"', () => {
    it("não exibe o botão quando o usuário não possui AUTH_V1_ROLES_CREATE", async () => {
      permissionsMock = [];
      const client = createRolesClientStub();
      client.get.mockResolvedValueOnce(makePagedRolesResponse([makeRole()]));

      renderRolesPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId("roles-create-open")).not.toBeInTheDocument();
    });

    it("exibe o botão quando o usuário possui AUTH_V1_ROLES_CREATE", async () => {
      permissionsMock = [ROLES_CREATE_PERMISSION];
      const client = createRolesClientStub();
      client.get.mockResolvedValueOnce(makePagedRolesResponse([makeRole()]));

      renderRolesPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId("roles-create-open");
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(/Nova role/i);
    });
  });

  describe("abertura e fechamento do modal", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_CREATE_PERMISSION];
    });

    it('clicar em "Nova role" abre o diálogo com os campos do form vazios', async () => {
      const client = createRolesClientStub();
      await openCreateRoleModal(client);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("new-role-name")).toHaveValue("");
      expect(screen.getByTestId("new-role-code")).toHaveValue("");
      expect(screen.getByTestId("new-role-description")).toHaveValue("");
    });

    /**
     * Cenários de fechamento sem persistir — Esc, botão Cancelar e
     * clique no backdrop. Colapsados em `it.each` (lição PR #123 — a
     * mesma estrutura mudando apenas 1 ação dispara duplicação Sonar
     * quando deixada como `it` separados). Helper compartilhado com a
     * suíte de edição (`buildRolesCloseCases`) para evitar duplicação
     * do array literal de 14 linhas (lição PR #127).
     */
    const CLOSE_CASES = buildRolesCloseCases("new-role-cancel");

    it.each(CLOSE_CASES)(
      "fechar via $name não dispara POST",
      async ({ close }) => {
        const client = createRolesClientStub();
        await openCreateRoleModal(client);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(client.post).not.toHaveBeenCalled();
      },
    );
  });

  describe("validação client-side", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_CREATE_PERMISSION];
    });

    it("submeter com campos vazios mostra erros inline e não chama POST", async () => {
      const client = createRolesClientStub();
      await openCreateRoleModal(client);

      fireEvent.submit(screen.getByTestId("new-role-form"));

      expect(screen.getByText("Nome é obrigatório.")).toBeInTheDocument();
      expect(screen.getByText("Código é obrigatório.")).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it("campos com apenas espaços também são tratados como vazios", async () => {
      const client = createRolesClientStub();
      await openCreateRoleModal(client);

      fillNewRoleForm({ name: "   ", code: "  " });
      fireEvent.submit(screen.getByTestId("new-role-form"));

      expect(screen.getByText("Nome é obrigatório.")).toBeInTheDocument();
      expect(screen.getByText("Código é obrigatório.")).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it("descrição maior que 500 caracteres mostra erro inline", async () => {
      const client = createRolesClientStub();
      await openCreateRoleModal(client);

      const longDesc = "x".repeat(501);
      fillNewRoleForm({
        name: "Algum Nome",
        code: "code",
        description: longDesc,
      });
      fireEvent.submit(screen.getByTestId("new-role-form"));

      expect(
        screen.getByText("Descrição deve ter no máximo 500 caracteres."),
      ).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe("submissão bem-sucedida", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_CREATE_PERMISSION];
    });

    it("envia POST /roles com body trimado (incluindo systemId), fecha modal, exibe toast e refaz listRoles", async () => {
      const created = makeRole({
        id: ID_ROLE_ROOT,
        name: "Operador",
        code: "operator",
        description: "Operador padrão do sistema.",
      });
      const client = createRolesClientStub();
      // Fila: GET inicial → GET refetch → POST.
      client.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([created]);
      client.post.mockResolvedValueOnce(created);

      await openCreateRoleModal(client);

      fillNewRoleForm({
        name: "  Operador  ",
        code: "  operator  ",
        description: "  Operador padrão do sistema.  ",
      });
      await submitNewRoleForm(client);

      expect(client.post).toHaveBeenCalledWith(
        "/roles",
        {
          systemId: ID_SYS_AUTH,
          name: "Operador",
          code: "operator",
          description: "Operador padrão do sistema.",
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Toast verde "Role criada.".
      expect(await screen.findByText("Role criada.")).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez (inicial
      // + refetch).
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it("envia body sem o campo description quando o usuário deixa vazio", async () => {
      const created = makeRole({
        id: ID_ROLE_ROOT,
        name: "Sem Desc",
        code: "no_desc",
        description: null,
      });
      const client = createRolesClientStub();
      client.post.mockResolvedValueOnce(created);

      await openCreateRoleModal(client);

      fillNewRoleForm({ name: "Sem Desc", code: "no_desc" });
      await submitNewRoleForm(client);

      const [, body] = client.post.mock.calls[0];
      expect(body).toEqual({
        systemId: ID_SYS_AUTH,
        name: "Sem Desc",
        code: "no_desc",
      });
      expect(body).not.toHaveProperty("description");
    });
  });

  describe("tratamento de erros do backend", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_CREATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Caso
     * específico do create: 409 com mensagem inline custom no campo
     * `code`. Os 5 cenários comuns (400 com/sem errors, 401, 403,
     * network) vêm de `buildSharedRoleSubmitErrorCases('criar')`,
     * pré-fabricado desde o PR #143 (Issue #66).
     *
     * 404 não entra no create — backend nunca devolve 404 nesse path
     * (não há entidade para "sumir entre abertura e submit"). O
     * helper genérico cai no fallback `unhandled` se chegar.
     */
    const ERROR_CASES: ReadonlyArray<RolesErrorCase> = [
      {
        name: "409 (code duplicado no sistema) exibe mensagem inline no campo code",
        error: {
          kind: "http",
          status: 409,
          message: "Já existe outro role com este Code neste sistema.",
        },
        expectedText: "Já existe uma role com este código neste sistema.",
      },
      ...buildSharedRoleSubmitErrorCases("criar"),
    ];

    it.each(ERROR_CASES)(
      "mapeia $name",
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createRolesClientStub();
        client.post.mockRejectedValueOnce(error);

        await openCreateRoleModal(client);
        // Valores genéricos válidos para passar a validação client-
        // side; o teste foca no comportamento de erro vindo do
        // backend, não na validação local.
        fillNewRoleForm({ name: "Algum Nome", code: "code" });
        await submitNewRoleForm(client);

        expect(
          await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
        ).toBeInTheDocument();

        if (modalStaysOpen) {
          expect(screen.getByRole("dialog")).toBeInTheDocument();
        }
      },
    );
  });
});
