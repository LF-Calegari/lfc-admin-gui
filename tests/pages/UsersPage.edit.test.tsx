import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  buildSharedUserSubmitErrorCases,
  buildUsersCloseCases,
  createUsersClientStub,
  fillEditUserForm,
  ID_CLIENT_ALPHA,
  ID_USER_ALICE,
  makeUser,
  makeUsersPagedResponse,
  openEditUserModal,
  renderUsersPage,
  submitEditUserForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
  type UsersErrorCase,
} from './__helpers__/usersTestHelpers';

import type { ApiError } from '@/shared/api';

/**
 * Suíte da `UsersListShellPage` — caminho de edição (Issue #79, EPIC #49).
 *
 * Espelha a estratégia de `RolesPage.edit.test.tsx`/
 * `SystemsPage.edit.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<UsersListShellPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `usersTestHelpers.tsx` para colapsar o
 *   boilerplate "abrir modal → preencher → submeter" e evitar
 *   `New Code Duplication` no Sonar (lição PR #134/#135).
 *
 * Diferenças relativas à suíte de edição de Roles:
 *
 * - O modal de user não exibe campo de senha (reset é endpoint
 *   separado, fora do escopo desta issue).
 * - 409 cita "outro usuário com este e-mail" (unicidade `Email`
 *   global no backend; `UX_Users_Email`).
 * - 404 fecha o modal e dispara refetch (usuário soft-deletado
 *   concorrentemente entre abertura e submit).
 * - 400 com `{ message: "ClientId informado não existe." }` simples
 *   (sem `details.errors`) cai no Alert do topo via `applyBadRequest`,
 *   mesmo padrão do create.
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const USERS_UPDATE_PERMISSION = 'AUTH_V1_USERS_UPDATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('UsersListShellPage — edição (Issue #79)', () => {
  describe('gating do botão "Editar" por linha', () => {
    it('não exibe botões "Editar" quando o usuário não possui AUTH_V1_USERS_UPDATE', async () => {
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

      expect(
        screen.queryByTestId(`users-edit-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Editar" para linhas ativas quando o usuário possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`users-edit-${ID_USER_ALICE}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-label', 'Editar usuário Alice Admin');
    });

    it('não exibe botão "Editar" em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const deletedUser = makeUser({ deletedAt: '2026-02-01T00:00:00Z' });
      const client = createUsersClientStub();
      // Liga o toggle "Mostrar inativas" para a linha aparecer; o
      // gating é por `row.deletedAt`, não pela visibilidade da
      // listagem. Backend devolve a mesma página nas duas requests.
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([deletedUser]));
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);
      fireEvent.click(screen.getByTestId('users-include-deleted'));
      await waitFor(() => {
        expect(screen.queryByTestId('users-loading')).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId(`users-edit-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });
  });

  describe('abertura e pré-preenchimento do modal', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('clicar em "Editar" abre o diálogo pré-populado com os dados do usuário', async () => {
      const user = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 7,
        clientId: ID_CLIENT_ALPHA,
        active: true,
      });
      const client = createUsersClientStub();
      await openEditUserModal(client, { user });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('edit-user-name')).toHaveValue('Alice Admin');
      expect(screen.getByTestId('edit-user-email')).toHaveValue('alice@example.com');
      expect(screen.getByTestId('edit-user-identity')).toHaveValue(7);
      expect(screen.getByTestId('edit-user-client-id')).toHaveValue(ID_CLIENT_ALPHA);
      expect(
        (screen.getByTestId('edit-user-active') as HTMLInputElement).checked,
      ).toBe(true);
    });

    it('aceita usuário sem clientId (clientId=null vira string vazia)', async () => {
      const user = makeUser({ clientId: null });
      const client = createUsersClientStub();
      await openEditUserModal(client, { user });

      expect(screen.getByTestId('edit-user-client-id')).toHaveValue('');
    });

    it('campo de senha não é renderizado no modal de edição', async () => {
      const client = createUsersClientStub();
      await openEditUserModal(client);

      // O campo `password` é exclusivo do `NewUserModal` (Issue #78).
      // Edição não permite alterar senha — endpoint separado
      // (`PUT /users/{id}/password`, sub-issue futura).
      expect(screen.queryByTestId('edit-user-password')).not.toBeInTheDocument();
    });

    /**
     * Cenários de fechamento sem persistir — colapsados em `it.each`
     * via `buildUsersCloseCases` para evitar BLOCKER de duplicação
     * Sonar (lição PR #123/#127).
     */
    const CLOSE_CASES = buildUsersCloseCases('edit-user-cancel');

    it.each(CLOSE_CASES)(
      'fechar via $name não dispara PUT',
      async ({ close }) => {
        const client = createUsersClientStub();
        await openEditUserModal(client);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(client.put).not.toHaveBeenCalled();
      },
    );
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('apagar campos obrigatórios mostra erros inline e não chama PUT', async () => {
      const client = createUsersClientStub();
      await openEditUserModal(client);

      fillEditUserForm({ name: '', email: '', identity: '' });
      fireEvent.submit(screen.getByTestId('edit-user-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('E-mail é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Identity é obrigatório.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('email inválido bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openEditUserModal(client);

      fillEditUserForm({ email: 'no-at' });
      fireEvent.submit(screen.getByTestId('edit-user-form'));

      expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('identity não-inteiro bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openEditUserModal(client);

      fillEditUserForm({ identity: '1.5' });
      fireEvent.submit(screen.getByTestId('edit-user-form'));

      expect(
        screen.getByText('Identity deve ser um número inteiro.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('clientId não-UUID bloqueia submit com mensagem inline', async () => {
      const client = createUsersClientStub();
      await openEditUserModal(client);

      fillEditUserForm({ clientId: 'abc' });
      fireEvent.submit(screen.getByTestId('edit-user-form'));

      expect(
        screen.getByText('ClientId deve ser um UUID válido.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('envia PUT /users/{id} com body trimado, fecha modal, exibe toast e refaz listUsers', async () => {
      const original = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 1,
        clientId: ID_CLIENT_ALPHA,
        active: true,
      });
      const updated = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin v2',
        email: 'alice2@example.com',
        identity: 2,
        clientId: ID_CLIENT_ALPHA,
        active: false,
      });
      const client = createUsersClientStub();
      let usersGetCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          usersGetCalls += 1;
          if (usersGetCalls === 1) {
            return Promise.resolve(makeUsersPagedResponse([original]));
          }
          return Promise.resolve(makeUsersPagedResponse([updated]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected: ${path}`));
      });
      client.put.mockResolvedValueOnce(updated);

      await openEditUserModal(client, { user: original });

      fillEditUserForm({
        name: '  Alice Admin v2  ',
        email: '  alice2@example.com  ',
        identity: '2',
        active: false,
      });
      await submitEditUserForm(client);

      expect(client.put).toHaveBeenCalledWith(
        `/users/${ID_USER_ALICE}`,
        {
          name: 'Alice Admin v2',
          email: 'alice2@example.com',
          identity: 2,
          active: false,
          clientId: ID_CLIENT_ALPHA,
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Usuário atualizado.".
      expect(await screen.findByText('Usuário atualizado.')).toBeInTheDocument();

      // Refetch da lista — ao menos 2 chamadas a `/users`.
      await waitFor(() => {
        expect(usersGetCalls).toBeGreaterThanOrEqual(2);
      });
    });

    it('envia body sem clientId quando o usuário apaga o conteúdo', async () => {
      const original = makeUser({ id: ID_USER_ALICE, clientId: ID_CLIENT_ALPHA });
      const client = createUsersClientStub();
      client.put.mockResolvedValueOnce(makeUser({ ...original, clientId: null }));

      await openEditUserModal(client, { user: original });

      fillEditUserForm({ clientId: '' });
      await submitEditUserForm(client);

      const [, body] = client.put.mock.calls[0];
      expect(body).not.toHaveProperty('clientId');
      expect(body).toMatchObject({
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 1,
        active: true,
      });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127) — testes
     * com a mesma estrutura mudando 1-2 mocks viram tabela. Casos
     * específicos do edit: 409 com mensagem citando "outro usuário"
     * + 404 (usuário removido concorrentemente). Os 3 cenários
     * comuns (401, 403, network) vêm de
     * `buildSharedUserSubmitErrorCases('atualizar')`.
     */
    const ERROR_CASES: ReadonlyArray<UsersErrorCase> = [
      {
        name: '409 (e-mail duplicado) exibe mensagem inline no campo email',
        error: {
          kind: 'http',
          status: 409,
          message: 'Já existe outro usuário com este Email.',
        },
        expectedText: 'Já existe outro usuário com este e-mail.',
      },
      {
        name: '400 com errors mapeia mensagens para os campos correspondentes',
        error: {
          kind: 'http',
          status: 400,
          message: 'Erro de validação.',
          details: {
            errors: {
              Email: ['Email inválido (backend).'],
              Identity: ['The Identity field is required.'],
            },
          },
        },
        expectedText: 'Email inválido (backend).',
      },
      {
        name: '400 sem errors (caso ClientId inexistente) mostra Alert no topo',
        error: {
          kind: 'http',
          status: 400,
          message: 'ClientId informado não existe.',
        },
        expectedText: 'ClientId informado não existe.',
      },
      ...buildSharedUserSubmitErrorCases('atualizar'),
      {
        name: '404 (usuário removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Usuário não encontrado.',
        },
        expectedText: 'Usuário não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createUsersClientStub();
        client.put.mockRejectedValueOnce(error);

        await openEditUserModal(client);
        await submitEditUserForm(client);

        expect(
          await screen.findByText(toCaseInsensitiveMatcher(expectedText)),
        ).toBeInTheDocument();

        if (modalStaysOpen) {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        } else {
          await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          });
        }
      },
    );

    it('404 dispara refetch (onUpdated chamado mesmo em erro)', async () => {
      const client = createUsersClientStub();
      let usersGetCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          usersGetCalls += 1;
          return Promise.resolve(makeUsersPagedResponse([makeUser()]));
        }
        return Promise.resolve(null);
      });
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Usuário não encontrado.',
      } satisfies ApiError);

      await openEditUserModal(client);
      await submitEditUserForm(client);

      await waitFor(() => {
        expect(usersGetCalls).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
