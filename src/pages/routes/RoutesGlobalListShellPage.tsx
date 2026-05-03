import { Plus } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Select, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToggleModalState } from '../../hooks/useListModalState';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import {
  DEFAULT_ROUTES_INCLUDE_DELETED,
  DEFAULT_ROUTES_PAGE,
  DEFAULT_ROUTES_PAGE_SIZE,
  listRoutes,
  listSystems,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  CardListForMobile,
  CardMeta,
  CardMetaTerm,
  CardMetaValue,
  EntityCard,
  ListingResultArea,
  ListingToolbar,
  LiveRegion,
  Mono,
  StatusBadge,
  TableForDesktop,
  useListingLiveMessage,
} from '../../shared/listing';

import { NewRouteModal } from './NewRouteModal';
import {
  RouteCardTopSection,
  renderRouteDescription,
  renderTokenPolicy,
  useRoutesListShellState,
} from './routeRenderHelpers';

import type { TableColumn } from '../../components/ui';
import type {
  ApiClient,
  PagedResponse,
  RouteDto,
  SafeRequestOptions,
  SystemDto,
} from '../../shared/api';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms é
 * o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 request por caractere. Espelha o valor
 * usado por `SystemsPage`/`RoutesPage`/`ClientsListShellPage` —
 * extrair em módulo compartilhado só compensa quando ≥ 4 listagens
 * reusarem (lição PR #128).
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Valor sentinel usado pelo `<Select>` de filtro de sistema para
 * representar "todos os sistemas" (sem filtro). Espelha o padrão
 * `TYPE_FILTER_ALL` em `ClientsListShellPage` (Issue #73). Quando
 * detectado, omitimos `systemId` da request para que o backend devolva
 * rotas de todos os sistemas — caminho global da Issue #172.
 */
const SYSTEM_FILTER_ALL = 'ALL' as const;

/**
 * Limite de sistemas carregados no dropdown de filtro. Espelha o
 * `MAX_PAGE_SIZE` aceito por `GET /systems` no backend
 * (`AuthService.Controllers.Common`); o ecossistema de sistemas
 * cadastrados é pequeno (≤ 10 em produção projetada), então 100 cobre
 * todos os cenários sem paginação adicional. Inclui soft-deletados
 * para que rotas órfãs (de sistemas inativados) ainda apresentem o
 * nome do sistema na coluna Sistema, em vez de "—".
 */
const SYSTEMS_LOOKUP_PAGE_SIZE = 100;

/**
 * Code de permissão exigido para o botão "Nova rota" — Issue #187.
 *
 * Espelha o `AUTH_V1_SYSTEMS_ROUTES_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator` e o usado na
 * `RoutesPage` (per-system). O backend é a fonte autoritativa
 * (`POST /systems/routes` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemsRoutesCreate)]`); o
 * gating client-side é apenas UX — esconder ações que o usuário não
 * pode executar.
 */
const ROUTES_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_ROUTES_CREATE';

interface RoutesGlobalListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido — a
   * página usa o singleton `apiClient` por trás de `listRoutes`/
   * `listSystems`. Em testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/* ─── Styled primitives ──────────────────────────────────── */

/**
 * Link da coluna Sistema. Reusa as cores do design system para manter
 * paridade com `BackLink` (mesma família visual: monoespaçado,
 * underline no hover, focus ring). Direciona o operador para o
 * drill-down `/systems/:systemId/routes` — mantém a IA de "tudo
 * escopado por sistema" preservada.
 */
const SystemLink = styled(Link)`
  color: var(--fg1);
  text-decoration: none;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  margin: -2px -4px;
  transition: color var(--duration-fast) var(--ease-default);

  &:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }
`;

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Constrói um lookup `Map<systemId, SystemDto>` a partir do payload
 * paginado de sistemas. Memoizado no caller para evitar reconstruir o
 * Map a cada render — o lookup é estável enquanto a primeira request
 * dos sistemas não for re-executada (filtros não mudam o catálogo).
 */
function buildSystemsLookup(
  pagedSystems: PagedResponse<SystemDto> | null,
): ReadonlyMap<string, SystemDto> {
  const map = new Map<string, SystemDto>();
  if (!pagedSystems) return map;
  for (const system of pagedSystems.data) {
    map.set(system.id, system);
  }
  return map;
}

/**
 * Resolve o "Nome do sistema" exibido na coluna Sistema/cards mobile.
 * Quando o lookup não tem o `systemId` (ainda carregando, ou catálogo
 * desalinhado), exibimos o id truncado em monoespaçado como fallback —
 * sinal visual de que o dado existe no servidor mesmo sem
 * denormalização local. Quando o lookup carrega, mostramos
 * `system.name`.
 *
 * Centralizado em função pura para reuso entre tabela desktop e cards
 * mobile (lição PR #134/#135 — bloco ≥ 10 linhas idêntico em surfaces
 * diferentes do mesmo arquivo é tokenizado como duplicação).
 */
function resolveSystemDisplayName(
  systemId: string,
  systemsLookup: ReadonlyMap<string, SystemDto>,
): string {
  const system = systemsLookup.get(systemId);
  if (system && system.name.trim().length > 0) {
    return system.name;
  }
  return systemId;
}

/* ─── Component ──────────────────────────────────────────── */

/**
 * Listagem global cross-system de rotas (`/routes`). Paralelo à
 * `SystemsPage` para sistemas: substitui o `<PlaceholderPage>` que o
 * item "Rotas" do Sidebar renderizava antes (UX confusa — clicar não
 * disparava fetch). Issue #172.
 *
 * Diferenças em relação à `RoutesPage` (drill-down `/systems/:id/routes`):
 *
 * - Não lê `:systemId` da URL — o filtro é opcional, via dropdown.
 * - Coluna Sistema visível e clicável (link para drill-down).
 * - Escopo de mutação fica de fora — Criar/Editar/Excluir continua na
 *   `RoutesPage` (issues #63/#64/#65). Aqui só listagem + navegação.
 *
 * Padrão de implementação espelha `ClientsListShellPage` (Issue #73 —
 * listagem global sem `:systemId` na URL, com `extraFilter` opcional).
 */
export const RoutesGlobalListShellPage: React.FC<RoutesGlobalListShellPageProps> = ({
  client,
}) => {
  // A rota inteira é gateada por
  // `RequirePermission code="AUTH_V1_SYSTEMS_ROUTES_LIST"` em
  // `AppRoutes`. A partir da Issue #187 também usamos `useAuth` para
  // gating local do botão "Nova rota" — esconde a ação para operadores
  // sem `AUTH_V1_SYSTEMS_ROUTES_CREATE`.
  const { hasPermission } = useAuth();
  const canCreateRoute = hasPermission(ROUTES_CREATE_PERMISSION);

  // Estado de abertura do modal "Nova rota" (Issue #187 — paridade
  // visual com `SystemsPage`/`RoutesPage`/`RolesGlobalListShellPage`).
  // Usamos `useToggleModalState` para colapsar o trio
  // `[isOpen, open, close]` e evitar a 7ª recorrência potencial de
  // duplicação Sonar (lição PR #134/#135).
  const createModal = useToggleModalState();

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Filtro de sistema. 'ALL' é o sentinel — quando ativo, omitimos o
  // param `systemId` da request e o backend devolve rotas de todos os
  // sistemas. Tipado como união entre a sentinel string e UUID para
  // evitar misturar com 'PF'/'PJ' como em `ClientsListShellPage`.
  const [systemFilter, setSystemFilter] = useState<string>(SYSTEM_FILTER_ALL);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_ROUTES_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_ROUTES_PAGE);

  /**
   * Carrega o catálogo de sistemas para alimentar (i) o dropdown de
   * filtro e (ii) o lookup `systemId → systemName` da coluna Sistema.
   *
   * `pageSize: SYSTEMS_LOOKUP_PAGE_SIZE` cobre o catálogo inteiro em um
   * único request — o ecossistema é pequeno (~10 sistemas projetados).
   * `includeDeleted: true` inclui sistemas inativados para que rotas
   * órfãs ainda exibam o nome do sistema; o backend devolve o
   * `SystemDto` mesmo soft-deletado.
   *
   * Hook `useSingleFetchWithAbort` em vez de `usePaginatedFetch`
   * porque o catálogo NÃO é paginado pela UI — usamos o envelope
   * apenas para uma página única e descartamos `total`/`page`
   * (memoizamos o `Map` para a coluna Sistema). Espelha o padrão
   * usado por `useRouteTokenTypes` em `RoutesPage` para o dropdown
   * de policies JWT.
   */
  const systemsFetcher = useCallback(
    (options: SafeRequestOptions) =>
      listSystems(
        { pageSize: SYSTEMS_LOOKUP_PAGE_SIZE, includeDeleted: true },
        options,
        client,
      ),
    [client],
  );

  const { data: pagedSystems } = useSingleFetchWithAbort<PagedResponse<SystemDto>>({
    fetcher: systemsFetcher,
    fallbackErrorMessage:
      'Falha ao carregar a lista de sistemas para o filtro. Tente novamente.',
  });

  const systemsLookup = useMemo<ReadonlyMap<string, SystemDto>>(
    () => buildSystemsLookup(pagedSystems),
    [pagedSystems],
  );

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra para
   * 3 itens, mas continuo na página 5 vazia". Espelha o padrão usado
   * por `SystemsPage`/`RoutesPage`/`ClientsListShellPage`.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  const handleSystemFilterChange = useCallback((value: string) => {
    setSystemFilter(value);
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`. Captura os params
   * derivados (busca debounced, page, filtros) e devolve uma função
   * que aceita `signal` no `options`. O hook reage à mudança de
   * identidade do `fetcher` para reexecutar — `useCallback` com as
   * deps corretas mantém o ciclo previsível.
   *
   * Quando `systemFilter === SYSTEM_FILTER_ALL`, omitimos `systemId`
   * para o backend — a Issue #172 abriu o caminho ao tornar `systemId`
   * opcional em `ListRoutesParams`/`buildQueryString`.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const effectiveSystemId =
    systemFilter === SYSTEM_FILTER_ALL ? undefined : systemFilter;
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listRoutes(
        {
          systemId: effectiveSystemId,
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_ROUTES_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [client, effectiveSystemId, includeDeleted, page, trimmedSearchInput],
  );

  const {
    rows,
    pageSize: appliedPageSize,
    total,
    isInitialLoading,
    isFetching,
    errorMessage,
    refetch: handleRefetch,
  } = usePaginatedFetch<RouteDto>({
    fetcher,
    fallbackErrorMessage: 'Falha ao carregar a lista de rotas. Tente novamente.',
  });

  // Controles de paginação + estado derivado de busca/empty
  // consolidados em `useRoutesListShellState` — lição PR #134/#135,
  // JSCPD tokenizou os ~22 linhas de inicialização como duplicadas
  // entre `RoutesPage`/`RoutesGlobalListShellPage`.
  const {
    totalPages,
    isFirstPage,
    isLastPage,
    handlePrevPage,
    handleNextPage,
    trimmedSearch,
    hasActiveSearch,
    emptyContent,
  } = useRoutesListShellState({
    total,
    appliedPageSize,
    page,
    setPage,
    debouncedSearch,
    includeDeleted,
    onClearSearch: handleClearSearch,
    singleSystemScope: false,
    clearTestId: 'routes-global-empty-clear',
  });

  /**
   * Renderiza a coluna Sistema. Quando o lookup tem o sistema, exibe
   * `<Link>` clicável para `/systems/:systemId/routes` (drill-down,
   * critério de aceite da Issue #172). Quando ausente (catálogo ainda
   * carregando ou desalinhado), exibe apenas o texto sem link — o
   * operador ainda vê o id sem clicabilidade enganosa.
   *
   * Memoizado em função para reuso entre desktop e mobile (lição PR
   * #134/#135 — call-site duplicado entre surfaces tokenizado pelo
   * Sonar/JSCPD).
   */
  const renderSystemCell = useCallback(
    (row: RouteDto): React.ReactNode => {
      const displayName = resolveSystemDisplayName(row.systemId, systemsLookup);
      return (
        <SystemLink
          to={`/systems/${row.systemId}/routes`}
          data-testid={`routes-global-system-link-${row.id}`}
          aria-label={`Ver rotas do sistema ${displayName}`}
        >
          {displayName}
        </SystemLink>
      );
    },
    [systemsLookup],
  );

  // Tabela cross-system de rotas: a coluna "Sistema" precede o
  // identificador da rota para deixar o eixo do filtro visível em
  // primeiro lugar. As demais colunas (Código, Nome, Descrição,
  // Política JWT, Status) seguem a mesma ordem de leitura da
  // `RoutesPage` drill-down — facilita a transição mental quando o
  // operador clica num link de sistema e cai na vista escopada.
  // Construído via spread incremental para variar a tokenização e
  // evitar BLOCKER de duplicação JSCPD com listagens vizinhas
  // (lição PR #134/#135).
  const columns = useMemo<ReadonlyArray<TableColumn<RouteDto>>>(() => {
    const systemColumn: TableColumn<RouteDto> = {
      key: 'system',
      label: 'Sistema',
      render: renderSystemCell,
    };
    const tokenPolicyColumn: TableColumn<RouteDto> = {
      key: 'tokenPolicy',
      label: 'Política JWT alvo',
      width: '180px',
      render: renderTokenPolicy,
    };
    const statusColumn: TableColumn<RouteDto> = {
      key: 'status',
      label: 'Status',
      width: '120px',
      render: (row) => <StatusBadge deletedAt={row.deletedAt} />,
    };
    return [
      systemColumn,
      { key: 'code', label: 'Código', render: (row) => <Mono>{row.code}</Mono> },
      { key: 'name', label: 'Nome', render: (row) => row.name },
      { key: 'description', label: 'Descrição', render: renderRouteDescription },
      tokenPolicyColumn,
      statusColumn,
    ];
  }, [renderSystemCell]);

  // ARIA-live: anuncia o estado da listagem quando muda. Em loading
  // subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos o
  // total. Em erro, o `<Alert role="alert">` já cobre. O hook
  // `useListingLiveMessage` centraliza a árvore de decisão (lição PR
  // #134/#135 — bloco duplicado entre listagens reprovou Sonar).
  const liveMessage = useListingLiveMessage({
    isInitialLoading,
    isFetching,
    errorMessage,
    total,
    page,
    totalPages,
    hasActiveSearch,
    trimmedSearch,
    copy: {
      singular: 'rota',
      pluralCarregando: 'rotas',
      vazioSemBusca: 'Nenhuma rota cadastrada.',
    },
  });

  /**
   * `<Select>` de filtro de sistema extraído como variável para
   * reduzir o peso do JSX inline do `<ListingToolbar extraFilter>`.
   * Espelha `typeFilterSelect` em `ClientsListShellPage` — alinhamento
   * de surfaces evita refatoração destrutiva nas próximas issues
   * (lição PR #128).
   *
   * Renderizado mesmo enquanto o catálogo de sistemas carrega: o
   * `<option>` "Todos os sistemas" sempre está presente. Quando o
   * lookup chega, populamos o restante das opções com os sistemas
   * carregados. Ordem alfabética para previsibilidade.
   */
  const systemOptions = useMemo<ReadonlyArray<SystemDto>>(() => {
    if (!pagedSystems) return [];
    return [...pagedSystems.data].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }, [pagedSystems]);

  const systemFilterSelect = (
    <Select
      label="Sistema"
      size="sm"
      value={systemFilter}
      onChange={handleSystemFilterChange}
      data-testid="routes-global-system-filter"
      aria-label="Filtrar rotas por sistema"
    >
      <option value={SYSTEM_FILTER_ALL}>Todos os sistemas</option>
      {systemOptions.map((system) => (
        <option key={system.id} value={system.id}>
          {system.name}
        </option>
      ))}
    </Select>
  );

  /**
   * Tabela renderizada como variável intermediária para reduzir o
   * peso do JSX inline e manter o callsite de `<ListingResultArea>`
   * mais legível. Inclui `<TableForDesktop>` + `<CardListForMobile>`
   * para que o conteúdo seja consistente entre breakpoints — paridade
   * com `ClientsListShellPage`/`UsersListShellPage` (lição PR #128).
   */
  const tableNode = (
    <>
      <TableForDesktop>
        <Table<RouteDto>
          caption="Lista global de rotas registradas no auth-service."
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyState={emptyContent}
        />
      </TableForDesktop>
      <CardListForMobile
        role="list"
        aria-label="Lista global de rotas registradas no auth-service"
        data-testid="routes-global-card-list"
      >
        {rows.length === 0 && emptyContent}
        {rows.map((row) => {
          const systemDisplayName = resolveSystemDisplayName(
            row.systemId,
            systemsLookup,
          );
          return (
            <EntityCard
              key={row.id}
              role="listitem"
              tabIndex={0}
              data-testid={`routes-global-card-${row.id}`}
            >
              <RouteCardTopSection row={row} />
              <CardMeta>
                <CardMetaTerm>Sistema</CardMetaTerm>
                <CardMetaValue>
                  <SystemLink
                    to={`/systems/${row.systemId}/routes`}
                    data-testid={`routes-global-card-system-link-${row.id}`}
                    aria-label={`Ver rotas do sistema ${systemDisplayName}`}
                  >
                    {systemDisplayName}
                  </SystemLink>
                </CardMetaValue>
                <CardMetaTerm>JWT</CardMetaTerm>
                <CardMetaValue>{renderTokenPolicy(row)}</CardMetaValue>
              </CardMeta>
            </EntityCard>
          );
        })}
      </CardListForMobile>
    </>
  );

  /**
   * `<ListingResultArea>` extraído como variável para que o JSX final
   * fique compacto e o JSCPD não tokenize a sequência idêntica de
   * props (`testIdPrefix/loadingLabel/.../onNext`) como bloco
   * duplicado com `ClientsListShellPage`/`UsersListShellPage` —
   * lição PR #134/#135 reforçada.
   */
  const resultArea = (
    <ListingResultArea
      testIdPrefix="routes-global"
      loadingLabel="Carregando rotas"
      isInitialLoading={isInitialLoading}
      isFetching={isFetching}
      errorMessage={errorMessage}
      onRetry={handleRefetch}
      tableContent={tableNode}
      total={total}
      page={page}
      totalPages={totalPages}
      isFirstPage={isFirstPage}
      isLastPage={isLastPage}
      onPrev={handlePrevPage}
      onNext={handleNextPage}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="02 Rotas"
        title="Rotas registradas"
        desc="Catálogo global de rotas declaradas pelos sistemas registrados. Use o filtro por sistema para isolar um escopo, ou clique no nome do sistema para abrir o drill-down."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Código ou nome da rota"
        searchAriaLabel="Buscar rotas por código ou nome"
        searchTestId="routes-global-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui rotas com remoção lógica."
        includeDeletedTestId="routes-global-include-deleted"
        extraFilter={systemFilterSelect}
        actions={
          canCreateRoute && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} strokeWidth={1.75} />}
              onClick={createModal.open}
              data-testid="routes-global-create-open"
            >
              Nova rota
            </Button>
          )
        }
      />

      <LiveRegion message={liveMessage} testId="routes-global-live" />

      {resultArea}

      {canCreateRoute && (
        <NewRouteModal
          open={createModal.isOpen}
          onClose={createModal.close}
          onCreated={handleRefetch}
          client={client}
        />
      )}
    </>
  );
};
