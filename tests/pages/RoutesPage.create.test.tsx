import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  buildRoutesCloseCases,
  buildSharedRouteSubmitErrorCases,
  createRoutesClientStub,
  fillNewRouteForm,
  ID_ROUTE_CREATE,
  ID_SYS_AUTH,
  ID_TOKEN_TYPE_ADMIN,
  ID_TOKEN_TYPE_DEFAULT,
  makeRoute,
  makeTokenType,
  mockOpenCreateModalResponses,
  openCreateRouteModal,
  renderRoutesPage,
  submitNewRouteForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from './__helpers__/routesTestHelpers';

import type { RoutesErrorCase } from './__helpers__/routesTestHelpers';

/**
 * Suíte da `RoutesPage` — caminho de criação (Issue #63, EPIC #46).
 *
 * Espelha a estratégia de `SystemsPage.create.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<RoutesPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `routesTestHelpers.tsx` para colapsar
 *   o boilerplate "abrir modal → preencher → submeter" (lição PR #127
 *   — Sonar marca repetição de 5+ linhas em 2+ testes como
 *   `New Code Duplication`).
 *
 * O backend Routes tem 4 campos (`name`/`code`/`description`/
 * `systemTokenTypeId`) contra 3 do Systems — o `<Select>` da
 * "política JWT alvo" introduz testes adicionais (carregamento da
 * lista, lista vazia, fallback de erro).
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const ROUTES_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_ROUTES_CREATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('RoutesPage — criação (Issue #63)', () => {
  describe('gating do botão "Nova rota"', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_SYSTEMS_ROUTES_CREATE', async () => {
      permissionsMock = [];
      const client = createRoutesClientStub();
      mockOpenCreateModalResponses(client);

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('routes-create-open')).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_SYSTEMS_ROUTES_CREATE', async () => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
      const client = createRoutesClientStub();
      mockOpenCreateModalResponses(client);

      renderRoutesPage(client);
      await waitForInitialList(client);

      const openBtn = screen.getByTestId('routes-create-open');
      expect(openBtn).toBeInTheDocument();
      expect(openBtn).toHaveTextContent(/Nova rota/i);
    });
  });

  describe('abertura e fechamento do modal', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
    });

    it('clicar em "Nova rota" abre o diálogo com os campos do form', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('new-route-name')).toBeInTheDocument();
      expect(screen.getByTestId('new-route-code')).toBeInTheDocument();
      expect(screen.getByTestId('new-route-description')).toBeInTheDocument();
      expect(screen.getByTestId('new-route-system-token-type-id')).toBeInTheDocument();
    });

    /**
     * Cenários de fechamento sem persistir — Esc, botão Cancelar e
     * clique no backdrop. Colapsados em `it.each` (lição PR #123 — a
     * mesma estrutura mudando apenas 1 ação dispara duplicação Sonar
     * quando deixada como `it` separados). Pré-fabricado
     * `buildRoutesCloseCases` para a suíte de edição (#64) reusar.
     */
    const CLOSE_CASES = buildRoutesCloseCases('new-route-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara POST', async ({ close }) => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      close();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('carregamento de token types', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
    });

    it('chama GET /tokens/types ao abrir o modal e popula o <Select>', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client, {
        tokenTypes: [
          makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT, name: 'Acesso padrão', code: 'default' }),
          makeTokenType({ id: ID_TOKEN_TYPE_ADMIN, name: 'Administração', code: 'admin' }),
        ],
      });

      const select = screen.getByTestId('new-route-system-token-type-id') as HTMLSelectElement;
      // Placeholder + 2 options reais.
      expect(select.options.length).toBe(3);
      expect(select.options[0].value).toBe('');
      expect(select.options[1].value).toBe(ID_TOKEN_TYPE_DEFAULT);
      expect(select.options[1].textContent).toBe('Acesso padrão');
      expect(select.options[2].value).toBe(ID_TOKEN_TYPE_ADMIN);
      expect(select.options[2].textContent).toBe('Administração');
    });

    it('filtra token types soft-deletados antes de popular o <Select>', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client, {
        tokenTypes: [
          makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT, name: 'Ativo' }),
          makeTokenType({
            id: ID_TOKEN_TYPE_ADMIN,
            name: 'Inativo',
            deletedAt: '2026-02-01T00:00:00Z',
          }),
        ],
      });

      const select = screen.getByTestId('new-route-system-token-type-id') as HTMLSelectElement;
      // Placeholder + 1 option (o inativo foi filtrado).
      expect(select.options.length).toBe(2);
      expect(select.options[1].value).toBe(ID_TOKEN_TYPE_DEFAULT);
    });

    it('exibe Alert quando GET /tokens/types falha e bloqueia o submit', async () => {
      const client = createRoutesClientStub();
      // GET inicial OK + GET de token types falhando.
      client.get
        .mockResolvedValueOnce({ data: [makeRoute()], page: 1, pageSize: 20, total: 1 })
        .mockRejectedValueOnce({
          kind: 'http',
          status: 500,
          message: 'Erro do servidor.',
        });

      renderRoutesPage(client);
      await waitForInitialList(client);
      fireEvent.click(screen.getByTestId('routes-create-open'));

      // Aguarda a 2ª chamada (GET token types — rejeitada) e o form
      // aparecer (modal montado).
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.getByTestId('new-route-form')).toBeInTheDocument();
      });
      // Mensagem do Alert do tokenTypesError. Asserir por texto em
      // vez de testid porque o `Alert` do design system não propaga
      // `data-testid` para o nó renderizado — pesquisamos pela copy.
      expect(
        await screen.findByText(/Não foi possível carregar a lista de políticas JWT/i),
      ).toBeInTheDocument();
      // Botão de submit está desabilitado.
      expect(screen.getByTestId('new-route-submit')).toBeDisabled();
    });

    it('exibe Alert quando o backend devolve lista vazia de token types ativos', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client, { tokenTypes: [] });

      expect(
        await screen.findByText(/Nenhuma política JWT ativa disponível/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId('new-route-submit')).toBeDisabled();
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
    });

    it('submeter com campos vazios mostra erros inline e não chama POST', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client);

      fireEvent.submit(screen.getByTestId('new-route-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Selecione a política JWT alvo.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('campos com apenas espaços também são tratados como vazios', async () => {
      const client = createRoutesClientStub();
      await openCreateRouteModal(client);

      fillNewRouteForm({
        name: '   ',
        code: '  ',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      fireEvent.submit(screen.getByTestId('new-route-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
    });

    it('envia POST /systems/routes com body trimado, fecha modal, exibe toast e refaz listRoutes', async () => {
      const created = makeRoute({
        id: ID_ROUTE_CREATE,
        name: 'Criar rota',
        code: 'AUTH_V1_ROUTES_CREATE',
        description: 'POST /api/v1/systems/routes',
      });
      const client = createRoutesClientStub();
      // Fila de respostas: GET inicial → GET token types → GET refetch (após sucesso) → POST.
      client.get
        .mockResolvedValueOnce({ data: [makeRoute()], page: 1, pageSize: 20, total: 1 })
        .mockResolvedValueOnce([makeTokenType()])
        .mockResolvedValueOnce({ data: [makeRoute(), created], page: 1, pageSize: 20, total: 2 });
      client.post.mockResolvedValueOnce(created);

      await openCreateRouteModal(client);

      fillNewRouteForm({
        name: '  Criar rota  ',
        code: '  AUTH_V1_ROUTES_CREATE  ',
        description: '  POST /api/v1/systems/routes  ',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      expect(client.post).toHaveBeenCalledWith(
        '/systems/routes',
        {
          systemId: ID_SYS_AUTH,
          name: 'Criar rota',
          code: 'AUTH_V1_ROUTES_CREATE',
          description: 'POST /api/v1/systems/routes',
          systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Rota criada." (status do ToastProvider).
      expect(await screen.findByText('Rota criada.')).toBeInTheDocument();

      // Refetch da lista (3º GET = 1º refetch após o GET inicial e o GET de token types).
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(3);
      });
    });

    it('envia body sem o campo description quando o usuário deixa vazio', async () => {
      const created = makeRoute({ name: 'Sem Desc', code: 'NODESC', description: null });
      const client = createRoutesClientStub();
      mockOpenCreateModalResponses(client);
      client.post.mockResolvedValueOnce(created);

      await openCreateRouteModal(client);

      fillNewRouteForm({
        name: 'Sem Desc',
        code: 'NODESC',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      const [, body] = client.post.mock.calls[0];
      expect(body).toEqual({
        systemId: ID_SYS_AUTH,
        name: 'Sem Desc',
        code: 'NODESC',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      expect(body).not.toHaveProperty('description');
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_CREATE_PERMISSION];
    });

    /**
     * Caso específico do create: 409 com mensagem inline customizada
     * citando "neste sistema" (o `NewRouteModal` substitui a mensagem
     * do backend pela copy local mais clara). Os 5 cenários comuns
     * (400 com/sem errors, 401, 403, network) vêm de
     * `buildSharedRouteSubmitErrorCases('criar')` — diferenciam apenas
     * no verbo e ficavam duplicados literalmente entre create e edit
     * (lição PR #128 sobre 4ª recorrência de duplicação Sonar).
     */
    const ERROR_CASES: ReadonlyArray<RoutesErrorCase> = [
      {
        name: '409 (code duplicado) exibe mensagem inline no campo code',
        error: {
          kind: 'http',
          status: 409,
          message: 'Já existe uma route com este Code.',
        },
        expectedText: 'Já existe uma rota com este código neste sistema.',
      },
      ...buildSharedRouteSubmitErrorCases('criar'),
    ];

    it.each(ERROR_CASES)('mapeia $name', async ({ error, expectedText, modalStaysOpen = true }) => {
      const client = createRoutesClientStub();
      mockOpenCreateModalResponses(client);
      client.post.mockRejectedValueOnce(error);

      await openCreateRouteModal(client);
      // Valores válidos para passar a validação client-side; o teste
      // foca no comportamento de erro vindo do backend, não na
      // validação local.
      fillNewRouteForm({
        name: 'Alguma rota',
        code: 'CODE',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      await submitNewRouteForm(client);

      expect(await screen.findByText(toCaseInsensitiveMatcher(expectedText))).toBeInTheDocument();

      if (modalStaysOpen) {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      }
    });
  });
});
