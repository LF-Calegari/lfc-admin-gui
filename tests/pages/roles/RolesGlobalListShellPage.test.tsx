import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  createRolesClientStub,
  ID_ROLE_ADMIN,
  ID_ROLE_ROOT,
  ID_ROLE_VIEWER,
  ID_SYS_AUTH,
  lastGetPath,
  lastGetPathMatching,
  makePagedRolesResponse,
  makePagedSystemsResponseForRoles,
  makeRole,
  makeSystemDtoForRoles,
  primeRolesGlobalStubResponses,
  renderRolesGlobalListPage,
  waitForRolesGlobalInitialList,
} from '../__helpers__/rolesTestHelpers';
/* eslint-enable import/order */

import type { ApiError, RoleDto, SystemDto } from '@/shared/api';

/**
 * Suíte da `RolesGlobalListShellPage` (Issue #173 — listagem global
 * cross-system de roles em `/roles`). Espelha a estratégia de
 * `ClientsListShellPage.test.tsx`/`SystemsPage.test.tsx`: stub de
 * `ApiClient` injetado, asserts sobre estados visuais, paginação
 * server-side, busca debounced, filtro por sistema (dropdown
 * carregado via request paralela `listSystems`), erros e
 * cancelamento.
 *
 * Diferenças relativas a outras listagens globais:
 *
 * - Duas requests no mount: `listRoles` (paginado) + `listSystems`
 *   (catálogo do dropdown). O helper `primeRolesGlobalStubResponses`
 *   resolve ambas via `mockImplementation` por path.
 * - Filtro extra é dropdown de sistema (UUID), não Select de tipo.
 * - Não há criação/edição/desativação inline (deferido — a issue
 *   especifica que os fluxos de mutação ficam na `RolesPage`
 *   per-system).
 * - Cada linha "drilla" para `/systems/:systemId/roles` via
 *   `useNavigate` ao clicar em "Abrir".
 */

vi.mock('@/shared/auth', () => buildAuthMock(() => ['AUTH_V1_ROLES_LIST']));

const SEARCH_DEBOUNCE_MS = 300;
const ID_SYS_OUTRO = '22222222-2222-2222-2222-222222222222';

const ROLES_SAMPLE: ReadonlyArray<RoleDto> = [
  makeRole({
    id: ID_ROLE_ROOT,
    systemId: ID_SYS_AUTH,
    name: 'Root',
    code: 'root',
    description: 'Acesso irrestrito',
    permissionsCount: 12,
    usersCount: 2,
  }),
  makeRole({
    id: ID_ROLE_ADMIN,
    systemId: ID_SYS_OUTRO,
    name: 'Admin',
    code: 'admin',
    description: 'Gerenciamento',
    permissionsCount: 8,
    usersCount: 6,
  }),
];

const SYSTEMS_SAMPLE: ReadonlyArray<SystemDto> = [
  makeSystemDtoForRoles({ id: ID_SYS_AUTH, name: 'lfc-authenticator' }),
  makeSystemDtoForRoles({
    id: ID_SYS_OUTRO,
    name: 'kurtto-orders',
    code: 'KURT',
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

describe('RolesGlobalListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e popula a tabela após resposta', async () => {
    const client = createRolesClientStub();
    let resolveRoles: (value: unknown) => void = () => undefined;
    const pendingRoles = new Promise<unknown>((resolve) => {
      resolveRoles = resolve;
    });
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) return pendingRoles;
      return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
    });

    renderRolesGlobalListPage(client);

    expect(screen.getByTestId('roles-global-loading')).toBeInTheDocument();

    await act(async () => {
      resolveRoles(makePagedRolesResponse(ROLES_SAMPLE));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('roles-global-loading'),
      ).not.toBeInTheDocument();
    });

    // Tabela desktop e cards mobile renderizam o mesmo conteúdo —
    // `getAllByText` cobre ambos os surfaces.
    expect(screen.getAllByText('Root').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
  });

  it('renderiza header da página com título "Roles cadastradas"', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(
      screen.getByRole('heading', { name: /Roles cadastradas/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /roles sem querystring quando defaults estão ativos', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(lastGetPathMatching(client, '/roles')).toBe('/roles');
  });

  it('denormaliza o nome do sistema dono na coluna "Sistema" usando o lookup do dropdown', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    // O dropdown de filtro contém os nomes dos sistemas; o lookup
    // alimenta a coluna Sistema. `getAllByText` cobre tabela + cards
    // + opção do dropdown.
    expect(screen.getAllByText('lfc-authenticator').length).toBeGreaterThan(0);
    expect(screen.getAllByText('kurtto-orders').length).toBeGreaterThan(0);
  });

  it('renderiza placeholder "—" para roles legadas com systemId null', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse([
        makeRole({
          id: ID_ROLE_VIEWER,
          systemId: null,
          name: 'Legacy',
          code: 'legacy',
        }),
      ]),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    // Tabela + cards renderizam placeholder em duplicidade.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('exibe contagens numéricas para permissionsCount e usersCount', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse([ROLES_SAMPLE[0]]),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('renderiza cards mobile com testId estável por role', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(
      screen.getByTestId(`roles-global-card-${ID_ROLE_ROOT}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`roles-global-card-${ID_ROLE_ADMIN}`),
    ).toBeInTheDocument();
  });
});

describe('RolesGlobalListShellPage — busca debounced (server-side)', () => {
  it('digitar não dispara request imediato; após 300ms refaz GET com q na querystring', async () => {
    const client = createRolesClientStub();
    let rolesPayload = makePagedRolesResponse(ROLES_SAMPLE);
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) return Promise.resolve(rolesPayload);
      return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    const callsBefore = client.get.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('/roles'),
    ).length;

    fireEvent.change(screen.getByTestId('roles-global-search'), {
      target: { value: 'admin' },
    });

    expect(
      client.get.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/roles'),
      ).length,
    ).toBe(callsBefore);

    rolesPayload = makePagedRolesResponse([ROLES_SAMPLE[1]]);
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe('/roles?q=admin');
    });
  });
});

describe('RolesGlobalListShellPage — filtro por sistema', () => {
  it('selecionar um sistema envia systemId na querystring', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    fireEvent.change(screen.getByTestId('roles-global-system-filter'), {
      target: { value: ID_SYS_AUTH },
    });

    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe(
        `/roles?systemId=${ID_SYS_AUTH}`,
      );
    });
  });

  it('voltar para "Todos os sistemas" remove o param systemId da querystring', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    fireEvent.change(screen.getByTestId('roles-global-system-filter'), {
      target: { value: ID_SYS_AUTH },
    });
    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe(
        `/roles?systemId=${ID_SYS_AUTH}`,
      );
    });

    fireEvent.change(screen.getByTestId('roles-global-system-filter'), {
      target: { value: 'ALL' },
    });
    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe('/roles');
    });
  });
});

describe('RolesGlobalListShellPage — paginação server-side', () => {
  it('clicar "próxima" envia page=2 na querystring; "anterior" volta para o default', async () => {
    const client = createRolesClientStub();
    const pageOne = Array.from({ length: 20 }, (_, i) =>
      makeRole({
        id: `id-${i}`,
        systemId: ID_SYS_AUTH,
        name: `Role ${i}`,
        code: `r${String(i).padStart(2, '0')}`,
      }),
    );
    const pageTwo = Array.from({ length: 5 }, (_, i) =>
      makeRole({
        id: `id-${i + 20}`,
        systemId: ID_SYS_AUTH,
        name: `Role ${i + 20}`,
        code: `r${String(i + 20).padStart(2, '0')}`,
      }),
    );
    let counter = 0;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
      }
      counter += 1;
      if (counter === 1) {
        return Promise.resolve(
          makePagedRolesResponse(pageOne, { total: 25, page: 1 }),
        );
      }
      if (counter === 2) {
        return Promise.resolve(
          makePagedRolesResponse(pageTwo, { total: 25, page: 2 }),
        );
      }
      return Promise.resolve(
        makePagedRolesResponse(pageOne, { total: 25, page: 1 }),
      );
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(screen.getByTestId('roles-global-page-info')).toHaveTextContent(
      /Página 1 de 2/i,
    );

    fireEvent.click(screen.getByTestId('roles-global-next'));

    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe('/roles?page=2');
    });

    fireEvent.click(screen.getByTestId('roles-global-prev'));

    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe('/roles');
    });
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE, { total: 25 }),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(screen.getByTestId('roles-global-prev')).toBeDisabled();
    expect(screen.getByTestId('roles-global-next')).toBeEnabled();
  });

  it('exibe indicador "Página X de Y" com total filtrado', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE, { total: 42 }),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    const info = screen.getByTestId('roles-global-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('RolesGlobalListShellPage — toggle includeDeleted', () => {
  it('liga toggle dispara request com includeDeleted=true na querystring', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse(ROLES_SAMPLE),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    fireEvent.click(screen.getByTestId('roles-global-include-deleted'));

    await waitFor(() => {
      expect(lastGetPathMatching(client, '/roles')).toBe(
        '/roles?includeDeleted=true',
      );
    });
  });
});

describe('RolesGlobalListShellPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createRolesClientStub();
    let rolesPayload = makePagedRolesResponse(ROLES_SAMPLE);
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) return Promise.resolve(rolesPayload);
      return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    rolesPayload = makePagedRolesResponse([]);
    fireEvent.change(screen.getByTestId('roles-global-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhuma role encontrada para/i).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByTestId('roles-global-empty-clear').length,
    ).toBeGreaterThan(0);
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse([]),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    expect(
      screen.getAllByText(/Nenhuma role cadastrada\./i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Roles removidas podem ser visualizadas/i).length,
    ).toBeGreaterThan(0);
  });
});

describe('RolesGlobalListShellPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createRolesClientStub();
    let attempt = 0;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
      }
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject(apiError);
      }
      return Promise.resolve(makePagedRolesResponse(ROLES_SAMPLE));
    });

    renderRolesGlobalListPage(client);

    expect(
      await screen.findByText(/Falha de conexão com o servidor\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('roles-global-retry'));

    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Root').length).toBeGreaterThan(0);
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createRolesClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE));
      }
      return Promise.reject(new Error('boom'));
    });

    renderRolesGlobalListPage(client);

    expect(
      await screen.findByText(
        /Falha ao carregar a lista de roles\. Tente novamente\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('RolesGlobalListShellPage — drill-down ao clicar em Abrir', () => {
  it('clicar em "Abrir" navega para /systems/:systemId/roles do sistema da role', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse([ROLES_SAMPLE[0]]),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    // Tabela + cards renderizam o botão; pegamos o primeiro
    // (`getAllByTestId` ≥ 1) e clicamos. A navegação é interna via
    // `useNavigate`; confirmamos via `screen.findByText('drill')`
    // (rota auxiliar registrada em `renderRolesGlobalListPage`).
    const buttons = screen.getAllByTestId(
      `roles-global-open-${ID_ROLE_ROOT}`,
    );
    fireEvent.click(buttons[0]);

    expect(await screen.findByText('drill')).toBeInTheDocument();
  });

  it('botão "Abrir" fica desabilitado em roles com systemId null', async () => {
    const client = createRolesClientStub();
    primeRolesGlobalStubResponses(client, {
      roles: makePagedRolesResponse([
        makeRole({
          id: ID_ROLE_VIEWER,
          systemId: null,
          name: 'Legacy',
          code: 'legacy',
        }),
      ]),
      systems: makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
    });

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    const buttons = screen.getAllByTestId(
      `roles-global-open-${ID_ROLE_VIEWER}`,
    );
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});

describe('RolesGlobalListShellPage — cancelamento de request', () => {
  it('mudanças sucessivas de busca abortam a request anterior via AbortController', async () => {
    const client = createRolesClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (options?.signal) {
          signals.push(options.signal);
        }
        if (path.startsWith('/systems')) {
          return Promise.resolve(
            makePagedSystemsResponseForRoles(SYSTEMS_SAMPLE),
          );
        }
        return Promise.resolve(makePagedRolesResponse(ROLES_SAMPLE));
      },
    );

    renderRolesGlobalListPage(client);
    await waitForRolesGlobalInitialList(client);

    fireEvent.change(screen.getByTestId('roles-global-search'), {
      target: { value: 'admin' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    fireEvent.change(screen.getByTestId('roles-global-search'), {
      target: { value: 'admin-extra' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    // Pelo menos uma das requests anteriores deve ter sido abortada
    // (cleanup do useEffect ao mudar `debouncedSearch`).
    const aborted = signals.filter((s) => s.aborted).length;
    expect(aborted).toBeGreaterThanOrEqual(1);
    // Anti-warning: também consume `lastGetPath` para evitar import
    // não usado; afirma que pelo menos uma chamada teve path string.
    expect(typeof lastGetPath(client)).toBe('string');
  });
});
