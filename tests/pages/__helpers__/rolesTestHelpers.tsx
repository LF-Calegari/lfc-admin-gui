import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, vi } from "vitest";

import type { ApiClient, ApiError, RoleDto } from "@/shared/api";

import { ToastProvider } from "@/components/ui";
import { RolesPage } from "@/pages/RolesPage";

/**
 * Helpers de teste compartilhados pela suíte da `RolesPage` (Issue
 * #66) e pelas próximas (#67 criar, #68 editar, #69 associar
 * permissões) — pré-fabricados desde o primeiro PR do recurso para
 * evitar refatoração destrutiva nos PRs seguintes (lição PR #128 —
 * "projetar shared helpers desde o primeiro PR do recurso").
 *
 * Estratégia espelha `routesTestHelpers.tsx`/`systemsTestHelpers.tsx`:
 *
 * - `ApiClientStub` + `createRolesClientStub` para isolar a página da
 *   camada de transporte;
 * - `makeRole` para construir payloads do contrato `RoleDto` sem
 *   repetir todos os campos;
 * - constantes de UUIDs sintéticos para asserts estáveis;
 * - `renderRolesPage` envolvendo a página no `MemoryRouter` apontando
 *   para `/systems/:systemId/roles` (a página lê `useParams`);
 * - `waitForInitialList` colapsando o "esperar listagem" repetido em
 *   praticamente todos os testes.
 *
 * **Importante (TODO no backend):** o `RoleDto` aceita
 * `description`/`permissionsCount`/`usersCount` opcionais — o
 * backend hoje não devolve esses campos (`AppRole` ainda não os tem;
 * ver `src/shared/api/roles.ts`). Os helpers expõem todos eles para
 * que os testes possam exercer ambos os caminhos: campo presente
 * (cenário do futuro) e campo ausente (cenário atual). Assim quando
 * o backend evoluir, os testes existentes continuam válidos sem
 * mudanças.
 */

/** UUIDs fixos usados pelas suítes — asserts comparam strings estáveis. */
export const ID_SYS_AUTH = "11111111-1111-1111-1111-111111111111";
export const ID_ROLE_ROOT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const ID_ROLE_ADMIN = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const ID_ROLE_VIEWER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/**
 * Stub de `ApiClient` injetado em `<RolesPage client={stub} />` —
 * mesmo padrão de injeção usado nos testes da `SystemsPage`/
 * `RoutesPage`. Reusa o shape de `ApiClientStub` em
 * `routesTestHelpers.tsx`/`systemsTestHelpers.tsx`, mas declarado
 * localmente para que cada suíte mantenha seu próprio módulo de
 * fixtures (acoplar os três levaria à inversão "tests dependem de
 * tests" que dificulta reorganizar).
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

export function createRolesClientStub(): ApiClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => "system-test-uuid"),
  } as unknown as ApiClientStub;
}

/**
 * Constrói um `RoleDto` com defaults — testes só sobrescrevem o que
 * importa para o cenário sem repetir todos os campos do contrato.
 *
 * Os campos opcionais (`description`/`permissionsCount`/
 * `usersCount`) ficam `null` por default para refletir o estado
 * **atual** do backend (TODO no model); testes que exercitam o
 * caminho "backend devolveu o valor" sobrescrevem explicitamente.
 */
export function makeRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: ID_ROLE_ROOT,
    name: "Root",
    code: "root",
    description: null,
    permissionsCount: null,
    usersCount: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Renderiza a `RolesPage` envolvendo no `MemoryRouter` apontando
 * para `/systems/:systemId/roles`. A página consome
 * `useParams<{ systemId }>` — sem o roteador, `systemId` ficaria
 * `undefined` e a página entraria no estado `InvalidIdNotice` em
 * vez de carregar a listagem.
 *
 * `systemId` é parametrizável para que o teste de `:systemId`
 * inválido possa simular a URL `/systems/ /roles` (whitespace) e
 * cair no `InvalidIdNotice` — espelhando o comportamento real do
 * componente.
 *
 * Envolvemos em `ToastProvider` desde já para que os modals das
 * próximas issues (#67/#68) possam disparar `useToast()` sem
 * quebrar — espelha a estratégia do `renderRoutesPage` em
 * `routesTestHelpers.tsx` (lição PR #128 — projetar shared
 * helpers desde o primeiro PR do recurso). Suítes de listagem
 * que não abrem modal não pagam custo perceptível por ter o
 * provider ativo.
 */
export function renderRolesPage(
  client: ApiClientStub,
  systemId: string = ID_SYS_AUTH,
): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/systems/${systemId}/roles`]}>
        <Routes>
          <Route
            path="/systems/:systemId/roles"
            element={<RolesPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `RolesPage` faz
 * `listRoles` no mount). Centraliza o "esperar listagem" para que
 * cada teste comece em estado estável sem precisar replicar
 * `waitFor` para `client.get`. Espelha `waitForInitialList` em
 * `routesTestHelpers.tsx`.
 */
export async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId("roles-loading")).not.toBeInTheDocument();
  });
}

/**
 * Helper para extrair o `path` passado a `client.get` na chamada
 * mais recente. Usado em asserts que verificam o endpoint
 * consumido. Espelha `lastGetPath` em `routesTestHelpers.tsx`.
 *
 * **Hoje** o backend só expõe `GET /roles` (sem querystring); o
 * adapter client-side em `listRoles` aplica filtros/paginação em
 * memória. Quando o backend evoluir para `GET /systems/roles?...`,
 * este helper continuará válido — só mudará o conteúdo retornado.
 */
export function lastGetPath(client: ApiClientStub): string {
  const calls = client.get.mock.calls;
  if (calls.length === 0) return "";
  const path = calls[calls.length - 1][0];
  return typeof path === "string" ? path : "";
}

/**
 * Aceita string ou regex e devolve sempre um `RegExp` insensível a
 * caixa, com escape de metacaracteres. Espelha
 * `toCaseInsensitiveMatcher` em `routesTestHelpers.tsx`/
 * `systemsTestHelpers.tsx` — pré-fabricado para que as suítes de
 * mutação (#67/#68) consumam sem duplicar o helper (lição PR #128).
 */
export function toCaseInsensitiveMatcher(text: RegExp | string): RegExp {
  if (typeof text !== "string") {
    return text;
  }
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), "i");
}

/* ─── Helpers de mutação (Issues #67, #68) ─────────────────── */

/**
 * Caso de teste declarativo para os cenários `it.each(ERROR_CASES)`
 * das suítes de criação (#67) e edição (#68) — espelha
 * `RoutesErrorCase` em `routesTestHelpers.tsx`. Pré-fabricado para
 * que a próxima sub-issue não precise redeclarar o tipo (Sonar marca
 * tipos idênticos em arquivos diferentes como duplicação — lição
 * PR #127).
 */
export interface RolesErrorCase {
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
 * Constrói os 5 cenários de erro de submit que diferem **apenas** no
 * verbo (`criar` vs `atualizar`) entre as futuras suítes de criação
 * (#67) e edição (#68). Pré-fabrica o helper já no primeiro PR do
 * recurso para evitar a recorrência de `New Code Duplication` no
 * Sonar quando a #68 chegar (lição PR #128 — projetar shared
 * helpers desde o primeiro PR).
 */
export function buildSharedRoleSubmitErrorCases(
  verb: "criar" | "atualizar",
): ReadonlyArray<RolesErrorCase> {
  const verbAcao = verb === "criar" ? "criação" : "atualização";
  return [
    {
      name: "400 com errors mapeia mensagens para os campos correspondentes",
      error: {
        kind: "http",
        status: 400,
        message: "Erro de validação.",
        details: {
          errors: {
            Name: ["Name é obrigatório e não pode ser apenas espaços."],
            Code: ["Code deve ter no máximo 50 caracteres."],
          },
        },
      },
      expectedText: "Name é obrigatório e não pode ser apenas espaços.",
    },
    {
      name: "400 sem errors mapeáveis exibe Alert no topo do form",
      error: {
        kind: "http",
        status: 400,
        message: `Payload inválido para ${verbAcao} de role.`,
      },
      expectedText: `Payload inválido para ${verbAcao} de role.`,
    },
    {
      name: "401 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 401,
        message: "Sessão expirada. Faça login novamente.",
      },
      expectedText: "Sessão expirada. Faça login novamente.",
    },
    {
      name: "403 dispara toast vermelho com mensagem do backend",
      error: {
        kind: "http",
        status: 403,
        message: "Você não tem permissão para esta ação.",
      },
      expectedText: "Você não tem permissão para esta ação.",
    },
    {
      name: "erro genérico de rede dispara toast vermelho genérico",
      error: {
        kind: "network",
        message: "Falha de conexão com o servidor.",
      },
      expectedText: `Não foi possível ${verb} a role. Tente novamente.`,
    },
  ];
}

/**
 * Constrói os 3 cenários de fechamento sem persistência (Esc,
 * Cancelar, backdrop) usando o `cancelTestId` da suíte chamadora.
 * Espelha `buildRoutesCloseCases` em `routesTestHelpers.tsx` —
 * pré-fabricado já agora para a futura suíte de criação reusar com
 * a futura suíte de edição.
 */
export interface RolesModalCloseCase {
  name: string;
  close: () => void;
}

export function buildRolesCloseCases(
  cancelTestId: string,
): ReadonlyArray<RolesModalCloseCase> {
  return [
    {
      name: "Esc",
      // eslint-disable-next-line no-restricted-globals
      close: () => fireEvent.keyDown(window, { key: "Escape" }),
    },
    {
      name: "botão Cancelar",
      close: () => fireEvent.click(screen.getByTestId(cancelTestId)),
    },
    {
      name: "clique no backdrop",
      close: () => fireEvent.mouseDown(screen.getByTestId("modal-backdrop")),
    },
  ];
}

/**
 * Helper que executa um submit assíncrono dentro de `act` para
 * flushar a microtask antes do `waitFor`. Útil para futuras suítes
 * de mutação (#67, #68) que precisarão simular submit do form
 * — pré-fabricado para evitar duplicação entre criação/edição
 * (lição PR #127). A suíte de listagem (#66) não consome diretamente
 * — fica disponível no barrel.
 */
export async function submitFormAndAwait(
  formTestId: string,
  awaitOn: () => Promise<void>,
): Promise<void> {
  await act(async () => {
    fireEvent.submit(screen.getByTestId(formTestId));
    await Promise.resolve();
  });
  await awaitOn();
}
