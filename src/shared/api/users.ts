import { apiClient } from './index';

import type { PagedResponse } from './systems';
import type { ApiClient, ApiError, SafeRequestOptions } from './types';

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Sonar marca `throw` de
 * objeto não-Error como improvement (`Expected an error object to be
 * thrown`); estendê-lo com `Object.assign` preserva a interface
 * `ApiError` consumida por `isApiError` sem perder o stack trace.
 *
 * Centralizado para evitar repetir `Object.assign(new Error(...), { kind })`
 * em mais de um call site (`listUsers` por enquanto, futuros
 * `createUser`/`updateUser`/`deleteUser` quando as próximas issues
 * da EPIC #49 chegarem). Espelha o padrão de `systems.ts`/`routes.ts`/
 * `roles.ts` (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

/**
 * Espelho do `UserResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Users.UsersController.UserResponse`).
 *
 * Issue #77 (EPIC #49) — primeiro DTO da listagem de usuários,
 * pareado com o backend após PR lfc-authenticator#166 (que adicionou
 * `PagedResponse` + filtros server-side em `GET /users`).
 *
 * **Estado atual do contrato (snapshot do backend em
 * `UsersController.cs`):**
 *
 * O backend devolve `UserResponse(Id, Name, Email, ClientId,
 * Identity, Active, CreatedAt, UpdatedAt, DeletedAt, Roles,
 * Permissions)`. Esta listagem (#77) consome apenas:
 *
 * - `id`/`name`/`email`/`clientId`/`active`/`deletedAt` — coluna da
 *   tabela.
 * - `roles`/`permissions` — não consumidas pela listagem; mantemos
 *   opcionais no DTO porque `GET /users` (paginado) não traz os
 *   vínculos no payload (ver controller — `ToResponse(u)` é chamado
 *   sem `roles`/`permissions` no caminho `paged`). Apenas
 *   `GET /users/{id}` retorna os vínculos preenchidos.
 *
 * `active` (bool) e `deletedAt` (string|null) são semânticas
 * complementares: `active=false` indica usuário desativado mas ainda
 * não soft-deletado; `deletedAt != null` indica soft-delete pelo
 * pipeline padrão. A coluna "Status" mostra "Ativo" apenas quando
 * **ambos** ficam saudáveis (`active === true && deletedAt === null`),
 * consistente com a semântica do backend.
 *
 * Datas em ISO 8601 (UTC) — `string`; conversão fica a cargo do
 * consumidor que precisa exibir.
 */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  /**
   * UUID do cliente vinculado ao usuário, ou `null`. O backend cria
   * automaticamente um `Client` PF derivado quando `ClientId` não é
   * informado no `POST /users` (ver controller, `LegacyClientFactory`
   * em jogo) — portanto a maioria dos usuários reais traz `clientId`
   * preenchido em produção.
   */
  clientId: string | null;
  /**
   * Discriminator herdado do backend (`int`) — `0`/`1`/etc. mapeiam
   * para perfis legados. Mantido no DTO porque o backend rejeita
   * `Identity` ausente no create/update; UI da #77 não exibe a
   * coluna mas as próximas (#78 detalhe, #79 edit) consomem.
   */
  identity: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `UserDto`. Tolera `clientId`/`deletedAt` ausentes
 * (tratados como `null`); demais campos são obrigatórios e checados
 * em runtime. Espelha `isSystemDto`/`isRoleDto`.
 *
 * Exportado para que outros call sites (futuros wrappers `createUser`/
 * `updateUser` da EPIC #49) reusem a mesma fonte de verdade — evita
 * duplicação de validação de shape (lição PR #123).
 */
export function isUserDto(value: unknown): value is UserDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    typeof record.identity === 'number' &&
    typeof record.active === 'boolean' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.clientId === null ||
      record.clientId === undefined ||
      typeof record.clientId === 'string') &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === 'string')
  );
}

/**
 * Type guard para `PagedResponse<UserDto>`. Valida o envelope antes
 * de confiar no payload — protege contra divergência silenciosa de
 * versão entre frontend e backend (proxy intermediário cortando
 * campos, deploy desalinhado). Espelha `isPagedSystemsResponse` em
 * `systems.ts`.
 *
 * Exportado para que futuros call sites (refresh pós-criação/edição
 * via mesmo wrapper) reusem.
 */
export function isPagedUsersResponse(value: unknown): value is PagedResponse<UserDto> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.page !== 'number' ||
    typeof record.pageSize !== 'number' ||
    typeof record.total !== 'number' ||
    !Array.isArray(record.data)
  ) {
    return false;
  }
  return record.data.every(isUserDto);
}

/**
 * Defaults usados pela `listUsers` para alinhar a UI com os limites
 * do backend (`UsersController.DefaultPageSize = 20`/`MaxPageSize = 100`).
 *
 * Exportados para que a UI da `UsersListShellPage` use a mesma fonte
 * de verdade ao inicializar busca/paginação.
 */
export const DEFAULT_USERS_PAGE = 1;
export const DEFAULT_USERS_PAGE_SIZE = 20;
export const DEFAULT_USERS_INCLUDE_DELETED = false;

/**
 * Parâmetros aceitos por `listUsers`. Todos opcionais — quando
 * omitidos (ou iguais aos defaults), são removidos da querystring
 * para preservar o caminho canônico (`GET /users` em vez de
 * `GET /users?q=&page=1&...`).
 *
 * **Restrição do backend (controller):** `active` e `includeDeleted`
 * são mutuamente excludentes — passar os dois retorna 400 com
 * `errors.includeDeleted`. A UI evita o caso emparelhando os
 * controles (toggle "Mostrar inativas" desabilita o filtro `active`
 * quando ligado).
 */
export interface ListUsersParams {
  /** Termo de busca (case-insensitive em `Name` e `Email`). */
  q?: string;
  /**
   * UUID do cliente para filtrar a listagem aos usuários vinculados a
   * ele. `Guid.Empty` é rejeitado pelo backend (400).
   */
  clientId?: string;
  /**
   * Quando `true`, filtra apenas usuários com `active === true`.
   * Quando `false`, filtra apenas com `active === false`. Omitido
   * mantém o filtro padrão do backend (sem restrição em `active`).
   * Mutuamente excludente com `includeDeleted` — backend retorna 400
   * se ambos forem informados.
   */
  active?: boolean;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui usuários com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de
 * proxy. Espelha `buildQueryString` de `systems.ts`/`routes.ts`.
 *
 * `q` é trimado e omitido quando vazio para evitar `?q=` literal
 * (que o backend trataria como busca por string vazia, mas a UI
 * sinalizaria estado de "busca ativa" no `q`).
 */
function buildListQueryString(params: ListUsersParams): string {
  const search = new URLSearchParams();

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set('q', q);
  }

  if (typeof params.clientId === 'string' && params.clientId.length > 0) {
    search.set('clientId', params.clientId);
  }

  if (typeof params.active === 'boolean') {
    search.set('active', String(params.active));
  }

  if (typeof params.page === 'number' && params.page !== DEFAULT_USERS_PAGE) {
    search.set('page', String(params.page));
  }

  if (
    typeof params.pageSize === 'number' &&
    params.pageSize !== DEFAULT_USERS_PAGE_SIZE
  ) {
    search.set('pageSize', String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === 'boolean' &&
    params.includeDeleted !== DEFAULT_USERS_INCLUDE_DELETED
  ) {
    search.set('includeDeleted', String(params.includeDeleted));
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Lista usuários via `GET /users` com busca, filtro por cliente,
 * filtro `active` e paginação server-side (após PR
 * lfc-authenticator#166).
 *
 * Retorna o envelope tipado `PagedResponse<UserDto>`. Lança
 * `ApiError` em falhas (rede, parse, HTTP); o caller deve tratar com
 * try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController) —
 * em navegações rápidas, o caller cancela a request anterior antes de
 * disparar a nova, evitando race em `setState` (mesmo padrão de
 * `listSystems`/`listRoutes`).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); o default usa o singleton
 * `apiClient` configurado com `baseUrl` + `systemId` reais.
 *
 * Issue #77 — primeira sub-issue da EPIC #49 que efetivamente
 * consome o contrato HTTP de Users. As próximas issues (#78
 * detalhe, #79 edit, etc.) reutilizam o mesmo módulo seguindo o
 * padrão estabelecido pela EPIC #45 em `systems.ts`. O escopo desta
 * sub-issue contempla apenas listagem; create/update/delete ficam
 * para sub-issues seguintes (mantemos o `makeParseError` exportável
 * via reuso interno para evitar PR destrutivo nos próximos PRs —
 * lição PR #128).
 */
export async function listUsers(
  params: ListUsersParams = {},
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<UserDto>> {
  const path = `/users${buildListQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedUsersResponse(data)) {
    throw makeParseError();
  }
  return data;
}
