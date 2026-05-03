import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  countRoutesListCalls,
  createRoutesGlobalClientStub,
  fillNewRouteForm,
  ID_ROUTE_LIST,
  ID_ROUTE_CREATE,
  ID_SYS_AUTH,
  ID_SYS_KURTTO,
  ID_TOKEN_TYPE_DEFAULT,
  lastRoutesListPath,
  makePagedRoutes,
  makePagedSystems,
  makeRoute,
  makeSystem,
  makeTokenType,
  mockGlobalRoutesInitialResponses,
  mockGlobalRoutesWithCreateModalResponses,
  openCreateRouteModalFromGlobalShell,
  renderRoutesGlobalListPage,
  submitNewRouteForm,
  waitForInitialGlobalList,
} from '../__helpers__/routesTestHelpers';
/* eslint-enable import/order */

import type { RouteDto } from '@/shared/api';

/**
 * Suíte da `RoutesGlobalListShellPage` (Issue #172 — listagem global
 * cross-system de rotas; Issue #187 — botão "Nova rota" cross-system).
 *
 * Estratégia espelha `ClientsListShellPage.test.tsx`/`SystemsPage.test.tsx`:
 * stub de `ApiClient` injetado, asserts sobre estados visuais, busca
 * debounced, paginação, filtro por sistema (dropdown), toggle "Mostrar
 * inativas", coluna Sistema com `<Link>` clicável e cards mobile.
 *
 * A partir da Issue #187, `permissionsMock` é mutável (em vez do
 * static array original) para que o gating do botão "Nova rota" possa
 * ser exercido sem mexer no `vi.mock`. Mesmo padrão usado pelas
 * suítes de mutação per-system (ex.: `RoutesPage.create.test.tsx`).
 */

const ROUTES_LIST_PERMISSION = 'AUTH_V1_SYSTEMS_ROUTES_LIST';
const ROUTES_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_ROUTES_CREATE';

let permissionsMock: ReadonlyArray<string> = [ROUTES_LIST_PERMISSION];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROUTE_AUTH: RouteDto = makeRoute({
  id: ID_ROUTE_LIST,
  systemId: ID_SYS_AUTH,
  name: 'Listar sistemas',
  code: 'AUTH_V1_SYSTEMS_LIST',
  description: 'GET /api/v1/systems',
});

const SAMPLE_ROUTE_KURTTO: RouteDto = makeRoute({
  id: ID_ROUTE_CREATE,
  systemId: ID_SYS_KURTTO,
  name: 'Criar pedido',
  code: 'KURTTO_V1_ORDERS_CREATE',
  description: null,
  systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
  systemTokenTypeCode: 'default',
  systemTokenTypeName: 'Acesso padrão',
});

const SAMPLE_ROUTES: ReadonlyArray<RouteDto> = [
  SAMPLE_ROUTE_AUTH,
  SAMPLE_ROUTE_KURTTO,
];

const SAMPLE_SYSTEMS = [
  makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator', code: 'AUTH' }),
  makeSystem({ id: ID_SYS_KURTTO, name: 'lfc-kurtto', code: 'KURTTO' }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  permissionsMock = [ROUTES_LIST_PERMISSION];
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RoutesGlobalListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e popula a tabela após resposta', async () => {
    const client = createRoutesGlobalClientStub();
    let resolveRoutes: (value: unknown) => void = () => undefined;
    const pendingRoutes = new Promise<unknown>((resolve) => {
      resolveRoutes = resolve;
    });
    // Sistemas resolve imediatamente; rotas ficam pendentes para
    // exercitar o estado de loading.
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems/routes')) {
        return pendingRoutes;
      }
      return Promise.resolve(makePagedSystems(SAMPLE_SYSTEMS));
    });

    renderRoutesGlobalListPage(client);

    expect(screen.getByTestId('routes-global-loading')).toBeInTheDocument();

    await act(async () => {
      resolveRoutes(makePagedRoutes(SAMPLE_ROUTES));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('routes-global-loading'),
      ).not.toBeInTheDocument();
    });

    // `getAllByText` porque a página renderiza tabela desktop + cards
    // mobile (paridade com `UsersListShellPage`/`ClientsListShellPage`).
    expect(screen.getAllByText('Listar sistemas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Criar pedido').length).toBeGreaterThan(0);
  });

  it('renderiza header da página com título "Rotas registradas"', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(
      screen.getByRole('heading', { name: /Rotas registradas/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /systems/routes sem querystring quando defaults estão ativos', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(lastRoutesListPath(client)).toBe('/systems/routes');
  });

  it('coluna Sistema renderiza nome do sistema vindo do lookup', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: [SAMPLE_ROUTE_AUTH],
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    // Aparece em desktop + mobile.
    expect(screen.getAllByText('lfc-authenticator').length).toBeGreaterThan(0);
  });

  it('renderiza badge "Inativo" para rotas soft-deletadas quando includeDeleted=true', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: [
        makeRoute({
          id: ID_ROUTE_LIST,
          systemId: ID_SYS_AUTH,
          name: 'Listar sistemas',
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ],
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    fireEvent.click(screen.getByTestId('routes-global-include-deleted'));

    await waitFor(() => {
      expect(screen.getAllByText(/Inativ/).length).toBeGreaterThan(0);
    });
  });
});

describe('RoutesGlobalListShellPage — coluna Sistema linka para drill-down', () => {
  it('renderiza <a href="/systems/:systemId/routes"> na coluna Sistema', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: [SAMPLE_ROUTE_AUTH],
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    const link = screen.getByTestId(
      `routes-global-system-link-${SAMPLE_ROUTE_AUTH.id}`,
    );
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute(
      'href',
      `/systems/${SAMPLE_ROUTE_AUTH.systemId}/routes`,
    );
  });

  it('cards mobile também exibem link para drill-down', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: [SAMPLE_ROUTE_KURTTO],
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    const cardLink = screen.getByTestId(
      `routes-global-card-system-link-${SAMPLE_ROUTE_KURTTO.id}`,
    );
    expect(cardLink).toBeInTheDocument();
    expect(cardLink).toHaveAttribute(
      'href',
      `/systems/${SAMPLE_ROUTE_KURTTO.systemId}/routes`,
    );
  });

  it('quando o lookup ainda não respondeu, exibe systemId como fallback (sem quebrar o link)', async () => {
    const client = createRoutesGlobalClientStub();
    // Sistemas demoram a responder; rotas chegam primeiro.
    let resolveSystems: (value: unknown) => void = () => undefined;
    const pendingSystems = new Promise<unknown>((resolve) => {
      resolveSystems = resolve;
    });
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems/routes')) {
        return Promise.resolve(makePagedRoutes([SAMPLE_ROUTE_AUTH]));
      }
      return pendingSystems;
    });

    renderRoutesGlobalListPage(client);

    await waitFor(() => {
      expect(
        screen.queryByTestId('routes-global-loading'),
      ).not.toBeInTheDocument();
    });

    // Antes do catálogo de sistemas chegar, exibe o systemId.
    expect(screen.getAllByText(SAMPLE_ROUTE_AUTH.systemId).length).toBeGreaterThan(0);

    // Resolve catálogo de sistemas — a coluna passa a exibir o nome.
    await act(async () => {
      resolveSystems(makePagedSystems(SAMPLE_SYSTEMS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText('lfc-authenticator').length).toBeGreaterThan(0);
    });
  });
});

describe('RoutesGlobalListShellPage — busca debounced', () => {
  it('digitar não dispara request imediato; após 300ms refaz GET com q na querystring', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    const callsBefore = countRoutesListCalls(client);

    fireEvent.change(screen.getByTestId('routes-global-search'), {
      target: { value: 'auth' },
    });

    expect(countRoutesListCalls(client)).toBe(callsBefore);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );
    expect(lastRoutesListPath(client)).toBe('/systems/routes?q=auth');
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);
    const callsBefore = countRoutesListCalls(client);

    const input = screen.getByTestId(
      'routes-global-search',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'au' } });
    fireEvent.change(input, { target: { value: 'auth' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );
  });
});

describe('RoutesGlobalListShellPage — filtro por sistema', () => {
  it('selecionar sistema envia systemId na querystring', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);
    const callsBefore = countRoutesListCalls(client);

    fireEvent.change(screen.getByTestId('routes-global-system-filter'), {
      target: { value: ID_SYS_AUTH },
    });

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );
    expect(lastRoutesListPath(client)).toBe(
      `/systems/routes?systemId=${ID_SYS_AUTH}`,
    );
  });

  it('voltar para "Todos os sistemas" remove o param systemId da querystring', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);
    const callsBefore = countRoutesListCalls(client);

    fireEvent.change(screen.getByTestId('routes-global-system-filter'), {
      target: { value: ID_SYS_AUTH },
    });
    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );

    fireEvent.change(screen.getByTestId('routes-global-system-filter'), {
      target: { value: 'ALL' },
    });
    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 2),
    );
    expect(lastRoutesListPath(client)).toBe('/systems/routes');
  });

  it('dropdown popula opções a partir do catálogo de sistemas (ordem alfabética)', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      // Inversão de ordem para validar o sort por nome.
      systems: [
        makeSystem({ id: ID_SYS_KURTTO, name: 'lfc-kurtto', code: 'KURTTO' }),
        makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator', code: 'AUTH' }),
      ],
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    const select = screen.getByTestId(
      'routes-global-system-filter',
    ) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map(
      (opt) => opt.textContent,
    );
    expect(optionTexts[0]).toBe('Todos os sistemas');
    expect(optionTexts[1]).toBe('lfc-authenticator');
    expect(optionTexts[2]).toBe('lfc-kurtto');
  });
});

describe('RoutesGlobalListShellPage — paginação server-side', () => {
  it('clicar "próxima" envia page=2 na querystring; "anterior" volta para page omitido (default)', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
      routesPagedOverrides: { total: 25, page: 1 },
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(screen.getByTestId('routes-global-page-info')).toHaveTextContent(
      /Página 1 de 2/i,
    );

    const callsBefore = countRoutesListCalls(client);
    fireEvent.click(screen.getByTestId('routes-global-next'));

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );
    expect(lastRoutesListPath(client)).toBe('/systems/routes?page=2');

    fireEvent.click(screen.getByTestId('routes-global-prev'));

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 2),
    );
    expect(lastRoutesListPath(client)).toBe('/systems/routes');
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
      routesPagedOverrides: { total: 25 },
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(screen.getByTestId('routes-global-prev')).toBeDisabled();
    expect(screen.getByTestId('routes-global-next')).toBeEnabled();
  });

  it('botão "próxima" desabilita quando totalPages é 1', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(screen.getByTestId('routes-global-prev')).toBeDisabled();
    expect(screen.getByTestId('routes-global-next')).toBeDisabled();
  });
});

describe('RoutesGlobalListShellPage — filtro de inativos', () => {
  it('liga toggle dispara request com includeDeleted=true', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: SAMPLE_ROUTES,
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);
    const callsBefore = countRoutesListCalls(client);

    fireEvent.click(screen.getByTestId('routes-global-include-deleted'));

    await waitFor(() =>
      expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
    );
    expect(lastRoutesListPath(client)).toBe(
      '/systems/routes?includeDeleted=true',
    );
  });
});

describe('RoutesGlobalListShellPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createRoutesGlobalClientStub();
    // Primeira chamada retorna lista cheia; segunda (após busca) vazia.
    let firstRoutesCallSeen = false;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems/routes')) {
        if (!firstRoutesCallSeen) {
          firstRoutesCallSeen = true;
          return Promise.resolve(makePagedRoutes(SAMPLE_ROUTES));
        }
        return Promise.resolve(makePagedRoutes([]));
      }
      return Promise.resolve(makePagedSystems(SAMPLE_SYSTEMS));
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    fireEvent.change(screen.getByTestId('routes-global-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhuma rota encontrada para/i).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByTestId('routes-global-empty-clear').length,
    ).toBeGreaterThan(0);
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createRoutesGlobalClientStub();
    mockGlobalRoutesInitialResponses(client, {
      routes: [],
      systems: SAMPLE_SYSTEMS,
    });

    renderRoutesGlobalListPage(client);
    await waitForInitialGlobalList(client);

    expect(
      screen.getAllByText(/Nenhuma rota cadastrada\./i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Rotas removidas podem ser visualizadas/i).length,
    ).toBeGreaterThan(0);
  });
});

describe('RoutesGlobalListShellPage — erro de listagem', () => {
  it('exibe Alert + botão "Tentar novamente" quando o GET de rotas falha', async () => {
    const client = createRoutesGlobalClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems/routes')) {
        return Promise.reject({
          kind: 'http',
          status: 500,
          message: 'Erro interno ao listar rotas.',
        });
      }
      return Promise.resolve(makePagedSystems(SAMPLE_SYSTEMS));
    });

    renderRoutesGlobalListPage(client);

    await waitFor(() => {
      expect(
        screen.queryByTestId('routes-global-loading'),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByText('Erro interno ao listar rotas.')).toBeInTheDocument();
    expect(screen.getByTestId('routes-global-retry')).toBeInTheDocument();
  });
});

/**
 * Issue #187 — botão "Nova rota" cross-system na listagem global.
 *
 * Diferenças vs. fluxo per-system (`RoutesPage.create.test.tsx`):
 *
 * - Botão vive no toolbar da `RoutesGlobalListShellPage` (testid
 *   `routes-global-create-open` em vez de `routes-create-open`).
 * - O modal é aberto **sem** prop `systemId` — renderiza um
 *   `<Select>` adicional no topo do form (`new-route-system-id`)
 *   que o operador precisa preencher antes de submeter.
 * - Após sucesso, a listagem global recarrega via `handleRefetch`.
 */
describe('RoutesGlobalListShellPage — botão "Nova rota" (Issue #187)', () => {
  describe('gating do botão', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_SYSTEMS_ROUTES_CREATE', async () => {
      // Apenas LIST: o botão de criação fica oculto.
      permissionsMock = [ROUTES_LIST_PERMISSION];
      const client = createRoutesGlobalClientStub();
      mockGlobalRoutesInitialResponses(client, {
        routes: SAMPLE_ROUTES,
        systems: SAMPLE_SYSTEMS,
      });

      renderRoutesGlobalListPage(client);
      await waitForInitialGlobalList(client);

      expect(
        screen.queryByTestId('routes-global-create-open'),
      ).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_SYSTEMS_ROUTES_CREATE', async () => {
      permissionsMock = [ROUTES_LIST_PERMISSION, ROUTES_CREATE_PERMISSION];
      const client = createRoutesGlobalClientStub();
      mockGlobalRoutesInitialResponses(client, {
        routes: SAMPLE_ROUTES,
        systems: SAMPLE_SYSTEMS,
      });

      renderRoutesGlobalListPage(client);
      await waitForInitialGlobalList(client);

      const openBtn = screen.getByTestId('routes-global-create-open');
      expect(openBtn).toBeInTheDocument();
      expect(openBtn).toHaveTextContent(/Nova rota/i);
    });
  });

  describe('abertura do modal e dropdown de sistema', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_LIST_PERMISSION, ROUTES_CREATE_PERMISSION];
    });

    it('clicar em "Nova rota" abre o diálogo com dropdown de sistema visível', async () => {
      const client = createRoutesGlobalClientStub();
      await openCreateRouteModalFromGlobalShell(client, {
        systems: SAMPLE_SYSTEMS,
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // O `<Select>` extra do modo global aparece (test id dedicado).
      expect(screen.getByTestId('new-route-system-id')).toBeInTheDocument();
      // Os campos padrão também estão presentes.
      expect(screen.getByTestId('new-route-name')).toBeInTheDocument();
      expect(screen.getByTestId('new-route-code')).toBeInTheDocument();
      expect(
        screen.getByTestId('new-route-system-token-type-id'),
      ).toBeInTheDocument();
    });

    it('dropdown de sistema lista os sistemas em ordem alfabética', async () => {
      const client = createRoutesGlobalClientStub();
      await openCreateRouteModalFromGlobalShell(client, {
        // Inversão proposital — o `<Select>` deve ordenar.
        systems: [
          makeSystem({ id: ID_SYS_KURTTO, name: 'lfc-kurtto', code: 'KURTTO' }),
          makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator', code: 'AUTH' }),
        ],
      });

      const select = screen.getByTestId('new-route-system-id') as HTMLSelectElement;
      const optionTexts = Array.from(select.options).map((opt) => opt.textContent);
      // Placeholder + 2 sistemas em ordem alfabética.
      expect(optionTexts[0]).toBe('Selecione um sistema');
      expect(optionTexts[1]).toBe('lfc-authenticator');
      expect(optionTexts[2]).toBe('lfc-kurtto');
    });
  });

  describe('validação e submissão do modal global', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_LIST_PERMISSION, ROUTES_CREATE_PERMISSION];
    });

    it('submeter sem escolher sistema mostra erro inline e não chama POST', async () => {
      const client = createRoutesGlobalClientStub();
      await openCreateRouteModalFromGlobalShell(client, {
        systems: SAMPLE_SYSTEMS,
      });

      // Preenche os outros campos para isolar o erro do `<Select>`
      // de sistema. O usuário tenta submeter sem escolher sistema.
      fillNewRouteForm({
        name: 'Listar X',
        code: 'X_LIST',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      fireEvent.submit(screen.getByTestId('new-route-form'));

      expect(screen.getByText('Selecione um sistema.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('escolher sistema, preencher campos e submeter envia POST com systemId selecionado', async () => {
      const created = makeRoute({
        id: ID_ROUTE_CREATE,
        systemId: ID_SYS_KURTTO,
        name: 'Criar pedido',
        code: 'KURTTO_V1_ORDERS_CREATE',
        description: null,
      });
      const client = createRoutesGlobalClientStub();
      mockGlobalRoutesWithCreateModalResponses(client, {
        routes: SAMPLE_ROUTES,
        systems: SAMPLE_SYSTEMS,
        tokenTypes: [makeTokenType()],
      });
      client.post.mockResolvedValueOnce(created);

      await openCreateRouteModalFromGlobalShell(client);

      // Escolhe o segundo sistema do dropdown (KURTTO) — deliberado
      // para validar que o systemId enviado vem do dropdown e não de
      // um valor hardcoded.
      fireEvent.change(screen.getByTestId('new-route-system-id'), {
        target: { value: ID_SYS_KURTTO },
      });
      fillNewRouteForm({
        name: 'Criar pedido',
        code: 'KURTTO_V1_ORDERS_CREATE',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/systems/routes',
        {
          systemId: ID_SYS_KURTTO,
          name: 'Criar pedido',
          code: 'KURTTO_V1_ORDERS_CREATE',
          systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Rota criada.".
      expect(await screen.findByText('Rota criada.')).toBeInTheDocument();
    });

    it('após sucesso, a listagem global é refetch (chamada extra a /systems/routes)', async () => {
      const created = makeRoute({
        id: ID_ROUTE_CREATE,
        systemId: ID_SYS_AUTH,
        name: 'Nova',
        code: 'NEW_ROUTE',
      });
      const client = createRoutesGlobalClientStub();
      mockGlobalRoutesWithCreateModalResponses(client, {
        routes: SAMPLE_ROUTES,
        systems: SAMPLE_SYSTEMS,
      });
      client.post.mockResolvedValueOnce(created);

      await openCreateRouteModalFromGlobalShell(client);
      const callsBefore = countRoutesListCalls(client);

      fireEvent.change(screen.getByTestId('new-route-system-id'), {
        target: { value: ID_SYS_AUTH },
      });
      fillNewRouteForm({
        name: 'Nova',
        code: 'NEW_ROUTE',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      // O refetch da listagem global após sucesso aumenta o contador
      // de chamadas a `/systems/routes`.
      await waitFor(() =>
        expect(countRoutesListCalls(client)).toBe(callsBefore + 1),
      );
    });

    it('409 (code duplicado) exibe mensagem inline no campo code', async () => {
      const client = createRoutesGlobalClientStub();
      mockGlobalRoutesWithCreateModalResponses(client, {
        routes: SAMPLE_ROUTES,
        systems: SAMPLE_SYSTEMS,
      });
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 409,
        message: 'Já existe uma route com este Code.',
      });

      await openCreateRouteModalFromGlobalShell(client);

      fireEvent.change(screen.getByTestId('new-route-system-id'), {
        target: { value: ID_SYS_AUTH },
      });
      fillNewRouteForm({
        name: 'Conflito',
        code: 'CONFLICT_CODE',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      // Mensagem inline custom citando "neste sistema" (NewRouteModal
      // sobrescreve a copy do backend).
      expect(
        await screen.findByText(
          /Já existe uma rota com este código neste sistema/i,
        ),
      ).toBeInTheDocument();

      // Modal continua aberto.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
