import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthMock } from "./__helpers__/mockUseAuth";
import {
  buildRoutesCloseCases,
  buildSharedRouteMutationErrorCases,
  confirmDeleteRoute,
  createRoutesClientStub,
  ID_ROUTE_LEGACY,
  ID_ROUTE_LIST,
  makePagedRoutes,
  makeRoute,
  openDeleteRouteConfirm,
  renderRoutesPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from "./__helpers__/routesTestHelpers";

import type { RoutesErrorCase } from "./__helpers__/routesTestHelpers";
import type { ApiError } from "@/shared/api";

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_ROUTES_DELETE`. Reusa `buildAuthMock` (helper
 * compartilhado com listagem/criação/edição).
 *
 * Issue #65 — soft-delete via `DELETE /systems/routes/{id}` + modal de
 * confirmação (`DeleteRouteConfirm`). Última sub-issue da EPIC #46.
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock("@/shared/auth", () => buildAuthMock(() => permissionsMock));

const ROUTES_DELETE_PERMISSION = "AUTH_V1_SYSTEMS_ROUTES_DELETE";
const ROUTES_UPDATE_PERMISSION = "AUTH_V1_SYSTEMS_ROUTES_UPDATE";

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = "";
});

describe("RoutesPage — desativar (Issue #65)", () => {
  describe('gating do botão "Desativar" por linha', () => {
    it('não exibe botões "Desativar" quando o usuário não possui AUTH_V1_SYSTEMS_ROUTES_DELETE', async () => {
      permissionsMock = [];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([makeRoute({ id: ID_ROUTE_LIST })]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`routes-delete-${ID_ROUTE_LIST}`),
      ).not.toBeInTheDocument();
    });

    it('exibe um botão "Desativar" para cada linha ativa quando o usuário possui AUTH_V1_SYSTEMS_ROUTES_DELETE', async () => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([
          makeRoute({
            id: ID_ROUTE_LIST,
            name: "Listar",
            code: "AUTH_V1_LIST",
          }),
          makeRoute({
            id: ID_ROUTE_LEGACY,
            name: "Legado",
            code: "AUTH_V1_LEGACY",
          }),
        ]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      const listBtn = screen.getByTestId(`routes-delete-${ID_ROUTE_LIST}`);
      const legacyBtn = screen.getByTestId(`routes-delete-${ID_ROUTE_LEGACY}`);
      expect(listBtn).toBeInTheDocument();
      expect(legacyBtn).toBeInTheDocument();
      expect(listBtn).toHaveAttribute("aria-label", "Desativar rota Listar");
      expect(legacyBtn).toHaveAttribute("aria-label", "Desativar rota Legado");
    });

    it('NÃO exibe "Desativar" em linhas já soft-deletadas (deletedAt != null)', async () => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([
          // Ativa — botão deve aparecer.
          makeRoute({ id: ID_ROUTE_LIST }),
          // Soft-deleted — botão NÃO deve aparecer (issue futura cobre
          // restaurar; o gating client-side esconde a ação que o
          // backend rejeita com 404).
          makeRoute({
            id: ID_ROUTE_LEGACY,
            name: "Legado",
            code: "AUTH_V1_LEGACY",
            deletedAt: "2026-02-01T00:00:00Z",
          }),
        ]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(
        screen.getByTestId(`routes-delete-${ID_ROUTE_LIST}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`routes-delete-${ID_ROUTE_LEGACY}`),
      ).not.toBeInTheDocument();
    });

    it('coexiste com o botão "Editar" quando o usuário tem ambas as permissões', async () => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION, ROUTES_DELETE_PERMISSION];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([makeRoute({ id: ID_ROUTE_LIST })]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(
        screen.getByTestId(`routes-edit-${ID_ROUTE_LIST}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`routes-delete-${ID_ROUTE_LIST}`),
      ).toBeInTheDocument();
    });
  });

  describe("abertura do diálogo de confirmação", () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
    });

    it('clicar em "Desativar" abre o diálogo com nome e code da rota', async () => {
      const route = makeRoute({
        id: ID_ROUTE_LIST,
        name: "Listar sistemas",
        code: "AUTH_V1_SYSTEMS_LIST",
      });
      const client = createRoutesClientStub();
      await openDeleteRouteConfirm(client, route);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Desativar rota\?/i)).toBeInTheDocument();
      const description = screen.getByTestId("delete-route-description");
      expect(description).toHaveTextContent("Listar sistemas");
      expect(description).toHaveTextContent("AUTH_V1_SYSTEMS_LIST");
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildRoutesCloseCases`
     * (helper compartilhado) — diferença é só o testId do botão Cancelar
     * (`delete-route-cancel`). Lição PR #127: `it.each` evita BLOCKER de
     * duplicação Sonar para cenários com mesma estrutura mudando 1-2
     * mocks.
     */
    const CLOSE_CASES = buildRoutesCloseCases("delete-route-cancel");

    it.each(CLOSE_CASES)(
      "fechar via $name não dispara DELETE",
      async ({ close }) => {
        const client = createRoutesClientStub();
        await openDeleteRouteConfirm(client);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(client.delete).not.toHaveBeenCalled();
      },
    );
  });

  describe("confirmação bem-sucedida", () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
    });

    it("envia DELETE /systems/routes/{id} com id correto, fecha modal, exibe toast verde e refaz listRoutes", async () => {
      const target = makeRoute({
        id: ID_ROUTE_LIST,
        name: "Listar sistemas",
        code: "AUTH_V1_SYSTEMS_LIST",
      });
      const client = createRoutesClientStub();
      // Fila: GET inicial → DELETE (204 → undefined) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedRoutes([target]))
        .mockResolvedValueOnce(makePagedRoutes([], { total: 0 }));
      client.delete.mockResolvedValueOnce(undefined);

      await openDeleteRouteConfirm(client, target);
      await confirmDeleteRoute(client);

      expect(client.delete).toHaveBeenCalledWith(
        `/systems/routes/${ID_ROUTE_LIST}`,
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Toast verde "Rota desativada." (status do ToastProvider).
      expect(await screen.findByText("Rota desativada.")).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("tratamento de erros do backend", () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Casos
     * comuns (401, 403, network) vêm do helper compartilhado
     * `buildSharedRouteMutationErrorCases('desativar')` para evitar
     * duplicação literal com a futura suíte de "restaurar rota" — pré-
     * projetar o helper desde o primeiro PR do recurso (lição PR #128).
     *
     * Casos específicos ficam inline porque o comportamento difere:
     *
     * - **404** — rota removida entre abertura e confirm. Modal fecha,
     *   toast vermelho informativo e dispara refetch (paridade com
     *   tratamento de 404 no edit/delete de sistema).
     * - **409** — rota tem permissões ativas vinculadas. Modal segue
     *   aberto (usuário precisa entender o bloqueio antes de fechar) e
     *   exibe a mensagem do backend
     *   (`DeleteBlockedByPermissionsMessage`). Critério de aceite #65:
     *   "Tratamento de erro caso a rota tenha vínculos (mensagem clara)".
     */
    const ERROR_CASES: ReadonlyArray<RoutesErrorCase> = [
      {
        name: "404 (rota já removida) fecha modal, exibe toast e dispara refetch",
        error: {
          kind: "http",
          status: 404,
          message: "Route não encontrada.",
        },
        expectedText: "Rota não encontrada ou foi removida. Atualize a lista.",
        modalStaysOpen: false,
      },
      {
        name: "409 (vínculos com permissões) usa a mensagem do backend e mantém o modal aberto",
        error: {
          kind: "http",
          status: 409,
          message:
            "Não é possível excluir a rota: existem permissões ativas vinculadas. Remova as permissões antes.",
        },
        expectedText:
          "Não é possível excluir a rota: existem permissões ativas vinculadas. Remova as permissões antes.",
      },
      ...buildSharedRouteMutationErrorCases("desativar"),
    ];

    it.each(ERROR_CASES)(
      "mapeia $name",
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createRoutesClientStub();
        client.delete.mockRejectedValueOnce(error);

        await openDeleteRouteConfirm(client);
        await confirmDeleteRoute(client);

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

    it("404 dispara refetch (onDeleted chamado mesmo em erro)", async () => {
      const client = createRoutesClientStub();
      // Fila: GET inicial → DELETE (404) → GET refetch após onDeleted.
      client.get
        .mockResolvedValueOnce(makePagedRoutes([makeRoute()]))
        .mockResolvedValueOnce(makePagedRoutes([], { total: 0 }));
      client.delete.mockRejectedValueOnce({
        kind: "http",
        status: 404,
        message: "Route não encontrada.",
      } satisfies ApiError);

      await openDeleteRouteConfirm(client);
      await confirmDeleteRoute(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("mobile cards", () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_DELETE_PERMISSION];
    });

    it('exibe botão "Desativar" no card mobile quando o usuário tem permissão', async () => {
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([makeRoute({ id: ID_ROUTE_LIST, name: "Listar" })]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      const cardBtn = screen.getByTestId(`routes-card-delete-${ID_ROUTE_LIST}`);
      expect(cardBtn).toBeInTheDocument();
      expect(cardBtn).toHaveAttribute("aria-label", "Desativar rota Listar");
    });

    it('clicar no botão "Desativar" do card abre o mesmo diálogo de confirmação', async () => {
      const route = makeRoute({
        id: ID_ROUTE_LIST,
        name: "Listar sistemas",
        code: "AUTH_V1_SYSTEMS_LIST",
      });
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(makePagedRoutes([route]));

      renderRoutesPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId(`routes-card-delete-${route.id}`));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Desativar rota\?/i)).toBeInTheDocument();
      expect(screen.getByTestId("delete-route-description")).toHaveTextContent(
        "Listar sistemas",
      );
    });
  });
});
