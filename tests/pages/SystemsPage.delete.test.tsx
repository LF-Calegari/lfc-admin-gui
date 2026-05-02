import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  assertRowActionAbsent,
  assertRowActionPresent,
  buildCloseCases,
  buildSharedMutationErrorCases,
  confirmDelete,
  createSystemsClientStub,
  ID_SYS_AUTH,
  ID_SYS_LEGACY,
  makePagedResponse,
  makeSystem,
  openDeleteConfirm,
  renderSystemsPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from './__helpers__/systemsTestHelpers';

import type { SystemsErrorCase } from './__helpers__/systemsTestHelpers';
import type { ApiError } from '@/shared/api';

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_DELETE`. Reusa `buildAuthMock` (helper compartilhado
 * com listagem/criação/edição).
 *
 * Issue #60 — soft-delete via `DELETE /systems/{id}` + modal de
 * confirmação (`DeleteSystemConfirm`).
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SYSTEMS_DELETE_PERMISSION = 'AUTH_V1_SYSTEMS_DELETE';
const SYSTEMS_UPDATE_PERMISSION = 'AUTH_V1_SYSTEMS_UPDATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('SystemsPage — desativar (Issue #60)', () => {
  describe('gating do botão "Desativar" por linha', () => {
    it('não exibe botões "Desativar" quando o usuário não possui AUTH_V1_SYSTEMS_DELETE', async () => {
      permissionsMock = [];
      await assertRowActionAbsent(createSystemsClientStub(), 'delete');
    });

    it('exibe um botão "Desativar" para cada linha ativa quando o usuário possui AUTH_V1_SYSTEMS_DELETE', async () => {
      permissionsMock = [SYSTEMS_DELETE_PERMISSION];
      await assertRowActionPresent(createSystemsClientStub(), 'delete', 'Desativar');
    });

    it('NÃO exibe "Desativar" em linhas já soft-deletadas (deletedAt != null)', async () => {
      permissionsMock = [SYSTEMS_DELETE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedResponse([
          // Ativa — botão deve aparecer.
          makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator' }),
          // Soft-deleted — botão NÃO deve aparecer (#61 vai cobrir
          // restaurar).
          makeSystem({
            id: ID_SYS_LEGACY,
            name: 'lfc-legacy',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderSystemsPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId(`systems-delete-${ID_SYS_AUTH}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`systems-delete-${ID_SYS_LEGACY}`)).not.toBeInTheDocument();
    });

    it('coexiste com o botão "Editar" quando o usuário tem ambas as permissões', async () => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION, SYSTEMS_DELETE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedResponse([makeSystem({ id: ID_SYS_AUTH })]),
      );

      renderSystemsPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId(`systems-edit-${ID_SYS_AUTH}`)).toBeInTheDocument();
      expect(screen.getByTestId(`systems-delete-${ID_SYS_AUTH}`)).toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_DELETE_PERMISSION];
    });

    it('clicar em "Desativar" abre o diálogo com nome e code do sistema', async () => {
      const system = makeSystem({
        id: ID_SYS_AUTH,
        name: 'lfc-authenticator',
        code: 'AUTH',
      });
      const client = createSystemsClientStub();
      await openDeleteConfirm(client, system);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Desativar sistema\?/i)).toBeInTheDocument();
      const description = screen.getByTestId('delete-system-description');
      expect(description).toHaveTextContent('lfc-authenticator');
      expect(description).toHaveTextContent('AUTH');
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildCloseCases`
     * (helper compartilhado com criação/edição) — diferença é só o
     * testId do botão Cancelar (`delete-system-cancel`). Lição PR #127:
     * `it.each` evita BLOCKER de duplicação Sonar para cenários com
     * mesma estrutura mudando 1-2 mocks.
     */
    const CLOSE_CASES = buildCloseCases('delete-system-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara DELETE', async ({ close }) => {
      const client = createSystemsClientStub();
      await openDeleteConfirm(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_DELETE_PERMISSION];
    });

    it('envia DELETE /systems/{id} com id correto, fecha modal, exibe toast verde e refaz listSystems', async () => {
      const target = makeSystem({
        id: ID_SYS_AUTH,
        name: 'lfc-authenticator',
        code: 'AUTH',
      });
      const client = createSystemsClientStub();
      // Fila de respostas: GET inicial → DELETE (204 → undefined) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedResponse([target]))
        .mockResolvedValueOnce(makePagedResponse([], { total: 0 }));
      client.delete.mockResolvedValueOnce(undefined);

      await openDeleteConfirm(client, target);
      await confirmDelete(client);

      expect(client.delete).toHaveBeenCalledWith(`/systems/${ID_SYS_AUTH}`, undefined);

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Sistema desativado." (status do ToastProvider).
      expect(await screen.findByText('Sistema desativado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_DELETE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Casos
     * comuns (401, 403, network) vêm do helper compartilhado
     * `buildSharedMutationErrorCases('desativar')` para evitar
     * duplicação literal com a futura suíte de #61 (`restaurar`)
     * — pré-projetar o helper agora antecipa #61 sem expandir escopo
     * de #60 (lição PR #128).
     *
     * Caso específico (404 — sistema removido entre abertura e
     * confirm) fica inline porque o comportamento difere: modal fecha
     * + dispara refetch (paridade com o tratamento de 404 no edit).
     */
    const ERROR_CASES: ReadonlyArray<SystemsErrorCase> = [
      {
        name: '404 (sistema já removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Sistema não encontrado.',
        },
        expectedText: 'Sistema não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
      ...buildSharedMutationErrorCases('desativar'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createSystemsClientStub();
        client.delete.mockRejectedValueOnce(error);

        await openDeleteConfirm(client);
        await confirmDelete(client);

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

    it('404 dispara refetch (onDeleted chamado mesmo em erro)', async () => {
      const client = createSystemsClientStub();
      // Fila: GET inicial → DELETE (404) → GET refetch após onDeleted.
      client.get
        .mockResolvedValueOnce(makePagedResponse([makeSystem()]))
        .mockResolvedValueOnce(makePagedResponse([], { total: 0 }));
      client.delete.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Sistema não encontrado.',
      } satisfies ApiError);

      await openDeleteConfirm(client);
      await confirmDelete(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});
