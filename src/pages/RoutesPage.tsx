import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Alert, Badge, Button, Input, Spinner, Switch, Table } from '../components/ui';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePaginatedFetch } from '../hooks/usePaginatedFetch';
import {
  DEFAULT_ROUTES_INCLUDE_DELETED,
  DEFAULT_ROUTES_PAGE,
  DEFAULT_ROUTES_PAGE_SIZE,
  listRoutes,
} from '../shared/api';

import type { TableColumn } from '../components/ui';
import type { ApiClient, RouteDto, SafeRequestOptions } from '../shared/api';

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

interface RoutesPageProps {
  /**
   * Cliente HTTP injetável para isolar testes. Em produção, omitido — a
   * página usa o singleton `apiClient` por trás de `listRoutes`. Em
   * testes, o caller passa um stub tipado.
   */
  client?: ApiClient;
}

/* ─── Styled primitives ──────────────────────────────────── */

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-decoration: none;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  margin-left: -4px;

  &:hover {
    color: var(--fg2);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }
`;

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
 * Visibilidade da `Table` (desktop) e do bloco de cards (mobile). A
 * `Table` do design system é HTML semântico — em mobile fica oculta para
 * favorecer a leitura em coluna única via cards (critério da issue
 * "quebra responsiva mostra cards"). O switch acontece em
 * `--bp-md` (48em ≈ 768px), espelhando o breakpoint usado no resto do
 * shell.
 */
const TableForDesktop = styled.div`
  display: none;

  @media (min-width: 48em) {
    display: block;
  }
`;

const CardListForMobile = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  @media (min-width: 48em) {
    display: none;
  }
`;

/**
 * Card individual da listagem mobile. Mantém os mesmos campos da tabela
 * (código, descrição, política JWT alvo, status) com hierarquia tipográfica
 * dedicada — o monoespaçado destaca o `code`, a descrição segue em
 * parágrafo legível e o token type aparece como Badge pequeno.
 */
const RouteCard = styled.article`
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: background var(--duration-fast) var(--ease-default);

  &:hover {
    background: var(--bg-ghost-hover);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }
`;

const CardHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
`;

const CardCode = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--fg1);
  font-weight: var(--weight-medium);
  word-break: break-word;
`;

const CardName = styled.h3`
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: -0.01em;
`;

const CardDescription = styled.p`
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-base);
`;

const CardMeta = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-xs);
`;

const CardMetaTerm = styled.dt`
  font-family: var(--font-mono);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
`;

const CardMetaValue = styled.dd`
  margin: 0;
  font-family: var(--font-mono);
  color: var(--fg2);
  word-break: break-word;
`;

/**
 * Overlay leve aplicado em cima da listagem durante refetches subsequentes
 * (busca/paginação/toggle). Mantém os dados anteriores visíveis para
 * evitar flicker enquanto sinaliza atividade — o spinner ancorado ao
 * topo deixa claro que algo está em curso sem mover a tabela. Espelha o
 * padrão da `SystemsPage`.
 */
const Overlay = styled.div`
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

const DescriptionCell = styled.span`
  display: inline-block;
  max-width: 36ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg2);
`;

const Placeholder = styled.span`
  color: var(--text-muted);
  font-style: italic;
`;

const InvalidIdNotice = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
`;

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Calcula a quantidade total de páginas a partir do `total` filtrado e
 * do `pageSize` aplicado. Com `total === 0`, devolve `1` para que os
 * controles de paginação sigam exibindo "página 1 de 1" (e ambos prev/
 * next apareçam desabilitados) — preserva consistência visual no estado
 * vazio. Espelha o helper da `SystemsPage` (centralizar em módulo
 * compartilhado vai acontecer quando ≥ 3 listagens reusarem; por
 * enquanto, mantemos local em cada página para evitar abstração
 * prematura — duas instâncias é ainda "regra de três" não atingida).
 */
function computeTotalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

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
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Renderiza a célula da política JWT alvo. O backend devolve string
 * vazia em `systemTokenTypeCode`/`systemTokenTypeName` quando o
 * SystemTokenType referenciado foi soft-deletado pós-criação (LEFT JOIN
 * intencional no controller — a rota fica órfã até o admin restaurar o
 * token type ou alterar a referência). A UI sinaliza isso com "—".
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile —
 * centralizar evita duplicação visual (lição PR #127/#128).
 */
function renderTokenPolicy(row: RouteDto): React.ReactNode {
  if (row.systemTokenTypeCode.length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  return (
    <Badge variant="info" dot>
      {row.systemTokenTypeName.length > 0
        ? row.systemTokenTypeName
        : row.systemTokenTypeCode}
    </Badge>
  );
}

/**
 * Renderiza a célula de descrição truncando textos longos via
 * `text-overflow: ellipsis`. Quando o backend devolve `description: null`
 * (campo opcional), exibimos "—" em itálico — espelha o tratamento de
 * `systemTokenTypeCode` vazio para manter consistência visual.
 */
function renderDescription(row: RouteDto): React.ReactNode {
  if (row.description === null || row.description.trim().length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  return <DescriptionCell title={row.description}>{row.description}</DescriptionCell>;
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

  // Termo digitado pelo usuário em tempo real (input controlado).
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const [includeDeleted, setIncludeDeleted] = useState<boolean>(
    DEFAULT_ROUTES_INCLUDE_DELETED,
  );
  const [page, setPage] = useState<number>(DEFAULT_ROUTES_PAGE);

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
    setSearchTerm('');
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
          systemId: hasValidSystemId ? systemId : '',
          q: trimmedSearchInput.length > 0 ? trimmedSearchInput : undefined,
          page,
          pageSize: DEFAULT_ROUTES_PAGE_SIZE,
          includeDeleted,
        },
        options,
        client,
      ),
    [client, hasValidSystemId, includeDeleted, page, systemId, trimmedSearchInput],
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
    skip: !hasValidSystemId,
  });

  const totalPages = useMemo(
    () => computeTotalPages(total, appliedPageSize > 0 ? appliedPageSize : DEFAULT_ROUTES_PAGE_SIZE),
    [appliedPageSize, total],
  );

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  const handlePrevPage = useCallback(() => {
    setPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((prev) => (prev < totalPages ? prev + 1 : prev));
  }, [totalPages]);

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  /**
   * Decide qual mensagem renderizar quando `rows` está vazio:
   *
   * - Vazio com busca ativa → cita o termo + sugere limpar.
   * - Vazio sem busca → "nenhuma rota cadastrada" + dica sobre o toggle
   *   "Mostrar inativos" caso esteja desligado.
   */
  const emptyContent = useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            Nenhuma rota encontrada para <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSearch}
            data-testid="routes-empty-clear"
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>Nenhuma rota cadastrada para este sistema.</EmptyTitle>
        {!includeDeleted && (
          <EmptyHint>
            Rotas removidas podem ser visualizadas ativando &quot;Mostrar inativas&quot;.
          </EmptyHint>
        )}
      </EmptyMessage>
    );
  }, [handleClearSearch, hasActiveSearch, includeDeleted, trimmedSearch]);

  const columns = useMemo<ReadonlyArray<TableColumn<RouteDto>>>(
    () => [
      {
        key: 'code',
        label: 'Código',
        render: (row) => <Mono>{row.code}</Mono>,
      },
      {
        key: 'description',
        label: 'Descrição',
        render: renderDescription,
      },
      {
        key: 'tokenPolicy',
        label: 'Política JWT alvo',
        width: '200px',
        render: renderTokenPolicy,
      },
      {
        key: 'status',
        label: 'Status',
        width: '120px',
        render: (row) =>
          row.deletedAt ? (
            <Badge variant="danger" dot>
              Inativa
            </Badge>
          ) : (
            <Badge variant="success" dot>
              Ativa
            </Badge>
          ),
      },
    ],
    [],
  );

  const showOverlay = isFetching && !isInitialLoading;

  // ARIA-live: anuncia o estado da listagem quando muda. Em loading
  // subsequente, anunciamos "Atualizando..."; em sucesso, anunciamos o
  // total. Em erro, o `<Alert role="alert">` já cobre.
  const liveMessage = useMemo<string>(() => {
    if (isInitialLoading) return 'Carregando lista de rotas.';
    if (isFetching) return 'Atualizando lista de rotas.';
    if (errorMessage) return '';
    if (total === 0) {
      return hasActiveSearch
        ? `Nenhuma rota encontrada para ${trimmedSearch}.`
        : 'Nenhuma rota cadastrada para este sistema.';
    }
    return `${total} rota(s) encontrada(s). Página ${page} de ${totalPages}.`;
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

      <Toolbar>
        <SearchSlot>
          <Input
            label="Buscar"
            type="search"
            placeholder="Código da rota"
            icon={<Search size={14} strokeWidth={1.5} />}
            value={searchTerm}
            onChange={handleSearchChange}
            aria-label="Buscar rotas por código"
            data-testid="routes-search"
          />
        </SearchSlot>
        <ToolbarActions>
          <Switch
            label="Mostrar inativas"
            helperText="Inclui rotas com remoção lógica."
            checked={includeDeleted}
            onChange={handleIncludeDeletedChange}
            data-testid="routes-include-deleted"
          />
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
        data-testid="routes-live"
      >
        {liveMessage}
      </span>

      {isInitialLoading && (
        <InitialLoading data-testid="routes-loading">
          <Spinner size="lg" label="Carregando rotas" />
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
            data-testid="routes-retry"
          >
            Tentar novamente
          </Button>
        </ErrorBlock>
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
              <RouteCard
                key={row.id}
                role="listitem"
                tabIndex={0}
                data-testid={`routes-card-${row.id}`}
              >
                <CardHeader>
                  <CardCode>{row.code}</CardCode>
                  {row.deletedAt ? (
                    <Badge variant="danger" dot>
                      Inativa
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Ativa
                    </Badge>
                  )}
                </CardHeader>
                <CardName>{row.name}</CardName>
                {row.description !== null && row.description.trim().length > 0 && (
                  <CardDescription>{row.description}</CardDescription>
                )}
                <CardMeta>
                  <CardMetaTerm>JWT</CardMetaTerm>
                  <CardMetaValue>{renderTokenPolicy(row)}</CardMetaValue>
                </CardMeta>
              </RouteCard>
            ))}
          </CardListForMobile>
          {showOverlay && (
            <Overlay aria-hidden="true" data-testid="routes-overlay">
              <Spinner size="md" label="Atualizando" />
            </Overlay>
          )}
        </TableShell>
      )}

      {!isInitialLoading && !errorMessage && total > 0 && (
        <FootBar>
          <PageInfo data-testid="routes-page-info">
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
              data-testid="routes-prev"
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
              data-testid="routes-next"
            >
              Próxima
            </Button>
          </PageNav>
        </FootBar>
      )}
    </>
  );
};
