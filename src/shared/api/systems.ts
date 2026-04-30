import { apiClient } from './index';

import type { ApiClient, ApiError, BodyRequestOptions, SafeRequestOptions } from './types';

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Sonar marca `throw` de
 * objeto não-Error como improvement (`Expected an error object to be
 * thrown`); estendê-lo com `Object.assign` preserva a interface
 * `ApiError` consumida por `isApiError` sem perder o stack trace.
 *
 * Centralizado para evitar repetir `Object.assign(new Error(...), { kind })`
 * em três call sites (`listSystems`/`createSystem`/`updateSystem`) — o
 * Sonar contaria a repetição como duplicação.
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

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
    throw makeParseError();
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
  const body = buildSystemMutationBody(payload);
  const data = await client.post<unknown>('/systems', body, options);
  if (!isSystemDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `PUT /systems/{id}` no `lfc-authenticator`
 * (`SystemsController.UpdateSystemRequest`).
 *
 * O backend declara um `UpdateSystemRequest` separado, mas com o mesmo
 * shape do `CreateSystemRequest` (Name obrigatório/máx. 80, Code
 * obrigatório/máx. 50, Description opcional/máx. 500). Para evitar
 * divergência silenciosa entre os dois tipos no frontend e replicar
 * fielmente a simetria do backend, declaramos o payload de update como
 * alias do de create — qualquer ajuste no contrato pega os dois call
 * sites de uma só vez.
 */
export type UpdateSystemPayload = CreateSystemPayload;

/**
 * Atualiza um sistema existente via `PUT /systems/{id}`.
 *
 * Retorna o `SystemDto` atualizado (`200 OK` com `SystemResponse` no
 * corpo). Lança `ApiError` em qualquer falha — o caller tipicamente
 * trata:
 *
 * - `kind: 'http'` com `status === 409` → conflito de `code` único
 *   (outro sistema já usa o code informado); a UI exibe mensagem inline
 *   no campo `code` ("Já existe outro sistema com este Code.").
 * - `kind: 'http'` com `status === 404` → sistema não encontrado ou
 *   soft-deleted; a UI fecha o modal, dispara toast e força refetch.
 * - `kind: 'http'` com `status === 400` → erros de validação por campo
 *   em `details` (mesmo shape de `ValidationProblemDetails` do create).
 * - `kind: 'http'` com `status === 401` → cliente HTTP já lidou com
 *   `onUnauthorized`; a UI não precisa fazer nada extra.
 * - Outros erros → toast vermelho genérico.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function updateSystem(
  id: string,
  payload: UpdateSystemPayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<SystemDto> {
  const body = buildSystemMutationBody(payload);
  const data = await client.put<unknown>(`/systems/${id}`, body, options);
  if (!isSystemDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Desativa (soft-delete) um sistema via `DELETE /systems/{id}` (Issue #60).
 *
 * O backend (`SystemsController.DeleteById`) seta `DeletedAt = UtcNow` e
 * responde `204 No Content` em sucesso. O método não devolve corpo — a
 * função resolve `void` e a UI faz refetch para sincronizar a lista.
 *
 * Lança `ApiError` em qualquer falha:
 *
 * - `kind: 'http'` com `status === 404` → sistema inexistente ou já
 *   soft-deleted (o backend filtra por `DeletedAt == null` por padrão
 *   via global query filter); a UI fecha o modal, dispara toast e força
 *   refetch.
 * - `kind: 'http'` com `status === 401` → sessão expirada; cliente HTTP
 *   já lidou com `onUnauthorized`. UI mantém-se silenciosa além do toast.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_SYSTEMS_DELETE`; toast vermelho com mensagem do backend.
 * - `kind: 'network'`/outros → toast vermelho genérico.
 *
 * Diferente de `createSystem`/`updateSystem`, não há type guard de
 * resposta porque `204` não tem corpo — `client.delete<void>` resolve
 * `undefined` e descartamos.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function deleteSystem(
  id: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/systems/${id}`, options);
}

/**
 * Restaura (desfaz soft-delete) um sistema via `POST /systems/{id}/restore`
 * (Issue #61, última sub-issue do CRUD da EPIC #45).
 *
 * O backend (`SystemsController.RestoreById`) limpa `DeletedAt` via
 * `IgnoreQueryFilters()` e responde `200 OK` com `{ message: "Sistema
 * restaurado com sucesso." }`. Diferente de `createSystem`/`updateSystem`,
 * o corpo da resposta **não** é um `SystemDto` — é um envelope simples
 * `{ message }` que descartamos. A UI faz refetch para sincronizar a
 * lista (idêntico ao padrão do `deleteSystem`), então retornamos `void`.
 *
 * Lança `ApiError` em qualquer falha:
 *
 * - `kind: 'http'` com `status === 404` → sistema inexistente **ou** já
 *   ativo (o backend devolve 404 com mensagem específica em ambos os
 *   casos: filtro `DeletedAt != null` no `WHERE`). A UI fecha o modal,
 *   dispara toast e força refetch — o registro foi mexido por outra
 *   sessão entre a abertura do modal e o submit, ou nem existe.
 * - `kind: 'http'` com `status === 401` → sessão expirada; cliente HTTP
 *   já lidou com `onUnauthorized`. UI mantém-se silenciosa além do toast.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_SYSTEMS_RESTORE`; toast vermelho com mensagem do backend.
 * - `kind: 'network'`/outros → toast vermelho genérico.
 *
 * Não há type guard de resposta porque `{ message }` é descartado —
 * `client.post<void>` resolve com o body como `unknown` e ignoramos.
 * Caso o backend evolua para devolver `SystemResponse` no futuro, basta
 * ajustar este wrapper para validar com `isSystemDto` e atualizar o
 * tipo de retorno.
 *
 * Recebe `BodyRequestOptions` (com `signal`) por simetria com `createSystem`/
 * `updateSystem` — `POST` é tratado como mutação com corpo no cliente
 * HTTP, ainda que aqui não enviemos payload. Passamos `undefined` como
 * body para que o backend receba uma requisição vazia.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function restoreSystem(
  id: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.post<void>(`/systems/${id}/restore`, undefined, options);
}

/**
 * Estatísticas agregadas de sistemas para o painel de overview da
 * `SystemsPage` (Issue #131). Calculadas a partir do `total` de duas
 * chamadas paralelas a `GET /systems`:
 *
 * - `active` — contagem sem `includeDeleted` (escopo padrão).
 * - `total` — contagem com `includeDeleted=true` (ativos + soft-deleted).
 * - `inactive` — derivado: `total - active`.
 *
 * Usar `pageSize=1` minimiza payload — só queremos o `total` do envelope,
 * não os registros. Sem novo endpoint backend.
 */
export interface SystemsStats {
  /** Total de sistemas ativos (não soft-deletados). */
  active: number;
  /** Total de sistemas soft-deletados. */
  inactive: number;
  /** Total geral (ativos + soft-deletados). */
  total: number;
}

/**
 * Busca estatísticas agregadas de sistemas via duas chamadas paralelas a
 * `GET /systems` com `pageSize=1`. Reusa `listSystems` (mesma rota,
 * mesmos type guards, mesmo cliente HTTP injetável) — não há novo
 * endpoint nem nova lógica de transporte.
 *
 * Erro em qualquer uma das chamadas propaga (caller decide se faz
 * fallback para "—" ou retry); cancelamento via `signal` em options
 * cancela ambas.
 */
export async function getSystemsStats(
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<SystemsStats> {
  const [activeOnly, includingDeleted] = await Promise.all([
    listSystems({ pageSize: 1, includeDeleted: false }, options, client),
    listSystems({ pageSize: 1, includeDeleted: true }, options, client),
  ]);
  const active = activeOnly.total;
  const total = includingDeleted.total;
  return {
    active,
    inactive: Math.max(0, total - active),
    total,
  };
}

/**
 * Constrói o body para `POST /systems` e `PUT /systems/{id}` aplicando
 * trim defensivo nos campos. Description vazia depois de trim vira
 * `undefined` para que o serializador omita o campo (backend converte
 * para `null`). Centralizar essa montagem garante que create e update
 * enviem exatamente o mesmo payload — qualquer divergência futura no
 * shape (ex.: backend aceitando `tags`) ajusta um único helper.
 */
function buildSystemMutationBody(
  payload: CreateSystemPayload | UpdateSystemPayload,
): CreateSystemPayload {
  const body: CreateSystemPayload = {
    name: payload.name.trim(),
    code: payload.code.trim(),
  };
  const trimmedDescription = payload.description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    body.description = trimmedDescription;
  }
  return body;
}
