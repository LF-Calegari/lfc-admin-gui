import { ArrowLeft, Pencil } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { PageHeader } from "../components/layout/PageHeader";
import { Alert, Button, Table } from "../components/ui";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePaginatedFetch } from "../hooks/usePaginatedFetch";
import { usePaginationControls } from "../hooks/usePaginationControls";
import {
  DEFAULT_ROLES_INCLUDE_DELETED,
  DEFAULT_ROLES_PAGE,
  DEFAULT_ROLES_PAGE_SIZE,
  listRoles,
} from "../shared/api";
import { useAuth } from "../shared/auth";
import {
  BackLink,
  CardCode,
  CardDescription,
  CardHeader,
  CardListForMobile,
  CardMeta,
  CardMetaTerm,
  CardMetaValue,
  CardName,
  DescriptionCell,
  EmptyHint,
  EmptyMessage,
  EmptyTitle,
  EntityCard,
  ErrorRetryBlock,
  InitialLoadingSpinner,
  InvalidIdNotice,
  ListingToolbar,
  LiveRegion,
  Mono,
  PaginationFooter,
  Placeholder,
  RefetchOverlay,
  RowActions,
  StatusBadge,
  TableForDesktop,
  TableShell,
  useListingLiveMessage,
} from "../shared/listing";

import { EditRoleModal } from "./roles/EditRoleModal";

import type { TableColumn } from "../components/ui";
import type { ApiClient, RoleDto, SafeRequestOptions } from "../shared/api";

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms é
 * o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 request por caractere. Espelha o valor
 * usado pela `RoutesPage`/`SystemsPage`.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Code de permissão exigido para o botão "Editar" por linha (Issue
 * #68). Espelha o `AUTH_V1_ROLES_UPDATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`PUT /roles/{id}` valida via
 * `[Authorize(Policy = PermissionPolicies.RolesUpdate)]`); o gating
 * client-side é apenas UX — esconder ações que o usuário não pode
 * executar.
 */
const ROLES_UPDATE_PERMISSION = "AUTH_V1_ROLES_UPDATE";

interface RolesPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido — a
   * página usa o singleton `apiClient` por trás de `listRoles`. Em
   * testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/**
 * Heurística leve para descartar `:systemId` claramente inválido antes
 * de bater no backend — evita request desperdiçada e produz feedback
 * imediato ("ID inválido"). Aceita qualquer string não-vazia com pelo
 * menos um caractere não-whitespace, deixando a validação rigorosa
 * (UUID v4) a cargo do backend. Espelha `RoutesPage` (lição PR #128 —
 * shared helpers desde o primeiro PR do recurso).
 */
function isProbablyValidSystemId(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Renderiza a célula de descrição truncando textos longos via
 * `text-overflow: ellipsis`. **Hoje** o backend não devolve
 * `description` em `RoleResponse` (TODO no model `AppRole` — ver
 * `src/shared/api/roles.ts`), então a coluna tipicamente exibe "—".
 * Quando o backend evoluir, a UI mostra automaticamente sem mudar
 * código.
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile —
 * centralizar evita duplicação visual.
 */
function renderDescription(row: RoleDto): React.ReactNode {
  if (
    row.description === null ||
    row.description === undefined ||
    row.description.trim().length === 0
  ) {
    return <Placeholder>—</Placeholder>;
  }
  return (
    <DescriptionCell title={row.description}>{row.description}</DescriptionCell>
  );
}

/**
 * Renderiza a contagem de permissões/usuários da role. **Hoje** o
 * backend não devolve esses campos (TODO documentado no DTO); a UI
 * exibe "—" enquanto o valor for `null`/`undefined`. Quando o
 * backend ganhar `permissionsCount`/`usersCount`, a UI passa a
 * exibir o número formatado sem mudar a página.
 *
 * Centralizado em função pura para reuso entre tabela desktop e
 * cards mobile.
 */
function renderCount(value: number | null | undefined): React.ReactNode {
  if (typeof value !== "number") {
    return <Placeholder>—</Placeholder>;
  }
  return <Mono>{value}</Mono>;
}

export const RolesPage: React.FC<RolesPageProps> = ({ client }) => {
  // `useParams` devolve `string | undefined` — nunca lançamos: rota
  // sem `:systemId` pinta o `InvalidIdNotice` no lugar da listagem.
  const { systemId } = useParams<{ systemId: string }>();
  const hasValidSystemId = isProbablyValidSystemId(systemId);

  const { hasPermission } = useAuth();
  const canUpdateRole = hasPermission(ROLES_UPDATE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_ROLES_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_ROLES_PAGE);

  // Role selecionada para edição (Issue #68). Quando definida, abre
  // o `EditRoleModal` pré-populado com seus dados; `null` mantém o
  // modal fechado. Manter a role completa (em vez de só o id) evita
  // round-trip extra para refazer fetch no modal — a tabela já tem
  // o payload pronto.
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra para
   * 3 itens, mas continuo na página 5 vazia". Espelha `RoutesPage`.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_ROLES_PAGE);
  }, []);

  const handleOpenEditModal = useCallback((row: RoleDto) => {
    setEditingRole(row);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditingRole(null);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`: capture os params
   * derivados e devolva uma função que aceita `signal` no `options`.
   * Skipa montar params quando `:systemId` é inválido — o hook
   * recebe `skip: true` e nem chama o `fetcher`.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listRoles(
        {
          systemId: hasValidSystemId ? systemId : "",
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_ROLES_PAGE_SIZE,
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
  } = usePaginatedFetch<RoleDto>({
    fetcher,
    fallbackErrorMessage:
      "Falha ao carregar a lista de roles. Tente novamente.",
    skip: !hasValidSystemId,
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
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio sem busca → "nenhuma role cadastrada" + dica sobre o toggle
   *   "Mostrar inativas" caso esteja desligado.
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhuma role encontrada para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="roles-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhuma role cadastrada para este sistema.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Roles removidas podem ser visualizadas ativando &quot;Mostrar
            inativas&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<RoleDto>>>(() => {
    const base: Array<TableColumn<RoleDto>> = [
      {
        key: "name",
        label: "Nome",
        render: (row) => row.name,
      },
      {
        key: "description",
        label: "Descrição",
        render: renderDescription,
      },
      {
        key: "permissionsCount",
        label: "Permissões",
        width: "140px",
        render: (row) => renderCount(row.permissionsCount),
      },
      {
        key: "usersCount",
        label: "Usuários",
        width: "120px",
        render: (row) => renderCount(row.usersCount),
      },
      {
        key: "status",
        label: "Status",
        width: "120px",
        render: (row) => <StatusBadge deletedAt={row.deletedAt} />,
      },
    ];

    // Coluna "Ações" só aparece quando o usuário tem alguma ação
    // disponível. Hoje "Editar" (Issue #68); a paridade total com
    // Sistemas/Rotas (criar via toolbar, desativar/restaurar) fica
    // para issues futuras da EPIC #47. Espelha a estratégia do
    // `RoutesPage`/`SystemsPage`.
    if (canUpdateRole) {
      base.push({
        key: "actions",
        label: "Ações",
        isActions: true,
        render: (row) => (
          <RowActions>
            {row.deletedAt === null && (
              // "Editar" só faz sentido em roles ativas. O backend
              // devolve 404 ao tentar PUT em role soft-deletada
              // (`Roles.FirstOrDefaultAsync` cai no query filter
              // global), mas esconder no UI alinha com a coluna
              // Status. Espelha a estratégia de `RoutesPage`/
              // `SystemsPage`.
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenEditModal(row)}
                aria-label={`Editar role ${row.name}`}
                data-testid={`roles-edit-${row.id}`}
              >
                Editar
              </Button>
            )}
          </RowActions>
        ),
      });
    }

    return base;
  }, [canUpdateRole, handleOpenEditModal]);

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
      singular: "role",
      pluralCarregando: "roles",
      vazioSemBusca: "Nenhuma role cadastrada para este sistema.",
    },
  });

  if (!hasValidSystemId) {
    return (
      <>
        <BackLink to="/systems" data-testid="roles-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Sistemas
        </BackLink>
        <PageHeader
          eyebrow="03 Roles"
          title="Roles do sistema"
          desc="Selecione um sistema para visualizar suas roles."
        />
        <InvalidIdNotice data-testid="roles-invalid-id">
          <Alert variant="warning">
            ID de sistema ausente ou inválido na URL. Volte para a listagem de
            sistemas e selecione um sistema para visualizar suas roles.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return (
    <>
      <BackLink to="/systems" data-testid="roles-back">
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para Sistemas
      </BackLink>
      <PageHeader
        eyebrow="03 Roles"
        title="Roles do sistema"
        desc="Roles agrupam permissões e podem ser atribuídas a usuários do sistema selecionado. Cada role expõe nome, descrição e contagem de permissões/usuários."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Nome ou código da role"
        searchAriaLabel="Buscar roles por nome ou código"
        searchTestId="roles-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui roles com remoção lógica."
        includeDeletedTestId="roles-include-deleted"
      />

      <LiveRegion message={liveMessage} testId="roles-live" />

      {isInitialLoading && (
        <InitialLoadingSpinner
          testId="roles-loading"
          label="Carregando roles"
        />
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={handleRefetch}
          retryTestId="roles-retry"
        />
      )}

      {!isInitialLoading && !errorMessage && (
        <TableShell>
          <TableForDesktop>
            <Table<RoleDto>
              caption="Lista de roles do sistema selecionado."
              columns={columns}
              data={rows}
              getRowKey={(row) => row.id}
              emptyState={emptyContent}
            />
          </TableForDesktop>
          <CardListForMobile
            role="list"
            aria-label="Lista de roles do sistema selecionado"
            data-testid="roles-card-list"
          >
            {rows.length === 0 && emptyContent}
            {rows.map((row) => (
              <EntityCard
                key={row.id}
                role="listitem"
                tabIndex={0}
                data-testid={`roles-card-${row.id}`}
              >
                <CardHeader>
                  <CardCode>{row.code}</CardCode>
                  <StatusBadge deletedAt={row.deletedAt} />
                </CardHeader>
                <CardName>{row.name}</CardName>
                {row.description !== null &&
                  row.description !== undefined &&
                  row.description.trim().length > 0 && (
                    <CardDescription>{row.description}</CardDescription>
                  )}
                <CardMeta>
                  <CardMetaTerm>Permissões</CardMetaTerm>
                  <CardMetaValue>
                    {renderCount(row.permissionsCount)}
                  </CardMetaValue>
                  <CardMetaTerm>Usuários</CardMetaTerm>
                  <CardMetaValue>{renderCount(row.usersCount)}</CardMetaValue>
                </CardMeta>
                {canUpdateRole && row.deletedAt === null && (
                  // Ações na versão mobile espelham a coluna "Ações"
                  // do desktop. Só aparecem quando o usuário tem
                  // permissão e a linha é ativa — coerente com o
                  // gating da tabela.
                  <RowActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={14} strokeWidth={1.5} />}
                      onClick={() => handleOpenEditModal(row)}
                      aria-label={`Editar role ${row.name}`}
                      data-testid={`roles-card-edit-${row.id}`}
                    >
                      Editar
                    </Button>
                  </RowActions>
                )}
              </EntityCard>
            ))}
          </CardListForMobile>
          {showOverlay && <RefetchOverlay testId="roles-overlay" />}
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
          pageInfoTestId="roles-page-info"
          prevTestId="roles-prev"
          nextTestId="roles-next"
        />
      )}

      {canUpdateRole && hasValidSystemId && (
        <EditRoleModal
          open={editingRole !== null}
          role={editingRole}
          systemId={systemId}
          onClose={handleCloseEditModal}
          onUpdated={handleRefetch}
          client={client}
        />
      )}
    </>
  );
};
