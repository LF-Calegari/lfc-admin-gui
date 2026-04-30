import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type { ApiClient, ApiError, PagedResponse, SystemDto } from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { SystemsPage } from '@/pages/SystemsPage';

/**
 * Helpers de teste compartilhados pelas suítes da `SystemsPage`:
 * listagem (`SystemsPage.test.tsx`), criação (`SystemsPage.create.test.tsx`,
 * Issue #58/#127) e edição (`SystemsPage.edit.test.tsx`, Issue #59).
 *
 * Extraídos para evitar duplicação de blocos de fixtures (lição PR
 * #123/#127 — Sonar conta blocos de 10+ linhas como duplicação
 * independente da intenção). Mantemos apenas o que é genuinamente
 * compartilhado:
 *
 * - `ApiClientStub` + `createSystemsClientStub` para isolar a página da
 *   camada de transporte;
 * - `makeSystem` + `makePagedResponse` para construir payloads do
 *   contrato `SystemDto`/`PagedResponse<SystemDto>` sem repetir todos os
 *   campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderSystemsPage` envolvendo a página num `ToastProvider` (os
 *   modals consomem `useToast()` para feedback de sucesso/erro);
 * - helpers de fluxo dos forms (`openCreateModal`/`openEditModal`,
 *   `fillNewSystemForm`/`fillEditSystemForm`,
 *   `submitNewSystemForm`/`submitEditSystemForm`) para colapsar o
 *   boilerplate "abrir modal → preencher → submeter" que cada suíte
 *   repete em quase todos os testes;
 * - `SystemsErrorCase` + `buildCloseCases` + `toCaseInsensitiveMatcher`
 *   para colapsar `it.each` de cenários de erro/fechamento sem que cada
 *   suíte declare seu próprio array literal duplicado.
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYS_AUTH = '11111111-1111-1111-1111-111111111111';
export const ID_SYS_KURTTO = '22222222-2222-2222-2222-222222222222';
export const ID_SYS_LEGACY = '33333333-3333-3333-3333-333333333333';

/**
 * Stub de `ApiClient` injetado em `<SystemsPage client={stub} />` —
 * mesmo padrão de injeção usado nos testes de auth (PR #122/#123).
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

export function createSystemsClientStub(): ApiClientStub {
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
 * Constrói um `SystemDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos do contrato.
 */
export function makeSystem(overrides: Partial<SystemDto> = {}): SystemDto {
  return {
    id: ID_SYS_AUTH,
    name: 'lfc-authenticator',
    code: 'AUTH',
    description: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Constrói o envelope paginado mockado pelo backend — `total` reflete o
 * `data.length` por default; testes que cobrem paginação sobrescrevem.
 */
export function makePagedResponse(
  data: ReadonlyArray<SystemDto>,
  overrides: Partial<PagedResponse<SystemDto>> = {},
): PagedResponse<SystemDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `SystemsPage` envolvendo num `ToastProvider` — o
 * `NewSystemModal` consome `useToast()` internamente para disparar
 * feedback de sucesso/erro. Centraliza para que cada suíte não repita o
 * provider boilerplate.
 */
export function renderSystemsPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <SystemsPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `SystemsPage` faz
 * `listSystems` no mount). Centraliza o "esperar listagem" para que
 * cada teste comece em estado estável sem precisar replicar `waitFor`
 * para `client.get`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
  });
}

/**
 * Mocka o GET inicial com uma página contendo um sistema sintético,
 * renderiza a `SystemsPage`, espera a lista carregar e clica no botão
 * "Novo sistema" para abrir o modal de criação.
 *
 * Helper extraído porque o BLOCKER do PR #127 apontou que esse trecho
 * de 5+ linhas estava se repetindo em ~8 testes da suíte de criação —
 * Sonar marcava como duplicação de New Code. Quem quiser usar mocks
 * diferentes pode chamar `mockListSystems(client)` antes para
 * sobrescrever a fila de respostas (ex.: cenários com sucesso seguido
 * de refetch).
 */
export async function openCreateModal(client: ApiClientStub): Promise<void> {
  // `mockResolvedValueOnce` empilha — só mockamos o GET inicial se nenhum
  // mock anterior foi configurado pelo teste; do contrário respeitamos a
  // ordem montada pelo caller (caso comum: refetch após sucesso).
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));
  }
  renderSystemsPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId('systems-create-open'));
}

/**
 * Preenche os campos do form do `NewSystemModal`. Cada chave é opcional
 * — testes que validam só `name` e `code` deixam `description` ausente.
 * Os valores são entregues diretamente ao `fireEvent.change`; trim é
 * responsabilidade do componente (`createSystem`/`validateForm`).
 */
export function fillNewSystemForm(values: {
  name?: string;
  code?: string;
  description?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('new-system-name'), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId('new-system-code'), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId('new-system-description'), {
      target: { value: values.description },
    });
  }
}

/**
 * Submete o form do `NewSystemModal` e aguarda o `client.post` ser
 * chamado pelo menos `expectedPostCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit antes do
 * `waitFor`, padrão repetido em todos os testes de submissão.
 */
export async function submitNewSystemForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('new-system-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}

/**
 * Mocka o GET inicial com uma página contendo o `system` informado (ou
 * um sistema sintético padrão), renderiza a `SystemsPage`, espera a
 * lista carregar e clica no botão "Editar" da linha do sistema.
 *
 * Helper análogo a `openCreateModal` — colapsa o boilerplate "abrir
 * modal de edição" que se repetia em ~10 testes da suíte de edição.
 * Lição PR #127: trechos de 10+ linhas em 2+ testes são `New Code
 * Duplication` no Sonar mesmo quando a estrutura é idêntica com 1
 * mudança. Centralizamos aqui.
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * **antes** de invocar este helper para sobrescrever a fila — a
 * detecção de mocks pré-existentes preserva o caso "fila customizada
 * de respostas" (ex.: cenários de erro 404 com refetch).
 */
export async function openEditModal(
  client: ApiClientStub,
  system: SystemDto = makeSystem(),
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedResponse([system]));
  }
  renderSystemsPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`systems-edit-${system.id}`));
}

/**
 * Preenche os campos do form do `EditSystemModal`. Cada chave é
 * opcional — testes que validam só `name` e `code` deixam `description`
 * ausente. Valores são entregues diretamente ao `fireEvent.change`;
 * trim é responsabilidade do componente (`updateSystem`/`validateSystemForm`).
 *
 * Espelha `fillNewSystemForm`, mas usando os data-testIds do modal de
 * edição (`edit-system-*`).
 */
export function fillEditSystemForm(values: {
  name?: string;
  code?: string;
  description?: string;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('edit-system-name'), {
      target: { value: values.name },
    });
  }
  if (values.code !== undefined) {
    fireEvent.change(screen.getByTestId('edit-system-code'), {
      target: { value: values.code },
    });
  }
  if (values.description !== undefined) {
    fireEvent.change(screen.getByTestId('edit-system-description'), {
      target: { value: values.description },
    });
  }
}

/**
 * Submete o form do `EditSystemModal` e aguarda o `client.put` ser
 * chamado pelo menos `expectedPutCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit. Espelha
 * `submitNewSystemForm`, com PUT em vez de POST.
 */
export async function submitEditSystemForm(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('edit-system-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(expectedPutCalls));
}

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)` das
 * suítes de criação (#58/#127) e edição (#59).
 *
 * Cada caso descreve o `ApiError` retornado pelo backend, o texto que
 * deve aparecer em algum lugar visível do UI após o submit e se o
 * modal continua aberto (default `true`). Centralizar o tipo evita que
 * cada suíte declare a mesma `interface ErrorCase` (~6 linhas) — Sonar
 * marca tipos idênticos em arquivos diferentes como duplicação (lição
 * PR #127).
 */
export interface SystemsErrorCase {
  /** Descrição usada como `it.each($name)`. */
  name: string;
  /** Erro lançado pelo cliente HTTP no submit. */
  error: ApiError;
  /** Texto visível no UI após o submit (string vira regex case-insensitive). */
  expectedText: RegExp | string;
  /** Default `true` — quando `false`, o modal fecha após o erro (ex.: 404 no edit). */
  modalStaysOpen?: boolean;
}

/**
 * Aceita string ou regex e devolve sempre um `RegExp` insensível a
 * caixa, com escape de metacaracteres. Usado pelos cenários de erro
 * para localizar mensagens no UI sem depender do match exato literal.
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== 'string') {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/**
 * Caso de teste para cenários de fechamento sem persistência (Esc,
 * Cancelar, backdrop). Cada `close()` dispara a ação simulada na DOM.
 *
 * Centralizar o tipo evita que cada suíte declare seu próprio array
 * `CLOSE_CASES` com tipo inline (~14 linhas idênticas em criação e
 * edição) — Sonar conta blocos de 10+ linhas como duplicação independente
 * do conteúdo (lição PR #127).
 */
export interface SystemsModalCloseCase {
  /** Descrição usada como `it.each($name)`. */
  name: string;
  /** Ação que fecha o modal sem persistir (chamada dentro do teste). */
  close: () => void;
}

/**
 * Constrói os 3 cenários comuns de fechamento sem persistir (Esc,
 * Cancelar, backdrop) usando o `cancelTestId` da suíte chamadora —
 * que difere entre `new-system-cancel` (criação) e `edit-system-cancel`
 * (edição).
 *
 * Sem essa factory, ambas as suítes declaravam o mesmo array `CLOSE_CASES`
 * com 3 entradas e 14 linhas — alvo direto da duplicação Sonar.
 */
export function buildCloseCases(cancelTestId: string): ReadonlyArray<SystemsModalCloseCase> {
  return [
    {
      name: 'Esc',
      close: () => fireEvent.keyDown(window, { key: 'Escape' }),
    },
    {
      name: 'botão Cancelar',
      close: () => fireEvent.click(screen.getByTestId(cancelTestId)),
    },
    {
      name: 'clique no backdrop',
      close: () => fireEvent.mouseDown(screen.getByTestId('modal-backdrop')),
    },
  ];
}
