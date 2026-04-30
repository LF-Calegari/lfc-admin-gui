import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  assertRowActionAbsent,
  assertRowActionPresent,
  buildCloseCases,
  buildSharedMutationErrorCases,
  confirmRestore,
  createSystemsClientStub,
  ID_SYS_AUTH,
  ID_SYS_LEGACY,
  makePagedResponse,
  makeSystem,
  openRestoreConfirm,
  renderSystemsPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from './__helpers__/systemsTestHelpers';

import type { SystemsErrorCase } from './__helpers__/systemsTestHelpers';
import type { ApiError } from '@/shared/api';

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_RESTORE`. Reusa `buildAuthMock` (helper compartilhado
 * com listagem/criação/edição/desativação).
 *
 * Issue #61 — restauração via `POST /systems/{id}/restore` + modal de
 * confirmação (`RestoreSystemConfirm`). Última sub-issue da EPIC #45,
 * fechando o CRUD completo de sistemas.
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SYSTEMS_RESTORE_PERMISSION = 'AUTH_V1_SYSTEMS_RESTORE';
const SYSTEMS_DELETE_PERMISSION = 'AUTH_V1_SYSTEMS_DELETE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('SystemsPage — restaurar (Issue #61)', () => {
  describe('gating do botão "Restaurar" por linha', () => {
    it('não exibe botões "Restaurar" quando o usuário não possui AUTH_V1_SYSTEMS_RESTORE', async () => {
      permissionsMock = [];
      await assertRowActionAbsent(createSystemsClientStub(), 'restore');
    });

    it('exibe um botão "Restaurar" para cada linha soft-deletada quando o usuário possui AUTH_V1_SYSTEMS_RESTORE', async () => {
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION];
      await assertRowActionPresent(createSystemsClientStub(), 'restore', 'Restaurar');
    });

    it('NÃO exibe "Restaurar" em linhas ativas (deletedAt === null)', async () => {
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedResponse([
          // Ativa — botão NÃO deve aparecer (espelha a lógica inversa
          // do Desativar; só faz sentido restaurar linhas inativas).
          makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator' }),
          // Soft-deletada — botão deve aparecer.
          makeSystem({
            id: ID_SYS_LEGACY,
            name: 'lfc-legacy',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderSystemsPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId(`systems-restore-${ID_SYS_AUTH}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`systems-restore-${ID_SYS_LEGACY}`)).toBeInTheDocument();
    });

    it('coexiste com o botão "Desativar" só na linha onde faz sentido (delete em ativa, restore em inativa)', async () => {
      // Caso real do toggle "Mostrar inativos": as duas ações aparecem
      // na mesma tabela, mas cada uma em sua linha apropriada.
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION, SYSTEMS_DELETE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedResponse([
          makeSystem({ id: ID_SYS_AUTH, name: 'lfc-authenticator' }),
          makeSystem({
            id: ID_SYS_LEGACY,
            name: 'lfc-legacy',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderSystemsPage(client);
      await waitForInitialList(client);

      // Linha ativa: Desativar visível, Restaurar oculto.
      expect(screen.getByTestId(`systems-delete-${ID_SYS_AUTH}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`systems-restore-${ID_SYS_AUTH}`)).not.toBeInTheDocument();

      // Linha inativa: Restaurar visível, Desativar oculto.
      expect(screen.queryByTestId(`systems-delete-${ID_SYS_LEGACY}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`systems-restore-${ID_SYS_LEGACY}`)).toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION];
    });

    it('clicar em "Restaurar" abre o diálogo com nome e code do sistema', async () => {
      const system = makeSystem({
        id: ID_SYS_LEGACY,
        name: 'lfc-legacy',
        code: 'LEGACY',
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createSystemsClientStub();
      await openRestoreConfirm(client, system);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Restaurar sistema\?/i)).toBeInTheDocument();
      const description = screen.getByTestId('restore-system-description');
      expect(description).toHaveTextContent('lfc-legacy');
      expect(description).toHaveTextContent('LEGACY');
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` reusando `buildCloseCases`
     * (helper compartilhado com criação/edição/desativação) — diferença
     * é só o testId do botão Cancelar (`restore-system-cancel`). Lição
     * PR #127: `it.each` evita BLOCKER de duplicação Sonar para
     * cenários com mesma estrutura mudando 1-2 mocks.
     */
    const CLOSE_CASES = buildCloseCases('restore-system-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara POST', async ({ close }) => {
      const client = createSystemsClientStub();
      await openRestoreConfirm(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION];
    });

    it('envia POST /systems/{id}/restore com id correto, fecha modal, exibe toast verde e refaz listSystems', async () => {
      const target = makeSystem({
        id: ID_SYS_LEGACY,
        name: 'lfc-legacy',
        code: 'LEGACY',
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createSystemsClientStub();
      // Fila de respostas:
      //   GET inicial → POST /restore (200 com `{message}` — que descartamos) → GET refetch.
      // O backend devolve `{ message: "Sistema restaurado com sucesso." }`,
      // mas como `restoreSystem` retorna `void`, o teste só precisa que
      // o `client.post` resolva — usamos `undefined` por simplicidade.
      client.get
        .mockResolvedValueOnce(makePagedResponse([target]))
        .mockResolvedValueOnce(makePagedResponse([], { total: 0 }));
      client.post.mockResolvedValueOnce(undefined);

      await openRestoreConfirm(client, target);
      await confirmRestore(client);

      // POST com path correto e body undefined (backend não exige corpo).
      expect(client.post).toHaveBeenCalledWith(
        `/systems/${ID_SYS_LEGACY}/restore`,
        undefined,
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Sistema restaurado." (status do ToastProvider).
      expect(await screen.findByText('Sistema restaurado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_RESTORE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127). Casos
     * comuns (401, 403, network) vêm do helper compartilhado
     * `buildSharedMutationErrorCases('restaurar')` para evitar
     * duplicação literal com a suíte de #60 (`desativar`).
     *
     * Caso específico (404 — sistema não encontrado ou já ativo) fica
     * inline porque o comportamento difere: modal fecha + dispara
     * refetch (paridade com o tratamento de 404 no edit/delete). O
     * backend devolve 404 com mensagem específica em ambas as
     * situações: registro inexistente OU já ativo.
     */
    const ERROR_CASES: ReadonlyArray<SystemsErrorCase> = [
      {
        name: '404 (sistema não encontrado ou já ativo) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Sistema não encontrado ou não está deletado.',
        },
        expectedText: 'Sistema não encontrado ou já está ativo.',
        modalStaysOpen: false,
      },
      ...buildSharedMutationErrorCases('restaurar'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createSystemsClientStub();
        client.post.mockRejectedValueOnce(error);

        await openRestoreConfirm(client);
        await confirmRestore(client);

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

    it('404 dispara refetch (onRestored chamado mesmo em erro)', async () => {
      const target = makeSystem({
        id: ID_SYS_LEGACY,
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createSystemsClientStub();
      // Fila: GET inicial → POST (404) → GET refetch após onRestored.
      client.get
        .mockResolvedValueOnce(makePagedResponse([target]))
        .mockResolvedValueOnce(makePagedResponse([], { total: 0 }));
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Sistema não encontrado ou não está deletado.',
      } satisfies ApiError);

      await openRestoreConfirm(client, target);
      await confirmRestore(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});
