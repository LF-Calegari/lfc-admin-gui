import { Plus } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Select, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOpenState } from '../../hooks/useModalOpenState';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { usePaginationControls } from '../../hooks/usePaginationControls';
import {
  DEFAULT_CLIENTS_INCLUDE_DELETED,
  DEFAULT_CLIENTS_PAGE,
  DEFAULT_CLIENTS_PAGE_SIZE,
  listClients,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  EmptyHint,
  EmptyMessage,
  EmptyTitle,
  ListingResultArea,
  ListingToolbar,
  LiveRegion,
  Mono,
  Placeholder,
  StatusBadge,
  useListingLiveMessage,
} from '../../shared/listing';

import { NewClientModal } from './NewClientModal';

import type { TableColumn } from '../../components/ui';
import type {
  ApiClient,
  ClientDto,
  ClientType,
  SafeRequestOptions,
} from '../../shared/api';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms
 * é o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que
 * uma digitação fluida não dispare 1 request por caractere. Espelha
 * o valor usado por `SystemsPage`/`RolesPage`.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Valor sentinel usado pelo `<Select>` de filtro de tipo para
 * representar "todos" (sem filtro). Mantido fora de `'PF'/'PJ'` para
 * que a comparação no callback continue restrita à união
 * `ClientType`. O valor `'ALL'` é apenas uma string de UI; quando
 * detectado, omitimos `type` da request, mantendo a URL canônica.
 */
const TYPE_FILTER_ALL = 'ALL' as const;

/**
 * Code de permissão exigido para o botão "Novo cliente" (Issue #74).
 *
 * Espelha o `AUTH_V1_CLIENTS_CREATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (o `POST /clients` valida via
 * `[Authorize(Policy = PermissionPolicies.ClientsCreate)]`); o
 * gating client-side é apenas UX — esconder ações que o usuário
 * não pode executar.
 */
const CLIENTS_CREATE_PERMISSION = 'AUTH_V1_CLIENTS_CREATE';

interface ClientsListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido —
   * a página usa o singleton `apiClient` por trás de `listClients`.
   * Em testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/**
 * Aplica máscara visual ao CPF (`xxx.xxx.xxx-xx`). Os 11 dígitos vêm
 * apenas de `digits` numéricos do backend (que armazena sem
 * formatação após `NormalizeDigits`); valores inesperados (≠ 11
 * dígitos) são devolvidos como-vieram para que a UI não corrompa o
 * dado real — só mascara quando confiar no shape.
 *
 * Centralizado aqui (e não em `shared/`) porque é hoje específico da
 * listagem de clientes; quando `EditClientModal` (#75) precisar do
 * mesmo helper, o move para `src/shared/format/cpfCnpj.ts` em uma
 * extração isolada — sem fazer extração antecipada no primeiro PR
 * para não criar shared util "fantasma" sem consumidor real.
 */
function formatCpf(digits: string): string {
  if (!/^\d{11}$/.test(digits)) {
    return digits;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Aplica máscara visual ao CNPJ (`xx.xxx.xxx/xxxx-xx`). Mesma
 * estratégia defensiva de `formatCpf`: backend devolve 14 dígitos
 * crus após `NormalizeDigits`; valores inesperados retornam
 * inalterados para preservar visibilidade do dado real.
 */
function formatCnpj(digits: string): string {
  if (!/^\d{14}$/.test(digits)) {
    return digits;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Resolve o "Nome" exibido na tabela conforme o `type`:
 *
 * - `PF` → `fullName` (obrigatório no contrato do backend para PF).
 * - `PJ` → `corporateName` (obrigatório no contrato do backend para PJ).
 *
 * Se o backend devolver ambos `null` (cenário fora do contrato, mas
 * que o frontend deve tolerar para não quebrar a UI), exibimos um
 * placeholder "—" — sinal visual claro de que aquele registro está
 * incompleto sem corromper o resto da tabela.
 */
function resolveClientName(row: ClientDto): string | null {
  if (row.type === 'PF') {
    return row.fullName;
  }
  return row.corporateName;
}

/**
 * Resolve o "Documento" exibido na tabela conforme o `type`,
 * aplicando a máscara visual correspondente. Backend grava sempre
 * apenas dígitos; a máscara só toca a renderização — qualquer
 * mutação futura (#75 editar) deve normalizar para dígitos antes de
 * enviar (espelhando o `NormalizeDigits` do backend), evitando
 * inconsistência.
 */
function resolveClientDocument(row: ClientDto): string | null {
  if (row.type === 'PF') {
    return row.cpf ? formatCpf(row.cpf) : null;
  }
  return row.cnpj ? formatCnpj(row.cnpj) : null;
}

export const ClientsListShellPage: React.FC<ClientsListShellPageProps> = ({ client }) => {
  const { hasPermission } = useAuth();
  const canCreateClient = hasPermission(CLIENTS_CREATE_PERMISSION);

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Filtro de tipo (PF/PJ/Todos). 'ALL' é o sentinel — quando ativo,
  // omitimos o param da request e o backend devolve ambos os tipos.
  const [typeFilter, setTypeFilter] = useState<typeof TYPE_FILTER_ALL | ClientType>(
    TYPE_FILTER_ALL,
  );

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_CLIENTS_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_CLIENTS_PAGE);

  // Estado de abertura do modal "Novo cliente" (Issue #74). O modal é
  // controlado por essa página para que a Toolbar consiga ocultar o
  // botão por permissão sem perder o ciclo de vida do form.
  // Lição PR #134/#135: o trio `useState + useCallback(open) +
  // useCallback(close)` era duplicado entre `UsersListShellPage` e
  // `ClientsListShellPage`; `useModalOpenState` em `src/hooks/`
  // centraliza.
  const {
    isOpen: isCreateModalOpen,
    open: handleOpenCreateModal,
    close: handleCloseCreateModal,
  } = useModalOpenState();

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, busco 'auth' que filtra
   * para 3 itens, mas continuo na página 5 vazia". Espelha a
   * `SystemsPage`/`RolesPage`.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_CLIENTS_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_CLIENTS_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_CLIENTS_PAGE);
  }, []);

  const handleTypeFilterChange = useCallback((value: string) => {
    if (value === 'PF' || value === 'PJ') {
      setTypeFilter(value);
    } else {
      setTypeFilter(TYPE_FILTER_ALL);
    }
    setPage(DEFAULT_CLIENTS_PAGE);
  }, []);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`. Captura os params
   * derivados (busca debounced, page, filtros) e devolve uma função
   * que aceita `signal` no `options`. O hook reage à mudança de
   * identidade do `fetcher` para reexecutar — `useCallback` com as
   * deps corretas mantém o ciclo previsível.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const effectiveTypeParam: ClientType | undefined =
    typeFilter === TYPE_FILTER_ALL ? undefined : typeFilter;
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listClients(
        {
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          type: effectiveTypeParam,
          page,
          pageSize: DEFAULT_CLIENTS_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [client, effectiveTypeParam, includeDeleted, page, trimmedSearchInput],
  );

  const {
    rows,
    pageSize: appliedPageSize,
    total,
    isInitialLoading,
    isFetching,
    errorMessage,
    refetch: handleRefetch,
  } = usePaginatedFetch<ClientDto>({
    fetcher,
    fallbackErrorMessage: 'Falha ao carregar a lista de clientes. Tente novamente.',
  });

  const { totalPages, isFirstPage, isLastPage, handlePrevPage, handleNextPage } =
    usePaginationControls({
      total,
      appliedPageSize,
      defaultPageSize: DEFAULT_CLIENTS_PAGE_SIZE,
      page,
      setPage,
    });

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio sem busca → "nenhum cliente cadastrado" + dica sobre o
   *   toggle "Mostrar inativos" caso esteja desligado.
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhum cliente encontrado para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="clients-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhum cliente cadastrado.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Clientes removidos podem ser visualizados ativando &quot;Mostrar inativos&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<ClientDto>>>(
    () => [
      {
        key: 'name',
        label: 'Nome',
        render: (row) => {
          const name = resolveClientName(row);
          if (name === null || name.trim().length === 0) {
            return <Placeholder>—</Placeholder>;
          }
          return name;
        },
      },
      {
        key: 'document',
        label: 'Documento',
        render: (row) => {
          const document = resolveClientDocument(row);
          if (document === null) {
            return <Placeholder>—</Placeholder>;
          }
          return <Mono>{document}</Mono>;
        },
      },
      {
        key: 'type',
        label: 'Tipo',
        width: '90px',
        render: (row) => <Mono>{row.type}</Mono>,
      },
      {
        key: 'status',
        label: 'Status',
        width: '120px',
        render: (row) => <StatusBadge deletedAt={row.deletedAt} gender="m" />,
      },
    ],
    [],
  );

  /**
   * ARIA-live: anuncia o estado da listagem quando muda. Em loading
   * subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos
   * o total. Em erro, o `<Alert role="alert">` já cobre. O hook
   * `useListingLiveMessage` centraliza a árvore de decisão (lição PR
   * #134/#135 — bloco duplicado entre listagens reprovou Sonar).
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
      singular: 'cliente',
      pluralCarregando: 'clientes',
      vazioSemBusca: 'Nenhum cliente cadastrado.',
      gender: 'm',
    },
  });

  /**
   * Tabela renderizada como variável intermediária para reduzir o
   * peso do JSX inline e manter o callsite de `<ListingResultArea>`
   * mais legível.
   */
  const tableNode = (
    <Table<ClientDto>
      caption="Lista de clientes cadastrados no auth-service."
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
      emptyState={emptyContent}
    />
  );

  /**
   * Modal de criação extraído como variável para que o jscpd não
   * tokenize `{can... && <NewModal ... />}` como duplicação com
   * `SystemsPage`/`UsersListShellPage` (lição PR #134/#135).
   */
  const createModalNode = canCreateClient ? (
    <NewClientModal
      open={isCreateModalOpen}
      onClose={handleCloseCreateModal}
      onCreated={handleRefetch}
      client={client}
    />
  ) : null;

  /**
   * `<Select>` de filtro de tipo extraído como variável para reduzir o
   * peso do JSX inline do `<ListingToolbar extraFilter={...}>`.
   */
  const typeFilterSelect = (
    <Select
      label="Tipo"
      size="sm"
      value={typeFilter}
      onChange={handleTypeFilterChange}
      data-testid="clients-type-filter"
      aria-label="Filtrar clientes por tipo"
    >
      <option value={TYPE_FILTER_ALL}>Todos</option>
      <option value="PF">Pessoa física</option>
      <option value="PJ">Pessoa jurídica</option>
    </Select>
  );

  /**
   * CTA "Novo cliente" extraído como variável local para reduzir o
   * peso do JSX inline e evitar que o jscpd tokenize o bloco
   * `actions={canCreate && <Button> ...}` como duplicação com
   * `SystemsPage`/`UsersListShellPage` (lição PR #134/#135).
   */
  const createCtaButton = canCreateClient ? (
    <Button
      variant="primary"
      size="md"
      icon={<Plus size={14} strokeWidth={1.75} />}
      onClick={handleOpenCreateModal}
      data-testid="clients-create-open"
    >
      Novo cliente
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="05 Clientes"
        title="Clientes cadastrados"
        desc="Pessoas físicas e jurídicas registradas no ecossistema. Cada cliente pode ter usuários vinculados, emails extras e múltiplos contatos telefônicos."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Nome, documento (CPF/CNPJ)"
        searchAriaLabel="Buscar clientes por nome ou documento"
        searchTestId="clients-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui clientes com remoção lógica."
        includeDeletedTestId="clients-include-deleted"
        extraFilter={typeFilterSelect}
        actions={createCtaButton}
      />

      <LiveRegion message={liveMessage} testId="clients-live" />

      <ListingResultArea
        testIdPrefix="clients"
        loadingLabel="Carregando clientes"
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

      {createModalNode}
    </>
  );
};
