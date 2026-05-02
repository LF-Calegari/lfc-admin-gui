import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  buildSharedUserMutationErrorCases,
  buildUsersCloseCases,
  confirmToggleUserActive,
  createUsersClientStub,
  ID_USER_ALICE,
  makeUser,
  makeUsersPagedResponse,
  openToggleUserActiveConfirm,
  renderUsersPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
  type UsersErrorCase,
} from '../__helpers__/usersTestHelpers';

import type { ApiError } from '@/shared/api';

/**
 * Suíte da `UsersListShellPage` — toggle ativo/desativado (Issue #80,
 * EPIC #49).
 *
 * Espelha a estratégia de `SystemsPage.delete.test.tsx`/
 * `SystemsPage.restore.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<UsersListShellPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `tests/pages/__helpers__/usersTestHelpers.tsx`
 *   para colapsar o boilerplate "abrir modal → confirmar → asserir"
 *   evitando `New Code Duplication` no Sonar (lição PR #134/#135).
 *
 * **Decisão chave de implementação:** o toggle não tem endpoint
 * dedicado no backend — `PUT /users/{id}` exige body completo
 * (`Name`/`Email`/`Identity`/`Active` como `[Required]`). O
 * `ToggleUserActiveConfirm` reenvia o body completo invertendo apenas
 * `active`. Os testes verificam o payload final passado ao `client.put`
 * para confirmar que outros campos não são perdidos no caminho.
 *
 * **Diferença vs Systems#60/#61:** o toggle é controlado por uma única
 * permissão (`Users.Update`, mesma da edição) — não há policy
 * separada para "Active" e "Restore". Soft-delete é endpoint distinto
 * (`Users.Delete`/`Users.Restore`) e não está no escopo desta issue.
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

describe('UsersListShellPage — toggle ativo (Issue #80)', () => {
  describe('gating do botão "Desativar/Ativar" por linha', () => {
    it('não exibe botões "Desativar/Ativar" quando o usuário não possui AUTH_V1_USERS_UPDATE', async () => {
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
        screen.queryByTestId(`users-toggle-active-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Desativar" para linhas ativas quando o usuário possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(
            makeUsersPagedResponse([makeUser({ active: true })]),
          );
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`users-toggle-active-${ID_USER_ALICE}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute(
        'aria-label',
        'Desativar usuário Alice Admin',
      );
      expect(btn).toHaveTextContent('Desativar');
    });

    it('exibe botão "Ativar" para linhas inativas (active=false) quando o usuário possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(
            makeUsersPagedResponse([makeUser({ active: false })]),
          );
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`users-toggle-active-${ID_USER_ALICE}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-label', 'Ativar usuário Alice Admin');
      expect(btn).toHaveTextContent('Ativar');
    });

    it('NÃO exibe botão de toggle em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const deletedUser = makeUser({ deletedAt: '2026-02-01T00:00:00Z' });
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([deletedUser]));
        }
        return Promise.resolve(null);
      });

      renderUsersPage(client);
      await waitForInitialList(client);

      // Soft-deleted: nenhuma ação aparece — alinha com a coluna
      // Status (badge "Inativa") e com a UX de Editar (não faz
      // sentido editar/desativar uma linha já soft-deletada).
      expect(
        screen.queryByTestId(`users-toggle-active-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('clicar em "Desativar" abre o diálogo "Desativar usuário?" com nome e e-mail do usuário', async () => {
      const user = makeUser({
        name: 'Alice Admin',
        email: 'alice@example.com',
        active: true,
      });
      const client = createUsersClientStub();
      await openToggleUserActiveConfirm(client, { user });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/Desativar usuário\?/i),
      ).toBeInTheDocument();
      const description = screen.getByTestId('toggle-user-active-description');
      expect(description).toHaveTextContent('Alice Admin');
      expect(description).toHaveTextContent('alice@example.com');
    });

    it('clicar em "Ativar" abre o diálogo "Ativar usuário?" com a copy positiva', async () => {
      const user = makeUser({
        name: 'Alice Admin',
        email: 'alice@example.com',
        active: false,
      });
      const client = createUsersClientStub();
      await openToggleUserActiveConfirm(client, { user });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Ativar usuário\?/i)).toBeInTheDocument();
      const confirmBtn = screen.getByTestId('toggle-user-active-confirm');
      expect(confirmBtn).toHaveTextContent('Ativar');
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildUsersCloseCases`
     * (helper compartilhado com criação/edição) — diferença é só o
     * testId do botão Cancelar (`toggle-user-active-cancel`). Lição
     * PR #127: `it.each` evita BLOCKER de duplicação Sonar para
     * cenários com mesma estrutura mudando 1-2 mocks.
     */
    const CLOSE_CASES = buildUsersCloseCases('toggle-user-active-cancel');

    it.each(CLOSE_CASES)(
      'fechar via $name não dispara PUT',
      async ({ close }) => {
        const client = createUsersClientStub();
        await openToggleUserActiveConfirm(client);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(client.put).not.toHaveBeenCalled();
      },
    );
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('desativar: envia PUT /users/{id} com active=false preservando os demais campos, fecha modal, exibe toast e refaz listUsers', async () => {
      const target = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 1,
        clientId: 'client-uuid',
        active: true,
      });
      const client = createUsersClientStub();
      // Implementation: GET /users (inicial) + GET /clients/{id} no
      // mount, depois PUT /users/{id}, depois GET /users (refetch).
      let getCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          getCalls += 1;
          return Promise.resolve(makeUsersPagedResponse([target]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected path: ${path}`));
      });
      client.put.mockResolvedValueOnce({ ...target, active: false });

      await openToggleUserActiveConfirm(client, { user: target });
      await confirmToggleUserActive(client);

      expect(client.put).toHaveBeenCalledWith(
        `/users/${ID_USER_ALICE}`,
        {
          name: 'Alice Admin',
          email: 'alice@example.com',
          identity: 1,
          active: false,
          clientId: 'client-uuid',
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Usuário desativado." (status do ToastProvider).
      expect(
        await screen.findByText('Usuário desativado.'),
      ).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez na rota
      // `/users` após o PUT bem-sucedido. (`getCalls` registrado pelo
      // mock implementation diferencia os dois GETs sem flakiness.)
      await waitFor(() => {
        expect(getCalls).toBeGreaterThanOrEqual(2);
      });
    });

    it('ativar: envia PUT /users/{id} com active=true, exibe toast positivo e refetcha', async () => {
      const target = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 1,
        clientId: 'client-uuid',
        active: false,
      });
      const client = createUsersClientStub();
      let getCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          getCalls += 1;
          return Promise.resolve(makeUsersPagedResponse([target]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected path: ${path}`));
      });
      client.put.mockResolvedValueOnce({ ...target, active: true });

      await openToggleUserActiveConfirm(client, { user: target });
      await confirmToggleUserActive(client);

      expect(client.put).toHaveBeenCalledWith(
        `/users/${ID_USER_ALICE}`,
        expect.objectContaining({ active: true, clientId: 'client-uuid' }),
        undefined,
      );

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(
        await screen.findByText('Usuário ativado.'),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(getCalls).toBeGreaterThanOrEqual(2);
      });
    });

    it('omite clientId do payload quando o usuário não tem cliente vinculado (preservando "manter ClientId atual" no backend)', async () => {
      const target = makeUser({
        id: ID_USER_ALICE,
        clientId: null,
        active: true,
      });
      const client = createUsersClientStub();
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          return Promise.resolve(makeUsersPagedResponse([target]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected path: ${path}`));
      });
      client.put.mockResolvedValueOnce({ ...target, active: false });

      await openToggleUserActiveConfirm(client, { user: target });
      await confirmToggleUserActive(client);

      // O payload final NÃO deve carregar `clientId` quando o usuário
      // não tem cliente vinculado — o backend interpreta a ausência
      // como "manter o ClientId atual" (`UsersController.UpdateById`
      // linha 507). `expect.not.objectContaining` valida a ausência.
      const calledWith = client.put.mock.calls[0][1];
      expect(calledWith).not.toHaveProperty('clientId');
      expect(calledWith).toMatchObject({ active: false });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Casos
     * comuns (401, 403, network) vêm do helper compartilhado
     * `buildSharedUserMutationErrorCases('desativar')` (lição PR #128
     * — pré-projetar shared helpers para evitar duplicação literal
     * entre suítes que diferem só pelo verbo).
     *
     * Caso específico (404 — usuário removido entre abertura e
     * confirm) fica inline porque o comportamento difere: modal fecha
     * + dispara refetch (paridade com o tratamento de 404 no edit
     * — `EditUserModal`).
     */
    const ERROR_CASES: ReadonlyArray<UsersErrorCase> = [
      {
        name: '404 (usuário já removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Usuário não encontrado.',
        },
        expectedText: 'Usuário não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
      ...buildSharedUserMutationErrorCases('desativar'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const target = makeUser({ active: true });
        const client = createUsersClientStub();
        client.get.mockImplementation((path: string) => {
          if (path.startsWith('/users')) {
            return Promise.resolve(makeUsersPagedResponse([target]));
          }
          if (path.startsWith('/clients/')) {
            return Promise.resolve(null);
          }
          return Promise.reject(new Error(`unexpected path: ${path}`));
        });
        client.put.mockRejectedValueOnce(error);

        await openToggleUserActiveConfirm(client, { user: target });
        await confirmToggleUserActive(client);

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

    it('404 dispara refetch (onToggled chamado mesmo em erro)', async () => {
      const target = makeUser({ active: true });
      const client = createUsersClientStub();
      let getCalls = 0;
      client.get.mockImplementation((path: string) => {
        if (path.startsWith('/users')) {
          getCalls += 1;
          return Promise.resolve(makeUsersPagedResponse([target]));
        }
        if (path.startsWith('/clients/')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected path: ${path}`));
      });
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Usuário não encontrado.',
      } satisfies ApiError);

      await openToggleUserActiveConfirm(client, { user: target });
      await confirmToggleUserActive(client);

      await waitFor(() => {
        expect(getCalls).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
