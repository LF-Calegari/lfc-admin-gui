import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `buildAuthMock` precisa ser importado **antes** de
// `clientsTestHelpers` para que `vi.mock('@/shared/auth', () =>
// buildAuthMock(...))` consiga resolver a factory durante o hoisting
// — sem isso, o teste falha com `Cannot access '__vi_import_2__'
// before initialization` porque o `clientsTestHelpers` carrega
// `ClientsListShellPage`, que carrega `@/shared/auth` (o alvo do
// mock), antes de `buildAuthMock` estar definido. Quebra a ordem
// alfabética de `import/order` por necessidade de hoisting do
// Vitest — espelha o padrão usado em `SystemsPage.test.tsx`.
/* eslint-disable import/order */
import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  createClientsClientStub,
  ID_CLIENT_PF_ANA,
  ID_CLIENT_PF_BRUNO,
  ID_CLIENT_PJ_ACME,
  ID_CLIENT_PJ_GLOBAL,
  lastGetPath,
  makeClient,
  makeClientPj,
  makePagedClientsResponse,
  renderClientsListPage,
  waitForInitialList,
} from './__helpers__/clientsTestHelpers';
/* eslint-enable import/order */

import type { ApiError, ClientDto } from '@/shared/api';

/**
 * Suíte da `ClientsListShellPage` (Issue #73, EPIC #49 — listagem de
 * clientes com busca server-side e paginação). Estratégia espelha
 * `SystemsPage.test.tsx`: stub de `ApiClient` injetado, asserts sobre
 * estados visuais, paginação, busca debounced, filtro de tipo
 * (PF/PJ/Todos), toggle "Mostrar inativos", erros e cancelamento.
 */

vi.mock('@/shared/auth', () => buildAuthMock(() => ['AUTH_V1_CLIENTS_LIST']));

const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROWS: ReadonlyArray<ClientDto> = [
  makeClient({
    id: ID_CLIENT_PF_ANA,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Ana Cliente',
  }),
  makeClient({
    id: ID_CLIENT_PF_BRUNO,
    type: 'PF',
    cpf: '98765432100',
    fullName: 'Bruno Souza',
  }),
  makeClientPj({
    id: ID_CLIENT_PJ_ACME,
    cnpj: '12345678000190',
    corporateName: 'Acme Indústria S/A',
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

describe('ClientsListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e popula a tabela após resposta', async () => {
    const client = createClientsClientStub();
    let resolveFn: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockReturnValueOnce(pending);

    renderClientsListPage(client);

    expect(screen.getByTestId('clients-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(makePagedClientsResponse(SAMPLE_ROWS));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('clients-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Ana Cliente')).toBeInTheDocument();
    expect(screen.getByText('Bruno Souza')).toBeInTheDocument();
    expect(screen.getByText('Acme Indústria S/A')).toBeInTheDocument();
  });

  it('renderiza header da página com título "Clientes cadastrados"', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);

    await waitForInitialList(client);

    expect(
      screen.getByRole('heading', { name: /Clientes cadastrados/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /clients sem querystring quando defaults estão ativos', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);

    await waitForInitialList(client);
    expect(lastGetPath(client)).toBe('/clients');
  });

  it('renderiza CPF/CNPJ formatados na coluna Documento', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitForInitialList(client);

    // CPF "12345678901" -> "123.456.789-01"
    expect(screen.getByText('123.456.789-01')).toBeInTheDocument();
    // CNPJ "12345678000190" -> "12.345.678/0001-90"
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();
  });

  it('renderiza badge "Inativo" para clientes soft-deletados quando includeDeleted=true', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(
      makePagedClientsResponse([
        makeClient({
          id: ID_CLIENT_PF_ANA,
          fullName: 'Ana Cliente',
          deletedAt: '2026-02-01T00:00:00Z',
        }),
      ]),
    );

    renderClientsListPage(client);
    await waitForInitialList(client);

    fireEvent.click(screen.getByTestId('clients-include-deleted'));

    await waitFor(() => {
      expect(screen.getByText('Inativo')).toBeInTheDocument();
    });
  });

  it('exibe placeholder "—" quando nome ou documento são nulos (cenário fora do contrato, mas defensivo)', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse([
        makeClient({
          id: ID_CLIENT_PF_ANA,
          fullName: null,
          cpf: null,
        }),
      ]),
    );

    renderClientsListPage(client);
    await waitForInitialList(client);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('ClientsListShellPage — busca debounced', () => {
  it('digitar não dispara request imediato; após 300ms refaz GET com q na querystring', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('clients-search'), {
      target: { value: 'ana' },
    });

    expect(client.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/clients?q=ana');
  });

  it('teclas em sequência só disparam a última busca', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    const input = screen.getByTestId('clients-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'an' } });
    fireEvent.change(input, { target: { value: 'ana' } });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });
});

describe('ClientsListShellPage — filtro de tipo', () => {
  it('selecionar "Pessoa física" envia type=PF na querystring', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('clients-type-filter'), {
      target: { value: 'PF' },
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/clients?type=PF');
  });

  it('selecionar "Pessoa jurídica" envia type=PJ na querystring', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('clients-type-filter'), {
      target: { value: 'PJ' },
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/clients?type=PJ');
  });

  it('voltar para "Todos" remove o param type da querystring', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('clients-type-filter'), {
      target: { value: 'PF' },
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByTestId('clients-type-filter'), {
      target: { value: 'ALL' },
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe('/clients');
  });
});

describe('ClientsListShellPage — paginação server-side', () => {
  it('clicar "próxima" envia page=2 na querystring; "anterior" volta para page omitido (default)', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse(SAMPLE_ROWS, { total: 25, page: 1 }),
    );
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse(
        [
          makeClientPj({
            id: ID_CLIENT_PJ_GLOBAL,
            cnpj: '99999999000199',
            corporateName: 'Global Corp',
          }),
        ],
        { total: 25, page: 2 },
      ),
    );
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse(SAMPLE_ROWS, { total: 25, page: 1 }),
    );

    renderClientsListPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('clients-page-info')).toHaveTextContent(/Página 1 de 2/i);

    fireEvent.click(screen.getByTestId('clients-next'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/clients?page=2');

    fireEvent.click(screen.getByTestId('clients-prev'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(lastGetPath(client)).toBe('/clients');
  });

  it('botão "anterior" desabilita na primeira página', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse(SAMPLE_ROWS, { total: 25 }),
    );

    renderClientsListPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('clients-prev')).toBeDisabled();
    expect(screen.getByTestId('clients-next')).toBeEnabled();
  });

  it('botão "próxima" desabilita quando totalPages é 1', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitForInitialList(client);

    expect(screen.getByTestId('clients-prev')).toBeDisabled();
    expect(screen.getByTestId('clients-next')).toBeDisabled();
  });

  it('exibe indicador "Página X de Y" com total filtrado', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(
      makePagedClientsResponse(SAMPLE_ROWS, { total: 42 }),
    );

    renderClientsListPage(client);
    await waitForInitialList(client);

    const info = screen.getByTestId('clients-page-info');
    expect(info).toHaveTextContent(/Página 1 de 3/i);
    expect(info).toHaveTextContent(/42 resultado/i);
  });
});

describe('ClientsListShellPage — filtro de inativos', () => {
  it('liga toggle dispara request com includeDeleted=true', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValue(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('clients-include-deleted'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(lastGetPath(client)).toBe('/clients?includeDeleted=true');
  });
});

describe('ClientsListShellPage — estados vazios', () => {
  it('vazio com busca: exibe termo + botão limpar', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));
    client.get.mockResolvedValueOnce(makePagedClientsResponse([]));

    renderClientsListPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('clients-search'), {
      target: { value: 'naoexiste' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    // O texto aparece tanto no `LiveRegion` (announcer ARIA-live)
    // quanto no `EmptyMessage` visual — `getAllByText` ≥ 1 cobre o
    // contrato sem se acoplar ao detalhe (espelha o padrão usado nos
    // testes da RolesPage).
    expect(screen.getAllByText(/Nenhum cliente encontrado para/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('clients-empty-clear')).toBeInTheDocument();
  });

  it('vazio sem busca: mensagem dedicada + dica sobre toggle', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse([]));

    renderClientsListPage(client);
    await waitForInitialList(client);

    // Texto duplicado no `LiveRegion` + `EmptyMessage` — usar
    // `getAllByText` evita o erro "Found multiple elements".
    expect(screen.getAllByText(/Nenhum cliente cadastrado\./i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Clientes removidos podem ser visualizados/i),
    ).toBeInTheDocument();
  });

  it('clicar em "limpar busca" reseta termo e re-popula a lista', async () => {
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));
    client.get.mockResolvedValueOnce(makePagedClientsResponse([]));
    client.get.mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('clients-search'), {
      target: { value: 'naoexiste' },
    });
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Nenhum cliente encontrado para/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId('clients-empty-clear'));

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Ana Cliente')).toBeInTheDocument();
    });
  });
});

describe('ClientsListShellPage — erro de rede', () => {
  it('exibe Alert + botão retry; clicar dispara nova request', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createClientsClientStub();
    client.get
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce(makePagedClientsResponse(SAMPLE_ROWS));

    renderClientsListPage(client);

    expect(
      await screen.findByText(/Falha de conexão com o servidor\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clients-retry'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText(/Falha de conexão/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Ana Cliente')).toBeInTheDocument();
  });

  it('erro desconhecido exibe mensagem genérica', async () => {
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce(new Error('boom'));

    renderClientsListPage(client);

    expect(
      await screen.findByText(
        /Falha ao carregar a lista de clientes\. Tente novamente\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('ClientsListShellPage — cancelamento de request', () => {
  it('mudanças sucessivas de filtro abortam a request anterior via AbortController', async () => {
    const client = createClientsClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (_path: string, options?: { signal?: AbortSignal }): Promise<unknown> => {
        if (options?.signal) {
          signals.push(options.signal);
        }
        return Promise.resolve(makePagedClientsResponse(SAMPLE_ROWS));
      },
    );

    renderClientsListPage(client);
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('clients-search'), {
      target: { value: 'ana' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByTestId('clients-search'), {
      target: { value: 'ana-extra' },
    });

    expect(client.get).toHaveBeenCalledTimes(2);
    expect(signals.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));

    // O signal da request "ana" deve estar abortado: o cleanup do
    // useEffect que rodou para "ana" foi chamado quando
    // `debouncedSearch` mudou para "ana-extra".
    expect(signals[1].aborted).toBe(true);
  });
});
