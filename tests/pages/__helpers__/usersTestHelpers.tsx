import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import type { ApiClient, ApiError, PagedResponse, UserDto } from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { UsersListShellPage } from '@/pages/users';

/**
 * Helpers de teste compartilhados pelas suítes da `UsersListShellPage`:
 * listagem (`UsersListShellPage.test.tsx` da #77) e criação
 * (`UsersPage.create.test.tsx` da #78).
 *
 * Espelha `systemsTestHelpers.tsx`/`routesTestHelpers.tsx` —
 * extraídos para evitar duplicação de blocos de fixtures (lição PR
 * #123/#127 — Sonar conta blocos de 10+ linhas como duplicação
 * independente da intenção). Mantemos apenas o que é genuinamente
 * compartilhado:
 *
 * - `ApiClientStub` + `createUsersClientStub` para isolar a página
 *   da camada de transporte;
 * - `makeUser` + `makePagedResponse` para construir payloads do
 *   contrato `UserDto`/`PagedResponse<UserDto>` sem repetir todos os
 *   campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderUsersPage` envolvendo a página num `ToastProvider` (o
 *   `NewUserModal` consome `useToast()` para feedback de sucesso/erro);
 * - helpers de fluxo do form (`openCreateUserModal`,
 *   `fillNewUserForm`, `submitNewUserForm`).
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_USER_ALICE = '11111111-1111-1111-1111-111111111111';
export const ID_USER_BOB = '22222222-2222-2222-2222-222222222222';
export const ID_CLIENT_ALPHA = '33333333-3333-3333-3333-333333333333';

/**
 * Stub de `ApiClient` injetado em `<UsersListShellPage client={stub} />`.
 * Mesmo padrão de injeção usado nas demais suítes (#58/#63/#66/#77).
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

export function createUsersClientStub(): ApiClientStub {
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
 * Constrói um `UserDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos.
 */
export function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: ID_USER_ALICE,
    name: 'Alice Admin',
    email: 'alice@example.com',
    clientId: ID_CLIENT_ALPHA,
    identity: 1,
    active: true,
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
export function makeUsersPagedResponse(
  data: ReadonlyArray<UserDto>,
  overrides: Partial<PagedResponse<UserDto>> = {},
): PagedResponse<UserDto> {
  return {
    data,
    page: 1,
    pageSize: 20,
    total: data.length,
    ...overrides,
  };
}

/**
 * Renderiza a `UsersListShellPage` envolvendo num `ToastProvider` — o
 * `NewUserModal` consome `useToast()` internamente para disparar
 * feedback de sucesso/erro.
 */
export function renderUsersPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <UsersListShellPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `UsersListShellPage`
 * faz `listUsers` no mount). Centraliza o "esperar listagem" para que
 * cada teste comece em estado estável sem precisar replicar `waitFor`
 * para `client.get`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('users-loading')).not.toBeInTheDocument();
  });
}

/**
 * Mocka o GET inicial com uma página contendo um usuário sintético,
 * renderiza a `UsersListShellPage`, espera a lista carregar e clica
 * no botão "Novo usuário" para abrir o modal de criação.
 *
 * `mockImplementation` em vez de `mockResolvedValueOnce` porque a
 * página dispara duas requests no mount: `/users` (listagem) e
 * `/clients/{id}` por usuário (lookup do nome do cliente). O
 * implementation lê o path para decidir o response — `/clients/{id}`
 * cai no `null` que o `getClientsByIds` trata como "best-effort
 * faltando" sem quebrar a tela.
 *
 * Quem precisar de mocks diferentes pode chamar
 * `client.get.mockImplementation(...)` antes de invocar este helper
 * — a detecção via `getMockImplementation()` preserva o caso "fila
 * customizada de respostas" (ex.: refetch após sucesso, que precisa
 * contar chamadas).
 */
export async function openCreateUserModal(client: ApiClientStub): Promise<void> {
  if (
    client.get.getMockImplementation() === undefined &&
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        return Promise.resolve(makeUsersPagedResponse([makeUser()]));
      }
      if (typeof path === 'string' && path.startsWith('/clients/')) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`unexpected path: ${String(path)}`));
    });
  }
  renderUsersPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId('users-create-open'));
}

/**
 * Preenche os campos do form do `NewUserModal`. Cada chave é opcional
 * — testes que validam só `name` e `email` deixam os demais ausentes.
 * Os valores são entregues diretamente ao `fireEvent.change`; trim é
 * responsabilidade do componente (`createUser`/`validateUserForm`).
 *
 * `active` usa `fireEvent.click` no Switch (não `fireEvent.change`)
 * porque o `<Switch>` interno é um `<input type="checkbox">` que
 * dispara onChange via clique.
 */
export function fillNewUserForm(values: {
  name?: string;
  email?: string;
  password?: string;
  identity?: string;
  clientId?: string;
  active?: boolean;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('new-user-name'), {
      target: { value: values.name },
    });
  }
  if (values.email !== undefined) {
    fireEvent.change(screen.getByTestId('new-user-email'), {
      target: { value: values.email },
    });
  }
  if (values.password !== undefined) {
    fireEvent.change(screen.getByTestId('new-user-password'), {
      target: { value: values.password },
    });
  }
  if (values.identity !== undefined) {
    fireEvent.change(screen.getByTestId('new-user-identity'), {
      target: { value: values.identity },
    });
  }
  if (values.clientId !== undefined) {
    fireEvent.change(screen.getByTestId('new-user-client-id'), {
      target: { value: values.clientId },
    });
  }
  if (values.active !== undefined) {
    // Toggle só clica se o estado atual não bate com o desejado;
    // evita "ativar -> desativar -> ativar" inadvertido em sequência
    // de chamadas.
    const switchEl = screen.getByTestId('new-user-active') as HTMLInputElement;
    if (switchEl.checked !== values.active) {
      fireEvent.click(switchEl);
    }
  }
}

/**
 * Submete o form do `NewUserModal` e aguarda o `client.post` ser
 * chamado pelo menos `expectedPostCalls` vezes (default `1`). Faz o
 * `act(async)` necessário para flushar a microtask do submit antes
 * do `waitFor`, padrão repetido em todos os testes de submissão.
 */
export async function submitNewUserForm(
  client: ApiClientStub,
  expectedPostCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('new-user-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(expectedPostCalls));
}

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)`
 * da suíte de criação ou edição. Cada caso descreve o `ApiError`
 * retornado pelo backend e o texto que deve aparecer em algum lugar
 * visível do UI após o submit.
 */
export interface UsersErrorCase {
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
 * caixa, com escape de metacaracteres. Reusa o padrão dos
 * `systemsTestHelpers` para que os asserts não dependam de match
 * exato literal.
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== 'string') {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'i');
}

/* ─── Helpers para suíte de edição (Issue #79) ──────────────── */

/**
 * Mocka a resposta inicial (listagem com o usuário-alvo), renderiza a
 * `UsersListShellPage`, espera a lista carregar e clica no botão
 * "Editar" da linha do usuário informado. Aguarda a presença do form
 * do modal (`edit-user-form`) para garantir que o efeito de
 * sincronização já populou os campos.
 *
 * Espelha `openEditRoleModal`/`openEditModal` (sistemas) — pré-
 * fabricado para evitar duplicação entre as suítes de edição
 * (lição PR #128). Quem precisar de mocks diferentes pode chamar
 * `client.get.mockImplementation(...)` antes de invocar este helper
 * — a detecção de mocks pré-existentes preserva o caso "fila
 * customizada de respostas" (ex.: cenários de erro 404 com refetch).
 */
export async function openEditUserModal(
  client: ApiClientStub,
  options: { user?: UserDto } = {},
): Promise<void> {
  const user = options.user ?? makeUser();
  if (
    client.get.getMockImplementation() === undefined &&
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        return Promise.resolve(makeUsersPagedResponse([user]));
      }
      if (typeof path === 'string' && path.startsWith('/clients/')) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`unexpected path: ${String(path)}`));
    });
  }
  renderUsersPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`users-edit-${user.id}`));
  // Garante que o efeito do modal terminou — a presença do form
  // indica que o `useEffect` de sincronização já rodou.
  await waitFor(() => {
    expect(screen.getByTestId('edit-user-form')).toBeInTheDocument();
  });
}

/**
 * Preenche os campos do form do `EditUserModal`. Cada chave é
 * opcional — testes que validam só `name` e `email` deixam os demais
 * ausentes. Os valores são entregues diretamente ao `fireEvent.change`;
 * trim é responsabilidade do componente (`updateUser`/
 * `validateUserUpdateForm`).
 *
 * **Sem `password`** — o modal de edição esconde o campo via
 * `hidePassword`; reset de senha é endpoint separado.
 *
 * `active` usa `fireEvent.click` no Switch (não `fireEvent.change`)
 * porque o `<Switch>` interno é um `<input type="checkbox">`.
 */
export function fillEditUserForm(values: {
  name?: string;
  email?: string;
  identity?: string;
  clientId?: string;
  active?: boolean;
}): void {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByTestId('edit-user-name'), {
      target: { value: values.name },
    });
  }
  if (values.email !== undefined) {
    fireEvent.change(screen.getByTestId('edit-user-email'), {
      target: { value: values.email },
    });
  }
  if (values.identity !== undefined) {
    fireEvent.change(screen.getByTestId('edit-user-identity'), {
      target: { value: values.identity },
    });
  }
  if (values.clientId !== undefined) {
    fireEvent.change(screen.getByTestId('edit-user-client-id'), {
      target: { value: values.clientId },
    });
  }
  if (values.active !== undefined) {
    const switchEl = screen.getByTestId('edit-user-active') as HTMLInputElement;
    if (switchEl.checked !== values.active) {
      fireEvent.click(switchEl);
    }
  }
}

/**
 * Submete o form do `EditUserModal` e aguarda o `client.put` ser
 * chamado pelo menos `expectedPutCalls` vezes (default `1`).
 * Espelha `submitEditRoleForm`/`submitEditSystemForm` — `act` +
 * `waitFor` para flushar a microtask do submit antes do assert.
 */
export async function submitEditUserForm(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('edit-user-form'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(expectedPutCalls));
}

/* ─── Helpers para suíte de toggle ativo (Issue #80) ──────── */

/**
 * Mocka a resposta inicial (listagem com o usuário-alvo), renderiza a
 * `UsersListShellPage`, espera a lista carregar e clica no botão
 * "Desativar"/"Ativar" da linha do usuário informado. Espelha
 * `openEditUserModal` mas dispara o modal de toggle ativo
 * (`ToggleUserActiveConfirm`) — Issue #80.
 *
 * O `data-testid` do botão (`users-toggle-active-{id}`) é estável
 * independente do estado `active` do usuário; o que muda é o label
 * visível ("Desativar"/"Ativar") e o variant. Helpers de teste usam
 * o testId para abrir o modal sem reagir ao label, e os asserts
 * verificam a copy correta separadamente.
 *
 * Quem precisar de mocks diferentes pode chamar
 * `client.get.mockImplementation(...)` antes de invocar este helper —
 * a detecção de mocks pré-existentes preserva o caso "fila customizada
 * de respostas" (ex.: cenários de erro 404 com refetch).
 */
export async function openToggleUserActiveConfirm(
  client: ApiClientStub,
  options: { user?: UserDto } = {},
): Promise<void> {
  const user = options.user ?? makeUser();
  if (
    client.get.getMockImplementation() === undefined &&
    client.get.mock.calls.length === 0 &&
    client.get.mock.results.length === 0
  ) {
    client.get.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.startsWith('/users')) {
        return Promise.resolve(makeUsersPagedResponse([user]));
      }
      if (typeof path === 'string' && path.startsWith('/clients/')) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`unexpected path: ${String(path)}`));
    });
  }
  renderUsersPage(client);
  await waitForInitialList(client);
  fireEvent.click(screen.getByTestId(`users-toggle-active-${user.id}`));
  // Aguarda a abertura do modal — verifica a presença do botão de
  // confirmação que existe apenas quando o `MutationConfirmModal`
  // está renderizado.
  await waitFor(() => {
    expect(
      screen.getByTestId('toggle-user-active-confirm'),
    ).toBeInTheDocument();
  });
}

/**
 * Confirma o toggle clicando em "Desativar"/"Ativar" no
 * `ToggleUserActiveConfirm` e aguarda o `client.put` ser chamado pelo
 * menos `expectedPutCalls` vezes (default `1`). Espelha `confirmDelete`
 * dos `systemsTestHelpers`, mas com PUT em vez de DELETE — o backend
 * não tem endpoint dedicado para toggle de `active`, então o modal
 * dispara `updateUser` (PUT) com o body completo. Faz `act(async)`
 * para flushar a microtask do click handler antes do `waitFor`.
 */
export async function confirmToggleUserActive(
  client: ApiClientStub,
  expectedPutCalls = 1,
): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('toggle-user-active-confirm'));
    await Promise.resolve();
  });
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(expectedPutCalls));
}

/**
 * Constrói os 3 cenários de fechamento sem persistência (Esc,
 * Cancelar, backdrop) usando o `cancelTestId` da suíte chamadora.
 * Espelha `buildRolesCloseCases`/`buildCloseCases` — pré-fabricado
 * para que as suítes de criação e edição reusem a mesma fila de
 * `it.each` sem duplicação (lição PR #127/#128).
 */
export interface UsersModalCloseCase {
  name: string;
  close: () => void;
}

export function buildUsersCloseCases(
  cancelTestId: string,
): ReadonlyArray<UsersModalCloseCase> {
  return [
    {
      name: 'Esc',
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
 * Constrói os cenários de erro 401/403/network compartilhados entre
 * as suítes de criação (#78) e edição (#79). Diferem **apenas** no
 * verbo (`criar` vs `atualizar`) — copy genérica do toast vermelho
 * vinda de `SUBMIT_ERROR_COPY.genericFallback` em cada modal.
 *
 * Pré-fabricar antes do segundo call site previne a recorrência de
 * `New Code Duplication` no Sonar (lição PR #128 — projetar shared
 * helpers desde o primeiro PR do recurso).
 */
/**
 * Verbos suportados pelas suítes de mutação de usuário. Cada um
 * controla a copy genérica do toast vermelho (`"Não foi possível
 * {verb} o usuário. Tente novamente."`):
 *
 * - `'criar'`/`'atualizar'` — usados pelo create/edit do form de
 *   usuário (Issues #78/#79).
 * - `'ativar'`/`'desativar'` — usados pelo toggle ativo (Issue #80).
 *
 * Centralizar o tipo aqui (em vez de declarar dois alias paralelos)
 * permite que `buildSharedUserMutationErrorCases` cubra todos os
 * cenários sem duplicar a função (lição PR #134/#135 — sonarjs/
 * no-identical-functions).
 */
export type UserMutationVerb = 'criar' | 'atualizar' | 'ativar' | 'desativar';

/**
 * Constrói os cenários comuns de erro 401/403/network para qualquer
 * mutação de usuário. Casos comuns aparecem em todas as suítes
 * (criação #78, edição #79, toggle ativo #80) com a única diferença
 * sendo o verbo na copy genérica do toast vermelho — `it.each` reusa
 * a mesma tabela em todas elas.
 *
 * Pré-fabricar antes do segundo call site previne a recorrência de
 * `New Code Duplication` no Sonar (lição PR #128 — projetar shared
 * helpers desde o primeiro PR do recurso). Casos específicos
 * (`409`/`404` — comportamento difere entre suítes) ficam inline em
 * cada suíte porque divergem em estrutura, não só em copy.
 */
export function buildSharedUserMutationErrorCases(
  verb: UserMutationVerb,
): ReadonlyArray<UsersErrorCase> {
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
      error: { kind: 'network', message: 'Falha de conexão.' },
      expectedText: `Não foi possível ${verb} o usuário. Tente novamente.`,
    },
  ];
}

/**
 * Alias retro-compatível para suítes de criação/edição (#78/#79). Mantém
 * a API pública sem reabrir os call-sites existentes — o conjunto de
 * verbos aceitos é restrito ao subconjunto histórico (`criar`/`atualizar`)
 * via união de tipo.
 */
export function buildSharedUserSubmitErrorCases(
  verb: 'criar' | 'atualizar',
): ReadonlyArray<UsersErrorCase> {
  return buildSharedUserMutationErrorCases(verb);
}
