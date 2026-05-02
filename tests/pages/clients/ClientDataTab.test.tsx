import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import {
  buildAuthMock,
  setupPermissionLifecycle,
} from '../__helpers__/mockUseAuth';
import {
  buildClientsEditSubmitErrorCases,
  createClientsClientStub,
  fillClientDataPfForm,
  fillClientDataPjForm,
  ID_CLIENT_PF_ANA,
  ID_CLIENT_PJ_ACME,
  makeClient,
  makeClientPj,
  submitClientDataForm,
  toCaseInsensitiveMatcher,
} from '../__helpers__/clientsTestHelpers';
import type { ApiClientStub, ClientsErrorCase } from '../__helpers__/clientsTestHelpers';
import { ToastProvider } from '@/components/ui';
import { ClientDataTab } from '@/pages/clients/ClientDataTab';
/* eslint-enable import/order */

/**
 * Suíte do `ClientDataTab` (Issue #75 — aba "Dados" do
 * `ClientEditPage`).
 *
 * Estratégia espelha `NewClientModal.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory) para alternar a permissão `AUTH_V1_CLIENTS_UPDATE`
 *   entre testes.
 * - Stub de `ApiClient` injetado em `<ClientDataTab client={stub} />`,
 *   isolando a aba da camada de transporte real.
 * - Helpers em `clientsTestHelpers.tsx` (`fillClientDataPfForm`/
 *   `fillClientDataPjForm`/`submitClientDataForm`) para colapsar o
 *   boilerplate "preencher → submeter" e evitar `New Code Duplication`
 *   no Sonar (lição PR #134 — call-sites duplicados também precisam
 *   ficar deduplicados, não só os helpers internos).
 *
 * Cobre (critérios da issue):
 *
 * - Pré-popula CPF/CNPJ + nome/razão social + tipo a partir de
 *   `getClientById`.
 * - Tipo (PF/PJ) é renderizado como `<Select>` desabilitado (imutável
 *   após criação — backend rejeita mudança).
 * - Mesma validação client-side da criação (CPF/CNPJ inválido,
 *   FullName/CorporateName vazio).
 * - Submit com sucesso envia `PUT /clients/{id}` e exibe toast
 *   verde "Cliente atualizado.".
 * - 409 (CPF/CNPJ duplicado) exibe mensagem inline no campo de
 *   unicidade correspondente ao tipo.
 * - 400 com `errors` mapeia para campos; 400 sem `errors` (ex.: type
 *   imutável) exibe `Alert` no topo.
 * - 401/403 disparam toast vermelho.
 * - 404 dispara toast vermelho + redireciona para `/clientes`.
 * - Sem `AUTH_V1_CLIENTS_UPDATE`, o form vira readonly (campos
 *   desabilitados e botão "Salvar" oculto).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

setupPermissionLifecycle((perms) => {
  permissionsMock = perms;
}, [CLIENTS_UPDATE_PERMISSION]);

/**
 * Componente que captura o pathname atual do `MemoryRouter` para
 * que asserts de redirecionamento (caso 404) possam verificar a
 * navegação sem depender do detalhe interno do roteador.
 */
const PathnameProbe: React.FC<{ onChange: (pathname: string) => void }> = ({ onChange }) => {
  const [pathname] = React.useState<string>(() => window.location.pathname);
  React.useEffect(() => {
    onChange(pathname);
  }, [onChange, pathname]);
  return null;
};

/**
 * Renderiza a `ClientDataTab` num `<MemoryRouter>` com a rota
 * `/clientes/:id` e uma rota fallback `/clientes` que captura o
 * redirect do caminho 404. Centralizar evita repetir o setup em
 * cada teste e manter `New Code Duplication` baixo (lição PR
 * #127/#128).
 */
function renderClientDataTab(
  client: ApiClientStub,
  initialEntries: ReadonlyArray<string> = [`/clientes/${ID_CLIENT_PF_ANA}`],
): { redirected: () => boolean } {
  let redirectedFlag = false;

  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[...initialEntries]}>
        <Routes>
          <Route
            path="/clientes/:id"
            element={<ClientDataTab client={client} />}
          />
          <Route
            path="/clientes"
            element={
              <div data-testid="redirected-list">
                <PathnameProbe
                  onChange={() => {
                    redirectedFlag = true;
                  }}
                />
                Lista
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

  return { redirected: () => redirectedFlag };
}

/**
 * Aguarda o fetch inicial completar (loading some, form aparece).
 */
async function waitForLoaded(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId('client-data-loading')).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.queryByTestId('client-data-form')).toBeInTheDocument();
  });
}

describe('ClientDataTab — fetch inicial e pré-população (Issue #75)', () => {
  it('exibe spinner durante o GET /clients/{id}', () => {
    const client = createClientsClientStub();
    // `Promise` pendente — fica em loading indefinidamente para o
    // teste capturar o estado intermediário.
    client.get.mockReturnValueOnce(new Promise(() => {
      // intencional: nunca resolve.
    }));

    renderClientDataTab(client);

    expect(screen.getByTestId('client-data-loading')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith(
      `/clients/${ID_CLIENT_PF_ANA}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('pré-popula campos PF (CPF, nome, tipo) com os dados do backend', async () => {
    const dto = makeClient({
      id: ID_CLIENT_PF_ANA,
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana Cliente',
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    expect((screen.getByTestId('client-data-cpf') as HTMLInputElement).value).toBe(
      '52998224725',
    );
    expect(
      (screen.getByTestId('client-data-fullName') as HTMLInputElement).value,
    ).toBe('Ana Cliente');
    expect((screen.getByTestId('client-data-type') as HTMLSelectElement).value).toBe(
      'PF',
    );
  });

  it('pré-popula campos PJ (CNPJ, razão social, tipo) com os dados do backend', async () => {
    const dto = makeClientPj({
      id: ID_CLIENT_PJ_ACME,
      cnpj: '11222333000181',
      corporateName: 'Acme Indústria S/A',
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client, [`/clientes/${ID_CLIENT_PJ_ACME}`]);
    await waitForLoaded();

    expect((screen.getByTestId('client-data-cnpj') as HTMLInputElement).value).toBe(
      '11222333000181',
    );
    expect(
      (screen.getByTestId('client-data-corporateName') as HTMLInputElement).value,
    ).toBe('Acme Indústria S/A');
    expect((screen.getByTestId('client-data-type') as HTMLSelectElement).value).toBe(
      'PJ',
    );
  });

  it('renderiza `<Select>` de tipo desabilitado (imutável após criação)', async () => {
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    const typeSelect = screen.getByTestId('client-data-type') as HTMLSelectElement;
    expect(typeSelect).toBeDisabled();
    // Helper text do `<Select>` informa imutabilidade.
    expect(screen.getByText('Tipo é imutável após a criação.')).toBeInTheDocument();
  });

  it('exibe ErrorRetryBlock quando o fetch falha (rede)', async () => {
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'network',
      message: 'Falha de conexão.',
    });

    renderClientDataTab(client);

    expect(
      await screen.findByTestId('client-data-retry'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Não foi possível carregar os dados do cliente.'),
    ).toBeInTheDocument();
  });

  it('clicar em "Tentar novamente" refaz o GET', async () => {
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'network',
      message: 'Falha.',
    });
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    const retryBtn = await screen.findByTestId('client-data-retry');
    fireEvent.click(retryBtn);

    await waitForLoaded();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('redireciona para /clientes quando o fetch devolve 404', async () => {
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'http',
      status: 404,
      message: 'Cliente não encontrado.',
    });

    renderClientDataTab(client);

    // O redirect leva para a rota `/clientes` (fallback do
    // `<MemoryRouter>` no helper de render). A presença do
    // `data-testid="redirected-list"` confirma que a navegação
    // ocorreu — não dependemos de inspeção interna do roteador.
    expect(await screen.findByTestId('redirected-list')).toBeInTheDocument();
  });
});

describe('ClientDataTab — submit com sucesso (Issue #75)', () => {
  it('envia PUT /clients/{id} (PF) com body trimado e exibe toast', async () => {
    const dto = makeClient({
      id: ID_CLIENT_PF_ANA,
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana Cliente',
    });
    const updated = makeClient({
      id: ID_CLIENT_PF_ANA,
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana Atualizada',
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockResolvedValueOnce(updated);
    // Refetch após sucesso (`onUpdated` incrementa reloadCounter).
    client.get.mockResolvedValueOnce(updated);

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ fullName: '  Ana Atualizada  ' });
    await submitClientDataForm(client);

    expect(client.put).toHaveBeenCalledWith(
      `/clients/${ID_CLIENT_PF_ANA}`,
      {
        type: 'PF',
        cpf: '52998224725',
        fullName: 'Ana Atualizada',
      },
      undefined,
    );
    expect(await screen.findByText('Cliente atualizado.')).toBeInTheDocument();
  });

  it('envia PUT /clients/{id} (PJ) com body trimado e omite campos do tipo oposto', async () => {
    const dto = makeClientPj({
      id: ID_CLIENT_PJ_ACME,
      cnpj: '11222333000181',
      corporateName: 'Acme S/A',
    });
    const updated = makeClientPj({
      id: ID_CLIENT_PJ_ACME,
      cnpj: '11222333000181',
      corporateName: 'Acme Indústria S/A',
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockResolvedValueOnce(updated);
    client.get.mockResolvedValueOnce(updated);

    renderClientDataTab(client, [`/clientes/${ID_CLIENT_PJ_ACME}`]);
    await waitForLoaded();

    fillClientDataPjForm({ corporateName: '  Acme Indústria S/A  ' });
    await submitClientDataForm(client);

    const [path, body] = client.put.mock.calls[0];
    expect(path).toBe(`/clients/${ID_CLIENT_PJ_ACME}`);
    expect(body).toEqual({
      type: 'PJ',
      cnpj: '11222333000181',
      corporateName: 'Acme Indústria S/A',
    });
    expect(body).not.toHaveProperty('cpf');
    expect(body).not.toHaveProperty('fullName');
  });
});

describe('ClientDataTab — validação client-side (Issue #75)', () => {
  it('CPF inválido bloqueia o submit e exibe erro inline', async () => {
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ cpf: '11111111111' });
    fireEvent.submit(screen.getByTestId('client-data-form'));

    expect(screen.getByText('CPF inválido para cliente PF.')).toBeInTheDocument();
    expect(client.put).not.toHaveBeenCalled();
  });

  it('FullName apenas whitespace é tratado como vazio', async () => {
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ fullName: '   ' });
    fireEvent.submit(screen.getByTestId('client-data-form'));

    expect(
      screen.getByText('FullName é obrigatório para cliente PF.'),
    ).toBeInTheDocument();
    expect(client.put).not.toHaveBeenCalled();
  });
});

describe('ClientDataTab — tratamento de erros do backend (Issue #75)', () => {
  it('409 (CPF duplicado) exibe mensagem inline no campo cpf', async () => {
    const dto = makeClient({ type: 'PF' });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockRejectedValueOnce({
      kind: 'http',
      status: 409,
      message: 'Já existe cliente com este CPF.',
    });

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ cpf: '52998224725' });
    await submitClientDataForm(client);

    expect(
      await screen.findByText(toCaseInsensitiveMatcher('Já existe cliente com este CPF.')),
    ).toBeInTheDocument();
  });

  it('409 (CNPJ duplicado) exibe mensagem inline no campo cnpj', async () => {
    const dto = makeClientPj();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockRejectedValueOnce({
      kind: 'http',
      status: 409,
      message: 'Já existe cliente com este CNPJ.',
    });

    renderClientDataTab(client, [`/clientes/${ID_CLIENT_PJ_ACME}`]);
    await waitForLoaded();

    fillClientDataPjForm({ cnpj: '11222333000181' });
    await submitClientDataForm(client);

    expect(
      await screen.findByText(toCaseInsensitiveMatcher('Já existe cliente com este CNPJ.')),
    ).toBeInTheDocument();
  });

  /**
   * Cenários comuns colapsados em `it.each` (lição PR #123/#127 —
   * mesma estrutura mudando 1-2 mocks vira tabela, não `it`
   * separados, para evitar New Code Duplication no Sonar).
   */
  const ERROR_CASES: ReadonlyArray<ClientsErrorCase> = buildClientsEditSubmitErrorCases();

  it.each(ERROR_CASES)('mapeia $name', async ({ error, expectedText }) => {
    // Pré-popular com CPF válido (52998224725 — DVs corretos) para
    // que a validação client-side do `prepareUpdateSubmit` deixe
    // passar e o submit chegue até `client.put`. O CPF default da
    // fixture (`makeClient()`: 12345678901) tem DVs inválidos, então
    // sobrescrevemos aqui.
    const dto = makeClient({ cpf: '52998224725' });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockRejectedValueOnce(error);

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ fullName: 'Ana Atualizada' });
    await submitClientDataForm(client);

    expect(
      await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
    ).toBeInTheDocument();
  });

  it('404 no submit deixa o usuário na aba (refetch trata o redirect)', async () => {
    const dto = makeClient({ cpf: '52998224725' });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.put.mockRejectedValueOnce({
      kind: 'http',
      status: 404,
      message: 'Cliente não encontrado.',
    });
    // Refetch disparado pelo `useEditEntitySubmit` no caminho
    // `not-found` (`onUpdated` → `reloadCounter++` → useEffect roda
    // GET de novo). O backend devolve 404 também no GET → redirect
    // para `/clientes`.
    client.get.mockRejectedValueOnce({
      kind: 'http',
      status: 404,
      message: 'Cliente não encontrado.',
    });

    renderClientDataTab(client);
    await waitForLoaded();

    fillClientDataPfForm({ fullName: 'Ana Atualizada' });
    await submitClientDataForm(client);

    expect(await screen.findByTestId('redirected-list')).toBeInTheDocument();
  });
});

describe('ClientDataTab — gating Clients.Update (Issue #75)', () => {
  it('sem AUTH_V1_CLIENTS_UPDATE renderiza o form readonly (campos disabled, sem botão Salvar)', async () => {
    permissionsMock = [];
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    expect(screen.getByTestId('client-data-cpf')).toBeDisabled();
    expect(screen.getByTestId('client-data-fullName')).toBeDisabled();
    expect(screen.getByTestId('client-data-type')).toBeDisabled();
    // Footer (Cancelar/Submit) ausente em modo readonly.
    expect(screen.queryByTestId('client-data-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-data-cancel')).not.toBeInTheDocument();
  });

  it('com AUTH_V1_CLIENTS_UPDATE renderiza form editável com botão Salvar', async () => {
    permissionsMock = [CLIENTS_UPDATE_PERMISSION];
    const dto = makeClient();
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    expect(screen.getByTestId('client-data-cpf')).not.toBeDisabled();
    expect(screen.getByTestId('client-data-fullName')).not.toBeDisabled();
    // Botão "Salvar" presente.
    expect(screen.getByTestId('client-data-submit')).toBeInTheDocument();
    expect(screen.getByTestId('client-data-submit')).toHaveTextContent(/Salvar/i);
    expect(screen.getByTestId('client-data-cancel')).toBeInTheDocument();
  });
});

describe('ClientDataTab — botão Cancelar (Issue #75)', () => {
  it('reseta o form para o estado original (descarta edições não salvas)', async () => {
    const dto = makeClient({
      type: 'PF',
      cpf: '52998224725',
      fullName: 'Ana Cliente',
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientDataTab(client);
    await waitForLoaded();

    // Edição local sem salvar.
    fillClientDataPfForm({ fullName: 'Edição não salva' });
    expect(
      (screen.getByTestId('client-data-fullName') as HTMLInputElement).value,
    ).toBe('Edição não salva');

    fireEvent.click(screen.getByTestId('client-data-cancel'));

    expect(
      (screen.getByTestId('client-data-fullName') as HTMLInputElement).value,
    ).toBe('Ana Cliente');
    expect(client.put).not.toHaveBeenCalled();
  });
});
