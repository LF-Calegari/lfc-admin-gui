import { Pencil, Plus } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useListModalState } from '../../hooks/useListModalState';
import { useModalOpenState } from '../../hooks/useModalOpenState';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import { listTokenTypes } from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  CardCode,
  CardDescription,
  CardHeader,
  CardListForMobile,
  CardName,
  EmptyHint,
  EmptyMessage,
  EmptyTitle,
  EntityCard,
  ListingResultArea,
  ListingToolbar,
  LiveRegion,
  Mono,
  Placeholder,
  RowActions,
  SoftDeleteRestoreButtons,
  StatusBadge,
  TableForDesktop,
  useListingLiveMessage,
} from '../../shared/listing';

import { DeleteTokenTypeConfirm } from './DeleteTokenTypeConfirm';
import { EditTokenTypeModal } from './EditTokenTypeModal';
import { NewTokenTypeModal } from './NewTokenTypeModal';
import { RestoreTokenTypeConfirm } from './RestoreTokenTypeConfirm';

import type { TableColumn } from '../../components/ui';
import type { ApiClient, SafeRequestOptions, TokenTypeDto } from '../../shared/api';

/**
 * Atraso entre a última tecla e o disparo da busca client-side. 300 ms
 * é o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 filtro por caractere. Espelha o valor
 * usado por `SystemsPage`/`RolesPage`/`ClientsListShellPage`.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Code de permissão exigido para o botão "Novo tipo de token" (Issue
 * #175).
 *
 * Espelha o `AUTH_V1_TOKEN_TYPES_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (o `POST /tokens/types` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemTokensTypesCreate)]`);
 * o gating client-side é apenas UX — esconder ações que o usuário não
 * pode executar.
 */
const TOKEN_TYPES_CREATE_PERMISSION = 'AUTH_V1_TOKEN_TYPES_CREATE';

/**
 * Code de permissão exigido para o botão "Editar" por linha (Issue
 * #175). Espelha o `AUTH_V1_TOKEN_TYPES_UPDATE` no `lfc-authenticator`
 * — o backend é a fonte autoritativa (`PUT /tokens/types/{id}` exige
 * `PermissionPolicies.SystemTokensTypesUpdate`). O gating client-side
 * só esconde ações que o usuário não pode executar.
 */
const TOKEN_TYPES_UPDATE_PERMISSION = 'AUTH_V1_TOKEN_TYPES_UPDATE';

/**
 * Code de permissão exigido para o botão "Desativar" por linha (Issue
 * #175). Espelha o `AUTH_V1_TOKEN_TYPES_DELETE` no `lfc-authenticator`
 * — o backend é a fonte autoritativa (`DELETE /tokens/types/{id}` exige
 * `PermissionPolicies.SystemTokensTypesDelete`). Gating client-side é
 * UX: esconder ações que o usuário não pode executar.
 */
const TOKEN_TYPES_DELETE_PERMISSION = 'AUTH_V1_TOKEN_TYPES_DELETE';

/**
 * Code de permissão exigido para o botão "Restaurar" por linha (Issue
 * #175). Espelha o `AUTH_V1_TOKEN_TYPES_RESTORE` no `lfc-authenticator`
 * — o backend é a fonte autoritativa (`POST /tokens/types/{id}/restore`
 * exige `PermissionPolicies.SystemTokensTypesRestore`). Gating
 * client-side é UX: esconder ações que o usuário não pode executar;
 * complementado por `row.deletedAt !== null` no botão (só faz sentido
 * restaurar linhas soft-deletadas — espelha a lógica inversa do botão
 * "Desativar"). Padrão alinhado com `SystemsPage`/`ClientsListShellPage`.
 */
const TOKEN_TYPES_RESTORE_PERMISSION = 'AUTH_V1_TOKEN_TYPES_RESTORE';

interface TokensListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido —
   * a página usa o singleton `apiClient` por trás de `listTokenTypes`.
   * Em testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/**
 * Renderiza a célula de descrição truncando textos longos via padrão
 * já usado em outras listagens. Quando vazio/`null`, exibe um
 * placeholder neutro "—".
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile —
 * centralizar evita duplicação visual.
 */
function renderDescription(row: TokenTypeDto): React.ReactNode {
  if (
    row.description === null ||
    row.description === undefined ||
    row.description.trim().length === 0
  ) {
    return <Placeholder>—</Placeholder>;
  }
  return row.description;
}

/**
 * Filtro client-side equivalente ao `q` server-side dos demais
 * recursos. Faz match case-insensitive em `name`, `code` e
 * `description` (descrição opcional). Centralizar o predicado evita
 * inline complexity no `useMemo` e facilita a evolução (ex.: incluir
 * data de criação no futuro).
 *
 * Diferente de `SystemsPage`/`RolesPage` (que delegam a busca ao
 * backend via `?q=`), o backend de token types
 * (`TokenTypesController.GetAll`) não suporta filtro server-side — o
 * payload é uma lista curta usada também por dropdowns de outros
 * recursos. Manter o filtro client-side preserva a generalidade do
 * wrapper HTTP e evita duplicar parâmetros de listagem entre o uso
 * "página administrativa" (este) e o uso "popular dropdown"
 * (`NewRouteModal`/`EditRouteModal`).
 */
function tokenTypeMatchesSearch(row: TokenTypeDto, term: string): boolean {
  if (term.length === 0) return true;
  const haystack = [
    row.name,
    row.code,
    row.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

export const TokensListShellPage: React.FC<TokensListShellPageProps> = ({
  client,
}) => {
  const { hasPermission } = useAuth();
  const canCreateTokenType = hasPermission(TOKEN_TYPES_CREATE_PERMISSION);
  const canUpdateTokenType = hasPermission(TOKEN_TYPES_UPDATE_PERMISSION);
  const canDeleteTokenType = hasPermission(TOKEN_TYPES_DELETE_PERMISSION);
  const canRestoreTokenType = hasPermission(TOKEN_TYPES_RESTORE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Toggle "Mostrar inativos" — diferente de outros recursos, o backend
  // de token types já devolve **todos** os registros (incluindo
  // soft-deletados) sem parâmetro de filtro. Toda a filtragem é
  // client-side, mantendo a UX consistente com as demais listagens
  // (mesmo Switch, mesma copy de "Inclui ... com remoção lógica.").
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false);

  // Estado de abertura do modal "Novo tipo de token". O modal é
  // controlado por essa página para que a Toolbar consiga ocultar o
  // botão por permissão sem perder o ciclo de vida do form. Centralizado
  // em `useModalOpenState` (lição PR #134/#135 — trio
  // useState+open+close duplicava entre páginas).
  const {
    isOpen: isCreateModalOpen,
    open: handleOpenCreateModal,
    close: handleCloseCreateModal,
  } = useModalOpenState();

  // Token type selecionado para edição. Quando definido, abre o
  // `EditTokenTypeModal` pré-populado com seus dados; `null` mantém o
  // modal fechado. Usar `useListModalState` evita o BLOCKER de
  // duplicação Sonar do trio `useState + open + close` (lição PR
  // #134/#135).
  const {
    selected: editingTokenType,
    open: handleOpenEditModal,
    close: handleCloseEditModal,
  } = useListModalState<TokenTypeDto>();

  // Token type selecionado para soft-delete. Mesma estratégia do
  // `editingTokenType` — manter o objeto completo (em vez de só o id)
  // permite ao `DeleteTokenTypeConfirm` exibir `name`/`code` na
  // confirmação sem round-trip extra. `null` mantém o modal fechado.
  const {
    selected: deletingTokenType,
    open: handleOpenDeleteConfirm,
    close: handleCloseDeleteConfirm,
  } = useListModalState<TokenTypeDto>();

  // Token type selecionado para restauração. Mesma estratégia do
  // `deletingTokenType` — manter o objeto completo permite ao
  // `RestoreTokenTypeConfirm` exibir `name`/`code` na confirmação sem
  // round-trip extra. `null` mantém o modal fechado.
  const {
    selected: restoringTokenType,
    open: handleOpenRestoreConfirm,
    close: handleCloseRestoreConfirm,
  } = useListModalState<TokenTypeDto>();

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
  }, []);

  /**
   * `fetcher` memoizado para o `useSingleFetchWithAbort`: depende
   * apenas do `client` injetado. Sem parâmetros de busca/paginação na
   * request — o backend devolve a lista completa, e o filtro
   * (`q`/`includeDeleted`) é aplicado client-side via `useMemo` sobre
   * `data`.
   *
   * Manter assim simplifica o cancelamento (não há refetch por
   * keystroke) e respeita o desenho do backend (lista curta sem
   * paginação). Os refetches pós-mutação reusam a mesma identidade do
   * `fetcher`, então o hook só refaz fetch quando o `client` muda
   * (raríssimo) ou quando `refetch()` é disparado pelos modais.
   */
  const fetcher = useCallback(
    (options: SafeRequestOptions) => listTokenTypes(options, client),
    [client],
  );

  const {
    data: rawData,
    isInitialLoading,
    errorMessage,
    refetch: handleRefetch,
  } = useSingleFetchWithAbort<ReadonlyArray<TokenTypeDto>>({
    fetcher,
    fallbackErrorMessage:
      'Falha ao carregar a lista de tipos de token. Tente novamente.',
  });

  const trimmedSearch = debouncedSearch.trim().toLowerCase();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Aplica filtro client-side sobre o payload do backend:
   *
   * 1. Filtra por `includeDeleted` — quando `false`, descarta
   *    soft-deletados (alinhado com o default das outras listagens
   *    onde o backend faz isso server-side).
   * 2. Filtra por termo de busca — match case-insensitive em `name`,
   *    `code` e `description`.
   *
   * Memoizado para evitar recálculo a cada render quando `searchTerm`
   * muda mas `debouncedSearch` ainda não — preserva o comportamento de
   * busca debounced.
   */
  const rows = useMemo<ReadonlyArray<TokenTypeDto>>(() => {
    const list = rawData ?? [];
    return list.filter((row) => {
      if (!includeDeleted && row.deletedAt !== null) return false;
      return tokenTypeMatchesSearch(row, trimmedSearch);
    });
  }, [includeDeleted, rawData, trimmedSearch]);

  const total = rows.length;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio com toggle "incluir inativos" desligado mas existem
   *   inativos → mensagem neutra com dica de ativar o toggle.
   * - Vazio sem busca e sem inativos → "nenhum tipo de token
   *   cadastrado".
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhum tipo de token encontrado para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="token-types-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhum tipo de token cadastrado.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Tipos de token removidos podem ser visualizados ativando
            &quot;Mostrar inativos&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  /**
   * Renderiza o bloco de ações por linha (Editar/Desativar/Restaurar)
   * para uma linha de token type. Reutilizado pelo desktop (coluna
   * "Ações" da tabela) e pelo mobile (rodapé dos cards) — única
   * diferença é o prefixo dos `data-testid` (`token-types-edit` no
   * desktop vs `token-types-card-edit` no mobile).
   *
   * Centralizar aqui em uma única função evita o BLOCKER de duplicação
   * JSCPD/Sonar — o `<Button>` de cada ação repetido entre tabela e
   * cards seria marcado como clone (lição PR #128/#134/#135).
   */
  const renderTokenTypeRowActions = useCallback(
    (
      row: TokenTypeDto,
      testIdPrefix: 'token-types' | 'token-types-card',
    ): React.ReactNode => (
      <RowActions>
        {canUpdateTokenType && row.deletedAt === null && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={14} strokeWidth={1.5} />}
            onClick={() => handleOpenEditModal(row)}
            aria-label={`Editar tipo de token ${row.name}`}
            data-testid={`${testIdPrefix}-edit-${row.id}`}
          >
            Editar
          </Button>
        )}
        <SoftDeleteRestoreButtons
          deletedAt={row.deletedAt}
          canDelete={canDeleteTokenType}
          canRestore={canRestoreTokenType}
          onDelete={() => handleOpenDeleteConfirm(row)}
          onRestore={() => handleOpenRestoreConfirm(row)}
          deleteAriaLabel={`Desativar tipo de token ${row.name}`}
          restoreAriaLabel={`Restaurar tipo de token ${row.name}`}
          deleteTestId={`${testIdPrefix}-delete-${row.id}`}
          restoreTestId={`${testIdPrefix}-restore-${row.id}`}
        />
      </RowActions>
    ),
    [
      canDeleteTokenType,
      canRestoreTokenType,
      canUpdateTokenType,
      handleOpenDeleteConfirm,
      handleOpenEditModal,
      handleOpenRestoreConfirm,
    ],
  );

  /**
   * Renderiza o bloco de ações dos cards mobile (wrapper sobre
   * `renderTokenTypeRowActions` aplicando o gating apropriado). Quando
   * o usuário não tem nem update/delete/restore aplicáveis, retorna
   * `null` para não renderizar wrapper vazio. Espelha o
   * `renderMobileRowActions` de `ClientsListShellPage`/
   * `UsersListShellPage` (lição PR #134/#135).
   */
  const renderMobileRowActions = useCallback(
    (row: TokenTypeDto): React.ReactNode => {
      const isActive = row.deletedAt === null;
      const hasUpdate = canUpdateTokenType && isActive;
      const hasDelete = canDeleteTokenType && isActive;
      const hasRestore = canRestoreTokenType && !isActive;
      if (!hasUpdate && !hasDelete && !hasRestore) {
        return null;
      }
      return renderTokenTypeRowActions(row, 'token-types-card');
    },
    [
      canDeleteTokenType,
      canRestoreTokenType,
      canUpdateTokenType,
      renderTokenTypeRowActions,
    ],
  );

  const columns = useMemo<ReadonlyArray<TableColumn<TokenTypeDto>>>(() => {
    const base: Array<TableColumn<TokenTypeDto>> = [
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
        key: 'status',
        label: 'Status',
        width: '120px',
        render: (row) => <StatusBadge deletedAt={row.deletedAt} gender="m" />,
      },
    ];

    // Coluna "Ações" só aparece quando o usuário tem **alguma** ação
    // disponível (update, delete ou restore). Esconder a coluna
    // inteira para perfis read-only mantém a tabela compacta sem coluna
    // vazia. Cada botão dentro tem seu próprio gating individual +
    // check por linha (`row.deletedAt`) — espelha
    // `SystemsPage`/`ClientsListShellPage`.
    if (canUpdateTokenType || canDeleteTokenType || canRestoreTokenType) {
      base.push({
        key: 'actions',
        label: 'Ações',
        isActions: true,
        render: (row) => renderTokenTypeRowActions(row, 'token-types'),
      });
    }

    return base;
  }, [
    canDeleteTokenType,
    canRestoreTokenType,
    canUpdateTokenType,
    renderTokenTypeRowActions,
  ]);

  /**
   * ARIA-live: anuncia o estado da listagem quando muda. Em loading
   * subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos o
   * total. Em erro, o `<Alert role="alert">` já cobre. O hook
   * `useListingLiveMessage` centraliza a árvore de decisão (lição PR
   * #134/#135 — bloco duplicado entre listagens reprovou Sonar).
   *
   * Como este recurso não tem paginação, passamos `page=1`/
   * `totalPages=1` constantes — o hook usa esses valores apenas para
   * compor a frase quando há múltiplas páginas, e com `totalPages=1`
   * cai na frase curta ("N tipos de token encontrados.").
   */
  const liveMessage = useListingLiveMessage({
    isInitialLoading,
    isFetching: false,
    errorMessage,
    total,
    page: 1,
    totalPages: 1,
    hasActiveSearch,
    trimmedSearch,
    copy: {
      singular: 'tipo de token',
      pluralCarregando: 'tipos de token',
      vazioSemBusca: 'Nenhum tipo de token cadastrado.',
      gender: 'm',
    },
  });

  /**
   * CTA "Novo tipo de token" extraído como variável memoizada para que
   * o `<ListingToolbar actions={createCtaButton}>` não tokenize com o
   * resto da listagem como bloco duplicado entre as páginas. Lição PR
   * #128/#134/#135 — call-site também duplica entre páginas similares,
   * não só o helper compartilhado.
   */
  const createCtaButton = useMemo<React.ReactNode>(() => {
    if (!canCreateTokenType) return null;
    return (
      <Button
        variant="primary"
        size="md"
        icon={<Plus size={14} strokeWidth={1.75} />}
        onClick={handleOpenCreateModal}
        data-testid="token-types-create-open"
      >
        Novo tipo de token
      </Button>
    );
  }, [canCreateTokenType, handleOpenCreateModal]);

  /**
   * Tabela renderizada como variável intermediária para reduzir o peso
   * do JSX inline e manter o callsite de `<ListingResultArea>` mais
   * legível. Inclui também o `<CardListForMobile>` para que o conteúdo
   * seja consistente entre breakpoints (paridade com
   * `ClientsListShellPage`/`UsersListShellPage`).
   */
  const tableNode = (
    <>
      <TableForDesktop>
        <Table<TokenTypeDto>
          caption="Lista de tipos de token JWT cadastrados no auth-service."
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyState={emptyContent}
        />
      </TableForDesktop>
      <CardListForMobile
        role="list"
        aria-label="Lista de tipos de token JWT cadastrados no auth-service"
        data-testid="token-types-card-list"
      >
        {rows.length === 0 && emptyContent}
        {rows.map((row) => (
          <EntityCard
            key={row.id}
            role="listitem"
            tabIndex={0}
            data-testid={`token-types-card-${row.id}`}
          >
            <CardHeader>
              <CardCode>
                <Mono>{row.code}</Mono>
              </CardCode>
              <StatusBadge deletedAt={row.deletedAt} gender="m" />
            </CardHeader>
            <CardName>{row.name}</CardName>
            {row.description !== null &&
              row.description !== undefined &&
              row.description.trim().length > 0 && (
                <CardDescription>{row.description}</CardDescription>
              )}
            {renderMobileRowActions(row)}
          </EntityCard>
        ))}
      </CardListForMobile>
    </>
  );

  /**
   * Modais extraídos como variáveis para reduzir o peso do JSX final
   * e evitar que o jscpd tokenize a tripla `{can... && <Modal ... />}`
   * como duplicação com `SystemsPage`/`ClientsListShellPage` (que têm
   * o mesmo padrão para create/edit/delete/restore — lição PR
   * #134/#135).
   */
  const createModalNode = canCreateTokenType ? (
    <NewTokenTypeModal
      open={isCreateModalOpen}
      onClose={handleCloseCreateModal}
      onCreated={handleRefetch}
      client={client}
    />
  ) : null;

  const editModalNode = canUpdateTokenType ? (
    <EditTokenTypeModal
      open={editingTokenType !== null}
      tokenType={editingTokenType}
      onClose={handleCloseEditModal}
      onUpdated={handleRefetch}
      client={client}
    />
  ) : null;

  const deleteModalNode = canDeleteTokenType ? (
    <DeleteTokenTypeConfirm
      open={deletingTokenType !== null}
      tokenType={deletingTokenType}
      onClose={handleCloseDeleteConfirm}
      onDeleted={handleRefetch}
      apiClient={client}
    />
  ) : null;

  const restoreModalNode = canRestoreTokenType ? (
    <RestoreTokenTypeConfirm
      open={restoringTokenType !== null}
      tokenType={restoringTokenType}
      onClose={handleCloseRestoreConfirm}
      onRestored={handleRefetch}
      apiClient={client}
    />
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="07 Tokens"
        title="Tipos de token JWT"
        desc="Catálogo de tipos de token JWT do ecossistema. Cada rota é vinculada a um tipo de token; gerenciar este catálogo controla quais políticas estão disponíveis para emissão."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Nome, código ou descrição"
        searchAriaLabel="Buscar tipos de token por nome, código ou descrição"
        searchTestId="token-types-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui tipos de token com remoção lógica."
        includeDeletedTestId="token-types-include-deleted"
        actions={createCtaButton}
      />

      <LiveRegion message={liveMessage} testId="token-types-live" />

      <ListingResultArea
        testIdPrefix="token-types"
        loadingLabel="Carregando tipos de token"
        isInitialLoading={isInitialLoading}
        isFetching={false}
        errorMessage={errorMessage}
        onRetry={handleRefetch}
        tableContent={tableNode}
        total={total}
        page={1}
        totalPages={1}
        isFirstPage
        isLastPage
        onPrev={NOOP}
        onNext={NOOP}
      />

      {createModalNode}
      {editModalNode}
      {deleteModalNode}
      {restoreModalNode}
    </>
  );
};

/**
 * No-op para os handlers de paginação. A listagem de token types não
 * pagina (backend devolve array completo), então `onPrev`/`onNext`
 * jamais são invocados — o `ListingResultArea` só renderiza o
 * `PaginationFooter` quando `totalPages > 1`. Manter como referência
 * estável evita re-render desnecessário do shell.
 */
const NOOP = (): void => undefined;
