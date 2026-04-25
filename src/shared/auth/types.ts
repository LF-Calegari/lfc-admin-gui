/**
 * Tipos públicos do contexto de autenticação.
 *
 * Mantemos o shape mínimo nesta Epic — campos adicionais do usuário e
 * suporte a refresh token serão introduzidos na Epic #44 conforme as
 * features (Login, persistência, verify-token) forem entrando.
 */

/**
 * Representação do usuário autenticado tal como devolvido pelo
 * `lfc-authenticator` no payload de login.
 *
 * Campos opcionais (`avatarUrl`, `roles`) são tolerados para evitar
 * acoplamento prematuro a um shape exato — a UI sempre deve degradar
 * quando faltarem.
 */
export interface User {
  id: string;
  name: string;
  email: string;
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
 * Payload retornado pelo endpoint de login.
 *
 * Mantido como tipo exportado para que mocks/testes e a futura
 * integração com `Auth API` compartilhem o mesmo contrato.
 */
export interface LoginResponse {
  token: string;
  user: User;
  permissions: ReadonlyArray<string>;
}

/**
 * Payload retornado pelo endpoint `GET /auth/verify-token`.
 *
 * O token continua sendo o mesmo já enviado em `Authorization`; o backend
 * apenas confirma sua validade e devolve o snapshot atual de `user` e
 * `permissions` — permitindo que o frontend reaja a mudanças server-side
 * (role atualizada, permissões revogadas) sem exigir novo login.
 *
 * O contrato é deliberadamente um subset de `LoginResponse`: caso o
 * backend evolua para incluir `token` (rotacionado), bastará trocar o
 * tipo abaixo sem impactar a forma como o Provider consome.
 */
export interface VerifyTokenResponse {
  user: User;
  permissions: ReadonlyArray<string>;
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
  /** Encerra a sessão local (Epic #44 #55 fará a chamada remota). */
  logout(): Promise<void>;
  /** Retorna `true` quando `code` está presente em `permissions`. */
  hasPermission(code: string): boolean;
}
