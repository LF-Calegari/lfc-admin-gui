/**
 * Tipos públicos do contexto de autenticação.
 *
 * Refletem o contrato real do `lfc-authenticator` após o split em dois
 * endpoints (Issue #122 / `lfc-authenticator#148`):
 *
 * - `GET /auth/verify-token` é reduzido a `{ valid, issuedAt, expiresAt }`
 *   e exige o header `X-Route-Code` para autorização por rota.
 * - `GET /auth/permissions` (novo) devolve perfil + catálogos
 *   (`permissions`/`permissionCodes`/`routeCodes`).
 */

/**
 * Representação do usuário autenticado tal como devolvido pelo
 * `lfc-authenticator` no payload de `GET /auth/permissions`.
 *
 * `identity` é o discriminador numérico do registro do usuário no
 * backend — necessário para chamadas que referenciam o usuário por
 * número (ex.: auditoria/admin) e mantido como `number` por simetria
 * com o contrato real do `auth-service`.
 *
 * Campos opcionais (`avatarUrl`, `roles`) são tolerados para evitar
 * acoplamento prematuro a um shape exato — a UI sempre deve degradar
 * quando faltarem.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  identity: number;
  avatarUrl?: string;
  roles?: ReadonlyArray<string>;
}

/**
 * Estado observável do contexto.
 *
 * `isLoading` cobre dois momentos:
 * - hidratação inicial (montagem do Provider) — chama `verify-token`
 *   contra a rota corrente e/ou repopula `/auth/permissions` se o cache
 *   estiver vazio;
 * - chamadas de `login` em andamento.
 */
export interface AuthState {
  user: User | null;
  permissions: ReadonlyArray<string>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Payload retornado pelo endpoint `POST /auth/login`.
 *
 * O `lfc-authenticator` retorna apenas `{ token }`; o perfil do usuário
 * e o catálogo de permissões vêm em uma chamada subsequente a
 * `GET /auth/permissions`. Manter este tipo enxuto evita que call sites
 * passem a depender de campos que o backend nunca enviou.
 */
export interface LoginResponse {
  token: string;
}

/**
 * Payload retornado pelo endpoint `GET /auth/verify-token` no novo
 * contrato (Issue #122 / `lfc-authenticator#148`).
 *
 * Shape reduzido: o backend apenas confirma a validade do token e a
 * autorização do usuário para a rota informada via header
 * `X-Route-Code`. Perfil e catálogos saíram para o endpoint dedicado
 * `GET /auth/permissions`.
 *
 * - `valid`: sempre `true` quando a resposta é 200; o cliente HTTP já
 *   normaliza falhas em `ApiError`. Mantido no contrato por simetria
 *   com o backend e para facilitar diagnósticos.
 * - `issuedAt` / `expiresAt`: strings ISO8601 (DateTimeOffset C#).
 *   Ainda não consumidas pela UI, mas mantidas no tipo para evolução
 *   futura (ex.: indicador de expiração próxima).
 */
export interface VerifyTokenResponse {
  valid: boolean;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Payload retornado pelo endpoint `GET /auth/permissions` no novo
 * contrato (Issue #122 / `lfc-authenticator#148`).
 *
 * Carrega tudo o que o frontend precisa para hidratar o `AuthContext`:
 *
 * - `user` é o perfil completo do usuário autenticado (mapeado para
 *   `User` antes de armazenar);
 * - `permissions` é uma lista de **GUIDs** internos do backend —
 *   carregamos no tipo por simetria e diagnóstico, mas o frontend nunca
 *   os usa diretamente em `hasPermission`;
 * - `permissionCodes` é a lista de códigos semânticos das permissões
 *   reais do usuário no `lfc-admin-gui` (ex.: `perm:Systems.Read`).
 *   É essa lista que o Provider persiste como `permissions` no
 *   estado/cache e que `hasPermission()` consulta;
 * - `routeCodes` é a lista de códigos de rota autorizados para o usuário
 *   no sistema chamador. Mantido no cache para uso futuro (ex.: filtrar
 *   itens da Sidebar) — hoje a checagem cliente continua sendo por
 *   `permissionCode` no `RequirePermission`.
 */
export interface PermissionsResponse {
  user: User;
  permissions: ReadonlyArray<string>;
  permissionCodes: ReadonlyArray<string>;
  routeCodes: ReadonlyArray<string>;
}

/**
 * Valor exposto pelo `useAuth()`.
 *
 * Combina o estado atual com as ações disponíveis. Todas as ações são
 * assíncronas — `login` lança `ApiError` em falha, `logout` é tolerante
 * a erros (sempre limpa estado local).
 */
export interface AuthContextValue extends AuthState {
  /** Autentica via `POST /auth/login` e atualiza o estado. */
  login(email: string, password: string): Promise<void>;
  /**
   * Encerra a sessão.
   *
   * Best-effort: chama `GET /auth/logout` para incrementar
   * `tokenVersion` no backend (invalidando JWTs emitidos antes); falha
   * remota não bloqueia a limpeza local. Sempre limpa storage/cache e
   * redireciona para `/login`.
   */
  logout(): Promise<void>;
  /** Retorna `true` quando `code` está presente em `permissions`. */
  hasPermission(code: string): boolean;
  /**
   * Verifica autorização do usuário para um `routeCode` específico no
   * backend, via `GET /auth/verify-token` com header `X-Route-Code`.
   *
   * Usado pelo `RequireAuth` em toda mudança de rota privada (Issue
   * #122 / adendo). O Provider centraliza a lógica para:
   * - injetar o header `X-Route-Code` correto;
   * - tratar 401/403/falha de rede de forma uniforme (401 limpa
   *   sessão, 403 redireciona para `/error/403`, falha de rede não
   *   bloqueia o destino);
   * - aceitar `AbortSignal` para cancelar a chamada quando o usuário
   *   navega novamente antes da resposta.
   *
   * Retorna `true` quando o backend autoriza, `false` em qualquer
   * outro caso (incluindo abort, falha de rede, 4xx). O caller pode
   * usar o retorno para decisões finas, mas o redirect em 403 e a
   * limpeza em 401 acontecem aqui dentro.
   *
   * `fromPathname` (opcional): rota de origem usada para popular
   * `state.from` no redirect 403. Quando ausente, usa
   * `window.location.pathname` como fallback. O `RequireAuth` sempre
   * passa o pathname capturado via `useLocation()` para evitar
   * dependência de `window.location` em jsdom/MemoryRouter.
   */
  verifyRoute(
    routeCode: string,
    signal?: AbortSignal,
    fromPathname?: string,
  ): Promise<boolean>;
}
