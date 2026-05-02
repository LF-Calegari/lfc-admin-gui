import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `buildAuthMock` precisa ser importado **antes** de
// `clientsTestHelpers` para que `vi.mock('@/shared/auth', () =>
// buildAuthMock(...))` consiga resolver a factory durante o hoisting
// — sem isso, o teste falha com `Cannot access '__vi_import_2__'
// before initialization`. Quebra a ordem alfabética de `import/order`
// por necessidade de hoisting do Vitest — espelha o padrão usado em
// `SystemsPage.delete.test.tsx`.
/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  buildClientsMutationErrorCases,
  confirmDeleteClient,
  confirmRestoreClient,
  createClientsClientStub,
  ID_CLIENT_PF_ANA,
  ID_CLIENT_PJ_ACME,
  makeClient,
  makeClientPj,
  makePagedClientsResponse,
  openDeleteClientConfirm,
  openRestoreClientConfirm,
  renderClientsListPage,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from '../__helpers__/clientsTestHelpers';
/* eslint-enable import/order */

import type { ClientsErrorCase } from '../__helpers__/clientsTestHelpers';
import type { ApiError } from '@/shared/api';

/**
 * Suíte de delete/restore da `ClientsListShellPage` (Issue #76, EPIC
 * #49 — fecha o CRUD básico de clientes ao adicionar
 * desativação/restauração via modal de confirmação).
 *
 * Estratégia espelha `SystemsPage.delete.test.tsx`/
 * `SystemsPage.restore.test.tsx`: stub de `ApiClient`, asserts sobre
 * gating por permissão, abertura/fechamento do modal, fluxo de
 * sucesso (DELETE/POST + refetch + toast) e mapeamento de erros
 * (`it.each` reusando `buildClientsMutationErrorCases` para evitar
 * duplicação Sonar — lição PR #128).
 *
 * O modal compartilhado é `MutationConfirmModal` (em
 * `src/pages/systems/`), reusado via
 * `DeleteClientConfirm`/`RestoreClientConfirm` — testar o shell
 * direto seria redundante (já coberto pela suíte de Systems);
 * focamos no comportamento específico do recurso Cliente (gating,
 * copy, integração com `ClientsListShellPage`).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const CLIENTS_DELETE_PERMISSION = 'AUTH_V1_CLIENTS_DELETE';
const CLIENTS_RESTORE_PERMISSION = 'AUTH_V1_CLIENTS_RESTORE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('ClientsListShellPage — desativar (Issue #76)', () => {
  describe('gating do botão "Desativar" por linha', () => {
    it('não exibe botões "Desativar" quando o usuário não possui AUTH_V1_CLIENTS_DELETE', async () => {
      permissionsMock = [];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([makeClient({ id: ID_CLIENT_PF_ANA })]),
      );
      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`clients-delete-${ID_CLIENT_PF_ANA}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Desativar" para cada linha ativa quando o usuário possui AUTH_V1_CLIENTS_DELETE', async () => {
      permissionsMock = [CLIENTS_DELETE_PERMISSION];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({ id: ID_CLIENT_PF_ANA, fullName: 'Ana Cliente' }),
          makeClientPj({
            id: ID_CLIENT_PJ_ACME,
            corporateName: 'Acme Indústria S/A',
          }),
        ]),
      );
      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.getByTestId(`clients-delete-${ID_CLIENT_PF_ANA}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`clients-delete-${ID_CLIENT_PJ_ACME}`),
      ).toBeInTheDocument();
    });

    it('NÃO exibe "Desativar" em linhas já soft-deletadas (deletedAt != null)', async () => {
      permissionsMock = [CLIENTS_DELETE_PERMISSION];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({ id: ID_CLIENT_PF_ANA, fullName: 'Ana Cliente' }),
          makeClient({
            id: ID_CLIENT_PJ_ACME,
            type: 'PJ',
            cpf: null,
            fullName: null,
            cnpj: '12345678000190',
            corporateName: 'Acme Indústria S/A',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.getByTestId(`clients-delete-${ID_CLIENT_PF_ANA}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`clients-delete-${ID_CLIENT_PJ_ACME}`),
      ).not.toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_DELETE_PERMISSION];
    });

    it('clicar em "Desativar" abre o diálogo com nome e documento do cliente', async () => {
      const target = makeClient({
        id: ID_CLIENT_PF_ANA,
        fullName: 'Ana Cliente',
        cpf: '12345678901',
      });
      const client = createClientsClientStub();
      await openDeleteClientConfirm(client, target);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/Desativar cliente\?/i),
      ).toBeInTheDocument();
      const description = screen.getByTestId('delete-client-description');
      expect(description).toHaveTextContent('Ana Cliente');
      expect(description).toHaveTextContent('12345678901');
    });

    it('Esc fecha o modal sem disparar DELETE', async () => {
      const client = createClientsClientStub();
      await openDeleteClientConfirm(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // eslint-disable-next-line no-restricted-globals
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.delete).not.toHaveBeenCalled();
    });

    it('botão Cancelar fecha o modal sem disparar DELETE', async () => {
      const client = createClientsClientStub();
      await openDeleteClientConfirm(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('delete-client-cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_DELETE_PERMISSION];
    });

    it('envia DELETE /clients/{id} com id correto, fecha modal, exibe toast verde e refaz listClients', async () => {
      const target = makeClient({
        id: ID_CLIENT_PF_ANA,
        fullName: 'Ana Cliente',
        cpf: '12345678901',
      });
      const client = createClientsClientStub();
      // Fila de respostas: GET inicial → DELETE (204 → undefined) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedClientsResponse([target]))
        .mockResolvedValueOnce(makePagedClientsResponse([], { total: 0 }));
      client.delete.mockResolvedValueOnce(undefined);

      await openDeleteClientConfirm(client, target);
      await confirmDeleteClient(client);

      expect(client.delete).toHaveBeenCalledWith(
        `/clients/${ID_CLIENT_PF_ANA}`,
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Cliente desativado." (status do ToastProvider).
      expect(
        await screen.findByText('Cliente desativado.'),
      ).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_DELETE_PERMISSION];
    });

    /**
     * Casos compartilhados (401, 403, network) reusam
     * `buildClientsMutationErrorCases('desativar')` para evitar
     * duplicação literal com a suíte de restauração — lição PR #128.
     *
     * Casos específicos (404 fecha modal + refetch; 409 conflito por
     * usuários vinculados — defensivo, critério #76) ficam inline
     * porque o comportamento difere.
     */
    const ERROR_CASES: ReadonlyArray<ClientsErrorCase> = [
      {
        name: '404 (cliente já removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Cliente não encontrado.',
        },
        expectedText:
          'Cliente não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
      {
        name: '409 (usuários ativos vinculados) exibe toast com mensagem do backend',
        error: {
          kind: 'http',
          status: 409,
          message: 'Cliente possui usuários ativos vinculados.',
        },
        expectedText: 'Cliente possui usuários ativos vinculados.',
      },
      ...buildClientsMutationErrorCases('desativar'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createClientsClientStub();
        client.delete.mockRejectedValueOnce(error);

        await openDeleteClientConfirm(client);
        await confirmDeleteClient(client);

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
      const client = createClientsClientStub();
      // Fila: GET inicial → DELETE (404) → GET refetch após onDeleted.
      client.get
        .mockResolvedValueOnce(makePagedClientsResponse([makeClient()]))
        .mockResolvedValueOnce(makePagedClientsResponse([], { total: 0 }));
      client.delete.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Cliente não encontrado.',
      } satisfies ApiError);

      await openDeleteClientConfirm(client);
      await confirmDeleteClient(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});

describe('ClientsListShellPage — restaurar (Issue #76)', () => {
  describe('gating do botão "Restaurar" por linha', () => {
    it('não exibe botões "Restaurar" quando o usuário não possui AUTH_V1_CLIENTS_RESTORE', async () => {
      permissionsMock = [];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({
            id: ID_CLIENT_PF_ANA,
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );
      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`clients-restore-${ID_CLIENT_PF_ANA}`),
      ).not.toBeInTheDocument();
    });

    it('exibe botão "Restaurar" para cada linha soft-deletada quando o usuário possui AUTH_V1_CLIENTS_RESTORE', async () => {
      permissionsMock = [CLIENTS_RESTORE_PERMISSION];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({
            id: ID_CLIENT_PF_ANA,
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );
      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.getByTestId(`clients-restore-${ID_CLIENT_PF_ANA}`),
      ).toBeInTheDocument();
    });

    it('NÃO exibe "Restaurar" em linhas ativas (deletedAt === null)', async () => {
      permissionsMock = [CLIENTS_RESTORE_PERMISSION];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({ id: ID_CLIENT_PF_ANA }),
          makeClient({
            id: ID_CLIENT_PJ_ACME,
            type: 'PJ',
            cpf: null,
            fullName: null,
            cnpj: '12345678000190',
            corporateName: 'Acme Indústria S/A',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderClientsListPage(client);
      await waitForInitialList(client);

      expect(
        screen.queryByTestId(`clients-restore-${ID_CLIENT_PF_ANA}`),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId(`clients-restore-${ID_CLIENT_PJ_ACME}`),
      ).toBeInTheDocument();
    });

    it('coexiste com o botão "Desativar" só na linha onde faz sentido', async () => {
      // Caso real do toggle "Mostrar inativos": as duas ações aparecem
      // na mesma tabela, mas cada uma em sua linha apropriada.
      permissionsMock = [
        CLIENTS_DELETE_PERMISSION,
        CLIENTS_RESTORE_PERMISSION,
      ];
      const client = createClientsClientStub();
      client.get.mockResolvedValueOnce(
        makePagedClientsResponse([
          makeClient({ id: ID_CLIENT_PF_ANA }),
          makeClient({
            id: ID_CLIENT_PJ_ACME,
            type: 'PJ',
            cpf: null,
            fullName: null,
            cnpj: '12345678000190',
            corporateName: 'Acme Indústria S/A',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ]),
      );

      renderClientsListPage(client);
      await waitForInitialList(client);

      // Linha ativa: Desativar visível, Restaurar oculto.
      expect(
        screen.getByTestId(`clients-delete-${ID_CLIENT_PF_ANA}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(`clients-restore-${ID_CLIENT_PF_ANA}`),
      ).not.toBeInTheDocument();

      // Linha inativa: Restaurar visível, Desativar oculto.
      expect(
        screen.queryByTestId(`clients-delete-${ID_CLIENT_PJ_ACME}`),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId(`clients-restore-${ID_CLIENT_PJ_ACME}`),
      ).toBeInTheDocument();
    });
  });

  describe('abertura do diálogo de confirmação', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_RESTORE_PERMISSION];
    });

    it('clicar em "Restaurar" abre o diálogo com nome e documento do cliente', async () => {
      const target = makeClient({
        id: ID_CLIENT_PF_ANA,
        fullName: 'Ana Cliente',
        cpf: '12345678901',
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createClientsClientStub();
      await openRestoreClientConfirm(client, target);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(/Restaurar cliente\?/i),
      ).toBeInTheDocument();
      const description = screen.getByTestId('restore-client-description');
      expect(description).toHaveTextContent('Ana Cliente');
      expect(description).toHaveTextContent('12345678901');
    });
  });

  describe('confirmação bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_RESTORE_PERMISSION];
    });

    it('envia POST /clients/{id}/restore com id correto, fecha modal, exibe toast verde e refaz listClients', async () => {
      const target = makeClient({
        id: ID_CLIENT_PF_ANA,
        fullName: 'Ana Cliente',
        cpf: '12345678901',
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createClientsClientStub();
      // Fila de respostas:
      //   GET inicial → POST /restore (200 com `{message}` — descartado) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedClientsResponse([target]))
        .mockResolvedValueOnce(makePagedClientsResponse([], { total: 0 }));
      client.post.mockResolvedValueOnce(undefined);

      await openRestoreClientConfirm(client, target);
      await confirmRestoreClient(client);

      expect(client.post).toHaveBeenCalledWith(
        `/clients/${ID_CLIENT_PF_ANA}/restore`,
        undefined,
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Cliente restaurado."
      expect(
        await screen.findByText('Cliente restaurado.'),
      ).toBeInTheDocument();

      // Refetch da lista.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [CLIENTS_RESTORE_PERMISSION];
    });

    /**
     * Casos compartilhados (401, 403, network) reusam
     * `buildClientsMutationErrorCases('restaurar')` — lição PR #128.
     * Caso específico 404 (cliente não encontrado ou já ativo) fica
     * inline porque o comportamento difere (modal fecha + refetch).
     */
    const ERROR_CASES: ReadonlyArray<ClientsErrorCase> = [
      {
        name: '404 (cliente não encontrado ou já ativo) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Cliente não encontrado ou não está deletado.',
        },
        expectedText: 'Cliente não encontrado ou já está ativo.',
        modalStaysOpen: false,
      },
      ...buildClientsMutationErrorCases('restaurar'),
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createClientsClientStub();
        client.post.mockRejectedValueOnce(error);

        await openRestoreClientConfirm(client);
        await confirmRestoreClient(client);

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
      const target = makeClient({
        id: ID_CLIENT_PF_ANA,
        deletedAt: '2026-02-01T00:00:00Z',
      });
      const client = createClientsClientStub();
      // Fila: GET inicial → POST (404) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedClientsResponse([target]))
        .mockResolvedValueOnce(makePagedClientsResponse([], { total: 0 }));
      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Cliente não encontrado ou não está deletado.',
      } satisfies ApiError);

      await openRestoreClientConfirm(client, target);
      await confirmRestoreClient(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});
