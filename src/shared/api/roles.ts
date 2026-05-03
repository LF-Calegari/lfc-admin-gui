import { isPagedResponseEnvelope } from "./pagedResponse";

import { apiClient } from "./index";

import type { PagedResponse } from "./systems";
import type {
  ApiClient,
  ApiError,
  BodyRequestOptions,
  SafeRequestOptions,
} from "./types";

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Sonar marca `throw` de
 * objeto não-Error como improvement (`Expected an error object to be
 * thrown`); estendê-lo com `Object.assign` preserva a interface
 * `ApiError` consumida por `isApiError` sem perder o stack trace.
 *
 * Centralizado para evitar repetir `Object.assign(new Error(...), { kind })`
 * em três call sites (`listRoles`/`createRole`/`updateRole`) — o
 * Sonar contaria a repetição como duplicação. Espelha o padrão do
 * `routes.ts` (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 */
function makeParseError(): ApiError {
  return Object.assign(new Error("Resposta inválida do servidor."), {
    kind: "parse" as const,
  });
}

/**
 * Espelho do `RoleResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Roles.RolesController.RoleResponse`).
 *
 * Issue #66 (EPIC #47) — primeiro DTO da listagem de roles.
 *
 * **Estado atual do contrato (snapshot do backend em `RolesController.cs`):**
 *
 * O backend hoje expõe `/roles` como recurso **global** (não vinculado
 * a um sistema) e devolve `RoleResponse(Id, Name, Code, CreatedAt,
 * UpdatedAt, DeletedAt)`. Os campos abaixo, marcados como pendentes
 * no backend, ainda não são devolvidos:
 *
 * - `description: string | null` — pendente no backend
 *   (`AppRole.Description` ainda não existe no model). Mantido como
 *   opcional/`null` no DTO para que a UI saiba renderizar "—" como
 *   placeholder hoje e exiba a descrição automaticamente quando o
 *   backend evoluir.
 * - `permissionsCount: number` / `usersCount: number` — pendentes
 *   no backend (controller não inclui contagens no projection).
 *   Mantidos como opcionais para suportar o futuro `RoleResponse`
 *   enriquecido sem precisar de PR destrutivo nesta camada.
 * - `systemId` — pendente no backend (roles são globais hoje). A UI
 *   lê `:systemId` da URL para preservar a IA da EPIC #47 (listagem
 *   por sistema), mas o filtro real só passa a fazer sentido quando
 *   o model for estendido com `SystemId`.
 *
 * As datas são serializadas pelo backend em ISO 8601 (UTC) — mantemos
 * como `string` porque a UI consome via `Intl.DateTimeFormat`/
 * `new Date()` quando precisar exibir; converter no boundary do
 * cliente HTTP traria custo sem benefício. `deletedAt !== null` indica
 * soft-delete.
 *
 * Cada um dos campos opcionais acima passa pelo `isRoleDto` apenas
 * quando presente — payloads sem o campo (estado atual) continuam
 * válidos.
 */
export interface RoleDto {
  id: string;
  /**
   * UUID do sistema dono da role. Após `lfc-authenticator#163` é
   * obrigatório no model `AppRole`. Tipo `string | null` preserva
   * compatibilidade com fixtures de teste históricas e payloads de
   * servidores menos atualizados — quando ausente, a UI cai no grupo
   * "Sem sistema" do agrupamento por sistema.
   */
  systemId: string | null;
  name: string;
  code: string;
  /**
   * Descrição livre da role. Ainda **não enviada** pelo backend
   * `lfc-authenticator` (`AppRole.Description` continua pendente).
   * A UI exibe "—" como placeholder enquanto o campo for
   * `null`/`undefined`.
   */
  description: string | null;
  /**
   * Contagem de permissões vinculadas à role. Ainda **não enviada**
   * pelo backend (pendente). A UI exibe "—" enquanto o valor for
   * `null`/`undefined` — quando o backend devolver, a UI mostra
   * automaticamente.
   */
  permissionsCount: number | null;
  /**
   * Contagem de usuários que possuem essa role. Mesmo status de
   * `permissionsCount` — pendente no backend; a UI exibe "—" hoje.
   */
  usersCount: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `RoleDto`. Tolera `description`/`deletedAt`/
 * `permissionsCount`/`usersCount` ausentes (tratados como `null`) —
 * outros campos são obrigatórios e checados em runtime.
 *
 * Exportado para que outros call sites (ex.: `createRole`/`updateRole`
 * validando o `RoleResponse` devolvido pelo backend nas próximas
 * issues #67/#68) reusem a mesma fonte de verdade — evita duplicação
 * de validação de shape (lição PR #123, "type guards quase idênticos
 * em arquivos diferentes precisam de helper compartilhado").
 */
export function isRoleDto(value: unknown): value is RoleDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.code === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.systemId === null ||
      record.systemId === undefined ||
      typeof record.systemId === "string") &&
    (record.description === null ||
      record.description === undefined ||
      typeof record.description === "string") &&
    (record.permissionsCount === null ||
      record.permissionsCount === undefined ||
      typeof record.permissionsCount === "number") &&
    (record.usersCount === null ||
      record.usersCount === undefined ||
      typeof record.usersCount === "number") &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === "string")
  );
}

/**
 * Type guard para `PagedResponse<RoleDto>`. Valida o envelope antes
 * de confiar no payload — protege contra divergência silenciosa de
 * versão entre frontend e backend (proxy intermediário cortando
 * campos, deploy desalinhado). Espelha `isPagedRoutesResponse` em
 * `routes.ts`.
 *
 * Após `lfc-authenticator#163`/`#164`, o backend `/roles` devolve o
 * envelope paginado nativo (`PagedResponse<RoleResponse>` com
 * `systemId`, `description`, `permissionsCount`, `usersCount`).
 * `listRoles` valida o envelope direto via este guard.
 */
export function isPagedRolesResponse(
  value: unknown,
): value is PagedResponse<RoleDto> {
  return isPagedResponseEnvelope(value, isRoleDto);
}

/**
 * Defaults usados pela `listRoles` para alinhar a UI com os limites
 * historicamente adotados no `lfc-admin-gui` (`SystemsPage`/
 * `RoutesPage`). Quando o backend ganhar paginação real para roles,
 * esses defaults serão enviados na querystring; hoje o adapter
 * client-side respeita os mesmos valores.
 *
 * `DEFAULT_ROLES_PAGE_SIZE = 20` espelha `RoutesController.DefaultPageSize`
 * — manter um único limite reduz surpresas para o admin que alterna
 * entre listas.
 */
export const DEFAULT_ROLES_PAGE = 1;
export const DEFAULT_ROLES_PAGE_SIZE = 20;
export const DEFAULT_ROLES_INCLUDE_DELETED = false;

/**
 * Limite superior usado para carregar **todas** as roles ativas em uma
 * única requisição — usado pela Issue #71 (atribuição de roles ao
 * usuário, matriz de checkboxes agrupada por sistema). Espelha
 * `MAX_PERMISSIONS_PAGE_SIZE` em `permissions.ts`. Quando o catálogo
 * crescer além de 100, a issue pede revisitar (paginação real ou
 * agrupar/colapsar por sistema com fetch lazy — mesma pendência
 * registrada na Issue #70).
 */
export const MAX_ROLES_PAGE_SIZE = 100;

/**
 * Parâmetros aceitos por `listRoles`.
 *
 * `systemId` é **opcional**. Quando informado, filtra roles cuja
 * `Role.SystemId` coincide (server-side, via querystring). Quando
 * omitido, devolve roles de **todos** os sistemas — caso usado pela
 * Issue #71 (atribuição de roles ao usuário, agrupando por sistema
 * na UI) e pela Issue #173 (`/roles` global cross-system).
 *
 * Após `lfc-authenticator#163`/`#164`, todos os parâmetros (`systemId`,
 * `q`, `page`, `pageSize`, `includeDeleted`) são aplicados pelo
 * controller `RolesController.GetAll` no backend — não há mais
 * adapter client-side.
 */
export interface ListRolesParams {
  /**
   * UUID do sistema dono das roles. Opcional — quando ausente, o
   * backend devolve roles de todos os sistemas (caso da Issue #71/
   * #173).
   */
  systemId?: string;
  /** Termo de busca (case-insensitive em `Name` e `Code`). */
  q?: string;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui roles com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Endpoint atual do backend para listagem de roles.
 */
const ROLES_LIST_PATH = "/roles";

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de
 * proxy. Espelha `buildQueryString` de `systems.ts`.
 *
 * `q` é trimado e omitido quando vazio para evitar `?q=` literal
 * (que o backend trataria como busca por string vazia).
 */
function buildRolesQueryString(params: ListRolesParams): string {
  const search = new URLSearchParams();

  if (params.systemId && params.systemId.length > 0) {
    search.set("systemId", params.systemId);
  }

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set("q", q);
  }

  if (typeof params.page === "number" && params.page !== DEFAULT_ROLES_PAGE) {
    search.set("page", String(params.page));
  }

  if (
    typeof params.pageSize === "number" &&
    params.pageSize !== DEFAULT_ROLES_PAGE_SIZE
  ) {
    search.set("pageSize", String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === "boolean" &&
    params.includeDeleted !== DEFAULT_ROLES_INCLUDE_DELETED
  ) {
    search.set("includeDeleted", String(params.includeDeleted));
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

/**
 * Lista roles via `GET /roles` com busca, paginação e filtro de
 * soft-deleted **aplicados pelo backend**.
 *
 * Após `lfc-authenticator#163`/`#164`, o backend `/roles` devolve o
 * envelope paginado nativo (`PagedResponse<RoleResponse>` com
 * `systemId`, `description`, `permissionsCount`, `usersCount`). A
 * função simplesmente monta a querystring, faz o GET, valida o
 * envelope e devolve. O adapter client-side (filtragem/paginação em
 * memória) foi removido.
 *
 * Lança `ApiError` em qualquer falha (rede, parse, HTTP) — o caller
 * trata com try/catch. Cancelamento via `signal` em `options` é
 * propagado para o cliente.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); o default usa o singleton
 * `apiClient` configurado com `baseUrl` + `systemId` reais.
 */
export async function listRoles(
  params: ListRolesParams,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<RoleDto>> {
  const path = `${ROLES_LIST_PATH}${buildRolesQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedRolesResponse(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `POST /roles` no `lfc-authenticator`
 * (`RolesController.CreateRoleRequest`).
 *
 * Definido aqui (e não em #67) por dois motivos: (i) `isRoleDto` já
 * cobre o response, então mantemos input/output simétricos no mesmo
 * módulo; (ii) lição PR #128 — desde o primeiro PR do recurso,
 * projetar tipos compartilhados para evitar duplicação no PR
 * seguinte.
 *
 * - `systemId` (obrigatório, UUID) — sistema dono da role. O backend
 *   marca `RoleRequestBase.SystemId` como `[Required]` e rejeita
 *   payloads sem este campo com 400. A UI sempre injeta o valor lido
 *   da URL `/systems/:systemId/roles` (após enriquecimento do
 *   contrato em `lfc-authenticator#163`/`#164`).
 * - `name` (obrigatório, máx. 80 chars) — nome amigável da role.
 * - `code` (obrigatório, máx. 50 chars) — identificador da role.
 *   Único por `(SystemId, Code)` no `lfc-authenticator` — colidir
 *   com Code de outra role no mesmo sistema retorna 409 com
 *   `"Já existe outro role com este Code neste sistema."`.
 * - `description` (opcional, máx. 500 chars) — descrição livre. O
 *   backend converte string vazia em `null` (mesmo padrão de
 *   `RoutesController`).
 *
 * Backend trima `Name`/`Code` e converte `Description` vazia em
 * `null`.
 */
export interface CreateRolePayload {
  systemId: string;
  name: string;
  code: string;
  description?: string;
}

/**
 * Body aceito pelo `PUT /roles/{id}` no `lfc-authenticator`
 * (`RolesController.UpdateRoleRequest`). Mesmo shape do create —
 * segue o padrão do `routes.ts` (alias intencional para preservar
 * simetria de contrato — divergência futura no backend pega ambos os
 * call sites de uma vez). Issue #68 implementa o caller; já
 * declarado aqui pelo mesmo motivo de `CreateRolePayload` (lição
 * PR #128).
 */
export type UpdateRolePayload = CreateRolePayload;

/**
 * Cria uma nova role via `POST /roles` (Issue #67).
 *
 * Retorna o `RoleDto` recém-criado (`201 Created` com `RoleResponse`
 * no corpo). Lança `ApiError` em qualquer falha — caller tipicamente
 * trata 409 (conflito de Code), 400 (validação de campo) e fallbacks
 * genéricos. Wrapper já implementado nesta sub-issue para evitar PR
 * destrutivo no #67 (lição PR #128).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function createRole(
  payload: CreateRolePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<RoleDto> {
  const body = buildRoleMutationBody(payload);
  const data = await client.post<unknown>("/roles", body, options);
  if (!isRoleDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Atualiza uma role existente via `PUT /roles/{id}` (Issue #68).
 *
 * Retorna o `RoleDto` atualizado (`200 OK` com `RoleResponse` no
 * corpo). Lança `ApiError` em qualquer falha — caller tipicamente
 * trata 409 (conflito de Code), 404 (role não encontrada/soft-
 * deletada), 400 (validação de campo). Wrapper já implementado para
 * evitar PR destrutivo no #68 (lição PR #128).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function updateRole(
  id: string,
  payload: UpdateRolePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<RoleDto> {
  const body = buildRoleMutationBody(payload);
  const data = await client.put<unknown>(`/roles/${id}`, body, options);
  if (!isRoleDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Desativa (soft-delete) uma role via `DELETE /roles/{id}` (sub-
 * issue futura da EPIC #47).
 *
 * O backend (`RolesController.DeleteById`) seta `DeletedAt = UtcNow`
 * e responde `204 No Content` em sucesso. O método não devolve corpo
 * — a função resolve `void` e a UI faz refetch para sincronizar a
 * lista.
 *
 * Lança `ApiError` em qualquer falha (404, 401, 403, 5xx, network).
 * Wrapper já implementado nesta sub-issue para evitar PR destrutivo
 * no PR de exclusão (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function deleteRole(
  id: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/roles/${id}`, options);
}

/**
 * Constrói o body para `POST /roles` e `PUT /roles/{id}` aplicando
 * trim defensivo nos campos. Description vazia depois de trim vira
 * `undefined` para que o serializador omita o campo (backend
 * converte para `null`). Centralizar essa montagem garante que
 * create e update enviem exatamente o mesmo payload — qualquer
 * divergência futura no shape ajusta um único helper. Espelha
 * `buildRouteMutationBody` de `routes.ts`.
 *
 * Após o enriquecimento do contrato em `lfc-authenticator#163`/
 * `#164`, o backend exige `SystemId` e persiste `Description`. O
 * wrapper propaga ambos: `systemId` é repassado sem trim (vem da URL
 * já normalizada pelo router), e `description` é trimada e omitida
 * se vier vazia para que o backend grave `null`.
 */
function buildRoleMutationBody(
  payload: CreateRolePayload | UpdateRolePayload,
): CreateRolePayload {
  const body: CreateRolePayload = {
    systemId: payload.systemId,
    name: payload.name.trim(),
    code: payload.code.trim(),
  };
  const trimmedDescription = payload.description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    body.description = trimmedDescription;
  }
  return body;
}

/**
 * Espelho do `RolePermissionResponse` do `lfc-authenticator`
 * (`RolesController.RolePermissionResponse`) — devolvido em
 * `POST /roles/{roleId}/permissions`. A UI da Issue #69 não consome
 * os campos individualmente (refetch de `listRolePermissions`
 * sincroniza o estado pós-mutação), mas tipamos o retorno para
 * preservar contrato — qualquer evolução do backend é capturada pelo
 * type guard.
 *
 * Backend é idempotente (mesmo padrão de `UserPermission`):
 *
 * - Vínculo inexistente → cria novo `RolePermission` (`201 Created`).
 * - Vínculo soft-deletado → reativa (`DeletedAt = null`, `200 OK`).
 * - Vínculo já ativo → devolve o existente (`200 OK`).
 */
export interface RolePermissionLinkDto {
  id: string;
  roleId: string;
  permissionId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `RolePermissionLinkDto`. Tolera `deletedAt` ausente
 * (tratado como `null`); demais campos obrigatórios e checados em
 * runtime. Espelha `isUserPermissionLinkDto` em `permissions.ts`.
 */
export function isRolePermissionLinkDto(
  value: unknown,
): value is RolePermissionLinkDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.roleId === "string" &&
    typeof record.permissionId === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === "string")
  );
}

/**
 * Lista as permissões atualmente vinculadas a uma role via
 * `GET /roles/{roleId}/permissions` (lfc-authenticator —
 * `RolesController.GetRolePermissions`).
 *
 * Devolve **apenas os ids** das permissões ativas vinculadas — a UI
 * da Issue #69 cruza com o catálogo (`listPermissions(systemId)`)
 * para construir a matriz de checkboxes. Backend devolve um array
 * cru de `permissionId` (ou de objetos `{ permissionId }`); aceitamos
 * ambos os formatos para tolerar evoluções pequenas no contrato (já
 * vimos esse padrão de evolução em `tokenTypes.ts`).
 *
 * Lança `ApiError` em qualquer falha (404 quando a role não existe,
 * parse quando o shape diverge). Cancelamento via `signal` em
 * `options` é propagado para o cliente.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function listRolePermissions(
  roleId: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<ReadonlyArray<string>> {
  const data = await client.get<unknown>(
    `/roles/${roleId}/permissions`,
    options,
  );
  return parseRolePermissionIds(data);
}

/**
 * Normaliza a resposta do backend para um array imutável de
 * `permissionId`. Aceita tanto o formato cru `string[]` (mais
 * comum em endpoints "leves" no `lfc-authenticator`) quanto o
 * formato `RolePermissionLinkDto[]` (mais simétrico com `assign`/
 * `remove`); a UI só precisa do conjunto de ids para o checkbox.
 *
 * Lança `ApiError(parse)` em qualquer outro shape — protege contra
 * divergência silenciosa de versão.
 */
function parseRolePermissionIds(data: unknown): ReadonlyArray<string> {
  if (!Array.isArray(data)) {
    throw makeParseError();
  }
  if (data.length === 0) {
    return [];
  }
  if (data.every((item) => typeof item === "string")) {
    return data;
  }
  if (data.every(isRolePermissionLinkDto)) {
    return data.map((link) => link.permissionId);
  }
  throw makeParseError();
}

/**
 * Vincula uma permissão a uma role via
 * `POST /roles/{roleId}/permissions` (lfc-authenticator —
 * `RolesController.AssignPermission`).
 *
 * Backend é idempotente:
 *
 * - Vínculo inexistente → cria novo `RolePermission` (`201 Created`).
 * - Vínculo soft-deletado → reativa (`DeletedAt = null`, `200 OK`).
 * - Vínculo já ativo → devolve o existente (`200 OK`).
 *
 * A UI trata todos como sucesso. Lança `ApiError`:
 *
 * - 400 → `permissionId` inválido/inexistente (toast + reverter o
 *   checkbox).
 * - 404 → role não encontrada (fechar a tela e voltar).
 * - 401/403 → cliente HTTP já lidou com `onUnauthorized`/falta de
 *   permissão; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`. Espelha
 * `assignPermissionToUser` em `permissions.ts`.
 */
export async function assignPermissionToRole(
  roleId: string,
  permissionId: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<RolePermissionLinkDto> {
  const data = await client.post<unknown>(
    `/roles/${roleId}/permissions`,
    { permissionId },
    options,
  );
  if (!isRolePermissionLinkDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Remove o vínculo de uma permissão com a role via
 * `DELETE /roles/{roleId}/permissions/{permissionId}` (lfc-authenticator
 * — `RolesController.RemovePermission`).
 *
 * Backend faz soft-delete do vínculo (`DeletedAt = UtcNow`, `204 No
 * Content`). Permissões vinculadas a outras roles **não** são
 * afetadas — a remoção só zera o vínculo desta role.
 *
 * Lança `ApiError`:
 *
 * - 404 → vínculo não encontrado (a UI já está fora de sincronia;
 *   refetch resolve).
 * - 401/403 → cliente HTTP já lidou; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`. Espelha
 * `removePermissionFromUser` em `permissions.ts`.
 */
export async function removePermissionFromRole(
  roleId: string,
  permissionId: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(
    `/roles/${roleId}/permissions/${permissionId}`,
    options,
  );
}

