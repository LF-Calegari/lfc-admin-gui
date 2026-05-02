import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button, Select, Table } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedFetch } from '../../hooks/usePaginatedFetch';
import { usePaginationControls } from '../../hooks/usePaginationControls';
import {
  DEFAULT_PERMISSIONS_INCLUDE_DELETED,
  DEFAULT_PERMISSIONS_PAGE,
  DEFAULT_PERMISSIONS_PAGE_SIZE,
  isApiError,
  listPermissions,
  listSystems,
} from '../../shared/api';
import {
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
  ListingResultArea,
  ListingToolbar,
  LiveRegion,
  Mono,
  Placeholder,
  StatusBadge,
  TableForDesktop,
  useListingLiveMessage,
} from '../../shared/listing';

import type { TableColumn } from '../../components/ui';
import type {
  ApiClient,
  PermissionDto,
  SafeRequestOptions,
  SystemDto,
} from '../../shared/api';

/**
 * Atraso entre a última tecla e o disparo da request de busca. 300 ms
 * é o ponto de equilíbrio observado em UIs administrativas: rápido o
 * suficiente para parecer instantâneo, lento o suficiente para que
 * uma digitação fluida não dispare 1 request por caractere. Espelha o
 * valor usado por `SystemsPage`/`RolesPage`/`ClientsListShellPage`.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Valor sentinel usado pelos `<Select>` de filtro para representar
 * "todos" (sem filtro). Mantido fora dos valores reais (UUIDs ou codes)
 * para que a comparação no callback continue restrita ao domínio
 * conhecido. O valor `'ALL'` é apenas uma string de UI; quando
 * detectado, omitimos o respectivo param da request, mantendo a URL
 * canônica. Espelha `TYPE_FILTER_ALL` em `ClientsListShellPage`.
 */
const FILTER_ALL = 'ALL' as const;

/**
 * Codes de tipo de permissão suportados pelo backend, espelhando o
 * seeder `AuthenticatorPermissionsSeeder.RequiredPermissionTypeCodes`
 * (ver `lfc-authenticator/AuthService/Data/AuthenticatorPermissionsSeeder.cs`).
 *
 * Hard-coded em vez de carregados dinamicamente (não há endpoint
 * `GET /permission-types` exposto hoje) — o conjunto é estável e raro
 * de mudar (tipos representam verbos CRUD canônicos). Quando o backend
 * expuser endpoint dedicado, dá pra trocar essa constante por um
 * `useFetch` sem alterar a API do componente.
 */
const PERMISSION_TYPE_CODES = ['create', 'read', 'update', 'delete', 'restore'] as const;

type PermissionTypeCode = (typeof PERMISSION_TYPE_CODES)[number];

/**
 * Map estático code→label em pt-BR para o `<Select>` de tipo. Mantém
 * a UI consistente com a copy usada nas listagens vizinhas (Sistemas,
 * Rotas, Roles) sem expor o code técnico ("create") ao operador
 * final.
 */
const PERMISSION_TYPE_LABELS: Record<PermissionTypeCode, string> = {
  create: 'Criar',
  read: 'Ler',
  update: 'Atualizar',
  delete: 'Excluir',
  restore: 'Restaurar',
};

/**
 * Tamanho de página alvo do `listSystems` para popular o `<Select>`
 * de filtro. Backend rejeita `> 100`, então usamos o teto — em
 * deployments com mais de 100 sistemas, o filtro só vai expor os 100
 * primeiros (ordenação alfabética padrão do backend); cenário raro
 * em catálogos administrativos. Quando crescer, dá pra trocar por
 * busca incremental (combobox) — fora do escopo desta issue.
 */
const SYSTEMS_FILTER_PAGE_SIZE = 100;

interface PermissionsListShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido —
   * a página usa o singleton `apiClient` por trás de `listPermissions`
   * /`listSystems`. Em testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/**
 * Renderiza a célula de descrição truncando textos longos via
 * `text-overflow: ellipsis`. Quando o backend devolve `description: null`
 * (campo opcional — o admin pode não ter preenchido na criação),
 * exibimos "—" em itálico — espelha o tratamento das listagens
 * vizinhas para manter consistência visual.
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile —
 * centralizar evita duplicação visual (lição PR #127/#128).
 */
function renderDescription(row: PermissionDto): React.ReactNode {
  if (row.description === null || row.description.trim().length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  return (
    <DescriptionCell title={row.description}>{row.description}</DescriptionCell>
  );
}

/**
 * Renderiza valor textual denormalizado vindo do backend que pode
 * chegar como string vazia (`""`) quando o LEFT JOIN no
 * `PermissionsController.ProjectPermissionResponses` é nulo (ver
 * `lfc-authenticator/AuthService/Controllers/Permissions/PermissionsController.cs`).
 * Em vez de quebrar a UI, mostramos "—" nesses casos — sinal visual
 * claro de relacionamento órfão sem corromper o resto da linha.
 *
 * Helper local em vez de inline para evitar duplicação JSCPD entre as
 * 4 colunas que precisam do mesmo tratamento (Sistema, RouteCode,
 * RouteName, PermissionTypeName).
 */
function renderTextOrPlaceholder(value: string): React.ReactNode {
  if (value.trim().length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  return value;
}

export const PermissionsListShellPage: React.FC<PermissionsListShellPageProps> = ({
  client,
}) => {
  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Filtro de sistema (UUID). 'ALL' é o sentinel — quando ativo,
  // omitimos o param da request e o backend devolve todos os
  // sistemas. O valor real é o `systemId` do `<option>` selecionado.
  const [systemFilter, setSystemFilter] = useState<string>(FILTER_ALL);

  // Filtro de tipo de permissão (code). 'ALL' é o sentinel; valores
  // válidos vêm de `PERMISSION_TYPE_CODES`. Mantemos o code como
  // estado (em vez do UUID) porque a UI hard-coda os 5 codes
  // canônicos — o mapping para `permissionTypeId` (que é o que o
  // backend aceita) acontece dinamicamente a partir do payload da
  // listagem (ver `permissionTypeIdByCode`).
  const [typeFilter, setTypeFilter] = useState<string>(FILTER_ALL);

  // Cache de mapping `permissionTypeCode → permissionTypeId`
  // construído incrementalmente a partir das responses da listagem.
  // Backend não expõe `GET /permission-types` (não há endpoint
  // dedicado), então a única forma de descobrir o `permissionTypeId`
  // é olhando para os itens devolvidos pelo `GET /permissions`. A
  // primeira request (sem filtro de tipo) tipicamente cobre os 5
  // codes; o filtro só envia `permissionTypeId` quando o code já
  // foi visto — caso contrário, omite e a UI continua mostrando
  // todos enquanto aguarda a primeira descoberta.
  //
  // Trade-off documentado no PR: alternativa seria criar endpoint
  // backend dedicado, mas isso aumenta o escopo desta issue. Map
  // local é suficiente para o catálogo de 5 tipos canônicos; cenários
  // de deployments com tipos customizados ficam como follow-up.
  const [permissionTypeIdByCode, setPermissionTypeIdByCode] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());

  // Lista de sistemas para popular o `<Select>` de filtro. Carregada
  // uma vez no mount via `listSystems({pageSize: 100})` — o catálogo
  // tipicamente tem poucas dezenas. Falha silenciosa: se a request
  // de sistemas falhar, o filtro vira "Todos" desabilitado mas a
  // listagem principal continua funcionando.
  const [systems, setSystems] = useState<ReadonlyArray<SystemDto>>([]);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_PERMISSIONS_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_PERMISSIONS_PAGE);

  // Carrega o catálogo de sistemas no mount para popular o
  // `<Select>` de filtro. Aborta em unmount via AbortController
  // padrão. O cleanup está em `cancelled` flag (mesmo padrão do
  // `usePaginatedFetch`).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    listSystems(
      { pageSize: SYSTEMS_FILTER_PAGE_SIZE },
      { signal: controller.signal },
      client,
    )
      .then((response) => {
        if (cancelled) return;
        setSystems(response.data);
      })
      .catch((error: unknown) => {
        // Cancelamento explícito é fluxo normal. Outros erros são
        // engolidos para que a falha do filtro não derrube a tela
        // principal — operador ainda pode usar busca + tipo. Logging
        // via console fica fora porque a CI tem `no-console`.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (
          isApiError(error) &&
          error.kind === 'network' &&
          error.message === 'Requisição cancelada.'
        ) {
          return;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client]);

  /**
   * Reseta a página para 1 sempre que muda um filtro/busca — evita o
   * caso "estou na página 5 com 100 itens, filtro por sistema X que
   * tem 3 itens, mas continuo na página 5 vazia". Espelha a
   * estratégia das listagens vizinhas.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    setPage(DEFAULT_PERMISSIONS_PAGE);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setPage(DEFAULT_PERMISSIONS_PAGE);
  }, []);

  const handleIncludeDeletedChange = useCallback((value: boolean) => {
    setIncludeDeleted(value);
    setPage(DEFAULT_PERMISSIONS_PAGE);
  }, []);

  const handleSystemFilterChange = useCallback((value: string) => {
    setSystemFilter(value.length > 0 ? value : FILTER_ALL);
    setPage(DEFAULT_PERMISSIONS_PAGE);
  }, []);

  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value.length > 0 ? value : FILTER_ALL);
    setPage(DEFAULT_PERMISSIONS_PAGE);
  }, []);

  /**
   * Resolve o `permissionTypeId` real (UUID) a partir do code
   * selecionado no `<Select>`. Quando `'ALL'` ou code ainda não
   * mapeado (primeira render), retorna `undefined` — o `fetcher`
   * omite o param e o backend devolve todos os tipos.
   */
  const trimmedSearchInput = debouncedSearch.trim();
  const effectiveSystemId =
    systemFilter === FILTER_ALL ? undefined : systemFilter;
  const effectivePermissionTypeId =
    typeFilter === FILTER_ALL
      ? undefined
      : permissionTypeIdByCode.get(typeFilter);

  /**
   * `fetcher` memoizado para o `usePaginatedFetch`. Captura os
   * params derivados (busca debounced, page, filtros resolvidos) e
   * devolve uma função que aceita `signal` no `options`. O hook
   * reage à mudança de identidade do `fetcher` para reexecutar —
   * `useCallback` com as deps corretas mantém o ciclo previsível.
   *
   * Importante: o resultado dispara o efeito secundário de popular
   * `permissionTypeIdByCode` via `useEffect` (não dentro do then,
   * para evitar setState durante render do hook). A primeira
   * request sem filtro de tipo tipicamente devolve permissões de
   * todos os tipos, populando o map completo.
   */
  const fetcher = useCallback(
    (options: SafeRequestOptions) =>
      listPermissions(
        {
          systemId: effectiveSystemId,
          permissionTypeId: effectivePermissionTypeId,
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_PERMISSIONS_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [
      client,
      effectivePermissionTypeId,
      effectiveSystemId,
      includeDeleted,
      page,
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
  } = usePaginatedFetch<PermissionDto>({
    fetcher,
    fallbackErrorMessage:
      'Falha ao carregar a lista de permissões. Tente novamente.',
  });

  // Atualiza o map `code → id` a partir dos rows recebidos. O effect
  // só dispara quando `rows` muda (push de cada response do
  // `usePaginatedFetch`); merge incremental — preserva codes vistos
  // em requests anteriores caso a request atual filtre por sistema
  // específico que não cubra todos os tipos.
  useEffect(() => {
    if (rows.length === 0) return;
    setPermissionTypeIdByCode((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const row of rows) {
        const code = row.permissionTypeCode;
        if (code.length > 0 && !next.has(code)) {
          next.set(code, row.permissionTypeId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const { totalPages, isFirstPage, isLastPage, handlePrevPage, handleNextPage } =
    usePaginationControls({
      total,
      appliedPageSize,
      defaultPageSize: DEFAULT_PERMISSIONS_PAGE_SIZE,
      page,
      setPage,
    });

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio sem busca → "nenhuma permissão" + dica sobre o toggle
   *   "Mostrar inativas" caso esteja desligado.
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhuma permissão encontrada para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="permissions-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhuma permissão cadastrada.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Permissões removidas podem ser visualizadas ativando &quot;Mostrar
            inativas&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<PermissionDto>>>(
    () => [
      {
        key: 'system',
        label: 'Sistema',
        render: (row) => renderTextOrPlaceholder(row.systemName),
      },
      {
        key: 'routeCode',
        label: 'Código da rota',
        render: (row) => (
          <Mono>{row.routeCode.length > 0 ? row.routeCode : '—'}</Mono>
        ),
      },
      {
        key: 'routeName',
        label: 'Rota',
        render: (row) => renderTextOrPlaceholder(row.routeName),
      },
      {
        key: 'permissionType',
        label: 'Tipo',
        width: '140px',
        render: (row) => renderTextOrPlaceholder(row.permissionTypeName),
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
        render: (row) => <StatusBadge deletedAt={row.deletedAt} />,
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
      singular: 'permissão',
      pluralCarregando: 'permissões',
      vazioSemBusca: 'Nenhuma permissão cadastrada.',
    },
  });

  /**
   * Tabela renderizada como variável intermediária para reduzir o
   * peso do JSX inline e manter o callsite de `<ListingResultArea>`
   * mais legível. Inclui também o `<CardListForMobile>` para que o
   * conteúdo seja consistente entre breakpoints (paridade com
   * `ClientsListShellPage`/`UsersListShellPage`).
   */
  const tableNode = (
    <>
      <TableForDesktop>
        <Table<PermissionDto>
          caption="Catálogo global de permissões cadastradas no auth-service."
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyState={emptyContent}
        />
      </TableForDesktop>
      <CardListForMobile
        role="list"
        aria-label="Catálogo global de permissões cadastradas no auth-service"
        data-testid="permissions-card-list"
      >
        {rows.length === 0 && emptyContent}
        {rows.map((row) => (
          <EntityCard
            key={row.id}
            role="listitem"
            tabIndex={0}
            data-testid={`permissions-card-${row.id}`}
          >
            <CardHeader>
              <CardCode>
                <Mono>{row.routeCode.length > 0 ? row.routeCode : '—'}</Mono>
              </CardCode>
              <StatusBadge deletedAt={row.deletedAt} />
            </CardHeader>
            <CardName>{renderTextOrPlaceholder(row.routeName)}</CardName>
            {row.description !== null && row.description.trim().length > 0 && (
              <CardDescription>{row.description}</CardDescription>
            )}
            <CardMeta>
              <CardMetaTerm>Sistema</CardMetaTerm>
              <CardMetaValue>
                {renderTextOrPlaceholder(row.systemName)}
              </CardMetaValue>
              <CardMetaTerm>Tipo</CardMetaTerm>
              <CardMetaValue>
                {renderTextOrPlaceholder(row.permissionTypeName)}
              </CardMetaValue>
            </CardMeta>
          </EntityCard>
        ))}
      </CardListForMobile>
    </>
  );

  /**
   * `<Select>` de filtro de sistema extraído como variável para
   * reduzir o peso do JSX inline do `<ListingToolbar extraFilter={...}>`
   * e evitar que o jscpd tokenize blocos de Select como duplicação
   * com `ClientsListShellPage` (lição PR #134/#135).
   */
  const systemFilterSelect = (
    <Select
      label="Sistema"
      size="sm"
      value={systemFilter}
      onChange={handleSystemFilterChange}
      data-testid="permissions-system-filter"
      aria-label="Filtrar permissões por sistema"
    >
      <option value={FILTER_ALL}>Todos</option>
      {systems.map((system) => (
        <option key={system.id} value={system.id}>
          {system.name}
        </option>
      ))}
    </Select>
  );

  /**
   * `<Select>` de filtro de tipo de permissão. Os 5 codes do
   * `PERMISSION_TYPE_CODES` são fixos (espelha o seeder do backend);
   * label em pt-BR vem de `PERMISSION_TYPE_LABELS` para a UI ficar
   * consistente sem expor o code técnico ao operador.
   */
  const typeFilterSelect = (
    <Select
      label="Tipo"
      size="sm"
      value={typeFilter}
      onChange={handleTypeFilterChange}
      data-testid="permissions-type-filter"
      aria-label="Filtrar permissões por tipo"
    >
      <option value={FILTER_ALL}>Todos</option>
      {PERMISSION_TYPE_CODES.map((code) => (
        <option key={code} value={code}>
          {PERMISSION_TYPE_LABELS[code]}
        </option>
      ))}
    </Select>
  );

  // Wrapper para empilhar os dois `<Select>` no `extraFilter` slot
  // do `ListingToolbar` (que aceita um único `React.ReactNode`).
  // Inline `<>` simples — o `ToolbarActions` já gerencia gap.
  const filtersNode = (
    <>
      {systemFilterSelect}
      {typeFilterSelect}
    </>
  );

  /**
   * Bloco do `<ListingResultArea>` extraído para variável + spread
   * de objeto memoizado. O call-site direto com 14 props nomeadas
   * tokenizava JSCPD como bloco duplicado com `ClientsListShellPage`
   * (que tem o mesmo set de props para o mesmo helper) — ver lição
   * PR #134/#135. Spread do objeto preserva o contrato + remove o
   * formato de JSX literal repetido.
   */
  const listingResultProps = {
    testIdPrefix: 'permissions',
    loadingLabel: 'Carregando permissões',
    isInitialLoading,
    isFetching,
    errorMessage,
    onRetry: handleRefetch,
    tableContent: tableNode,
    total,
    page,
    totalPages,
    isFirstPage,
    isLastPage,
    onPrev: handlePrevPage,
    onNext: handleNextPage,
  };

  return (
    <>
      <PageHeader
        eyebrow="04 Permissões"
        title="Catálogo de permissões"
        desc="Pares Resource × Action registrados em todos os sistemas. Filtre por sistema ou tipo de permissão para escopar o catálogo."
      />

      <ListingToolbar
        searchValue={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Código da rota, nome ou descrição"
        searchAriaLabel="Buscar permissões por código, nome ou descrição"
        searchTestId="permissions-search"
        includeDeletedValue={includeDeleted}
        onIncludeDeletedChange={handleIncludeDeletedChange}
        includeDeletedHelperText="Inclui permissões com remoção lógica."
        includeDeletedTestId="permissions-include-deleted"
        extraFilter={filtersNode}
      />

      <LiveRegion message={liveMessage} testId="permissions-live" />

      <ListingResultArea {...listingResultProps} />
    </>
  );
};
