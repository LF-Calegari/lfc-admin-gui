import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { usePaginationControls } from '../../hooks/usePaginationControls';
import {
  clientDisplayName,
  DEFAULT_USERS_INCLUDE_DELETED,
  DEFAULT_USERS_PAGE,
  DEFAULT_USERS_PAGE_SIZE,
  getClientsByIds,
  isApiError,
  listUsers,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  CardCode,
  CardHeader,
  CardListForMobile,
  CardMeta,
  CardMetaTerm,
  CardMetaValue,
  CardName,
  EmptyHint,
  EmptyMessage,
  EmptyTitle,
  EntityCard,
  ErrorRetryBlock,
  InitialLoadingSpinner,
  ListingToolbar,
  LiveRegion,
  Mono,
  PaginationFooter,
  Placeholder,
  RefetchOverlay,
  StatusBadge,
  TableForDesktop,
  TableShell,
  useListingLiveMessage,
} from '../../shared/listing';

import { NewUserModal } from './NewUserModal';

import type { TableColumn } from '../../components/ui';
import type {
  ApiClient,
  ClientDto,
  SafeRequestOptions,
  UserDto,
} from '../../shared/api';

/**
 * Code de permissão exigido para o botão "Novo usuário" (Issue #78).
 *
 * Espelha o `AUTH_V1_USERS_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (o `POST /users` valida via
 * `[Authorize(Policy = PermissionPolicies.UsersCreate)]`); o gating
 * client-side é apenas UX — esconder ações que o usuário não pode
 * executar.
 */
const USERS_CREATE_PERMISSION = 'AUTH_V1_USERS_CREATE';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms
 * é o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que
 * uma digitação fluida não dispare 1 request por caractere. Espelha
 * o valor usado por `RoutesPage`/`RolesPage`/`SystemsPage`.
 */
const SEARCH_DEBOUNCE_MS = 300;

interface UsersListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido
   * — a página usa o singleton `apiClient` por trás de `listUsers`/
   * `getClientsByIds`. Em testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/**
 * Renderiza a célula da coluna "Cliente" usando o `clientId` do
 * usuário para resolver o nome via `clientsById` (carregado em paralelo
 * pela página). Quando o usuário não tem `clientId` (cenário raro mas
 * possível em payloads legados) ou o lookup ainda não terminou,
 * exibimos "—" — preserva o layout sem flicker numérico do `id`.
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile —
 * centralizar evita duplicação visual (lição PR #127/#128).
 */
function renderClientCell(
  user: UserDto,
  clientsById: ReadonlyMap<string, ClientDto>,
): React.ReactNode {
  if (user.clientId === null || user.clientId.length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  const client = clientsById.get(user.clientId);
  if (!client) {
    return <Placeholder>—</Placeholder>;
  }
  return clientDisplayName(client);
}

/**
 * Resume o status do usuário em um único objeto consumido pelo
 * `<StatusBadge>`. A semântica do backend distingue dois eixos:
 *
 * - `deletedAt != null` → soft-delete (botão "Restaurar" no futuro).
 * - `active === false` → desativado (mas ainda não deletado).
 *
 * O `<StatusBadge>` original mostra "Ativa"/"Inativa" baseando-se em
 * `deletedAt`. Aqui adaptamos: passamos um `deletedAt` sintético
 * `'inactive'` quando o usuário está inativo mas não deletado, para
 * que o badge mostre "Inativa" preservando consistência visual com as
 * demais listagens. Isso evita criar um `UserStatusBadge` quase
 * idêntico (Sonar marcaria duplicação, lição PR #134/#135).
 */
function deriveStatusDeletedAt(user: UserDto): string | null {
  if (user.deletedAt !== null) {
    return user.deletedAt;
  }
  if (!user.active) {
    // Marcador interno para o `<StatusBadge>` cair no ramo "Inativa".
    // Qualquer string não-vazia funciona — o badge só checa `!== null`.
    return 'inactive';
  }
  return null;
}

export const UsersListShellPage: React.FC<UsersListShellPageProps> = ({
  client,
}) => {
  const { hasPermission } = useAuth();
  const canCreateUser = hasPermission(USERS_CREATE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_USERS_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_USERS_PAGE);

  // Estado de abertura do modal "Novo usuário" (Issue #78). O modal é
  // controlado por essa página para que a Toolbar consiga ocultar o
  // botão por permissão sem perder o ciclo de vida do form.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra
   * para 3 itens, mas continuo na página 5 vazia". Espelha o padrão
   * de `RolesPage`/`RoutesPage`.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_USERS_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_USERS_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_USERS_PAGE);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`: captura os params
   * derivados e devolve uma função que aceita `signal` no `options`.
   * O hook reage a mudanças na identidade de `fetcher` para
   * reexecutar — `useCallback` com as deps corretas mantém o ciclo
   * previsível.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listUsers(
        {
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_USERS_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [client, includeDeleted, page, trimmedSearchInput],
  );

  const {
    rows,
    pageSize: appliedPageSize,
    total,
    isInitialLoading,
    isFetching,
    errorMessage,
    refetch: handleRefetch,
  } = usePaginatedFetch<UserDto>({
    fetcher,
    fallbackErrorMessage:
      'Falha ao carregar a lista de usuários. Tente novamente.',
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
    defaultPageSize: DEFAULT_USERS_PAGE_SIZE,
    page,
    setPage,
  });

  /**
   * Mapa `clientId -> ClientDto` para denormalizar o nome do cliente
   * vinculado a cada usuário da página corrente. Carregado em paralelo
   * via `getClientsByIds` (lookup batch) sempre que `rows` muda. O
   * AbortController garante cancelamento em mudanças rápidas (mesmo
   * padrão do `usePaginatedFetch`).
   *
   * Não bloqueia a renderização da tabela: enquanto o lookup não
   * termina, a coluna "Cliente" mostra "—" e atualiza in-place quando
   * a Promise resolve. Falhas no lookup são silenciosamente ignoradas
   * (o helper `getClientsByIds` é "best-effort") — o erro
   * crítico do `listUsers` já é coberto pelo `usePaginatedFetch`.
   */
  const [clientsById, setClientsById] = useState<ReadonlyMap<string, ClientDto>>(
    () => new Map(),
  );

  useEffect(() => {
    if (rows.length === 0) {
      setClientsById(new Map());
      return undefined;
    }
    // Dedup: vários usuários podem compartilhar o mesmo cliente —
    // passamos cada id apenas uma vez para o lookup.
    const uniqueClientIds = Array.from(
      new Set(
        rows
          .map((row) => row.clientId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    if (uniqueClientIds.length === 0) {
      setClientsById(new Map());
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    getClientsByIds(uniqueClientIds, { signal: controller.signal }, client)
      .then((map) => {
        if (cancelled) return;
        setClientsById(map);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Cancelamento intencional — não polui a UI nem o estado.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (
          isApiError(error) &&
          error.kind === 'network' &&
          error.message === 'Requisição cancelada.'
        ) {
          return;
        }
        // Best-effort: lookup falho mantém o map atual (ou vazio); a
        // tabela exibe "—" na coluna até a próxima rodada.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, rows]);

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio sem busca → "nenhum usuário cadastrado" + dica sobre o
   *   toggle "Mostrar inativos" caso esteja desligado.
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhum usuário encontrado para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="users-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhum usuário cadastrado.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Usuários removidos podem ser visualizados ativando &quot;Mostrar
            inativas&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<UserDto>>>(
    () => [
      {
        key: 'name',
        label: 'Nome',
        render: (row) => row.name,
      },
      {
        key: 'email',
        label: 'E-mail',
        render: (row) => <Mono>{row.email}</Mono>,
      },
      {
        key: 'client',
        label: 'Cliente',
        render: (row) => renderClientCell(row, clientsById),
      },
      {
        key: 'status',
        label: 'Status',
        width: '120px',
        render: (row) => <StatusBadge deletedAt={deriveStatusDeletedAt(row)} />,
      },
    ],
    [clientsById],
  );

  const showOverlay = isFetching && !isInitialLoading;

  // ARIA-live: anuncia o estado da listagem quando muda. Em loading
  // subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos
  // o total. Em erro, o `<Alert role="alert">` já cobre. O hook
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
      singular: 'usuário',
      pluralCarregando: 'usuários',
      vazioSemBusca: 'Nenhum usuário cadastrado.',
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="06 Usuários"
        title="Usuários"
        desc="Pessoas com acesso ao painel administrativo. Use a busca para filtrar por nome ou e-mail."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Nome ou e-mail do usuário"
        searchAriaLabel="Buscar usuários por nome ou e-mail"
        searchTestId="users-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui usuários com remoção lógica."
        includeDeletedTestId="users-include-deleted"
        actions={
          canCreateUser && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} strokeWidth={1.75} />}
              onClick={handleOpenCreateModal}
              data-testid="users-create-open"
            >
              Novo usuário
            </Button>
          )
        }
      />

      <LiveRegion message={liveMessage} testId="users-live" />

      {isInitialLoading && (
        <InitialLoadingSpinner
          testId="users-loading"
          label="Carregando usuários"
        />
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={handleRefetch}
          retryTestId="users-retry"
        />
      )}

      {!isInitialLoading && !errorMessage && (
        <TableShell>
          <TableForDesktop>
            <Table<UserDto>
              caption="Lista de usuários do painel administrativo."
              columns={columns}
              data={rows}
              getRowKey={(row) => row.id}
              emptyState={emptyContent}
            />
          </TableForDesktop>
          <CardListForMobile
            role="list"
            aria-label="Lista de usuários do painel administrativo"
            data-testid="users-card-list"
          >
            {rows.length === 0 && emptyContent}
            {rows.map((row) => (
              <EntityCard
                key={row.id}
                role="listitem"
                tabIndex={0}
                data-testid={`users-card-${row.id}`}
              >
                <CardHeader>
                  <CardCode>{row.email}</CardCode>
                  <StatusBadge deletedAt={deriveStatusDeletedAt(row)} />
                </CardHeader>
                <CardName>{row.name}</CardName>
                <CardMeta>
                  <CardMetaTerm>Cliente</CardMetaTerm>
                  <CardMetaValue>
                    {renderClientCell(row, clientsById)}
                  </CardMetaValue>
                </CardMeta>
              </EntityCard>
            ))}
          </CardListForMobile>
          {showOverlay && <RefetchOverlay testId="users-overlay" />}
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
          pageInfoTestId="users-page-info"
          prevTestId="users-prev"
          nextTestId="users-next"
        />
      )}

      {canCreateUser && (
        <NewUserModal
          open={isCreateModalOpen}
          onClose={handleCloseCreateModal}
          onCreated={handleRefetch}
          client={client}
        />
      )}
    </>
  );
};
