import { useCallback, useMemo } from 'react';

/**
 * Hook genérico de controles de paginação client-side.
 *
 * **Por que existe (lição PR #134 — duplicação Sonar):**
 *
 * `SystemsPage` (#58) e `RoutesPage` (#62) declaravam o mesmo
 * boilerplate de paginação:
 *
 * ```ts
 * const totalPages = useMemo(
 *   () => computeTotalPages(total, appliedPageSize > 0 ? appliedPageSize : DEFAULT),
 *   [appliedPageSize, total],
 * );
 * const isFirstPage = page <= 1;
 * const isLastPage = page >= totalPages;
 * const handlePrevPage = useCallback(() => {...}, []);
 * const handleNextPage = useCallback(() => {...}, [totalPages]);
 * ```
 *
 * Sonar tokenizou ~28 linhas duplicadas entre as duas páginas (4.7%
 * New Code Duplication na PR #134). O `usePaginatedFetch` já cobre
 * o lado da request (lição PR #62 — extraído proativamente); este
 * hook fecha o ciclo cobrindo o lado dos controles de UI.
 *
 * Mantemos o `computeTotalPages` interno (não exportado) porque é um
 * detalhe de implementação — não há hoje outro consumer que precise
 * só do cálculo isolado.
 */

/**
 * Calcula a quantidade total de páginas a partir do `total` filtrado
 * e do `pageSize` aplicado. Com `total === 0`, devolve `1` para que
 * os controles de paginação sigam exibindo "página 1 de 1" (e ambos
 * prev/next apareçam desabilitados) — preserva consistência visual
 * no estado vazio.
 *
 * Idêntico ao helper inline que vivia em `SystemsPage`/`RoutesPage` —
 * agora é a única cópia, fora de duplicação.
 */
function computeTotalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

interface UsePaginationControlsParams {
  /** Total de itens (vem do backend após filtros, antes da paginação). */
  total: number;
  /** Tamanho de página efetivamente aplicado (do `usePaginatedFetch`). */
  appliedPageSize: number;
  /** Tamanho de página default quando o aplicado é 0/inválido. */
  defaultPageSize: number;
  /** Página atual (1-based). */
  page: number;
  /**
   * Setter da página atual (compatível com `useState`). Os handlers
   * `handlePrevPage`/`handleNextPage` chamam-no com a forma funcional
   * para evitar dependência da página atual em suas referências.
   */
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

interface UsePaginationControlsReturn {
  /** Total de páginas calculado a partir de `total`/`appliedPageSize`. */
  totalPages: number;
  /** `true` quando `page <= 1` (botão "Anterior" deve ficar desabilitado). */
  isFirstPage: boolean;
  /** `true` quando `page >= totalPages` (botão "Próximo" deve ficar desabilitado). */
  isLastPage: boolean;
  /** Decrementa `page` quando há página anterior. Estável entre renders. */
  handlePrevPage: () => void;
  /** Incrementa `page` quando há próxima página. Atualiza com `totalPages`. */
  handleNextPage: () => void;
}

/**
 * Devolve o pacote de cálculos e handlers de paginação consumidos
 * pela barra de controles das listagens. Substitui o boilerplate
 * inline de cada página, mantendo o mesmo comportamento.
 *
 * - `totalPages` é memoizado via `useMemo` (mesma semântica do
 *   inline original).
 * - `handlePrevPage` é estável (sem deps) — usa setter funcional.
 * - `handleNextPage` depende de `totalPages` para clampar.
 */
export function usePaginationControls({
  total,
  appliedPageSize,
  defaultPageSize,
  page,
  setPage,
}: UsePaginationControlsParams): UsePaginationControlsReturn {
  const totalPages = useMemo(
    () => computeTotalPages(total, appliedPageSize > 0 ? appliedPageSize : defaultPageSize),
    [appliedPageSize, defaultPageSize, total],
  );

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  const handlePrevPage = useCallback(() => {
    setPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((prev) => (prev < totalPages ? prev + 1 : prev));
  }, [setPage, totalPages]);

  return {
    totalPages,
    isFirstPage,
    isLastPage,
    handlePrevPage,
    handleNextPage,
  };
}
