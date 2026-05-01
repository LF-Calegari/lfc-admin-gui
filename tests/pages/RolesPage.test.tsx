import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  createRolesClientStub,
  ID_ROLE_ADMIN,
  ID_ROLE_ROOT,
  ID_ROLE_VIEWER,
  lastGetPath,
  makeRole,
  renderRolesPage,
  waitForInitialList,
} from './__helpers__/rolesTestHelpers';

import type { ApiError, RoleDto } from '@/shared/api';

import { RolesPage } from '@/pages/RolesPage';

/**
 * Suíte da `RolesPage` (Issue #66, EPIC #47 — listagem de roles por
 * sistema). Estratégia espelha `RoutesPage.test.tsx`: stub de
 * `ApiClient` injetado, asserts sobre estados visuais, paginação,
 * busca debounced, toggle "incluir inativas", erros e cancelamento de
 * request.
 *
 * **Diferenças em relação a `RoutesPage.test.tsx`:**
 *
 * - O backend `/roles` hoje devolve um array cru (sem paginação/
 *   busca/includeDeleted nativos); o `listRoles` aplica os filtros
 *   client-side. Por isso a suíte foca no **comportamento da UI**
 *   (busca filtra a tabela, paginação aplica skip/take em memória,
 *   toggle inclui/exclui inativos visualmente) em vez de inspecionar
 *   a querystring do `client.get`.
 * - `lastGetPath` continua existindo e é usado para garantir que o
 *   path é sempre `/roles` (sem querystring) — quando o backend
 *   evoluir para paginação real, esses asserts mudarão para refletir
 *   a nova querystring.
 * - Não há gating de auth para nova role nesta sub-issue (a CTA é
 *   adicionada na #67); o mock `useAuth` segue sendo necessário pelo
 *   `RequirePermission` (que não é exercitado nesta suíte porque
 *   renderizamos a página direto, sem `AppRoutes`).
 */

vi.mock('@/shared/auth', () => buildAuthMock(() => []));

const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROWS: ReadonlyArray<RoleDto> = [
  makeRole({
    id: ID_ROLE_ROOT,
    name: 'Root',
    code: 'root',
    description: 'Acesso irrestrito a todos os sistemas',
    permissionsCount: 12,
    usersCount: 2,
  }),
  makeRole({
    id: ID_ROLE_ADMIN,
    name: 'Admin',
    code: 'admin',
    description: 'Gerenciamento de usuários e permissões',
    permissionsCount: 8,
    usersCount: 6,
  }),
  makeRole({
    id: ID_ROLE_VIEWER,
    name: 'Viewer',
    code: 'viewer',
    description: null,
    permissionsCount: null,
    usersCount: null,
    deletedAt: '2026-02-01T00:00:00Z',
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RolesPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e depois popula a tabela', async () => {
    const client = createRolesClientStub();
    let resolveFn: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockReturnValueOnce(pending);

    renderRolesPage(client);

    expect(screen.getByTestId('roles-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(SAMPLE_ROWS.slice());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('roles-loading')).not.toBeInTheDocument();
    });

    // Tabela desktop e cards mobile renderizam o mesmo conteúdo lado
    // a lado (CSS controla qual aparece). Asserir presença sem exigir
    // unicidade — `getAllByText` cobre ambos. Apenas roles ativas
    // (Root/Admin) aparecem por default — Viewer está soft-deletada
    // e só aparece com o toggle "Mostrar inativas" ligado, coberto
    // num teste dedicado abaixo.
    expect(screen.getAllByText('Root').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.queryByText('Viewer')).not.toBeInTheDocument();
  });

  it('renderiza header da página com título "Roles do sistema"', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS.slice());

    renderRolesPage(client);

    await waitForInitialList(client);

    expect(screen.getByRole('heading', { name: /Roles do sistema/i })).toBeInTheDocument();
  });

  it('chama backend em GET /roles (endpoint atual, sem paginação nativa)', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS.slice());

    renderRolesPage(client);

    await waitForInitialList(client);
    expect(lastGetPath(client)).toBe('/roles');
  });

  it('renderiza badge "Inativa" para roles com deletedAt e "Ativa" para as demais (com toggle ligado)', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitForInitialList(client);

    // Por default `includeDeleted=false` — a Viewer (deletada) é
    // omitida. Ligamos o toggle para incluí-la e exibir o badge
    // "Inativa".
    fireEvent.click(screen.getByTestId('roles-include-deleted'));

    await waitFor(() => {
      expect(screen.getByTestId(`roles-card-${ID_ROLE_VIEWER}`)).toBeInTheDocument();
    });

    // jsdom aplica `display: none` no `TableForDesktop` (a media
    // query `min-width: 48em` falha em viewport zero), então a tabela
    // desktop fica fora da accessibility tree. Asserir nas cards
    // mobile cobre o mesmo dado.
    const rootCard = screen.getByTestId(`roles-card-${ID_ROLE_ROOT}`);
    const viewerCard = screen.getByTestId(`roles-card-${ID_ROLE_VIEWER}`);
    expect(within(rootCard).getByText('Ativa')).toBeInTheDocument();
    expect(within(viewerCard).getByText('Inativa')).toBeInTheDocument();
  });

  it('exibe placeholder "—" para description/permissionsCount/usersCount ausentes (estado atual do backend)', async () => {
    const client = createRolesClientStub();
    // Cenário "backend não devolve os campos opcionais" — todos `null`.
    client.get.mockResolvedValueOnce([
      makeRole({
        id: ID_ROLE_ROOT,
        name: 'Root',
        code: 'root',
        description: null,
        permissionsCount: null,
        usersCount: null,
      }),
    ]);

    renderRolesPage(client);
    await waitForInitialList(client);

    // O placeholder "—" aparece tanto na tabela desktop quanto nos
    // cards mobile (mesmo helper `renderDescription`/`renderCount`).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('exibe contagens numéricas quando o backend devolve os campos (cenário futuro)', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce([
      makeRole({
        id: ID_ROLE_ROOT,
        name: 'Root',
        code: 'root',
        description: 'Acesso irrestrito',
        permissionsCount: 12,
        usersCount: 2,
      }),
    ]);

    renderRolesPage(client);
    await waitForInitialList(client);

    // Asserir presença sem exigir unicidade (tabela + cards).
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Acesso irrestrito').length).toBeGreaterThan(0);
  });

  it('renderiza cards mobile com testId estável por role', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId(`roles-card-${ID_ROLE_ROOT}`)).toBeInTheDocument();
    expect(screen.getByTestId(`roles-card-${ID_ROLE_ADMIN}`)).toBeInTheDocument();
  });
});

describe('RolesPage — busca debounced (filtro client-side)', () => {
  it('digitar não dispara request imediato; após 300ms re-aplica o filtro client-side', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('roles-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'admin' } });

    // O backend não suporta `q` nativo — o adapter aplica em memória,
    // mas o `usePaginatedFetch` ainda dispara um refetch (a request
    // identidade do `fetcher` mudou) para consistência com a paridade
    // de UX entre listagens.
    expect(client.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    // Apenas a role com nome/code "admin" deve aparecer.
    await waitFor(() => {
      expect(screen.getByTestId(`roles-card-${ID_ROLE_ADMIN}`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`roles-card-${ID_ROLE_ROOT}`)).not.toBeInTheDocument();
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('roles-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ad' } });
    fireEvent.change(input, { target: { value: 'adm' } });
    fireEvent.change(input, { target: { value: 'admin' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });
});

describe('RolesPage — paginação client-side', () => {
  it('clicar "próxima" muda a página para a 2; "anterior" volta para 1', async () => {
    const client = createRolesClientStub();
    // 25 roles ativas garantem 2 páginas com pageSize=20.
    const manyRows = Array.from({ length: 25 }, (_, i) =>
      makeRole({
        id: `id-${i}`,
        name: `Role ${i}`,
        code: `r${String(i).padStart(2, '0')}`,
      }),
    );
    client.get.mockResolvedValue(manyRows);

    renderRolesPage(client);
    await waitForInitialList(client);

    // Na página 1 vemos r00..r19.
    expect(screen.getByTestId('roles-page-info')).toHaveTextContent(/Página 1 de 2/i);

    fireEvent.click(screen.getByTestId('roles-next'));

    await waitFor(() => {
      expect(screen.getByTestId('roles-page-info')).toHaveTextContent(/Página 2 de 2/i);
    });

    fireEvent.click(screen.getByTestId('roles-prev'));

    await waitFor(() => {
      expect(screen.getByTestId('roles-page-info')).toHaveTextContent(/Página 1 de 2/i);
    });
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createRolesClientStub();
    const manyRows = Array.from({ length: 25 }, (_, i) =>
      makeRole({ id: `id-${i}`, code: `r${String(i).padStart(2, '0')}` }),
    );
    client.get.mockResolvedValueOnce(manyRows);

    renderRolesPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('roles-prev')).toBeDisabled();
    expect(screen.getByTestId('roles-next')).toBeEnabled();
  });

  it('botão "próxima" desabilita quando totalPages é 1', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('roles-prev')).toBeDisabled();
    expect(screen.getByTestId('roles-next')).toBeDisabled();
  });

  it('exibe indicador "página X de Y" com total filtrado', async () => {
    const client = createRolesClientStub();
    const manyRows = Array.from({ length: 42 }, (_, i) =>
      makeRole({ id: `id-${i}`, code: `r${String(i).padStart(2, '0')}` }),
    );
    client.get.mockResolvedValueOnce(manyRows);

    renderRolesPage(client);
    await waitForInitialList(client);

    const info = screen.getByTestId('roles-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('RolesPage — filtro de inativas', () => {
  it('liga toggle dispara request com inclusão de inativas no resultado', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    // Antes de ligar o toggle, a Viewer (deletada) não aparece.
    expect(
      screen.queryByTestId(`roles-card-${ID_ROLE_VIEWER}`),
    ).not.toBeInTheDocument();

    const toggle = screen.getByTestId('roles-include-deleted') as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    // Depois do toggle, a Viewer aparece.
    await waitFor(() => {
      expect(
        screen.getByTestId(`roles-card-${ID_ROLE_VIEWER}`),
      ).toBeInTheDocument();
    });
  });
});

describe('RolesPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('roles-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Nenhuma role encontrada para/i).length).toBeGreaterThan(0);
    });
    // O botão "Limpar busca" aparece tanto na tabela quanto nos
    // cards (mesmo `emptyContent` reusado).
    expect(screen.getAllByTestId('roles-empty-clear').length).toBeGreaterThan(0);
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValueOnce([]);

    renderRolesPage(client);
    await waitForInitialList(client);

    expect(
      screen.getAllByText(/Nenhuma role cadastrada para este sistema\./i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Roles removidas podem ser visualizadas/i).length,
    ).toBeGreaterThan(0);
  });

  it('clicar em "limpar busca" reseta termo e re-popula a lista', async () => {
    const client = createRolesClientStub();
    client.get.mockResolvedValue(SAMPLE_ROWS.slice());

    renderRolesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('roles-search'), {
      target: { value: 'naoexiste' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    // Estado vazio com busca ativa.
    await waitFor(() => {
      expect(screen.getAllByText(/Nenhuma role encontrada para/i).length).toBeGreaterThan(0);
    });

    // O botão pode aparecer duplicado (tabela + cards). Pegamos o
    // primeiro — clicar em qualquer um dispara o mesmo callback.
    fireEvent.click((await screen.findAllByTestId('roles-empty-clear'))[0]);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(`roles-card-${ID_ROLE_ROOT}`),
      ).toBeInTheDocument();
    });
  });
});

describe('RolesPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createRolesClientStub();
    client.get
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce(SAMPLE_ROWS.slice());

    renderRolesPage(client);

    expect(await screen.findByText(/Falha de conexão com o servidor\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('roles-retry'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Root').length).toBeGreaterThan(0);
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createRolesClientStub();
    client.get.mockRejectedValueOnce(new Error('boom'));

    renderRolesPage(client);

    expect(
      await screen.findByText(/Falha ao carregar a lista de roles\. Tente novamente\./i),
    ).toBeInTheDocument();
  });
});

describe('RolesPage — cancelamento de request', () => {
  it('mudanças sucessivas de filtro abortam a request anterior via AbortController', async () => {
    const client = createRolesClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (_path: string, options?: { signal?: AbortSignal }): Promise<unknown> => {
        if (options?.signal) {
          signals.push(options.signal);
        }
        return Promise.resolve(SAMPLE_ROWS.slice());
      },
    );

    renderRolesPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('roles-search'), {
      target: { value: 'admin' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByTestId('roles-search'), {
      target: { value: 'admin-extra' },
    });

    expect(client.get).toHaveBeenCalledTimes(2);

    expect(signals.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));

    // O signal da request "admin" deve estar abortado: o cleanup do
    // useEffect que rodou para "admin" foi chamado quando
    // `debouncedSearch` mudou para "admin-extra".
    expect(signals[1].aborted).toBe(true);
  });
});

describe('RolesPage — systemId inválido', () => {
  it('renderiza alerta de "ID inválido" e não chama o backend quando :systemId é vazio', async () => {
    const client = createRolesClientStub();

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/systems/%20/roles']}>
          <Routes>
            <Route
              path="/systems/:systemId/roles"
              element={<RolesPage client={client} />}
            />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('roles-invalid-id')).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});
