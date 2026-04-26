import type {
  ApiClient,
  ApiClientAuthConfig,
  ApiClientConfig,
  ApiError,
  BodyRequestOptions,
  RequestOptions,
  SafeRequestOptions,
} from './types';

/**
 * Concatena `baseUrl` e `path` de forma idempotente.
 *
 * Aceita `baseUrl` com ou sem trailing slash e `path` com ou sem leading
 * slash — o resultado é estável e consistente, evitando `//` ou
 * concatenações sem `/` separador.
 */
function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedPath = path.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
}

/**
 * Decide se um valor de body precisa ser serializado em JSON.
 *
 * `string`, `FormData`, `URLSearchParams`, `Blob` e `ArrayBuffer` passam
 * direto para o `fetch` sem transformação — o navegador define o
 * `Content-Type` correto. Para qualquer outro objeto/array, serializamos
 * em JSON e marcamos `application/json`.
 */
function isRawBody(body: unknown): boolean {
  if (typeof body === 'string') {
    return true;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return true;
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return true;
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return true;
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return true;
  }
  return false;
}

/**
 * Tenta extrair `code` e `message` de um payload de erro arbitrário.
 *
 * O `lfc-authenticator` retorna `{code, message, details?}` em erros 4xx;
 * outros backends/proxies podem responder com formato diferente. Esta
 * função é tolerante: nunca lança e devolve apenas o que conseguir
 * inferir.
 */
function extractErrorMeta(payload: unknown): {
  code?: string;
  message?: string;
  details?: unknown;
} {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const message = typeof record.message === 'string' ? record.message : undefined;
  return { code, message, details: record.details };
}

/**
 * Mensagem padrão por status HTTP.
 *
 * Usada quando o backend não envia `message` legível — preserva uma
 * mensagem amigável em pt-BR para fallback de UI.
 */
function defaultMessageForStatus(status: number): string {
  if (status === 401) return 'Sessão expirada ou credenciais inválidas.';
  if (status === 403) return 'Você não tem permissão para esta ação.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status === 409) return 'Conflito ao processar a requisição.';
  if (status >= 500) return 'Erro interno do servidor. Tente novamente.';
  return 'Falha na requisição.';
}

/**
 * Lê o corpo da resposta com tolerância:
 *
 * - 204/205 ou `Content-Length: 0` → retorna `undefined`.
 * - `Content-Type: application/json` → tenta `JSON.parse` (lança se inválido).
 * - Qualquer outro caso → tenta JSON; se falhar, retorna texto cru.
 *
 * Em caso de JSON inválido em response 2xx com `Content-Type: application/json`,
 * lança `ApiError(parse)` para que o caller saiba que a resposta foi
 * malformada.
 */
async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined;
  }
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.toLowerCase().includes('application/json');

  const rawText = await response.text();
  if (rawText.length === 0) {
    return undefined;
  }

  if (isJson) {
    try {
      return JSON.parse(rawText) as unknown;
    } catch (cause) {
      throw createParseError(cause);
    }
  }
  // Tenta JSON best-effort — se falhar, devolve texto bruto.
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

/**
 * Constrói um `ApiError` quando o `fetch` rejeita (rede/CORS/abort).
 *
 * `AbortError` recebe mensagem dedicada para distinguir cancelamento de
 * falha de rede real.
 */
function createNetworkError(cause: unknown): ApiError {
  const isAbort =
    cause instanceof DOMException && cause.name === 'AbortError';
  return {
    kind: 'network',
    message: isAbort
      ? 'Requisição cancelada.'
      : 'Falha de conexão com o servidor.',
    details: cause,
  };
}

/**
 * Constrói um `ApiError` quando o corpo JSON é inválido.
 */
function createParseError(cause: unknown): ApiError {
  return {
    kind: 'parse',
    message: 'Resposta inválida do servidor.',
    details: cause,
  };
}

/**
 * Constrói um `ApiError` para respostas com status HTTP de erro.
 */
function createHttpError(status: number, payload: unknown): ApiError {
  const meta = extractErrorMeta(payload);
  return {
    kind: 'http',
    status,
    code: meta.code,
    message: meta.message ?? defaultMessageForStatus(status),
    details: meta.details ?? payload,
  };
}

/**
 * Cria um cliente HTTP independente baseado em `fetch`.
 *
 * O cliente é stateless quanto a cada requisição: lê `getToken()` no
 * momento de cada chamada (assim o token pode mudar em runtime sem
 * reconstruir o cliente) e dispara `onUnauthorized()` em respostas 401.
 *
 * Note que **não** importamos `useAuth` ou Context aqui — a injeção é
 * feita via `setAuth` para evitar dependência circular entre
 * `src/shared/api` e `src/shared/auth`.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl } = config;
  // `systemId` vira `null` quando não configurado para que o getter
  // exposto no contrato (`getSystemId()`) seja simétrico com
  // `getToken()` — null sinaliza "ausente" sem ambiguidade.
  const systemId: string | null = config.systemId ?? null;
  let getToken = config.getToken;
  let onUnauthorized = config.onUnauthorized;

  /**
   * Constrói os headers finais da requisição combinando defaults,
   * `Authorization` (quando há token), `X-System-Id` (quando o cliente
   * foi configurado com `systemId`) e overrides do consumidor.
   *
   * Issue #118: o `lfc-authenticator` exige `X-System-Id` em endpoints
   * autenticados (notadamente `verify-token`, que cruza o header com a
   * claim `sys` do JWT para detectar uso cross-system). Optamos por
   * emitir o header em **todas** as chamadas: simplifica o cliente,
   * mantém o backend como fonte única de validação e remove a
   * necessidade de listas de endpoints sincronizadas. Endpoints públicos
   * que ignoram o header (ex.: `POST /auth/login`) não sofrem efeito
   * colateral porque o backend simplesmente não o lê.
   */
  function buildHeaders(
    options: RequestOptions | undefined,
    hasJsonBody: boolean,
  ): Headers {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (hasJsonBody) {
      headers.set('Content-Type', 'application/json');
    }
    if (systemId) {
      headers.set('X-System-Id', systemId);
    }
    const token = getToken?.();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.set(key, value);
      }
    }
    return headers;
  }

  async function request<T>(path: string, options?: RequestOptions): Promise<T> {
    const method = options?.method ?? 'GET';
    const rawBody = options?.body;
    const hasBody = rawBody !== undefined && rawBody !== null;
    const isJsonBody = hasBody && !isRawBody(rawBody);

    const headers = buildHeaders(options, isJsonBody);

    const init: RequestInit = {
      method,
      headers,
      signal: options?.signal,
    };

    if (hasBody) {
      init.body = isJsonBody ? JSON.stringify(rawBody) : (rawBody as BodyInit);
    }

    const url = joinUrl(baseUrl, path);

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (cause) {
      throw createNetworkError(cause);
    }

    if (!response.ok) {
      let payload: unknown = undefined;
      try {
        payload = await readResponseBody(response);
      } catch {
        // Erro ao ler corpo de resposta de erro — segue com `undefined`
        // para que o ApiError carregue ao menos `status` e mensagem padrão.
      }

      if (response.status === 401) {
        onUnauthorized?.();
      }

      throw createHttpError(response.status, payload);
    }

    const body = await readResponseBody(response);
    return body as T;
  }

  function setAuth(next: ApiClientAuthConfig): void {
    getToken = next.getToken;
    onUnauthorized = next.onUnauthorized;
  }

  function getSystemId(): string | null {
    return systemId;
  }

  return {
    request,
    get<T>(path: string, options?: SafeRequestOptions): Promise<T> {
      return request<T>(path, { ...options, method: 'GET' });
    },
    post<T>(path: string, body?: unknown, options?: BodyRequestOptions): Promise<T> {
      return request<T>(path, { ...options, method: 'POST', body });
    },
    put<T>(path: string, body?: unknown, options?: BodyRequestOptions): Promise<T> {
      return request<T>(path, { ...options, method: 'PUT', body });
    },
    patch<T>(path: string, body?: unknown, options?: BodyRequestOptions): Promise<T> {
      return request<T>(path, { ...options, method: 'PATCH', body });
    },
    delete<T>(path: string, options?: SafeRequestOptions): Promise<T> {
      return request<T>(path, { ...options, method: 'DELETE' });
    },
    setAuth,
    getSystemId,
  };
}
