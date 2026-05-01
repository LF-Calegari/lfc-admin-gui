import { apiClient } from './index';

import type { ApiClient, ApiError, SafeRequestOptions } from './types';

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
 * Type guard para `TokenTypeDto`. Tolera `description`/`deletedAt`
 * ausentes (tratados como `null`) — outros campos são obrigatórios e
 * checados em runtime.
 *
 * Mantemos a validação aqui em vez de delegar a um runtime schema
 * library (Zod/Yup) porque o cliente HTTP intencionalmente não tem
 * dependência de validação — cada wrapper é dono da própria checagem,
 * coerente com `isSystemDto`/`isRouteDto`. Para listas de tokens, isso
 * evita um ~40 KB de payload extra no bundle de produção.
 */
export function isTokenTypeDto(value: unknown): value is TokenTypeDto {
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
