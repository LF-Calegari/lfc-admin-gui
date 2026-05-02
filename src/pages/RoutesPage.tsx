import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { PageHeader } from "../components/layout/PageHeader";
import {
  Alert,
  Button,
  Table,
} from "../components/ui";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePaginatedFetch } from "../hooks/usePaginatedFetch";
import {
  DEFAULT_ROUTES_INCLUDE_DELETED,
  DEFAULT_ROUTES_PAGE,
  DEFAULT_ROUTES_PAGE_SIZE,
  listRoutes,
} from "../shared/api";
import { useAuth } from "../shared/auth";
import {
  BackLink,
  CardListForMobile,
  CardMeta,
  CardMetaTerm,
  CardMetaValue,
  EntityCard,
  ErrorRetryBlock,
  InitialLoadingSpinner,
  InvalidIdNotice,
  ListingToolbar,
  LiveRegion,
  Mono,
  PaginationFooter,
  RefetchOverlay,
  RowActions,
  StatusBadge,
  TableForDesktop,
  TableShell,
  useListingLiveMessage,
} from "../shared/listing";

import { DeleteRouteConfirm } from "./routes/DeleteRouteConfirm";
import { EditRouteModal } from "./routes/EditRouteModal";
import { NewRouteModal } from "./routes/NewRouteModal";
import {
  RouteCardTopSection,
  renderRouteDescription,
  renderTokenPolicy,
  useRoutesListShellState,
} from "./routes/routeRenderHelpers";

import type { TableColumn } from "../components/ui";
import type { ApiClient, RouteDto, SafeRequestOptions } from "../shared/api";

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms é
 * o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 request por caractere. Espelha o valor
 * usado pela `SystemsPage` — mantemos a constante local porque a página
 * é o único call site (extrair em módulo compartilhado só compensa
 * quando ≥ 2 páginas reusam, lição PR #128).
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Code de permissão exigido para o botão "Nova rota" (Issue #63).
 *
 * Espelha o `AUTH_V1_SYSTEMS_ROUTES_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (o `POST /systems/routes` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemsRoutesCreate)]`); o
 * gating client-side é apenas UX — esconder ações que o usuário não
 * pode executar.
 */
const ROUTES_CREATE_PERMISSION = "AUTH_V1_SYSTEMS_ROUTES_CREATE";

/**
 * Code de permissão exigido para o botão "Editar" por linha (Issue #64).
 *
 * Espelha o `AUTH_V1_SYSTEMS_ROUTES_UPDATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`PUT /systems/routes/{id}` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemsRoutesUpdate)]`); o
 * gating client-side é apenas UX — esconder ações que o usuário não
 * pode executar.
 */
const ROUTES_UPDATE_PERMISSION = "AUTH_V1_SYSTEMS_ROUTES_UPDATE";

/**
 * Code de permissão exigido para o botão "Desativar" por linha
 * (Issue #65, última sub-issue da EPIC #46).
 *
 * Espelha o `AUTH_V1_SYSTEMS_ROUTES_DELETE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`DELETE /systems/routes/{id}` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemsRoutesDelete)]`); o
 * gating client-side é apenas UX — esconder ações que o usuário não
 * pode executar.
 *
 * Sobre **soft vs hard delete**: o controller faz soft (seta
 * `DeletedAt = UtcNow` e responde 204). A copy do botão e do diálogo
 * usa "Desativar/Inativa" para manter paridade com Sistemas (#60).
 */
const ROUTES_DELETE_PERMISSION = "AUTH_V1_SYSTEMS_ROUTES_DELETE";

interface RoutesPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido — a
   * página usa o singleton `apiClient` por trás de `listRoutes`. Em
   * testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/* ─── Styled primitives ──────────────────────────────────── */

// Primitives genéricos (`BackLink`, `Toolbar`, `SearchSlot`,
// `TableShell`, `Overlay`, `EntityCard`, etc.) vivem em
// `src/shared/listing` desde a Issue #66 — Sonar tokeniza CSS-in-JS
// como blocos de texto e marca duplicação quando os mesmos templates
// literais aparecem em arquivos diferentes (lição PR #134/#135).
// Aqui ficam apenas os styled específicos do domínio "Routes". Hoje
// não há nenhum — o ex-`RouteCard` é o `EntityCard` compartilhado.

/* ─── Helpers ─────────────────────────────────────────────── */

// Nota: o cálculo de `totalPages` agora vive em `usePaginationControls`
// (lição PR #134 — bloco duplicado com `SystemsPage` reprovou o
// SonarCloud Quality Gate). A regra de três foi atingida implicitamente
// pelos testes do Sonar (2 listagens já é gatilho), e a centralização
// também prepara o terreno para as listagens das próximas issues.

/**
 * Heurística leve para descartar `:systemId` claramente inválido antes
 * de bater no backend — evita request desperdiçada e produz feedback
 * imediato ("ID inválido"). Aceita qualquer string não-vazia com pelo
 * menos um caractere não-whitespace, deixando a validação rigorosa
 * (UUID v4) a cargo do backend (que devolve 400). Não exigimos UUID
 * estrito aqui porque o frontend não deveria depender de detalhes do
 * formato de chave do banco — qualquer `string` no path basta para a
 * UI; o backend é a fonte de verdade.
 */
function isProbablyValidSystemId(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/* ─── Component ──────────────────────────────────────────── */

export const RoutesPage: React.FC<RoutesPageProps> = ({ client }) => {
  // `useParams` devolve `string | undefined` — nunca lançamos: rota
  // sem `:systemId` pinta o `InvalidIdNotice` no lugar da listagem.
  // A rota é declarada em `AppRoutes` com o param obrigatório, mas
  // defendemos o componente como reusável em testes que renderizem
  // direto sem MemoryRouter.
  const { systemId } = useParams<{ systemId: string }>();
  const hasValidSystemId = isProbablyValidSystemId(systemId);

  const { hasPermission } = useAuth();
  const canCreateRoute = hasPermission(ROUTES_CREATE_PERMISSION);
  const canUpdateRoute = hasPermission(ROUTES_UPDATE_PERMISSION);
  const canDeleteRoute = hasPermission(ROUTES_DELETE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_ROUTES_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_ROUTES_PAGE);

  // Estado de abertura do modal "Nova rota" (Issue #63). O modal é
  // controlado por essa página para que a Toolbar consiga ocultar o
  // botão por permissão sem perder o ciclo de vida do form.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // Rota selecionada para edição (Issue #64). Quando definida, abre o
  // `EditRouteModal` pré-populado com seus dados; `null` mantém o modal
  // fechado. Manter a rota completa (em vez de só o id) evita
  // round-trip extra para refazer fetch no modal — a tabela já tem o
  // payload pronto e ainda usamos `route.systemTokenTypeId`/
  // `systemTokenTypeName` para detectar token type inativo
  // referenciado.
  const [editingRoute, setEditingRoute] = useState<RouteDto | null>(null);

  // Rota selecionada para soft-delete (Issue #65). Quando definida, abre
  // o `DeleteRouteConfirm` com o `name`/`code` na descrição; `null`
  // mantém o modal fechado. Mesma estratégia do `editingRoute` — manter
  // o objeto completo permite ao diálogo exibir copy contextualizada
  // sem refetch.
  const [deletingRoute, setDeletingRoute] = useState<RouteDto | null>(null);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleOpenEditModal = useCallback((row: RouteDto) => {
    setEditingRoute(row);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditingRoute(null);
  }, []);

  const handleOpenDeleteConfirm = useCallback((row: RouteDto) => {
    setDeletingRoute(row);
  }, []);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeletingRoute(null);
  }, []);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra para
   * 3 itens, mas continuo na página 5 vazia". `page` é setado direto
   * pelos callbacks dos controles para manter o efeito previsível.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_ROUTES_PAGE);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`: capture os params
   * derivados e devolva uma função que aceita `signal` no `options`.
   * O hook reage a mudanças na identidade de `fetcher` para
   * reexecutar — `useCallback` com as deps corretas mantém o ciclo
   * previsível. Skipa montar params quando `:systemId` é inválido,
   * caso em que `usePaginatedFetch` recebe `skip: true` e nem chama
   * o `fetcher`.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listRoutes(
        {
          systemId: hasValidSystemId ? systemId : "",
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_ROUTES_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [
      client,
      hasValidSystemId,
      includeDeleted,
      page,
      systemId,
      trimmedSearchInput,
    ],
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
    fallbackErrorMessage:
      "Falha ao carregar a lista de rotas. Tente novamente.",
    skip: !hasValidSystemId,
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
    singleSystemScope: true,
    clearTestId: "routes-empty-clear",
  });

  const columns = useMemo<ReadonlyArray<TableColumn<RouteDto>>>(() => {
    const base: Array<TableColumn<RouteDto>> = [
      {
        key: "code",
        label: "Código",
        render: (row) => <Mono>{row.code}</Mono>,
      },
      {
        key: "description",
        label: "Descrição",
        render: renderRouteDescription,
      },
      {
        key: "tokenPolicy",
        label: "Política JWT alvo",
        width: "200px",
        render: renderTokenPolicy,
      },
      {
        key: "status",
        label: "Status",
        width: "120px",
        render: (row) => <StatusBadge deletedAt={row.deletedAt} />,
      },
    ];

    // Coluna "Ações" só aparece quando o usuário tem alguma ação
    // disponível. Hoje "Editar" (Issue #64) e "Desativar" (Issue #65);
    // a paridade total com Sistemas (restore, #61) fica para uma issue
    // futura quando a UI de "Restaurar rota" for priorizada. Cada botão
    // tem seu próprio gating individual + check por linha quando
    // aplicável (`row.deletedAt`).
    if (canUpdateRoute || canDeleteRoute) {
      base.push({
        key: "actions",
        label: "Ações",
        isActions: true,
        render: (row) => (
          <RowActions>
            {canUpdateRoute && row.deletedAt === null && (
              // "Editar" só faz sentido em rotas ativas. O backend
              // devolve 404 ao tentar PUT em rota soft-deletada, mas
              // esconder no UI é o caminho ergonômico (lê a coluna
              // Status como referência). Espelha a estratégia do
              // `SystemsPage`.
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenEditModal(row)}
                aria-label={`Editar rota ${row.name}`}
                data-testid={`routes-edit-${row.id}`}
              >
                Editar
              </Button>
            )}
            {canDeleteRoute && row.deletedAt === null && (
              // "Desativar" só aparece em rotas ativas — o backend
              // devolve 404 ao tentar DELETE em rota já soft-deletada
              // (`Routes.FirstOrDefaultAsync` cai no query filter
              // global), mas esconder no UI alinha com a coluna
              // Status. Espelha a estratégia do botão "Desativar" em
              // `SystemsPage`.
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenDeleteConfirm(row)}
                aria-label={`Desativar rota ${row.name}`}
                data-testid={`routes-delete-${row.id}`}
              >
                Desativar
              </Button>
            )}
          </RowActions>
        ),
      });
    }

    return base;
  }, [
    canDeleteRoute,
    canUpdateRoute,
    handleOpenDeleteConfirm,
    handleOpenEditModal,
  ]);

  const showOverlay = isFetching && !isInitialLoading;

  // ARIA-live: anuncia o estado da listagem quando muda. Em loading
  // subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos o
  // total. Em erro, o `<Alert role="alert">` já cobre. O hook
  // `useListingLiveMessage` centraliza a árvore de decisão (lição
  // PR #134/#135 — bloco duplicado entre listagens reprovou Sonar).
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
      singular: "rota",
      pluralCarregando: "rotas",
      vazioSemBusca: "Nenhuma rota cadastrada para este sistema.",
    },
  });

  if (!hasValidSystemId) {
    return (
      <>
        <BackLink to="/systems" data-testid="routes-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Sistemas
        </BackLink>
        <PageHeader
          eyebrow="02 Rotas"
          title="Rotas registradas"
          desc="Selecione um sistema para visualizar suas rotas."
        />
        <InvalidIdNotice data-testid="routes-invalid-id">
          <Alert variant="warning">
            ID de sistema ausente ou inválido na URL. Volte para a listagem de
            sistemas e selecione um sistema para visualizar suas rotas.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return (
    <>
      <BackLink to="/systems" data-testid="routes-back">
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para Sistemas
      </BackLink>
      <PageHeader
        eyebrow="02 Rotas"
        title="Rotas do sistema"
        desc="Endpoints registrados pelo sistema selecionado. Cada rota possui código, descrição e política JWT alvo."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Código da rota"
        searchAriaLabel="Buscar rotas por código"
        searchTestId="routes-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui rotas com remoção lógica."
        includeDeletedTestId="routes-include-deleted"
        actions={
          canCreateRoute && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} strokeWidth={1.75} />}
              onClick={handleOpenCreateModal}
              data-testid="routes-create-open"
            >
              Nova rota
            </Button>
          )
        }
      />

      <LiveRegion message={liveMessage} testId="routes-live" />

      {isInitialLoading && (
        <InitialLoadingSpinner testId="routes-loading" label="Carregando rotas" />
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={handleRefetch}
          retryTestId="routes-retry"
        />
      )}

      {!isInitialLoading && !errorMessage && (
        <TableShell>
          <TableForDesktop>
            <Table<RouteDto>
              caption="Lista de rotas do sistema selecionado."
              columns={columns}
              data={rows}
              getRowKey={(row) => row.id}
              emptyState={emptyContent}
            />
          </TableForDesktop>
          <CardListForMobile
            role="list"
            aria-label="Lista de rotas do sistema selecionado"
            data-testid="routes-card-list"
          >
            {rows.length === 0 && emptyContent}
            {rows.map((row) => (
              <EntityCard
                key={row.id}
                role="listitem"
                tabIndex={0}
                data-testid={`routes-card-${row.id}`}
              >
                <RouteCardTopSection row={row} />
                <CardMeta>
                  <CardMetaTerm>JWT</CardMetaTerm>
                  <CardMetaValue>{renderTokenPolicy(row)}</CardMetaValue>
                </CardMeta>
                {(canUpdateRoute || canDeleteRoute) &&
                  row.deletedAt === null && (
                    // Ações na versão mobile espelham a coluna "Ações" do
                    // desktop. Só aparecem quando o usuário tem permissão
                    // e a linha é ativa — coerente com o gating da tabela.
                    <RowActions>
                      {canUpdateRoute && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil size={14} strokeWidth={1.5} />}
                          onClick={() => handleOpenEditModal(row)}
                          aria-label={`Editar rota ${row.name}`}
                          data-testid={`routes-card-edit-${row.id}`}
                        >
                          Editar
                        </Button>
                      )}
                      {canDeleteRoute && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={14} strokeWidth={1.5} />}
                          onClick={() => handleOpenDeleteConfirm(row)}
                          aria-label={`Desativar rota ${row.name}`}
                          data-testid={`routes-card-delete-${row.id}`}
                        >
                          Desativar
                        </Button>
                      )}
                    </RowActions>
                  )}
              </EntityCard>
            ))}
          </CardListForMobile>
          {showOverlay && <RefetchOverlay testId="routes-overlay" />}
        </TableShell>
      )}

      {!isInitialLoading && !errorMessage && total > 0 && (
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          total={total}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          pageInfoTestId="routes-page-info"
          prevTestId="routes-prev"
          nextTestId="routes-next"
        />
      )}

      {canCreateRoute && hasValidSystemId && (
        <NewRouteModal
          open={isCreateModalOpen}
          systemId={systemId}
          onClose={handleCloseCreateModal}
          onCreated={handleRefetch}
          client={client}
        />
      )}

      {canUpdateRoute && (
        <EditRouteModal
          open={editingRoute !== null}
          route={editingRoute}
          onClose={handleCloseEditModal}
          onUpdated={handleRefetch}
          client={client}
        />
      )}

      {canDeleteRoute && (
        <DeleteRouteConfirm
          open={deletingRoute !== null}
          route={deletingRoute}
          onClose={handleCloseDeleteConfirm}
          onDeleted={handleRefetch}
          client={client}
        />
      )}
    </>
  );
};
