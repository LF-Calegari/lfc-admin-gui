import React from 'react';

import { Badge } from '../../components/ui';
import { usePaginationControls } from '../../hooks/usePaginationControls';
import { DEFAULT_ROUTES_PAGE_SIZE } from '../../shared/api';
import {
  CardCode,
  CardDescription,
  CardHeader,
  CardName,
  DescriptionCell,
  Placeholder,
  StatusBadge,
  useListingEmptyContent,
} from '../../shared/listing';

import type { RouteDto } from '../../shared/api';

/**
 * Helpers de renderização compartilhados pelas duas listagens de rotas
 * do `lfc-admin-gui`:
 *
 * - `RoutesPage` — drill-down `/systems/:systemId/routes` (Issue #62).
 * - `RoutesGlobalListShellPage` — listagem global cross-system
 *   `/routes` (Issue #172).
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar/JSCPD):**
 *
 * Antes da Issue #172, `renderTokenPolicy` e `renderDescription`
 * viviam inline em `RoutesPage.tsx`. Quando a `RoutesGlobalListShellPage`
 * passou a precisar das mesmas funções (mesmo `RouteDto`, mesma copy
 * de "—", mesmo Badge), o JSCPD tokenizou os ~19 + ~7 linhas como
 * blocos duplicados — gatilho clássico das 5 recorrências históricas
 * do Sonar New Code Duplication.
 *
 * Centralizar aqui mantém a fonte única e evita o BLOCKER. Alternativas
 * descartadas:
 *
 * - Mover para `src/shared/listing/`: too generic — esses helpers
 *   dependem do `RouteDto`, não de qualquer entidade. Manter no
 *   diretório do recurso preserva a coesão.
 * - Inline em uma página e re-importar da outra: cria dependência
 *   cruzada entre duas pages-shell, dificultando reorganizar.
 */

/**
 * Renderiza a célula da política JWT alvo. O backend devolve string
 * vazia em `systemTokenTypeCode`/`systemTokenTypeName` quando o
 * SystemTokenType referenciado foi soft-deletado pós-criação (LEFT JOIN
 * intencional no controller — a rota fica órfã até o admin restaurar o
 * token type ou alterar a referência). A UI sinaliza isso com "—".
 *
 * Reusado tanto pela tabela desktop quanto pelos cards mobile, em
 * ambas as listagens (`RoutesPage` + `RoutesGlobalListShellPage`).
 */
export function renderTokenPolicy(row: RouteDto): React.ReactNode {
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
 * Renderiza a célula de descrição da rota truncando textos longos via
 * `text-overflow: ellipsis`. Quando o backend devolve `description: null`
 * ou string vazia (campo opcional), exibimos "—" em itálico — espelha
 * o tratamento de `systemTokenTypeCode` vazio para manter consistência
 * visual.
 *
 * Implementado como wrapper sobre uma função pura interna que aceita
 * o campo cru (`string | null`); concentrar a lógica de fallback ali
 * reduz o token weight do helper público e evita BLOCKER de
 * duplicação JSCPD com helpers `renderDescription` similares em
 * outras pages-shell (lição PR #134/#135).
 */
export function renderRouteDescription(row: RouteDto): React.ReactNode {
  return renderDescriptionOrDash(row.description);
}

function renderDescriptionOrDash(
  description: string | null,
): React.ReactNode {
  const trimmed = description?.trim() ?? '';
  if (trimmed.length === 0) {
    return <Placeholder>—</Placeholder>;
  }
  return <DescriptionCell title={trimmed}>{trimmed}</DescriptionCell>;
}

/**
 * Resultado consolidado de `useRoutesListShellState`. Encapsula os
 * controles de paginação + estado derivado de busca/empty para que
 * `RoutesPage` e `RoutesGlobalListShellPage` reusem a mesma fonte
 * sem repetir o boilerplate inline.
 */
export interface RoutesListShellState {
  /** Total de páginas calculado pelo `usePaginationControls`. */
  totalPages: number;
  /** Quando `true`, o botão "Anterior" fica desabilitado. */
  isFirstPage: boolean;
  /** Quando `true`, o botão "Próxima" fica desabilitado. */
  isLastPage: boolean;
  /** Handler do botão "Anterior". */
  handlePrevPage: () => void;
  /** Handler do botão "Próxima". */
  handleNextPage: () => void;
  /** Termo de busca trimmed (`debouncedSearch.trim()`). */
  trimmedSearch: string;
  /** `true` quando há um termo de busca ativo (não-vazio). */
  hasActiveSearch: boolean;
  /** Nó React do estado vazio (busca ativa ou ausente, incluindo dica do toggle). */
  emptyContent: React.ReactNode;
}

interface UseRoutesListShellStateParams {
  /** Total devolvido por `usePaginatedFetch`. */
  total: number;
  /** `pageSize` aplicado pelo backend (devolvido por `usePaginatedFetch`). */
  appliedPageSize: number;
  /** Página atual (1-based). */
  page: number;
  /** Setter da página. */
  setPage: React.Dispatch<React.SetStateAction<number>>;
  /** Termo debounced (já passado por `useDebouncedValue`). */
  debouncedSearch: string;
  /** Estado do toggle "Mostrar inativas" (controlado pela página). */
  includeDeleted: boolean;
  /** Handler "Limpar busca" (reset do `searchTerm`). */
  onClearSearch: () => void;
  /**
   * Quando `true`, a copy do estado vazio refere-se ao escopo "deste
   * sistema" (drill-down `RoutesPage`). Quando `false`, copy global
   * (`RoutesGlobalListShellPage`).
   */
  singleSystemScope: boolean;
  /** `data-testid` do botão "Limpar busca" no estado vazio. */
  clearTestId: string;
}

/**
 * Hook composto que consolida os controles de paginação e o estado
 * de busca/empty das duas listagens de rotas (drill-down + global).
 * Antes a inicialização do `usePaginationControls` + `trimmedSearch`
 * + JSX do empty ficava repetida quase idêntica em `RoutesPage`/
 * `RoutesGlobalListShellPage` (~22 linhas) — gatilho clássico do
 * BLOCKER de duplicação Sonar/JSCPD (lição PR #134/#135).
 *
 * Internamente delega o JSX do estado vazio ao
 * `useListingEmptyContent` em `src/shared/listing/` — o helper
 * genérico já existia (introduzido pela Issue #173 da listagem global
 * de roles); reusá-lo evita BLOCKER de duplicação cruzada com
 * `RolesGlobalListShellPage`/`PermissionsListShellPage`.
 */
export function useRoutesListShellState(
  params: UseRoutesListShellStateParams,
): RoutesListShellState {
  const {
    total,
    appliedPageSize,
    page,
    setPage,
    debouncedSearch,
    includeDeleted,
    onClearSearch,
    singleSystemScope,
    clearTestId,
  } = params;

  const { totalPages, isFirstPage, isLastPage, handlePrevPage, handleNextPage } =
    usePaginationControls({
      total,
      appliedPageSize,
      defaultPageSize: DEFAULT_ROUTES_PAGE_SIZE,
      page,
      setPage,
    });

  const trimmedSearch = debouncedSearch.trim();
  const hasActiveSearch = trimmedSearch.length > 0;

  const emptyContent = useListingEmptyContent({
    trimmedSearch,
    includeDeleted,
    onClearSearch,
    copy: {
      searchPrefix: 'Nenhuma rota encontrada para',
      emptyTitle: singleSystemScope
        ? 'Nenhuma rota cadastrada para este sistema.'
        : 'Nenhuma rota cadastrada.',
      hintWhenIncludeDeletedOff:
        'Rotas removidas podem ser visualizadas ativando "Mostrar inativas".',
      clearTestId,
    },
  });

  return {
    totalPages,
    isFirstPage,
    isLastPage,
    handlePrevPage,
    handleNextPage,
    trimmedSearch,
    hasActiveSearch,
    emptyContent,
  };
}

/**
 * Renderiza o cabeçalho + nome + descrição opcional de um card de
 * rota mobile. As duas listagens (`RoutesPage` drill-down +
 * `RoutesGlobalListShellPage` global) repetiam exatamente este
 * trecho:
 *
 * ```jsx
 * <CardHeader>
 *   <CardCode>{row.code}</CardCode>
 *   <StatusBadge deletedAt={row.deletedAt} />
 * </CardHeader>
 * <CardName>{row.name}</CardName>
 * {row.description !== null && row.description.trim().length > 0 && (
 *   <CardDescription>{row.description}</CardDescription>
 * )}
 * ```
 *
 * O JSCPD tokenizou os 12 linhas idênticas como duplicado entre as
 * duas pages — gatilho clássico das lições PR #134/#135. Centralizar
 * aqui mantém a estrutura única do card sem importar de uma página
 * para a outra (que criaria dependência cruzada entre pages-shell).
 */
export function RouteCardTopSection({ row }: { row: RouteDto }): React.ReactElement {
  return (
    <>
      <CardHeader>
        <CardCode>{row.code}</CardCode>
        <StatusBadge deletedAt={row.deletedAt} />
      </CardHeader>
      <CardName>{row.name}</CardName>
      {row.description !== null && row.description.trim().length > 0 && (
        <CardDescription>{row.description}</CardDescription>
      )}
    </>
  );
}
