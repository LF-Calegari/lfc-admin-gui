import { apiClient } from './index';

import type { PagedResponse } from './systems';
import type { ApiClient, ApiError, SafeRequestOptions } from './types';

/**
 * Cria um `ApiError(parse)` baseado em `Error` real (com stack/`name`)
 * em vez de um literal `{ kind, message }`. Sonar marca `throw` de
 * objeto não-Error como improvement (`Expected an error object to be
 * thrown`); estendê-lo com `Object.assign` preserva a interface
 * `ApiError` consumida por `isApiError` sem perder o stack trace.
 *
 * Centralizado para evitar repetir `Object.assign(new Error(...), { kind })`
 * em call sites do módulo — Sonar contaria a repetição como duplicação.
 * Espelha o padrão de `systems.ts`/`routes.ts`/`roles.ts`/`users.ts`
 * (lição PR #128 — projetar shared helpers desde o primeiro PR do
 * recurso).
 */
function makeParseError(): ApiError {
  return Object.assign(new Error('Resposta inválida do servidor.'), {
    kind: 'parse' as const,
  });
}

/**
 * Espelho do `ClientResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Clients.ClientsController.ClientResponse`).
 *
 * Issue #77 (EPIC #49) — DTO mínimo necessário para a listagem de
 * usuários poder denormalizar o **nome** do cliente vinculado a cada
 * usuário (a tabela mostra a coluna "Cliente"). A listagem de clientes
 * própria (issue dedicada da EPIC) virá em PR separado e é livre para
 * estender este módulo (`createClient`/`updateClient`/etc.) sem
 * refatoração destrutiva — projetamos shared helpers desde já (lição
 * PR #128).
 *
 * **Estado atual do contrato:**
 *
 * - `type` é discriminator literal "PF" | "PJ" — define quais campos
 *   ficam preenchidos (`fullName`/`cpf` em PF, `corporateName`/`cnpj`
 *   em PJ). Mantemos como `string` no DTO para tolerar payloads
 *   inesperados sem `narrowing` artificial; a UI usa `displayName`
 *   abaixo para escolher o rótulo certo.
 * - Campos opcionais (`cpf`, `fullName`, `cnpj`, `corporateName`)
 *   podem ser `null` no JSON. O type guard valida o shape mas tolera
 *   ausência (mesmo padrão de `description` em `SystemDto`).
 * - As listas `userIds`, `extraEmails`, `mobilePhones`,
 *   `landlinePhones` não são consumidas por #77; mantemos opcionais
 *   no DTO para refletir o `ClientResponse` real do backend e evitar
 *   divergência de shape se o frontend evoluir para exibir mais
 *   detalhes do cliente em uma página dedicada (ver acima).
 *
 * Datas em ISO 8601 (UTC) — mantemos como `string`; conversão fica a
 * cargo do consumidor que precisa exibir.
 */
export interface ClientDto {
  id: string;
  type: string;
  cpf: string | null;
  fullName: string | null;
  cnpj: string | null;
  corporateName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Type guard para `ClientDto`. Tolera campos opcionais ausentes
 * (`cpf`/`fullName`/`cnpj`/`corporateName`/`deletedAt`) — apenas `id`,
 * `type`, `createdAt` e `updatedAt` são obrigatórios.
 *
 * Exportado para que outros call sites (futuros wrappers `createClient`/
 * `updateClient` da EPIC #49) reusem a mesma fonte de verdade — evita
 * duplicação de validação de shape (lição PR #123).
 */
export function isClientDto(value: unknown): value is ClientDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.cpf === null ||
      record.cpf === undefined ||
      typeof record.cpf === 'string') &&
    (record.fullName === null ||
      record.fullName === undefined ||
      typeof record.fullName === 'string') &&
    (record.cnpj === null ||
      record.cnpj === undefined ||
      typeof record.cnpj === 'string') &&
    (record.corporateName === null ||
      record.corporateName === undefined ||
      typeof record.corporateName === 'string') &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === 'string')
  );
}

/**
 * Type guard para `PagedResponse<ClientDto>`. Valida o envelope antes
 * de confiar no payload — protege contra divergência silenciosa de
 * versão entre frontend e backend (proxy intermediário cortando
 * campos, deploy desalinhado). Espelha `isPagedSystemsResponse` em
 * `systems.ts`.
 *
 * Exportado para que a futura `ClientsListShellPage` real (issue
 * dedicada da EPIC #49) reuse — declaramos já agora pelo padrão
 * "primeiro PR do recurso" (lição PR #128).
 */
export function isPagedClientsResponse(value: unknown): value is PagedResponse<ClientDto> {
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
  return record.data.every(isClientDto);
}

/**
 * Defaults usados pelo wrapper de listagem — alinhados com os limites
 * do backend (`ClientsController.DefaultPageSize = 20`/`MaxPageSize = 100`).
 *
 * Exportados para que a `ClientsListShellPage` (issue dedicada da
 * EPIC #49) compartilhe a mesma fonte de verdade ao inicializar o
 * estado dos controles de busca/paginação/filtro.
 */
export const DEFAULT_CLIENTS_PAGE = 1;
export const DEFAULT_CLIENTS_PAGE_SIZE = 20;
export const DEFAULT_CLIENTS_INCLUDE_DELETED = false;

/**
 * Parâmetros aceitos por `listClients`. Todos opcionais — quando
 * omitidos (ou iguais aos defaults), são removidos da querystring.
 *
 * Issue #77: a `UsersListShellPage` consome este wrapper apenas com
 * `ids` (lookup batch dos clientes vinculados aos usuários da página
 * corrente). Os demais parâmetros existem para alinhar o contrato com
 * `GET /clients` real — facilitam a futura tela de listagem de
 * clientes (EPIC #49) sem refatoração destrutiva.
 */
export interface ListClientsParams {
  /** Termo de busca (case-insensitive em campos de nome/documento). */
  q?: string;
  /** Filtro por discriminator: `'PF'` ou `'PJ'`. */
  type?: 'PF' | 'PJ';
  /** Quando `false`, lista apenas inativos. `true`/omitido → ativos. */
  active?: boolean;
  /** Página 1-based. Default: 1. */
  page?: number;
  /** Itens por página. Default: 20. Backend rejeita `> 100`. */
  pageSize?: number;
  /** Quando `true`, inclui clientes com `deletedAt != null`. */
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de
 * proxy. Espelha `buildQueryString` de `systems.ts`/`routes.ts`.
 */
function buildListQueryString(params: ListClientsParams): string {
  const search = new URLSearchParams();

  const q = params.q?.trim();
  if (q && q.length > 0) {
    search.set('q', q);
  }

  if (params.type === 'PF' || params.type === 'PJ') {
    search.set('type', params.type);
  }

  if (typeof params.active === 'boolean') {
    search.set('active', String(params.active));
  }

  if (typeof params.page === 'number' && params.page !== DEFAULT_CLIENTS_PAGE) {
    search.set('page', String(params.page));
  }

  if (
    typeof params.pageSize === 'number' &&
    params.pageSize !== DEFAULT_CLIENTS_PAGE_SIZE
  ) {
    search.set('pageSize', String(params.pageSize));
  }

  if (
    typeof params.includeDeleted === 'boolean' &&
    params.includeDeleted !== DEFAULT_CLIENTS_INCLUDE_DELETED
  ) {
    search.set('includeDeleted', String(params.includeDeleted));
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Lista clientes via `GET /clients` com busca, filtro e paginação.
 *
 * Retorna o envelope tipado `PagedResponse<ClientDto>`. Lança
 * `ApiError` em falhas (rede, parse, HTTP); o caller deve tratar com
 * try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController) —
 * em navegações rápidas, o caller cancela a request anterior antes de
 * disparar a nova (mesmo padrão de `listSystems`/`listRoutes`).
 *
 * O parâmetro `client` é injetável para isolar testes; em produção
 * usa-se o singleton `apiClient`.
 *
 * Issue #77 — pré-fabricado para que a `UsersListShellPage` possa
 * mostrar nome do cliente em coluna dedicada via lookup batch (`ids=`)
 * sem precisar denormalização extra. A próxima EPIC (#49) reusa o
 * mesmo wrapper para sua listagem dedicada.
 */
export async function listClients(
  params: ListClientsParams = {},
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<ClientDto>> {
  const path = `/clients${buildListQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedClientsResponse(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Resposta minimalista usada pelo lookup batch (`GET /clients?ids=...`).
 *
 * **Estado atual do backend:** o controller real de Clientes ainda não
 * expõe um endpoint batch — a UI consome via `listClients({ q })`
 * filtrando server-side. Mantemos este tipo declarado para que, quando
 * o backend ganhar `ClientsMinimalResponse(Id, Name)` (paridade com
 * `UserMinimalResponse`), a UI consuma sem refatoração destrutiva.
 */
export interface ClientLookupDto {
  id: string;
  /** Rótulo apresentável: `fullName` (PF) ou `corporateName` (PJ). */
  name: string;
}

/**
 * Reduz um `ClientDto` ao label apresentável usado em colunas/UIs do
 * frontend. Para PF, prioriza `fullName`; para PJ, `corporateName`.
 * Quando ambos vêm `null` (cenário improvável mas possível em dados
 * legados), cai no `id` curto para que a UI nunca exiba string vazia.
 *
 * Exportado e centralizado aqui para que cada caller (UsersList,
 * future ClientsList, futuros relatórios) use exatamente o mesmo
 * critério — Sonar marca lógica equivalente repetida em arquivos
 * diferentes como duplicação (lição PR #127).
 */
export function clientDisplayName(client: ClientDto): string {
  const fullName = client.fullName?.trim();
  if (fullName && fullName.length > 0) {
    return fullName;
  }
  const corporateName = client.corporateName?.trim();
  if (corporateName && corporateName.length > 0) {
    return corporateName;
  }
  return client.id;
}

/**
 * Lookup batch de clientes por `ids` — devolve um `Map<id, ClientDto>`
 * para que o caller resolva cada `clientId` em O(1) ao montar a
 * tabela. Faz uma única chamada à `listClients({ ids })` quando o
 * backend evoluir para expor o filtro `ids`; **hoje** o backend não
 * implementa o batch, então este helper itera fazendo `q=<id>` por
 * cliente (compatível com `GET /clients?q=...`) e devolve o mapa.
 *
 * Quando o backend for evoluído (issue dedicada da EPIC #49), basta
 * trocar a implementação interna por uma única chamada `listClients`
 * com novo param `ids` — a assinatura pública desta função (e os
 * call sites) ficam intactos. Conserva a lição "shared helpers
 * projetados desde o primeiro PR" (PR #128).
 *
 * **Limite prático:** chamadas em série fazem 1 request por id, o
 * que é aceitável para uma página de até `pageSize` usuários (default
 * 20). Quando o backend ganhar batch real, a otimização vem grátis.
 *
 * Cancelamento via `signal` é propagado; deduplicação é
 * responsabilidade do caller (passar `Set<string>` evita id repetido).
 */
export async function getClientsByIds(
  ids: ReadonlyArray<string>,
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<ReadonlyMap<string, ClientDto>> {
  const result = new Map<string, ClientDto>();
  if (ids.length === 0) {
    return result;
  }

  // Itera serialmente — evita rajada de N requests paralelas que
  // sobrecarregaria o backend para listagens grandes. Em prática a
  // página sempre passa <= pageSize ids, então a latência fica
  // aceitável.
  for (const id of ids) {
    if (result.has(id)) {
      // Caller deveria ter deduplicado, mas defensivamente skipamos.
      continue;
    }
    try {
      const dto = await fetchClientById(id, options, client);
      if (dto !== null) {
        result.set(id, dto);
      }
    } catch (error) {
      // Lookup falho não derruba a página: simplesmente o cliente
      // não aparece no map e a UI mostra "—" como fallback. Erros
      // críticos (401/403/network) já são propagados pelo
      // `listClients` original via `usePaginatedFetch`; este
      // helper é "best-effort" para enriquecer a tabela.
      if (isAbortError(error)) {
        // Cancelamento explícito: re-throw para que o caller pare.
        throw error;
      }
      // Outros erros: silenciosamente skipar este id.
    }
  }

  return result;
}

/**
 * Tenta carregar um cliente individual via `GET /clients/{id}` — hoje
 * implementado como `GET /clients?q=<id>` (best-effort) já que o
 * backend não tem batch nem GetById exposto consistentemente para
 * este caso. Retorna `null` quando não encontrado.
 */
async function fetchClientById(
  id: string,
  options: SafeRequestOptions | undefined,
  client: ApiClient,
): Promise<ClientDto | null> {
  // Tenta primeiro o GetById direto (`GET /clients/{id}`) — backend
  // expõe esse endpoint via rota convencional do REST controller. Se
  // o backend não tiver, o ApiError é propagado e o caller decide.
  const data = await client.get<unknown>(`/clients/${id}`, options);
  if (data === null || data === undefined) {
    return null;
  }
  if (!isClientDto(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Detecta se o erro é um `AbortError` (DOMException) ou um `ApiError`
 * de rede com a mensagem dedicada de cancelamento. Mantido local em
 * vez de exportado porque é detalhe de implementação do
 * `getClientsByIds`.
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'kind' in error &&
    (error as { kind: unknown }).kind === 'network' &&
    'message' in error &&
    (error as { message: unknown }).message === 'Requisição cancelada.'
  ) {
    return true;
  }
  return false;
}
