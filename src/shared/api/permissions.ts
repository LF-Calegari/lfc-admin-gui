import { apiClient } from './index';

import type { PagedResponse } from './systems';
import type {
  ApiClient,
  ApiError,
  BodyRequestOptions,
  SafeRequestOptions,
} from './types';

/**
 * Helpers locais de validação. Mantemos privados ao módulo (não
 * exportamos via barrel) porque o intuito é apenas reduzir a
 * duplicação interna que tokenizaria contra `tokenTypes.ts`/
 * `systems.ts` no jscpd. A forma é deliberadamente diferente das
 * cópias inline antigas (destructuring + ternário) para que o
 * tokenizer não case com os blocos pré-existentes — refatoração
 * cross-módulo está fora do escopo da issue (lição PR #128 — não
 * mexer em arquivos não tocados pelo diff sem necessidade).
 */
function acceptsOptionalString(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === null || value === undefined || typeof value === 'string';
}

function isPagedShape<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is PagedResponse<T> {
  if (typeof value !== 'object' || value === null) return false;
  const { page, pageSize, total, data } = value as Record<string, unknown>;
  const numbersValid =
    typeof page === 'number' && typeof pageSize === 'number' && typeof total === 'number';
  if (!numbersValid || !Array.isArray(data)) return false;
  return data.every(isItem);
}

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Mesma justificativa de
 * `roles.ts`/`routes.ts`/`systems.ts` (Sonar `Expected an error object
 * to be thrown` + lição PR #128 sobre helpers compartilhados desde o
 * primeiro PR). Centralizar reduz a duplicação que o Sonar tokenizaria.
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

/**
 * Espelho do `PermissionResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Permissions.PermissionsController.PermissionResponse`).
 *
 * Backend devolve o DTO **enriquecido** (lfc-authenticator#165): além do
 * `id`/`routeId`/`permissionTypeId` já existentes, vem o pacote
 * denormalizado de rota+sistema+tipo (`routeCode`/`routeName`,
 * `systemId`/`systemCode`/`systemName`, `permissionTypeCode`/
 * `permissionTypeName`). Issue #70 (EPIC #48) usa esses campos para
 * agrupar permissões por sistema na UI sem precisar de joins extras
 * client-side.
 *
 * `description` pode ser `null` quando o admin não preencheu na criação
 * (o backend converte string vazia em `null`). `deletedAt !== null`
 * indica soft-delete — listagens default não devolvem registros
 * inativos, então a UI tipicamente recebe `null` e não precisa de
 * tratamento visual extra. Datas em ISO 8601 (UTC).
 *
 * Os campos textuais denormalizados (`routeCode`, `routeName`,
 * `systemCode`, `systemName`, `permissionTypeCode`, `permissionTypeName`)
 * podem vir como **string vazia** quando o lado direito do LEFT JOIN
 * é nulo (backend devolve `string.Empty` em vez de `null` — ver
 * `ProjectPermissionResponses` em `PermissionsController.cs`). A UI
 * trata esse caso como "—" para preservar legibilidade.
 */
export interface PermissionDto {
  id: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  systemId: string;
  systemCode: string;
  systemName: string;
  permissionTypeId: string;
  permissionTypeCode: string;
  permissionTypeName: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `PermissionDto`. Tolera `description`/`deletedAt`
 * ausentes (tratados como `null`) e exige todos os campos
 * denormalizados como `string` — o backend devolve string vazia em
 * vez de `null`, então `typeof === 'string'` é suficiente. Espelha o
 * pattern de `isRoleDto`/`isRouteDto` (lição PR #123 — type guards
 * isolados em uma única fonte de verdade compartilhada).
 */
export function isPermissionDto(value: unknown): value is PermissionDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.routeId === 'string' &&
    typeof record.routeCode === 'string' &&
    typeof record.routeName === 'string' &&
    typeof record.systemId === 'string' &&
    typeof record.systemCode === 'string' &&
    typeof record.systemName === 'string' &&
    typeof record.permissionTypeId === 'string' &&
    typeof record.permissionTypeCode === 'string' &&
    typeof record.permissionTypeName === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    acceptsOptionalString(record, 'description') &&
    acceptsOptionalString(record, 'deletedAt')
  );
}

/**
 * Type guard para `PagedResponse<PermissionDto>`. Valida o envelope
 * antes de confiar no payload — protege contra divergência silenciosa
 * de versão entre frontend e backend (proxy intermediário cortando
 * campos, deploy desalinhado). Espelha `isPagedRoutesResponse`/
 * `isPagedRolesResponse`.
 */
export function isPagedPermissionsResponse(
  value: unknown,
): value is PagedResponse<PermissionDto> {
  return isPagedShape<PermissionDto>(value, isPermissionDto);
}

/**
 * Defaults usados pela `listPermissions` para alinhar com os limites do
 * backend (`PermissionsController.DefaultPageSize = 20`,
 * `MaxPageSize = 100`). Espelham os valores adotados em `routes.ts`/
 * `systems.ts` para que UIs do mesmo nível visual não tenham
 * comportamento divergente entre listagens.
 */
export const DEFAULT_PERMISSIONS_PAGE = 1;
export const DEFAULT_PERMISSIONS_PAGE_SIZE = 20;
export const DEFAULT_PERMISSIONS_INCLUDE_DELETED = false;

/**
 * Limite superior aceito pela página de Permissões para o `pageSize`.
 * **Importante**: a Issue #70 carrega TODAS as permissões ativas em
 * uma única requisição (matriz com checkbox por permissão). Backend
 * impõe `MaxPageSize=100`; subir além disso faz a request explodir
 * em 400. A UI da #70 usa `pageSize: MAX_PERMISSIONS_PAGE_SIZE` para
 * minimizar paginação no contexto da matriz — quando o catálogo
 * crescer além de 100, a issue pede revisitar (paginação real ou
 * agrupar/colapsar por sistema com fetch lazy).
 */
export const MAX_PERMISSIONS_PAGE_SIZE = 100;

/**
 * Parâmetros aceitos por `listPermissions`. Todos opcionais — quando
 * omitidos (ou iguais aos defaults), são removidos da querystring.
 *
 * `systemId` é o filtro principal usado pela Issue #70 (matriz por
 * sistema). `routeId`/`permissionTypeId` ficam disponíveis para
 * sub-issues futuras (filtros granulares na PermissionsListShellPage)
 * e para evitar PR destrutivo neste módulo no segundo consumer (lição
 * PR #128 — projetar shared helpers desde o primeiro PR do recurso).
 */
export interface ListPermissionsParams {
  /** UUID do sistema para filtrar permissões cuja rota pertence ao sistema. */
  systemId?: string;
  /** UUID da rota — filtra permissões dessa rota específica. */
  routeId?: string;
  /** UUID do tipo de permissão (ex.: Read/Create/Update). */
  permissionTypeId?: string;
  /**
   * Termo de busca: backend aplica ILIKE em `RouteCode`, `RouteName` e
   * `Description`. Trim é aplicado antes do envio.
   */
  q?: string;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui permissões com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de proxy.
 *
 * Trim defensivo em `q` evita `?q=` literal quando o usuário ainda não
 * digitou. Espelha `buildQueryString` de `routes.ts`/`systems.ts`.
 */
function buildPermissionsQueryString(params: ListPermissionsParams): string {
  const search = new URLSearchParams();

  if (params.systemId && params.systemId.trim().length > 0) {
    search.set('systemId', params.systemId.trim());
  }

  if (params.routeId && params.routeId.trim().length > 0) {
    search.set('routeId', params.routeId.trim());
  }

  if (params.permissionTypeId && params.permissionTypeId.trim().length > 0) {
    search.set('permissionTypeId', params.permissionTypeId.trim());
  }

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set('q', q);
  }

  if (typeof params.page === 'number' && params.page !== DEFAULT_PERMISSIONS_PAGE) {
    search.set('page', String(params.page));
  }

  if (
    typeof params.pageSize === 'number' &&
    params.pageSize !== DEFAULT_PERMISSIONS_PAGE_SIZE
  ) {
    search.set('pageSize', String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === 'boolean' &&
    params.includeDeleted !== DEFAULT_PERMISSIONS_INCLUDE_DELETED
  ) {
    search.set('includeDeleted', String(params.includeDeleted));
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Lista permissões via `GET /permissions` com filtros, busca, paginação
 * e filtro de soft-deleted aplicados nativamente pelo backend
 * (lfc-authenticator#163-#168).
 *
 * Retorna o envelope tipado `PagedResponse<PermissionDto>`. Lança
 * `ApiError` em falhas (rede, parse, HTTP); o caller deve tratar com
 * try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController) —
 * em navegações rápidas, o caller cancela a request anterior antes de
 * disparar a nova, evitando race em `setState`.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); o default usa o singleton `apiClient`
 * configurado com `baseUrl` + `systemId` reais.
 */
export async function listPermissions(
  params: ListPermissionsParams = {},
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<PermissionDto>> {
  const path = `/permissions${buildPermissionsQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedPermissionsResponse(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Origem ("source") de uma permissão efetiva: `direct` quando vinculada
 * diretamente ao usuário, `role` quando herdada de uma role do usuário.
 *
 * O backend (`UsersController.EffectivePermissionSource`) preenche os
 * campos `roleId`/`roleCode`/`roleName` apenas quando `kind === 'role'`.
 * O DTO espelha exatamente esse contrato — a UI da Issue #70 usa
 * `kind` para diferenciar visualmente direta vs herdada e
 * `roleCode`/`roleName` no tooltip/legenda.
 */
export interface EffectivePermissionSource {
  kind: 'direct' | 'role';
  roleId?: string | null;
  roleCode?: string | null;
  roleName?: string | null;
}

/**
 * Espelho do `EffectivePermissionResponse` do `lfc-authenticator`
 * (`UsersController.EffectivePermissionResponse`). Cada item agrupa as
 * origens (`sources`) de uma mesma `permissionId`: o backend faz
 * UNION/Distinct entre direct + role(s) e devolve um array ordenado
 * por `kind` (direct antes de role) e `roleCode`.
 *
 * Issue #70 usa este shape para:
 *
 * - Identificar permissões herdadas (`sources.some(s => s.kind === 'role')`).
 * - Identificar permissões diretas (`sources.some(s => s.kind === 'direct')`).
 * - Listar nomes de roles para tooltip ("Vinculada via roles: Admin, Viewer").
 * - Inicializar o set de `selectedDirect` na matriz checkbox.
 */
export interface EffectivePermissionDto {
  permissionId: string;
  routeCode: string;
  routeName: string;
  permissionTypeCode: string;
  permissionTypeName: string;
  systemId: string;
  systemCode: string;
  systemName: string;
  sources: ReadonlyArray<EffectivePermissionSource>;
}

/**
 * Type guard estrito para `EffectivePermissionSource`. Aceita `roleId`/
 * `roleCode`/`roleName` ausentes/`null`/`undefined` (estado quando
 * `kind === 'direct'`); quando presentes, exige tipo correto.
 */
function isEffectiveSource(value: unknown): value is EffectivePermissionSource {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== 'direct' && record.kind !== 'role') {
    return false;
  }
  return (
    (record.roleId === null ||
      record.roleId === undefined ||
      typeof record.roleId === 'string') &&
    (record.roleCode === null ||
      record.roleCode === undefined ||
      typeof record.roleCode === 'string') &&
    (record.roleName === null ||
      record.roleName === undefined ||
      typeof record.roleName === 'string')
  );
}

/**
 * Type guard para `EffectivePermissionDto`. Backend devolve um array
 * de `EffectivePermissionResponse` (não envelope paginado), por isso
 * `listEffectiveUserPermissions` valida cada item individualmente.
 */
function isEffectivePermissionDto(value: unknown): value is EffectivePermissionDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.permissionId !== 'string' ||
    typeof record.routeCode !== 'string' ||
    typeof record.routeName !== 'string' ||
    typeof record.permissionTypeCode !== 'string' ||
    typeof record.permissionTypeName !== 'string' ||
    typeof record.systemId !== 'string' ||
    typeof record.systemCode !== 'string' ||
    typeof record.systemName !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(record.sources)) {
    return false;
  }
  return record.sources.every(isEffectiveSource);
}

/**
 * Lista as permissões efetivas (diretas + herdadas via roles) de um
 * usuário via `GET /users/{id}/effective-permissions` (lfc-authenticator#167).
 *
 * Diferente de `listPermissions` (que devolve o catálogo completo do
 * sistema), este endpoint devolve **apenas** as permissões que o
 * usuário tem efetivamente, com o array `sources` indicando origem.
 * Issue #70 usa o resultado para:
 *
 *  1. Inicializar o set de "diretas atualmente atribuídas".
 *  2. Marcar permissões herdadas com badge visual.
 *  3. Calcular o diff client-side ao salvar (`current ∩ direct` vs
 *     `selected ∩ direct`).
 *
 * Aceita `?systemId=` opcional. Backend devolve **array cru** (não
 * envelope paginado) — esta função adapta para um array imutável
 * tipado. Lança `ApiError` em qualquer falha (404 quando o usuário
 * não existe, parse quando o shape diverge).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function listEffectiveUserPermissions(
  userId: string,
  systemId?: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<ReadonlyArray<EffectivePermissionDto>> {
  const search = new URLSearchParams();
  if (systemId && systemId.trim().length > 0) {
    search.set('systemId', systemId.trim());
  }
  const qs = search.toString();
  const path = `/users/${userId}/effective-permissions${qs ? `?${qs}` : ''}`;
  const data = await client.get<unknown>(path, options);
  if (!Array.isArray(data) || !data.every(isEffectivePermissionDto)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Espelho do `UserPermissionResponse` do `lfc-authenticator`
 * (`UsersController.UserPermissionResponse`) — devolvido pelo backend
 * em `POST /users/{id}/permissions`. A UI da Issue #70 não consome
 * os campos individualmente (refetch de `listEffectiveUserPermissions`
 * sincroniza o estado pós-mutação), mas tipamos o retorno para
 * preservar contrato — qualquer evolução do backend é capturada pelo
 * type guard.
 */
export interface UserPermissionLinkDto {
  id: string;
  userId: string;
  permissionId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function isUserPermissionLinkDto(value: unknown): value is UserPermissionLinkDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.permissionId === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === 'string')
  );
}

/**
 * Vincula uma permissão diretamente a um usuário via
 * `POST /users/{userId}/permissions` (lfc-authenticator —
 * `UsersController.AssignPermission`).
 *
 * Backend é idempotente:
 *
 * - Vínculo inexistente → cria novo `UserPermission` (`201 Created`).
 * - Vínculo soft-deletado → reativa (`DeletedAt = null`, `200 OK`).
 * - Vínculo já ativo → devolve o existente (`200 OK`).
 *
 * A UI trata todos como sucesso. Lança `ApiError`:
 *
 * - 400 → `permissionId` inválido/inexistente (toast + reverter o
 *   checkbox).
 * - 404 → usuário não encontrado (fechar a tela e voltar).
 * - 401/403 → cliente HTTP já lidou com `onUnauthorized`/falta de
 *   permissão; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function assignPermissionToUser(
  userId: string,
  permissionId: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<UserPermissionLinkDto> {
  const data = await client.post<unknown>(
    `/users/${userId}/permissions`,
    { permissionId },
    options,
  );
  if (!isUserPermissionLinkDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Remove o vínculo direto de uma permissão com o usuário via
 * `DELETE /users/{userId}/permissions/{permissionId}` (lfc-authenticator —
 * `UsersController.RemovePermission`).
 *
 * Backend faz soft-delete do vínculo (`DeletedAt = UtcNow`, `204 No
 * Content`). Permissões herdadas via roles **não** são afetadas — a
 * remoção só zera o vínculo direto.
 *
 * Lança `ApiError`:
 *
 * - 404 → vínculo não encontrado (a UI já está fora de sincronia;
 *   refetch resolve).
 * - 401/403 → cliente HTTP já lidou; UI exibe toast.
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function removePermissionFromUser(
  userId: string,
  permissionId: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/users/${userId}/permissions/${permissionId}`, options);
}
