import { ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

import { Button } from "../../components/ui";

import { FootBar, PageInfo, PageNav } from "./styles";

/**
 * Footer de paginação com info textual + botões prev/next.
 * Reaproveitado pelas listagens (`SystemsPage`, `RoutesPage`,
 * `RolesPage` e próximas).
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O bloco JSX:
 *
 * ```jsx
 * <FootBar>
 *   <PageInfo>Página X de Y · N resultado(s)</PageInfo>
 *   <PageNav>
 *     <Button ... onClick={handlePrev} disabled={isFirst} ... >Anterior</Button>
 *     <Button ... onClick={handleNext} disabled={isLast} ... >Próxima</Button>
 *   </PageNav>
 * </FootBar>
 * ```
 *
 * aparecia idêntico em 3 páginas (~30 linhas tokenizadas pelo Sonar/
 * jscpd como duplicação). Centralizar evita que cada nova listagem
 * (Issue #66+) reintroduza o mesmo bloco. Os `data-testid` são
 * parametrizados para que cada página mantenha asserts estáveis
 * (`systems-page-info`, `routes-prev`, `roles-next`, etc.).
 */
interface PaginationFooterProps {
  /** Página corrente (1-based). */
  page: number;
  /** Total de páginas (resultado do `usePaginationControls`). */
  totalPages: number;
  /** Total de itens (após filtros, antes da paginação). */
  total: number;
  /** `true` quando estamos na primeira página (desabilita "Anterior"). */
  isFirstPage: boolean;
  /** `true` quando estamos na última página (desabilita "Próxima"). */
  isLastPage: boolean;
  /** Callback do botão "Anterior". */
  onPrev: () => void;
  /** Callback do botão "Próxima". */
  onNext: () => void;
  /** `data-testid` do `<PageInfo>` (ex.: `roles-page-info`). */
  pageInfoTestId: string;
  /** `data-testid` do botão "Anterior" (ex.: `roles-prev`). */
  prevTestId: string;
  /** `data-testid` do botão "Próxima" (ex.: `roles-next`). */
  nextTestId: string;
}

export const PaginationFooter: React.FC<PaginationFooterProps> = ({
  page,
  totalPages,
  total,
  isFirstPage,
  isLastPage,
  onPrev,
  onNext,
  pageInfoTestId,
  prevTestId,
  nextTestId,
}) => (
  <FootBar>
    <PageInfo data-testid={pageInfoTestId}>
      Página {page} de {totalPages} · {total} resultado(s)
    </PageInfo>
    <PageNav>
      <Button
        variant="secondary"
        size="sm"
        icon={<ChevronLeft size={14} strokeWidth={1.5} />}
        disabled={isFirstPage}
        onClick={onPrev}
        aria-label="Ir para a página anterior"
        data-testid={prevTestId}
      >
        Anterior
      </Button>
      <Button
        variant="secondary"
        size="sm"
        icon={<ChevronRight size={14} strokeWidth={1.5} />}
        disabled={isLastPage}
        onClick={onNext}
        aria-label="Ir para a próxima página"
        data-testid={nextTestId}
      >
        Próxima
      </Button>
    </PageNav>
  </FootBar>
);
