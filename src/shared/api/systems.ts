import { apiClient } from './index';

import type { ApiClient, BodyRequestOptions, SafeRequestOptions } from './types';

/**
 * Envelope genérico de resposta paginada do `lfc-authenticator`
 * (`PagedResponse<T>` em `AuthService.Controllers.Common`).
 *
 * O backend devolve este formato sempre que um endpoint de listagem
 * suporta `page`/`pageSize`/filtros — `total` é o count após filtros e
 * antes do `Skip`/`Take`. Tipo genérico para que outros recursos da
 * EPIC #45 (rotas, roles, permissões, clientes, usuários) reutilizem o
 * mesmo contrato sem duplicação.
 */
export interface PagedResponse<T> {
  /** Itens da página corrente (após filtros + skip/take). */
  data: ReadonlyArray<T>;
  /** Página retornada (1-based) após defaults/validação no backend. */
  page: number;
  /** Tamanho de página efetivamente aplicado. */
  pageSize: number;
  /** Total de registros que casam com os filtros aplicados. */
  total: number;
}

/**
 * Espelho do `SystemResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Systems.SystemsController.SystemResponse`).
 *
 * O backend serializa as datas em ISO 8601 (UTC) — mantemos como `string`
 * porque a UI consome via `Intl.DateTimeFormat`/`new Date()` quando
 * precisar exibir; converter no boundary do cliente HTTP traria custo
 * sem benefício. `deletedAt !== null` indica soft-delete.
 */
export interface SystemDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `SystemDto`. Tolera `description`/`deletedAt` ausentes
 * (tratados como `null`) — outros campos são obrigatórios e checados em
 * runtime.
 *
 * Exportado para que outros call sites (ex.: `createSystem` validando o
 * `SystemResponse` devolvido pelo backend) reusem a mesma fonte de
 * verdade — evita duplicação de validação de shape (lição PR #123,
 * "type guards quase idênticos em arquivos diferentes precisam de helper
 * compartilhado").
 */
export function isSystemDto(value: unknown): value is SystemDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.code === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.description === null ||
      record.description === undefined ||
      typeof record.description === 'string') &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === 'string')
  );
}

/**
 * Type guard para `PagedResponse<SystemDto>`. Valida o envelope antes de
 * confiar no payload — protege contra divergência silenciosa de versão
 * entre frontend e backend (proxy intermediário cortando campos, deploy
 * desalinhado).
 */
export function isPagedSystemsResponse(value: unknown): value is PagedResponse<SystemDto> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.page !== 'number' ||
    typeof record.pageSize !== 'number' ||
    typeof record.total !== 'number' ||
    !Array.isArray(record.data)
  ) {
    return false;
  }
  return record.data.every(isSystemDto);
}

/**
 * Defaults usados pela `listSystems` para omitir parâmetros que coincidem
 * com o backend — preserva a URL "limpa" no caminho default
 * (`GET /systems` em vez de `GET /systems?q=&page=1&pageSize=20&includeDeleted=false`).
 *
 * Exportados para que a UI compartilhe a mesma fonte de verdade ao
 * inicializar o estado dos controles de busca/paginação/filtro.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_INCLUDE_DELETED = false;

/**
 * Parâmetros aceitos por `listSystems`. Todos opcionais — quando omitidos
 * (ou iguais aos defaults), são removidos da querystring.
 */
export interface ListSystemsParams {
  /** Termo de busca (case-insensitive em `Name` e `Code`). */
  q?: string;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui sistemas com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de proxy.
 *
 * `q` é trimado e omitido quando vazio para evitar `?q=` literal (que o
 * backend trataria como busca por string vazia, mas a UI sinalizaria
 * estado de "busca ativa" no `q`).
 */
function buildQueryString(params: ListSystemsParams): string {
  const search = new URLSearchParams();

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set('q', q);
  }

  if (typeof params.page === 'number' && params.page !== DEFAULT_PAGE) {
    search.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number' && params.pageSize !== DEFAULT_PAGE_SIZE) {
    search.set('pageSize', String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === 'boolean' &&
    params.includeDeleted !== DEFAULT_INCLUDE_DELETED
  ) {
    search.set('includeDeleted', String(params.includeDeleted));
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Lista sistemas via `GET /systems` com busca, paginação e filtro de
 * soft-deleted.
 *
 * Retorna o envelope tipado `PagedResponse<SystemDto>`. Lança `ApiError`
 * em falhas (rede, parse, HTTP); o caller deve tratar com try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController) — em
 * navegações rápidas, o caller cancela a request anterior antes de
 * disparar a nova, evitando race em `setState`.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); o default usa o singleton `apiClient`
 * configurado com `baseUrl` + `systemId` reais.
 */
export async function listSystems(
  params: ListSystemsParams = {},
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<SystemDto>> {
  const path = `/systems${buildQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedSystemsResponse(data)) {
    throw {
      kind: 'parse',
      message: 'Resposta inválida do servidor.',
    };
  }
  return data;
}

/**
 * Body aceito pelo `POST /systems` no `lfc-authenticator`
 * (`SystemsController.CreateSystemRequest`).
 *
 * - `name` (obrigatório, máx. 80 chars) — nome amigável do sistema.
 * - `code` (obrigatório, máx. 50 chars) — identificador único usado em
 *   `X-System-Id`/JWT claims. O backend valida unicidade ignorando
 *   filtro de soft-delete (409 caso já exista, mesmo que removido).
 * - `description` (opcional, máx. 500 chars) — descrição livre.
 *
 * O backend faz `Trim()` em `Name`/`Code` e converte `Description`
 * vazia (após trim) em `null`. Mantemos os campos como `string` aqui —
 * a UI já trima antes de enviar para preservar simetria com o que é
 * persistido (e evita 400 por "Code é obrigatório e não pode ser apenas
 * espaços" quando o usuário digita só whitespace).
 */
export interface CreateSystemPayload {
  name: string;
  code: string;
  description?: string;
}

/**
 * Cria um novo sistema via `POST /systems`.
 *
 * Retorna o `SystemDto` recém-criado (`201 Created` com `SystemResponse`
 * no corpo). Lança `ApiError` em qualquer falha — o caller tipicamente
 * trata:
 *
 * - `kind: 'http'` com `status === 409` → conflito de `code` único; a UI
 *   exibe mensagem inline no campo `code`.
 * - `kind: 'http'` com `status === 400` → erros de validação por campo
 *   no payload de `details` (formato `ValidationProblemDetails` do
 *   ASP.NET — `details.errors[campo] = string[]`).
 * - `kind: 'http'` com `status === 401` → cliente HTTP já lidou com
 *   `onUnauthorized`; a UI não precisa fazer nada além de não tentar
 *   re-renderizar.
 * - Outros erros → toast vermelho genérico.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function createSystem(
  payload: CreateSystemPayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<SystemDto> {
  // Trim defensivo no boundary do cliente: garante que a UI não envie
  // valores diferentes do que persistir, mesmo se o caller esqueceu de
  // sanitizar. Description vazia depois de trim vira `undefined` para
  // que o serializador omita o campo (backend converte para `null`).
  const body: CreateSystemPayload = {
    name: payload.name.trim(),
    code: payload.code.trim(),
  };
  const trimmedDescription = payload.description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    body.description = trimmedDescription;
  }

  const data = await client.post<unknown>('/systems', body, options);
  if (!isSystemDto(data)) {
    throw {
      kind: 'parse',
      message: 'Resposta inválida do servidor.',
    };
  }
  return data;
}
