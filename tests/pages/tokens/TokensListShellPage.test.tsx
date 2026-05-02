import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `buildAuthMock` precisa ser importado **antes** de `tokenTypesTestHelpers`
// para que `vi.mock('@/shared/auth', ...)` consiga resolver a factory
// durante o hoisting — sem isso, o teste falha com `Cannot access ...
// before initialization`. Mesmo padrão usado em outras suítes de listagem.
/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import {
  confirmDeleteTokenType,
  confirmRestoreTokenType,
  createTokenTypesClientStub,
  fillEditTokenTypeForm,
  fillNewTokenTypeForm,
  ID_TT_DEFAULT,
  ID_TT_LEGACY,
  ID_TT_REFRESH,
  makeTokenType,
  openCreateTokenTypeModal,
  openDeleteTokenTypeConfirm,
  openEditTokenTypeModal,
  openRestoreTokenTypeConfirm,
  renderTokensListPage,
  submitEditTokenTypeForm,
  submitNewTokenTypeForm,
  toCaseInsensitiveMatcher,
  waitForInitialList,
} from '../__helpers__/tokenTypesTestHelpers';
/* eslint-enable import/order */

import type { TokenTypeErrorCase } from '../__helpers__/tokenTypesTestHelpers';
import type { ApiError, TokenTypeDto } from '@/shared/api';

/**
 * Suíte da `TokensListShellPage` (Issue #175 — CRUD de tipos de token
 * JWT, fechando o placeholder do `/tokens`).
 *
 * Estratégia espelha as demais páginas de listagem (`SystemsPage`/
 * `ClientsListShellPage`/`RolesPage`): stub de `ApiClient` injetado,
 * asserts sobre estados visuais, busca debounced (client-side neste
 * recurso), toggle "Mostrar inativos", erros de mutação e
 * comportamento dos modais.
 *
 * Diferenças relevantes em relação às demais suítes:
 *
 * - A request inicial chama `GET /tokens/types` sem querystring — o
 *   backend não suporta filtro server-side neste recurso e a página
 *   filtra o array client-side. Asserts sobre paginação não se
 *   aplicam.
 * - O toggle "Mostrar inativos" não dispara nova request (estado
 *   apenas do client) — só re-aplica o filtro `deletedAt === null`
 *   sobre a lista já em memória.
 * - Para abrir o modal de restauração, a suíte liga o toggle "Mostrar
 *   inativos" antes de localizar o botão `token-types-restore-<id>`
 *   (linhas soft-deletadas só aparecem com o toggle ligado).
 */

let permissionsMock: ReadonlyArray<string> = [];
vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const ALL_PERMISSIONS: ReadonlyArray<string> = [
  'AUTH_V1_TOKEN_TYPES_LIST',
  'AUTH_V1_TOKEN_TYPES_CREATE',
  'AUTH_V1_TOKEN_TYPES_UPDATE',
  'AUTH_V1_TOKEN_TYPES_DELETE',
  'AUTH_V1_TOKEN_TYPES_RESTORE',
];

const SEARCH_DEBOUNCE_MS = 300;

const SAMPLE_ROWS: ReadonlyArray<TokenTypeDto> = [
  makeTokenType({
    id: ID_TT_DEFAULT,
    name: 'Acesso padrão',
    code: 'default',
    description: 'Token JWT clássico de acesso.',
  }),
  makeTokenType({
    id: ID_TT_REFRESH,
    name: 'Renovação',
    code: 'refresh',
    description: 'Token de refresh.',
  }),
  makeTokenType({
    id: ID_TT_LEGACY,
    name: 'Legado',
    code: 'legacy',
    description: null,
    deletedAt: '2026-02-01T00:00:00Z',
  }),
];

beforeEach(() => {
  permissionsMock = ALL_PERMISSIONS;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TokensListShellPage — render inicial', () => {
  it('exibe spinner enquanto a primeira request está em curso e popula a tabela após resposta', async () => {
    const client = createTokenTypesClientStub();
    let resolveFn: (value: ReadonlyArray<TokenTypeDto>) => void = () =>
      undefined;
    const pending = new Promise<ReadonlyArray<TokenTypeDto>>((resolve) => {
      resolveFn = resolve;
    });
    client.get.mockReturnValueOnce(pending);

    renderTokensListPage(client);

    expect(screen.getByTestId('token-types-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFn(SAMPLE_ROWS);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('token-types-loading'),
      ).not.toBeInTheDocument();
    });

    // Linhas ativas aparecem (Acesso padrão / Renovação) — desktop +
    // mobile = 2 ocorrências. A linha "Legado" (soft-deletada) NÃO
    // aparece porque includeDeleted=false por default.
    expect(screen.getAllByText('Acesso padrão').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Renovação').length).toBeGreaterThan(0);
    expect(screen.queryByText('Legado')).not.toBeInTheDocument();
  });

  it('renderiza header com título "Tipos de token JWT"', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(
      screen.getByRole('heading', { name: /Tipos de token JWT/i }),
    ).toBeInTheDocument();
  });

  it('chama backend em GET /tokens/types sem querystring', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(client.get).toHaveBeenCalledWith(
      '/tokens/types',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('renderiza badge "Inativo" para tipos soft-deletados quando includeDeleted=true', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    fireEvent.click(screen.getByTestId('token-types-include-deleted'));

    await waitFor(() => {
      expect(screen.getAllByText('Inativo').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Legado').length).toBeGreaterThan(0);
  });

  it('exibe mensagem de erro do backend e botão "Tentar novamente" quando o GET falha', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockRejectedValueOnce({
      kind: 'http',
      status: 500,
      message: 'Falha interna.',
    } as ApiError);

    renderTokensListPage(client);

    await waitFor(() =>
      expect(screen.getByTestId('token-types-retry')).toBeInTheDocument(),
    );

    // O `extractErrorMessage` propaga a mensagem do backend quando o
    // erro é `ApiError`; o `fallbackErrorMessage` da página só é usado
    // para erros não-ApiError. Asserção visa exatamente o caminho real.
    expect(screen.getByText(/Falha interna\./i)).toBeInTheDocument();
  });

  it('cai no fallback "Falha ao carregar..." quando o erro não é ApiError', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockRejectedValueOnce(new Error('boom'));

    renderTokensListPage(client);

    await waitFor(() =>
      expect(screen.getByTestId('token-types-retry')).toBeInTheDocument(),
    );

    expect(
      screen.getByText(/Falha ao carregar a lista de tipos de token/i),
    ).toBeInTheDocument();
  });

  it('estado vazio exibe "Nenhum tipo de token cadastrado" e dica de "Mostrar inativos"', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce([]);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(
      screen.getAllByText('Nenhum tipo de token cadastrado.').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Mostrar inativos/i).length,
    ).toBeGreaterThan(0);
  });
});

describe('TokensListShellPage — busca client-side debounced', () => {
  it('digitar não filtra imediatamente; após 300ms aplica filtro client-side', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    // Antes de digitar: 2 linhas ativas visíveis (Acesso padrão +
    // Renovação). Linha "Legado" (soft-deletada) não conta.
    expect(screen.getAllByText('Acesso padrão').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Renovação').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByTestId('token-types-search'), {
      target: { value: 'refresh' },
    });

    // Antes do debounce vencer, ambas ainda aparecem.
    expect(screen.getAllByText('Acesso padrão').length).toBeGreaterThan(0);

    // Avança o tempo do debounce.
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
      await Promise.resolve();
    });

    // Após o debounce, "Acesso padrão" some e "Renovação" permanece
    // (matched por code/description).
    await waitFor(() => {
      expect(screen.queryByText('Acesso padrão')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Renovação').length).toBeGreaterThan(0);

    // GET continua tendo sido chamado uma única vez (filtro é client-side).
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('estado vazio com busca cita o termo e oferece botão "Limpar busca"', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    fireEvent.change(screen.getByTestId('token-types-search'), {
      target: { value: 'inexistente' },
    });

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhum tipo de token encontrado para/i).length,
      ).toBeGreaterThan(0);
    });

    expect(
      screen.getAllByTestId('token-types-empty-clear').length,
    ).toBeGreaterThan(0);
  });
});

describe('TokensListShellPage — gating de permissões', () => {
  it('esconde "Novo tipo de token" quando o usuário não tem AUTH_V1_TOKEN_TYPES_CREATE', async () => {
    permissionsMock = ['AUTH_V1_TOKEN_TYPES_LIST'];
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(
      screen.queryByTestId('token-types-create-open'),
    ).not.toBeInTheDocument();
  });

  it('esconde botão "Editar" da linha quando falta AUTH_V1_TOKEN_TYPES_UPDATE', async () => {
    permissionsMock = [
      'AUTH_V1_TOKEN_TYPES_LIST',
      'AUTH_V1_TOKEN_TYPES_DELETE',
    ];
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(
      screen.queryByTestId(`token-types-edit-${ID_TT_DEFAULT}`),
    ).not.toBeInTheDocument();
    // Delete continua aparecendo (linha ativa + permissão presente).
    expect(
      screen.getByTestId(`token-types-delete-${ID_TT_DEFAULT}`),
    ).toBeInTheDocument();
  });

  it('esconde a coluna "Ações" inteira quando o usuário não tem update/delete/restore', async () => {
    permissionsMock = ['AUTH_V1_TOKEN_TYPES_LIST'];
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce(SAMPLE_ROWS);

    renderTokensListPage(client);
    await waitForInitialList(client);

    expect(
      screen.queryByRole('columnheader', { name: /ações/i }),
    ).not.toBeInTheDocument();
  });
});

describe('TokensListShellPage — fluxo "Novo tipo de token"', () => {
  it('abre modal, valida campos obrigatórios sem submeter quando vazio', async () => {
    const client = createTokenTypesClientStub();
    await openCreateTokenTypeModal(client);

    expect(screen.getByTestId('new-token-type-form')).toBeInTheDocument();

    await act(async () => {
      fireEvent.submit(screen.getByTestId('new-token-type-form'));
      await Promise.resolve();
    });

    // Validação client-side bloqueia o POST sem name/code preenchidos.
    expect(client.post).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-token-type-form')).toBeInTheDocument();
  });

  it('cria token type com sucesso, fecha o modal e refaz fetch', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce([makeTokenType()]);
    client.post.mockResolvedValueOnce(
      makeTokenType({
        id: 'novo-uuid',
        name: 'Renovação',
        code: 'refresh',
      }),
    );
    client.get.mockResolvedValueOnce([
      makeTokenType(),
      makeTokenType({
        id: 'novo-uuid',
        name: 'Renovação',
        code: 'refresh',
      }),
    ]);

    await openCreateTokenTypeModal(client);

    fillNewTokenTypeForm({
      name: '  Renovação  ',
      code: 'refresh',
      description: 'Token de refresh.',
    });

    await submitNewTokenTypeForm(client);

    expect(client.post).toHaveBeenCalledWith(
      '/tokens/types',
      {
        name: 'Renovação',
        code: 'refresh',
        description: 'Token de refresh.',
      },
      undefined,
    );

    // Modal fecha após sucesso.
    await waitFor(() => {
      expect(
        screen.queryByTestId('new-token-type-form'),
      ).not.toBeInTheDocument();
    });

    // Refetch dispara — agora 2 GETs no total (inicial + pós-mutação).
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it('409 mapeia para mensagem inline custom no campo code', async () => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce([makeTokenType()]);
    client.post.mockRejectedValueOnce({
      kind: 'http',
      status: 409,
      message: 'Já existe um token type com este Code.',
    } as ApiError);

    await openCreateTokenTypeModal(client);
    fillNewTokenTypeForm({ name: 'Padrão', code: 'default' });
    await submitNewTokenTypeForm(client);

    // Mensagem inline custom em pt-BR — não a do backend literal.
    await waitFor(() => {
      expect(
        screen.getByText(/Já existe um tipo de token com este código/i),
      ).toBeInTheDocument();
    });

    // Modal continua aberto.
    expect(screen.getByTestId('new-token-type-form')).toBeInTheDocument();
  });

  it.each<TokenTypeErrorCase>([
    {
      name: '400 com errors mapeia mensagens para os campos correspondentes',
      error: {
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            Name: ['Name é obrigatório e não pode ser apenas espaços.'],
            Code: ['Code deve ter no máximo 50 caracteres.'],
          },
        },
      } as ApiError,
      expectedText: 'Name é obrigatório e não pode ser apenas espaços.',
    },
    {
      name: '401 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 401,
        message: 'Sessão expirada. Faça login novamente.',
      } as ApiError,
      expectedText: 'Sessão expirada. Faça login novamente.',
    },
    {
      name: '403 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 403,
        message: 'Você não tem permissão para esta ação.',
      } as ApiError,
      expectedText: 'Você não tem permissão para esta ação.',
    },
    {
      name: 'erro genérico de rede dispara toast vermelho genérico',
      error: { kind: 'network', message: 'Falha de conexão.' } as ApiError,
      expectedText:
        'Não foi possível criar o tipo de token. Tente novamente.',
    },
  ])('cenário "$name"', async ({ error, expectedText }) => {
    const client = createTokenTypesClientStub();
    client.get.mockResolvedValueOnce([makeTokenType()]);
    client.post.mockRejectedValueOnce(error);

    await openCreateTokenTypeModal(client);
    fillNewTokenTypeForm({ name: 'Padrão', code: 'default' });
    await submitNewTokenTypeForm(client);

    const matcher = toCaseInsensitiveMatcher(expectedText);
    await waitFor(() => {
      expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
    });
    // Modal continua aberto após erro.
    expect(screen.getByTestId('new-token-type-form')).toBeInTheDocument();
  });
});

describe('TokensListShellPage — fluxo "Editar tipo de token"', () => {
  it('abre modal pré-populado com os dados da linha selecionada', async () => {
    const client = createTokenTypesClientStub();
    const target = makeTokenType({
      id: ID_TT_DEFAULT,
      name: 'Acesso padrão',
      code: 'default',
      description: 'Original',
    });
    await openEditTokenTypeModal(client, target);

    expect(screen.getByTestId('edit-token-type-form')).toBeInTheDocument();
    expect(
      (screen.getByTestId('edit-token-type-name') as HTMLInputElement).value,
    ).toBe('Acesso padrão');
    expect(
      (screen.getByTestId('edit-token-type-code') as HTMLInputElement).value,
    ).toBe('default');
    expect(
      (screen.getByTestId('edit-token-type-description') as HTMLTextAreaElement)
        .value,
    ).toBe('Original');
  });

  it('atualiza com sucesso, fecha o modal e refaz fetch', async () => {
    const client = createTokenTypesClientStub();
    const target = makeTokenType({ id: ID_TT_DEFAULT });
    client.get.mockResolvedValueOnce([target]);
    client.put.mockResolvedValueOnce(
      makeTokenType({ ...target, name: 'Acesso default v2' }),
    );
    client.get.mockResolvedValueOnce([
      makeTokenType({ ...target, name: 'Acesso default v2' }),
    ]);

    await openEditTokenTypeModal(client, target);
    fillEditTokenTypeForm({ name: 'Acesso default v2' });
    await submitEditTokenTypeForm(client);

    expect(client.put).toHaveBeenCalledWith(
      `/tokens/types/${target.id}`,
      expect.objectContaining({ name: 'Acesso default v2', code: 'default' }),
      undefined,
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId('edit-token-type-form'),
      ).not.toBeInTheDocument();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it('404 fecha o modal e dispara refetch', async () => {
    const client = createTokenTypesClientStub();
    const target = makeTokenType();
    client.get.mockResolvedValueOnce([target]);
    client.put.mockRejectedValueOnce({
      kind: 'http',
      status: 404,
      message: 'Token type não encontrado.',
    } as ApiError);
    client.get.mockResolvedValueOnce([]);

    await openEditTokenTypeModal(client, target);
    fillEditTokenTypeForm({ name: 'Atualizado' });
    await submitEditTokenTypeForm(client);

    await waitFor(() => {
      expect(
        screen.queryByTestId('edit-token-type-form'),
      ).not.toBeInTheDocument();
    });

    // Refetch após 404.
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });
});

describe('TokensListShellPage — fluxo "Desativar"', () => {
  it('confirma desativação com sucesso, fecha o modal e refaz fetch', async () => {
    const client = createTokenTypesClientStub();
    const target = makeTokenType();
    client.get.mockResolvedValueOnce([target]);
    client.delete.mockResolvedValueOnce(undefined);
    client.get.mockResolvedValueOnce([]);

    await openDeleteTokenTypeConfirm(client, target);
    await confirmDeleteTokenType(client);

    expect(client.delete).toHaveBeenCalledWith(
      `/tokens/types/${target.id}`,
      undefined,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('delete-token-type-confirm')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });

  it('cancela ao clicar em "Cancelar" sem disparar DELETE', async () => {
    const client = createTokenTypesClientStub();
    await openDeleteTokenTypeConfirm(client);

    fireEvent.click(screen.getByTestId('delete-token-type-cancel'));

    expect(client.delete).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.queryByTestId('delete-token-type-confirm'),
      ).not.toBeInTheDocument();
    });
  });
});

describe('TokensListShellPage — fluxo "Restaurar"', () => {
  it('botão "Restaurar" só aparece em linhas soft-deletadas com toggle "Mostrar inativos" ligado', async () => {
    const client = createTokenTypesClientStub();
    const inactive = makeTokenType({
      id: ID_TT_LEGACY,
      name: 'Legado',
      code: 'legacy',
      deletedAt: '2026-02-01T00:00:00Z',
    });
    client.get.mockResolvedValueOnce([inactive]);

    renderTokensListPage(client);
    await waitForInitialList(client);

    // Antes de ativar o toggle, a linha sumiu (filter client-side).
    expect(
      screen.queryByTestId(`token-types-restore-${inactive.id}`),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('token-types-include-deleted'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`token-types-restore-${inactive.id}`),
      ).toBeInTheDocument();
    });
  });

  it('confirma restauração com sucesso, fecha o modal e refaz fetch', async () => {
    const client = createTokenTypesClientStub();
    const target = makeTokenType({
      id: ID_TT_LEGACY,
      name: 'Legado',
      code: 'legacy',
      deletedAt: '2026-02-01T00:00:00Z',
    });
    client.get.mockResolvedValueOnce([target]);
    client.post.mockResolvedValueOnce({
      message: 'Token type restaurado com sucesso.',
    });
    client.get.mockResolvedValueOnce([{ ...target, deletedAt: null }]);

    await openRestoreTokenTypeConfirm(client, target);
    await confirmRestoreTokenType(client);

    expect(client.post).toHaveBeenCalledWith(
      `/tokens/types/${target.id}/restore`,
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('restore-token-type-confirm'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  });
});
