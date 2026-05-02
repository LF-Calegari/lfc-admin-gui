import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  buildSharedUserMutationErrorCases,
  buildUsersCloseCases,
  createUsersClientStub,
  fillResetUserPasswordForm,
  ID_USER_ALICE,
  makeUser,
  mockUserListResponse,
  mockUserListResponseWithCounter,
  openResetUserPasswordModal,
  renderUsersPage,
  submitResetUserPasswordForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
  type UsersErrorCase,
} from '../__helpers__/usersTestHelpers';

import type { ApiError } from '@/shared/api';

/**
 * Suíte do `ResetUserPasswordConfirm` (Issue #81, EPIC #49).
 *
 * Espelha `UserActivateToggle.test.tsx`/`SystemsPage.delete.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<UsersListShellPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `tests/pages/__helpers__/usersTestHelpers.tsx`
 *   (lições PR #127/#128/#134/#135 — colapsar boilerplate via helpers
 *   antes do segundo call site).
 *
 * **Decisão chave de implementação:** o reset usa endpoint dedicado
 * (`PUT /users/{id}/password`) com body `{ password }` apenas. O modal
 * reusa `useEditEntitySubmit` do shared/forms (mesmo padrão do
 * `EditUserModal`) para o ciclo de submit — isso evita duplicação ≥10
 * linhas com o try/catch/classify/finally de outros modals do recurso.
 *
 * **Diferença vs Toggle Active (#80):** o reset tem campo de form
 * (campo de senha), então não reusa `MutationConfirmModal` (que é
 * estritamente sem form). A interface visual segue `EditUserModal`
 * mas com um único campo.
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

describe('UsersListShellPage — reset de senha (Issue #81)', () => {
  describe('gating do botão "Redefinir senha" por linha', () => {
    it('não exibe botão "Redefinir senha" quando o usuário não possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [];
      const client = createUsersClientStub();
      mockUserListResponse(client, [makeUser()]);

      renderUsersPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`users-reset-password-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Redefinir senha" quando o usuário possui AUTH_V1_USERS_UPDATE', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const client = createUsersClientStub();
      mockUserListResponse(client, [makeUser()]);

      renderUsersPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`users-reset-password-${ID_USER_ALICE}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute(
        'aria-label',
        'Redefinir senha do usuário Alice Admin',
      );
      expect(btn).toHaveTextContent('Redefinir senha');
    });

    it('NÃO exibe botão "Redefinir senha" em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
      const deletedUser = makeUser({ deletedAt: '2026-02-01T00:00:00Z' });
      const client = createUsersClientStub();
      mockUserListResponse(client, [deletedUser]);

      renderUsersPage(client);
      await waitForInitialList(client);

      // Soft-deleted: nenhuma ação aparece — alinha com a coluna
      // Status (badge "Inativa") e com a UX de Editar/Desativar
      // (não faz sentido redefinir senha de uma linha já soft-deletada,
      // o backend devolveria 404 mesmo).
      expect(
        screen.queryByTestId(`users-reset-password-${ID_USER_ALICE}`),
      ).not.toBeInTheDocument();
    });
  });

  describe('abertura do modal de reset', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('clicar em "Redefinir senha" abre o modal com nome e e-mail do usuário', async () => {
      const user = makeUser({
        name: 'Alice Admin',
        email: 'alice@example.com',
      });
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client, { user });

      // Título do modal — `getByRole('heading')` evita ambiguidade com
      // o botão "Redefinir senha" (que também contém o mesmo texto).
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /Redefinir senha/i }),
      ).toBeInTheDocument();
      const description = screen.getByTestId('reset-user-password-description');
      expect(description).toHaveTextContent('Alice Admin');
      expect(description).toHaveTextContent('alice@example.com');
    });

    it('campo "Nova senha" começa vazio e o submit fica habilitado (validação só dispara no submit)', async () => {
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client);

      const input = screen.getByTestId('reset-user-password-input') as HTMLInputElement;
      expect(input.value).toBe('');
      // Type=password mascara a entrada — confirma que o form não
      // expõe a senha em texto claro inadvertidamente.
      expect(input.type).toBe('password');

      // Botão de submit habilitado mesmo com campo vazio — validação
      // só exibe erro inline após o usuário tentar submeter
      // (mesmo padrão dos demais modals do recurso).
      const submit = screen.getByTestId('reset-user-password-submit');
      expect(submit).not.toBeDisabled();
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildUsersCloseCases`.
     */
    const CLOSE_CASES = buildUsersCloseCases('reset-user-password-cancel');

    it.each(CLOSE_CASES)(
      'fechar via $name não dispara PUT',
      async ({ close }) => {
        const client = createUsersClientStub();
        await openResetUserPasswordModal(client);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        close();

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
        expect(client.put).not.toHaveBeenCalled();
      },
    );

    it('reabrir o modal limpa estado anterior (campo vazio, sem erros)', async () => {
      const client = createUsersClientStub();
      // Primeiro: abrir, digitar, fechar.
      await openResetUserPasswordModal(client);
      fillResetUserPasswordForm({ password: 'senha-anterior' });
      fireEvent.click(screen.getByTestId('reset-user-password-cancel'));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Reabrir: o campo deve estar vazio (não traz "senha-anterior").
      fireEvent.click(screen.getByTestId(`users-reset-password-${ID_USER_ALICE}`));
      await waitFor(() => {
        expect(screen.getByTestId('reset-user-password-form')).toBeInTheDocument();
      });
      const input = screen.getByTestId(
        'reset-user-password-input',
      ) as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('exibe erro inline e NÃO dispara PUT quando o campo está vazio', async () => {
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client);

      // Submit sem digitar nada — validação client-side reprova.
      fireEvent.submit(screen.getByTestId('reset-user-password-form'));

      expect(
        await screen.findByText('Nova senha é obrigatória.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
      // Modal continua aberto — operador corrige e tenta de novo.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('exibe erro inline quando a senha tem menos que o mínimo (8 chars)', async () => {
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client);

      fillResetUserPasswordForm({ password: 'curta' });
      fireEvent.submit(screen.getByTestId('reset-user-password-form'));

      expect(
        await screen.findByText(/Nova senha deve ter ao menos 8 caracteres\./i),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('exibe erro inline quando a senha contém apenas espaços', async () => {
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client);

      fillResetUserPasswordForm({ password: '          ' });
      fireEvent.submit(screen.getByTestId('reset-user-password-form'));

      expect(
        await screen.findByText('Nova senha não pode ser apenas espaços.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('digitar no campo após erro client-side limpa o erro inline', async () => {
      const client = createUsersClientStub();
      await openResetUserPasswordModal(client);

      // 1) Submit com vazio → erro inline.
      fireEvent.submit(screen.getByTestId('reset-user-password-form'));
      expect(
        await screen.findByText('Nova senha é obrigatória.'),
      ).toBeInTheDocument();

      // 2) Digitar → erro some imediatamente.
      fillResetUserPasswordForm({ password: 'a' });
      await waitFor(() => {
        expect(
          screen.queryByText('Nova senha é obrigatória.'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('envia PUT /users/{id}/password com a nova senha, fecha modal, exibe toast e refaz listUsers', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      const getUserListCallCount = mockUserListResponseWithCounter(client, [target]);
      client.put.mockResolvedValueOnce({
        ...target,
        updatedAt: '2026-02-01T12:00:00Z',
      });

      await openResetUserPasswordModal(client, { user: target });
      fillResetUserPasswordForm({ password: 'senha-forte-123' });
      await submitResetUserPasswordForm(client);

      // Path + body conforme contrato do backend
      // (`PUT /users/{id}/password`).
      expect(client.put).toHaveBeenCalledWith(
        `/users/${ID_USER_ALICE}/password`,
        { password: 'senha-forte-123' },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde — copy declarada em `ResetUserPasswordConfirm`.
      expect(await screen.findByText('Senha redefinida.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez na rota
      // `/users` após o PUT bem-sucedido.
      await waitFor(() => {
        expect(getUserListCallCount()).toBeGreaterThanOrEqual(2);
      });
    });

    it('preserva a senha literal no body (sem trim no transporte)', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      mockUserListResponse(client, [target]);
      client.put.mockResolvedValueOnce(target);

      await openResetUserPasswordModal(client, { user: target });
      // Senha com espaços laterais — o backend trima ao receber, mas
      // o frontend transmite literal para preservar simetria com
      // gerenciadores de senha que produzem strings com prefix/suffix.
      fillResetUserPasswordForm({ password: '  com-espacos-laterais  ' });
      await submitResetUserPasswordForm(client);

      const calledWith = client.put.mock.calls[0][1] as Record<string, unknown>;
      expect(calledWith.password).toBe('  com-espacos-laterais  ');
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [USERS_UPDATE_PERMISSION];
    });

    it('400 com errors.Password mapeia mensagem inline no campo', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      mockUserListResponse(client, [target]);
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            Password: ['Password deve ter no máximo 60 caracteres.'],
          },
        },
      } satisfies ApiError);

      await openResetUserPasswordModal(client, { user: target });
      fillResetUserPasswordForm({ password: 'senha-valida-12' });
      await submitResetUserPasswordForm(client);

      expect(
        await screen.findByText('Password deve ter no máximo 60 caracteres.'),
      ).toBeInTheDocument();
      // Modal continua aberto — operador corrige e tenta de novo.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('400 sem errors mapeáveis cai no Alert no topo do form', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      mockUserListResponse(client, [target]);
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 400,
        message: 'Erro inesperado.',
      } satisfies ApiError);

      await openResetUserPasswordModal(client, { user: target });
      fillResetUserPasswordForm({ password: 'senha-valida-12' });
      await submitResetUserPasswordForm(client);

      // Alert no topo do form (não inline no campo) — fallback do
      // `applyBadRequest` quando não há `errors.Password` mapeável.
      expect(await screen.findByText('Erro inesperado.')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    /**
     * Cenários comuns de erro mapeados — 401/403/network. Casos comuns
     * vêm do helper compartilhado `buildSharedUserMutationErrorCases`
     * (lição PR #128 — pré-projetar shared helpers para evitar
     * duplicação literal entre suítes que diferem só pelo verbo).
     *
     * Caso específico (404 — usuário removido entre abertura e
     * confirm) fica inline porque o comportamento difere: modal fecha
     * + dispara refetch (paridade com o tratamento de 404 no edit).
     */
    const ERROR_CASES: ReadonlyArray<UsersErrorCase> = [
      {
        name: '404 (usuário já removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Usuário não encontrado.',
        },
        expectedText:
          'Usuário não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
      ...buildSharedUserMutationErrorCases('redefinir senha do'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const target = makeUser({ id: ID_USER_ALICE });
        const client = createUsersClientStub();
        mockUserListResponse(client, [target]);
        client.put.mockRejectedValueOnce(error);

        await openResetUserPasswordModal(client, { user: target });
        fillResetUserPasswordForm({ password: 'senha-valida-12' });
        await submitResetUserPasswordForm(client);

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

    it('404 dispara refetch (onResetCompleted chamado mesmo em erro)', async () => {
      const target = makeUser({ id: ID_USER_ALICE });
      const client = createUsersClientStub();
      const getUserListCallCount = mockUserListResponseWithCounter(client, [target]);
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Usuário não encontrado.',
      } satisfies ApiError);

      await openResetUserPasswordModal(client, { user: target });
      fillResetUserPasswordForm({ password: 'senha-valida-12' });
      await submitResetUserPasswordForm(client);

      await waitFor(() => {
        expect(getUserListCallCount()).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
