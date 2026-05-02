import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock, type MockAuthUser } from '../__helpers__/mockUseAuth';
import {
  buildSharedUserMutationErrorCases,
  buildUsersCloseCases,
  confirmForceLogout,
  createUsersClientStub,
  ID_USER_ALICE,
  ID_USER_BOB,
  makeUser,
  mockUserListResponse,
  mockUserListResponseWithCounter,
  openForceLogoutConfirm,
  renderUsersPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
  type UsersErrorCase,
} from '../__helpers__/usersTestHelpers';

import type { ApiError } from '@/shared/api';

/**
 * Suíte da `UsersListShellPage` — logout remoto (Issue #82, EPIC #49).
 *
 * Espelha a estratégia de `UserActivateToggle.test.tsx` (Issue #80) e
 * `UserResetPassword.test.tsx` (#81): mock controlável de `useAuth`
 * (`permissionsMock` + getter que vi.mock captura a cada
 * `useAuth()`), stub de `ApiClient` injetado em
 * `<UsersListShellPage client={stub} />`, helpers compartilhados em
 * `tests/pages/__helpers__/usersTestHelpers.tsx` para colapsar
 * boilerplate (lição PR #134/#135).
 *
 * **Decisão chave de implementação:** o backend
 * (`lfc-authenticator#168`) expõe endpoint dedicado
 * `POST /users/{id}/force-logout` sem body. O wrapper
 * `forceLogoutUser` envia POST com `body=null` (cliente HTTP omite o
 * payload) e devolve `ForceLogoutResponse`. A UI só reage a sucesso/
 * erro — `newTokenVersion` no payload é descartado.
 *
 * **Self-target:** o backend rejeita com 400
 * (`{message: "Não é possível forçar logout de si mesmo..."}`). A UI
 * bloqueia preventivamente escondendo a ação na linha do próprio
 * usuário corrente — testes validam ambas as defesas:
 *
 * 1. Botão escondido quando `currentUserId === row.id` (gating
 *    preventivo no UI).
 * 2. Caso o gating falhe (cenário defensivo cobre a lacuna),
 *    `forceLogoutUser` propaga o `ApiError` 400 e o
 *    `MutationConfirmModal` cai no `unhandled` mostrando a copy
 *    genérica — sem regressão silenciosa.
 *
 * **Diferença vs Toggle (#80) e Reset (#81):** policy é a mesma
 * (`Users.Update`), mas a ação é destrutiva de **sessão**, não de
 * estado do usuário (`active=false`) ou credencial (`password`).
 * `tokenVersion` no backend é incrementado, derrubando JWTs antigos
 * no próximo `verify-token` — usuário consegue fazer login normalmente
 * imediatamente depois.
 */

let permissionsMock: ReadonlyArray<string> = [];
let currentUserMock: MockAuthUser | null = null;

vi.mock('@/shared/auth', () =>
  buildAuthMock(
    () => permissionsMock,
    () => currentUserMock,
  ),
);

const USERS_UPDATE_PERMISSION = 'AUTH_V1_USERS_UPDATE';

beforeEach(() => {
  permissionsMock = [];
  currentUserMock = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('UsersListShellPage — forçar logout (Issue #82)', () => {
  describe('gating do botão "Forçar logout" por linha', () => {
    it('não exibe botão "Forçar logout" quando o usuário não possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [];
      const client = createUsersClientStub();
      mockUserListResponse(client, [makeUser()]);

      renderUsersPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`users-force-logout-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Forçar logout" para outras linhas quando o usuário possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      // Sessão como Bob: a linha de Alice deve mostrar o botão.
      currentUserMock = {
        id: ID_USER_BOB,
        name: 'Bob Operator',
        email: 'bob@example.com',
        identity: 1,
      };
      const client = createUsersClientStub();
      mockUserListResponse(client, [makeUser()]);

      renderUsersPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`users-force-logout-${ID_USER_ALICE}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute(
        'aria-label',
        'Forçar logout do usuário Alice Admin',
      );
      expect(btn).toHaveTextContent('Forçar logout');
    });

    it('NÃO exibe botão "Forçar logout" na linha do próprio usuário corrente (defesa contra self-target 400 do backend)', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      // Sessão como Alice: a linha de Alice NÃO deve mostrar o botão.
      currentUserMock = {
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
        identity: 1,
      };
      const client = createUsersClientStub();
      mockUserListResponse(client, [makeUser()]);

      renderUsersPage(client);
      await waitForInitialList(client);

      // Outras ações continuam visíveis (Editar, Redefinir senha,
      // Desativar) — só "Forçar logout" some.
      expect(
        screen.getByTestId(`users-edit-${ID_USER_ALICE}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`users-force-logout-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });

    it('NÃO exibe botão "Forçar logout" em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const deletedUser = makeUser({ deletedAt: '2026-02-01T00:00:00Z' });
      const client = createUsersClientStub();
      mockUserListResponse(client, [deletedUser]);

      renderUsersPage(client);
      await waitForInitialList(client);

      // Soft-deleted: nenhuma ação aparece — alinha com a coluna
      // Status (badge "Inativa") e com a UX dos demais botões.
      expect(
        screen.queryByTestId(`users-force-logout-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('clicar em "Forçar logout" abre o diálogo "Forçar logout?" com nome e e-mail do usuário', async () => {
      const user = makeUser({
        name: 'Alice Admin',
        email: 'alice@example.com',
      });
      const client = createUsersClientStub();
      await openForceLogoutConfirm(client, { user });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Forçar logout\?/i)).toBeInTheDocument();
      const description = screen.getByTestId('force-logout-user-description');
      expect(description).toHaveTextContent('Alice Admin');
      expect(description).toHaveTextContent('alice@example.com');
      expect(description).toHaveTextContent(
        /precisará fazer login novamente/i,
      );
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildUsersCloseCases`
     * (helper compartilhado com criação/edição/toggle/reset) — diferença
     * é só o testId do botão Cancelar (`force-logout-user-cancel`).
     * Lição PR #127: `it.each` evita BLOCKER de duplicação Sonar para
     * cenários com mesma estrutura mudando 1-2 mocks.
     */
    const CLOSE_CASES = buildUsersCloseCases('force-logout-user-cancel');

    it.each(CLOSE_CASES)(
      'fechar via $name não dispara POST',
      async ({ close }) => {
        const client = createUsersClientStub();
        await openForceLogoutConfirm(client);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(client.post).not.toHaveBeenCalled();
      },
    );
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('envia POST /users/{id}/force-logout sem body, fecha modal, exibe toast e refaz listUsers', async () => {
      const target = makeUser({
        id: ID_USER_ALICE,
        name: 'Alice Admin',
        email: 'alice@example.com',
      });
      const client = createUsersClientStub();
      const getCallCount = mockUserListResponseWithCounter(client, [target]);
      client.post.mockResolvedValueOnce({
        message: 'Sessões do usuário invalidadas com sucesso.',
        userId: ID_USER_ALICE,
        newTokenVersion: 7,
      });

      await openForceLogoutConfirm(client, { user: target });
      await confirmForceLogout(client);

      expect(client.post).toHaveBeenCalledWith(
        `/users/${ID_USER_ALICE}/force-logout`,
        null,
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde com a copy esperada (status do ToastProvider).
      expect(
        await screen.findByText(
          'Sessões invalidadas. Usuário precisará fazer login novamente.',
        ),
      ).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez na rota
      // `/users` após o POST bem-sucedido.
      await waitFor(() => {
        expect(getCallCount()).toBeGreaterThanOrEqual(2);
      });
    });

    it('lança ApiError(parse) quando o backend devolve payload sem campos esperados (defesa contra drift de contrato)', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      mockUserListResponse(client, [target]);
      // Backend devolveu shape inesperado (faltando newTokenVersion) —
      // wrapper traduz para ApiError(parse), e o
      // `MutationConfirmModal` cai no branch `unhandled` exibindo a
      // copy genérica de erro (validamos que a UI não regride
      // silenciosamente).
      client.post.mockResolvedValueOnce({ message: 'oi', userId: 'x' });

      await openForceLogoutConfirm(client, { user: target });
      await confirmForceLogout(client);

      expect(
        await screen.findByText(
          toCaseInsensitiveMatcher(
            'Não foi possível forçar logout do usuário. Tente novamente.',
          ),
        ),
      ).toBeInTheDocument();
      // Modal permanece aberto para o operador tentar novamente.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Casos
     * comuns (401, 403, network) vêm do helper compartilhado
     * `buildSharedUserMutationErrorCases('forçar logout do')` (lição
     * PR #128 — pré-projetar shared helpers para evitar duplicação
     * literal entre suítes que diferem só pelo verbo).
     *
     * Casos específicos:
     *
     * - **404** — usuário removido entre abertura e confirm: modal
     *   fecha + dispara refetch (paridade com o tratamento de 404 no
     *   toggle/edit).
     * - **400** — defesa em profundidade: a UI deveria ter escondido
     *   o botão na linha do próprio operador, mas se o gating falhar
     *   (ou se outro erro do backend devolver 400), o classificador
     *   cai em `unhandled` e mostra a copy genérica. Validamos esse
     *   caminho para garantir que não há regressão silenciosa.
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
      {
        name: '400 (self-target, defesa em profundidade) cai em unhandled e exibe copy genérica',
        error: {
          kind: 'http',
          status: 400,
          message:
            'Não é possível forçar logout de si mesmo por este endpoint. Utilize GET /auth/logout.',
        },
        expectedText:
          'Não foi possível forçar logout do usuário. Tente novamente.',
      },
      ...buildSharedUserMutationErrorCases('forçar logout do'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const target = makeUser({ id: ID_USER_ALICE });
        const client = createUsersClientStub();
        mockUserListResponse(client, [target]);
        client.post.mockRejectedValueOnce(error);

        await openForceLogoutConfirm(client, { user: target });
        await confirmForceLogout(client);

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

    it('404 dispara refetch (onLoggedOut chamado mesmo em erro)', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      const getCallCount = mockUserListResponseWithCounter(client, [target]);
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Usuário não encontrado.',
      } satisfies ApiError);

      await openForceLogoutConfirm(client, { user: target });
      await confirmForceLogout(client);

      await waitFor(() => {
        expect(getCallCount()).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
