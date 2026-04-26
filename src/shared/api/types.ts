/**
 * Tipos públicos do cliente HTTP compartilhado.
 *
 * O cliente abstrai a comunicação com o `lfc-authenticator`, normalizando
 * falhas heterogêneas (rede, parse, HTTP) em um único contrato `ApiError`
 * — assim a UI sempre sabe o que lidar, independente do que aconteceu.
 */

/**
 * Métodos HTTP suportados pelo cliente.
 *
 * Restringimos a este subset para manter o contrato explícito e evitar
 * uso acidental de verbs incomuns (HEAD/OPTIONS) que o backend não cobre.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Origem do erro normalizado.
 *
 * - `network`: `fetch` rejeitou (offline, DNS, CORS, etc.).
 * - `parse`: corpo não pôde ser interpretado como JSON.
 * - `http`: requisição completou mas retornou status >= 400.
 */
export type ApiErrorKind = 'network' | 'parse' | 'http';

/**
 * Contrato único de erro retornado pelo cliente HTTP.
 *
 * Sempre lançado via `throw` — chamadores devem usar `try/catch` ou tratar
 * a Promise rejeitada. Quando `kind === 'http'`, `status` é garantido.
 */
export interface ApiError {
  /** Origem do erro. Ver `ApiErrorKind`. */
  kind: ApiErrorKind;
  /** Status HTTP — presente quando `kind === 'http'`. */
  status?: number;
  /** Código do erro retornado pelo backend (ex.: `INVALID_CREDENTIALS`). */
  code?: string;
  /** Mensagem amigável, pronta para fallback de UI. */
  message: string;
  /** Payload bruto retornado pelo backend, quando aplicável. */
  details?: unknown;
}

/**
 * Type guard que distingue `ApiError` de erros arbitrários.
 *
 * Útil para `catch (e)` em call sites que não querem assumir o shape.
 */
export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ApiError>;
  return (
    typeof candidate.message === 'string' &&
    (candidate.kind === 'network' ||
      candidate.kind === 'parse' ||
      candidate.kind === 'http')
  );
}

/**
 * Opções aceitas por uma requisição arbitrária.
 *
 * O `body` é serializado automaticamente em JSON quando objeto/array;
 * `string`/`FormData`/`Blob` passam direto. `signal` permite cancelamento
 * via `AbortController`.
 */
export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Opções de requisição sem `method` e `body` (usadas por `get`/`delete`). */
export type SafeRequestOptions = Omit<RequestOptions, 'method' | 'body'>;

/** Opções de requisição sem `method` (usadas por `post`/`put`/`patch`). */
export type BodyRequestOptions = Omit<RequestOptions, 'method'>;

/**
 * Configuração inicial do cliente.
 *
 * `getToken` é uma função para evitar capturar o token em closure
 * estática — o `AuthProvider` mantém o token em ref e o cliente lê
 * o valor atual a cada requisição.
 *
 * `onUnauthorized` é chamado quando a API responde 401, permitindo
 * que o consumidor (Provider) limpe sessão e redirecione.
 *
 * `systemId` identifica o sistema chamador no `lfc-authenticator`
 * (Issue #118). Quando presente, o cliente emite o header
 * `X-System-Id: <systemId>` em todas as requisições — o backend lê o
 * cabeçalho em endpoints autenticados (`verify-token` cruza com a
 * claim `sys` do JWT). Mantemos o campo opcional para preservar a
 * ergonomia em testes que não precisam asserir sobre o header; em
 * produção o singleton (`src/shared/api/index.ts`) injeta o valor
 * lido de `VITE_SYSTEM_ID` com fail-fast no boot.
 */
export interface ApiClientConfig {
  baseUrl: string;
  systemId?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * Subset de `ApiClientConfig` aceito por `setAuth` — usado pelo
 * `AuthProvider` para injetar callbacks no singleton sem reconstruí-lo.
 */
export interface ApiClientAuthConfig {
  getToken?: () => string | null;
  onUnauthorized?: () => void;
}

/** Contrato exposto pelo cliente HTTP construído por `createApiClient`. */
export interface ApiClient {
  /** Executa uma requisição arbitrária e retorna o corpo tipado. */
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** GET — retorna corpo JSON tipado. */
  get<T>(path: string, options?: SafeRequestOptions): Promise<T>;
  /** POST — `body` serializado como JSON quando objeto. */
  post<T>(path: string, body?: unknown, options?: SafeRequestOptions): Promise<T>;
  /** PUT — `body` serializado como JSON quando objeto. */
  put<T>(path: string, body?: unknown, options?: SafeRequestOptions): Promise<T>;
  /** PATCH — `body` serializado como JSON quando objeto. */
  patch<T>(path: string, body?: unknown, options?: SafeRequestOptions): Promise<T>;
  /** DELETE — sem body por padrão. */
  delete<T>(path: string, options?: SafeRequestOptions): Promise<T>;
  /** Atualiza callbacks de autenticação sem recriar o cliente. */
  setAuth(config: ApiClientAuthConfig): void;
  /**
   * Retorna o `systemId` configurado no cliente, ou `null` quando
   * ausente. Permite que call sites (ex.: `AuthContext.login()`)
   * consultem a mesma fonte da verdade que alimenta o header
   * `X-System-Id`, evitando ler `VITE_SYSTEM_ID` em mais de um lugar.
   */
  getSystemId(): string | null;
}
