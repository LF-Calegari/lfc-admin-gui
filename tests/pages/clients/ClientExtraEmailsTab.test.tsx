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
  createClientsClientStub,
  ID_CLIENT_PF_ANA,
  makeClient,
  makeClientEmail,
  submitAddExtraEmailForm,
} from '../__helpers__/clientsTestHelpers';
import type { ApiClientStub } from '../__helpers__/clientsTestHelpers';
import { ToastProvider } from '@/components/ui';
import { ClientExtraEmailsTab } from '@/pages/clients/ClientExtraEmailsTab';
/* eslint-enable import/order */

/**
 * Suíte do `ClientExtraEmailsTab` (Issue #146 — gerenciar emails
 * extras de cliente).
 *
 * Estratégia espelha `ClientDataTab.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory) para alternar `AUTH_V1_CLIENTS_UPDATE` entre testes.
 * - Stub de `ApiClient` injetado em
 *   `<ClientExtraEmailsTab client={stub} />`, isolando da camada de
 *   transporte real.
 * - Helpers em `clientsTestHelpers.tsx` (`makeClientEmail`,
 *   `submitAddExtraEmailForm`) para colapsar o boilerplate
 *   "preencher → submeter" e evitar `New Code Duplication` no Sonar
 *   (lição PR #134/#135).
 *
 * Cobre (critérios da issue):
 *
 * - Lista os emails extras existentes (vindos em
 *   `ClientResponse.extraEmails`).
 * - Botão "Adicionar email" abre modal com input e validação
 *   client-side de formato.
 * - Botão de remover por linha; confirmação antes.
 * - Mapeamento dos erros do backend (400 limite, 409 duplicado,
 *   409 username, 400 remove username).
 * - Refetch após sucesso.
 * - Visível com `Clients.Update` (modo readonly sem permissão).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

setupPermissionLifecycle((perms) => {
  permissionsMock = perms;
}, [CLIENTS_UPDATE_PERMISSION]);

/**
 * Renderiza a `ClientExtraEmailsTab` num `<MemoryRouter>` com a rota
 * `/clientes/:id` para que `useParams` devolva o `id` esperado.
 */
function renderClientExtraEmailsTab(
  client: ApiClientStub,
  initialEntries: ReadonlyArray<string> = [`/clientes/${ID_CLIENT_PF_ANA}`],
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[...initialEntries]}>
        <Routes>
          <Route
            path="/clientes/:id"
            element={<ClientExtraEmailsTab client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda o fetch inicial completar (loading some, conteúdo aparece).
 */
async function waitForLoaded(): Promise<void> {
  await waitFor(() => {
    expect(
      screen.queryByTestId('client-extra-emails-loading'),
    ).not.toBeInTheDocument();
  });
}

/**
 * Abre o modal de adicionar e preenche o input com `value`. O modal
 * abre via clique no botão "Adicionar email", que precisa estar
 * habilitado (cliente abaixo do limite) — caller garante isso via
 * mock do `getClientById`.
 */
function openAddModalAndFill(value: string): void {
  fireEvent.click(screen.getByTestId('client-extra-emails-add'));
  fireEvent.change(screen.getByTestId('client-extra-emails-add-email'), {
    target: { value },
  });
}

/**
 * Constrói um email pré-cadastrado e configura o stub para devolver
 * um cliente com esse email no GET inicial. Centralizar evita repetir
 * o trio "makeClientEmail + makeClient + mockResolvedValueOnce" em
 * cada teste de remoção (~10 linhas), o que dispararia detecção de
 * duplicação no JSCPD/Sonar (lição PR #134/#135 — extrair helper
 * antes do segundo call site).
 */
function setupSingleEmailScene(): {
  client: ApiClientStub;
  email: ReturnType<typeof makeClientEmail>;
} {
  const email = makeClientEmail({
    id: 'e0000000-0000-0000-0000-0000000000aa',
    email: 'a@exemplo.com',
  });
  const dto = makeClient({ extraEmails: [email] });
  const client = createClientsClientStub();
  client.get.mockResolvedValueOnce(dto);
  return { client, email };
}

/**
 * Variante de `setupSingleEmailScene` que abre a confirmação de
 * remoção logo após o load. Usado pelos testes que disparam ações
 * subsequentes (confirm, cancel, error). Mantém o boilerplate de
 * teste enxuto e elimina ~5 linhas idênticas em cada cenário.
 */
async function setupSingleEmailRemoveConfirm(): Promise<{
  client: ApiClientStub;
  email: ReturnType<typeof makeClientEmail>;
}> {
  const scene = setupSingleEmailScene();
  renderClientExtraEmailsTab(scene.client);
  await waitForLoaded();
  fireEvent.click(
    screen.getByTestId(`client-extra-emails-remove-${scene.email.id}`),
  );
  return scene;
}

describe('ClientExtraEmailsTab — fetch inicial e estados visuais (Issue #146)', () => {
  it('exibe spinner durante o GET /clients/{id}', () => {
    const client = createClientsClientStub();
    client.get.mockReturnValueOnce(new Promise(() => {
      // intencional: nunca resolve
    }));

    renderClientExtraEmailsTab(client);

    expect(
      screen.getByTestId('client-extra-emails-loading'),
    ).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith(
      `/clients/${ID_CLIENT_PF_ANA}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('exibe ErrorRetryBlock quando o fetch falha (rede)', async () => {
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'network',
      message: 'Falha de conexão.',
    });

    renderClientExtraEmailsTab(client);

    expect(
      await screen.findByTestId('client-extra-emails-retry'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Não foi possível carregar os dados do cliente.'),
    ).toBeInTheDocument();
  });

  it('clicar em "Tentar novamente" refaz o GET', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'network',
      message: 'Falha.',
    });
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    const retryBtn = await screen.findByTestId('client-extra-emails-retry');
    fireEvent.click(retryBtn);

    await waitForLoaded();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('renderiza empty state quando o cliente não tem emails extras', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    expect(
      screen.getByTestId('client-extra-emails-empty'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nenhum email extra cadastrado'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('client-extra-emails-counter')).toHaveTextContent(
      '0 de 3 cadastrados',
    );
  });

  it('renderiza linha por email retornado em ClientResponse.extraEmails', async () => {
    const emailA = makeClientEmail({
      id: 'e0000000-0000-0000-0000-0000000000aa',
      email: 'a@exemplo.com',
    });
    const emailB = makeClientEmail({
      id: 'e0000000-0000-0000-0000-0000000000bb',
      email: 'b@exemplo.com',
    });
    const dto = makeClient({ extraEmails: [emailA, emailB] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    expect(
      screen.getByTestId(`client-extra-emails-row-${emailA.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`client-extra-emails-row-${emailB.id}`),
    ).toBeInTheDocument();
    expect(screen.getByText('a@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('b@exemplo.com')).toBeInTheDocument();
    expect(screen.getByTestId('client-extra-emails-counter')).toHaveTextContent(
      '2 de 3 cadastrados',
    );
  });
});

describe('ClientExtraEmailsTab — adicionar email (Issue #146)', () => {
  it('botão "Adicionar email" abre o modal com input vazio', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    fireEvent.click(screen.getByTestId('client-extra-emails-add'));

    const input = screen.getByTestId(
      'client-extra-emails-add-email',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('email com formato inválido bloqueia o submit e exibe erro inline', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('sem-arroba');
    fireEvent.submit(screen.getByTestId('client-extra-emails-add-form'));

    expect(screen.getByText('Informe um email válido.')).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('email vazio (whitespace) bloqueia o submit e exibe erro inline', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('   ');
    fireEvent.submit(screen.getByTestId('client-extra-emails-add-form'));

    expect(screen.getByText('Email é obrigatório.')).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('submit válido envia POST /clients/{id}/emails com body { email } trimado', async () => {
    const dto = makeClient({ extraEmails: [] });
    const updated = makeClient({
      extraEmails: [makeClientEmail({ email: 'novo@exemplo.com' })],
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.post.mockResolvedValueOnce(makeClientEmail({ email: 'novo@exemplo.com' }));
    client.get.mockResolvedValueOnce(updated);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('  novo@exemplo.com  ');
    await submitAddExtraEmailForm(client);

    expect(client.post).toHaveBeenCalledWith(
      `/clients/${ID_CLIENT_PF_ANA}/emails`,
      { email: 'novo@exemplo.com' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText('Email extra adicionado.')).toBeInTheDocument();
  });

  it('botão "Adicionar email" fica desabilitado quando o cliente já tem 3 emails extras', async () => {
    const dto = makeClient({
      extraEmails: [
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a1', email: 'a@x.com' }),
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a2', email: 'b@x.com' }),
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a3', email: 'c@x.com' }),
      ],
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    expect(screen.getByTestId('client-extra-emails-add')).toBeDisabled();
    // Aviso visual reforça a condição.
    expect(
      screen.getByText(/Limite de 3 emails extras/i),
    ).toBeInTheDocument();
  });

  it('400 "Limite de 3..." (race) exibe inline e dispara refetch', async () => {
    // UI mostra 2 emails (abaixo do limite), operador abre modal,
    // mas no momento do submit o backend já tem 3 (outra sessão).
    const dto = makeClient({
      extraEmails: [
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a1', email: 'a@x.com' }),
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a2', email: 'b@x.com' }),
      ],
    });
    const dtoFull = makeClient({
      extraEmails: [
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a1', email: 'a@x.com' }),
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a2', email: 'b@x.com' }),
        makeClientEmail({ id: 'e0000000-0000-0000-0000-0000000000a3', email: 'c@x.com' }),
      ],
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.post.mockRejectedValueOnce({
      kind: 'http',
      status: 400,
      message: 'Limite de 3 emails extras por cliente.',
    });
    client.get.mockResolvedValueOnce(dtoFull);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('novo@exemplo.com');
    await submitAddExtraEmailForm(client);

    expect(
      await screen.findByText('Limite de 3 emails extras por cliente.'),
    ).toBeInTheDocument();
    // Refetch foi disparado (2 GETs no total).
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it('409 "Email extra já cadastrado" exibe mensagem inline no input', async () => {
    const dto = makeClient({
      extraEmails: [makeClientEmail({ email: 'existente@exemplo.com' })],
    });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.post.mockRejectedValueOnce({
      kind: 'http',
      status: 409,
      message: 'Email extra já cadastrado para este cliente.',
    });

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('existente@exemplo.com');
    await submitAddExtraEmailForm(client);

    expect(
      await screen.findByText('Email extra já cadastrado para este cliente.'),
    ).toBeInTheDocument();
    // Modal continua aberto (input ainda visível).
    expect(
      screen.getByTestId('client-extra-emails-add-email'),
    ).toBeInTheDocument();
  });

  it('409 "Este email está sendo usado como username" exibe orientação inline', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);
    client.post.mockRejectedValueOnce({
      kind: 'http',
      status: 409,
      message:
        'Este email está sendo usado como username e não pode ser email extra.',
    });

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('username@exemplo.com');
    await submitAddExtraEmailForm(client);

    expect(
      await screen.findByText(
        'Este email está sendo usado como username e não pode ser email extra.',
      ),
    ).toBeInTheDocument();
  });

  it('cancelar fecha o modal e descarta o input', async () => {
    const dto = makeClient({ extraEmails: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientExtraEmailsTab(client);
    await waitForLoaded();

    openAddModalAndFill('rascunho@exemplo.com');
    fireEvent.click(screen.getByTestId('client-extra-emails-add-cancel'));

    // Modal fecha — input não fica no DOM.
    await waitFor(() => {
      expect(
        screen.queryByTestId('client-extra-emails-add-email'),
      ).not.toBeInTheDocument();
    });

    // Reabrir mostra input vazio (descartou rascunho).
    fireEvent.click(screen.getByTestId('client-extra-emails-add'));
    expect(
      (screen.getByTestId('client-extra-emails-add-email') as HTMLInputElement).value,
    ).toBe('');
  });
});

describe('ClientExtraEmailsTab — remover email (Issue #146)', () => {
  it('clicar em "Remover" por linha abre confirmação com email em destaque', async () => {
    await setupSingleEmailRemoveConfirm();

    const description = screen.getByTestId(
      'client-extra-emails-remove-description',
    );
    expect(description).toBeInTheDocument();
    // O email aparece em destaque dentro da descrição do confirm.
    expect(description).toHaveTextContent('a@exemplo.com');
    expect(
      screen.getByTestId('client-extra-emails-remove-confirm'),
    ).toBeInTheDocument();
  });

  it('confirmar remoção envia DELETE /clients/{id}/emails/{emailId} e dispara refetch', async () => {
    const scene = setupSingleEmailScene();
    scene.client.delete.mockResolvedValueOnce(undefined);
    scene.client.get.mockResolvedValueOnce(makeClient({ extraEmails: [] }));

    renderClientExtraEmailsTab(scene.client);
    await waitForLoaded();

    fireEvent.click(
      screen.getByTestId(`client-extra-emails-remove-${scene.email.id}`),
    );
    fireEvent.click(screen.getByTestId('client-extra-emails-remove-confirm'));

    await waitFor(() => expect(scene.client.delete).toHaveBeenCalledTimes(1));
    expect(scene.client.delete).toHaveBeenCalledWith(
      `/clients/${ID_CLIENT_PF_ANA}/emails/${scene.email.id}`,
      undefined,
    );
    expect(await screen.findByText('Email extra removido.')).toBeInTheDocument();
    // Refetch — a lista volta vazia.
    await waitFor(() => expect(scene.client.get).toHaveBeenCalledTimes(2));
  });

  it('400 ao remover (email é username) dispara toast vermelho orientador', async () => {
    const scene = setupSingleEmailScene();
    scene.client.delete.mockRejectedValueOnce({
      kind: 'http',
      status: 400,
      message:
        'Não é permitido remover email que esteja sendo usado como username.',
    });

    renderClientExtraEmailsTab(scene.client);
    await waitForLoaded();

    fireEvent.click(
      screen.getByTestId(`client-extra-emails-remove-${scene.email.id}`),
    );
    fireEvent.click(screen.getByTestId('client-extra-emails-remove-confirm'));

    expect(
      await screen.findByText(
        'Não é permitido remover email que esteja sendo usado como username.',
      ),
    ).toBeInTheDocument();
  });

  it('cancelar remoção fecha o modal sem chamar DELETE', async () => {
    const scene = await setupSingleEmailRemoveConfirm();

    fireEvent.click(screen.getByTestId('client-extra-emails-remove-cancel'));

    await waitFor(() => {
      expect(
        screen.queryByTestId('client-extra-emails-remove-confirm'),
      ).not.toBeInTheDocument();
    });
    expect(scene.client.delete).not.toHaveBeenCalled();
  });
});

describe('ClientExtraEmailsTab — gating Clients.Update (Issue #146)', () => {
  it('sem AUTH_V1_CLIENTS_UPDATE oculta botão "Adicionar" e botões "Remover" por linha', async () => {
    permissionsMock = [];
    const scene = setupSingleEmailScene();

    renderClientExtraEmailsTab(scene.client);
    await waitForLoaded();

    // Lista permanece visível (auditoria).
    expect(
      screen.getByTestId(`client-extra-emails-row-${scene.email.id}`),
    ).toBeInTheDocument();
    // Botão de adicionar e remover ausentes.
    expect(
      screen.queryByTestId('client-extra-emails-add'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`client-extra-emails-remove-${scene.email.id}`),
    ).not.toBeInTheDocument();
  });
});
