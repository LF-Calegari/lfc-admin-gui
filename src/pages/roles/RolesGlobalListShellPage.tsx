import { ChevronRight } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Select, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { usePaginationControls } from '../../hooks/usePaginationControls';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import {
  DEFAULT_ROLES_INCLUDE_DELETED,
  DEFAULT_ROLES_PAGE,
  DEFAULT_ROLES_PAGE_SIZE,
  listRoles,
  listSystems,
  MAX_ROLES_PAGE_SIZE,
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
  Placeholder,
  RoleCardHeader,
  RowActions,
  StatusBadge,
  TableForDesktop,
  useListingEmptyContent,
  useListingLiveMessage,
} from '../../shared/listing';

import {
  renderRoleDescription as renderDescription,
  renderRoleCount as renderCount,
} from './rolesRenderHelpers';

import type { TableColumn } from '../../components/ui';
import type {
  ApiClient,
  PagedResponse,
  RoleDto,
  SafeRequestOptions,
  SystemDto,
} from '../../shared/api';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300ms é
 * o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 request por caractere. Espelha o valor
 * usado pelas demais listagens.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Valor sentinel usado pelo `<Select>` de filtro de sistema para
 * representar "todos" (sem filtro). Mantido fora dos UUIDs reais para
 * que a comparação no callback continue restrita ao conjunto válido.
 * Quando detectado, omitimos `systemId` da request — espelha a
 * estratégia de `TYPE_FILTER_ALL` em `ClientsListShellPage`.
 */
const SYSTEM_FILTER_ALL = 'ALL' as const;

/**
 * Mensagem genérica de fallback quando o fetch da lista de roles falha
 * sem `ApiError` reconhecido. Centralizada para reuso entre os
 * call-sites do hook (lista principal + dropdown de sistemas).
 */
const ROLES_LIST_FALLBACK_ERROR =
  'Falha ao carregar a lista de roles. Tente novamente.';

interface RolesGlobalListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido —
   * a página usa o singleton `apiClient` por trás de
   * `listRoles`/`listSystems`. Em testes, o caller passa um stub
   * tipado.
   */
  client?: ApiClient;
}

/**
 * Constrói um lookup `systemId -> SystemDto` para denormalizar a
 * coluna "Sistema" na tabela. Em casos excepcionais (sistema
 * soft-deletado e não retornado pelo dropdown padrão), a UI cai no
 * código curto via `Mono` para preservar a referência em vez de
 * "exibir nada".
 */
function buildSystemLookup(
  systems: ReadonlyArray<SystemDto> | null,
): ReadonlyMap<string, SystemDto> {
  if (!systems) return new Map();
  return new Map(systems.map((system) => [system.id, system]));
}

/**
 * Página-shell da listagem **global** de roles cross-system
 * (`/roles`). Substitui o `PlaceholderPage` original (Issue #173)
 * por uma listagem real consumindo `GET /api/v1/roles` paginado
 * server-side (após `lfc-authenticator#163`/`#164`).
 *
 * Segue o padrão de `ClientsListShellPage` (filtro adicional via
 * `<Select>`, mobile cards, ListingResultArea genérico) — diferenças:
 *
 * - Filtro extra é `systemId` (dropdown carregado de `listSystems`),
 *   não `type`.
 * - Cada linha "drilla" para `/systems/:systemId/roles` (escopo do
 *   CRUD) — não há criação/edição inline; isso fica deferido para a
 *   página por-sistema (`RolesPage`).
 * - Coluna "Sistema" denormaliza o `row.systemId` para o nome do
 *   sistema dono.
 *
 * Visível com `Roles.Read` (`AUTH_V1_ROLES_LIST`); o gating
 * declarativo está em `src/routes/index.tsx` via `<RequirePermission>`.
 */
export const RolesGlobalListShellPage: React.FC<
  RolesGlobalListShellPageProps
> = ({ client }) => {
  const navigate = useNavigate();
  // `useAuth` é mantido aqui para que evoluções futuras (botão "Nova
  // role" gateado por `Roles.Create` ou ações inline gateadas por
  // `Roles.Update`) reutilizem o gating sem refatoração — o gating
  // de leitura já vive em `<RequirePermission>` no router.
  useAuth();

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Filtro de sistema (UUID ou 'ALL'). 'ALL' é o sentinel — quando
  // ativo, omitimos o param da request e o backend devolve roles de
  // todos os sistemas.
  const [systemFilter, setSystemFilter] = useState<string>(SYSTEM_FILTER_ALL);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_ROLES_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_ROLES_PAGE);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra
   * para 3 itens, mas continuo na página 5 vazia". Espelha
   * `ClientsListShellPage`/`SystemsPage`.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleSystemFilterChange = useCallback((value: string) => {
    setSystemFilter(value && value.length > 0 ? value : SYSTEM_FILTER_ALL);
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  /**
   * Carrega a lista de sistemas para popular o `<Select>` de filtro e
   * para denormalizar a coluna "Sistema" na tabela. `pageSize` máximo
   * espelha `MAX_ROLES_PAGE_SIZE` (100) — quando o catálogo crescer
   * além disso, a issue pede revisitar (mesmo TODO de `UserRolesShellPage`).
   *
   * `useSingleFetchWithAbort` cuida do AbortController e do retry
   * bumper. O fetch é independente do refetch da listagem principal
   * — o dropdown não recarrega quando o usuário busca/pagina roles.
   */
  const systemsFetcher = useCallback(
    (options: SafeRequestOptions): Promise<PagedResponse<SystemDto>> =>
      listSystems({ pageSize: MAX_ROLES_PAGE_SIZE }, options, client),
    [client],
  );

  const { data: systemsResponse } = useSingleFetchWithAbort<
    PagedResponse<SystemDto>
  >({
    fetcher: systemsFetcher,
    fallbackErrorMessage:
      'Falha ao carregar a lista de sistemas para o filtro.',
  });

  const systemsList = systemsResponse?.data ?? null;
  const systemLookup = useMemo(
    () => buildSystemLookup(systemsList),
    [systemsList],
  );

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`. Captura os params
   * derivados (busca debounced, page, filtros) e devolve uma função
   * que aceita `signal` no `options`. Reage a mudança de identidade
   * para reexecutar — `useCallback` com as deps corretas mantém o
   * ciclo previsível.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const effectiveSystemId =
    systemFilter === SYSTEM_FILTER_ALL ? undefined : systemFilter;
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listRoles(
        {
          systemId: effectiveSystemId,
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_ROLES_PAGE_SIZE,
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
  } = usePaginatedFetch<RoleDto>({
    fetcher,
    fallbackErrorMessage: ROLES_LIST_FALLBACK_ERROR,
  });

  const {
    totalPages,
    isFirstPage,
    isLastPage,
    handlePrevPage,
    handleNextPage,
  } = usePaginationControls({
    total,
    appliedPageSize,
    defaultPageSize: DEFAULT_ROLES_PAGE_SIZE,
    page,
    setPage,
  });

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * `emptyContent` delegado ao hook compartilhado `useListingEmptyContent`
   * para evitar duplicação JSCPD/Sonar com `RolesPage` per-system
   * (lição PR #134/#135 — bloco de 26 linhas com `useMemo` + árvore
   * de decisão `<EmptyMessage>` + `<Button>` se repetia idêntico).
   */
  const emptyContent = useListingEmptyContent({
    trimmedSearch,
    includeDeleted,
    onClearSearch: handleClearSearch,
    copy: {
      searchPrefix: 'Nenhuma role encontrada para',
      emptyTitle: 'Nenhuma role cadastrada.',
      hintWhenIncludeDeletedOff:
        'Roles removidas podem ser visualizadas ativando "Mostrar inativas".',
      clearTestId: 'roles-global-empty-clear',
    },
  });

  /**
   * Renderiza o conteúdo da coluna "Sistema": prioriza o nome do
   * sistema dono (lookup pelo `systemId`); fallback para o `code` ou
   * o id curto quando o sistema não está no dropdown (ex.: sistema
   * soft-deletado fora do top-100). Roles legadas com `systemId
   * === null` exibem placeholder "—".
   */
  const renderSystemCell = useCallback(
    (row: RoleDto): React.ReactNode => {
      if (row.systemId === null || row.systemId.length === 0) {
        return <Placeholder>—</Placeholder>;
      }
      const system = systemLookup.get(row.systemId);
      if (system) {
        return system.name;
      }
      // Sistema fora do top-100 ou soft-deletado: cai no id como
      // referência mínima — o admin ainda consegue cruzar a info
      // manualmente na URL drill-down.
      return <Mono>{row.systemId.slice(0, 8)}</Mono>;
    },
    [systemLookup],
  );

  /**
   * Navega para a tela de roles do sistema dono (drill-down). Roles
   * sem `systemId` válido não navegam — a coluna fica como placeholder
   * e a ação fica inativa. Imperativo via `useNavigate` porque os
   * cliques acontecem dentro de `<Button>` (o design system não
   * suporta polimorfismo `as`-prop hoje).
   */
  const handleOpenSystemRoles = useCallback(
    (row: RoleDto) => {
      if (row.systemId === null || row.systemId.length === 0) return;
      navigate(`/systems/${row.systemId}/roles`);
    },
    [navigate],
  );

  const columns = useMemo<ReadonlyArray<TableColumn<RoleDto>>>(
    () => [
      {
        key: 'system',
        label: 'Sistema',
        render: renderSystemCell,
      },
      {
        key: 'code',
        label: 'Código',
        render: (row) => <Mono>{row.code}</Mono>,
      },
      {
        key: 'name',
        label: 'Nome',
        render: (row) => row.name,
      },
      {
        key: 'description',
        label: 'Descrição',
        render: renderDescription,
      },
      {
        key: 'permissionsCount',
        label: 'Permissões',
        width: '120px',
        render: (row) => renderCount(row.permissionsCount),
      },
      {
        key: 'usersCount',
        label: 'Usuários',
        width: '110px',
        render: (row) => renderCount(row.usersCount),
      },
      {
        key: 'status',
        label: 'Status',
        width: '110px',
        render: (row) => <StatusBadge deletedAt={row.deletedAt} />,
      },
      {
        key: 'actions',
        label: 'Ações',
        isActions: true,
        render: (row) => (
          <RowActions>
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronRight size={14} strokeWidth={1.5} />}
              onClick={() => handleOpenSystemRoles(row)}
              aria-label={`Abrir roles do sistema da role ${row.name}`}
              data-testid={`roles-global-open-${row.id}`}
              disabled={row.systemId === null || row.systemId.length === 0}
            >
              Abrir
            </Button>
          </RowActions>
        ),
      },
    ],
    [handleOpenSystemRoles, renderSystemCell],
  );

  /**
   * ARIA-live: anuncia o estado da listagem quando muda. Em loading
   * subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos
   * o total. Em erro, o `<Alert role="alert">` já cobre.
   */
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
      singular: 'role',
      pluralCarregando: 'roles',
      vazioSemBusca: 'Nenhuma role cadastrada.',
    },
  });

  /**
   * Conteúdo da tabela renderizado como variável intermediária
   * (desktop + mobile cards). Mantém o callsite de `<ListingResultArea>`
   * compacto — espelha o padrão de `ClientsListShellPage`.
   */
  const tableNode = (
    <>
      <TableForDesktop>
        <Table<RoleDto>
          caption="Lista global de roles cadastradas no auth-service."
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyState={emptyContent}
        />
      </TableForDesktop>
      <CardListForMobile
        role="list"
        aria-label="Lista global de roles cadastradas no auth-service"
        data-testid="roles-global-card-list"
      >
        {rows.length === 0 && emptyContent}
        {rows.map((row) => (
          <EntityCard
            key={row.id}
            role="listitem"
            tabIndex={0}
            data-testid={`roles-global-card-${row.id}`}
          >
            <RoleCardHeader
              code={row.code}
              name={row.name}
              description={row.description}
              deletedAt={row.deletedAt}
            />
            <CardMeta>
              <CardMetaTerm>Sistema</CardMetaTerm>
              <CardMetaValue>{renderSystemCell(row)}</CardMetaValue>
              <CardMetaTerm>Permissões</CardMetaTerm>
              <CardMetaValue>{renderCount(row.permissionsCount)}</CardMetaValue>
              <CardMetaTerm>Usuários</CardMetaTerm>
              <CardMetaValue>{renderCount(row.usersCount)}</CardMetaValue>
            </CardMeta>
            <RowActions>
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronRight size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenSystemRoles(row)}
                aria-label={`Abrir roles do sistema da role ${row.name}`}
                data-testid={`roles-global-card-open-${row.id}`}
                disabled={row.systemId === null || row.systemId.length === 0}
              >
                Abrir
              </Button>
            </RowActions>
          </EntityCard>
        ))}
      </CardListForMobile>
    </>
  );

  /**
   * `<Select>` de filtro de sistema extraído como variável local para
   * reduzir o peso do JSX inline do `<ListingToolbar extraFilter={...}>`
   * — mesmo padrão de `ClientsListShellPage` (`typeFilterSelect`).
   *
   * Itens do dropdown vêm da request paralela `listSystems`. Enquanto
   * a request não completa, exibimos só a opção "Todos" — a UI
   * permanece funcional (filtro = ALL = sem filtro), e adicionamos as
   * opções assim que o fetch resolve.
   */
  const systemFilterSelect = (
    <Select
      label="Sistema"
      size="sm"
      value={systemFilter}
      onChange={handleSystemFilterChange}
      data-testid="roles-global-system-filter"
      aria-label="Filtrar roles por sistema"
    >
      <option value={SYSTEM_FILTER_ALL}>Todos os sistemas</option>
      {systemsList?.map((system) => (
        <option key={system.id} value={system.id}>
          {system.name}
        </option>
      ))}
    </Select>
  );

  return (
    <>
      <PageHeader
        eyebrow="03 Roles"
        title="Roles cadastradas"
        desc="Catálogo global de roles do ecossistema. Cada role pertence a um sistema e expõe nome, descrição e contagem de permissões/usuários. Use o filtro por sistema ou abra a role para gerenciá-la no contexto do sistema dono."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Nome ou código da role"
        searchAriaLabel="Buscar roles por nome ou código"
        searchTestId="roles-global-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui roles com remoção lógica."
        includeDeletedTestId="roles-global-include-deleted"
        extraFilter={systemFilterSelect}
      />

      <LiveRegion message={liveMessage} testId="roles-global-live" />

      <ListingResultArea
        testIdPrefix="roles-global"
        loadingLabel="Carregando roles"
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
    </>
  );
};
