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
  makeClientPhone,
  submitAddPhoneForm,
} from '../__helpers__/clientsTestHelpers';
import type { ApiClientStub } from '../__helpers__/clientsTestHelpers';
import { ToastProvider } from '@/components/ui';
import {
  ClientPhonesTab,
  type ClientPhoneKind,
} from '@/pages/clients/ClientPhonesTab';
/* eslint-enable import/order */

/**
 * Suíte do `ClientPhonesTab` (Issue #147 — gerenciar celulares e
 * telefones fixos).
 *
 * Estratégia espelha `ClientExtraEmailsTab.test.tsx`:
 *
 * - Mock controlável de `useAuth` para alternar `AUTH_V1_CLIENTS_UPDATE`
 *   entre testes.
 * - Stub de `ApiClient` injetado em
 *   `<ClientPhonesTab kind={kind} client={stub} />`, isolando da
 *   camada de transporte real.
 * - Testes parametrizados por `kind` (`mobile` | `landline`) via
 *   `describe.each` — uma única suíte cobre as duas variantes,
 *   trocando endpoint/copy/coleção pelo `KIND_CONFIG`. Lição PR
 *   #128/#134/#135 — quando o mesmo componente é renderizado com
 *   variações de prop, parametrizar a suíte evita duplicação Sonar
 *   entre arquivos paralelos por aba.
 *
 * Cobre (critérios da issue):
 *
 * - Lista os telefones existentes (vindos em `ClientResponse.mobilePhones`/
 *   `landlinePhones`).
 * - Botão "Adicionar" abre modal com input + validação client-side
 *   E.164.
 * - Botão de remover por linha; confirmação antes.
 * - Mapeamento dos erros do backend (400 limite, 400 inválido, 409
 *   duplicado, 404).
 * - Refetch após sucesso.
 * - Botão "Adicionar" desabilitado quando lista atinge 3.
 * - Visível com `Clients.Update` (modo readonly sem permissão).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

setupPermissionLifecycle((perms) => {
  permissionsMock = perms;
}, [CLIENTS_UPDATE_PERMISSION]);

/**
 * Configuração por aba — endpoint POST/DELETE, prefixo de testId,
 * mensagens de limite/duplicado, coleção alvo no `ClientDto`. A suíte
 * itera sobre essa tabela com `describe.each` para cobrir as duas
 * variantes sem duplicar 100+ linhas de testes paralelos.
 *
 * Espelha o `PHONE_KIND_CONFIG` da implementação mas só com o que a
 * suíte precisa — endpoint, prefix, copy de toast/limit, e a chave da
 * coleção do `ClientDto` para que o stub do GET preencha o array
 * correto.
 */
interface KindConfig {
  kind: ClientPhoneKind;
  testIdPrefix: string;
  endpointAdd: string;
  endpointRemoveSuffix: string;
  collectionKey: 'mobilePhones' | 'landlinePhones';
  addSuccessToast: string;
  removeSuccessToast: string;
  limitMessage: string;
  emptyTitle: string;
  limitAlertText: RegExp;
  addButtonName: RegExp;
}

const KIND_CONFIGS: ReadonlyArray<KindConfig> = [
  {
    kind: 'mobile',
    testIdPrefix: 'client-mobile-phones',
    endpointAdd: `/clients/${ID_CLIENT_PF_ANA}/mobiles`,
    endpointRemoveSuffix: 'mobiles',
    collectionKey: 'mobilePhones',
    addSuccessToast: 'Celular adicionado.',
    removeSuccessToast: 'Celular removido.',
    limitMessage: 'Limite de 3 celulares por cliente.',
    emptyTitle: 'Nenhum celular cadastrado',
    limitAlertText: /Limite de 3 celulares atingido/i,
    addButtonName: /Adicionar celular/i,
  },
  {
    kind: 'landline',
    testIdPrefix: 'client-landline-phones',
    endpointAdd: `/clients/${ID_CLIENT_PF_ANA}/phones`,
    endpointRemoveSuffix: 'phones',
    collectionKey: 'landlinePhones',
    addSuccessToast: 'Telefone adicionado.',
    removeSuccessToast: 'Telefone removido.',
    limitMessage: 'Limite de 3 telefones por cliente.',
    emptyTitle: 'Nenhum telefone fixo cadastrado',
    limitAlertText: /Limite de 3 telefones fixos atingido/i,
    addButtonName: /Adicionar telefone/i,
  },
];

/**
 * Renderiza o `ClientPhonesTab` num `<MemoryRouter>` com a rota
 * `/clientes/:id` para que `useParams` devolva o `id` esperado.
 */
function renderClientPhonesTab(
  kind: ClientPhoneKind,
  client: ApiClientStub,
  initialEntries: ReadonlyArray<string> = [`/clientes/${ID_CLIENT_PF_ANA}`],
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[...initialEntries]}>
        <Routes>
          <Route
            path="/clientes/:id"
            element={<ClientPhonesTab kind={kind} client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda o fetch inicial completar (loading some, conteúdo aparece).
 */
async function waitForLoaded(testIdPrefix: string): Promise<void> {
  await waitFor(() => {
    expect(
      screen.queryByTestId(`${testIdPrefix}-loading`),
    ).not.toBeInTheDocument();
  });
}

/**
 * Abre o modal de adicionar e preenche o input com `value`. O modal
 * abre via clique no botão "Adicionar", que precisa estar habilitado
 * (cliente abaixo do limite) — caller garante isso via mock do
 * `getClientById`.
 */
function openAddModalAndFill(testIdPrefix: string, value: string): void {
  fireEvent.click(screen.getByTestId(`${testIdPrefix}-add`));
  fireEvent.change(screen.getByTestId(`${testIdPrefix}-add-number`), {
    target: { value },
  });
}

/**
 * Constrói um cliente com 1 telefone do tipo correto pré-cadastrado
 * e configura o stub para devolver esse cliente no GET inicial.
 * Centralizar evita repetir o trio "makeClientPhone + makeClient +
 * mockResolvedValueOnce" em cada teste de remoção.
 */
function setupSinglePhoneScene(config: KindConfig): {
  client: ApiClientStub;
  phone: ReturnType<typeof makeClientPhone>;
} {
  const phone = makeClientPhone({
    id: 'p0000000-0000-0000-0000-0000000000aa',
    number: '+5518981789845',
  });
  const dto = makeClient({ [config.collectionKey]: [phone] });
  const client = createClientsClientStub();
  client.get.mockResolvedValueOnce(dto);
  return { client, phone };
}

/**
 * Variante de `setupSinglePhoneScene` que abre a confirmação de
 * remoção logo após o load. Usado pelos testes que disparam ações
 * subsequentes (confirm, cancel, error).
 */
async function setupSinglePhoneRemoveConfirm(config: KindConfig): Promise<{
  client: ApiClientStub;
  phone: ReturnType<typeof makeClientPhone>;
}> {
  const scene = setupSinglePhoneScene(config);
  renderClientPhonesTab(config.kind, scene.client);
  await waitForLoaded(config.testIdPrefix);
  fireEvent.click(
    screen.getByTestId(`${config.testIdPrefix}-remove-${scene.phone.id}`),
  );
  return scene;
}

/* ─── Suíte parametrizada por kind (mobile/landline) ──────── */

describe.each(KIND_CONFIGS)(
  'ClientPhonesTab — kind=$kind (Issue #147)',
  (config) => {
    describe('fetch inicial e estados visuais', () => {
      it('exibe spinner durante o GET /clients/{id}', () => {
        const client = createClientsClientStub();
        client.get.mockReturnValueOnce(new Promise(() => {
          // intencional: nunca resolve
        }));

        renderClientPhonesTab(config.kind, client);

        expect(
          screen.getByTestId(`${config.testIdPrefix}-loading`),
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

        renderClientPhonesTab(config.kind, client);

        expect(
          await screen.findByTestId(`${config.testIdPrefix}-retry`),
        ).toBeInTheDocument();
        expect(
          screen.getByText('Não foi possível carregar os dados do cliente.'),
        ).toBeInTheDocument();
      });

      it('clicar em "Tentar novamente" refaz o GET', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockRejectedValueOnce({
          kind: 'network',
          message: 'Falha.',
        });
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        const retryBtn = await screen.findByTestId(
          `${config.testIdPrefix}-retry`,
        );
        fireEvent.click(retryBtn);

        await waitForLoaded(config.testIdPrefix);
        expect(client.get).toHaveBeenCalledTimes(2);
      });

      it('renderiza empty state quando o cliente não tem telefones', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        expect(
          screen.getByTestId(`${config.testIdPrefix}-empty`),
        ).toBeInTheDocument();
        expect(screen.getByText(config.emptyTitle)).toBeInTheDocument();
        expect(
          screen.getByTestId(`${config.testIdPrefix}-counter`),
        ).toHaveTextContent('0 de 3 cadastrados');
      });

      it('renderiza linha por telefone retornado em ClientResponse', async () => {
        const phoneA = makeClientPhone({
          id: 'p0000000-0000-0000-0000-0000000000aa',
          number: '+5518981789845',
        });
        const phoneB = makeClientPhone({
          id: 'p0000000-0000-0000-0000-0000000000bb',
          number: '+551832345678',
        });
        const dto = makeClient({ [config.collectionKey]: [phoneA, phoneB] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        expect(
          screen.getByTestId(`${config.testIdPrefix}-row-${phoneA.id}`),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId(`${config.testIdPrefix}-row-${phoneB.id}`),
        ).toBeInTheDocument();
        expect(screen.getByText('+5518981789845')).toBeInTheDocument();
        expect(screen.getByText('+551832345678')).toBeInTheDocument();
        expect(
          screen.getByTestId(`${config.testIdPrefix}-counter`),
        ).toHaveTextContent('2 de 3 cadastrados');
      });
    });

    describe('adicionar telefone', () => {
      it('botão "Adicionar" abre o modal com input vazio', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        fireEvent.click(screen.getByTestId(`${config.testIdPrefix}-add`));

        const input = screen.getByTestId(
          `${config.testIdPrefix}-add-number`,
        ) as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe('');
      });

      it('número com formato inválido bloqueia submit e exibe erro inline (sem +)', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '18981789845');
        fireEvent.submit(
          screen.getByTestId(`${config.testIdPrefix}-add-form`),
        );

        expect(
          screen.getByText(
            'Use o formato internacional com DDI e DDD, ex.: +5518981789845.',
          ),
        ).toBeInTheDocument();
        expect(client.post).not.toHaveBeenCalled();
      });

      it('input vazio (whitespace) bloqueia submit e exibe erro inline', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '   ');
        fireEvent.submit(
          screen.getByTestId(`${config.testIdPrefix}-add-form`),
        );

        expect(screen.getByText('Número é obrigatório.')).toBeInTheDocument();
        expect(client.post).not.toHaveBeenCalled();
      });

      it('submit válido envia POST no endpoint correto com body trimado', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const updated = makeClient({
          [config.collectionKey]: [
            makeClientPhone({ number: '+5518981789845' }),
          ],
        });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);
        client.post.mockResolvedValueOnce(
          makeClientPhone({ number: '+5518981789845' }),
        );
        client.get.mockResolvedValueOnce(updated);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '  +5518981789845  ');
        await submitAddPhoneForm(client, config.testIdPrefix);

        expect(client.post).toHaveBeenCalledWith(
          config.endpointAdd,
          { number: '+5518981789845' },
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(
          await screen.findByText(config.addSuccessToast),
        ).toBeInTheDocument();
      });

      it('botão "Adicionar" fica desabilitado quando o cliente já tem 3 telefones', async () => {
        const dto = makeClient({
          [config.collectionKey]: [
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a1',
              number: '+5518981789801',
            }),
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a2',
              number: '+5518981789802',
            }),
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a3',
              number: '+5518981789803',
            }),
          ],
        });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        expect(
          screen.getByTestId(`${config.testIdPrefix}-add`),
        ).toBeDisabled();
        // Aviso visual reforça a condição.
        expect(screen.getByText(config.limitAlertText)).toBeInTheDocument();
      });

      it('400 "Limite de 3..." (race) exibe inline e dispara refetch', async () => {
        // UI mostra 2 telefones (abaixo do limite), operador abre modal,
        // mas no momento do submit o backend já tem 3 (outra sessão).
        const dto = makeClient({
          [config.collectionKey]: [
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a1',
              number: '+5518981789801',
            }),
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a2',
              number: '+5518981789802',
            }),
          ],
        });
        const dtoFull = makeClient({
          [config.collectionKey]: [
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a1',
              number: '+5518981789801',
            }),
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a2',
              number: '+5518981789802',
            }),
            makeClientPhone({
              id: 'p0000000-0000-0000-0000-0000000000a3',
              number: '+5518981789803',
            }),
          ],
        });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);
        client.post.mockRejectedValueOnce({
          kind: 'http',
          status: 400,
          message: config.limitMessage,
        });
        client.get.mockResolvedValueOnce(dtoFull);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '+5518981789804');
        await submitAddPhoneForm(client, config.testIdPrefix);

        expect(
          await screen.findByText(config.limitMessage),
        ).toBeInTheDocument();
        // Refetch foi disparado (2 GETs no total).
        await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
      });

      it('400 "Telefone inválido..." (defensivo) exibe mensagem inline', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);
        client.post.mockRejectedValueOnce({
          kind: 'http',
          status: 400,
          message:
            'Telefone inválido. Use o formato internacional com DDI e DDD, ex.: +5518981789845.',
        });

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        // Burlamos a validação client-side com um número que casa a regex
        // para forçar o servidor a rejeitar — isso garante que o branch
        // do `inline` (sem "limite") seja exercitado mesmo quando a UI
        // já filtra antes.
        openAddModalAndFill(config.testIdPrefix, '+5518981789845');
        await submitAddPhoneForm(client, config.testIdPrefix);

        expect(
          await screen.findByText(
            /Telefone inválido. Use o formato internacional/i,
          ),
        ).toBeInTheDocument();
      });

      it('409 "Contato já cadastrado" exibe mensagem inline no input', async () => {
        const dto = makeClient({
          [config.collectionKey]: [
            makeClientPhone({ number: '+5518981789845' }),
          ],
        });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);
        client.post.mockRejectedValueOnce({
          kind: 'http',
          status: 409,
          message: 'Contato já cadastrado para este cliente.',
        });

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '+5518981789845');
        await submitAddPhoneForm(client, config.testIdPrefix);

        expect(
          await screen.findByText(
            'Contato já cadastrado para este cliente.',
          ),
        ).toBeInTheDocument();
        // Modal continua aberto.
        expect(
          screen.getByTestId(`${config.testIdPrefix}-add-number`),
        ).toBeInTheDocument();
      });

      it('cancelar fecha o modal e descarta o input', async () => {
        const dto = makeClient({ [config.collectionKey]: [] });
        const client = createClientsClientStub();
        client.get.mockResolvedValueOnce(dto);

        renderClientPhonesTab(config.kind, client);
        await waitForLoaded(config.testIdPrefix);

        openAddModalAndFill(config.testIdPrefix, '+5518981789845');
        fireEvent.click(
          screen.getByTestId(`${config.testIdPrefix}-add-cancel`),
        );

        // Modal fecha — input não fica no DOM.
        await waitFor(() => {
          expect(
            screen.queryByTestId(`${config.testIdPrefix}-add-number`),
          ).not.toBeInTheDocument();
        });

        // Reabrir mostra input vazio (descartou rascunho).
        fireEvent.click(screen.getByTestId(`${config.testIdPrefix}-add`));
        expect(
          (
            screen.getByTestId(
              `${config.testIdPrefix}-add-number`,
            ) as HTMLInputElement
          ).value,
        ).toBe('');
      });
    });

    describe('remover telefone', () => {
      it('clicar em "Remover" por linha abre confirmação com número em destaque', async () => {
        await setupSinglePhoneRemoveConfirm(config);

        const description = screen.getByTestId(
          `${config.testIdPrefix}-remove-description`,
        );
        expect(description).toBeInTheDocument();
        expect(description).toHaveTextContent('+5518981789845');
        expect(
          screen.getByTestId(`${config.testIdPrefix}-remove-confirm`),
        ).toBeInTheDocument();
      });

      it('confirmar remoção envia DELETE no endpoint correto e dispara refetch', async () => {
        const scene = setupSinglePhoneScene(config);
        scene.client.delete.mockResolvedValueOnce(undefined);
        scene.client.get.mockResolvedValueOnce(
          makeClient({ [config.collectionKey]: [] }),
        );

        renderClientPhonesTab(config.kind, scene.client);
        await waitForLoaded(config.testIdPrefix);

        fireEvent.click(
          screen.getByTestId(
            `${config.testIdPrefix}-remove-${scene.phone.id}`,
          ),
        );
        fireEvent.click(
          screen.getByTestId(`${config.testIdPrefix}-remove-confirm`),
        );

        await waitFor(() =>
          expect(scene.client.delete).toHaveBeenCalledTimes(1),
        );
        expect(scene.client.delete).toHaveBeenCalledWith(
          `/clients/${ID_CLIENT_PF_ANA}/${config.endpointRemoveSuffix}/${scene.phone.id}`,
          undefined,
        );
        expect(
          await screen.findByText(config.removeSuccessToast),
        ).toBeInTheDocument();
        // Refetch — a lista volta vazia.
        await waitFor(() => expect(scene.client.get).toHaveBeenCalledTimes(2));
      });

      it('404 ao remover (race com outra sessão) fecha modal + toast + refetch', async () => {
        const scene = setupSinglePhoneScene(config);
        scene.client.delete.mockRejectedValueOnce({
          kind: 'http',
          status: 404,
          message: 'Contato não encontrado.',
        });
        scene.client.get.mockResolvedValueOnce(
          makeClient({ [config.collectionKey]: [] }),
        );

        renderClientPhonesTab(config.kind, scene.client);
        await waitForLoaded(config.testIdPrefix);

        fireEvent.click(
          screen.getByTestId(
            `${config.testIdPrefix}-remove-${scene.phone.id}`,
          ),
        );
        fireEvent.click(
          screen.getByTestId(`${config.testIdPrefix}-remove-confirm`),
        );

        // Toast aparece com a mensagem `notFoundMessage` da config.
        expect(
          await screen.findByText(/já havia sido removido/i),
        ).toBeInTheDocument();
        // Modal fecha.
        await waitFor(() => {
          expect(
            screen.queryByTestId(
              `${config.testIdPrefix}-remove-confirm`,
            ),
          ).not.toBeInTheDocument();
        });
      });

      it('cancelar remoção fecha o modal sem chamar DELETE', async () => {
        const scene = await setupSinglePhoneRemoveConfirm(config);

        fireEvent.click(
          screen.getByTestId(`${config.testIdPrefix}-remove-cancel`),
        );

        await waitFor(() => {
          expect(
            screen.queryByTestId(
              `${config.testIdPrefix}-remove-confirm`,
            ),
          ).not.toBeInTheDocument();
        });
        expect(scene.client.delete).not.toHaveBeenCalled();
      });
    });

    describe('gating Clients.Update', () => {
      it('sem AUTH_V1_CLIENTS_UPDATE oculta botões Adicionar e Remover', async () => {
        permissionsMock = [];
        const scene = setupSinglePhoneScene(config);

        renderClientPhonesTab(config.kind, scene.client);
        await waitForLoaded(config.testIdPrefix);

        // Lista permanece visível (auditoria).
        expect(
          screen.getByTestId(
            `${config.testIdPrefix}-row-${scene.phone.id}`,
          ),
        ).toBeInTheDocument();
        // Botões de adicionar e remover ausentes.
        expect(
          screen.queryByTestId(`${config.testIdPrefix}-add`),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId(
            `${config.testIdPrefix}-remove-${scene.phone.id}`,
          ),
        ).not.toBeInTheDocument();
      });
    });
  },
);

/* ─── Smoke test do botão renderizado por kind ──────────── */

describe('ClientPhonesTab — diferenças de label entre kinds', () => {
  it('mobile renderiza "Adicionar celular"', async () => {
    const dto = makeClient({ mobilePhones: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientPhonesTab('mobile', client);
    await waitForLoaded('client-mobile-phones');

    expect(
      screen.getByRole('button', { name: /Adicionar celular/i }),
    ).toBeInTheDocument();
  });

  it('landline renderiza "Adicionar telefone"', async () => {
    const dto = makeClient({ landlinePhones: [] });
    const client = createClientsClientStub();
    client.get.mockResolvedValueOnce(dto);

    renderClientPhonesTab('landline', client);
    await waitForLoaded('client-landline-phones');

    expect(
      screen.getByRole('button', { name: /Adicionar telefone/i }),
    ).toBeInTheDocument();
  });
});
