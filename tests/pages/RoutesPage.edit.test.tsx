import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  buildRoutesCloseCases,
  buildSharedRouteSubmitErrorCases,
  createRoutesClientStub,
  fillEditRouteForm,
  ID_ROUTE_LIST,
  ID_SYS_AUTH,
  ID_TOKEN_TYPE_ADMIN,
  ID_TOKEN_TYPE_DEFAULT,
  makePagedRoutes,
  makeRoute,
  makeTokenType,
  mockOpenEditModalResponses,
  openEditRouteModal,
  renderRoutesPage,
  submitEditRouteForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from './__helpers__/routesTestHelpers';

import type { RoutesErrorCase } from './__helpers__/routesTestHelpers';
import type { ApiError } from '@/shared/api';

/**
 * Suíte da `RoutesPage` — caminho de edição (Issue #64, EPIC #46).
 *
 * Espelha a estratégia de `SystemsPage.edit.test.tsx` e
 * `RoutesPage.create.test.tsx`:
 *
 * - Mock controlável de `useAuth` (`permissionsMock` mutável + getter
 *   no factory para que `vi.mock` capture o valor atual a cada
 *   `useAuth()`).
 * - Stub de `ApiClient` injetado em `<RoutesPage client={stub} />`
 *   isolando a página da camada de transporte real.
 * - Helpers compartilhados em `routesTestHelpers.tsx` para colapsar
 *   o boilerplate "abrir modal → preencher → submeter" e evitar
 *   `New Code Duplication` no Sonar (lição PR #134).
 *
 * Diferenças relativas à suíte de criação:
 *
 * - O modal é aberto pelo botão "Editar" da linha (gating combina
 *   permissão + `row.deletedAt === null`).
 * - O form vem pré-populado com os dados da rota.
 * - Erro 404 fecha o modal e dispara refetch (rota removida entre
 *   abertura e submit).
 * - Caso especial de token type referenciado inativo: aviso warning
 *   + opção sintética "(inativo)" no `<Select>` + submit desabilitado
 *   até o usuário trocar para uma política ativa.
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const ROUTES_UPDATE_PERMISSION = 'AUTH_V1_SYSTEMS_ROUTES_UPDATE';

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('RoutesPage — edição (Issue #64)', () => {
  describe('gating do botão "Editar" por linha', () => {
    it('não exibe botões "Editar" quando o usuário não possui AUTH_V1_SYSTEMS_ROUTES_UPDATE', async () => {
      permissionsMock = [];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(makePagedRoutes([makeRoute()]));

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId(`routes-edit-${ID_ROUTE_LIST}`)).not.toBeInTheDocument();
    });

    it('exibe botão "Editar" para linhas ativas quando o usuário possui AUTH_V1_SYSTEMS_ROUTES_UPDATE', async () => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(makePagedRoutes([makeRoute()]));

      renderRoutesPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId(`routes-edit-${ID_ROUTE_LIST}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-label', 'Editar rota Listar sistemas');
    });

    it('não exibe botão "Editar" em linhas soft-deletadas mesmo com permissão', async () => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
      const client = createRoutesClientStub();
      client.get.mockResolvedValueOnce(
        makePagedRoutes([makeRoute({ deletedAt: '2026-02-01T00:00:00Z' })]),
      );

      renderRoutesPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId(`routes-edit-${ID_ROUTE_LIST}`)).not.toBeInTheDocument();
    });
  });

  describe('abertura e pré-preenchimento do modal', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
    });

    it('clicar em "Editar" abre o diálogo pré-populado com os dados da rota', async () => {
      const route = makeRoute({
        id: ID_ROUTE_LIST,
        name: 'Listar sistemas',
        code: 'AUTH_V1_SYSTEMS_LIST',
        description: 'GET /api/v1/systems',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      const client = createRoutesClientStub();
      await openEditRouteModal(client, { route });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('edit-route-name')).toHaveValue('Listar sistemas');
      expect(screen.getByTestId('edit-route-code')).toHaveValue('AUTH_V1_SYSTEMS_LIST');
      expect(screen.getByTestId('edit-route-description')).toHaveValue('GET /api/v1/systems');
      expect(screen.getByTestId('edit-route-system-token-type-id')).toHaveValue(
        ID_TOKEN_TYPE_DEFAULT,
      );
    });

    it('aceita rota sem description (description=null vira string vazia)', async () => {
      const route = makeRoute({ description: null });
      const client = createRoutesClientStub();
      await openEditRouteModal(client, { route });

      expect(screen.getByTestId('edit-route-description')).toHaveValue('');
    });

    /**
     * Cenários de fechamento sem persistir — colapsados em `it.each`
     * via `buildRoutesCloseCases` para evitar BLOCKER de duplicação
     * Sonar (lição PR #123/#127). Reusa o mesmo helper da suíte de
     * criação — diferença é só o testId do botão Cancelar.
     */
    const CLOSE_CASES = buildRoutesCloseCases('edit-route-cancel');

    it.each(CLOSE_CASES)('fechar via $name não dispara PUT', async ({ close }) => {
      const client = createRoutesClientStub();
      await openEditRouteModal(client);
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
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
    });

    it('apagar campos obrigatórios mostra erros inline e não chama PUT', async () => {
      const client = createRoutesClientStub();
      await openEditRouteModal(client);

      fillEditRouteForm({ name: '', code: '' });
      fireEvent.submit(screen.getByTestId('edit-route-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('campos com apenas espaços também são tratados como vazios', async () => {
      const client = createRoutesClientStub();
      await openEditRouteModal(client);

      fillEditRouteForm({ name: '   ', code: '  ' });
      fireEvent.submit(screen.getByTestId('edit-route-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });

    it('descrição maior que 500 caracteres mostra erro inline', async () => {
      const client = createRoutesClientStub();
      await openEditRouteModal(client);

      // `fireEvent.change` ignora `maxLength` do input — a validação
      // client-side roda no submit, então o erro aparece mesmo se o
      // usuário colar texto bypassing o `maxLength`.
      const longDesc = 'x'.repeat(501);
      fillEditRouteForm({ description: longDesc });
      fireEvent.submit(screen.getByTestId('edit-route-form'));

      expect(
        screen.getByText('Descrição deve ter no máximo 500 caracteres.'),
      ).toBeInTheDocument();
      expect(client.put).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
    });

    it('envia PUT /systems/routes/{id} com body trimado, fecha modal, exibe toast e refaz listRoutes', async () => {
      const original = makeRoute({
        id: ID_ROUTE_LIST,
        name: 'Listar sistemas',
        code: 'AUTH_V1_SYSTEMS_LIST',
        description: null,
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      const updated = makeRoute({
        id: ID_ROUTE_LIST,
        name: 'Listar sistemas v2',
        code: 'AUTH_V1_SYSTEMS_LIST_V2',
        description: 'Versão atualizada.',
        systemTokenTypeId: ID_TOKEN_TYPE_ADMIN,
      });
      const client = createRoutesClientStub();
      // Fila: GET inicial → GET token types → GET refetch → PUT.
      client.get
        .mockResolvedValueOnce(makePagedRoutes([original]))
        .mockResolvedValueOnce([
          makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT }),
          makeTokenType({ id: ID_TOKEN_TYPE_ADMIN, name: 'Administração', code: 'admin' }),
        ])
        .mockResolvedValueOnce(makePagedRoutes([updated]));
      client.put.mockResolvedValueOnce(updated);

      await openEditRouteModal(client, { route: original });

      fillEditRouteForm({
        name: '  Listar sistemas v2  ',
        code: '  AUTH_V1_SYSTEMS_LIST_V2  ',
        description: '  Versão atualizada.  ',
        systemTokenTypeId: ID_TOKEN_TYPE_ADMIN,
      });
      await submitEditRouteForm(client);

      expect(client.put).toHaveBeenCalledWith(
        `/systems/routes/${ID_ROUTE_LIST}`,
        {
          systemId: ID_SYS_AUTH,
          name: 'Listar sistemas v2',
          code: 'AUTH_V1_SYSTEMS_LIST_V2',
          description: 'Versão atualizada.',
          systemTokenTypeId: ID_TOKEN_TYPE_ADMIN,
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Rota atualizada.".
      expect(await screen.findByText('Rota atualizada.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 3ª vez (inicial +
      // token types + refetch).
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(3);
      });
    });

    it('envia body sem description quando o usuário apaga o conteúdo', async () => {
      const original = makeRoute({
        id: ID_ROUTE_LIST,
        description: 'algo',
      });
      const updated = makeRoute({ id: ID_ROUTE_LIST, description: null });
      const client = createRoutesClientStub();
      client.put.mockResolvedValueOnce(updated);

      await openEditRouteModal(client, { route: original });

      fillEditRouteForm({ description: '' });
      await submitEditRouteForm(client);

      const [, body] = client.put.mock.calls[0];
      expect(body).toEqual({
        systemId: ID_SYS_AUTH,
        name: 'Listar sistemas',
        code: 'AUTH_V1_SYSTEMS_LIST',
        systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT,
      });
      expect(body).not.toHaveProperty('description');
    });
  });

  describe('token type referenciado inativo', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
    });

    it('exibe Alert warning + opção "(inativo)" no <Select> e desabilita submit até trocar', async () => {
      // Rota referencia um token type que não está mais entre os
      // ativos (foi soft-deletado depois). O backend devolveu o
      // `systemTokenTypeName`/`Code` denormalizados ainda preenchidos
      // — testamos o caso onde vieram com valor (LEFT JOIN trouxe
      // dados antes da remoção propagar).
      const route = makeRoute({
        systemTokenTypeId: ID_TOKEN_TYPE_ADMIN,
        systemTokenTypeName: 'Administração',
        systemTokenTypeCode: 'admin',
      });
      const client = createRoutesClientStub();
      // Ativos disponíveis: só o `default` (sem o admin).
      mockOpenEditModalResponses(client, {
        route,
        tokenTypes: [makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT })],
      });

      await openEditRouteModal(client, {
        route,
        tokenTypes: [makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT })],
      });

      expect(
        screen.getByText(/A política JWT atual está inativa/i),
      ).toBeInTheDocument();

      const select = screen.getByTestId(
        'edit-route-system-token-type-id',
      ) as HTMLSelectElement;
      // Placeholder + sintética inativa + 1 ativa.
      expect(select.options.length).toBe(3);
      expect(select.value).toBe(ID_TOKEN_TYPE_ADMIN);
      expect(select.options[1].textContent).toContain('inativo');

      // Submit desabilitado enquanto a opção inativa segue selecionada.
      expect(screen.getByTestId('edit-route-submit')).toBeDisabled();

      // Após trocar para a ativa, o submit habilita.
      fillEditRouteForm({ systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT });
      await waitFor(() => {
        expect(screen.getByTestId('edit-route-submit')).not.toBeDisabled();
      });
    });

    it('não exibe Alert nem opção sintética quando o token type ainda está ativo', async () => {
      const route = makeRoute({ systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT });
      const client = createRoutesClientStub();
      await openEditRouteModal(client, {
        route,
        tokenTypes: [makeTokenType({ id: ID_TOKEN_TYPE_DEFAULT })],
      });

      expect(
        screen.queryByText(/A política JWT atual está inativa/i),
      ).not.toBeInTheDocument();
      const select = screen.getByTestId(
        'edit-route-system-token-type-id',
      ) as HTMLSelectElement;
      // Placeholder + 1 ativa.
      expect(select.options.length).toBe(2);
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [ROUTES_UPDATE_PERMISSION];
    });

    /**
     * Cenários colapsados em `it.each` (lição PR #123/#127) — testes
     * com a mesma estrutura mudando 1-2 mocks viram tabela. Caso
     * específico do edit: 409 com mensagem citando "outra rota neste
     * sistema" + 404 (rota removida entre abertura e submit). Os 5
     * cenários comuns (400 com/sem errors, 401, 403, network) vêm de
     * `buildSharedRouteSubmitErrorCases('atualizar')`.
     */
    const ERROR_CASES: ReadonlyArray<RoutesErrorCase> = [
      {
        name: '409 (code duplicado) exibe mensagem inline no campo code',
        error: {
          kind: 'http',
          status: 409,
          message: 'Já existe uma route com este Code.',
        },
        expectedText: 'Já existe outra rota com este código neste sistema.',
      },
      ...buildSharedRouteSubmitErrorCases('atualizar'),
      {
        name: '404 (rota removida) fecha modal, exibe toast e dispara refetch',
        error: {
          kind: 'http',
          status: 404,
          message: 'Rota não encontrada.',
        },
        expectedText: 'Rota não encontrada ou foi removida. Atualize a lista.',
        modalStaysOpen: false,
      },
    ];

    it.each(ERROR_CASES)(
      'mapeia $name',
      async ({ error, expectedText, modalStaysOpen = true }) => {
        const client = createRoutesClientStub();
        client.put.mockRejectedValueOnce(error);

        await openEditRouteModal(client);
        // Garante token type válido selecionado para passar a
        // validação client-side (o pré-populado já é válido, mas
        // setamos explicitamente para o cenário ficar autocontido).
        fillEditRouteForm({ systemTokenTypeId: ID_TOKEN_TYPE_DEFAULT });
        await submitEditRouteForm(client);

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
      const client = createRoutesClientStub();
      // Fila: GET inicial → GET token types → PUT (404) → GET refetch.
      client.get
        .mockResolvedValueOnce(makePagedRoutes([makeRoute()]))
        .mockResolvedValueOnce([makeTokenType()])
        .mockResolvedValueOnce(makePagedRoutes([], { total: 0 }));
      client.put.mockRejectedValueOnce({
        kind: 'http',
        status: 404,
        message: 'Rota não encontrada.',
      } satisfies ApiError);

      await openEditRouteModal(client);
      await submitEditRouteForm(client);

      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(3);
      });
    });
  });
});
