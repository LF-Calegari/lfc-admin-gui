/**
 * Tipos públicos do contexto de autenticação.
 *
 * Mantemos o shape mínimo nesta Epic — campos adicionais do usuário e
 * suporte a refresh token serão introduzidos na Epic #44 conforme as
 * features (Login, persistência, verify-token) forem entrando.
 */

/**
 * Representação do usuário autenticado tal como devolvido pelo
 * `lfc-authenticator` no payload de `verify-token`.
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
 * - hidratação inicial (montagem do Provider) — Epic #44 fará via
 *   `verify-token`; aqui é resolvido imediatamente como `false`;
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
 * `GET /auth/verify-token`. Manter este tipo enxuto evita que call sites
 * passem a depender de campos que o backend nunca enviou.
 */
export interface LoginResponse {
  token: string;
}

/**
 * Payload retornado pelo endpoint `GET /auth/verify-token`.
 *
 * Shape achatado, espelhando exatamente o contrato real do
 * `auth-service`:
 *
 * - `id`, `name`, `email`, `identity` formam o perfil completo do
 *   usuário autenticado (mapeados para `User` antes de armazenar);
 * - `permissions` é uma lista de **GUIDs** internos do backend —
 *   carregamos no tipo por simetria e diagnóstico, mas o frontend
 *   nunca os usa diretamente em `hasPermission`;
 * - `permissionCodes` é a lista de códigos semânticos das permissões
 *   reais do usuário no `lfc-admin-gui` (ex.: `perm:Systems.Read`).
 *   É essa lista que o Provider persiste como `permissions` no
 *   estado/storage e que `hasPermission()` consulta;
 * - `routeCodes` é a lista de códigos de rota filtrada para o sistema
 *   kurtto (mantida no contrato por simetria; não consumida aqui).
 *
 * O token continua sendo o mesmo já enviado em `Authorization`; o
 * backend apenas confirma sua validade e devolve o snapshot atual do
 * usuário — permitindo que o frontend reaja a mudanças server-side
 * (role atualizada, permissões revogadas) sem exigir novo login.
 */
export interface VerifyTokenResponse {
  id: string;
  name: string;
  email: string;
  identity: number;
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
   * remota não bloqueia a limpeza local. Sempre limpa storage/estado e
   * redireciona para `/login`.
   */
  logout(): Promise<void>;
  /** Retorna `true` quando `code` está presente em `permissions`. */
  hasPermission(code: string): boolean;
}
