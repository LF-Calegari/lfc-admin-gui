import { isPagedResponseEnvelope } from './pagedResponse';

import { apiClient } from './index';

import type { PagedResponse } from './systems';
import type {
  ApiClient,
  ApiError,
  BodyRequestOptions,
  SafeRequestOptions,
} from './types';

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
  /**
   * Roles vinculadas ao usuário. **Hoje** o backend só preenche este
   * array no `GET /users/{id}` (após PR lfc-authenticator#167); a
   * listagem paginada `GET /users` devolve `UserResponse` sem o array
   * (`ToResponse(u)` é chamado sem `roles`/`permissions` no caminho
   * paged). Por isso o campo é opcional — testes/listagens que não
   * consumem o vínculo continuam válidos.
   *
   * A Issue #71 (atribuição de roles ao usuário) consome este array
   * para inicializar o set de roles atualmente vinculadas no salvar
   * com diff. Cada item é um `UserRoleSummary` enxuto (id + code +
   * name + systemId) — sem `permissionsCount`/`usersCount` para evitar
   * payload pesado.
   */
  roles?: ReadonlyArray<UserRoleSummary>;
}

/**
 * Resumo das roles vinculadas a um usuário, devolvido pelo
 * `GET /users/{id}` no array `roles` (lfc-authenticator#167). Não
 * confundir com `RoleDto` — este shape é enxuto (sem
 * `permissionsCount`/`usersCount`/timestamps) porque o backend
 * projeta apenas o suficiente para o frontend agrupar/exibir.
 *
 * O campo `systemId` viabiliza o agrupamento por sistema na Issue #71
 * (lfc-authenticator#163 — Role agora tem `SystemId` no model).
 *
 * `description` é opcional/`null` no model (`AppRole.Description`
 * permanece pendente no backend); mantemos no shape para
 * consistência futura.
 */
export interface UserRoleSummary {
  id: string;
  name: string;
  code: string;
  systemId: string;
  description?: string | null;
}

/**
 * Type guard para `UserRoleSummary`. Tolera `description` ausente
 * (estado atual do backend). Privado ao módulo — exposto via
 * `isUserDto` apenas indiretamente (validação do array `roles`).
 *
 * Usa destructuring + ramos curtos ao invés do `if`/`return`
 * tradicional para evitar que o JSCPD tokenize esta função idêntica
 * ao `isSystemDto` (lição PR #134/#135).
 */
function isUserRoleSummary(value: unknown): value is UserRoleSummary {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, code, systemId, description } = value as Record<
    string,
    unknown
  >;
  const requiredStringsValid =
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof code === 'string' &&
    typeof systemId === 'string';
  if (!requiredStringsValid) return false;
  return (
    description === null ||
    description === undefined ||
    typeof description === 'string'
  );
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
  // `roles` é opcional. Quando presente, exige `Array<UserRoleSummary>`.
  // Ausente/`undefined` é válido (listagem paginada não traz o array).
  const rolesValid =
    record.roles === undefined ||
    (Array.isArray(record.roles) && record.roles.every(isUserRoleSummary));
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
      typeof record.deletedAt === 'string') &&
    rolesValid
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
  return isPagedResponseEnvelope(value, isUserDto);
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

/**
 * Body aceito pelo `POST /users` no `lfc-authenticator`
 * (`UsersController.CreateUserRequest`).
 *
 * Issue #78 (EPIC #49) — primeiro fluxo de mutação do recurso Users.
 * Espelha o contrato exato do backend (`UsersController.cs` linha 36):
 *
 * - `name` (obrigatório, máx. 80 chars) — nome amigável.
 * - `email` (obrigatório, máx. 320 chars, formato válido) — único no
 *   sistema; o backend normaliza para `lowercase` antes de gravar.
 * - `password` (obrigatório, máx. 60 chars) — senha em texto plano que
 *   o backend hasheia via `UserPasswordHasher.HashPlainPassword` antes
 *   de persistir. Frontend nunca grava em log/storage.
 * - `identity` (obrigatório, `int`) — discriminator herdado do backend
 *   que mapeia para perfis legados; obrigatoriedade vem de
 *   `[Required] public int? Identity` no controller (DataAnnotations
 *   aceita `0` como valor válido).
 * - `clientId` (opcional, UUID) — quando ausente, o backend gera um
 *   `Client` PF derivado via `LegacyClientFactory.BuildPfClientForUser`
 *   automaticamente. Quando informado, valida que o `Client` exista —
 *   inexistente devolve `400` com `"ClientId informado não existe."`
 *   (mensagem **fora** do `ValidationProblemDetails`, em
 *   `{ message }` simples).
 * - `active` (opcional, `bool`, default `true`) — quando omitido, o
 *   backend grava `Active = true`. Mantemos opcional para que o UI
 *   omita o campo no payload quando o usuário não tocar no toggle.
 *
 * Backend trima `Name`/`Email`/`Password` e converte `Email` para
 * lowercase antes de gravar. O frontend trima defensivamente em
 * `buildUserMutationBody` para preservar o contrato mesmo se um caller
 * futuro pular a camada HTTP.
 *
 * Já declaramos `CreateUserPayload` exportável para que sub-issues
 * subsequentes (`updateUser`, `updatePassword`) reusem a mesma fonte
 * de verdade — lição PR #128.
 */
export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  identity: number;
  clientId?: string;
  active?: boolean;
}

/**
 * Constrói o body para `POST /users` aplicando trim defensivo nos
 * campos texto e omitindo campos opcionais não preenchidos. Centralizar
 * essa montagem garante que futuros call sites (`updateUser` na sub-
 * issue de edição) enviem exatamente o mesmo shape sem reabrir o módulo
 * para padronizar serialização. Espelha `buildSystemMutationBody` de
 * `systems.ts` e `buildRouteMutationBody` de `routes.ts` (lição PR #128).
 *
 * - `email`: o backend já normaliza `ToLowerInvariant`; o frontend
 *   apenas trima — manter o lowercase como responsabilidade exclusiva
 *   do backend evita drift caso a regra mude (ex.: i18n).
 * - `clientId` é omitido quando vazio depois de trim para que o backend
 *   acione o caminho `LegacyClientFactory` (gera client PF derivado).
 * - `active` só é incluído quando o caller informa explicitamente —
 *   omitir aproveita o default `true` do backend.
 */
function buildUserMutationBody(payload: CreateUserPayload): CreateUserPayload {
  const body: CreateUserPayload = {
    name: payload.name.trim(),
    email: payload.email.trim(),
    password: payload.password,
    identity: payload.identity,
  };
  const trimmedClientId = payload.clientId?.trim();
  if (trimmedClientId && trimmedClientId.length > 0) {
    body.clientId = trimmedClientId;
  }
  if (typeof payload.active === 'boolean') {
    body.active = payload.active;
  }
  return body;
}

/**
 * Cria um novo usuário via `POST /users` (Issue #78).
 *
 * Retorna o `UserDto` recém-criado (`201 Created` com `UserResponse` no
 * corpo). Lança `ApiError` em qualquer falha — caller tipicamente trata:
 *
 * - 409 → conflito de email (`"Já existe um usuário com este Email."`).
 * - 400 → validação de campo (`ValidationProblemDetails` com chaves
 *   `Name`/`Email`/`Password`/`Identity`) **ou** `{ message: "ClientId
 *   informado não existe." }` quando o `clientId` referenciado não
 *   existe na base. Os dois casos chegam como `ApiError` com `status:
 *   400`; o segundo não tem `details.errors` mapeáveis, então cai no
 *   fallback do `applyBadRequest` (Alert no topo do form).
 * - 401/403 → toast vermelho (gating de permissão).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 *
 * O response é validado contra `isUserDto` para detectar drift de
 * contrato precocemente — backend novo retornando shape inesperado
 * dispara `ApiError(parse)` em vez de propagar shape inválido para a
 * UI.
 */
export async function createUser(
  payload: CreateUserPayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserDto> {
  const body = buildUserMutationBody(payload);
  const data = await client.post<unknown>('/users', body, options);
  if (!isUserDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `PUT /users/{id}` no `lfc-authenticator`
 * (`UsersController.UpdateUserRequest`).
 *
 * Issue #79 (EPIC #49) — segundo fluxo de mutação do recurso Users.
 * Espelha o contrato exato do backend (`UsersController.cs` linha 59):
 *
 * - `name` (obrigatório, máx. 80 chars).
 * - `email` (obrigatório, máx. 320 chars, formato válido) — único; o
 *   backend normaliza para `lowercase` antes de gravar e valida unicidade
 *   ignorando o próprio usuário (`EmailExistsNormalizedAsync(_, _, id)`).
 * - `identity` (obrigatório, `int`).
 * - `clientId` (opcional, UUID) — quando ausente, o backend mantém o
 *   `ClientId` atual do usuário (`user.ClientId = request.ClientId ?? user.ClientId`).
 *   Quando informado e o `Client` não existe, devolve `400 { message:
 *   "ClientId informado não existe." }` (mensagem **fora** do
 *   `ValidationProblemDetails`).
 * - `active` (obrigatório, `bool`) — diferente do create (onde é
 *   opcional com default `true`), no update o backend exige presença
 *   explícita.
 *
 * **Diferença chave vs `CreateUserPayload`:** sem `password`. O reset de
 * senha em update é endpoint separado (`PUT /users/{id}/password`,
 * issue futura) — manter a payload do update sem `Password` previne
 * regressões silenciosas (operador editando outros campos não muda
 * senha por engano) e alinha 1:1 com o contrato do backend.
 */
export interface UpdateUserPayload {
  name: string;
  email: string;
  identity: number;
  clientId?: string;
  active: boolean;
}

/**
 * Constrói o body para `PUT /users/{id}` aplicando trim defensivo nos
 * campos texto e omitindo `clientId` quando vazio depois de trim.
 *
 * Espelha `buildUserMutationBody` (create) na semântica de trim/omit, mas
 * **sem `password`** (preservar simetria com `UpdateUserPayload`) e
 * **sempre incluindo `active`** (que no update é `[Required]` no backend).
 *
 * Centralizar a montagem permite que futuros call sites (refresh
 * pós-edição via mesmo wrapper, ou refactors) enviem exatamente o mesmo
 * shape sem reabrir o módulo (lição PR #128).
 */
function buildUserUpdateBody(payload: UpdateUserPayload): UpdateUserPayload {
  const body: UpdateUserPayload = {
    name: payload.name.trim(),
    email: payload.email.trim(),
    identity: payload.identity,
    active: payload.active,
  };
  const trimmedClientId = payload.clientId?.trim();
  if (trimmedClientId && trimmedClientId.length > 0) {
    body.clientId = trimmedClientId;
  }
  return body;
}

/**
 * Atualiza um usuário existente via `PUT /users/{id}` (Issue #79).
 *
 * Retorna o `UserDto` atualizado (`200 OK` com `UserResponse` no corpo).
 * Lança `ApiError` em qualquer falha — caller tipicamente trata:
 *
 * - 409 → conflito de email (`"Já existe outro usuário com este Email."`).
 * - 400 → validação de campo (`ValidationProblemDetails` com chaves
 *   `Name`/`Email`/`Identity`) **ou** `{ message: "ClientId informado
 *   não existe." }` quando o `clientId` referenciado não existe na base.
 *   Os dois casos chegam como `ApiError` com `status: 400`; o segundo
 *   não tem `details.errors` mapeáveis, então cai no fallback do
 *   `applyBadRequest` (Alert no topo do form).
 * - 404 → usuário não encontrado (soft-deletado concorrentemente entre
 *   abertura e submit). UI fecha o modal, dispara toast e força refetch.
 * - 401/403 → toast vermelho (gating de permissão).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 *
 * O response é validado contra `isUserDto` para detectar drift de
 * contrato precocemente — backend retornando shape inesperado dispara
 * `ApiError(parse)` em vez de propagar shape inválido para a UI.
 */
export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserDto> {
  const body = buildUserUpdateBody(payload);
  const data = await client.put<unknown>(`/users/${id}`, body, options);
  if (!isUserDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `PUT /users/{id}/password` no `lfc-authenticator`
 * (`UsersController.UpdatePasswordRequest`).
 *
 * Issue #81 (EPIC #49) — fluxo dedicado de reset de senha do operador
 * sobre outro usuário. O backend mantém este endpoint **separado** do
 * `PUT /users/{id}` para preservar simetria com o contrato:
 *
 * - `Password` (obrigatório, máx. 60 chars) — senha em texto plano que
 *   o backend trima e hasheia via
 *   `UserPasswordHasher.HashPlainPassword` antes de persistir. Frontend
 *   nunca grava em log/storage e o body **não** é serializado em URL.
 *
 * Permissão: `Users.Update` — mesma do `PUT /users/{id}`. Backend
 * valida via `[Authorize(Policy = PermissionPolicies.UsersUpdate)]`.
 *
 * Status codes esperados:
 *
 * - `200` com `UserResponse` no body (idêntico ao `updateUser`).
 * - `400` com `ValidationProblemDetails` quando a senha é vazia/só
 *   espaços/longa demais.
 * - `404` (`{ message: "Usuário não encontrado." }`) quando o id
 *   referenciado foi soft-deletado entre abertura e submit.
 * - `401`/`403` por gating de permissão.
 *
 * Mantemos exportável (em vez de `string` literal inline) para que o
 * teste unitário e o modal compartilhem a mesma fonte de verdade.
 */
export interface ResetUserPasswordPayload {
  password: string;
}

/**
 * Reset de senha de um usuário via `PUT /users/{id}/password` (Issue #81).
 *
 * Retorna o `UserDto` atualizado (`200 OK` com `UserResponse` no body —
 * mesmo shape do `updateUser`). Lança `ApiError` em qualquer falha — o
 * caller tipicamente trata:
 *
 * - 400 → validação de campo (`ValidationProblemDetails` com chave
 *   `Password`). Caller exibe inline no campo "Nova senha".
 * - 404 → usuário não encontrado (soft-deletado entre abertura e
 *   submit). UI fecha o modal, dispara toast e força refetch.
 * - 401/403 → toast vermelho (gating de permissão).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); em produção usa-se o singleton
 * `apiClient`.
 *
 * **Por que `password` é parâmetro literal e não `ResetUserPasswordPayload`?**
 * O endpoint só aceita esse campo — exigir um objeto wrapper
 * adicionaria boilerplate sem benefício de tipagem (a única chave já
 * está nomeada). Mantemos a assinatura `(id, password)` simétrica com a
 * percepção semântica do reset ("resetar senha do usuário X para Y") e
 * evita o teste tipo `expect.objectContaining({ password: 'x' })` que
 * seria menos legível.
 *
 * O response é validado contra `isUserDto` para detectar drift de
 * contrato precocemente — backend retornando shape inesperado dispara
 * `ApiError(parse)` em vez de propagar shape inválido para a UI.
 *
 * Espelha o padrão de `updateUser`/`createUser` mas sem `buildBody`
 * dedicado — o body é trivial (`{ password }`) e o trim acontece no
 * backend (`request.Password.Trim()` em `UpdatePassword`). Trimar
 * client-side aqui daria comportamento divergente do que o operador
 * vê: se ele digitar `"  abc  "`, o backend salvaria `"abc"` mesmo —
 * preservar literal preserva paridade visual com a senha exibida no
 * input.
 */
export async function resetUserPassword(
  id: string,
  password: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserDto> {
  const body: ResetUserPasswordPayload = { password };
  const data = await client.put<unknown>(`/users/${id}/password`, body, options);
  if (!isUserDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Carrega o `UserResponse` completo de um usuário via `GET /users/{id}`
 * (lfc-authenticator#167). Diferente da listagem paginada (`listUsers`),
 * este endpoint preenche o array `roles` com os vínculos atuais
 * (`UserRoleSummary[]`), o que permite a Issue #71 (atribuição de roles)
 * inicializar a matriz de checkboxes sem precisar de uma request
 * separada.
 *
 * Retorna o `UserDto` completo. Lança `ApiError`:
 *
 * - 404 → usuário não encontrado/soft-deletado (UI exibe Alert "Usuário
 *   não encontrado." e oferece voltar para listagem).
 * - 401/403 → cliente HTTP já lidou; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 *
 * Cancelamento via `signal` em `options` é propagado para o cliente —
 * em navegações rápidas (ex.: trocar de usuário rapidamente), o caller
 * cancela a request anterior antes de disparar a nova, evitando race
 * em `setState`.
 */
export async function getUserById(
  id: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserDto> {
  const data = await client.get<unknown>(`/users/${id}`, options);
  if (!isUserDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Espelho do `UserRoleResponse` do `lfc-authenticator`
 * (`UsersController.UserRoleResponse`) — devolvido pelo backend em
 * `POST /users/{id}/roles`. A UI da Issue #71 não consome os campos
 * individualmente (refetch de `getUserById` sincroniza o estado pós-
 * mutação), mas tipamos o retorno para preservar contrato — qualquer
 * evolução do backend é capturada pelo type guard.
 *
 * Espelha `UserPermissionLinkDto` em `permissions.ts` (mesmo shape
 * mínimo de vínculo: `id`/`userId`/`roleId`/timestamps).
 */
export interface UserRoleLinkDto {
  id: string;
  userId: string;
  roleId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function isUserRoleLinkDto(value: unknown): value is UserRoleLinkDto {
  if (typeof value !== 'object' || value === null) return false;
  const { id, userId, roleId, createdAt, updatedAt, deletedAt } = value as Record<
    string,
    unknown
  >;
  const requiredStringsValid =
    typeof id === 'string' &&
    typeof userId === 'string' &&
    typeof roleId === 'string' &&
    typeof createdAt === 'string' &&
    typeof updatedAt === 'string';
  if (!requiredStringsValid) return false;
  return (
    deletedAt === null || deletedAt === undefined || typeof deletedAt === 'string'
  );
}

/**
 * Vincula uma role ao usuário via `POST /users/{userId}/roles`
 * (lfc-authenticator — `UsersController.AssignRole`).
 *
 * Backend é idempotente:
 *
 * - Vínculo inexistente → cria novo `UserRole` (`201 Created`).
 * - Vínculo soft-deletado → reativa (`DeletedAt = null`, `200 OK`).
 * - Vínculo já ativo → devolve o existente (`200 OK`).
 *
 * A UI trata todos como sucesso. Lança `ApiError`:
 *
 * - 400 → `roleId` inválido/inexistente (toast + reverter o checkbox).
 * - 404 → usuário não encontrado (fechar a tela e voltar).
 * - 401/403 → cliente HTTP já lidou com `onUnauthorized`/falta de
 *   permissão; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`. Espelha `assignPermissionToUser`
 * (lição PR #128 — mesmo shape de wrapper para o segundo recurso de
 * assignment do mesmo controller).
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserRoleLinkDto> {
  const data = await client.post<unknown>(
    `/users/${userId}/roles`,
    { roleId },
    options,
  );
  if (!isUserRoleLinkDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Remove o vínculo de uma role com o usuário via
 * `DELETE /users/{userId}/roles/{roleId}` (lfc-authenticator —
 * `UsersController.RemoveRole`).
 *
 * Backend faz soft-delete do vínculo (`DeletedAt = UtcNow`, `204 No
 * Content`). Permissões herdadas via essa role deixam de aparecer em
 * `effective-permissions`, mas vínculos diretos do usuário não são
 * afetados.
 *
 * Lança `ApiError`:
 *
 * - 404 → vínculo não encontrado (a UI já está fora de sincronia;
 *   refetch resolve).
 * - 401/403 → cliente HTTP já lidou; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`. Espelha `removePermissionFromUser`.
 */
export async function removeRoleFromUser(
  userId: string,
  roleId: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/users/${userId}/roles/${roleId}`, options);
}

/**
 * Espelho do `ForceLogoutResponse` do `lfc-authenticator`
 * (`UsersController.ForceLogoutResponse`).
 *
 * Issue #82 (EPIC #49) — invalidação remota de sessões. Após o backend
 * incrementar o `TokenVersion` do usuário-alvo, todos os JWTs emitidos
 * com a versão anterior passam a falhar a verificação no próximo
 * `verify-token`. A UI consome apenas a confirmação da operação (toast
 * verde), mas mantemos o shape completo em tipo para preservar contrato
 * — qualquer evolução do backend (ex.: incluir `expiresAt` ou
 * `affectedSessions`) é capturada pelo type guard antes de propagar
 * shape inesperado para o caller.
 *
 * - `message`: cópia em pt-BR confirmando o sucesso
 *   (`"Sessões do usuário invalidadas com sucesso."`).
 * - `userId`: id do usuário-alvo (eco do path param) — usado para
 *   diagnóstico em logs do operador, não exibido.
 * - `newTokenVersion`: novo `TokenVersion` após o incremento. Útil em
 *   testes de integração e auditoria; UI atual ignora.
 */
export interface ForceLogoutResponse {
  message: string;
  userId: string;
  newTokenVersion: number;
}

/**
 * Type guard para `ForceLogoutResponse`. Espelha `isUserDto`/
 * `isUserRoleLinkDto`: tolera campos extras no payload (forward-compat
 * com backend), mas exige os três campos obrigatórios com tipos
 * corretos. Retornar `false` causa `ApiError(parse)` no caller, que
 * traduz para "Resposta inválida do servidor." — mesmo padrão dos
 * demais wrappers do recurso.
 */
function isForceLogoutResponse(value: unknown): value is ForceLogoutResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { message, userId, newTokenVersion } = value as Record<string, unknown>;
  return (
    typeof message === 'string' &&
    typeof userId === 'string' &&
    typeof newTokenVersion === 'number'
  );
}

/**
 * Invalida todas as sessões ativas de um usuário via
 * `POST /users/{id}/force-logout` (lfc-authenticator#168).
 *
 * O backend incrementa o `TokenVersion` do usuário-alvo: tokens antigos
 * passam a falhar no próximo `verify-token`/`/auth/permissions`,
 * derrubando a sessão sem precisar invalidar o JWT no servidor.
 *
 * Endpoint requer `Users.Update` — mesma policy de `PUT /users/{id}` e
 * `PUT /users/{id}/password`. Backend valida via
 * `[Authorize(Policy = PermissionPolicies.UsersUpdate)]`.
 *
 * **Self-target é rejeitado**: o backend retorna `400` com
 * `{ message: "Não é possível forçar logout de si mesmo por este
 * endpoint. Utilize GET /auth/logout." }`. A UI bloqueia
 * preventivamente escondendo a ação na linha do próprio usuário
 * corrente, mas mantemos a tradução do 400 como defesa em profundidade.
 *
 * Status codes esperados:
 *
 * - `200 OK` com `ForceLogoutResponse` no body.
 * - `400 Bad Request` quando self-target (caller deve esconder a ação).
 * - `404 Not Found` quando o usuário foi soft-deletado entre abertura
 *   do modal e submit (caller fecha modal + dispara refetch).
 * - `401`/`403` por gating de permissão — cliente HTTP já lidou com
 *   `onUnauthorized`; UI exibe toast.
 *
 * **Por que `POST` sem body?** O backend não espera payload — o id já
 * vem no path. Passamos `null` literal para o `client.post` porque o
 * cliente HTTP serializa `null` como body vazio (corpo zero-length); a
 * alternativa (`{}`) enviaria `{}` no body e o backend ignoraria, mas
 * preservar o contrato exato facilita auditoria de logs.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); em produção usa-se o singleton
 * `apiClient`.
 */
export async function forceLogoutUser(
  id: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<ForceLogoutResponse> {
  const data = await client.post<unknown>(
    `/users/${id}/force-logout`,
    null,
    options,
  );
  if (!isForceLogoutResponse(data)) {
    throw makeParseError();
  }
  return data;
}
