import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthMock } from "./__helpers__/mockUseAuth";
import {
  buildRolesCloseCases,
  buildSharedRoleSubmitErrorCases,
  createRolesClientStub,
  fillEditRoleForm,
  ID_ROLE_ROOT,
  ID_SYS_AUTH,
  makePagedRolesResponse,
  makeRole,
  openEditRoleModal,
  renderRolesPage,
  submitEditRoleForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from "./__helpers__/rolesTestHelpers";

import type { RolesErrorCase } from "./__helpers__/rolesTestHelpers";
import type { ApiError } from "@/shared/api";

/**
 * Suíte da `RolesPage` — caminho de edição (Issue #68, EPIC #47).
 *
 * Espelha a estratégia de `RoutesPage.edit.test.tsx`/
 * `SystemsPage.edit.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<RolesPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `rolesTestHelpers.tsx` para colapsar
 *   o boilerplate "abrir modal → preencher → submeter" e evitar
 *   `New Code Duplication` no Sonar (lição PR #134).
 *
 * Diferenças relativas à suíte de edição de Rotas:
 *
 * - O modal de role não tem dependência de `<Select>` externo (sem
 *   token types) — o fluxo de abertura é simples: GET inicial →
 *   click no botão "Editar" → form pré-populado.
 * - O backend exige `SystemId` no body do PUT (após enriquecimento
 *   do contrato em `lfc-authenticator#163`/`#164`); a UI sempre
 *   propaga o valor lido da URL `/systems/:systemId/roles` — testes
 *   asseguram que o body inclui `systemId`.
 * - 409 cita "outra role neste sistema" (unicidade `(SystemId, Code)`
 *   no backend; mensagem do controller é
 *   `"Já existe outro role com este Code neste sistema."`).
 * - 404 fecha o modal e dispara refetch (role removida
 *   concorrentemente entre abertura e submit).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock("@/shared/auth", () => buildAuthMock(() => permissionsMock));

const ROLES_UPDATE_PERMISSION = "AUTH_V1_ROLES_UPDATE";

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = "";
});

describe("RolesPage — edição (Issue #68)", () => {
  describe('gating do botão "Editar" por linha', () => {
    it('não exibe botões "Editar" quando o usuário não possui AUTH_V1_ROLES_UPDATE', async () => {
      permissionsMock = [];
      const client = createRolesClientStub();
      client.get.mockResolvedValueOnce(makePagedRolesResponse([makeRole()]));

      // Renderização explícita aqui (sem helper de open) porque o
      // teste valida apenas a ausência do botão antes de abrir
      // qualquer modal.
      renderRolesPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`roles-edit-${ID_ROLE_ROOT}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Editar" para linhas ativas quando o usuário possui AUTH_V1_ROLES_UPDATE', async () => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
      const client = createRolesClientStub();
      client.get.mockResolvedValueOnce(makePagedRolesResponse([makeRole()]));

      renderRolesPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`roles-edit-${ID_ROLE_ROOT}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute("aria-label", "Editar role Root");
    });

    it('não exibe botão "Editar" em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
      const client = createRolesClientStub();
      // O backend filtra `deletedAt !== null` quando
      // `includeDeleted=false` (default). Para que a role
      // soft-deletada apareça na tabela e possamos verificar a
      // ausência do botão "Editar", ligamos o toggle "Mostrar
      // inativas" — assim o gating exercitado é o `row.deletedAt`
      // dentro da render da coluna "Ações", não o filtro
      // server-side.
      const deletedRole = makeRole({ deletedAt: "2026-02-01T00:00:00Z" });
      client.get
        .mockResolvedValueOnce(makePagedRolesResponse([deletedRole]))
        .mockResolvedValueOnce(makePagedRolesResponse([deletedRole]));

      renderRolesPage(client);
      await waitForInitialList(client);
      // Liga o toggle "Mostrar inativas" para a role aparecer na
      // listagem; o gating é por `row.deletedAt`, não pela
      // visibilidade.
      fireEvent.click(screen.getByTestId("roles-include-deleted"));
      await waitFor(() => {
        expect(screen.queryByTestId("roles-loading")).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId(`roles-edit-${ID_ROLE_ROOT}`),
      ).not.toBeInTheDocument();
    });
  });

  describe("abertura e pré-preenchimento do modal", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
    });

    it('clicar em "Editar" abre o diálogo pré-populado com os dados da role', async () => {
      const role = makeRole({
        id: ID_ROLE_ROOT,
        name: "Root",
        code: "root",
        description: "Acesso irrestrito a todos os sistemas",
      });
      const client = createRolesClientStub();
      await openEditRoleModal(client, { role });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("edit-role-name")).toHaveValue("Root");
      expect(screen.getByTestId("edit-role-code")).toHaveValue("root");
      expect(screen.getByTestId("edit-role-description")).toHaveValue(
        "Acesso irrestrito a todos os sistemas",
      );
    });

    it("aceita role sem description (description=null vira string vazia)", async () => {
      const role = makeRole({ description: null });
      const client = createRolesClientStub();
      await openEditRoleModal(client, { role });

      expect(screen.getByTestId("edit-role-description")).toHaveValue("");
    });

    /**
     * Cenários de fechamento sem persistir — colapsados em `it.each`
     * via `buildRolesCloseCases` para evitar BLOCKER de duplicação
     * Sonar (lição PR #123/#127). Reusa o mesmo helper de fechamento
     * pré-fabricado em `rolesTestHelpers` desde o PR #143.
     */
    const CLOSE_CASES = buildRolesCloseCases("edit-role-cancel");

    it.each(CLOSE_CASES)(
      "fechar via $name não dispara PUT",
      async ({ close }) => {
        const client = createRolesClientStub();
        await openEditRoleModal(client);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(client.put).not.toHaveBeenCalled();
      },
    );
  });

  describe("validação client-side", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
    });

    it("apagar campos obrigatórios mostra erros inline e não chama PUT", async () => {
      const client = createRolesClientStub();
      await openEditRoleModal(client);

      fillEditRoleForm({ name: "", code: "" });
      fireEvent.submit(screen.getByTestId("edit-role-form"));

      expect(screen.getByText("Nome é obrigatório.")).toBeInTheDocument();
      expect(screen.getByText("Código é obrigatório.")).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it("campos com apenas espaços também são tratados como vazios", async () => {
      const client = createRolesClientStub();
      await openEditRoleModal(client);

      fillEditRoleForm({ name: "   ", code: "  " });
      fireEvent.submit(screen.getByTestId("edit-role-form"));

      expect(screen.getByText("Nome é obrigatório.")).toBeInTheDocument();
      expect(screen.getByText("Código é obrigatório.")).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it("descrição maior que 500 caracteres mostra erro inline", async () => {
      const client = createRolesClientStub();
      await openEditRoleModal(client);

      // `fireEvent.change` ignora `maxLength` do input — a validação
      // client-side roda no submit, então o erro aparece mesmo se o
      // usuário colar texto bypassing o `maxLength`.
      const longDesc = "x".repeat(501);
      fillEditRoleForm({ description: longDesc });
      fireEvent.submit(screen.getByTestId("edit-role-form"));

      expect(
        screen.getByText("Descrição deve ter no máximo 500 caracteres."),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe("submissão bem-sucedida", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
    });

    it("envia PUT /roles/{id} com body trimado (incluindo systemId), fecha modal, exibe toast e refaz listRoles", async () => {
      const original = makeRole({
        id: ID_ROLE_ROOT,
        name: "Root",
        code: "root",
        description: null,
      });
      const updated = makeRole({
        id: ID_ROLE_ROOT,
        name: "Root v2",
        code: "root_v2",
        description: "Versão atualizada.",
      });
      const client = createRolesClientStub();
      // Fila: GET inicial → GET refetch → PUT.
      client.get
        .mockResolvedValueOnce(makePagedRolesResponse([original]))
        .mockResolvedValueOnce(makePagedRolesResponse([updated]));
      client.put.mockResolvedValueOnce(updated);

      await openEditRoleModal(client, { role: original });

      fillEditRoleForm({
        name: "  Root v2  ",
        code: "  root_v2  ",
        description: "  Versão atualizada.  ",
      });
      await submitEditRoleForm(client);

      expect(client.put).toHaveBeenCalledWith(
        `/roles/${ID_ROLE_ROOT}`,
        {
          systemId: ID_SYS_AUTH,
          name: "Root v2",
          code: "root_v2",
          description: "Versão atualizada.",
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Toast verde "Role atualizada.".
      expect(await screen.findByText("Role atualizada.")).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez (inicial
      // + refetch).
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it("envia body sem description quando o usuário apaga o conteúdo", async () => {
      const original = makeRole({
        id: ID_ROLE_ROOT,
        description: "algo",
      });
      const updated = makeRole({ id: ID_ROLE_ROOT, description: null });
      const client = createRolesClientStub();
      client.put.mockResolvedValueOnce(updated);

      await openEditRoleModal(client, { role: original });

      fillEditRoleForm({ description: "" });
      await submitEditRoleForm(client);

      const [, body] = client.put.mock.calls[0];
      expect(body).toEqual({
        systemId: ID_SYS_AUTH,
        name: "Root",
        code: "root",
      });
      expect(body).not.toHaveProperty("description");
    });
  });

  describe("tratamento de erros do backend", () => {
    beforeEach(() => {
      permissionsMock = [ROLES_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127) — testes
     * com a mesma estrutura mudando 1-2 mocks viram tabela. Caso
     * específico do edit: 409 com mensagem citando "outra role neste
     * sistema" + 404 (role removida concorrentemente). Os 5 cenários
     * comuns (400 com/sem errors, 401, 403, network) vêm de
     * `buildSharedRoleSubmitErrorCases('atualizar')`, pré-fabricado
     * desde o PR #143.
     */
    const ERROR_CASES: ReadonlyArray<RolesErrorCase> = [
      {
        name: "409 (code duplicado no sistema) exibe mensagem inline no campo code",
        error: {
          kind: "http",
          status: 409,
          message: "Já existe outro role com este Code neste sistema.",
        },
        expectedText: "Já existe outra role com este código neste sistema.",
      },
      ...buildSharedRoleSubmitErrorCases("atualizar"),
      {
        name: "404 (role removida) fecha modal, exibe toast e dispara refetch",
        error: {
          kind: "http",
          status: 404,
          message: "Role não encontrado.",
        },
        expectedText: "Role não encontrada ou foi removida. Atualize a lista.",
        modalStaysOpen: false,
      },
    ];

    it.each(ERROR_CASES)(
      "mapeia $name",
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createRolesClientStub();
        client.put.mockRejectedValueOnce(error);

        await openEditRoleModal(client);
        await submitEditRoleForm(client);

        expect(
          await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
        ).toBeInTheDocument();

        if (modalStaysOpen) {
          expect(screen.getByRole("dialog")).toBeInTheDocument();
        } else {
          await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
          });
        }
      },
    );

    it("404 dispara refetch (onUpdated chamado mesmo em erro)", async () => {
      const client = createRolesClientStub();
      // Fila: GET inicial → PUT (404) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedRolesResponse([makeRole()]))
        .mockResolvedValueOnce(makePagedRolesResponse([]));
      client.put.mockRejectedValueOnce({
        kind: "http",
        status: 404,
        message: "Role não encontrado.",
      } satisfies ApiError);

      await openEditRoleModal(client);
      await submitEditRoleForm(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});
