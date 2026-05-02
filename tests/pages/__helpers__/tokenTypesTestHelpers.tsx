import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type { ApiClient, ApiError, TokenTypeDto } from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { TokensListShellPage } from '@/pages/tokens';

/**
 * Helpers de teste compartilhados pelas suítes da
 * `TokensListShellPage` (Issue #175 — listagem CRUD de tipos de token
 * JWT, fechando o placeholder do `/tokens`).
 *
 * Estratégia espelha `systemsTestHelpers.tsx`/`clientsTestHelpers.tsx`:
 *
 * - `ApiClientStub` + `createTokenTypesClientStub` para isolar a
 *   página da camada de transporte;
 * - `makeTokenType` para construir payloads do contrato `TokenTypeDto`
 *   sem repetir todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderTokensListPage` envolvendo a página num `ToastProvider`
 *   (modais consomem `useToast()` para feedback de sucesso/erro);
 * - `waitForInitialList` colapsando o boilerplate recorrente.
 *
 * Diferente das demais listagens, o backend de token types
 * (`TokenTypesController.GetAll`) **não pagina** — devolve um array
 * bruto. Por isso o helper `makePagedResponse` não existe aqui; a
 * página recebe a lista direto e o filtro é client-side. O stub
 * mocka `client.get.mockResolvedValueOnce(array)` em vez de envelope
 * paginado.
 *
 * Pré-fabricados desde o primeiro PR do recurso para evitar
 * refatoração destrutiva nas próximas sub-issues (lição PR #128 —
 * "projetar shared helpers desde o primeiro PR do recurso").
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_TT_DEFAULT = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
export const ID_TT_REFRESH = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
export const ID_TT_LEGACY = 'cccccccc-3333-3333-3333-cccccccccccc';

/**
 * Stub de `ApiClient` injetado em
 * `<TokensListShellPage client={stub} />` — mesmo padrão de injeção
 * usado nos demais testes de listagem.
 */
export type ApiClientStub = ApiClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
};

export function createTokenTypesClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  } as unknown as ApiClientStub;
}

/**
 * Constrói um `TokenTypeDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do contrato.
 */
export function makeTokenType(
  overrides: Partial<TokenTypeDto> = {},
): TokenTypeDto {
  return {
    id: ID_TT_DEFAULT,
    name: 'Acesso padrão',
    code: 'default',
    description: 'Token JWT clássico de acesso.',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Renderiza a `TokensListShellPage` envolvendo num `ToastProvider` —
 * os modais consomem `useToast()` internamente para disparar feedback
 * de sucesso/erro.
 */
export function renderTokensListPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <TokensListShellPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `TokensListShellPage`
 * faz `listTokenTypes` no mount). Centraliza o "esperar listagem"
 * para que cada teste comece em estado estável sem precisar replicar
 * `waitFor` para `client.get`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('token-types-loading')).not.toBeInTheDocument();
  });
}

/* ─── Helpers de fluxo dos modais (Issue #175) ─── */

/**
 * Mocka o GET inicial com uma lista contendo um token type sintético,
 * renderiza a página, espera a lista carregar e clica no botão "Novo
 * tipo de token" para abrir o modal de criação.
 */
export async function openCreateTokenTypeModal(
  client: ApiClientStub,
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockResolvedValueOnce([makeTokenType()]);
  }
  renderTokensListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId('token-types-create-open'));
}

/**
 * Preenche os campos do form do `NewTokenTypeModal`. Cada chave é
 * opcional — testes que validam só `name` e `code` deixam
 * `description` ausente. Os valores são entregues diretamente ao
 * `fireEvent.change`; trim é responsabilidade do componente
 * (`createTokenType`/`validateTokenTypeForm`).
 */
export function fillNewTokenTypeForm(values: {
  name?: string;
  code?: string;
  description?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('new-token-type-name'), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId('new-token-type-code'), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId('new-token-type-description'), {
      target: { value: values.description },
    });
  }
}

/**
 * Submete o form do `NewTokenTypeModal` e aguarda o `client.post` ser
 * chamado pelo menos `expectedPostCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit antes do
 * `waitFor`.
 */
export async function submitNewTokenTypeForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('new-token-type-form'));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.post).toHaveBeenCalledTimes(expectedPostCalls),
  );
}

/**
 * Mocka o GET inicial com uma lista contendo o `tokenType` informado
 * (ou um token type sintético padrão), renderiza a página, espera a
 * lista carregar e clica no botão "Editar" da linha.
 */
export async function openEditTokenTypeModal(
  client: ApiClientStub,
  tokenType: TokenTypeDto = makeTokenType(),
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockResolvedValueOnce([tokenType]);
  }
  renderTokensListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`token-types-edit-${tokenType.id}`));
}

/**
 * Preenche os campos do form do `EditTokenTypeModal`. Cada chave é
 * opcional. Espelha `fillNewTokenTypeForm`, mas usando os
 * `data-testid` do modal de edição (`edit-token-type-*`).
 */
export function fillEditTokenTypeForm(values: {
  name?: string;
  code?: string;
  description?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('edit-token-type-name'), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId('edit-token-type-code'), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId('edit-token-type-description'), {
      target: { value: values.description },
    });
  }
}

/**
 * Submete o form do `EditTokenTypeModal` e aguarda o `client.put` ser
 * chamado pelo menos `expectedPutCalls` vezes (default `1`). Espelha
 * `submitNewTokenTypeForm`, com PUT em vez de POST.
 */
export async function submitEditTokenTypeForm(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('edit-token-type-form'));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.put).toHaveBeenCalledTimes(expectedPutCalls),
  );
}

/**
 * Mocka o GET inicial com uma lista contendo o `tokenType` informado e
 * abre o `DeleteTokenTypeConfirm` clicando no botão "Desativar" da
 * linha. Espelha `openDeleteConfirm` do `systemsTestHelpers`.
 */
export async function openDeleteTokenTypeConfirm(
  client: ApiClientStub,
  tokenType: TokenTypeDto = makeTokenType(),
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockResolvedValueOnce([tokenType]);
  }
  renderTokensListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`token-types-delete-${tokenType.id}`));
}

/**
 * Confirma a desativação clicando em "Desativar" no
 * `DeleteTokenTypeConfirm` e aguarda o `client.delete` ser chamado
 * pelo menos `expectedDeleteCalls` vezes (default `1`). Espelha
 * `confirmDelete` do `systemsTestHelpers`, com `data-testid` próprio.
 */
export async function confirmDeleteTokenType(
  client: ApiClientStub,
  expectedDeleteCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('delete-token-type-confirm'));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.delete).toHaveBeenCalledTimes(expectedDeleteCalls),
  );
}

/**
 * Mocka o GET inicial com uma lista contendo o `tokenType` informado
 * (default já vem com `deletedAt` preenchido — restaurar só faz
 * sentido em linhas soft-deletadas) e abre o `RestoreTokenTypeConfirm`
 * clicando no botão "Restaurar" da linha. O toggle "Mostrar inativos"
 * é ligado para que a linha apareça (estado inicial é
 * `includeDeleted=false`).
 */
export async function openRestoreTokenTypeConfirm(
  client: ApiClientStub,
  tokenType: TokenTypeDto = makeTokenType({
    deletedAt: '2026-02-01T00:00:00Z',
  }),
): Promise<void> {
  if (
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockResolvedValueOnce([tokenType]);
  }
  renderTokensListPage(client);
  await waitForInitialList(client);
  // Liga "Mostrar inativos" para que linhas soft-deletadas apareçam.
  fireEvent.click(screen.getByTestId('token-types-include-deleted'));
  fireEvent.click(screen.getByTestId(`token-types-restore-${tokenType.id}`));
}

/**
 * Confirma a restauração clicando em "Restaurar" no
 * `RestoreTokenTypeConfirm` e aguarda o `client.post` ser chamado
 * pelo menos `expectedPostCalls` vezes (default `1`).
 */
export async function confirmRestoreTokenType(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('restore-token-type-confirm'));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(client.post).toHaveBeenCalledTimes(expectedPostCalls),
  );
}

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)`
 * dos modais de criação/edição. Espelha `SystemsErrorCase` do
 * `systemsTestHelpers`.
 */
export interface TokenTypeErrorCase {
  name: string;
  error: ApiError;
  expectedText: RegExp | string;
  modalStaysOpen?: boolean;
}

/**
 * Aceita string ou regex e devolve sempre um `RegExp` insensível a
 * caixa, com escape de metacaracteres. Espelha `toCaseInsensitiveMatcher`.
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== 'string') {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'i');
}
