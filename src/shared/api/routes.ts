import { isNameCodeDescriptionDto } from './nameCodeDescriptionDto';
import { isPagedResponseEnvelope } from './pagedResponse';

import { apiClient } from './index';

import type { PagedResponse } from './systems';
import type { ApiClient, ApiError, BodyRequestOptions, SafeRequestOptions } from './types';

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Sonar marca `throw` de
 * objeto não-Error como improvement (`Expected an error object to be
 * thrown`); estendê-lo com `Object.assign` preserva a interface
 * `ApiError` consumida por `isApiError` sem perder o stack trace.
 *
 * Centralizado para evitar repetir `Object.assign(new Error(...), { kind })`
 * em três call sites (`listRoutes`/`createRoute`/`updateRoute`) — o
 * Sonar contaria a repetição como duplicação. Espelha o padrão do
 * `systems.ts` (lição PR #128 — projetar shared helpers desde o
 * primeiro PR do recurso).
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

/**
 * Espelho do `RouteResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Routes.RoutesController.RouteResponse`).
 *
 * O backend serializa as datas em ISO 8601 (UTC) — mantemos como `string`
 * porque a UI consome via `Intl.DateTimeFormat`/`new Date()` quando
 * precisar exibir; converter no boundary do cliente HTTP traria custo
 * sem benefício. `deletedAt !== null` indica soft-delete.
 *
 * Os campos `systemTokenTypeCode` e `systemTokenTypeName` são
 * denormalizações do `SystemTokenType` referenciado (LEFT JOIN no
 * controller — quando o token type referenciado foi soft-deletado, o
 * backend devolve strings vazias, e a UI exibe "—" como fallback).
 *
 * Issue #62 (EPIC #46) — primeiro DTO da listagem; create/update/delete
 * (#63/#64/#65) reutilizam o mesmo shape no response.
 */
export interface RouteDto {
  id: string;
  systemId: string;
  name: string;
  code: string;
  description: string | null;
  systemTokenTypeId: string;
  /** Code do `SystemTokenType` ("política JWT alvo"). String vazia quando o token type referenciado foi soft-deletado. */
  systemTokenTypeCode: string;
  /** Nome amigável do `SystemTokenType`. String vazia quando o token type referenciado foi soft-deletado. */
  systemTokenTypeName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `RouteDto`. Tolera `description`/`deletedAt` ausentes
 * (tratados como `null`) — outros campos são obrigatórios e checados em
 * runtime.
 *
 * Exportado para que outros call sites (ex.: `createRoute` validando o
 * `RouteResponse` devolvido pelo backend nas próximas issues #63/#64)
 * reusem a mesma fonte de verdade — evita duplicação de validação de
 * shape (lição PR #123, "type guards quase idênticos em arquivos
 * diferentes precisam de helper compartilhado").
 */
export function isRouteDto(value: unknown): value is RouteDto {
  // Delega ao helper genérico a checagem dos campos compartilhados
  // com `SystemDto`/`TokenTypeDto` (id, name, code, description,
  // createdAt, updatedAt, deletedAt) — `RouteDto` adiciona `systemId`
  // e a tripla `systemTokenType*` que validamos abaixo. Lição PR
  // #134/#135 reforçada (Issue #175): centralizar elimina ~11 linhas
  // de duplicação entre wrappers de DTO.
  if (!isNameCodeDescriptionDto(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.systemId === 'string' &&
    typeof record.systemTokenTypeId === 'string' &&
    typeof record.systemTokenTypeCode === 'string' &&
    typeof record.systemTokenTypeName === 'string'
  );
}

/**
 * Type guard para `PagedResponse<RouteDto>`. Valida o envelope antes de
 * confiar no payload — protege contra divergência silenciosa de versão
 * entre frontend e backend (proxy intermediário cortando campos, deploy
 * desalinhado). Reusa `isPagedResponseEnvelope` para evitar duplicação
 * com os demais recursos (lição PR #134/#135 — JSCPD/Sonar tokenizam
 * o bloco fixo de checagem de envelope como duplicação entre módulos).
 */
export function isPagedRoutesResponse(value: unknown): value is PagedResponse<RouteDto> {
  return isPagedResponseEnvelope(value, isRouteDto);
}

/**
 * Defaults usados pela `listRoutes` para omitir parâmetros que coincidem
 * com o backend — preserva a URL "limpa" no caminho default
 * (`GET /systems/routes?systemId=<guid>` em vez de
 * `GET /systems/routes?systemId=<guid>&q=&page=1&pageSize=20&includeDeleted=false`).
 *
 * `DEFAULT_PAGE`/`DEFAULT_PAGE_SIZE`/`DEFAULT_INCLUDE_DELETED` são
 * compartilhados com `systems.ts` via reexport intencional — backend usa
 * os mesmos valores para `Routes` (`DefaultPageSize = 20`,
 * `MaxPageSize = 100`). Exportar daqui mantém a UI da `RoutesPage`
 * desacoplada do módulo `systems` mesmo quando o valor numérico
 * coincide (caso o backend evolua para diferenciar limites por recurso).
 */
export const DEFAULT_ROUTES_PAGE = 1;
export const DEFAULT_ROUTES_PAGE_SIZE = 20;
export const DEFAULT_ROUTES_INCLUDE_DELETED = false;

/**
 * Parâmetros aceitos por `listRoutes`. Apenas `systemId` é semanticamente
 * obrigatório nesta primeira sub-issue (#62 — listagem **por sistema**).
 * Os demais são opcionais — quando omitidos (ou iguais aos defaults),
 * são removidos da querystring.
 *
 * `systemId` é tipado como `string` (UUID v4 esperado pelo backend) e
 * obrigatório no contrato dessa função: a `RoutesPage` lê o `:id` da URL
 * e nunca chama sem ele. O backend aceita `systemId` opcional em
 * `GET /systems/routes` e devolve todas as rotas quando ausente, mas
 * essa rota global ("listar tudo") é objeto da sub-issue #63 (criar)
 * via dropdown de sistema — não desta listagem.
 */
export interface ListRoutesParams {
  /** UUID do sistema dono das rotas. Obrigatório nesta listagem. */
  systemId: string;
  /** Termo de busca (case-insensitive em `Name` e `Code`). */
  q?: string;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui rotas com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de proxy.
 *
 * `q` é trimado e omitido quando vazio para evitar `?q=` literal (que o
 * backend trataria como busca por string vazia, mas a UI sinalizaria
 * estado de "busca ativa" no `q`). Espelha `buildQueryString` de
 * `systems.ts`, mas adiciona `systemId` sempre — é o eixo do recurso
 * desta issue.
 */
function buildQueryString(params: ListRoutesParams): string {
  const search = new URLSearchParams();

  // `systemId` sempre presente — é o eixo da listagem por sistema.
  search.set('systemId', params.systemId);

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set('q', q);
  }

  if (typeof params.page === 'number' && params.page !== DEFAULT_ROUTES_PAGE) {
    search.set('page', String(params.page));
  }

  if (typeof params.pageSize === 'number' && params.pageSize !== DEFAULT_ROUTES_PAGE_SIZE) {
    search.set('pageSize', String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === 'boolean' &&
    params.includeDeleted !== DEFAULT_ROUTES_INCLUDE_DELETED
  ) {
    search.set('includeDeleted', String(params.includeDeleted));
  }

  return `?${search.toString()}`;
}

/**
 * Lista rotas de um sistema via `GET /systems/routes?systemId=<guid>` com
 * busca, paginação e filtro de soft-deleted.
 *
 * Retorna o envelope tipado `PagedResponse<RouteDto>`. Lança `ApiError`
 * em falhas (rede, parse, HTTP); o caller deve tratar com try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController) — em
 * navegações rápidas, o caller cancela a request anterior antes de
 * disparar a nova, evitando race em `setState` (mesmo padrão da
 * `SystemsPage`).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); o default usa o singleton `apiClient`
 * configurado com `baseUrl` + `systemId` reais.
 *
 * Issue #62 — primeira sub-issue da EPIC #46 (CRUD de Rotas por Sistema).
 * As próximas issues (#63 criar, #64 editar, #65 excluir) reutilizam o
 * mesmo módulo (`createRoute`/`updateRoute`/`deleteRoute`) seguindo o
 * padrão estabelecido pela EPIC #45 em `systems.ts`. Já mantemos os
 * hooks de extensão (`makeParseError`, `RouteDto`, `isRouteDto`) prontos
 * para evitar refatorações destrutivas no segundo PR (lição PR #128 —
 * projetar shared helpers desde o primeiro PR do recurso).
 */
export async function listRoutes(
  params: ListRoutesParams,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<RouteDto>> {
  const path = `/systems/routes${buildQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedRoutesResponse(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `POST /systems/routes` no `lfc-authenticator`
 * (`RoutesController.CreateRouteRequest`).
 *
 * Definido aqui (e não em #63) por dois motivos: (i) `isRouteDto` já
 * cobre o response, então mantemos input/output simétricos no mesmo
 * módulo; (ii) lição PR #128 — desde o primeiro PR do recurso, projetar
 * tipos compartilhados para evitar duplicação no PR seguinte.
 *
 * - `systemId` (obrigatório) — UUID do sistema dono. Backend valida que
 *   exista e esteja ativo.
 * - `name` (obrigatório, máx. 80 chars) — nome amigável da rota.
 * - `code` (obrigatório, máx. 50 chars) — identificador único global no
 *   `lfc-authenticator` (UX_Routes_Code é único globalmente — colidir
 *   com Code de outro sistema retorna 409).
 * - `description` (opcional, máx. 500 chars) — descrição livre.
 * - `systemTokenTypeId` (obrigatório) — UUID da política JWT alvo.
 *
 * Backend trima `Name`/`Code` e converte `Description` vazia em `null`.
 */
export interface CreateRoutePayload {
  systemId: string;
  name: string;
  code: string;
  description?: string;
  systemTokenTypeId: string;
}

/**
 * Body aceito pelo `PUT /systems/routes/{id}` no `lfc-authenticator`
 * (`RoutesController.UpdateRouteRequest`). Mesmo shape do create — segue
 * o padrão do `systems.ts` (alias intencional para preservar simetria
 * de contrato — divergência futura no backend pega ambos os call sites
 * de uma vez). Issue #64 implementa o caller; já declarado aqui pelo
 * mesmo motivo de `CreateRoutePayload` (lição PR #128).
 */
export type UpdateRoutePayload = CreateRoutePayload;

/**
 * Cria uma nova rota via `POST /systems/routes` (Issue #63).
 *
 * Retorna o `RouteDto` recém-criado (`201 Created` com `RouteResponse`
 * no corpo). Lança `ApiError` em qualquer falha — caller tipicamente
 * trata 409 (conflito de Code), 400 (validação de campo) e fallbacks
 * genéricos. Wrapper já implementado nesta sub-issue para evitar PR
 * destrutivo no #63 (lição PR #128).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function createRoute(
  payload: CreateRoutePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<RouteDto> {
  const body = buildRouteMutationBody(payload);
  const data = await client.post<unknown>('/systems/routes', body, options);
  if (!isRouteDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Atualiza uma rota existente via `PUT /systems/routes/{id}` (Issue #64).
 *
 * Retorna o `RouteDto` atualizado (`200 OK` com `RouteResponse` no
 * corpo). Lança `ApiError` em qualquer falha — caller tipicamente
 * trata 409 (conflito de Code), 404 (rota não encontrada/soft-deletada),
 * 400 (validação de campo). Wrapper já implementado para evitar PR
 * destrutivo no #64 (lição PR #128).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function updateRoute(
  id: string,
  payload: UpdateRoutePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<RouteDto> {
  const body = buildRouteMutationBody(payload);
  const data = await client.put<unknown>(`/systems/routes/${id}`, body, options);
  if (!isRouteDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Desativa (soft-delete) uma rota via `DELETE /systems/routes/{id}`
 * (Issue #65).
 *
 * O backend (`RoutesController.DeleteById`) seta `DeletedAt = UtcNow` e
 * responde `204 No Content` em sucesso. O método não devolve corpo — a
 * função resolve `void` e a UI faz refetch para sincronizar a lista.
 *
 * Lança `ApiError` em qualquer falha (404, 401, 403, 409 quando há
 * Permissions ativas vinculadas, 5xx, network). Wrapper já implementado
 * nesta sub-issue para evitar PR destrutivo no #65 (lição PR #128 —
 * projetar shared helpers desde o primeiro PR do recurso).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 */
export async function deleteRoute(
  id: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/systems/routes/${id}`, options);
}

/**
 * Constrói o body para `POST /systems/routes` e `PUT /systems/routes/{id}`
 * aplicando trim defensivo nos campos. Description vazia depois de trim
 * vira `undefined` para que o serializador omita o campo (backend
 * converte para `null`). Centralizar essa montagem garante que create e
 * update enviem exatamente o mesmo payload — qualquer divergência
 * futura no shape (ex.: backend aceitando `tags`) ajusta um único
 * helper. Espelha `buildSystemMutationBody` de `systems.ts`.
 */
function buildRouteMutationBody(
  payload: CreateRoutePayload | UpdateRoutePayload,
): CreateRoutePayload {
  const body: CreateRoutePayload = {
    systemId: payload.systemId,
    name: payload.name.trim(),
    code: payload.code.trim(),
    systemTokenTypeId: payload.systemTokenTypeId,
  };
  const trimmedDescription = payload.description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    body.description = trimmedDescription;
  }
  return body;
}
