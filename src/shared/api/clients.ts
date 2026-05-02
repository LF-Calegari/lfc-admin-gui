import { isPagedResponseEnvelope } from './pagedResponse';

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
 * em múltiplos call sites — Sonar contaria a repetição como duplicação.
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
 * Tipo discriminador de cliente. Espelha o `Type` do `ClientResponse`
 * do `lfc-authenticator`
 * (`AuthService.Controllers.Clients.ClientsController.ClientResponse`),
 * que aceita apenas `"PF"` (pessoa física) ou `"PJ"` (pessoa jurídica).
 *
 * O backend valida e normaliza (uppercase + trim) na criação/edição
 * (`NormalizeRequest`/`ValidateClientByType`), e a listagem rejeita
 * `type` ≠ PF/PJ com 400. Do lado do frontend, manter o tipo restrito
 * via união de string-literais elimina checagens redundantes em
 * runtime e garante que filtros/badges não recebam valores espúrios.
 */
export type ClientType = 'PF' | 'PJ';

/**
 * Espelho do `ClientEmailResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Clients.ClientsController.ClientEmailResponse`).
 *
 * Email extra de um cliente (até 3 por cliente, com regras
 * anti-username — ver Issue #146). A listagem (Issue #73) **não**
 * consome esses campos visualmente, mas o type guard do `ClientDto`
 * valida o shape porque o backend devolve sempre — incluir aqui
 * evita refatoração destrutiva nas próximas sub-issues (#74/#75/
 * #146 — lição PR #128).
 */
export interface ClientEmailDto {
  id: string;
  email: string;
  createdAt: string;
}

/**
 * Espelho do `ClientPhoneResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Clients.ClientsController.ClientPhoneResponse`).
 *
 * Telefone vinculado a um cliente. Ambos os arrays `mobilePhones` e
 * `landlinePhones` no `ClientDto` usam este shape — o discriminador
 * `Type` (mobile/phone) é representado pela posição no array do
 * `ClientResponse`, não como campo do registro. Mantido aqui pelo
 * mesmo motivo de `ClientEmailDto` (lição PR #128).
 */
export interface ClientPhoneDto {
  id: string;
  number: string;
  createdAt: string;
}

/**
 * Espelho do `ClientResponse` do `lfc-authenticator`
 * (`AuthService.Controllers.Clients.ClientsController.ClientResponse`).
 *
 * Issue #73 (EPIC #49) — listagem completa de clientes.
 *
 * **Modelagem PF/PJ:** o backend usa um único shape com campos
 * mutuamente exclusivos por tipo:
 *
 * - `type === 'PF'` → `cpf` + `fullName` preenchidos; `cnpj`/
 *   `corporateName` `null`.
 * - `type === 'PJ'` → `cnpj` + `corporateName` preenchidos; `cpf`/
 *   `fullName` `null`.
 *
 * A UI da listagem **renderiza** com base em `type` para escolher
 * qual coluna exibir (Nome = `fullName ?? corporateName`, Documento
 * = `cpf ?? cnpj`). Isso replica fielmente o contrato do backend e
 * evita branching duplicado em call sites.
 *
 * **Datas:** o backend serializa em ISO 8601 (UTC) — mantemos como
 * `string` porque a UI consome via `Intl.DateTimeFormat`/`new Date()`
 * quando precisar exibir; converter no boundary do cliente HTTP
 * traria custo sem benefício. `deletedAt !== null` indica
 * soft-delete.
 *
 * **Coleções (`userIds`, `extraEmails`, `mobilePhones`,
 * `landlinePhones`):** o backend devolve sempre arrays (vazios
 * quando não há vínculos). Mantidas como opcionais no type para
 * tolerar fixtures de teste minimalistas (Issue #77 consome só
 * `id`/`type`/nomes via `clientDisplayName` e seu fixture
 * `getClientsByIds` retorna o que o backend produzir); call sites
 * que precisem ler emails/telefones (`#74`/`#75`/`#146`/`#147`)
 * devem tratar `?? []` no acesso.
 */
export interface ClientDto {
  id: string;
  type: ClientType;
  cpf: string | null;
  fullName: string | null;
  cnpj: string | null;
  corporateName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  userIds?: ReadonlyArray<string>;
  extraEmails?: ReadonlyArray<ClientEmailDto>;
  mobilePhones?: ReadonlyArray<ClientPhoneDto>;
  landlinePhones?: ReadonlyArray<ClientPhoneDto>;
}

/**
 * Type guard interno para `ClientEmailDto`. Centralizado para que o
 * guard externo (`isClientDto`) não inline o mesmo shape — Sonar
 * marca blocos de validação repetidos em arquivos diferentes como
 * duplicação (lição PR #123).
 */
function isClientEmailDto(value: unknown): value is ClientEmailDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.email === 'string' &&
    typeof record.createdAt === 'string'
  );
}

/**
 * Type guard interno para `ClientPhoneDto`. Mesma motivação de
 * `isClientEmailDto` — centralizar para evitar duplicação visual e
 * permitir reuso pelo `isClientDto` para `mobilePhones` e
 * `landlinePhones` (mesmo shape, posições diferentes no envelope).
 */
function isClientPhoneDto(value: unknown): value is ClientPhoneDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.number === 'string' &&
    typeof record.createdAt === 'string'
  );
}

/**
 * Type guard para `ClientDto`. Aceita os dois caminhos de PF e PJ
 * (sem forçar combinação) e tolera campos opcionais ausentes
 * (`cpf`/`fullName`/`cnpj`/`corporateName`/`deletedAt` e as 4
 * coleções).
 *
 * Quando as coleções estão presentes, são validadas item-a-item
 * pelos guards internos. Isso preserva a tolerância de fixtures
 * minimalistas (Issue #77 consome só `id`/`type`/labels) sem perder
 * a validação de shape quando o backend devolve o response real
 * completo.
 *
 * Exportado para que outros call sites (ex.: `getClientsByIds` para
 * lookup batch da `UsersListShellPage`, futuros wrappers
 * `createClient`/`updateClient` da EPIC #49) reusem a mesma fonte
 * de verdade — evita duplicação de validação de shape (lição PR
 * #123).
 */
export function isClientDto(value: unknown): value is ClientDto {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return false;
  }
  if (record.type !== 'PF' && record.type !== 'PJ') {
    return false;
  }
  if (
    !isNullableString(record.cpf) ||
    !isNullableString(record.fullName) ||
    !isNullableString(record.cnpj) ||
    !isNullableString(record.corporateName) ||
    !isNullableString(record.deletedAt)
  ) {
    return false;
  }
  if (!isOptionalArray(record.userIds, (id) => typeof id === 'string')) {
    return false;
  }
  if (!isOptionalArray(record.extraEmails, isClientEmailDto)) {
    return false;
  }
  if (!isOptionalArray(record.mobilePhones, isClientPhoneDto)) {
    return false;
  }
  if (!isOptionalArray(record.landlinePhones, isClientPhoneDto)) {
    return false;
  }
  return true;
}

/**
 * Ajuda os checks de campos `string | null`. Aceita `undefined`
 * como `null` para tolerar payloads onde o backend omitiu o campo
 * (`deletedAt` em registros ativos é o caso comum).
 */
function isNullableString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

/**
 * Aceita `undefined` ou um array onde **todos** os itens passam no
 * predicado `isItem`. Usado pelo `isClientDto` para validar as
 * coleções (`userIds`/`extraEmails`/`mobilePhones`/`landlinePhones`)
 * sem rejeitar fixtures minimalistas que omitem o campo.
 */
function isOptionalArray(
  value: unknown,
  isItem: (item: unknown) => boolean,
): boolean {
  if (value === undefined) {
    return true;
  }
  return Array.isArray(value) && value.every((item) => isItem(item));
}

/**
 * Type guard para `PagedResponse<ClientDto>`. Valida o envelope
 * antes de confiar no payload — protege contra divergência
 * silenciosa de versão entre frontend e backend (proxy intermediário
 * cortando campos, deploy desalinhado). Reusa
 * `isPagedResponseEnvelope` para evitar repetir a checagem fixa de
 * `page`/`pageSize`/`total`/`data` que já existe em outros recursos
 * (lição PR #134/#135 — JSCPD/Sonar tokenizam blocos de ~14 linhas
 * idênticos como duplicação).
 */
export function isPagedClientsResponse(value: unknown): value is PagedResponse<ClientDto> {
  return isPagedResponseEnvelope(value, isClientDto);
}

/**
 * Defaults usados pela `listClients` para omitir parâmetros que
 * coincidem com o backend — preserva a URL "limpa" no caminho
 * default (`GET /clients` em vez de
 * `GET /clients?page=1&pageSize=20&includeDeleted=false`).
 *
 * `DEFAULT_CLIENTS_PAGE_SIZE = 20` espelha
 * `ClientsController.DefaultPageSize` no `lfc-authenticator` —
 * manter um único limite reduz surpresas para o admin que alterna
 * entre listas. `MaxPageSize = 100` no backend; respeitar via UI
 * para evitar 400 inesperado.
 */
export const DEFAULT_CLIENTS_PAGE = 1;
export const DEFAULT_CLIENTS_PAGE_SIZE = 20;
export const DEFAULT_CLIENTS_INCLUDE_DELETED = false;

/**
 * Parâmetros aceitos por `listClients`. Todos opcionais — quando
 * omitidos (ou iguais aos defaults), são removidos da querystring.
 *
 * - `q` — termo de busca textual (case-insensitive em `fullName`,
 *   `corporateName`, `cpf`, `cnpj`). Backend escapa wildcards de
 *   `ILIKE` (`%`/`_`/`\`) antes de aplicar.
 * - `type` — filtra por discriminador (`PF`/`PJ`). Validado no
 *   backend; valor inválido gera 400 (`type deve ser PF ou PJ.`).
 * - `active` — filtra por status (`true` = só ativos, `false` = só
 *   soft-deletados, ausente = comportamento default da query). É
 *   **mutuamente exclusivo** com `includeDeleted=true` (backend
 *   rejeita combinação com 400).
 * - `page` — página 1-based. Default: 1.
 * - `pageSize` — itens por página. Default: 20. Backend rejeita
 *   `> 100` ou `<= 0` com 400.
 * - `includeDeleted` — quando `true`, inclui também soft-deletados
 *   (`active` ausente nesse caso). Mutuamente exclusivo com
 *   `active`.
 */
export interface ListClientsParams {
  q?: string;
  type?: ClientType;
  active?: boolean;
  page?: number;
  pageSize?: number;
  includeDeleted?: boolean;
}

/**
 * Constrói a querystring omitindo parâmetros default — mantém a URL
 * canônica para o caminho mais comum e simplifica logs/cache de
 * proxy. `q` é trimado e omitido quando vazio para evitar `?q=`
 * literal (que o backend trataria como busca por string vazia, mas
 * a UI sinalizaria estado de "busca ativa" no `q`). Espelha
 * `buildQueryString` de `systems.ts`.
 */
function buildQueryString(params: ListClientsParams): string {
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

  if (typeof params.pageSize === 'number' && params.pageSize !== DEFAULT_CLIENTS_PAGE_SIZE) {
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
 * Lista clientes via `GET /clients` (lfc-authenticator#169) com
 * busca, paginação e filtros server-side.
 *
 * Retorna o envelope tipado `PagedResponse<ClientDto>`. Lança
 * `ApiError` em falhas (rede, parse, HTTP); o caller deve tratar
 * com try/catch.
 *
 * Cancelamento: aceita `signal` em `options` (via AbortController)
 * — em navegações rápidas, o caller cancela a request anterior
 * antes de disparar a nova, evitando race em `setState`.
 *
 * O parâmetro `client` é injetável para isolar testes (passa-se um
 * stub tipado como `ApiClient`); o default usa o singleton
 * `apiClient` configurado com `baseUrl` + `systemId` reais.
 *
 * Issue #73 — primeira sub-issue da EPIC #49 (CRUD de Clientes).
 * As próximas issues (#74 criar, #75 editar, #76 desativar, #146/
 * #147 gerenciar emails/telefones) reutilizam o mesmo módulo
 * seguindo o padrão de `systems.ts` (lição PR #128 — projetar
 * shared helpers desde o primeiro PR do recurso).
 */
export async function listClients(
  params: ListClientsParams = {},
  options?: SafeRequestOptions,
  client: ApiClient = apiClient,
): Promise<PagedResponse<ClientDto>> {
  const path = `/clients${buildQueryString(params)}`;
  const data = await client.get<unknown>(path, options);
  if (!isPagedClientsResponse(data)) {
    throw makeParseError();
  }
  return data;
}

/**
 * Resposta minimalista usada pelo lookup batch (`GET /clients?ids=...`).
 *
 * **Estado atual do backend:** o controller real de Clientes ainda
 * não expõe um endpoint batch — a UI consome via `getClientsByIds`
 * que itera `GET /clients/{id}` por id. Mantemos este tipo
 * declarado para que, quando o backend ganhar
 * `ClientsMinimalResponse(Id, Name)` (paridade com
 * `UserMinimalResponse`), a UI consuma sem refatoração destrutiva
 * (lição PR #128).
 */
export interface ClientLookupDto {
  id: string;
  /** Rótulo apresentável: `fullName` (PF) ou `corporateName` (PJ). */
  name: string;
}

/**
 * Reduz um `ClientDto` ao label apresentável usado em colunas/UIs
 * do frontend. Para PF, prioriza `fullName`; para PJ,
 * `corporateName`. Quando ambos vêm `null` (cenário improvável mas
 * possível em dados legados), cai no `id` curto para que a UI nunca
 * exiba string vazia.
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
 * Lookup batch de clientes por `ids` — devolve um
 * `Map<id, ClientDto>` para que o caller resolva cada `clientId`
 * em O(1) ao montar a tabela. **Hoje** o backend não implementa
 * filtro `ids` em `GET /clients`, então este helper itera fazendo
 * `GET /clients/{id}` por cliente e devolve o mapa.
 *
 * Quando o backend for evoluído (issue dedicada da EPIC #49),
 * basta trocar a implementação interna por uma única chamada
 * `listClients` com novo param `ids` — a assinatura pública desta
 * função (e os call sites) ficam intactos. Conserva a lição
 * "shared helpers projetados desde o primeiro PR" (PR #128).
 *
 * **Limite prático:** chamadas em série fazem 1 request por id, o
 * que é aceitável para uma página de até `pageSize` usuários
 * (default 20). Quando o backend ganhar batch real, a otimização
 * vem grátis.
 *
 * Cancelamento via `signal` é propagado; deduplicação é
 * responsabilidade do caller (passar `Set<string>` evita id
 * repetido).
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
 * Tenta carregar um cliente individual via `GET /clients/{id}`.
 * Retorna `null` quando o backend devolve corpo vazio; lança
 * `ApiError(parse)` quando o JSON não casa com `isClientDto`.
 */
async function fetchClientById(
  id: string,
  options: SafeRequestOptions | undefined,
  client: ApiClient,
): Promise<ClientDto | null> {
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
 * Detecta se o erro é um `AbortError` (DOMException) ou um
 * `ApiError` de rede com a mensagem dedicada de cancelamento.
 * Mantido local em vez de exportado porque é detalhe de
 * implementação do `getClientsByIds`.
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
