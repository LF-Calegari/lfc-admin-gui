import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type {
  ApiClient,
  ApiError,
  ClientDto,
  ClientEmailDto,
  ClientPhoneDto,
  PagedResponse,
} from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { ClientsListShellPage } from '@/pages/clients';

/**
 * Helpers de teste compartilhados pelas suítes de Clientes (Issue
 * #73 — listagem; e as próximas #74/#75/#76/#146/#147 — mutações e
 * gerenciamento de contatos).
 *
 * Estratégia espelha `systemsTestHelpers.tsx`/`rolesTestHelpers.tsx`:
 *
 * - `ApiClientStub` + `createClientsClientStub` para isolar a página
 *   da camada de transporte;
 * - `makeClient`/`makePagedClientsResponse` para construir payloads
 *   do contrato `ClientDto`/`PagedResponse<ClientDto>` sem repetir
 *   todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderClientsListPage` envolvendo a página num `ToastProvider`
 *   (sub-issues seguintes consumirão `useToast()` para feedback);
 * - `waitForInitialList` e `lastGetPath` colapsando o boilerplate
 *   recorrente.
 *
 * Pré-fabricados desde o primeiro PR do recurso para evitar
 * refatoração destrutiva nas próximas sub-issues (lição PR #128 —
 * "projetar shared helpers desde o primeiro PR do recurso").
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_CLIENT_PF_ANA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const ID_CLIENT_PF_BRUNO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const ID_CLIENT_PJ_ACME = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const ID_CLIENT_PJ_GLOBAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/**
 * Stub de `ApiClient` injetado em
 * `<ClientsListShellPage client={stub} />` — mesmo padrão de
 * injeção usado nos testes de Systems/Roles.
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

export function createClientsClientStub(): ApiClientStub {
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
 * Constrói um `ClientDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do
 * contrato.
 *
 * Default é PF (`Ana Cliente`) porque é o caminho mais comum nas
 * asserts; suítes que precisam de PJ chamam com `type: 'PJ'` +
 * `cnpj`/`corporateName`. As coleções (`userIds`, `extraEmails`,
 * `mobilePhones`, `landlinePhones`) são vazias por default — backend
 * sempre devolve arrays mesmo sem dados.
 */
export function makeClient(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: ID_CLIENT_PF_ANA,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Ana Cliente',
    cnpj: null,
    corporateName: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    userIds: [],
    extraEmails: [],
    mobilePhones: [],
    landlinePhones: [],
    ...overrides,
  };
}

/**
 * Constrói um `ClientDto` PJ pré-configurado para reduzir overrides
 * repetidos nos cenários. `corporateName` e `cnpj` ficam preenchidos
 * com valores válidos por default; `cpf`/`fullName` ficam `null`
 * espelhando a regra de mutual-exclusão do backend.
 */
export function makeClientPj(overrides: Partial<ClientDto> = {}): ClientDto {
  return makeClient({
    id: ID_CLIENT_PJ_ACME,
    type: 'PJ',
    cpf: null,
    fullName: null,
    cnpj: '12345678000190',
    corporateName: 'Acme Indústria S/A',
    ...overrides,
  });
}

/**
 * Constrói o envelope paginado mockado pelo backend — `total`
 * reflete `data.length` por default; testes que cobrem paginação
 * sobrescrevem.
 */
export function makePagedClientsResponse(
  data: ReadonlyArray<ClientDto>,
  overrides: Partial<PagedResponse<ClientDto>> = {},
): PagedResponse<ClientDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `ClientsListShellPage` envolvendo num `ToastProvider`
 * — alguns subcomponentes da família (modais futuros das #74/#75)
 * consumirão `useToast()`. Centraliza para que cada suíte não repita
 * o boilerplate.
 */
export function renderClientsListPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <ClientsListShellPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a
 * `ClientsListShellPage` faz `listClients` no mount). Centraliza o
 * "esperar listagem" para que cada teste comece em estado estável
 * sem precisar replicar `waitFor` para `client.get`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('clients-loading')).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `path` passado a `client.get` na chamada
 * mais recente. Usado em asserts que verificam o endpoint consumido
 * (incluindo querystring montada por `buildQueryString`). Espelha
 * `lastGetPath` em `routesTestHelpers.tsx`/`systemsTestHelpers.tsx`.
 */
export function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return '';
  const path = calls[calls.length - 1][0];
  return typeof path === 'string' ? path : '';
}

/* ─── Helpers de fluxo do `NewClientModal` (Issue #74) ─── */

/**
 * Mocka o GET inicial com uma página contendo um cliente sintético,
 * renderiza a `ClientsListShellPage`, espera a lista carregar e
 * clica no botão "Novo cliente" para abrir o modal de criação.
 *
 * Helper análogo a `openCreateModal` da `SystemsPage` — colapsa o
 * boilerplate de 4 linhas que se repetiria em ~8 testes da suíte de
 * criação. Lição PR #127: trechos de 5+ linhas em 2+ testes são
 * `New Code Duplication` no Sonar mesmo quando a estrutura é
 * idêntica com 1 mudança. Centralizar aqui evita 7ª recorrência.
 *
 * Quem precisar de mocks diferentes pode chamar `client.get.mockXxx`
 * antes para sobrescrever a fila — a detecção de mocks pré-existentes
 * preserva o caso "fila customizada de respostas" (ex.: cenários de
 * sucesso seguidos de refetch).
 */
export async function openCreateClientModal(client: ApiClientStub): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedClientsResponse([makeClient()]));
  }
  renderClientsListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId('clients-create-open'));
}

/**
 * Preenche os campos do form do `NewClientModal` para o caminho PF.
 * Cada chave é opcional — testes que validam só `cpf` ou só
 * `fullName` passam apenas a chave relevante. Os valores são
 * entregues diretamente ao `fireEvent.change`; trim/normalização é
 * responsabilidade do `prepareSubmit` (espelha `digitsOnly` do
 * backend).
 *
 * Asserção do tipo é responsabilidade do caller — o modal abre em
 * PF por default (`INITIAL_CLIENT_FORM_STATE.type === 'PF'`), mas
 * se o teste alternar para PJ via `selectClientType('PJ')` antes,
 * os campos PF não estarão no DOM e o helper falhará no `getByTestId`.
 */
export function fillNewClientPfForm(values: { cpf?: string; fullName?: string }): void {
  if (values.cpf !== undefined) {
    fireEvent.change(screen.getByTestId('new-client-cpf'), {
      target: { value: values.cpf },
    });
  }
  if (values.fullName !== undefined) {
    fireEvent.change(screen.getByTestId('new-client-fullName'), {
      target: { value: values.fullName },
    });
  }
}

/**
 * Espelho de `fillNewClientPfForm` para o caminho PJ. Espera que o
 * teste tenha alternado para PJ via `selectClientType('PJ')` antes
 * — caso contrário, os campos PJ não estarão no DOM.
 */
export function fillNewClientPjForm(values: {
  cnpj?: string;
  corporateName?: string;
}): void {
  if (values.cnpj !== undefined) {
    fireEvent.change(screen.getByTestId('new-client-cnpj'), {
      target: { value: values.cnpj },
    });
  }
  if (values.corporateName !== undefined) {
    fireEvent.change(screen.getByTestId('new-client-corporateName'), {
      target: { value: values.corporateName },
    });
  }
}

/**
 * Alterna o `<Select>` de tipo do `NewClientModal` para PF ou PJ.
 * O componente `Select` do design system aceita `onChange(value)`
 * com a string do `<option>` selecionado.
 */
export function selectClientType(value: 'PF' | 'PJ'): void {
  fireEvent.change(screen.getByTestId('new-client-type'), {
    target: { value },
  });
}

/**
 * Submete o form do `NewClientModal` e aguarda o `client.post` ser
 * chamado pelo menos `expectedPostCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit antes
 * do `waitFor`, padrão repetido em todos os testes de submissão.
 */
export async function submitNewClientForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('new-client-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)`
 * da suíte de criação (#74). Espelha `SystemsErrorCase`/
 * `RolesErrorCase` mas com tipos próprios para evitar acoplamento
 * cruzado entre arquivos de helpers.
 */
export interface ClientsErrorCase {
  /** Descrição usada como `it.each($name)`. */
  name: string;
  /** Erro lançado pelo cliente HTTP no submit. */
  error: ApiError;
  /** Texto visível no UI após o submit (string vira regex case-insensitive). */
  expectedText: RegExp | string;
  /** Default `true` — quando `false`, o modal fecha após o erro. */
  modalStaysOpen?: boolean;
}

/**
 * Aceita string ou regex e devolve sempre um `RegExp` insensível a
 * caixa, com escape de metacaracteres. Usado pelos cenários de erro
 * para localizar mensagens no UI sem depender do match exato literal.
 *
 * Espelha `toCaseInsensitiveMatcher` em `systemsTestHelpers.tsx`.
 * Reimplementado aqui (em vez de importar) para preservar a coesão
 * do helper de clientes — o módulo se mantém autossuficiente.
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== 'string') {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'i');
}

/**
 * Constrói os 5 cenários comuns de erro de submit para a suíte de
 * criação de clientes. Mantemos no helper local em vez de delegar
 * para `buildSharedSubmitErrorCases` da suíte de sistemas porque a
 * mensagem genérica diverge ("Não foi possível criar o cliente."
 * vs "...sistema."). Centralizar aqui mantém a coesão do helper de
 * clientes.
 */
export function buildClientsSubmitErrorCases(): ReadonlyArray<ClientsErrorCase> {
  return [
    {
      name: '400 com errors mapeia mensagens para os campos correspondentes',
      error: {
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            FullName: ['FullName é obrigatório para cliente PF.'],
          },
        },
      },
      expectedText: 'FullName é obrigatório para cliente PF.',
    },
    {
      name: '400 sem errors mapeáveis exibe Alert no topo do form',
      error: {
        kind: 'http',
        status: 400,
        message: 'Payload inválido para criação de cliente.',
      },
      expectedText: 'Payload inválido para criação de cliente.',
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
      expectedText: 'Não foi possível criar o cliente. Tente novamente.',
    },
  ];
}

/* ─── Helpers de fluxo do `ClientDataTab` (Issue #75) ──── */

/**
 * Preenche os campos do form do `ClientDataTab` para o caminho PF.
 * Espelha `fillNewClientPfForm` para o `idPrefix="client-data"`
 * usado pela aba "Dados". Cada chave é opcional — testes que
 * validam um único campo passam apenas o relevante.
 */
export function fillClientDataPfForm(values: { cpf?: string; fullName?: string }): void {
  if (values.cpf !== undefined) {
    fireEvent.change(screen.getByTestId('client-data-cpf'), {
      target: { value: values.cpf },
    });
  }
  if (values.fullName !== undefined) {
    fireEvent.change(screen.getByTestId('client-data-fullName'), {
      target: { value: values.fullName },
    });
  }
}

/**
 * Preenche os campos do form do `ClientDataTab` para o caminho PJ.
 * Espelha `fillNewClientPjForm` para o `idPrefix="client-data"`.
 */
export function fillClientDataPjForm(values: {
  cnpj?: string;
  corporateName?: string;
}): void {
  if (values.cnpj !== undefined) {
    fireEvent.change(screen.getByTestId('client-data-cnpj'), {
      target: { value: values.cnpj },
    });
  }
  if (values.corporateName !== undefined) {
    fireEvent.change(screen.getByTestId('client-data-corporateName'), {
      target: { value: values.corporateName },
    });
  }
}

/**
 * Submete o form do `ClientDataTab` e aguarda o `client.put` ser
 * chamado pelo menos `expectedPutCalls` vezes (default `1`). Espelha
 * `submitNewClientForm` para o caminho de edição (PUT em vez de
 * POST).
 */
export async function submitClientDataForm(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('client-data-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(expectedPutCalls));
}

/* ─── Helpers de fluxo de delete/restore (Issue #76) ───── */

/**
 * Mocka o GET inicial com uma página contendo o `clientItem` informado
 * e abre o `DeleteClientConfirm` clicando no botão "Desativar" da
 * linha (Issue #76). O cliente default vem ativo (sem `deletedAt`) —
 * desativar só faz sentido em linhas ativas, e o gating no
 * `ClientsListShellPage` esconde o botão em linhas soft-deletadas.
 *
 * Espelha `openDeleteConfirm` em `systemsTestHelpers.tsx` — manter o
 * mesmo formato facilita leitura side-by-side e evita BLOCKER de
 * duplicação Sonar (lição PR #127). Quem precisar de mocks diferentes
 * pode chamar `client.get.mockXxx` antes para sobrescrever a fila — a
 * detecção de mocks pré-existentes preserva o caso "fila customizada
 * de respostas" (ex.: cenários de erro 404 com refetch).
 */
export async function openDeleteClientConfirm(
  client: ApiClientStub,
  clientItem: ClientDto = makeClient(),
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedClientsResponse([clientItem]));
  }
  renderClientsListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`clients-delete-${clientItem.id}`));
}

/**
 * Confirma a desativação clicando em "Desativar" no
 * `DeleteClientConfirm` e aguarda o `client.delete` ser chamado pelo
 * menos `expectedDeleteCalls` vezes (default `1`). Espelha
 * `confirmDelete` em `systemsTestHelpers.tsx`. Faz `act(async)` para
 * flushar a microtask do click handler antes do `waitFor`.
 */
export async function confirmDeleteClient(
  client: ApiClientStub,
  expectedDeleteCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('delete-client-confirm'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.delete).toHaveBeenCalledTimes(expectedDeleteCalls));
}

/**
 * Mocka o GET inicial com uma página contendo o `clientItem` informado
 * (default soft-deletado) e abre o `RestoreClientConfirm` clicando no
 * botão "Restaurar" da linha (Issue #76). Diferente de
 * `openDeleteClientConfirm`, o cliente default já vem com `deletedAt`
 * preenchido — restaurar só faz sentido em linhas soft-deletadas, e o
 * gating no `ClientsListShellPage` esconde o botão em linhas ativas.
 *
 * Espelha `openRestoreConfirm` em `systemsTestHelpers.tsx`.
 */
export async function openRestoreClientConfirm(
  client: ApiClientStub,
  clientItem: ClientDto = makeClient({ deletedAt: '2026-02-01T00:00:00Z' }),
): Promise<void> {
  if (client.get.mock.calls.length === 0 && client.get.mock.results.length === 0) {
    client.get.mockResolvedValueOnce(makePagedClientsResponse([clientItem]));
  }
  renderClientsListPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`clients-restore-${clientItem.id}`));
}

/**
 * Confirma a restauração clicando em "Restaurar" no
 * `RestoreClientConfirm` e aguarda o `client.post` ser chamado pelo
 * menos `expectedPostCalls` vezes (default `1`). Espelha
 * `confirmRestore` em `systemsTestHelpers.tsx` mas com POST (em
 * `/clients/{id}/restore`) em vez de DELETE.
 */
export async function confirmRestoreClient(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('restore-client-confirm'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}

/**
 * Constrói os cenários comuns de erro de mutação simples
 * (delete/restore) para a suíte da Issue #76. Centraliza os 3 casos
 * compartilhados (401, 403, network) entre desativar e restaurar — o
 * texto genérico no fallback diverge ("desativar"/"restaurar") e por
 * isso parametrizamos via `verb`.
 *
 * Casos específicos por sub-fluxo (404 fecha modal, 409 conflito) ficam
 * inline na suíte de teste (`it.each([...específicos, ...buildClients
 * MutationErrorCases('desativar')])`) — espelha
 * `buildSharedMutationErrorCases` em `systemsTestHelpers.tsx` para
 * preservar a mesma estratégia de declaração e evitar duplicação
 * Sonar (lição PR #128).
 */
export function buildClientsMutationErrorCases(
  verb: 'desativar' | 'restaurar',
): ReadonlyArray<ClientsErrorCase> {
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
      expectedText: `Não foi possível ${verb} o cliente. Tente novamente.`,
    },
  ];
}

/**
 * Constrói os cenários comuns de erro de submit para a suíte de
 * edição de clientes (Issue #75). A mensagem genérica diverge da
 * criação ("atualizar" vs "criar") — manter cenários próprios
 * preserva os asserts ancorados na copy específica de cada caminho.
 */
export function buildClientsEditSubmitErrorCases(): ReadonlyArray<ClientsErrorCase> {
  return [
    {
      name: '400 com errors mapeia mensagens para os campos correspondentes',
      error: {
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            FullName: ['FullName é obrigatório para cliente PF.'],
          },
        },
      },
      expectedText: 'FullName é obrigatório para cliente PF.',
    },
    {
      name: '400 sem errors mapeáveis exibe Alert no topo do form',
      error: {
        kind: 'http',
        status: 400,
        message: 'Tipo do cliente não pode ser alterado após a criação.',
      },
      expectedText: 'Tipo do cliente não pode ser alterado após a criação.',
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
      expectedText: 'Não foi possível atualizar o cliente. Tente novamente.',
    },
  ];
}

/* ─── Helpers de fluxo do `ClientExtraEmailsTab` (Issue #146) ─ */

/**
 * Constrói um `ClientEmailDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do contrato.
 *
 * O `id` default é um UUID sintético claramente identificável; cenários
 * que precisem de ids estáveis para asserts reusam essa fixture
 * passando o `id` próprio.
 */
export function makeClientEmail(overrides: Partial<ClientEmailDto> = {}): ClientEmailDto {
  return {
    id: 'e0000000-0000-0000-0000-000000000001',
    email: 'extra1@exemplo.com',
    createdAt: '2026-02-10T12:00:00Z',
    ...overrides,
  };
}

/**
 * Submete o form do modal de adicionar email no `ClientExtraEmailsTab`
 * e aguarda o `client.post` ser chamado pelo menos `expectedPostCalls`
 * vezes (default `1`). Faz `act(async)` para flushar a microtask do
 * submit antes do `waitFor`. Espelha `submitNewClientForm` para o
 * caminho do modal de adicionar email.
 */
export async function submitAddExtraEmailForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('client-extra-emails-add-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}

/* ─── Helpers de fluxo do `ClientPhonesTab` (Issue #147) ── */

/**
 * Constrói um `ClientPhoneDto` com defaults — testes só sobrescrevem o
 * que importa para o cenário sem repetir todos os campos do contrato.
 *
 * O `id` default é um UUID sintético claramente identificável; cenários
 * que precisem de ids estáveis para asserts reusam essa fixture
 * passando o `id` próprio. O `number` default é E.164 válido brasileiro
 * (espelha o exemplo da mensagem do backend `+5518981789845`) para
 * evitar test data que casualmente inválida a regex E.164 e mascararia
 * cenários reais.
 */
export function makeClientPhone(overrides: Partial<ClientPhoneDto> = {}): ClientPhoneDto {
  return {
    id: 'p0000000-0000-0000-0000-000000000001',
    number: '+5518981789845',
    createdAt: '2026-02-15T12:00:00Z',
    ...overrides,
  };
}

/**
 * Submete o form do modal de adicionar telefone (mobile ou landline)
 * no `ClientPhonesTab` e aguarda o `client.post` ser chamado pelo menos
 * `expectedPostCalls` vezes (default `1`). Faz `act(async)` para
 * flushar a microtask do submit antes do `waitFor`. Espelha
 * `submitAddExtraEmailForm` para o caminho do modal de adicionar
 * telefone.
 *
 * O `testIdPrefix` (`client-mobile-phones` ou `client-landline-phones`)
 * é injetado pelo caller para evitar que a suíte tenha que duplicar a
 * lógica de submit por aba — um único helper cobre as duas variantes.
 */
export async function submitAddPhoneForm(
  client: ApiClientStub,
  testIdPrefix: string,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId(`${testIdPrefix}-add-form`));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}
