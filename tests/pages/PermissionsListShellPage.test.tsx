import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  countPermissionsGetCalls,
  createPermissionsClientStub,
  ID_PERMISSION_BILLING_READ,
  ID_PERMISSION_USERS_CREATE,
  ID_PERMISSION_USERS_LIST,
  ID_SYSTEM_AUTH,
  ID_SYSTEM_BILLING,
  ID_TYPE_CREATE,
  ID_TYPE_READ,
  lastPermissionsGetPath,
  makePagedPermissionsResponse,
  makePagedSystemsResponse,
  makePermission,
  makeSystem,
  renderPermissionsListPage,
  seedDualGetMock,
  waitForInitialList,
} from './__helpers__/permissionsTestHelpers';
/* eslint-enable import/order */

import type { ApiError, PermissionDto } from '@/shared/api';

/**
 * Suíte da `PermissionsListShellPage` (Issue #174 — substitui o
 * placeholder por catálogo global filtrável). Estratégia espelha
 * `ClientsListShellPage.test.tsx`: stub de `ApiClient` injetado,
 * asserts sobre estados visuais, paginação, busca debounced, filtro
 * de sistema e tipo, toggle "Mostrar inativas", erros e cancelamento.
 *
 * Diferença sutil em relação a `ClientsListShellPage.test.tsx`: a
 * página dispara DOIS endpoints no mount (`/systems` para popular o
 * `<Select>` de filtro + `/permissions` para a listagem principal).
 * O helper `seedDualGetMock` cuida do roteamento — testes só
 * declaram a fila de respostas em ordem.
 */

vi.mock('@/shared/auth', () => buildAuthMock(() => ['AUTH_V1_PERMISSIONS_LIST']));

const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_SYSTEMS = makePagedSystemsResponse([
  makeSystem({ id: ID_SYSTEM_AUTH, code: 'authenticator', name: 'Authenticator' }),
  makeSystem({ id: ID_SYSTEM_BILLING, code: 'billing', name: 'Billing' }),
]);

const SAMPLE_PERMISSIONS: ReadonlyArray<PermissionDto> = [
  makePermission({
    id: ID_PERMISSION_USERS_LIST,
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'GET /api/v1/users',
    description: 'Ler: GET /api/v1/users',
  }),
  makePermission({
    id: ID_PERMISSION_USERS_CREATE,
    routeCode: 'AUTH_V1_USERS_CREATE',
    routeName: 'POST /api/v1/users',
    description: 'Criar: POST /api/v1/users',
    permissionTypeId: ID_TYPE_CREATE,
    permissionTypeCode: 'create',
    permissionTypeName: 'Criar',
  }),
  makePermission({
    id: ID_PERMISSION_BILLING_READ,
    routeCode: 'BILL_V1_INVOICES_LIST',
    routeName: 'GET /api/v1/invoices',
    description: 'Ler: GET /api/v1/invoices',
    systemId: ID_SYSTEM_BILLING,
    systemCode: 'billing',
    systemName: 'Billing',
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

describe('PermissionsListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e popula a tabela após resposta', async () => {
    const client = createPermissionsClientStub();
    let resolveSystems: (value: unknown) => void = () => undefined;
    let resolvePermissions: (value: unknown) => void = () => undefined;
    const systemsPending = new Promise<unknown>((resolve) => {
      resolveSystems = resolve;
    });
    const permissionsPending = new Promise<unknown>((resolve) => {
      resolvePermissions = resolve;
    });
    client.get.mockImplementation((path: string): Promise<unknown> => {
      if (path.startsWith('/systems')) return systemsPending;
      return permissionsPending;
    });

    renderPermissionsListPage(client);

    expect(screen.getByTestId('permissions-loading')).toBeInTheDocument();

    await act(async () => {
      resolveSystems(SAMPLE_SYSTEMS);
      resolvePermissions(makePagedPermissionsResponse(SAMPLE_PERMISSIONS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('permissions-loading')).not.toBeInTheDocument();
    });

    // `getAllByText` porque a página renderiza tabela desktop +
    // cards mobile (paridade com `ClientsListShellPage`/`UsersListShellPage`).
    expect(screen.getAllByText('AUTH_V1_USERS_LIST').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AUTH_V1_USERS_CREATE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BILL_V1_INVOICES_LIST').length).toBeGreaterThan(0);
  });

  it('renderiza header da página com título "Catálogo de permissões"', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    expect(
      screen.getByRole('heading', { name: /Catálogo de permissões/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /permissions sem querystring quando defaults estão ativos', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    expect(lastPermissionsGetPath(client)).toBe('/permissions');
  });

  it('chama backend em GET /systems?pageSize=100 no mount para popular o filtro', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const systemsPaths = client.get.mock.calls
      .map((call) => call[0])
      .filter((path): path is string => typeof path === 'string')
      .filter((path) => path.startsWith('/systems'));
    expect(systemsPaths.length).toBeGreaterThan(0);
    expect(systemsPaths[0]).toBe('/systems?pageSize=100');
  });

  it('renderiza colunas Sistema, Código da rota, Rota, Tipo, Descrição e Status', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    // O `<Table>` do design system renderiza labels dentro de
    // `<th>` styled. Verificar a presença textual via
    // `document.querySelectorAll('th')` é mais robusto que role
    // implícito (que jsdom às vezes não expõe sob styled-components).
    // Asserts por texto cobrem o contrato visual mínimo sem se
    // acoplar a classes CSS.
    const headers = Array.from(document.querySelectorAll('th'));
    const headerTexts = headers.map((th) => th.textContent ?? '');
    expect(headerTexts).toContain('Sistema');
    expect(headerTexts).toContain('Código da rota');
    expect(headerTexts).toContain('Rota');
    expect(headerTexts).toContain('Tipo');
    expect(headerTexts).toContain('Descrição');
    expect(headerTexts).toContain('Status');
  });

  it('exibe placeholder "—" quando campos denormalizados vêm como string vazia', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse([
        makePermission({
          systemName: '',
          systemCode: '',
          routeCode: '',
          routeName: '',
          permissionTypeName: '',
          description: null,
        }),
      ]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    // O placeholder "—" aparece em múltiplas células (sistema, rota,
    // tipo, descrição) tanto no desktop quanto nos cards mobile.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renderiza badge "Inativa" para permissões soft-deletadas quando includeDeleted=true', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([
        makePermission({
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.click(screen.getByTestId('permissions-include-deleted'));

    await waitFor(() => {
      // `getAllByText` por causa da renderização desktop + mobile.
      expect(screen.getAllByText('Inativa').length).toBeGreaterThan(0);
    });
  });
});

describe('PermissionsListShellPage — busca debounced', () => {
  it('digitar não dispara request imediato; após 300ms refaz GET com q na querystring', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeTyping = countPermissionsGetCalls(client);

    fireEvent.change(screen.getByTestId('permissions-search'), {
      target: { value: 'users' },
    });

    expect(countPermissionsGetCalls(client)).toBe(callsBeforeTyping);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(countPermissionsGetCalls(client)).toBe(callsBeforeTyping + 1),
    );
    expect(lastPermissionsGetPath(client)).toBe('/permissions?q=users');
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeTyping = countPermissionsGetCalls(client);

    const input = screen.getByTestId('permissions-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'au' } });
    fireEvent.change(input, { target: { value: 'auth' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(countPermissionsGetCalls(client)).toBe(callsBeforeTyping + 1),
    );
  });
});

describe('PermissionsListShellPage — filtro de sistema', () => {
  it('selecionar um sistema envia systemId na querystring', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([SAMPLE_PERMISSIONS[2]]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeFilter = countPermissionsGetCalls(client);

    fireEvent.change(screen.getByTestId('permissions-system-filter'), {
      target: { value: ID_SYSTEM_BILLING },
    });

    await waitFor(() =>
      expect(countPermissionsGetCalls(client)).toBe(callsBeforeFilter + 1),
    );
    expect(lastPermissionsGetPath(client)).toBe(
      `/permissions?systemId=${ID_SYSTEM_BILLING}`,
    );
  });

  it('voltar para "Todos" remove o param systemId da querystring', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([SAMPLE_PERMISSIONS[2]]),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('permissions-system-filter'), {
      target: { value: ID_SYSTEM_BILLING },
    });
    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe(
        `/permissions?systemId=${ID_SYSTEM_BILLING}`,
      ),
    );

    fireEvent.change(screen.getByTestId('permissions-system-filter'), {
      target: { value: 'ALL' },
    });
    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe('/permissions'),
    );
  });

  it('expõe os sistemas devolvidos por listSystems como opções do filtro', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const select = screen.getByTestId('permissions-system-filter') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((option) => option.value);
    expect(optionValues).toContain('ALL');
    expect(optionValues).toContain(ID_SYSTEM_AUTH);
    expect(optionValues).toContain(ID_SYSTEM_BILLING);
  });
});

describe('PermissionsListShellPage — filtro de tipo de permissão', () => {
  it('selecionar um tipo conhecido envia permissionTypeId na querystring após map populado', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      // Primeira request popula o map code→id (vê create + read).
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      // Segunda request (após mudar filtro) deve conter
      // `permissionTypeId={uuid_de_create}`.
      makePagedPermissionsResponse([SAMPLE_PERMISSIONS[1]]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeFilter = countPermissionsGetCalls(client);

    fireEvent.change(screen.getByTestId('permissions-type-filter'), {
      target: { value: 'create' },
    });

    await waitFor(() =>
      expect(countPermissionsGetCalls(client)).toBe(callsBeforeFilter + 1),
    );
    expect(lastPermissionsGetPath(client)).toBe(
      `/permissions?permissionTypeId=${ID_TYPE_CREATE}`,
    );
  });

  it('voltar para "Todos" remove o param permissionTypeId da querystring', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([SAMPLE_PERMISSIONS[1]]),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('permissions-type-filter'), {
      target: { value: 'create' },
    });
    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe(
        `/permissions?permissionTypeId=${ID_TYPE_CREATE}`,
      ),
    );

    fireEvent.change(screen.getByTestId('permissions-type-filter'), {
      target: { value: 'ALL' },
    });
    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe('/permissions'),
    );
  });

  it('expõe os 5 codes canônicos como opções do filtro de tipo', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const select = screen.getByTestId('permissions-type-filter') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((option) => option.value);
    expect(optionValues).toEqual(['ALL', 'create', 'read', 'update', 'delete', 'restore']);
  });

  it('seleciona tipo cujo id ainda não está mapeado: não dispara refetch (effectivePermissionTypeId continua undefined)', async () => {
    const client = createPermissionsClientStub();
    // Primeira response cobre só "read" — "delete" ainda não está
    // no map code→id quando o usuário muda o filtro.
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse([
        makePermission({
          permissionTypeId: ID_TYPE_READ,
          permissionTypeCode: 'read',
          permissionTypeName: 'Ler',
        }),
      ]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeFilter = countPermissionsGetCalls(client);

    fireEvent.change(screen.getByTestId('permissions-type-filter'), {
      target: { value: 'delete' },
    });

    // Comportamento esperado: como `delete` não está no map e o
    // `effectivePermissionTypeId` continua `undefined`, o `fetcher`
    // mantém a mesma identidade — não há refetch (omitir filtro
    // desconhecido é melhor que falsa precisão). O `permissionTypeIdByCode`
    // será populado quando o usuário voltar para um tipo conhecido
    // ou quando o backend devolver permissões com `delete`.
    //
    // Validamos que o número de chamadas a `/permissions` não muda.
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(countPermissionsGetCalls(client)).toBe(callsBeforeFilter);
    // E o filtro UI reflete a seleção do usuário (mesmo que sem
    // efeito server-side imediato).
    expect(
      (screen.getByTestId('permissions-type-filter') as HTMLSelectElement).value,
    ).toBe('delete');
  });
});

describe('PermissionsListShellPage — paginação server-side', () => {
  it('clicar "próxima" envia page=2 na querystring; "anterior" volta para page omitido (default)', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS, { total: 25, page: 1 }),
      makePagedPermissionsResponse(
        [makePermission({ id: 'page2-perm', routeCode: 'PAGE2_ROUTE' })],
        { total: 25, page: 2 },
      ),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS, { total: 25, page: 1 }),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('permissions-page-info')).toHaveTextContent(
      /Página 1 de 2/i,
    );

    fireEvent.click(screen.getByTestId('permissions-next'));

    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe('/permissions?page=2'),
    );

    fireEvent.click(screen.getByTestId('permissions-prev'));

    await waitFor(() =>
      expect(lastPermissionsGetPath(client)).toBe('/permissions'),
    );
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS, { total: 25 }),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('permissions-prev')).toBeDisabled();
    expect(screen.getByTestId('permissions-next')).toBeEnabled();
  });

  it('exibe indicador "Página X de Y" com total filtrado', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS, { total: 42 }),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const info = screen.getByTestId('permissions-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('PermissionsListShellPage — filtro de inativas', () => {
  it('liga toggle dispara request com includeDeleted=true', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    const callsBeforeToggle = countPermissionsGetCalls(client);

    fireEvent.click(screen.getByTestId('permissions-include-deleted'));

    await waitFor(() =>
      expect(countPermissionsGetCalls(client)).toBe(callsBeforeToggle + 1),
    );
    expect(lastPermissionsGetPath(client)).toBe(
      '/permissions?includeDeleted=true',
    );
  });
});

describe('PermissionsListShellPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('permissions-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getAllByText(/Nenhuma permissão encontrada para/i).length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByTestId('permissions-empty-clear').length,
    ).toBeGreaterThan(0);
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse([]),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    expect(
      screen.getAllByText(/Nenhuma permissão cadastrada\./i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Permissões removidas podem ser visualizadas/i)
        .length,
    ).toBeGreaterThan(0);
  });

  it('clicar em "limpar busca" reseta termo e re-popula a lista', async () => {
    const client = createPermissionsClientStub();
    seedDualGetMock(
      client,
      SAMPLE_SYSTEMS,
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
      makePagedPermissionsResponse([]),
      makePagedPermissionsResponse(SAMPLE_PERMISSIONS),
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('permissions-search'), {
      target: { value: 'naoexiste' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhuma permissão encontrada para/i).length,
      ).toBeGreaterThan(0);
    });

    // Clicar no primeiro botão "limpar busca" (aparece tanto no
    // emptyState do desktop quanto no rodapé dos cards mobile).
    fireEvent.click(screen.getAllByTestId('permissions-empty-clear')[0]);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText('AUTH_V1_USERS_LIST').length).toBeGreaterThan(0);
    });
  });
});

describe('PermissionsListShellPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createPermissionsClientStub();
    // Sistemas resolve normalmente; permissions falha na primeira,
    // sucesso no retry.
    let permissionsCallCount = 0;
    client.get.mockImplementation((path: string): Promise<unknown> => {
      if (path.startsWith('/systems')) {
        return Promise.resolve(SAMPLE_SYSTEMS);
      }
      permissionsCallCount += 1;
      if (permissionsCallCount === 1) {
        return Promise.reject(apiError);
      }
      return Promise.resolve(makePagedPermissionsResponse(SAMPLE_PERMISSIONS));
    });

    renderPermissionsListPage(client);

    expect(
      await screen.findByText(/Falha de conexão com o servidor\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('permissions-retry'));

    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('AUTH_V1_USERS_LIST').length).toBeGreaterThan(0);
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createPermissionsClientStub();
    client.get.mockImplementation((path: string): Promise<unknown> => {
      if (path.startsWith('/systems')) {
        return Promise.resolve(SAMPLE_SYSTEMS);
      }
      return Promise.reject(new Error('boom'));
    });

    renderPermissionsListPage(client);

    expect(
      await screen.findByText(
        /Falha ao carregar a lista de permissões\. Tente novamente\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('PermissionsListShellPage — cancelamento de request', () => {
  it('mudanças sucessivas de filtro abortam a request anterior via AbortController', async () => {
    const client = createPermissionsClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }): Promise<unknown> => {
        if (path.startsWith('/systems')) {
          return Promise.resolve(SAMPLE_SYSTEMS);
        }
        if (options?.signal) {
          signals.push(options.signal);
        }
        return Promise.resolve(makePagedPermissionsResponse(SAMPLE_PERMISSIONS));
      },
    );

    renderPermissionsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('permissions-search'), {
      target: { value: 'auth' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(2));

    fireEvent.change(screen.getByTestId('permissions-search'), {
      target: { value: 'auth-extra' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(3));

    // O signal da request anterior deve estar abortado: o cleanup
    // do useEffect que rodou para "auth" foi chamado quando
    // `debouncedSearch` mudou para "auth-extra".
    expect(signals[signals.length - 2].aborted).toBe(true);
  });
});
