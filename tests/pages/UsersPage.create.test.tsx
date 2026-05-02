import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  createUsersClientStub,
  fillNewUserForm,
  ID_CLIENT_ALPHA,
  makeUser,
  makeUsersPagedResponse,
  openCreateUserModal,
  renderUsersPage,
  submitNewUserForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
  type UsersErrorCase,
} from './__helpers__/usersTestHelpers';

/**
 * Suíte da `UsersListShellPage` — criação (Issue #78, EPIC #49).
 *
 * Espelha `SystemsPage.create.test.tsx` e `RoutesPage.create.test.tsx`:
 * cobre gating do CTA, abertura/fechamento do modal, validação client-
 * side, submissão bem-sucedida, e cenários de erro do backend (409,
 * 400 com errors, 400 sem errors, 401/403, network).
 *
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_USERS_CREATE`.
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const USERS_CREATE_PERMISSION = 'AUTH_V1_USERS_CREATE';
const VALID_CLIENT_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('UsersListShellPage — criação (Issue #78)', () => {
  describe('gating do botão "Novo usuário"', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_USERS_CREATE', async () => {
      permissionsMock = [];
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('users-create-open')).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_USERS_CREATE', async () => {
      permissionsMock = [USERS_CREATE_PERMISSION];
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId('users-create-open')).toBeInTheDocument();
      expect(screen.getByTestId('users-create-open')).toHaveTextContent(/Novo usuário/i);
    });
  });

  describe('abertura e fechamento do modal', () => {
    beforeEach(() => {
      permissionsMock = [USERS_CREATE_PERMISSION];
    });

    it('clicar em "Novo usuário" abre o diálogo com os campos do form', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-name')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-email')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-password')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-identity')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-client-id')).toBeInTheDocument();
      expect(screen.getByTestId('new-user-active')).toBeInTheDocument();
    });

    it('Esc fecha o modal sem persistir', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // eslint-disable-next-line no-restricted-globals
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('botão Cancelar fecha o modal sem persistir', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fireEvent.click(screen.getByTestId('new-user-cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [USERS_CREATE_PERMISSION];
    });

    it('submeter com campos vazios mostra erros inline e não chama POST', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fireEvent.submit(screen.getByTestId('new-user-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('E-mail é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Senha é obrigatória.')).toBeInTheDocument();
      expect(screen.getByText('Identity é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('email inválido bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'no-at',
        password: 'senha-forte-1',
        identity: '1',
      });
      fireEvent.submit(screen.getByTestId('new-user-form'));

      expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('senha menor que 8 chars bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'short',
        identity: '1',
      });
      fireEvent.submit(screen.getByTestId('new-user-form'));

      expect(screen.getByText('Senha deve ter ao menos 8 caracteres.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('identity não-inteiro bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1.5',
      });
      fireEvent.submit(screen.getByTestId('new-user-form'));

      expect(screen.getByText('Identity deve ser um número inteiro.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('clientId não-UUID bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1',
        clientId: 'abc',
      });
      fireEvent.submit(screen.getByTestId('new-user-form'));

      expect(screen.getByText('ClientId deve ser um UUID válido.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [USERS_CREATE_PERMISSION];
    });

    it('envia POST /users com body correto, fecha modal, exibe toast e refaz listUsers', async () => {
      const created = makeUser({
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Novo User',
        email: 'novo@example.com',
      });
      const client = createUsersClientStub();
      let usersGetCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          usersGetCalls += 1;
          if (usersGetCalls === 1) {
            return Promise.resolve(makeUsersPagedResponse([makeUser()]));
          }
          return Promise.resolve(makeUsersPagedResponse([makeUser(), created]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected: ${path}`));
      });
      client.post.mockResolvedValueOnce(created);

      await openCreateUserModal(client);

      fillNewUserForm({
        name: '  Novo User  ',
        email: '  novo@example.com  ',
        password: 'senha-forte-1',
        identity: '2',
        clientId: VALID_CLIENT_ID,
      });
      await submitNewUserForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/users',
        {
          name: 'Novo User',
          email: 'novo@example.com',
          password: 'senha-forte-1',
          identity: 2,
          clientId: VALID_CLIENT_ID,
          active: true,
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Usuário criado.".
      expect(await screen.findByText('Usuário criado.')).toBeInTheDocument();

      // Refetch da lista — ao menos 2 chamadas a `/users`.
      await waitFor(() => {
        expect(usersGetCalls).toBeGreaterThanOrEqual(2);
      });
    });

    it('envia body sem clientId quando o usuário deixa o campo vazio', async () => {
      const created = makeUser({ id: '88888888-8888-8888-8888-888888888888' });
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockResolvedValueOnce(created);

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Sem Cliente',
        email: 'sem-cliente@example.com',
        password: 'senha-forte-1',
        identity: '0',
      });
      await submitNewUserForm(client);

      const body = client.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body).not.toHaveProperty('clientId');
    });

    it('envia active=false quando o usuário desliga o toggle', async () => {
      const created = makeUser({
        id: '77777777-7777-7777-7777-777777777777',
        active: false,
      });
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockResolvedValueOnce(created);

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Inativo',
        email: 'inativo@example.com',
        password: 'senha-forte-1',
        identity: '1',
        active: false,
      });
      await submitNewUserForm(client);

      expect(client.post.mock.calls[0][1]).toMatchObject({ active: false });
    });
  });

  describe('cenários de erro do backend', () => {
    beforeEach(() => {
      permissionsMock = [USERS_CREATE_PERMISSION];
    });

    it('409 (e-mail duplicado) mostra erro inline no campo email', async () => {
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 409,
        message: 'Já existe um usuário com este Email.',
      });

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1',
      });
      await submitNewUserForm(client);

      expect(
        await screen.findByText('Já existe um usuário com este e-mail.'),
      ).toBeInTheDocument();
      // Modal segue aberto para que o usuário corrija.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('400 com errors mapeia mensagens para os campos correspondentes', async () => {
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            Email: ['Email inválido (backend).'],
            Password: ['Password deve ter no máximo 60 caracteres.'],
          },
        },
      });

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1',
      });
      await submitNewUserForm(client);

      expect(await screen.findByText('Email inválido (backend).')).toBeInTheDocument();
      expect(
        screen.getByText('Password deve ter no máximo 60 caracteres.'),
      ).toBeInTheDocument();
    });

    it('400 com { message } simples (caso ClientId inexistente) mostra Alert no topo', async () => {
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 400,
        message: 'ClientId informado não existe.',
      });

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1',
        clientId: VALID_CLIENT_ID,
      });
      await submitNewUserForm(client);

      // O Alert no topo do form é renderizado pelo `<Alert>` do design
      // system, que não propaga `data-testid` — buscamos pelo texto
      // direto da mensagem do backend (caso `{ message: ... }` simples
      // sem `details.errors`).
      expect(
        await screen.findByText('ClientId informado não existe.'),
      ).toBeInTheDocument();
    });

    const ERROR_CASES: ReadonlyArray<UsersErrorCase> = [
      {
        name: '401 dispara toast vermelho com mensagem do backend',
        error: {
          kind: 'http',
          status: 401,
          message: 'Sessão expirada. Faça login novamente.',
        },
        expectedText: 'Sessão expirada. Faça login novamente.',
      },
      {
        name: '403 dispara toast vermelho com mensagem do backend',
        error: {
          kind: 'http',
          status: 403,
          message: 'Você não tem permissão para esta ação.',
        },
        expectedText: 'Você não tem permissão para esta ação.',
      },
      {
        name: 'erro genérico de rede dispara toast vermelho genérico',
        error: { kind: 'network', message: 'Falha de conexão.' },
        expectedText: 'Não foi possível criar o usuário. Tente novamente.',
      },
    ];

    it.each(ERROR_CASES)('$name', async ({ error, expectedText }) => {
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.post.mockRejectedValueOnce(error);

      await openCreateUserModal(client);

      fillNewUserForm({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'senha-forte-1',
        identity: '1',
      });
      await submitNewUserForm(client);

      expect(
        await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
      ).toBeInTheDocument();
    });

    it('referência fora do escopo: ID_CLIENT_ALPHA disponível como UUID estável', () => {
      // Sanity check para garantir que o helper exporta UUID estável
      // — outros testes (futuros) reusam.
      expect(ID_CLIENT_ALPHA).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
