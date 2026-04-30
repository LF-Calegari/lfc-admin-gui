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
 * Mocka o GET inicial com uma página contendo o `system` informado (ou
 * um sistema sintético padrão), renderiza a `SystemsPage`, espera a
 * lista carregar e clica no botão "Desativar" da linha do sistema.
 *
 * Helper análogo a `openCreateModal`/`openEditModal` (Issue #60). Sem
 * ele, cada teste da suíte de delete duplicaria ~5 linhas de "render +
 * waitFor + click" — Sonar contaria como `New Code Duplication` (lição
 * PR #127). Quem precisar de mocks diferentes pode chamar `client.get
 * .mockXxx` antes para sobrescrever a fila (a detecção de mocks pré-
 * existentes preserva o caso "fila customizada de respostas").
 */
export async function openDeleteConfirm(
  client: ApiClientStub,
  system: SystemDto = makeSystem(),
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedResponse([system]));
  }
  renderSystemsPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`systems-delete-${system.id}`));
}

/**
 * Confirma a desativação clicando em "Desativar" no `DeleteSystemConfirm`
 * e aguarda o `client.delete` ser chamado pelo menos `expectedDeleteCalls`
 * vezes (default `1`). Espelha `submitNewSystemForm`/`submitEditSystemForm`,
 * com DELETE em vez de POST/PUT. Faz `act(async)` para flushar a
 * microtask do click handler antes do `waitFor`.
 */
export async function confirmDelete(
  client: ApiClientStub,
  expectedDeleteCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('delete-system-confirm'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.delete).toHaveBeenCalledTimes(expectedDeleteCalls));
}

/**
 * Mocka o GET inicial com uma página contendo o `system` informado e
 * abre o `RestoreSystemConfirm` clicando no botão "Restaurar" da linha
 * (Issue #61). Diferente de `openDeleteConfirm`, o sistema default já
 * vem com `deletedAt` preenchido — restaurar só faz sentido em linhas
 * soft-deletadas, e o gating no `SystemsPage` esconde o botão em
 * linhas ativas. Helpers de teste devem refletir o gating.
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * antes para sobrescrever a fila — a detecção de mocks pré-existentes
 * preserva o caso "fila customizada de respostas" (ex.: cenários de
 * erro 404 com refetch).
 */
export async function openRestoreConfirm(
  client: ApiClientStub,
  system: SystemDto = makeSystem({ deletedAt: '2026-02-01T00:00:00Z' }),
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedResponse([system]));
  }
  renderSystemsPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`systems-restore-${system.id}`));
}

/**
 * Confirma a restauração clicando em "Restaurar" no `RestoreSystemConfirm`
 * e aguarda o `client.post` ser chamado pelo menos `expectedPostCalls`
 * vezes (default `1`). Espelha `confirmDelete` mas com POST (em
 * `/systems/{id}/restore`) em vez de DELETE. Faz `act(async)` para
 * flushar a microtask do click handler antes do `waitFor`.
 */
export async function confirmRestore(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('restore-system-confirm'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
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
 *
 * `String.raw` no replacement evita o duplo-escape de `'\\$&'` — Sonar
 * marca o literal escapado como improvement (lição PR #128).
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== 'string') {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'i');
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
      // `fireEvent.keyDown` aceita `Window` na assinatura do RTL; usar
      // `globalThis` aqui quebra o typecheck (não satisfaz `Window`).
      // eslint-disable-next-line no-restricted-globals
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

/**
 * Constrói os 5 cenários de erro de submit que diferem **apenas** no
 * verbo (`criar` vs `atualizar`) entre as suítes de criação e edição.
 *
 * Sem esse helper, ambas as suítes declaravam blocos de ~50 linhas
 * (`400 com errors`, `400 sem errors`, `401`, `403`, `network`)
 * literalmente idênticos exceto pela palavra do fallback genérico —
 * cenário direto para `New Code Duplication` no Sonar (4ª recorrência
 * em PR #128). Centralizar resolve **três** ganhos:
 *
 * 1. Sonar deixa de contar como duplicação (mesma lógica em 1 arquivo).
 * 2. Adicionar futuros cenários (ex.: 5xx) é 1 linha em vez de 2 PRs
 *    de testes que diferem só no verbo.
 * 3. Garante simetria de cobertura entre as duas suítes — não é
 *    possível esquecer de adicionar o caso 401 só no edit, por exemplo.
 *
 * Os casos específicos de cada modal (`409` com mensagem própria, e
 * `404` exclusivo do edit) ficam inline em cada suíte porque divergem
 * em estrutura, não só em copy.
 */
export function buildSharedSubmitErrorCases(
  verb: 'criar' | 'atualizar',
): ReadonlyArray<SystemsErrorCase> {
  const verbAcao = verb === 'criar' ? 'criação' : 'atualização';
  return [
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
      },
      expectedText: 'Name é obrigatório e não pode ser apenas espaços.',
    },
    {
      name: '400 sem errors mapeáveis exibe Alert no topo do form',
      error: {
        kind: 'http',
        status: 400,
        message: `Payload inválido para ${verbAcao} de sistema.`,
      },
      expectedText: `Payload inválido para ${verbAcao} de sistema.`,
    },
    {
      name: '401 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 401,
        message: 'Sessão expirada. Faça login novamente.',
      },
      expectedText: 'Sessão expirada. Faça login novamente.',
    },
    {
      name: '403 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 403,
        message: 'Você não tem permissão para esta ação.',
      },
      expectedText: 'Você não tem permissão para esta ação.',
    },
    {
      name: 'erro genérico de rede dispara toast vermelho genérico',
      error: {
        kind: 'network',
        message: 'Falha de conexão com o servidor.',
      },
      expectedText: `Não foi possível ${verb} o sistema. Tente novamente.`,
    },
  ];
}

/**
 * Tipo da ação por linha cujos botões são testados (Issues #59, #60 e
 * #61). Cada valor mapeia para o `data-testid` `systems-<verb>-<id>` do
 * botão correspondente na coluna "Ações" da `SystemsPage`.
 */
export type SystemRowActionVerb = 'edit' | 'delete' | 'restore';

/**
 * Asserções compartilhadas de gating de botão de linha (Issue #59, #60
 * e #61).
 *
 * O bloco "renderiza sistema → confere ausência/presença do botão por
 * `data-testid` da linha" se repetia entre as suítes de edição (`edit-`)
 * e desativação (`delete-`) com diferença só no testId — Sonar marca
 * 11+ linhas duplicadas como `New Code Duplication` independente de
 * intenção (lição PR #123/#127/#128). Centralizamos para evitar 5ª
 * recorrência.
 *
 * `assertRowActionAbsent`/`assertRowActionPresent` recebem o stub do
 * cliente já mockado pela suíte chamadora (que controla quais sistemas
 * aparecem na lista). Asserts são independentes do verbo — espelham o
 * padrão de teste "renderSystemsPage + waitForInitialList + assert".
 *
 * **Restore** (Issue #61): o gating do botão "Restaurar" depende de
 * `row.deletedAt !== null`, então o helper popula automaticamente
 * `deletedAt` quando o verbo é `'restore'` — caso contrário o botão
 * nunca apareceria mesmo com a permissão. Edit/delete continuam usando
 * sistemas ativos por default (`deletedAt: null`).
 */
export async function assertRowActionAbsent(
  client: ApiClientStub,
  testIdPrefix: SystemRowActionVerb,
  systemId: string = ID_SYS_AUTH,
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    // Para restore, o sistema precisa estar soft-deletado para o gating
    // de permissão ser o único motivo da ausência do botão (caso
    // contrário, o teste não diferenciaria "sem permissão" de "linha
    // ativa filtrada pelo `row.deletedAt !== null`").
    const overrides: Partial<SystemDto> =
      testIdPrefix === 'restore'
        ? { id: systemId, deletedAt: '2026-02-01T00:00:00Z' }
        : { id: systemId };
    client.get.mockResolvedValueOnce(makePagedResponse([makeSystem(overrides)]));
  }
  renderSystemsPage(client);
  await waitForInitialList(client);
  expect(screen.queryByTestId(`systems-${testIdPrefix}-${systemId}`)).not.toBeInTheDocument();
}

export async function assertRowActionPresent(
  client: ApiClientStub,
  testIdPrefix: SystemRowActionVerb,
  ariaVerb: 'Editar' | 'Desativar' | 'Restaurar',
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    // Para restore, ambos os sistemas precisam estar soft-deletados —
    // só assim o botão aparece nas duas linhas (gating
    // `row.deletedAt !== null`). Edit/delete usam sistemas ativos por
    // default.
    const baseOverrides: Partial<SystemDto> =
      testIdPrefix === 'restore' ? { deletedAt: '2026-02-01T00:00:00Z' } : {};
    client.get.mockResolvedValueOnce(
      makePagedResponse([
        makeSystem({
          ...baseOverrides,
          id: ID_SYS_AUTH,
          name: 'lfc-authenticator',
          code: 'AUTH',
        }),
        makeSystem({
          ...baseOverrides,
          id: ID_SYS_KURTTO,
          name: 'lfc-kurtto',
          code: 'KURTTO',
        }),
      ]),
    );
  }
  renderSystemsPage(client);
  await waitForInitialList(client);

  const authBtn = screen.getByTestId(`systems-${testIdPrefix}-${ID_SYS_AUTH}`);
  const kurttoBtn = screen.getByTestId(`systems-${testIdPrefix}-${ID_SYS_KURTTO}`);
  expect(authBtn).toBeInTheDocument();
  expect(kurttoBtn).toBeInTheDocument();
  expect(authBtn).toHaveAttribute('aria-label', `${ariaVerb} sistema lfc-authenticator`);
  expect(kurttoBtn).toHaveAttribute('aria-label', `${ariaVerb} sistema lfc-kurtto`);
}

/**
 * Constrói os 3 cenários de erro de mutação (sem corpo) que diferem
 * **apenas** no verbo entre suítes de delete (#60) e o futuro restore
 * (#61). Espelha `buildSharedSubmitErrorCases` mas para ações simples
 * sem `bad-request` com `field-errors` (delete/restore não enviam body).
 *
 * Cenários comuns (401, 403, network) ficam centralizados aqui para
 * preservar simetria de cobertura entre as duas suítes — sem o helper,
 * o segundo PR duplicaria literalmente esses 3 blocos com troca só do
 * verbo (lição PR #128, 4ª recorrência de Sonar duplication). Os casos
 * específicos (404, 409 do restore) ficam inline em cada suíte porque
 * divergem em estrutura/comportamento (modal fecha vs modal segue
 * aberto), não só em copy.
 *
 * O `verb` aceita o gerúndio em pt-BR ('desativar'/'restaurar') porque
 * a copy do toast genérico é "Não foi possível {verb} o sistema. Tente
 * novamente." — espelha o padrão dos modals de form.
 */
export function buildSharedMutationErrorCases(
  verb: 'desativar' | 'restaurar',
): ReadonlyArray<SystemsErrorCase> {
  return [
    {
      name: '401 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 401,
        message: 'Sessão expirada. Faça login novamente.',
      },
      expectedText: 'Sessão expirada. Faça login novamente.',
    },
    {
      name: '403 dispara toast vermelho com mensagem do backend',
      error: {
        kind: 'http',
        status: 403,
        message: 'Você não tem permissão para esta ação.',
      },
      expectedText: 'Você não tem permissão para esta ação.',
    },
    {
      name: 'erro genérico de rede dispara toast vermelho genérico',
      error: {
        kind: 'network',
        message: 'Falha de conexão com o servidor.',
      },
      expectedText: `Não foi possível ${verb} o sistema. Tente novamente.`,
    },
  ];
}
