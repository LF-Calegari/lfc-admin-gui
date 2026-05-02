import { isNameCodeDescriptionDto } from './nameCodeDescriptionDto';

import { apiClient } from './index';

import type { ApiClient, ApiError, BodyRequestOptions, SafeRequestOptions } from './types';

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Mesmo padrão dos demais
 * wrappers (`systems.ts`/`routes.ts`) — Sonar marca `throw` de objeto
 * não-Error como improvement (`Expected an error object to be thrown`),
 * e estendê-lo com `Object.assign` preserva a interface `ApiError` sem
 * perder o stack trace.
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

/**
 * Espelho do `TokenTypeResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.TokenTypes.TokenTypesController.TokenTypeResponse`).
 *
 * O backend serializa as datas em ISO 8601 (UTC) — mantemos como `string`
 * pelo mesmo motivo dos demais DTOs (`SystemDto`/`RouteDto`): converter
 * no boundary do cliente HTTP custaria sem benefício, já que a UI consome
 * via `Intl.DateTimeFormat`/`new Date()` somente quando precisa exibir
 * datas. `deletedAt !== null` indica soft-delete.
 *
 * Issue #63 (EPIC #46) — usado pelo `NewRouteModal` (`<Select>` da
 * "política JWT alvo"). A próxima sub-issue (#64 — editar rota) reusa o
 * mesmo módulo via `listTokenTypes`. Declaramos o DTO completo desde já
 * porque o backend devolve o response inteiro mesmo quando só
 * precisamos de `id`/`name`/`code` — manter o tipo simétrico evita
 * divergência se mais tarde a UI quiser mostrar `description`/`status`
 * em algum dropdown enriquecido (lição PR #128 — projetar shared
 * helpers desde o primeiro PR do recurso).
 */
export interface TokenTypeDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `TokenTypeDto`. Delegação direta para
 * `isNameCodeDescriptionDto` — o shape de `TokenTypeDto` é
 * estruturalmente idêntico ao `SystemDto` (mesmos campos `id`/`name`/
 * `code`/`description`/`createdAt`/`updatedAt`/`deletedAt`).
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** antes da extração,
 * o corpo desta função duplicava ~20 linhas com `isSystemDto`. JSCPD
 * tokenizou como `New Code Duplication` entre `systems.ts`,
 * `routes.ts` e `tokenTypes.ts`. Centralizar em
 * `nameCodeDescriptionDto.ts` colapsou todos os call sites.
 *
 * Mantemos a função local (em vez de re-export) para preservar a
 * type predicate `value is TokenTypeDto` — o helper genérico devolve
 * `boolean` (não pode prometer `value is X` para `X` que ele não
 * conhece). Esta envoltura adiciona apenas o predicate.
 */
export function isTokenTypeDto(value: unknown): value is TokenTypeDto {
  return isNameCodeDescriptionDto(value);
}

/**
 * Type guard para `TokenTypeDto[]`. O endpoint
 * `GET /tokens/types` devolve um array bruto (não envelopado em
 * `PagedResponse`) — diferente das listagens de sistemas/rotas, é uma
 * leitura curta usada apenas para popular dropdowns. Validamos o array
 * antes de confiar no payload para proteger contra divergência
 * silenciosa de versão entre frontend e backend.
 */
export function isTokenTypeArray(value: unknown): value is ReadonlyArray<TokenTypeDto> {
  return Array.isArray(value) && value.every(isTokenTypeDto);
}

/**
 * Lista todos os token types via `GET /tokens/types` (Issue #63).
 *
 * O backend (`TokenTypesController.GetAll`) devolve **todos** os
 * registros — incluindo soft-deletados — sem filtro de query. A UI
 * (`NewRouteModal`/`EditRouteModal`) é responsável por filtrar
 * `deletedAt === null` antes de popular o `<Select>`: criar/editar
 * rota com um token type inativo não faz sentido, e o backend
 * rejeitaria com 400 (`SystemTokenTypeId inválido ou inativo.`).
 *
 * Manter o filtro client-side ao invés de no wrapper preserva a
 * generalidade do helper — uma futura tela "Gerenciar token types"
 * (não no escopo desta EPIC) precisará dos soft-deletados visíveis
 * para restaurar.
 *
 * Lança `ApiError` em qualquer falha (rede, parse, HTTP). O caller
 * (NewRouteModal) trata 401/403 com toast genérico e bloqueia o submit
 * quando a lista está vazia (sem token types ativos não dá pra criar
 * rota).
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); o default usa o singleton `apiClient`
 * configurado com `baseUrl` + `systemId` reais.
 */
export async function listTokenTypes(
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<ReadonlyArray<TokenTypeDto>> {
  const data = await client.get<unknown>('/tokens/types', options);
  if (!isTokenTypeArray(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `POST /tokens/types` no `lfc-authenticator`
 * (`TokenTypesController.CreateTokenTypeRequest`).
 *
 * - `name` (obrigatório, máx. 80 chars) — nome amigável do tipo de
 *   token (ex.: "Acesso padrão", "Renovação").
 * - `code` (obrigatório, máx. 50 chars) — identificador único usado
 *   por rotas via `SystemTokenTypeId`. Backend valida unicidade
 *   ignorando filtro de soft-delete (409 caso já exista, mesmo que
 *   removido).
 * - `description` (opcional, máx. 500 chars) — descrição livre.
 *
 * O backend faz `Trim()` em `Name`/`Code` e converte `Description`
 * vazia (após trim) em `null`. Mantemos os campos como `string` aqui —
 * a UI já trima antes de enviar para preservar simetria com o que é
 * persistido (e evita 400 por "Code é obrigatório e não pode ser apenas
 * espaços" quando o usuário digita só whitespace). Espelha o desenho
 * de `CreateSystemPayload` (lição PR #128 — projetar contratos
 * simétricos entre recursos similares).
 */
export interface CreateTokenTypePayload {
  name: string;
  code: string;
  description?: string;
}

/**
 * Cria um novo tipo de token via `POST /tokens/types` (Issue #175).
 *
 * Retorna o `TokenTypeDto` recém-criado (`201 Created` com
 * `TokenTypeResponse` no corpo). Lança `ApiError` em qualquer falha —
 * o caller tipicamente trata:
 *
 * - `kind: 'http'` com `status === 409` → conflito de `code` único; a
 *   UI exibe mensagem inline no campo `code` ("Já existe um token type
 *   com este Code." vinda do backend).
 * - `kind: 'http'` com `status === 400` → erros de validação por campo
 *   no payload de `details` (formato `ValidationProblemDetails` do
 *   ASP.NET — `details.errors[campo] = string[]`).
 * - `kind: 'http'` com `status === 401` → cliente HTTP já lidou com
 *   `onUnauthorized`; a UI não precisa fazer nada além de não tentar
 *   re-renderizar.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_TOKEN_TYPES_CREATE`; toast vermelho com mensagem do
 *   backend.
 * - Outros erros → toast vermelho genérico.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function createTokenType(
  payload: CreateTokenTypePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<TokenTypeDto> {
  const body = buildTokenTypeMutationBody(payload);
  const data = await client.post<unknown>('/tokens/types', body, options);
  if (!isTokenTypeDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Body aceito pelo `PUT /tokens/types/{id}` no `lfc-authenticator`
 * (`TokenTypesController.UpdateTokenTypeRequest`).
 *
 * O backend declara um `UpdateTokenTypeRequest` separado, mas com o
 * mesmo shape do `CreateTokenTypeRequest` (Name obrigatório/máx. 80,
 * Code obrigatório/máx. 50, Description opcional/máx. 500). Para evitar
 * divergência silenciosa entre os dois tipos no frontend e replicar
 * fielmente a simetria do backend, declaramos o payload de update como
 * alias do de create — qualquer ajuste no contrato pega os dois call
 * sites de uma só vez (espelha `UpdateSystemPayload`).
 */
export type UpdateTokenTypePayload = CreateTokenTypePayload;

/**
 * Atualiza um tipo de token existente via `PUT /tokens/types/{id}`
 * (Issue #175).
 *
 * Retorna o `TokenTypeDto` atualizado (`200 OK` com `TokenTypeResponse`
 * no corpo). Lança `ApiError` em qualquer falha — o caller tipicamente
 * trata:
 *
 * - `kind: 'http'` com `status === 409` → conflito de `code` único
 *   (outro token type já usa o code informado); a UI exibe mensagem
 *   inline no campo `code` ("Já existe outro token type com este Code.").
 * - `kind: 'http'` com `status === 404` → token type não encontrado ou
 *   soft-deleted; a UI fecha o modal, dispara toast e força refetch.
 * - `kind: 'http'` com `status === 400` → erros de validação por campo
 *   em `details` (mesmo shape de `ValidationProblemDetails` do create).
 * - `kind: 'http'` com `status === 401` → cliente HTTP já lidou com
 *   `onUnauthorized`; a UI não precisa fazer nada extra.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_TOKEN_TYPES_UPDATE`; toast vermelho com mensagem do
 *   backend.
 * - Outros erros → toast vermelho genérico.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um stub
 * tipado como `ApiClient`); em produção usa-se o singleton `apiClient`.
 */
export async function updateTokenType(
  id: string,
  payload: UpdateTokenTypePayload,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<TokenTypeDto> {
  const body = buildTokenTypeMutationBody(payload);
  const data = await client.put<unknown>(`/tokens/types/${id}`, body, options);
  if (!isTokenTypeDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Desativa (soft-delete) um tipo de token via `DELETE /tokens/types/{id}`
 * (Issue #175).
 *
 * O backend (`TokenTypesController.DeleteById`) seta
 * `DeletedAt = UtcNow` e responde `204 No Content` em sucesso. O método
 * não devolve corpo — a função resolve `void` e a UI faz refetch para
 * sincronizar a lista.
 *
 * Lança `ApiError` em qualquer falha:
 *
 * - `kind: 'http'` com `status === 404` → token type inexistente (já
 *   soft-deleted ou nunca existiu); a UI fecha o modal, dispara toast
 *   e força refetch.
 * - `kind: 'http'` com `status === 401` → sessão expirada; cliente HTTP
 *   já lidou com `onUnauthorized`. UI mantém-se silenciosa além do
 *   toast.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_TOKEN_TYPES_DELETE`; toast vermelho com mensagem do
 *   backend.
 * - `kind: 'network'`/outros → toast vermelho genérico.
 *
 * Diferente de `createTokenType`/`updateTokenType`, não há type guard
 * de resposta porque `204` não tem corpo — `client.delete<void>`
 * resolve `undefined` e descartamos. Espelha a estratégia de
 * `deleteSystem`.
 */
export async function deleteTokenType(
  id: string,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.delete<void>(`/tokens/types/${id}`, options);
}

/**
 * Restaura (desfaz soft-delete) um tipo de token via
 * `POST /tokens/types/{id}/restore` (Issue #175).
 *
 * O backend (`TokenTypesController.RestoreById`) limpa `DeletedAt` via
 * `IgnoreQueryFilters()` e responde `200 OK` com
 * `{ message: "Token type restaurado com sucesso." }`. Diferente de
 * `createTokenType`/`updateTokenType`, o corpo da resposta **não** é
 * um `TokenTypeDto` — é um envelope simples `{ message }` que
 * descartamos. A UI faz refetch para sincronizar a lista (idêntico ao
 * padrão do `deleteTokenType` e ao `restoreSystem`), então retornamos
 * `void`.
 *
 * Lança `ApiError` em qualquer falha:
 *
 * - `kind: 'http'` com `status === 404` → token type inexistente **ou**
 *   já ativo (o backend devolve 404 em ambos os casos: filtro
 *   `DeletedAt != null`). A UI fecha o modal, dispara toast e força
 *   refetch — o registro foi mexido por outra sessão entre a abertura
 *   do modal e o submit, ou nem existe.
 * - `kind: 'http'` com `status === 401` → sessão expirada; cliente HTTP
 *   já lidou com `onUnauthorized`. UI mantém-se silenciosa além do
 *   toast.
 * - `kind: 'http'` com `status === 403` → falta permissão
 *   `AUTH_V1_TOKEN_TYPES_RESTORE`; toast vermelho com mensagem do
 *   backend.
 * - `kind: 'network'`/outros → toast vermelho genérico.
 *
 * Não há type guard de resposta porque `{ message }` é descartado —
 * `client.post<void>` resolve com o body como `unknown` e ignoramos.
 *
 * Recebe `BodyRequestOptions` (com `signal`) por simetria com
 * `createTokenType`/`updateTokenType` — `POST` é tratado como mutação
 * com corpo no cliente HTTP, ainda que aqui não enviemos payload.
 * Passamos `undefined` como body para que o backend receba uma
 * requisição vazia.
 */
export async function restoreTokenType(
  id: string,
  options?: BodyRequestOptions,
  client: ApiClient = apiClient,
): Promise<void> {
  await client.post<void>(`/tokens/types/${id}/restore`, undefined, options);
}

/**
 * Constrói o body para `POST /tokens/types` e `PUT /tokens/types/{id}`
 * aplicando trim defensivo nos campos. Description vazia depois de
 * trim vira `undefined` para que o serializador omita o campo (backend
 * converte para `null`). Centralizar essa montagem garante que create
 * e update enviem exatamente o mesmo payload — qualquer divergência
 * futura no shape (ex.: backend aceitando `tags`) ajusta um único
 * helper. Espelha `buildSystemMutationBody`.
 */
function buildTokenTypeMutationBody(
  payload: CreateTokenTypePayload | UpdateTokenTypePayload,
): CreateTokenTypePayload {
  const body: CreateTokenTypePayload = {
    name: payload.name.trim(),
    code: payload.code.trim(),
  };
  const trimmedDescription = payload.description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    body.description = trimmedDescription;
  }
  return body;
}
