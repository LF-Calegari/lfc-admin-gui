import React, { useMemo } from 'react';

import { Button } from '../../components/ui';

import { EmptyHint, EmptyMessage, EmptyTitle, Mono } from './styles';

/**
 * Copy parametrizada do bloco "estado vazio" das listagens. Cada
 * página passa as strings em pt-BR específicas do recurso (singular/
 * plural/gênero) — o hook concentra a estrutura visual e a árvore de
 * decisão (busca ativa vs sem busca, toggle "Mostrar inativas"
 * desligado vs ligado).
 */
export interface ListingEmptyContentCopy {
  /** Texto exibido quando há busca ativa, antes do `<Mono>`. */
  searchPrefix: string;
  /** Texto exibido quando vazio sem busca (ex.: "Nenhuma role cadastrada."). */
  emptyTitle: string;
  /** Hint exibido sob o título quando `includeDeleted=false`. */
  hintWhenIncludeDeletedOff: string;
  /** `data-testid` do botão "Limpar busca". */
  clearTestId: string;
}

interface UseListingEmptyContentParams {
  /** Resultado de `debouncedSearch.trim()` — string vazia se sem busca. */
  trimmedSearch: string;
  /** Estado do toggle "Mostrar inativas". */
  includeDeleted: boolean;
  /** Callback do botão "Limpar busca" (já reseta page para 1 no caller). */
  onClearSearch: () => void;
  /** Copy parametrizada por recurso. */
  copy: ListingEmptyContentCopy;
}

/**
 * Hook compartilhado que devolve o `ReactNode` do estado vazio para
 * as listagens (`SystemsPage`, `RolesPage`, `RolesGlobalListShellPage`,
 * etc.).
 *
 * **Por que existe (lição PR #134/#135):** o `useMemo<React.ReactNode>`
 * com a árvore de decisão `if (hasActiveSearch) ... else ...` +
 * `<EmptyMessage>` + `<EmptyTitle>` + `<Button>` se repetia idêntico
 * entre `RolesPage` (per-system) e `RolesGlobalListShellPage` (global)
 * — JSCPD/Sonar tokenizam blocos de ≥10 linhas com mesma estrutura
 * como duplicação independente da intenção. Centralizar aqui mantém
 * a fonte única e elimina o clone.
 *
 * Cada caller continua dono da copy específica do recurso (singular/
 * plural/gênero) via `copy` — o hook é agnóstico.
 */
export function useListingEmptyContent(
  params: UseListingEmptyContentParams,
): React.ReactNode {
  const { trimmedSearch, includeDeleted, onClearSearch, copy } = params;
  const hasActiveSearch = trimmedSearch.length > 0;

  return useMemo<React.ReactNode>(() => {
    if (hasActiveSearch) {
      return (
        <EmptyMessage>
          <EmptyTitle>
            {copy.searchPrefix} <Mono>{trimmedSearch}</Mono>.
          </EmptyTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSearch}
            data-testid={copy.clearTestId}
          >
            Limpar busca
          </Button>
        </EmptyMessage>
      );
    }
    return (
      <EmptyMessage>
        <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
        {!includeDeleted && <EmptyHint>{copy.hintWhenIncludeDeletedOff}</EmptyHint>}
      </EmptyMessage>
    );
  }, [
    copy.clearTestId,
    copy.emptyTitle,
    copy.hintWhenIncludeDeletedOff,
    copy.searchPrefix,
    hasActiveSearch,
    includeDeleted,
    onClearSearch,
    trimmedSearch,
  ]);
}
