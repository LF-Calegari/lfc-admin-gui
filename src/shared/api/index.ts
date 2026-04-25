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
 * Singleton consumido pela aplicação.
 *
 * `getToken` e `onUnauthorized` são injetados pelo `AuthProvider` via
 * `apiClient.setAuth(...)` — ver `src/shared/auth/AuthContext.tsx`.
 */
export const apiClient: ApiClient = createApiClient({ baseUrl });

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
