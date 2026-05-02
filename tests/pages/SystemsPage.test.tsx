import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  createSystemsClientStub,
  ID_SYS_AUTH,
  ID_SYS_KURTTO,
  ID_SYS_LEGACY,
  makePagedResponse,
  makeSystem,
} from './__helpers__/systemsTestHelpers';

import type { ApiClientStub } from './__helpers__/systemsTestHelpers';
import type { ApiError, PagedResponse, SystemDto } from '@/shared/api';

import { SystemsPage } from '@/pages/SystemsPage';

/**
 * Mock do `useAuth` consumido pela `SystemsPage` (Issue #58 — gating do
 * botão "Novo sistema" pelo code `AUTH_V1_SYSTEMS_CREATE`).
 *
 * A suíte de listagem renderiza `<SystemsPage client={...} />` direto,
 * sem `<AuthProvider>`. O hook real lançaria por estar fora do
 * Provider; o mock devolve um valor estável (sem permissões) que
 * satisfaz o `useAuth()` chamado dentro do componente. Os testes desta
 * suíte não dependem de `hasPermission` (são de listagem); o caso de
 * gating fica isolado em `SystemsPage.create.test.tsx`. Reusa
 * `buildAuthMock` para evitar duplicação entre as duas suítes (lição
 * PR #127 — Sonar conta blocos de 10+ linhas como duplicação). O
 * Vitest faz hoisting tanto de imports como de `vi.mock`, garantindo
 * que `buildAuthMock` esteja disponível quando o mock é registrado.
 */
vi.mock('@/shared/auth', () => buildAuthMock(() => []));

/**
 * Atraso de debounce esperado pela página (300 ms). Espelha o valor
 * interno da `SystemsPage` — alterar em ambos os lados quando ajustar
 * a UX, ou (idealmente) extrair em constante exportada de um módulo
 * compartilhado quando outras páginas reusarem o mesmo padrão.
 */
const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROWS: ReadonlyArray<SystemDto> = [
  makeSystem({
    id: ID_SYS_AUTH,
    name: 'lfc-authenticator',
    code: 'AUTH',
  }),
  makeSystem({
    id: ID_SYS_KURTTO,
    name: 'lfc-kurtto',
    code: 'KURTTO',
  }),
  makeSystem({
    id: ID_SYS_LEGACY,
    name: 'lfc-legacy-bridge',
    code: 'LEGACY',
    deletedAt: '2026-02-01T00:00:00Z',
  }),
];

/**
 * Helper para extrair o `query` do path passado a `client.get`. Usado em
 * asserts que verificam a serialização da querystring.
 */
function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return '';
  const path = calls[calls.length - 1][0];
  return typeof path === 'string' ? path : '';
}

beforeEach(() => {
  // `shouldAdvanceTime: true` permite que `setTimeout` interno do
  // testing-library (`waitFor`/`findBy*`) avance com o relógio real
  // enquanto `vi.advanceTimersByTime(...)` ainda controla manualmente o
  // debounce da busca. Sem isso, o tempo virtual congela e `waitFor`
  // espera por timeouts que nunca disparam — fonte do bloqueio inicial
  // da implementação. Padrão recomendado pelo Vitest para tests de
  // componentes com debounce + RTL.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SystemsPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e depois popula a tabela', async () => {
    const client = createSystemsClientStub();
    let resolveFn: (value: PagedResponse<SystemDto>) => void = () => undefined;
    const pending = new Promise<PagedResponse<SystemDto>>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockReturnValueOnce(pending);

    render(<SystemsPage client={client} hideStats />);

    expect(screen.getByTestId('systems-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(makePagedResponse(SAMPLE_ROWS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('lfc-authenticator')).toBeInTheDocument();
    expect(screen.getByText('lfc-kurtto')).toBeInTheDocument();
    expect(screen.getByText('lfc-legacy-bridge')).toBeInTheDocument();
  });

  it('renderiza header com título e descrição da página', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /Sistemas cadastrados/i })).toBeInTheDocument();
  });

  it('chama backend com defaults e sem querystring no primeiro render', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => expect(client.get).toHaveBeenCalled());
    expect(lastGetPath(client)).toBe('/systems');
  });

  it('renderiza badge "Inativo" para sistemas com deletedAt e "Ativo" para os demais', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedResponse([
        makeSystem({
          id: ID_SYS_AUTH,
          name: 'lfc-authenticator',
          code: 'AUTH',
        }),
        makeSystem({
          id: ID_SYS_LEGACY,
          name: 'lfc-legacy-bridge',
          code: 'LEGACY',
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ]),
    );

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    // rows[0] é o header.
    const authRow = rows[1];
    const legacyRow = rows[2];
    expect(within(authRow).getByText('Ativo')).toBeInTheDocument();
    expect(within(legacyRow).getByText('Inativo')).toBeInTheDocument();
  });
});

describe('SystemsPage — busca debounced', () => {
  it('digitar não dispara request imediato; após 300ms dispara com q=auth', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValue(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('systems-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'auth' } });

    // Antes de avançar o timer, ainda só há a request inicial.
    expect(client.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/systems?q=auth');
  });

  it('cliques de teclado em sequência só disparam a última busca', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValue(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('systems-search') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'au' } });
    fireEvent.change(input, { target: { value: 'aut' } });
    fireEvent.change(input, { target: { value: 'auth' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/systems?q=auth');
  });

  it('busca limpa volta para o caminho default (sem querystring)', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValue(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('systems-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'auth' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/systems?q=auth');

    fireEvent.change(input, { target: { value: '' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe('/systems');
  });
});

describe('SystemsPage — paginação', () => {
  it('clicar "próxima" chama com page=2; "anterior" volta para page default', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValue(makePagedResponse(SAMPLE_ROWS, { page: 1, total: 50 }));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('systems-next'));
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/systems?page=2');

    fireEvent.click(screen.getByTestId('systems-prev'));
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe('/systems');
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS, { page: 1, total: 50 }));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('systems-prev')).toBeDisabled();
    expect(screen.getByTestId('systems-next')).toBeEnabled();
  });

  it('botão "próxima" desabilita na última página', async () => {
    const client = createSystemsClientStub();
    // total=15, pageSize=20 → totalPages=1 → ambos desabilitados.
    client.get.mockResolvedValueOnce(
      makePagedResponse(SAMPLE_ROWS, { page: 1, total: 15, pageSize: 20 }),
    );

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('systems-prev')).toBeDisabled();
    expect(screen.getByTestId('systems-next')).toBeDisabled();
  });

  it('exibe indicador "página X de Y" com total filtrado', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS, { page: 1, total: 42 }));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    const info = screen.getByTestId('systems-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('SystemsPage — filtro de inativos', () => {
  it('liga toggle dispara request com includeDeleted=true', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValue(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const toggle = screen.getByTestId('systems-include-deleted') as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/systems?includeDeleted=true');
  });

  it('badge "Inativo" aparece quando deletedAt está presente', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedResponse([
        makeSystem({
          id: ID_SYS_LEGACY,
          name: 'lfc-legacy-bridge',
          code: 'LEGACY',
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ]),
    );

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });
});

describe('SystemsPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createSystemsClientStub();
    // Primeiro carregamento: lista normal.
    client.get.mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS));
    // Após busca debounced: backend devolve vazio.
    client.get.mockResolvedValueOnce(makePagedResponse([], { total: 0 }));

    render(<SystemsPage client={client} hideStats />);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('systems-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    // `getAllByText` em vez de `getByText`: o texto aparece tanto no
    // aria-live span (acessibilidade) quanto na EmptyMessage visual —
    // a duplicação é proposital. Asserir presença sem exigir unicidade.
    await waitFor(() => {
      expect(screen.getAllByText(/Nenhum sistema encontrado para/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('systems-empty-clear')).toBeInTheDocument();
  });

  it('vazio sem busca: mensagem dedicada de "nenhum cadastrado"', async () => {
    const client = createSystemsClientStub();
    client.get.mockResolvedValueOnce(makePagedResponse([], { total: 0 }));

    render(<SystemsPage client={client} hideStats />);

    await waitFor(() => {
      expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
    });

    // Idem: aria-live + EmptyMessage repetem o texto.
    expect(screen.getAllByText(/Nenhum sistema cadastrado\./i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('systems-empty-clear')).not.toBeInTheDocument();
  });

  it('clicar em "limpar busca" reseta termo e dispara nova request', async () => {
    const client = createSystemsClientStub();
    client.get
      .mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS))
      .mockResolvedValueOnce(makePagedResponse([], { total: 0 }))
      .mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('systems-search'), {
      target: { value: 'naoexiste' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByTestId('systems-empty-clear'));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe('/systems');
  });
});

describe('SystemsPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createSystemsClientStub();
    client.get
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce(makePagedResponse(SAMPLE_ROWS));

    render(<SystemsPage client={client} hideStats />);

    expect(await screen.findByText(/Falha de conexão com o servidor\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('systems-retry'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText('lfc-authenticator')).toBeInTheDocument();
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createSystemsClientStub();
    client.get.mockRejectedValueOnce(new Error('boom'));

    render(<SystemsPage client={client} hideStats />);

    expect(
      await screen.findByText(/Falha ao carregar a lista de sistemas\. Tente novamente\./i),
    ).toBeInTheDocument();
  });
});

describe('SystemsPage — cancelamento de request', () => {
  it('navegação rápida (busca + paginação) cancela a request anterior via AbortController', async () => {
    const client = createSystemsClientStub();
    // Capturar os signals para asserir abort.
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (_path: string, options?: { signal?: AbortSignal }): Promise<PagedResponse<SystemDto>> => {
        if (options?.signal) {
          signals.push(options.signal);
        }
        return Promise.resolve(makePagedResponse(SAMPLE_ROWS));
      },
    );

    render(<SystemsPage client={client} hideStats />);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    // Dispara duas buscas rapidamente — sem debounce, segunda mudança
    // imediata cancelaria a primeira; com debounce, fazemos uma busca
    // e depois um clique de paginação.
    fireEvent.change(screen.getByTestId('systems-search'), {
      target: { value: 'auth' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    // Imediatamente paginar — deve abortar a request da busca
    // (que aqui já resolveu, mas o signal anterior continua observável
    // pelo cleanup do useEffect anterior).
    fireEvent.change(screen.getByTestId('systems-search'), {
      target: { value: 'auths' },
    });

    // Antes do debounce, a segunda mudança ainda não disparou request.
    expect(client.get).toHaveBeenCalledTimes(2);

    // Quando o useEffect anterior é desmontado pelo cleanup (a
    // dependência `debouncedSearch` muda apenas após o timer), o
    // controller anterior é abortado. Aqui validamos que o signal mais
    // recente disponível é o que segue ativo.
    expect(signals.length).toBeGreaterThanOrEqual(2);
    // O penúltimo signal foi abortado pelo cleanup do effect que
    // disparou a request "auth" — quando o efeito recompila o run-time
    // dispara novo controller.
    // Aqui, com fake timers, ainda não houve novo run; mas o effect
    // anterior já foi limpo na próxima execução do timer:
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));

    // Agora o signal #2 (da busca "auth") deve estar abortado: o
    // cleanup do useEffect que rodou para "auth" foi chamado quando
    // `debouncedSearch` mudou para "auths".
    expect(signals[1].aborted).toBe(true);
  });
});
