import { createApiClient } from './client';

import type { ApiClient } from './types';

/**
 * Base URL do `lfc-authenticator` resolvida em build-time pelo Vite.
 *
 * O fallback `''` é intencional: `joinUrl` aceita base vazia e devolve o
 * `path` como URL relativa, permitindo cenários de proxy reverso onde o
 * frontend é servido pelo mesmo host do backend.
 */
const baseUrl: string = import.meta.env.VITE_AUTH_API_BASE_URL ?? '';

/**
 * UUID do sistema chamador resolvido em build-time pelo Vite (Issue #118).
 *
 * Diferente de `baseUrl`, **não há fallback aceitável** — o backend
 * `lfc-authenticator` rejeita o login (`SystemId é obrigatório`) e o
 * `verify-token` (cross-system check) sem este valor. Falhar
 * silenciosamente com `''` deixaria a aplicação iniciar e quebrar só na
 * primeira tela de login com mensagem genérica, dificultando
 * diagnóstico em ambientes mal configurados.
 *
 * Por isso: fail-fast no boot. A primeira importação deste módulo
 * (efeito colateral do `import { apiClient }`) lança um erro síncrono
 * descritivo se a env var estiver ausente ou vazia. O ponto de falha
 * é `src/index.tsx` montando `<App />`, antes de qualquer render — o
 * usuário vê o erro no console/overlay do Vite, não em uma tela vazia.
 */
function resolveSystemId(): string {
  const raw = import.meta.env.VITE_SYSTEM_ID;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(
      '[api] VITE_SYSTEM_ID não configurado. Defina o UUID do sistema "authenticator" ' +
        'no arquivo .env (ver .env.example) — sem este valor o backend lfc-authenticator ' +
        'rejeita login e verify-token.',
    );
  }
  return raw.trim();
}

const systemId: string = resolveSystemId();

/**
 * Singleton consumido pela aplicação.
 *
 * `getToken` e `onUnauthorized` são injetados pelo `AuthProvider` via
 * `apiClient.setAuth(...)` — ver `src/shared/auth/AuthContext.tsx`.
 *
 * `systemId` vai pelo construtor (não muda em runtime) e alimenta o
 * header `X-System-Id` em todas as requisições; também fica acessível
 * via `apiClient.getSystemId()` para call sites que precisem do mesmo
 * valor no body (ex.: `POST /auth/login`).
 */
export const apiClient: ApiClient = createApiClient({ baseUrl, systemId });

export { createApiClient } from './client';
export { isApiError } from './types';
export type {
  ApiClient,
  ApiClientAuthConfig,
  ApiClientConfig,
  ApiError,
  ApiErrorKind,
  BodyRequestOptions,
  HttpMethod,
  RequestOptions,
  SafeRequestOptions,
} from './types';
export {
  createSystem,
  DEFAULT_INCLUDE_DELETED,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  deleteSystem,
  getSystemsStats,
  isPagedSystemsResponse,
  isSystemDto,
  listSystems,
  restoreSystem,
  updateSystem,
} from './systems';
export type {
  CreateSystemPayload,
  ListSystemsParams,
  PagedResponse,
  SystemDto,
  SystemsStats,
  UpdateSystemPayload,
} from './systems';
export {
  createRoute,
  DEFAULT_ROUTES_INCLUDE_DELETED,
  DEFAULT_ROUTES_PAGE,
  DEFAULT_ROUTES_PAGE_SIZE,
  deleteRoute,
  isPagedRoutesResponse,
  isRouteDto,
  listRoutes,
  updateRoute,
} from './routes';
export type {
  CreateRoutePayload,
  ListRoutesParams,
  RouteDto,
  UpdateRoutePayload,
} from './routes';
export {
  createRole,
  DEFAULT_ROLES_INCLUDE_DELETED,
  DEFAULT_ROLES_PAGE,
  DEFAULT_ROLES_PAGE_SIZE,
  deleteRole,
  isPagedRolesResponse,
  isRoleDto,
  listRoles,
  updateRole,
} from './roles';
export type {
  CreateRolePayload,
  ListRolesParams,
  RoleDto,
  UpdateRolePayload,
} from './roles';
export {
  isTokenTypeArray,
  isTokenTypeDto,
  listTokenTypes,
} from './tokenTypes';
export type { TokenTypeDto } from './tokenTypes';
export {
  DEFAULT_USERS_INCLUDE_DELETED,
  DEFAULT_USERS_PAGE,
  DEFAULT_USERS_PAGE_SIZE,
  isPagedUsersResponse,
  isUserDto,
  listUsers,
} from './users';
export type { ListUsersParams, UserDto } from './users';
export {
  clientDisplayName,
  DEFAULT_CLIENTS_INCLUDE_DELETED,
  DEFAULT_CLIENTS_PAGE,
  DEFAULT_CLIENTS_PAGE_SIZE,
  getClientsByIds,
  isClientDto,
  isPagedClientsResponse,
  listClients,
} from './clients';
export type {
  ClientDto,
  ClientLookupDto,
  ListClientsParams,
} from './clients';
