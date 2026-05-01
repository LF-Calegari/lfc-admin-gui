import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRoutesClientStub,
  ID_ROUTE_CREATE,
  ID_ROUTE_LEGACY,
  ID_ROUTE_LIST,
  ID_SYS_AUTH,
  lastGetPath,
  makePagedRoutes,
  makeRoute,
  renderRoutesPage,
  waitForInitialList,
} from './__helpers__/routesTestHelpers';

import type { ApiError, PagedResponse, RouteDto } from '@/shared/api';

import { RoutesPage } from '@/pages/RoutesPage';

/**
 * Suíte da `RoutesPage` (Issue #62, EPIC #46 — listagem de rotas por
 * sistema). Estratégia espelha `SystemsPage.test.tsx`: stub de
 * `ApiClient` injetado, asserts sobre querystring/estados visuais,
 * paginação, busca debounced, toggle "incluir inativas", erros e
 * cancelamento de request.
 *
 * Diferenças com `SystemsPage.test.tsx`:
 *
 * - A `RoutesPage` lê `:systemId` de `useParams`, então renderizamos
 *   dentro de `MemoryRouter` (centralizado em `renderRoutesPage`).
 * - O endpoint é `/systems/routes?systemId=...` em vez de `/systems`.
 * - A página exibe cards no mobile (testIDs `routes-card-<id>`) além
 *   da tabela desktop — testes verificam ambos.
 * - Não há gating de criação/edição (sub-issues futuras), portanto
 *   sem `vi.mock('@/shared/auth')` aqui.
 */

/**
 * Atraso de debounce esperado pela página (300 ms). Espelha o valor
 * interno da `RoutesPage` — alterar em ambos os lados quando ajustar a
 * UX.
 */
const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROWS: ReadonlyArray<RouteDto> = [
  makeRoute({
    id: ID_ROUTE_LIST,
    name: 'Listar sistemas',
    code: 'AUTH_V1_SYSTEMS_LIST',
    description: 'GET /api/v1/systems',
    systemTokenTypeName: 'Acesso padrão',
  }),
  makeRoute({
    id: ID_ROUTE_CREATE,
    name: 'Criar sistema',
    code: 'AUTH_V1_SYSTEMS_CREATE',
    description: 'POST /api/v1/systems',
    systemTokenTypeName: 'Acesso padrão',
  }),
  makeRoute({
    id: ID_ROUTE_LEGACY,
    name: 'Legado',
    code: 'AUTH_V1_LEGACY',
    description: null,
    systemTokenTypeCode: '',
    systemTokenTypeName: '',
    deletedAt: '2026-02-01T00:00:00Z',
  }),
];

beforeEach(() => {
  // `shouldAdvanceTime: true` permite que `setTimeout` interno do
  // testing-library (`waitFor`/`findBy*`) avance com o relógio real
  // enquanto `vi.advanceTimersByTime(...)` ainda controla manualmente o
  // debounce da busca. Mesmo padrão do `SystemsPage.test.tsx`.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RoutesPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e depois popula a tabela', async () => {
    const client = createRoutesClientStub();
    let resolveFn: (value: PagedResponse<RouteDto>) => void = () => undefined;
    const pending = new Promise<PagedResponse<RouteDto>>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockReturnValueOnce(pending);

    renderRoutesPage(client);

    expect(screen.getByTestId('routes-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(makePagedRoutes(SAMPLE_ROWS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('routes-loading')).not.toBeInTheDocument();
    });

    // Tabela desktop e cards mobile renderizam o mesmo conteúdo lado a
    // lado (CSS controla qual aparece). Asserir presença sem exigir
    // unicidade — o `getAllByText` cobre os dois.
    expect(screen.getAllByText('AUTH_V1_SYSTEMS_LIST').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AUTH_V1_SYSTEMS_CREATE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AUTH_V1_LEGACY').length).toBeGreaterThan(0);
  });

  it('renderiza header da página com título "Rotas do sistema"', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    await waitForInitialList(client);

    expect(screen.getByRole('heading', { name: /Rotas do sistema/i })).toBeInTheDocument();
  });

  it('chama backend com systemId e omite defaults no primeiro render', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    await waitForInitialList(client);
    expect(lastGetPath(client)).toBe(`/systems/routes?systemId=${ID_SYS_AUTH}`);
  });

  it('renderiza badge "Inativa" para rotas com deletedAt e "Ativa" para as demais', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    await waitForInitialList(client);

    // jsdom aplica `display: none` do `TableForDesktop` (a media query
    // `min-width: 48em` falha em viewport zero), então a tabela desktop
    // fica fora da accessibility tree e `getByRole('row')` ignora as
    // linhas. Asserir nas cards mobile (que são a versão visível em
    // jsdom) cobre o mesmo dado e mantém o teste focado em UI real.
    const listCard = screen.getByTestId(`routes-card-${ID_ROUTE_LIST}`);
    const legacyCard = screen.getByTestId(`routes-card-${ID_ROUTE_LEGACY}`);
    expect(within(listCard).getByText('Ativa')).toBeInTheDocument();
    expect(within(legacyCard).getByText('Inativa')).toBeInTheDocument();
  });

  it('exibe placeholder "—" quando systemTokenTypeCode está vazio (token type órfão)', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(
      makePagedRoutes([
        makeRoute({
          id: ID_ROUTE_LEGACY,
          systemTokenTypeCode: '',
          systemTokenTypeName: '',
        }),
      ]),
    );

    renderRoutesPage(client);

    await waitForInitialList(client);

    // O placeholder "—" aparece tanto na tabela desktop quanto nos
    // cards mobile (mesmo helper `renderTokenPolicy`).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('exibe nome do tokenType quando presente, code como fallback caso name esteja vazio', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(
      makePagedRoutes([
        makeRoute({
          id: ID_ROUTE_LIST,
          systemTokenTypeCode: 'admin',
          systemTokenTypeName: '',
        }),
      ]),
    );

    renderRoutesPage(client);

    await waitForInitialList(client);

    expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
  });

  it('renderiza cards mobile com testId estável por rota', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    await waitForInitialList(client);

    expect(screen.getByTestId(`routes-card-${ID_ROUTE_LIST}`)).toBeInTheDocument();
    expect(screen.getByTestId(`routes-card-${ID_ROUTE_CREATE}`)).toBeInTheDocument();
    expect(screen.getByTestId(`routes-card-${ID_ROUTE_LEGACY}`)).toBeInTheDocument();
  });
});

describe('RoutesPage — busca debounced', () => {
  it('digitar não dispara request imediato; após 300ms dispara com q=systems', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValue(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('routes-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'systems' } });

    expect(client.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    const path = lastGetPath(client);
    expect(path).toContain(`systemId=${ID_SYS_AUTH}`);
    expect(path).toContain('q=systems');
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValue(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('routes-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 's' } });
    fireEvent.change(input, { target: { value: 'sy' } });
    fireEvent.change(input, { target: { value: 'sys' } });
    fireEvent.change(input, { target: { value: 'systems' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toContain('q=systems');
  });

  it('busca limpa volta para o caminho default (apenas systemId)', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValue(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('routes-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'systems' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.change(input, { target: { value: '' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe(`/systems/routes?systemId=${ID_SYS_AUTH}`);
  });
});

describe('RoutesPage — paginação', () => {
  it('clicar "próxima" chama com page=2; "anterior" volta para page default', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValue(makePagedRoutes(SAMPLE_ROWS, { page: 1, total: 50 }));

    renderRoutesPage(client);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('routes-next'));
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toContain('page=2');

    fireEvent.click(screen.getByTestId('routes-prev'));
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe(`/systems/routes?systemId=${ID_SYS_AUTH}`);
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS, { page: 1, total: 50 }));

    renderRoutesPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('routes-prev')).toBeDisabled();
    expect(screen.getByTestId('routes-next')).toBeEnabled();
  });

  it('botão "próxima" desabilita quando totalPages é 1', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(
      makePagedRoutes(SAMPLE_ROWS, { page: 1, total: 15, pageSize: 20 }),
    );

    renderRoutesPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('routes-prev')).toBeDisabled();
    expect(screen.getByTestId('routes-next')).toBeDisabled();
  });

  it('exibe indicador "página X de Y" com total filtrado', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS, { page: 1, total: 42 }));

    renderRoutesPage(client);
    await waitForInitialList(client);

    const info = screen.getByTestId('routes-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('RoutesPage — filtro de inativas', () => {
  it('liga toggle dispara request com includeDeleted=true', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValue(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const toggle = screen.getByTestId('routes-include-deleted') as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toContain('includeDeleted=true');
  });
});

describe('RoutesPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));
    client.get.mockResolvedValueOnce(makePagedRoutes([], { total: 0 }));

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('routes-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      expect(screen.getAllByText(/Nenhuma rota encontrada para/i).length).toBeGreaterThan(0);
    });
    // O botão "Limpar busca" aparece tanto na tabela quanto nos cards
    // (mesmo `emptyContent` reusado), portanto `getAllByTestId`.
    expect(screen.getAllByTestId('routes-empty-clear').length).toBeGreaterThan(0);
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createRoutesClientStub();
    client.get.mockResolvedValueOnce(makePagedRoutes([], { total: 0 }));

    renderRoutesPage(client);
    await waitForInitialList(client);

    expect(
      screen.getAllByText(/Nenhuma rota cadastrada para este sistema\./i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Rotas removidas podem ser visualizadas/i).length,
    ).toBeGreaterThan(0);
  });

  it('clicar em "limpar busca" reseta termo e dispara nova request', async () => {
    const client = createRoutesClientStub();
    client.get
      .mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS))
      .mockResolvedValueOnce(makePagedRoutes([], { total: 0 }))
      .mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('routes-search'), {
      target: { value: 'naoexiste' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    // O botão pode aparecer duplicado (tabela + cards). Pegamos o
    // primeiro — clicar em qualquer um dispara o mesmo callback.
    fireEvent.click((await screen.findAllByTestId('routes-empty-clear'))[0]);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe(`/systems/routes?systemId=${ID_SYS_AUTH}`);
  });
});

describe('RoutesPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createRoutesClientStub();
    client.get
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce(makePagedRoutes(SAMPLE_ROWS));

    renderRoutesPage(client);

    expect(await screen.findByText(/Falha de conexão com o servidor\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('routes-retry'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('AUTH_V1_SYSTEMS_LIST').length).toBeGreaterThan(0);
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createRoutesClientStub();
    client.get.mockRejectedValueOnce(new Error('boom'));

    renderRoutesPage(client);

    expect(
      await screen.findByText(/Falha ao carregar a lista de rotas\. Tente novamente\./i),
    ).toBeInTheDocument();
  });
});

describe('RoutesPage — cancelamento de request', () => {
  it('mudanças sucessivas de filtro abortam a request anterior via AbortController', async () => {
    const client = createRoutesClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (_path: string, options?: { signal?: AbortSignal }): Promise<PagedResponse<RouteDto>> => {
        if (options?.signal) {
          signals.push(options.signal);
        }
        return Promise.resolve(makePagedRoutes(SAMPLE_ROWS));
      },
    );

    renderRoutesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('routes-search'), {
      target: { value: 'systems' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByTestId('routes-search'), {
      target: { value: 'systems-list' },
    });

    expect(client.get).toHaveBeenCalledTimes(2);

    expect(signals.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));

    // O signal da request "systems" deve estar abortado: o cleanup do
    // useEffect que rodou para "systems" foi chamado quando
    // `debouncedSearch` mudou para "systems-list".
    expect(signals[1].aborted).toBe(true);
  });
});

describe('RoutesPage — systemId inválido', () => {
  it('renderiza alerta de "ID inválido" e não chama o backend quando :systemId é vazio', async () => {
    const client = createRoutesClientStub();

    // Renderizamos diretamente o roteador para entregar `:systemId`
    // ausente da URL. `renderRoutesPage` recebe o id no path; aqui
    // queremos o caminho onde `useParams` devolve só whitespace —
    // `isProbablyValidSystemId` rejeita após trim. `act(async)`
    // permite que o effect inicial flushe (que chama
    // `setIsInitialLoading(false)`) antes do assert, evitando warning
    // de "update not wrapped in act".
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/systems/%20/routes']}>
          <Routes>
            <Route
              path="/systems/:systemId/routes"
              element={<RoutesPage client={client} />}
            />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('routes-invalid-id')).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});
