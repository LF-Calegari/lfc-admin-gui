import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Alert, Badge, Button, Input, Spinner, Switch, Table } from '../components/ui';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePaginatedFetch } from '../hooks/usePaginatedFetch';
import { usePaginationControls } from '../hooks/usePaginationControls';
import {
  DEFAULT_INCLUDE_DELETED,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  listSystems,
} from '../shared/api';
import { useAuth } from '../shared/auth';

import { DeleteSystemConfirm } from './systems/DeleteSystemConfirm';
import { EditSystemModal } from './systems/EditSystemModal';
import { NewSystemModal } from './systems/NewSystemModal';
import { RestoreSystemConfirm } from './systems/RestoreSystemConfirm';
import { SystemsStatsRow } from './systems/SystemsStatsRow';

import type { TableColumn } from '../components/ui';
import type { ApiClient, SafeRequestOptions, SystemDto } from '../shared/api';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms é
 * o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que uma
 * digitação fluida não dispare 1 request por caractere.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Code de permissão exigido para o botão "Novo sistema" (Issue #58).
 *
 * Espelha o `AUTH_V1_SYSTEMS_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (o `POST /systems` valida via
 * `[Authorize(Policy = PermissionPolicies.SystemsCreate)]`); o gating
 * client-side é apenas UX — esconder ações que o usuário não pode
 * executar.
 */
const SYSTEMS_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_CREATE';

/**
 * Code de permissão exigido para o botão "Editar" por linha (Issue #59).
 *
 * Espelha o `AUTH_V1_SYSTEMS_UPDATE` no `lfc-authenticator` — o backend
 * é a fonte autoritativa (`PUT /systems/{id}` exige
 * `PermissionPolicies.SystemsUpdate`). O gating client-side só esconde
 * ações que o usuário não pode executar.
 */
const SYSTEMS_UPDATE_PERMISSION = 'AUTH_V1_SYSTEMS_UPDATE';

/**
 * Code de permissão exigido para o botão "Desativar" por linha (Issue
 * #60). Espelha o `AUTH_V1_SYSTEMS_DELETE` no `lfc-authenticator` — o
 * backend é a fonte autoritativa (`DELETE /systems/{id}` exige
 * `PermissionPolicies.SystemsDelete`). Gating client-side é UX:
 * esconder ações que o usuário não pode executar.
 */
const SYSTEMS_DELETE_PERMISSION = 'AUTH_V1_SYSTEMS_DELETE';

/**
 * Code de permissão exigido para o botão "Restaurar" por linha (Issue
 * #61, última sub-issue da EPIC #45). Espelha o `AUTH_V1_SYSTEMS_RESTORE`
 * no `lfc-authenticator` — o backend é a fonte autoritativa
 * (`POST /systems/{id}/restore` exige `PermissionPolicies.SystemsRestore`).
 * Gating client-side é UX: esconder ações que o usuário não pode
 * executar; complementado por `row.deletedAt !== null` no botão (só
 * faz sentido restaurar linhas soft-deletadas — espelha a lógica
 * inversa do botão "Desativar").
 */
const SYSTEMS_RESTORE_PERMISSION = 'AUTH_V1_SYSTEMS_RESTORE';

interface SystemsPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido — a
   * página usa o singleton `apiClient` por trás de `listSystems`. Em
   * testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
  /**
   * Quando `true`, omite o painel de stats (`SystemsStatsRow`). Default
   * `false` — em produção o painel sempre aparece. Os testes da EPIC #45
   * (criar/editar/desativar/restaurar) passam `true` para evitar que as
   * 2 chamadas extras a `GET /systems` (sem includeDeleted + com) consumam
   * o `mockResolvedValueOnce` montado para a listagem da própria suíte.
   * Os testes do painel em si rodam o `SystemsStatsRow` direto, sem o
   * shell da `SystemsPage`.
   */
  hideStats?: boolean;
}

/* ─── Styled primitives ──────────────────────────────────── */

const Toolbar = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
  }
`;

const SearchSlot = styled.div`
  width: 100%;

  @media (min-width: 48em) {
    max-width: 360px;
    flex: 1;
  }
`;

const ToggleSlot = styled.div`
  display: flex;
  align-items: center;
`;

/**
 * Container à direita da Toolbar agrupando o toggle "Mostrar inativos"
 * e o botão "Novo sistema" (gated por permissão). Em viewports estreitos
 * empilha vertical; a partir de 48em alinha em linha mantendo o toggle
 * antes da CTA — leitura natural "filtro → ação".
 */
const ToolbarActions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-3);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    gap: var(--space-4);
  }
`;

const TableShell = styled.div`
  position: relative;
`;

/**
 * Overlay leve aplicado em cima da tabela durante refetches subsequentes
 * (busca/paginação/toggle). Mantém os dados anteriores visíveis para
 * evitar flicker enquanto sinaliza atividade — o spinner ancorado ao
 * topo deixa claro que algo está em curso sem mover a tabela.
 */
const TableOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--space-6);
  background: color-mix(in srgb, var(--bg-base) 55%, transparent);
  border-radius: var(--radius-lg);
  pointer-events: none;
  z-index: 1;
`;

const InitialLoading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) 0;
`;

const ErrorBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
`;

const FootBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: stretch;
  margin-top: var(--space-5);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
`;

const PageInfo = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wider);
`;

const PageNav = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
`;

const EmptyMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) 0;
`;

const EmptyTitle = styled.span`
  font-size: var(--text-sm);
  color: var(--fg2);
`;

const EmptyHint = styled.span`
  font-size: var(--text-xs);
  color: var(--text-muted);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg2);
`;

/**
 * Wrapper das ações por linha. Mantém os botões alinhados à direita e
 * permite múltiplas ações futuras (#60 desativar, #61 restaurar) sem
 * remontar o layout.
 */
const RowActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-end;
`;

/* ─── Component ──────────────────────────────────────────── */

export const SystemsPage: React.FC<SystemsPageProps> = ({ client, hideStats = false }) => {
  const { hasPermission } = useAuth();
  const canCreateSystem = hasPermission(SYSTEMS_CREATE_PERMISSION);
  const canUpdateSystem = hasPermission(SYSTEMS_UPDATE_PERMISSION);
  const canDeleteSystem = hasPermission(SYSTEMS_DELETE_PERMISSION);
  const canRestoreSystem = hasPermission(SYSTEMS_RESTORE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(DEFAULT_INCLUDE_DELETED);
  const [page, setPage] = useState<number>(DEFAULT_PAGE);

  // Estado de abertura do modal "Novo sistema" (Issue #58). O modal é
  // controlado por essa página para que a Toolbar consiga ocultar o
  // botão por permissão sem perder o ciclo de vida do form.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // Sistema selecionado para edição (Issue #59). Quando definido, abre o
  // `EditSystemModal` pré-populado com seus dados; `null` mantém o modal
  // fechado. Manter o sistema completo (em vez de só o id) evita
  // round-trip extra para refazer fetch no modal — a tabela já tem o
  // payload pronto.
  const [editingSystem, setEditingSystem] = useState<SystemDto | null>(null);

  // Sistema selecionado para desativação (Issue #60). Mesma estratégia
  // do `editingSystem`: manter o objeto completo evita round-trip e
  // permite que o `DeleteSystemConfirm` exiba `name`/`code` no copy de
  // confirmação. `null` mantém o modal fechado.
  const [deletingSystem, setDeletingSystem] = useState<SystemDto | null>(null);

  // Sistema selecionado para restauração (Issue #61, última sub-issue
  // da EPIC #45). Mesma estratégia do `deletingSystem` — manter o
  // objeto completo permite ao `RestoreSystemConfirm` exibir `name`/
  // `code` na confirmação sem round-trip extra. `null` mantém o modal
  // fechado.
  const [restoringSystem, setRestoringSystem] = useState<SystemDto | null>(null);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleOpenEditModal = useCallback((row: SystemDto) => {
    setEditingSystem(row);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditingSystem(null);
  }, []);

  const handleOpenDeleteConfirm = useCallback((row: SystemDto) => {
    setDeletingSystem(row);
  }, []);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeletingSystem(null);
  }, []);

  const handleOpenRestoreConfirm = useCallback((row: SystemDto) => {
    setRestoringSystem(row);
  }, []);

  const handleCloseRestoreConfirm = useCallback(() => {
    setRestoringSystem(null);
  }, []);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra para
   * 3 itens, mas continuo na página 5 vazia". `page` é setado direto
   * pelos callbacks dos controles para manter o efeito previsível.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_PAGE);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`. Captura os params
   * derivados (busca debounced, page, filtro) e devolve uma função que
   * aceita `signal` no `options`. O hook reage à mudança de identidade
   * do `fetcher` para reexecutar — `useCallback` com as deps corretas
   * mantém o ciclo previsível.
   *
   * Reusado pelo callback `onCreated`/`onUpdated`/`onDeleted` dos
   * modais (Issues #58/#59/#60/#61) via `refetch` devolvido pelo hook:
   * após mutação bem-sucedida, incrementamos o nonce interno para
   * reexecutar `listSystems` mantendo a página/filtros atuais. Mais
   * simples que exigir que o pai conheça `setData` e propagar
   * manualmente o item novo (ainda que custe um round-trip extra, é
   * coerente com o resto dos refetches da página e evita estado
   * inconsistente quando outras pessoas estão mutando em paralelo).
   *
   * O mesmo callback (`handleRefetch`) cobre os múltiplos call sites
   * (retry + onCreated/onUpdated/onDeleted/onRestored) — antes havia
   * funções separadas que o Sonar marcou como duplicação no PR #127.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listSystems(
        {
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_PAGE_SIZE,
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
    refetch: refetchList,
  } = usePaginatedFetch<SystemDto>({
    fetcher,
    fallbackErrorMessage: 'Falha ao carregar a lista de sistemas. Tente novamente.',
  });

  // Bumper duplicado para o painel de stats (`SystemsStatsRow`). Antes
  // o painel usava o mesmo `retryNonce` da tabela porque ambos viviam
  // no mesmo `useState` da página. Após extrair o ciclo de fetch para
  // `usePaginatedFetch` (Issue #62), o nonce ficou encapsulado no hook
  // e o `SystemsStatsRow` precisa de um sinal próprio para refetchear.
  // Mantemos os dois alinhados disparando ambos do mesmo callback —
  // assim "Tentar novamente" e os refetches pós-mutação continuam
  // atualizando tabela e painel ao mesmo tempo (Issue #131).
  const [statsRefreshKey, setStatsRefreshKey] = useState<number>(0);
  const handleRefetch = useCallback(() => {
    refetchList();
    setStatsRefreshKey((n) => n + 1);
  }, [refetchList]);

  // Controles de paginação centralizados em `usePaginationControls`
  // (lição PR #134 — bloco de 28 linhas duplicado com `RoutesPage`
  // reprovou o SonarCloud Quality Gate). O hook devolve a mesma
  // tupla de cálculos/handlers que vivia inline aqui, com a mesma
  // semântica de memoização.
  const { totalPages, isFirstPage, isLastPage, handlePrevPage, handleNextPage } =
    usePaginationControls({
      total,
      appliedPageSize,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      page,
      setPage,
    });

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio com toggle "incluir inativos" mas sem busca → mensagem
   *   neutra (não há nem sistemas vivos nem soft-deleted).
   * - Vazio sem busca → "nenhum sistema cadastrado" (default puro).
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhum sistema encontrado para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="systems-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhum sistema cadastrado.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Sistemas removidos podem ser visualizados ativando &quot;Mostrar inativos&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<SystemDto>>>(() => {
    const base: Array<TableColumn<SystemDto>> = [
      {
        key: 'name',
        label: 'Nome',
        render: (row) => row.name,
      },
      {
        key: 'code',
        label: 'Código',
        render: (row) => <Mono>{row.code}</Mono>,
      },
      {
        key: 'status',
        label: 'Status',
        width: '140px',
        render: (row) =>
          row.deletedAt ? (
            <Badge variant="danger" dot>
              Inativo
            </Badge>
          ) : (
            <Badge variant="success" dot>
              Ativo
            </Badge>
          ),
      },
    ];

    // Coluna "Ações" só aparece quando o usuário tem **alguma** ação
    // disponível (update, delete ou restore). Esconder a coluna inteira
    // para perfis read-only mantém a tabela compacta sem coluna vazia.
    // Cada botão dentro tem seu próprio gating individual + check por
    // linha quando aplicável (`row.deletedAt`).
    if (canUpdateSystem || canDeleteSystem || canRestoreSystem) {
      base.push({
        key: 'actions',
        label: 'Ações',
        isActions: true,
        render: (row) => (
          <RowActions>
            {canUpdateSystem && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenEditModal(row)}
                aria-label={`Editar sistema ${row.name}`}
                data-testid={`systems-edit-${row.id}`}
              >
                Editar
              </Button>
            )}
            {canDeleteSystem && row.deletedAt === null && (
              // Botão "Desativar" só aparece em linhas ativas — não faz
              // sentido oferecer "desativar" pra um sistema já soft-
              // deletado (Issue #61 cobre "Restaurar" pra essas linhas).
              // O backend devolve 404 nesse caso, mas esconder no UI é
              // o caminho ergonômico (lê a coluna Status como referência).
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenDeleteConfirm(row)}
                aria-label={`Desativar sistema ${row.name}`}
                data-testid={`systems-delete-${row.id}`}
              >
                Desativar
              </Button>
            )}
            {canRestoreSystem && row.deletedAt !== null && (
              // Botão "Restaurar" é o inverso lógico do "Desativar":
              // só aparece em linhas com `deletedAt != null`. O backend
              // devolve 404 com mensagem específica se chamarem em
              // sistema ativo ("Sistema não encontrado ou não está
              // deletado."), mas escondemos no UI para reforçar a leitura
              // visual: a coluna Status já mostra "Inativo" via Badge.
              // Issue #61 — última sub-issue da EPIC #45.
              <Button
                variant="ghost"
                size="sm"
                icon={<Undo2 size={14} strokeWidth={1.5} />}
                onClick={() => handleOpenRestoreConfirm(row)}
                aria-label={`Restaurar sistema ${row.name}`}
                data-testid={`systems-restore-${row.id}`}
              >
                Restaurar
              </Button>
            )}
          </RowActions>
        ),
      });
    }

    return base;
  }, [
    canDeleteSystem,
    canRestoreSystem,
    canUpdateSystem,
    handleOpenDeleteConfirm,
    handleOpenEditModal,
    handleOpenRestoreConfirm,
  ]);

  const showOverlay = isFetching && !isInitialLoading;

  // ARIA-live: anuncia o estado da tabela quando muda. Em loading
  // subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos
  // o total. Em erro, o `<Alert role="alert">` já cobre.
  const liveMessage = useMemo<string>(() => {
    if (isInitialLoading) return 'Carregando lista de sistemas.';
    if (isFetching) return 'Atualizando lista de sistemas.';
    if (errorMessage) return '';
    if (total === 0) {
      return hasActiveSearch
        ? `Nenhum sistema encontrado para ${trimmedSearch}.`
        : 'Nenhum sistema cadastrado.';
    }
    return `${total} sistema(s) encontrado(s). Página ${page} de ${totalPages}.`;
  }, [
    total,
    errorMessage,
    hasActiveSearch,
    isFetching,
    isInitialLoading,
    page,
    totalPages,
    trimmedSearch,
  ]);

  return (
    <>
      <PageHeader
        eyebrow="01 Sistemas"
        title="Sistemas cadastrados"
        desc="Serviços registrados no ecossistema de autenticação. Cada sistema possui suas próprias rotas, roles e permissões."
      />

      {!hideStats && <SystemsStatsRow refreshKey={statsRefreshKey} client={client} />}

      <Toolbar>
        <SearchSlot>
          <Input
            label="Buscar"
            type="search"
            placeholder="Nome ou código do sistema"
            icon={<Search size={14} strokeWidth={1.5} />}
            value={searchTerm}
            onChange={handleSearchChange}
            aria-label="Buscar sistemas por nome ou código"
            data-testid="systems-search"
          />
        </SearchSlot>
        <ToolbarActions>
          <ToggleSlot>
            <Switch
              label="Mostrar inativos"
              helperText="Inclui sistemas com remoção lógica."
              checked={includeDeleted}
              onChange={handleIncludeDeletedChange}
              data-testid="systems-include-deleted"
            />
          </ToggleSlot>
          {canCreateSystem && (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} strokeWidth={1.75} />}
              onClick={handleOpenCreateModal}
              data-testid="systems-create-open"
            >
              Novo sistema
            </Button>
          )}
        </ToolbarActions>
      </Toolbar>

      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        data-testid="systems-live"
      >
        {liveMessage}
      </span>

      {isInitialLoading && (
        <InitialLoading data-testid="systems-loading">
          <Spinner size="lg" label="Carregando sistemas" />
        </InitialLoading>
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorBlock>
          <Alert variant="danger">{errorMessage}</Alert>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={14} strokeWidth={1.5} />}
            onClick={handleRefetch}
            data-testid="systems-retry"
          >
            Tentar novamente
          </Button>
        </ErrorBlock>
      )}

      {!isInitialLoading && !errorMessage && (
        <TableShell>
          <Table<SystemDto>
            caption="Lista de sistemas cadastrados no auth-service."
            columns={columns}
            data={rows}
            getRowKey={(row) => row.id}
            emptyState={emptyContent}
          />
          {showOverlay && (
            <TableOverlay aria-hidden="true" data-testid="systems-overlay">
              <Spinner size="md" label="Atualizando" />
            </TableOverlay>
          )}
        </TableShell>
      )}

      {!isInitialLoading && !errorMessage && total > 0 && (
        <FootBar>
          <PageInfo data-testid="systems-page-info">
            Página {page} de {totalPages} · {total} resultado(s)
          </PageInfo>
          <PageNav>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={14} strokeWidth={1.5} />}
              disabled={isFirstPage}
              onClick={handlePrevPage}
              aria-label="Ir para a página anterior"
              data-testid="systems-prev"
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={14} strokeWidth={1.5} />}
              disabled={isLastPage}
              onClick={handleNextPage}
              aria-label="Ir para a próxima página"
              data-testid="systems-next"
            >
              Próxima
            </Button>
          </PageNav>
        </FootBar>
      )}

      {canCreateSystem && (
        <NewSystemModal
          open={isCreateModalOpen}
          onClose={handleCloseCreateModal}
          onCreated={handleRefetch}
          client={client}
        />
      )}

      {canUpdateSystem && (
        <EditSystemModal
          open={editingSystem !== null}
          system={editingSystem}
          onClose={handleCloseEditModal}
          onUpdated={handleRefetch}
          client={client}
        />
      )}

      {canDeleteSystem && (
        <DeleteSystemConfirm
          open={deletingSystem !== null}
          system={deletingSystem}
          onClose={handleCloseDeleteConfirm}
          onDeleted={handleRefetch}
          client={client}
        />
      )}

      {canRestoreSystem && (
        <RestoreSystemConfirm
          open={restoringSystem !== null}
          system={restoringSystem}
          onClose={handleCloseRestoreConfirm}
          onRestored={handleRefetch}
          client={client}
        />
      )}
    </>
  );
};
