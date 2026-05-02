import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `buildAuthMock` precisa ser importado **antes** de
// `clientsTestHelpers` para que `vi.mock('@/shared/auth', ...)`
// consiga resolver a factory durante o hoisting — sem isso, o teste
// falha com `Cannot access '__vi_import_2__' before initialization`
// porque o `clientsTestHelpers` carrega `ClientsListShellPage`, que
// importa `@/shared/auth` (o alvo do mock), antes de `buildAuthMock`
// estar definido. Quebra a ordem alfabética de `import/order` por
// necessidade de hoisting — espelha `SystemsPage.test.tsx`.
/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  buildClientsSubmitErrorCases,
  createClientsClientStub,
  fillNewClientPfForm,
  fillNewClientPjForm,
  ID_CLIENT_PF_ANA,
  ID_CLIENT_PJ_ACME,
  makeClient,
  makeClientPj,
  makePagedClientsResponse,
  openCreateClientModal,
  renderClientsListPage,
  selectClientType,
  submitNewClientForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from '../__helpers__/clientsTestHelpers';
/* eslint-enable import/order */

import type { ClientsErrorCase } from '../__helpers__/clientsTestHelpers';

/**
 * Suíte do `NewClientModal` (Issue #74, EPIC #49 — criação de
 * cliente PF/PJ). Estratégia espelha `SystemsPage.create.test.tsx`/
 * `RolesPage.edit.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory) para alternar a permissão `AUTH_V1_CLIENTS_CREATE`
 *   entre testes sem reordenar imports.
 * - Stub de `ApiClient` injetado em `<ClientsListShellPage client={stub} />`,
 *   isolando a página da camada de transporte real.
 * - Helpers em `clientsTestHelpers.tsx` para colapsar o boilerplate
 *   "abrir modal → preencher → submeter" e evitar `New Code
 *   Duplication` no Sonar (lição PR #134).
 *
 * Cobre:
 *
 * - Gating do botão "Novo cliente" pela permissão `AUTH_V1_CLIENTS_CREATE`.
 * - Abertura/fechamento do modal (Esc, botão Cancelar, backdrop).
 * - Validação client-side de CPF/CNPJ (formato, dígitos verificadores,
 *   sequências repetidas).
 * - Validação client-side de FullName/CorporateName (vazio, whitespace).
 * - Submissão bem-sucedida PF e PJ (body normalizado, refetch, toast).
 * - Tratamento de erros do backend (409, 400, 401, 403, network).
 */

let permissionsMock: ReadonlyArray<string> = ['AUTH_V1_CLIENTS_LIST'];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const CLIENTS_CREATE_PERMISSION = 'AUTH_V1_CLIENTS_CREATE';

beforeEach(() => {
  permissionsMock = ['AUTH_V1_CLIENTS_LIST'];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('NewClientModal — criação (Issue #74)', () => {
  describe('gating do botão "Novo cliente"', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_CLIENTS_CREATE', async () => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST'];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(makePagedClientsResponse([makeClient()]));

      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('clients-create-open')).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_CLIENTS_CREATE', async () => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(makePagedClientsResponse([makeClient()]));

      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId('clients-create-open')).toBeInTheDocument();
      expect(screen.getByTestId('clients-create-open')).toHaveTextContent(/Novo cliente/i);
    });
  });

  describe('abertura e fechamento do modal', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('clicar em "Novo cliente" abre o diálogo com o select de tipo e os campos PF iniciais', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('new-client-type')).toBeInTheDocument();
      // Default PF — campos PF visíveis, PJ ausentes.
      expect(screen.getByTestId('new-client-cpf')).toBeInTheDocument();
      expect(screen.getByTestId('new-client-fullName')).toBeInTheDocument();
      expect(screen.queryByTestId('new-client-cnpj')).not.toBeInTheDocument();
      expect(screen.queryByTestId('new-client-corporateName')).not.toBeInTheDocument();
    });

    it('alternar para PJ remove campos PF do DOM e exibe campos PJ', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      selectClientType('PJ');

      expect(screen.queryByTestId('new-client-cpf')).not.toBeInTheDocument();
      expect(screen.queryByTestId('new-client-fullName')).not.toBeInTheDocument();
      expect(screen.getByTestId('new-client-cnpj')).toBeInTheDocument();
      expect(screen.getByTestId('new-client-corporateName')).toBeInTheDocument();
    });

    /**
     * Cenários de fechamento sem persistir — Esc, botão Cancelar e
     * clique no backdrop. Colapsados em `it.each` (lição PR #123 — a
     * mesma estrutura mudando apenas 1 ação dispara duplicação Sonar
     * quando deixada como `it` separados).
     */
    const CLOSE_CASES: ReadonlyArray<{ name: string; close: () => void }> = [
      {
        name: 'Esc',
        // eslint-disable-next-line no-restricted-globals
        close: () => fireEvent.keyDown(window, { key: 'Escape' }),
      },
      {
        name: 'botão Cancelar',
        close: () => fireEvent.click(screen.getByTestId('new-client-cancel')),
      },
      {
        name: 'clique no backdrop',
        close: () => fireEvent.mouseDown(screen.getByTestId('modal-backdrop')),
      },
    ];

    it.each(CLOSE_CASES)('fechar via $name não dispara POST', async ({ close }) => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side — PF', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('submeter com campos vazios mostra erros inline e não chama POST', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CPF é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('FullName é obrigatório para cliente PF.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CPF com menos de 11 dígitos é inválido', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      fillNewClientPfForm({ cpf: '123', fullName: 'Ana' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CPF inválido para cliente PF.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CPF com todos os dígitos iguais é inválido', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      fillNewClientPfForm({ cpf: '11111111111', fullName: 'Ana' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CPF inválido para cliente PF.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CPF com dígitos verificadores incorretos é inválido', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      // 11 dígitos não-iguais com DVs errados (12345678900 — DVs corretos seriam diferentes).
      fillNewClientPfForm({ cpf: '12345678900', fullName: 'Ana' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CPF inválido para cliente PF.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CPF formatado com pontos/traço é aceito (normalizado para apenas dígitos)', async () => {
      const created = makeClient({
        id: ID_CLIENT_PF_ANA,
        type: 'PF',
        cpf: '52998224725',
        fullName: 'Ana Cliente',
      });
      const client = createClientsClientStub();
      // 52998224725 é um CPF válido (DVs corretos).
      client.post.mockResolvedValueOnce(created);

      await openCreateClientModal(client);

      fillNewClientPfForm({ cpf: '529.982.247-25', fullName: 'Ana Cliente' });
      await submitNewClientForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/clients',
        {
          type: 'PF',
          cpf: '52998224725',
          fullName: 'Ana Cliente',
        },
        undefined,
      );
    });

    it('FullName apenas whitespace é tratado como vazio', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      fillNewClientPfForm({ cpf: '52998224725', fullName: '   ' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('FullName é obrigatório para cliente PF.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side — PJ', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('submeter com campos vazios em PJ mostra erros inline e não chama POST', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      selectClientType('PJ');
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CNPJ é obrigatório.')).toBeInTheDocument();
      expect(
        screen.getByText('CorporateName é obrigatório para cliente PJ.'),
      ).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CNPJ com menos de 14 dígitos é inválido', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      selectClientType('PJ');
      fillNewClientPjForm({ cnpj: '123', corporateName: 'Acme' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CNPJ inválido para cliente PJ.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CNPJ com todos os dígitos iguais é inválido', async () => {
      const client = createClientsClientStub();
      await openCreateClientModal(client);

      selectClientType('PJ');
      fillNewClientPjForm({ cnpj: '11111111111111', corporateName: 'Acme' });
      fireEvent.submit(screen.getByTestId('new-client-form'));

      expect(screen.getByText('CNPJ inválido para cliente PJ.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('CNPJ formatado é aceito (normalizado para apenas dígitos)', async () => {
      const created = makeClientPj({
        id: ID_CLIENT_PJ_ACME,
        cnpj: '11222333000181',
        corporateName: 'Acme Indústria S/A',
      });
      const client = createClientsClientStub();
      // 11222333000181 é um CNPJ válido (DVs corretos).
      client.post.mockResolvedValueOnce(created);

      await openCreateClientModal(client);

      selectClientType('PJ');
      fillNewClientPjForm({
        cnpj: '11.222.333/0001-81',
        corporateName: 'Acme Indústria S/A',
      });
      await submitNewClientForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/clients',
        {
          type: 'PJ',
          cnpj: '11222333000181',
          corporateName: 'Acme Indústria S/A',
        },
        undefined,
      );
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('envia POST /clients (PF) com body trimado, fecha modal, exibe toast e refaz listClients', async () => {
      // `created` usa um id sintético distinto do `makeClient()`
      // default (`ID_CLIENT_PF_ANA`) para que o refetch da lista
      // tenha duas linhas com keys distintas — React rejeita keys
      // duplicadas com warning "two children with the same key".
      const created = makeClient({
        id: '99999999-9999-9999-9999-999999999999',
        type: 'PF',
        cpf: '52998224725',
        fullName: 'Ana Cliente',
      });
      const client = createClientsClientStub();
      client.get
        .mockResolvedValueOnce(makePagedClientsResponse([makeClient()]))
        .mockResolvedValueOnce(makePagedClientsResponse([makeClient(), created]));
      client.post.mockResolvedValueOnce(created);

      await openCreateClientModal(client);

      fillNewClientPfForm({
        cpf: '  52998224725  ',
        fullName: '  Ana Cliente  ',
      });
      await submitNewClientForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/clients',
        {
          type: 'PF',
          cpf: '52998224725',
          fullName: 'Ana Cliente',
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Cliente criado.".
      expect(await screen.findByText('Cliente criado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it('envia POST /clients (PJ) com body trimado e omite campos do tipo oposto', async () => {
      const created = makeClientPj({
        id: ID_CLIENT_PJ_ACME,
        cnpj: '11222333000181',
        corporateName: 'Acme Indústria S/A',
      });
      const client = createClientsClientStub();
      client.post.mockResolvedValueOnce(created);

      await openCreateClientModal(client);

      // Garantir que se o usuário digitar em PF antes (testando fluxo
      // de troca PF→PJ→submit), o submit ainda omite campos PF.
      fillNewClientPfForm({ cpf: '12345', fullName: 'Resíduo PF' });
      selectClientType('PJ');
      fillNewClientPjForm({
        cnpj: '11.222.333/0001-81',
        corporateName: 'Acme Indústria S/A',
      });
      await submitNewClientForm(client);

      const [path, body] = client.post.mock.calls[0];
      expect(path).toBe('/clients');
      expect(body).toEqual({
        type: 'PJ',
        cnpj: '11222333000181',
        corporateName: 'Acme Indústria S/A',
      });
      expect(body).not.toHaveProperty('cpf');
      expect(body).not.toHaveProperty('fullName');
    });
  });

  describe('tratamento de erros do backend — PF', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('409 (CPF duplicado) exibe mensagem inline no campo cpf', async () => {
      const client = createClientsClientStub();
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 409,
        message: 'Já existe cliente com este CPF.',
      });

      await openCreateClientModal(client);
      fillNewClientPfForm({ cpf: '52998224725', fullName: 'Ana Cliente' });
      await submitNewClientForm(client);

      expect(
        await screen.findByText(toCaseInsensitiveMatcher('Já existe cliente com este CPF.')),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    /**
     * Cenários comuns colapsados em `it.each`. Mesma estrutura,
     * mudando apenas o `error` retornado e o texto esperado — Sonar
     * marca como duplicação se ficassem como `it` separados (lição PR
     * #123).
     */
    const ERROR_CASES: ReadonlyArray<ClientsErrorCase> = buildClientsSubmitErrorCases();

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createClientsClientStub();
        client.post.mockRejectedValueOnce(error);

        await openCreateClientModal(client);
        fillNewClientPfForm({ cpf: '52998224725', fullName: 'Ana Cliente' });
        await submitNewClientForm(client);

        expect(
          await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
        ).toBeInTheDocument();

        if (modalStaysOpen) {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        }
      },
    );
  });

  describe('tratamento de erros do backend — PJ', () => {
    beforeEach(() => {
      permissionsMock = ['AUTH_V1_CLIENTS_LIST', CLIENTS_CREATE_PERMISSION];
    });

    it('409 (CNPJ duplicado) exibe mensagem inline no campo cnpj', async () => {
      const client = createClientsClientStub();
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 409,
        message: 'Já existe cliente com este CNPJ.',
      });

      await openCreateClientModal(client);
      selectClientType('PJ');
      fillNewClientPjForm({
        cnpj: '11222333000181',
        corporateName: 'Acme Indústria S/A',
      });
      await submitNewClientForm(client);

      expect(
        await screen.findByText(toCaseInsensitiveMatcher('Já existe cliente com este CNPJ.')),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
