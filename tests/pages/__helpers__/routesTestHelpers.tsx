import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, vi } from "vitest";

import type {
  ApiClient,
  ApiError,
  PagedResponse,
  RouteDto,
  SystemDto,
  TokenTypeDto,
} from "@/shared/api";

import { ToastProvider } from "@/components/ui";
import { RoutesGlobalListShellPage } from "@/pages/routes";
import { RoutesPage } from "@/pages/RoutesPage";

/**
 * Helpers de teste compartilhados pela suíte da `RoutesPage` (Issue
 * #62) e pelas próximas (#63 criar, #64 editar, #65 excluir).
 *
 * Extraídos para evitar duplicação de blocos de fixtures (lição PR
 * #123/#127/#128 — Sonar conta blocos de 10+ linhas como duplicação
 * independente da intenção). Mantemos apenas o que é genuinamente
 * compartilhado:
 *
 * - `ApiClientStub` + `createRoutesClientStub` para isolar a página da
 *   camada de transporte;
 * - `makeRoute` + `makePagedRoutes` para construir payloads do contrato
 *   `RouteDto`/`PagedResponse<RouteDto>` sem repetir todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderRoutesPage` envolvendo a página no `MemoryRouter` apontando
 *   para `/systems/:systemId/routes` (a página lê `useParams`);
 * - `waitForInitialList` colapsando o "esperar listagem" repetido em
 *   praticamente todos os testes.
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYS_AUTH = "11111111-1111-1111-1111-111111111111";
export const ID_ROUTE_LIST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const ID_ROUTE_CREATE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const ID_ROUTE_LEGACY = "cccccccc-cccc-cccc-cccc-cccccccccccc";
export const ID_TOKEN_TYPE_DEFAULT = "99999999-9999-9999-9999-999999999999";

/**
 * Stub de `ApiClient` injetado em `<RoutesPage client={stub} />` —
 * mesmo padrão de injeção usado nos testes da `SystemsPage`. Reusa o
 * shape de `ApiClientStub` em `systemsTestHelpers.tsx`, mas declarado
 * localmente para que cada suíte mantenha seu próprio módulo de
 * fixtures (acoplar os dois levaria à inversão "tests dependem de
 * tests" que dificulta reorganizar).
 */
export type ApiClientStub = ApiClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
};

export function createRoutesClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => "system-test-uuid"),
  } as unknown as ApiClientStub;
}

/**
 * Constrói um `RouteDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos do contrato.
 */
export function makeRoute(overrides: Partial<RouteDto> = {}): RouteDto {
  return {
    id: ID_ROUTE_LIST,
    systemId: ID_SYS_AUTH,
    name: "Listar sistemas",
    code: "AUTH_V1_SYSTEMS_LIST",
    description: "GET /api/v1/systems",
    systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
    systemTokenTypeCode: "default",
    systemTokenTypeName: "Acesso padrão",
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend — `total` reflete o
 * `data.length` por default; testes que cobrem paginação sobrescrevem.
 */
export function makePagedRoutes(
  data: ReadonlyArray<RouteDto>,
  overrides: Partial<PagedResponse<RouteDto>> = {},
): PagedResponse<RouteDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `RoutesPage` envolvendo no `MemoryRouter` apontando para
 * `/systems/:systemId/routes`. A página consome `useParams<{ systemId }>`
 * — sem o roteador, `systemId` ficaria `undefined` e a página entraria
 * no estado `InvalidIdNotice` em vez de carregar a listagem.
 *
 * `systemId` é parametrizável para que o teste de `:systemId` inválido
 * possa simular a URL `/systems/ /routes` (whitespace) e cair no
 * `InvalidIdNotice` — espelhando o comportamento real do componente.
 *
 * A partir da Issue #63, envolvemos em `ToastProvider` para que os
 * modals (`NewRouteModal`) consigam disparar `useToast()` sem quebrar
 * — espelha a estratégia do `renderSystemsPage` em
 * `systemsTestHelpers.tsx` (PR #127). Suítes de listagem que não
 * abrem modal não pagam custo perceptível por ter o provider ativo.
 */
export function renderRoutesPage(
  client: ApiClientStub,
  systemId: string = ID_SYS_AUTH,
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/systems/${systemId}/routes`]}>
        <Routes>
          <Route
            path="/systems/:systemId/routes"
            element={<RoutesPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `RoutesPage` faz
 * `listRoutes` no mount). Centraliza o "esperar listagem" para que cada
 * teste comece em estado estável sem precisar replicar `waitFor` para
 * `client.get`. Espelha `waitForInitialList` em `systemsTestHelpers.tsx`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId("routes-loading")).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `query` do path passado a `client.get`. Usado em
 * asserts que verificam a serialização da querystring. Espelha o
 * helper em `SystemsPage.test.tsx` (não centralizado lá porque era
 * privado da suíte; à medida que mais suítes precisam, faz sentido
 * compartilhar).
 */
export function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return "";
  const path = calls[calls.length - 1][0];
  return typeof path === "string" ? path : "";
}

/* ─── Helpers para suítes de mutação (Issue #63 — criar) ───── */

/**
 * Constrói um `TokenTypeDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos.
 *
 * Centralizado aqui (em vez de em `tokenTypes.test.ts`) porque a
 * suíte da `RoutesPage.create.test.tsx` precisa fabricar tokens para
 * popular o `<Select>`, e a suíte de wrapper (`tokenTypes.test.ts`)
 * também precisa fabricar dummies — Sonar marca a duplicação dessa
 * factory de ~10 linhas se aparecer nos dois lugares (lição PR #128).
 */
export function makeTokenType(
  overrides: Partial<TokenTypeDto> = {},
): TokenTypeDto {
  return {
    id: ID_TOKEN_TYPE_DEFAULT,
    name: "Acesso padrão",
    code: "default",
    description: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

/** UUID adicional usado nos testes da suíte de criação para um token type alternativo. */
export const ID_TOKEN_TYPE_ADMIN = "88888888-8888-8888-8888-888888888888";

/**
 * Empilha respostas no stub do cliente para simular a sequência típica
 * da `RoutesPage` ao abrir o modal de criação:
 *
 *  1. `GET /systems/routes?systemId=...` (listagem inicial da página).
 *  2. `GET /tokens/types` (carregamento da lista do `<Select>` ao
 *     abrir o modal).
 *  3. (opcional) `GET /systems/routes?...` (refetch após criação).
 *
 * Centralizar evita repetir o mesmo `client.get.mockResolvedValueOnce`
 * em 3 níveis em quase todos os testes da suíte (lição PR #127 —
 * trechos de 5+ linhas em 2+ testes são `New Code Duplication`).
 */
export function mockOpenCreateModalResponses(
  client: ApiClientStub,
  options: {
    /** Linhas devolvidas pelo GET inicial. Default: 1 rota fake. */
    initialRows?: ReadonlyArray<RouteDto>;
    /** Token types devolvidos pelo `GET /tokens/types`. Default: `[default]`. */
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
  } = {},
): void {
  const initialRows = options.initialRows ?? [makeRoute()];
  const tokenTypes = options.tokenTypes ?? [makeTokenType()];
  client.get
    .mockResolvedValueOnce(makePagedRoutes(initialRows))
    .mockResolvedValueOnce(tokenTypes);
}

/**
 * Mocka as respostas iniciais (listagem + token types), renderiza a
 * `RoutesPage`, espera a lista carregar e clica no botão "Nova rota"
 * para abrir o modal de criação. Aguarda também o `<Select>` da
 * política JWT sair do estado disabled (request de token types
 * resolvida).
 *
 * Helper extraído porque o BLOCKER do PR #127 apontou que esse trecho
 * estava se repetindo em ~8 testes da suíte de criação de sistemas —
 * Sonar marca como duplicação. Aplicamos a mesma estratégia para
 * rotas desde o **primeiro PR do recurso** (lição PR #128).
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * antes para sobrescrever a fila — a detecção de mocks pré-existentes
 * preserva o caso "fila customizada de respostas" (ex.: cenários de
 * erro 5xx no carregamento de token types).
 */
export async function openCreateRouteModal(
  client: ApiClientStub,
  options: {
    initialRows?: ReadonlyArray<RouteDto>;
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
  } = {},
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    mockOpenCreateModalResponses(client, options);
  }
  renderRoutesPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId("routes-create-open"));
  // Aguarda o segundo GET (token types) — sem isso, o `<Select>`
  // continua disabled e os testes de `fillNewRouteForm` não conseguem
  // setar o valor.
  await waitFor(() => {
    expect(client.get).toHaveBeenCalledTimes(2);
  });
  // Garante que o efeito do modal terminou — checamos a presença do
  // form (cuja primeira opção do <Select> sai de "Carregando..." pra
  // "Selecione uma política JWT" quando a lista carregou). Asserir o
  // testid específico do form é suficiente.
  await waitFor(() => {
    expect(screen.getByTestId("new-route-form")).toBeInTheDocument();
  });
}

/**
 * Preenche os campos do form do `NewRouteModal`. Cada chave é
 * opcional — testes que validam só `name` e `code` deixam os demais
 * ausentes. Trim é responsabilidade do componente
 * (`createRoute`/`validateRouteForm`).
 *
 * `systemTokenTypeId` é setado via `fireEvent.change` no `<Select>`,
 * espelhando o que o usuário faria — escolher uma opção dispara o
 * `onChange` do controle.
 */
export function fillNewRouteForm(values: {
  name?: string;
  code?: string;
  description?: string;
  systemTokenTypeId?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId("new-route-name"), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId("new-route-code"), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId("new-route-description"), {
      target: { value: values.description },
    });
  }
  if (values.systemTokenTypeId !== undefined) {
    fireEvent.change(screen.getByTestId("new-route-system-token-type-id"), {
      target: { value: values.systemTokenTypeId },
    });
  }
}

/**
 * Submete o form do `NewRouteModal` e aguarda o `client.post` ser
 * chamado pelo menos `expectedPostCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit antes do
 * `waitFor`, padrão repetido em todos os testes de submissão.
 * Espelha `submitNewSystemForm` em `systemsTestHelpers.tsx`.
 */
export async function submitNewRouteForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId("new-route-form"));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.post).toHaveBeenCalledTimes(expectedPostCalls),
  );
}

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)`
 * da suíte de criação (#63) — e da futura suíte de edição (#64).
 *
 * Espelha o `SystemsErrorCase` em `systemsTestHelpers.tsx`.
 * Centralizar o tipo evita que cada suíte declare a mesma `interface
 * ErrorCase` (~6 linhas) — Sonar marca tipos idênticos em arquivos
 * diferentes como duplicação (lição PR #127).
 */
export interface RoutesErrorCase {
  /** Descrição usada como `it.each($name)`. */
  name: string;
  /** Erro lançado pelo cliente HTTP no submit. */
  error: ApiError;
  /** Texto visível no UI após o submit (string vira regex case-insensitive). */
  expectedText: RegExp | string;
  /** Default `true` — quando `false`, o modal fecha após o erro (ex.: 404 no edit). */
  modalStaysOpen?: boolean;
}

/**
 * Aceita string ou regex e devolve sempre um `RegExp` insensível a
 * caixa, com escape de metacaracteres. Espelha
 * `toCaseInsensitiveMatcher` em `systemsTestHelpers.tsx`.
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== "string") {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), "i");
}

/**
 * Constrói os 5 cenários de erro de submit que diferem **apenas** no
 * verbo (`criar` vs `atualizar`) entre as suítes de criação (#63) e
 * edição (#64).
 *
 * Pré-fabrica o helper já no primeiro PR do recurso para evitar a
 * recorrência de `New Code Duplication` no Sonar quando a #64 chegar
 * (lição PR #128 — projetar shared helpers desde o primeiro PR).
 */
export function buildSharedRouteSubmitErrorCases(
  verb: "criar" | "atualizar",
): ReadonlyArray<RoutesErrorCase> {
  const verbAcao = verb === "criar" ? "criação" : "atualização";
  return [
    {
      name: "400 com errors mapeia mensagens para os campos correspondentes",
      error: {
        kind: "http",
        status: 400,
        message: "Erro de validação.",
        details: {
          errors: {
            Name: ["Name é obrigatório e não pode ser apenas espaços."],
            Code: ["Code deve ter no máximo 50 caracteres."],
          },
        },
      },
      expectedText: "Name é obrigatório e não pode ser apenas espaços.",
    },
    {
      name: "400 sem errors mapeáveis exibe Alert no topo do form",
      error: {
        kind: "http",
        status: 400,
        message: `Payload inválido para ${verbAcao} de rota.`,
      },
      expectedText: `Payload inválido para ${verbAcao} de rota.`,
    },
    {
      name: "401 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 401,
        message: "Sessão expirada. Faça login novamente.",
      },
      expectedText: "Sessão expirada. Faça login novamente.",
    },
    {
      name: "403 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 403,
        message: "Você não tem permissão para esta ação.",
      },
      expectedText: "Você não tem permissão para esta ação.",
    },
    {
      name: "erro genérico de rede dispara toast vermelho genérico",
      error: {
        kind: "network",
        message: "Falha de conexão com o servidor.",
      },
      expectedText: `Não foi possível ${verb} a rota. Tente novamente.`,
    },
  ];
}

/* ─── Helpers para suíte de edição (Issue #64) ──────────────── */

/**
 * Empilha respostas no stub do cliente para simular a sequência típica
 * da `RoutesPage` ao abrir o modal de edição:
 *
 *  1. `GET /systems/routes?systemId=...` (listagem inicial da página).
 *  2. `GET /tokens/types` (carregamento da lista do `<Select>` ao
 *     abrir o modal).
 *  3. (opcional) `GET /systems/routes?...` (refetch após atualização).
 *
 * Centraliza para que cada teste da suíte de edição não duplique as 3
 * linhas de `client.get.mockResolvedValueOnce` (lição PR #127 —
 * trechos de 5+ linhas em 2+ testes são `New Code Duplication`).
 */
export function mockOpenEditModalResponses(
  client: ApiClientStub,
  options: {
    /** Linha devolvida pelo GET inicial. Default: 1 rota fake. */
    route?: RouteDto;
    /** Token types devolvidos pelo `GET /tokens/types`. Default: `[default]`. */
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
  } = {},
): void {
  const route = options.route ?? makeRoute();
  const tokenTypes = options.tokenTypes ?? [makeTokenType()];
  client.get
    .mockResolvedValueOnce(makePagedRoutes([route]))
    .mockResolvedValueOnce(tokenTypes);
}

/**
 * Mocka as respostas iniciais (listagem + token types), renderiza a
 * `RoutesPage`, espera a lista carregar e clica no botão "Editar" da
 * linha da rota informada. Aguarda o `<Select>` da política JWT sair
 * do estado disabled (request de token types resolvida).
 *
 * Espelha `openCreateRouteModal` mas com clique em
 * `routes-edit-${id}` e fila de respostas via
 * `mockOpenEditModalResponses` — pré-fabricado para evitar duplicação
 * com `openEditModal` da suíte de sistemas (lição PR #128).
 */
export async function openEditRouteModal(
  client: ApiClientStub,
  options: {
    route?: RouteDto;
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
  } = {},
): Promise<void> {
  const route = options.route ?? makeRoute();
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    mockOpenEditModalResponses(client, {
      route,
      tokenTypes: options.tokenTypes,
    });
  }
  renderRoutesPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`routes-edit-${route.id}`));
  // Aguarda o segundo GET (token types).
  await waitFor(() => {
    expect(client.get).toHaveBeenCalledTimes(2);
  });
  // Garante que o efeito do modal terminou — checamos a presença do
  // form para indicar que o `<Select>` saiu de "Carregando…".
  await waitFor(() => {
    expect(screen.getByTestId("edit-route-form")).toBeInTheDocument();
  });
}

/**
 * Preenche os campos do form do `EditRouteModal`. Cada chave é
 * opcional — testes que validam só `name` e `code` deixam os demais
 * ausentes. Espelha `fillNewRouteForm` mas com testIds
 * `edit-route-*`.
 */
export function fillEditRouteForm(values: {
  name?: string;
  code?: string;
  description?: string;
  systemTokenTypeId?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId("edit-route-name"), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId("edit-route-code"), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId("edit-route-description"), {
      target: { value: values.description },
    });
  }
  if (values.systemTokenTypeId !== undefined) {
    fireEvent.change(screen.getByTestId("edit-route-system-token-type-id"), {
      target: { value: values.systemTokenTypeId },
    });
  }
}

/**
 * Submete o form do `EditRouteModal` e aguarda o `client.put` ser
 * chamado pelo menos `expectedPutCalls` vezes (default `1`). Espelha
 * `submitNewRouteForm` mas com PUT em vez de POST.
 */
export async function submitEditRouteForm(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId("edit-route-form"));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.put).toHaveBeenCalledTimes(expectedPutCalls),
  );
}

/**
 * Constrói os 3 cenários de fechamento sem persistência (Esc,
 * Cancelar, backdrop) usando o `cancelTestId` da suíte chamadora.
 * Espelha `buildCloseCases` em `systemsTestHelpers.tsx` — pré-
 * fabricado já agora para a suíte de criação reusar com a futura
 * suíte de edição.
 */
export interface RoutesModalCloseCase {
  name: string;
  close: () => void;
}

export function buildRoutesCloseCases(
  cancelTestId: string,
): ReadonlyArray<RoutesModalCloseCase> {
  return [
    {
      name: "Esc",
      // eslint-disable-next-line no-restricted-globals
      close: () => fireEvent.keyDown(window, { key: "Escape" }),
    },
    {
      name: "botão Cancelar",
      close: () => fireEvent.click(screen.getByTestId(cancelTestId)),
    },
    {
      name: "clique no backdrop",
      close: () => fireEvent.mouseDown(screen.getByTestId("modal-backdrop")),
    },
  ];
}

/* ─── Helpers para suíte de exclusão (Issue #65) ──────────────── */

/**
 * Mocka o GET inicial com uma página contendo a `route` informada (ou
 * uma rota sintética padrão), renderiza a `RoutesPage`, espera a lista
 * carregar e clica no botão "Desativar" da linha da rota (Issue #65).
 *
 * Helper análogo a `openCreateRouteModal`/`openEditRouteModal`. Sem ele,
 * cada teste da suíte de exclusão duplicaria ~5 linhas de "render +
 * waitFor + click" — Sonar contaria como `New Code Duplication` (lição
 * PR #127). Espelha `openDeleteConfirm` em `systemsTestHelpers.tsx`.
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * antes para sobrescrever a fila — a detecção de mocks pré-existentes
 * preserva o caso "fila customizada de respostas" (ex.: cenários de
 * erro 404/409 com refetch).
 */
export async function openDeleteRouteConfirm(
  client: ApiClientStub,
  route: RouteDto = makeRoute(),
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockResolvedValueOnce(makePagedRoutes([route]));
  }
  renderRoutesPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`routes-delete-${route.id}`));
}

/**
 * Confirma a desativação clicando em "Desativar" no `DeleteRouteConfirm`
 * e aguarda o `client.delete` ser chamado pelo menos `expectedDeleteCalls`
 * vezes (default `1`). Espelha `confirmDelete` em `systemsTestHelpers.tsx`,
 * com `delete-route-*` em vez de `delete-system-*`. Faz `act(async)`
 * para flushar a microtask do click handler antes do `waitFor`.
 */
export async function confirmDeleteRoute(
  client: ApiClientStub,
  expectedDeleteCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId("delete-route-confirm"));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.delete).toHaveBeenCalledTimes(expectedDeleteCalls),
  );
}

/**
 * Constrói os 3 cenários de erro de mutação simples que diferem
 * **apenas** no verbo entre as suítes de exclusão de rota (#65) e
 * eventuais futuras (restore de rota). Cenários comuns (401, 403,
 * network) ficam centralizados para preservar simetria de cobertura —
 * sem o helper, o teste duplicaria literalmente os 3 blocos.
 *
 * Espelha `buildSharedMutationErrorCases` em `systemsTestHelpers.tsx`,
 * mas com o sufixo "a rota" em vez de "o sistema" no toast genérico.
 * Centralizar aqui evita que o `RoutesPage.delete.test.tsx` declare
 * 26 linhas de array literal idênticas às do `SystemsPage.delete.test.tsx`
 * (lição PR #128 — Sonar marca como duplicação).
 */
export function buildSharedRouteMutationErrorCases(
  verb: "desativar",
): ReadonlyArray<RoutesErrorCase> {
  return [
    {
      name: "401 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 401,
        message: "Sessão expirada. Faça login novamente.",
      },
      expectedText: "Sessão expirada. Faça login novamente.",
    },
    {
      name: "403 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 403,
        message: "Você não tem permissão para esta ação.",
      },
      expectedText: "Você não tem permissão para esta ação.",
    },
    {
      name: "erro genérico de rede dispara toast vermelho genérico",
      error: {
        kind: "network",
        message: "Falha de conexão com o servidor.",
      },
      expectedText: `Não foi possível ${verb} a rota. Tente novamente.`,
    },
  ];
}

/* ─── Helpers para a listagem global (Issue #172) ──────────────── */

/** UUID adicional do segundo sistema usado na suíte da listagem global. */
export const ID_SYS_KURTTO = "22222222-2222-2222-2222-222222222222";

/**
 * Constrói um `SystemDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos. Espelha
 * `makeSystem` em `systemsTestHelpers.tsx` mas declarado aqui para
 * preservar a coesão dos helpers de rotas (a suíte da listagem global
 * mocka o catálogo de sistemas e o de rotas no mesmo cliente, e
 * importar `makeSystem` de outro helper acoplaria as duas suítes).
 *
 * Lição PR #128 — projetar shared helpers desde o primeiro PR do
 * recurso, não esperar a duplicação aparecer e refatorar.
 */
export function makeSystem(overrides: Partial<SystemDto> = {}): SystemDto {
  return {
    id: ID_SYS_AUTH,
    name: "lfc-authenticator",
    code: "AUTH",
    description: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend para sistemas.
 * Espelha `makePagedRoutes` mas para o catálogo de sistemas — usado
 * pela suíte da listagem global para popular o `<Select>` de filtro
 * e o lookup de nome do sistema na coluna Sistema.
 */
export function makePagedSystems(
  data: ReadonlyArray<SystemDto>,
  overrides: Partial<PagedResponse<SystemDto>> = {},
): PagedResponse<SystemDto> {
  return {
    data,
    page: 1,
    pageSize: 100,
    total: data.length,
    ...overrides,
  };
}

/**
 * Stub default usado pela suíte da listagem global. Reusa
 * `createRoutesClientStub` para preservar a mesma fábrica entre as
 * duas suítes (drill-down e global) — mantemos um alias dedicado
 * para que os imports da nova suíte fiquem com nome auto-explicativo
 * (lição PR #128 — projetar shared helpers desde o primeiro PR do
 * recurso).
 */
export function createRoutesGlobalClientStub(): ApiClientStub {
  return createRoutesClientStub();
}

/**
 * Mocka as duas requests iniciais da `RoutesGlobalListShellPage`
 * (listagem global de rotas + catálogo de sistemas para filtro/lookup)
 * via `mockImplementation` no `client.get`. Cada chamada é roteada
 * pelo prefixo do path:
 *
 * - `/systems/routes...` → `makePagedRoutes(routes, ...)`
 * - `/systems...` → `makePagedSystems(systems)`
 *
 * Centralizar evita duplicar a fila de mocks em cada teste (lição PR
 * #127 — trechos de 5+ linhas em 2+ testes são `New Code Duplication`).
 *
 * **Por que `mockImplementation` e não `mockResolvedValueOnce` em
 * sequência?** Os dois GETs disparam em paralelo no mount (rotas via
 * `usePaginatedFetch`, sistemas via `useSingleFetchWithAbort`), então
 * a ordem relativa não é determinística. Roteamento por `path`
 * elimina a fragilidade de ordem.
 */
export function mockGlobalRoutesInitialResponses(
  client: ApiClientStub,
  options: {
    /** Linhas devolvidas pelo GET de rotas. Default: 1 rota fake. */
    routes?: ReadonlyArray<RouteDto>;
    /** Sistemas devolvidos pelo GET de sistemas. Default: `[lfc-authenticator]`. */
    systems?: ReadonlyArray<SystemDto>;
    /** Overrides do envelope paginado de rotas. */
    routesPagedOverrides?: Partial<PagedResponse<RouteDto>>;
  } = {},
): void {
  const routes = options.routes ?? [makeRoute()];
  const systems = options.systems ?? [makeSystem()];
  client.get.mockImplementation((path: string) => {
    if (path.startsWith("/systems/routes")) {
      return Promise.resolve(
        makePagedRoutes(routes, options.routesPagedOverrides),
      );
    }
    if (path.startsWith("/systems")) {
      return Promise.resolve(makePagedSystems(systems));
    }
    return Promise.reject(
      new Error(`mockGlobalRoutesInitialResponses: path inesperado ${path}`),
    );
  });
}

/**
 * Renderiza a `RoutesGlobalListShellPage` envolvendo num
 * `MemoryRouter` (a página tem `<Link>`s para `/systems/:id/routes`,
 * que sem o roteador lançariam) + `ToastProvider` (paridade com
 * `renderRoutesPage` para suportar futuras evoluções com `useToast`).
 * Centraliza para que cada teste não repita o boilerplate.
 */
export function renderRoutesGlobalListPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/routes"]}>
        <Routes>
          <Route
            path="/routes"
            element={<RoutesGlobalListShellPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem global. A página dispara
 * 2 GETs em paralelo no mount (`/systems/routes` + `/systems`), então
 * esperamos que ambos tenham sido chamados pelo menos uma vez antes de
 * verificar que o spinner sumiu.
 */
export async function waitForInitialGlobalList(
  client: ApiClientStub,
): Promise<void> {
  await waitFor(() =>
    expect(client.get.mock.calls.length).toBeGreaterThanOrEqual(2),
  );
  await waitFor(() => {
    expect(
      screen.queryByTestId("routes-global-loading"),
    ).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair os paths de `/systems/routes` (apenas as
 * chamadas de listagem de rotas, ignorando o GET do catálogo de
 * sistemas). Usado em asserts da suíte de listagem global para
 * verificar a serialização da querystring sem ruído da lookup.
 */
export function lastRoutesListPath(client: ApiClientStub): string {
  const routesCalls = client.get.mock.calls.filter(
    (call: unknown[]) =>
      typeof call[0] === "string" &&
      (call[0] as string).startsWith("/systems/routes"),
  );
  if (routesCalls.length === 0) return "";
  const path = routesCalls[routesCalls.length - 1][0];
  return typeof path === "string" ? path : "";
}

/** Total de chamadas a `/systems/routes` no stub do cliente. */
export function countRoutesListCalls(client: ApiClientStub): number {
  return client.get.mock.calls.filter(
    (call: unknown[]) =>
      typeof call[0] === "string" &&
      (call[0] as string).startsWith("/systems/routes"),
  ).length;
}

/* ─── Helpers para criação global (Issue #187) ──────────────── */

/**
 * Mocka as respostas do backend para a sequência típica da
 * `RoutesGlobalListShellPage` quando o modal "Nova rota" é aberto:
 *
 * 1. `GET /systems/routes` (listagem global de rotas — disparado no
 *    mount).
 * 2. `GET /systems` (catálogo de sistemas — disparado no mount para
 *    popular o dropdown de filtro **e** novamente quando o modal
 *    abrir, para popular o `<Select>` de sistema dono da nova rota).
 * 3. `GET /tokens/types` (carregamento da lista do `<Select>` de
 *    política JWT ao abrir o modal).
 *
 * Usa `mockImplementation` em vez de `mockResolvedValueOnce` em
 * sequência porque os GETs disparam em paralelo (mount da página +
 * efeitos do modal). Roteamento por `path` elimina a fragilidade de
 * ordem — espelha `mockGlobalRoutesInitialResponses` mas inclui o
 * caminho de `/tokens/types` que vive só no modal.
 *
 * Lição PR #128/#134/#135 — projetar shared helpers desde o primeiro
 * PR do recurso, não esperar a duplicação aparecer e refatorar.
 */
export function mockGlobalRoutesWithCreateModalResponses(
  client: ApiClientStub,
  options: {
    /** Linhas devolvidas pelo GET de rotas. Default: 1 rota fake. */
    routes?: ReadonlyArray<RouteDto>;
    /** Sistemas devolvidos pelo GET de sistemas. Default: `[lfc-authenticator]`. */
    systems?: ReadonlyArray<SystemDto>;
    /** Token types devolvidos pelo GET. Default: `[default]`. */
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
    /** Overrides do envelope paginado de rotas. */
    routesPagedOverrides?: Partial<PagedResponse<RouteDto>>;
  } = {},
): void {
  const routes = options.routes ?? [makeRoute()];
  const systems = options.systems ?? [makeSystem()];
  const tokenTypes = options.tokenTypes ?? [makeTokenType()];
  client.get.mockImplementation((path: string) => {
    if (path.startsWith("/systems/routes")) {
      return Promise.resolve(
        makePagedRoutes(routes, options.routesPagedOverrides),
      );
    }
    if (path.startsWith("/tokens/types")) {
      return Promise.resolve(tokenTypes);
    }
    if (path.startsWith("/systems")) {
      return Promise.resolve(makePagedSystems(systems));
    }
    return Promise.reject(
      new Error(
        `mockGlobalRoutesWithCreateModalResponses: path inesperado ${path}`,
      ),
    );
  });
}

/**
 * Mocka as respostas iniciais (rotas + sistemas + token types),
 * renderiza a `RoutesGlobalListShellPage`, espera a listagem inicial
 * carregar e clica no botão "Nova rota" do toolbar para abrir o
 * modal global. Aguarda o `<Select>` de política JWT sair do estado
 * disabled (request de token types resolvida) — assim os asserts
 * subsequentes podem interagir com o form sem race.
 *
 * Análogo a `openCreateRouteModal` (per-system) mas para o caminho
 * global da Issue #187. Mantém a fila de respostas via
 * `mockGlobalRoutesWithCreateModalResponses` — pré-fabricado para
 * cada teste que precise abrir o modal não duplicar ~10 linhas de
 * "render + waitFor + click + waitFor" (lição PR #127 — Sonar marca
 * trechos de 5+ linhas em 2+ testes como duplicação).
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * antes para sobrescrever — a detecção de mocks pré-existentes
 * preserva o caso "fila customizada" (ex.: cenários de erro 5xx no
 * carregamento de sistemas dentro do modal).
 */
export async function openCreateRouteModalFromGlobalShell(
  client: ApiClientStub,
  options: {
    routes?: ReadonlyArray<RouteDto>;
    systems?: ReadonlyArray<SystemDto>;
    tokenTypes?: ReadonlyArray<TokenTypeDto>;
  } = {},
): Promise<void> {
  // Detecta mocks pré-existentes via `mock.calls`/`results` **e** via
  // `getMockImplementation()` — caller que rodou
  // `mockGlobalRoutesWithCreateModalResponses(...)` antes não tem
  // chamadas registradas ainda, mas tem implementação setada. Sem essa
  // segunda checagem, o helper sobrescreveria o mock pré-existente
  // com defaults vazios.
  const hasPreExistingMocks =
    client.get.mock.calls.length > 0 ||
    client.get.mock.results.length > 0 ||
    client.get.getMockImplementation() !== undefined;
  if (!hasPreExistingMocks) {
    mockGlobalRoutesWithCreateModalResponses(client, options);
  }
  renderRoutesGlobalListPage(client);
  await waitForInitialGlobalList(client);
  fireEvent.click(screen.getByTestId("routes-global-create-open"));
  // Aguarda os GETs do modal (tokenTypes + systems) e que ambos os
  // `<Select>` saiam do estado disabled — assim os asserts
  // subsequentes podem interagir com o form sem race.
  await waitFor(() => {
    expect(screen.getByTestId("new-route-form")).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByTestId("new-route-system-id")).not.toBeDisabled();
  });
  await waitFor(() => {
    expect(
      screen.getByTestId("new-route-system-token-type-id"),
    ).not.toBeDisabled();
  });
}
