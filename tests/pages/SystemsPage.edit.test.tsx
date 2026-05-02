import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  assertRowActionAbsent,
  assertRowActionPresent,
  buildCloseCases,
  buildSharedSubmitErrorCases,
  createSystemsClientStub,
  fillEditSystemForm,
  ID_SYS_AUTH,
  makePagedResponse,
  makeSystem,
  openEditModal,
  submitEditSystemForm,
  toCaseInsensitiveMatcher,
} from './__helpers__/systemsTestHelpers';

import type { SystemsErrorCase } from './__helpers__/systemsTestHelpers';
import type { ApiError } from '@/shared/api';

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_UPDATE`. Reusa `buildAuthMock` (helper compartilhado
 * entre listagem, criação e agora edição).
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SYSTEMS_UPDATE_PERMISSION = 'AUTH_V1_SYSTEMS_UPDATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('SystemsPage — edição (Issue #59)', () => {
  describe('gating do botão "Editar" por linha', () => {
    it('não exibe botões "Editar" quando o usuário não possui AUTH_V1_SYSTEMS_UPDATE', async () => {
      permissionsMock = [];
      await assertRowActionAbsent(createSystemsClientStub(), 'edit');
    });

    it('exibe um botão "Editar" para cada linha quando o usuário possui AUTH_V1_SYSTEMS_UPDATE', async () => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION];
      await assertRowActionPresent(createSystemsClientStub(), 'edit', 'Editar');
    });
  });

  describe('abertura e pré-preenchimento do modal', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION];
    });

    it('clicar em "Editar" abre o diálogo pré-populado com os dados do sistema', async () => {
      const system = makeSystem({
        id: ID_SYS_AUTH,
        name: 'lfc-authenticator',
        code: 'AUTH',
        description: 'Serviço de autenticação JWT.',
      });
      const client = createSystemsClientStub();
      await openEditModal(client, system);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('edit-system-name')).toHaveValue('lfc-authenticator');
      expect(screen.getByTestId('edit-system-code')).toHaveValue('AUTH');
      expect(screen.getByTestId('edit-system-description')).toHaveValue(
        'Serviço de autenticação JWT.',
      );
    });

    it('aceita sistema sem description (description=null vira string vazia)', async () => {
      const system = makeSystem({ description: null });
      const client = createSystemsClientStub();
      await openEditModal(client, system);

      expect(screen.getByTestId('edit-system-description')).toHaveValue('');
    });

    /**
     * Cenários de fechamento sem persistir — Esc, Cancelar e clique no
     * backdrop. Colapsados em `it.each` para evitar BLOCKER de
     * duplicação Sonar (lição PR #123/#127). Reusa `buildCloseCases`
     * compartilhado com a suíte de criação — diferença é só o testId do
     * botão Cancelar.
     */
    const CLOSE_CASES = buildCloseCases('edit-system-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara PUT', async ({ close }) => {
      const client = createSystemsClientStub();
      await openEditModal(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION];
    });

    it('apagar campos obrigatórios mostra erros inline e não chama PUT', async () => {
      const client = createSystemsClientStub();
      await openEditModal(client);

      // Pré-populado vem com name/code preenchidos. Apagar tudo deve
      // disparar a mesma validação que o create.
      fillEditSystemForm({ name: '', code: '' });
      fireEvent.submit(screen.getByTestId('edit-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('campos com apenas espaços também são tratados como vazios', async () => {
      const client = createSystemsClientStub();
      await openEditModal(client);

      fillEditSystemForm({ name: '   ', code: '  ' });
      fireEvent.submit(screen.getByTestId('edit-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('descrição maior que 500 caracteres mostra erro inline', async () => {
      const client = createSystemsClientStub();
      await openEditModal(client);

      // Forçamos via `fireEvent.change` mesmo com `maxLength` no input —
      // a validação client-side roda no submit, então o erro aparece
      // mesmo que o usuário cole texto bypassing o `maxLength`.
      const longDesc = 'x'.repeat(501);
      fillEditSystemForm({ description: longDesc });
      fireEvent.submit(screen.getByTestId('edit-system-form'));

      expect(
        screen.getByText('Descrição deve ter no máximo 500 caracteres.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION];
    });

    it('envia PUT /systems/{id} com body trimado, fecha modal, exibe toast e refaz listSystems', async () => {
      const original = makeSystem({
        id: ID_SYS_AUTH,
        name: 'lfc-authenticator',
        code: 'AUTH',
        description: null,
      });
      const updated = makeSystem({
        id: ID_SYS_AUTH,
        name: 'lfc-authenticator-v2',
        code: 'AUTHV2',
        description: 'Versão atualizada.',
      });
      const client = createSystemsClientStub();
      // Fila de respostas: GET inicial → PUT → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedResponse([original]))
        .mockResolvedValueOnce(makePagedResponse([updated]));
      client.put.mockResolvedValueOnce(updated);

      await openEditModal(client, original);

      fillEditSystemForm({
        name: '  lfc-authenticator-v2  ',
        code: '  AUTHV2  ',
        description: '  Versão atualizada.  ',
      });
      await submitEditSystemForm(client);

      expect(client.put).toHaveBeenCalledWith(
        `/systems/${ID_SYS_AUTH}`,
        {
          name: 'lfc-authenticator-v2',
          code: 'AUTHV2',
          description: 'Versão atualizada.',
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Sistema atualizado." (status do ToastProvider).
      expect(await screen.findByText('Sistema atualizado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it('envia body sem description quando o usuário apaga o conteúdo', async () => {
      const original = makeSystem({
        id: ID_SYS_AUTH,
        name: 'Algum',
        code: 'X',
        description: 'algo',
      });
      const updated = makeSystem({ id: ID_SYS_AUTH, description: null });
      const client = createSystemsClientStub();
      client.put.mockResolvedValueOnce(updated);

      await openEditModal(client, original);

      fillEditSystemForm({ description: '' });
      await submitEditSystemForm(client);

      const [, body] = client.put.mock.calls[0];
      expect(body).toEqual({ name: 'Algum', code: 'X' });
      expect(body).not.toHaveProperty('description');
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127 — testes com
     * a mesma estrutura mudando 1-2 mocks são `it.each`, não `it`
     * separados). Espelha o `ERROR_CASES` de criação, com:
     * - 409 mensagem do update ("Já existe outro sistema com este Code.")
     * - novo caso 404 (sistema removido entre abertura e submit)
     * - copy do toast genérico adaptado para "atualizar"
     *
     * Guards comuns:
     * - `client.put` é chamado exatamente 1 vez (asserção feita pelo
     *   `submitEditSystemForm`).
     * - O modal segue aberto (default), exceto no 404 onde o modal
     *   fecha e o pai dispara refetch.
     *
     * O tipo `SystemsErrorCase` vem do helper compartilhado para evitar
     * duplicação com a suíte de criação (lição PR #127).
     */
    /**
     * Casos específicos do edit: 409 com mensagem `'Já existe outro
     * sistema...'` e 404 (sistema removido entre abertura e submit).
     * Os 5 cenários comuns (400 com/sem errors, 401, 403, network) vêm de
     * `buildSharedSubmitErrorCases('atualizar')` — diferenciam apenas no
     * verbo e ficavam duplicados literalmente entre create e edit
     * (lição PR #128 sobre 4ª recorrência de duplicação Sonar).
     */
    const ERROR_CASES: ReadonlyArray<SystemsErrorCase> = [
      {
        name: '409 (code duplicado) exibe mensagem inline no campo code',
        error: {
          kind: 'http',
          status: 409,
          message: 'Já existe outro sistema com este Code.',
        },
        expectedText: 'Já existe outro sistema com este Code.',
      },
      ...buildSharedSubmitErrorCases('atualizar'),
      {
        name: '404 (sistema removido) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Sistema não encontrado.',
        },
        expectedText: 'Sistema não encontrado ou foi removido. Atualize a lista.',
        modalStaysOpen: false,
      },
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createSystemsClientStub();
        client.put.mockRejectedValueOnce(error);

        await openEditModal(client);
        await submitEditSystemForm(client);

        expect(await screen.findByText(toCaseInsensitiveMatcher(expectedText))).toBeInTheDocument();

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
      const client = createSystemsClientStub();
      // Fila: GET inicial → PUT (404) → GET refetch após onUpdated.
      client.get
        .mockResolvedValueOnce(makePagedResponse([makeSystem()]))
        .mockResolvedValueOnce(makePagedResponse([], { total: 0 }));
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Sistema não encontrado.',
      } satisfies ApiError);

      await openEditModal(client);
      await submitEditSystemForm(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});
