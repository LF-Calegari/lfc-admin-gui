import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';

import type {
  ApiClient,
  ClientDto,
  PagedResponse,
  UserDto,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { UsersListShellPage } from '@/pages/users';

/**
 * Suíte da `UsersListShellPage` (Issue #77, EPIC #49 — listagem de
 * usuários com busca, paginação e filtro de inativos).
 *
 * Estratégia espelha `RoutesPage.test.tsx`/`RolesPage.test.tsx`:
 * stub de `ApiClient` injetado, asserts sobre querystring/estados
 * visuais, paginação, busca debounced, toggle "Mostrar inativas",
 * erros e cancelamento de request. Diferenças importantes:
 *
 * - O endpoint é `/users` (server-side com paginação real após PR
 *   lfc-authenticator#166).
 * - A página faz duas requests no mount: a listagem (`/users`) e o
 *   lookup batch dos clientes vinculados (`/clients/{id}` por user
 *   com `clientId`). O stub responde aos dois com `mockResolvedValue`
 *   genérico ou `mockImplementation` quando precisamos discriminar.
 * - A página não tem CTA "Novo usuário" nesta sub-issue — o gating
 *   por permissão é feito em `AppRoutes` via `RequirePermission`,
 *   não na página.
 *
 * Para reduzir flicker da resolução do lookup de clientes, o teste
 * espera explicitamente pelo nome do cliente quando a coluna é
 * exercida; nos demais cenários a coluna mostra "—" enquanto o
 * lookup carrega, o que continua sendo um estado válido.
 */

vi.mock('@/shared/auth', () => buildAuthMock(() => []));

const SEARCH_DEBOUNCE_MS = 300;

const ID_USER_ALICE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ID_USER_BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ID_USER_DELETED = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ID_USER_INACTIVE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ID_CLIENT_ALICE = '11111111-1111-1111-1111-111111111111';
const ID_CLIENT_BOB = '22222222-2222-2222-2222-222222222222';

type ClientStub = ApiClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
};

function createUsersClientStub(): ClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  } as unknown as ClientStub;
}

function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: ID_USER_ALICE,
    name: 'Alice Admin',
    email: 'alice@example.com',
    clientId: ID_CLIENT_ALICE,
    identity: 1,
    active: true,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

function makePagedUsers(
  data: ReadonlyArray<UserDto>,
  overrides: Partial<PagedResponse<UserDto>> = {},
): PagedResponse<UserDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

function makeClient(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: ID_CLIENT_ALICE,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Alice Cliente',
    cnpj: null,
    corporateName: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

const SAMPLE_ROWS: ReadonlyArray<UserDto> = [
  makeUser({
    id: ID_USER_ALICE,
    name: 'Alice Admin',
    email: 'alice@example.com',
    clientId: ID_CLIENT_ALICE,
    active: true,
  }),
  makeUser({
    id: ID_USER_BOB,
    name: 'Bob User',
    email: 'bob@example.com',
    clientId: ID_CLIENT_BOB,
    active: true,
  }),
];

const SAMPLE_CLIENTS: Record<string, ClientDto> = {
  [ID_CLIENT_ALICE]: makeClient({
    id: ID_CLIENT_ALICE,
    fullName: 'Alice Cliente',
  }),
  [ID_CLIENT_BOB]: makeClient({
    id: ID_CLIENT_BOB,
    type: 'PJ',
    cpf: null,
    fullName: null,
    cnpj: '12345678000190',
    corporateName: 'Bob Corp LTDA',
  }),
};

/**
 * Estratégia: discrimina entre `/users` (envelope paginado) e
 * `/clients/{id}` (cliente individual) baseado no path. Permite
 * declarar mocks de página completos sem precisar empilhar respostas
 * em ordem específica — robusto a quantidade variável de lookups por
 * usuário (depende de quantos têm `clientId`).
 */
function setupRouteAwareMock(
  client: ClientStub,
  options: {
    users?: PagedResponse<UserDto>;
    clientsById?: Record<string, ClientDto>;
    failClients?: boolean;
  } = {},
): void {
  const users = options.users ?? makePagedUsers(SAMPLE_ROWS);
  const clientsById = options.clientsById ?? SAMPLE_CLIENTS;

  client.get.mockImplementation((path: string) => {
    if (typeof path !== 'string') {
      return Promise.reject(new Error(`unexpected path: ${String(path)}`));
    }
    if (path.startsWith('/users')) {
      return Promise.resolve(users);
    }
    if (path.startsWith('/clients/')) {
      const id = path.replace('/clients/', '').split('?')[0];
      const dto = clientsById[id];
      if (options.failClients) {
        return Promise.reject({
          kind: 'http',
          status: 404,
          message: 'Cliente não encontrado.',
        });
      }
      if (dto) {
        return Promise.resolve(dto);
      }
      return Promise.reject({
        kind: 'http',
        status: 404,
        message: 'Cliente não encontrado.',
      });
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

function renderUsersPage(client: ClientStub): void {
  render(
    <ToastProvider>
      <MemoryRouter>
        <UsersListShellPage client={client} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function waitForInitialList(client: ClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('users-loading')).not.toBeInTheDocument();
  });
}

function lastUsersPath(client: ClientStub): string {
  const calls = client.get.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].startsWith('/users'),
  );
  if (calls.length === 0) return '';
  return calls[calls.length - 1][0] as string;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UsersListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e depois popula a tabela', async () => {
    const client = createUsersClientStub();
    let resolveFn: (value: PagedResponse<UserDto>) => void = () => undefined;
    const pending = new Promise<PagedResponse<UserDto>>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        return pending;
      }
      return Promise.resolve(SAMPLE_CLIENTS[ID_CLIENT_ALICE]);
    });

    renderUsersPage(client);
    expect(screen.getByTestId('users-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(makePagedUsers(SAMPLE_ROWS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('users-loading')).not.toBeInTheDocument();
    });

    expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob User').length).toBeGreaterThan(0);
  });

  it('renderiza header da página com título "Usuários"', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    expect(
      screen.getByRole('heading', { name: /^Usuários$/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /users sem querystring no primeiro render (defaults)', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    expect(lastUsersPath(client)).toBe('/users');
  });

  it('renderiza coluna Nome, E-mail e os identificadores via testIds estáveis', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId(`users-card-${ID_USER_ALICE}`)).toBeInTheDocument();
    expect(screen.getByTestId(`users-card-${ID_USER_BOB}`)).toBeInTheDocument();
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bob@example.com').length).toBeGreaterThan(0);
  });

  it('coluna Cliente exibe fullName (PF) e corporateName (PJ) após lookup', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    // O lookup é assíncrono — aguardamos cada nome aparecer.
    await waitFor(() => {
      expect(screen.getAllByText('Alice Cliente').length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getAllByText('Bob Corp LTDA').length).toBeGreaterThan(0);
    });
  });

  it('coluna Cliente mostra "—" quando lookup falha (best-effort)', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, { failClients: true });

    renderUsersPage(client);
    await waitForInitialList(client);

    // Lookup 404 — usuários permanecem visíveis com "—" na coluna.
    await waitFor(() => {
      const aliceCard = screen.getByTestId(`users-card-${ID_USER_ALICE}`);
      expect(within(aliceCard).getByText('—')).toBeInTheDocument();
    });
  });

  it('coluna Cliente mostra "—" quando o usuário não tem clientId', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, {
      users: makePagedUsers([
        makeUser({
          id: ID_USER_ALICE,
          clientId: null,
        }),
      ]),
    });

    renderUsersPage(client);
    await waitForInitialList(client);

    const aliceCard = screen.getByTestId(`users-card-${ID_USER_ALICE}`);
    expect(within(aliceCard).getByText('—')).toBeInTheDocument();
  });

  it('renderiza badge "Inativa" para usuários com deletedAt e "Ativa" para os demais (com toggle ligado)', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, {
      users: makePagedUsers([
        ...SAMPLE_ROWS,
        makeUser({
          id: ID_USER_DELETED,
          name: 'Carol Deleted',
          email: 'carol@example.com',
          clientId: null,
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ]),
    });

    renderUsersPage(client);
    await waitForInitialList(client);

    fireEvent.click(screen.getByTestId('users-include-deleted'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`users-card-${ID_USER_DELETED}`),
      ).toBeInTheDocument();
    });

    const aliceCard = screen.getByTestId(`users-card-${ID_USER_ALICE}`);
    const deletedCard = screen.getByTestId(`users-card-${ID_USER_DELETED}`);
    expect(within(aliceCard).getByText('Ativa')).toBeInTheDocument();
    expect(within(deletedCard).getByText('Inativa')).toBeInTheDocument();
  });

  it('renderiza badge "Inativa" para usuários com active=false ainda não soft-deletados', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, {
      users: makePagedUsers([
        makeUser({
          id: ID_USER_INACTIVE,
          name: 'Dani Inactive',
          email: 'dani@example.com',
          clientId: null,
          active: false,
          deletedAt: null,
        }),
      ]),
    });

    renderUsersPage(client);
    await waitForInitialList(client);

    const inactiveCard = screen.getByTestId(`users-card-${ID_USER_INACTIVE}`);
    expect(within(inactiveCard).getByText('Inativa')).toBeInTheDocument();
  });
});

describe('UsersListShellPage — busca debounced (server-side)', () => {
  it('digitar não dispara request imediato; após 300ms re-emite GET /users com q', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    const baselineUsersCalls = client.get.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('/users'),
    ).length;

    const input = screen.getByTestId('users-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alice' } });

    // Imediatamente após digitar, o número de chamadas em /users
    // mantém-se igual (debounce ainda não expirou).
    expect(
      client.get.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/users'),
      ).length,
    ).toBe(baselineUsersCalls);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastUsersPath(client)).toBe('/users?q=alice');
    });
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    const baselineUsersCalls = client.get.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('/users'),
    ).length;

    const input = screen.getByTestId('users-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'al' } });
    fireEvent.change(input, { target: { value: 'ali' } });
    fireEvent.change(input, { target: { value: 'alice' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        client.get.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].startsWith('/users'),
        ).length,
      ).toBe(baselineUsersCalls + 1);
    });
    expect(lastUsersPath(client)).toBe('/users?q=alice');
  });

  it('volta a página para 1 ao digitar nova busca depois de paginar', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, {
      users: makePagedUsers(SAMPLE_ROWS, { page: 2, total: 30 }),
    });

    renderUsersPage(client);
    await waitForInitialList(client);

    // Avança para página 2 manualmente clicando em "Próxima" — então
    // emula busca e confere que a próxima request volta para page=1
    // (sem `?page=2`).
    const baselinePath = lastUsersPath(client);
    expect(baselinePath).toBe('/users');

    const input = screen.getByTestId('users-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alice' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      // Sem `&page=2` — busca reseta para página 1.
      expect(lastUsersPath(client)).toBe('/users?q=alice');
    });
  });
});

describe('UsersListShellPage — paginação', () => {
  it('clicar "próxima" emite GET /users?page=2 e "anterior" volta para /users (page=1 default omitido)', async () => {
    const client = createUsersClientStub();
    // 25 usuários simulados — o backend devolve `total=25`/`page=1`/
    // `pageSize=20`, então `totalPages=2`. O stub volta para essa
    // mesma resposta em ambas as requisições — o teste foca na URL.
    setupRouteAwareMock(client, {
      users: makePagedUsers(SAMPLE_ROWS, { total: 25 }),
    });

    renderUsersPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('users-page-info')).toHaveTextContent(
      /Página 1 de 2/i,
    );

    fireEvent.click(screen.getByTestId('users-next'));

    await waitFor(() => {
      expect(lastUsersPath(client)).toBe('/users?page=2');
    });

    fireEvent.click(screen.getByTestId('users-prev'));

    await waitFor(() => {
      expect(lastUsersPath(client)).toBe('/users');
    });
  });
});

describe('UsersListShellPage — toggle "Mostrar inativas"', () => {
  it('ligar o toggle emite GET /users?includeDeleted=true', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client);

    renderUsersPage(client);
    await waitForInitialList(client);

    fireEvent.click(screen.getByTestId('users-include-deleted'));

    await waitFor(() => {
      expect(lastUsersPath(client)).toBe('/users?includeDeleted=true');
    });
  });
});

describe('UsersListShellPage — erros', () => {
  it('exibe ErrorRetryBlock quando a request falha e refaz a request ao clicar "Tentar novamente"', async () => {
    const client = createUsersClientStub();
    let attempt = 0;
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject({
            kind: 'http' as const,
            status: 500,
            message: 'Erro interno do servidor.',
          });
        }
        return Promise.resolve(makePagedUsers(SAMPLE_ROWS));
      }
      return Promise.resolve(SAMPLE_CLIENTS[ID_CLIENT_ALICE]);
    });

    renderUsersPage(client);

    await waitFor(() => {
      expect(screen.getByText('Erro interno do servidor.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('users-retry'));

    await waitFor(() => {
      expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
    });
  });

  it('mostra mensagem de fallback quando o erro não é ApiError', async () => {
    const client = createUsersClientStub();
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(undefined);
    });

    renderUsersPage(client);

    await waitFor(() => {
      expect(
        screen.getByText('Falha ao carregar a lista de usuários. Tente novamente.'),
      ).toBeInTheDocument();
    });
  });
});

describe('UsersListShellPage — estado vazio', () => {
  it('mostra mensagem de "Nenhum usuário cadastrado." quando a lista volta vazia', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, { users: makePagedUsers([], { total: 0 }) });

    renderUsersPage(client);
    await waitForInitialList(client);

    expect(
      screen.getAllByText(/Nenhum usuário cadastrado/i).length,
    ).toBeGreaterThan(0);
  });

  it('mostra mensagem com termo da busca + botão "Limpar busca" quando lista vazia com filtro', async () => {
    const client = createUsersClientStub();
    setupRouteAwareMock(client, { users: makePagedUsers([], { total: 0 }) });

    renderUsersPage(client);
    await waitForInitialList(client);

    const input = screen.getByTestId('users-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'inexistente' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhum usuário encontrado para/i).length,
      ).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByTestId('users-empty-clear')[0]);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });
});
