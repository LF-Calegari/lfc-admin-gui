import { useMemo } from 'react';

/**
 * Constrói a mensagem ARIA-live de uma listagem em pt-BR baseada em
 * estados (`isInitialLoading`, `isFetching`, `errorMessage`, `total`,
 * `page`, `totalPages`) e copy parametrizada por recurso.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O `useMemo` com a árvore de `if`/`return` aparecia idêntico em 3
 * páginas (`SystemsPage`, `RoutesPage`, `RolesPage`) com diferença
 * apenas nas literais ("rota"/"role"/"sistema", "rotas"/"roles"/
 * "sistemas"). Sonar/jscpd tokenizam isso como bloco duplicado
 * (~15 linhas). Centralizar elimina a duplicação e padroniza o
 * formato das mensagens.
 *
 * Cada caller injeta sua copy via `LiveMessageCopy`; o resultado é
 * gerado por uma única implementação testável (em `tests/shared/
 * listing/useListingLiveMessage.test.ts`) e os call sites colapsam
 * em uma única chamada de hook.
 */

/**
 * Copy textual injetada para diferenciar cada recurso. Cada listagem
 * passa sua própria versão (`'rota'`/`'rotas'`, `'role'`/`'roles'`,
 * `'sistema'`/`'sistemas'`).
 *
 * - `singular` — usado nas frases "{N} {singular}(s) encontrada(s)" e
 *   "Nenhuma/Nenhum {singular} encontrada/o para {q}".
 * - `pluralCarregando` — usado em "Carregando lista de {plural}." e
 *   "Atualizando lista de {plural}.".
 * - `vazioSemBusca` — frase completa para o estado vazio sem busca
 *   (ex.: "Nenhuma rota cadastrada para este sistema."). Cada
 *   recurso tem sua copy específica.
 * - `gender` — `'f'` (feminina) ou `'m'` (masculina) para variar
 *   "Nenhuma"/"Nenhum" e "encontrada(s)"/"encontrado(s)".
 */
export interface ListingLiveMessageCopy {
  singular: string;
  pluralCarregando: string;
  vazioSemBusca: string;
  gender?: 'f' | 'm';
}

interface UseListingLiveMessageArgs {
  /** Cobertura "primeiro fetch em curso" — vence todos os outros. */
  isInitialLoading: boolean;
  /** Cobertura "refetch em curso" — vence quando `errorMessage`/`total` permitiriam. */
  isFetching: boolean;
  /** Mensagem de erro vinda do `usePaginatedFetch`. Quando truthy, retorna `''` (Alert já cobre). */
  errorMessage: string | null;
  /** Total filtrado da listagem (após filtros, antes de skip/take). */
  total: number;
  /** Página corrente (1-based). */
  page: number;
  /** Total de páginas (do `usePaginationControls`). */
  totalPages: number;
  /** `true` quando há termo de busca ativo (após trim/debounce). */
  hasActiveSearch: boolean;
  /** Termo de busca (após trim) para citar na frase de vazio. */
  trimmedSearch: string;
  /** Copy específica do recurso. */
  copy: ListingLiveMessageCopy;
}

export function useListingLiveMessage(args: UseListingLiveMessageArgs): string {
  const {
    isInitialLoading,
    isFetching,
    errorMessage,
    total,
    page,
    totalPages,
    hasActiveSearch,
    trimmedSearch,
    copy,
  } = args;

  return useMemo<string>(() => {
    if (isInitialLoading) {
      return `Carregando lista de ${copy.pluralCarregando}.`;
    }
    if (isFetching) {
      return `Atualizando lista de ${copy.pluralCarregando}.`;
    }
    if (errorMessage) {
      return '';
    }
    const isMasculine = copy.gender === 'm';
    const nenhum = isMasculine ? 'Nenhum' : 'Nenhuma';
    const encontrada = isMasculine ? 'encontrado' : 'encontrada';
    const encontradaPlural = isMasculine ? 'encontrado(s)' : 'encontrada(s)';
    if (total === 0) {
      return hasActiveSearch
        ? `${nenhum} ${copy.singular} ${encontrada} para ${trimmedSearch}.`
        : copy.vazioSemBusca;
    }
    return `${total} ${copy.singular}(s) ${encontradaPlural}. Página ${page} de ${totalPages}.`;
  }, [
    copy.gender,
    copy.pluralCarregando,
    copy.singular,
    copy.vazioSemBusca,
    errorMessage,
    hasActiveSearch,
    isFetching,
    isInitialLoading,
    page,
    total,
    totalPages,
    trimmedSearch,
  ]);
}
