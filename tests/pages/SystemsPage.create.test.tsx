import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  buildCloseCases,
  buildSharedSubmitErrorCases,
  createSystemsClientStub,
  fillNewSystemForm,
  makePagedResponse,
  makeSystem,
  openCreateModal,
  renderSystemsPage,
  submitNewSystemForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from './__helpers__/systemsTestHelpers';

import type { SystemsErrorCase } from './__helpers__/systemsTestHelpers';

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_CREATE`.
 *
 * Usamos `buildAuthMock` (helper compartilhado com a suíte de listagem)
 * passando um *getter* de permissions, porque `vi.mock` é içado pelo
 * Vitest antes dos imports e não pode capturar valores mutáveis
 * diretamente. O getter lê `permissionsMock` no momento da chamada de
 * `hasPermission`, permitindo alternar permissões dentro da mesma suíte.
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SYSTEMS_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_CREATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('SystemsPage — criação (Issue #58)', () => {
  describe('gating do botão "Novo sistema"', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_SYSTEMS_CREATE', async () => {
      permissionsMock = [];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderSystemsPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('systems-create-open')).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_SYSTEMS_CREATE', async () => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderSystemsPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId('systems-create-open')).toBeInTheDocument();
      expect(screen.getByTestId('systems-create-open')).toHaveTextContent(/Novo sistema/i);
    });
  });

  describe('abertura e fechamento do modal', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('clicar em "Novo sistema" abre o diálogo com os campos do form', async () => {
      const client = createSystemsClientStub();
      await openCreateModal(client);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-name')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-code')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-description')).toBeInTheDocument();
    });

    /**
     * Cenários de fechamento sem persistir — Esc, botão Cancelar e
     * clique no backdrop. Colapsados em `it.each` (lição PR #123 — a
     * mesma estrutura mudando apenas 1 ação dispara duplicação Sonar
     * quando deixada como `it` separados). Helper compartilhado com a
     * suíte de edição (`buildCloseCases`) para evitar duplicação do
     * array literal de 14 linhas (lição PR #127).
     */
    const CLOSE_CASES = buildCloseCases('new-system-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara POST', async ({ close }) => {
      const client = createSystemsClientStub();
      await openCreateModal(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('submeter com campos vazios mostra erros inline e não chama POST', async () => {
      const client = createSystemsClientStub();
      await openCreateModal(client);

      fireEvent.submit(screen.getByTestId('new-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('campos com apenas espaços também são tratados como vazios', async () => {
      const client = createSystemsClientStub();
      await openCreateModal(client);

      fillNewSystemForm({ name: '   ', code: '  ' });
      fireEvent.submit(screen.getByTestId('new-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('envia POST /systems com body trimado, fecha modal, exibe toast e refaz listSystems', async () => {
      const created = makeSystem({
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Novo Sistema',
        code: 'NEW',
        description: 'Sistema cadastrado pelo teste.',
      });
      const client = createSystemsClientStub();
      // Fila de respostas: GET inicial → GET refetch após sucesso → POST.
      client.get
        .mockResolvedValueOnce(makePagedResponse([makeSystem()]))
        .mockResolvedValueOnce(makePagedResponse([makeSystem(), created]));
      client.post.mockResolvedValueOnce(created);

      await openCreateModal(client);

      fillNewSystemForm({
        name: '  Novo Sistema  ',
        code: '  NEW  ',
        description: '  Sistema cadastrado pelo teste.  ',
      });
      await submitNewSystemForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/systems',
        {
          name: 'Novo Sistema',
          code: 'NEW',
          description: 'Sistema cadastrado pelo teste.',
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Sistema criado." (status do ToastProvider).
      expect(await screen.findByText('Sistema criado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it('envia body sem o campo description quando o usuário deixa vazio', async () => {
      const created = makeSystem({
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Sem Desc',
        code: 'NODESC',
      });
      const client = createSystemsClientStub();
      client.post.mockResolvedValueOnce(created);

      await openCreateModal(client);

      fillNewSystemForm({ name: 'Sem Desc', code: 'NODESC' });
      await submitNewSystemForm(client);

      const [, body] = client.post.mock.calls[0];
      expect(body).toEqual({ name: 'Sem Desc', code: 'NODESC' });
      expect(body).not.toHaveProperty('description');
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123 — testes com a
     * mesma estrutura mudando 1-2 mocks são `it.each`, não `it`
     * separados). Cada caso descreve o erro retornado pelo backend e a
     * asserção visível no UI.
     *
     * Guards comuns a todos os casos:
     * - `client.post` é chamado exatamente 1 vez (asserção feita pelo
     *   `submitNewSystemForm`).
     * - O modal segue aberto (usuário corrige inline ou tenta de novo).
     *
     * O tipo `SystemsErrorCase` vive em `__helpers__/systemsTestHelpers.tsx`
     * para ser reusado pela suíte de edição (#59) — mesmo padrão de
     * extração de tipos compartilhados aplicado em
     * `tests/shared/auth/__helpers__` (lição PR #127).
     */
    /**
     * Caso específico do create: 409 com mensagem `'Já existe um sistema...'`.
     * Os 5 cenários comuns (400 com/sem errors, 401, 403, network) vêm de
     * `buildSharedSubmitErrorCases('criar')` — diferenciam apenas no verbo
     * e ficavam duplicados literalmente entre create e edit (lição PR #128
     * sobre 4ª recorrência de duplicação Sonar).
     */
    const ERROR_CASES: ReadonlyArray<SystemsErrorCase> = [
      {
        name: '409 (code duplicado) exibe mensagem inline no campo code',
        error: {
          kind: 'http',
          status: 409,
          message: 'Já existe um sistema com este Code.',
        },
        expectedText: 'Já existe um sistema com este Code.',
      },
      ...buildSharedSubmitErrorCases('criar'),
    ];

    it.each(ERROR_CASES)('mapeia $name', async ({ error, expectedText, modalStaysOpen = true }) => {
      const client = createSystemsClientStub();
      client.post.mockRejectedValueOnce(error);

      await openCreateModal(client);
      // Valores genéricos válidos para passar a validação client-side; o
      // teste foca no comportamento de erro vindo do backend, não na
      // validação local.
      fillNewSystemForm({ name: 'Algum Sistema', code: 'CODE' });
      await submitNewSystemForm(client);

      expect(await screen.findByText(toCaseInsensitiveMatcher(expectedText))).toBeInTheDocument();

      if (modalStaysOpen) {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      }
    });
  });
});
