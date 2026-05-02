import React from 'react';

import { ErrorRetryBlock } from './ErrorRetryBlock';
import { InitialLoadingSpinner } from './InitialLoadingSpinner';
import { PaginationFooter } from './PaginationFooter';
import { RefetchOverlay } from './RefetchOverlay';
import { TableShell } from './styles';

/**
 * Componente shell genérico que encapsula a estrutura
 * "loading → error/retry → tabela com overlay → paginação"
 * compartilhada por todas as páginas de listagem do projeto
 * (`SystemsPage`, `RoutesPage`, `RolesPage`, `UsersListShellPage`,
 * `PermissionsListShellPage`, `ClientsListShellPage`).
 *
 * **Por que existe (lição PR #134/#135 — antecipa 7ª recorrência
 * Sonar):** o JSX
 *
 * ```jsx
 * {isInitialLoading && <InitialLoadingSpinner ... />}
 * {!isInitialLoading && errorMessage && <ErrorRetryBlock ... />}
 * {!isInitialLoading && !errorMessage && (
 *   <TableShell>
 *     {children}
 *     {showOverlay && <RefetchOverlay ... />}
 *   </TableShell>
 * )}
 * {!isInitialLoading && !errorMessage && total > 0 && (
 *   <PaginationFooter ... />
 * )}
 * ```
 *
 * é literalmente idêntico entre as páginas de listagem (62+ linhas
 * tokenizadas pelo jscpd no PR #74). Encapsular aqui:
 *
 * - Reduz cada página a `<ListingResultArea testIdPrefix="..." ...>`
 *   passando os contadores/handlers (sem duplicar a árvore).
 * - Garante simetria visual e de comportamento (todas as listagens
 *   tratam loading/error/empty/overlay idêntico).
 * - Centraliza pontos de evolução (ex.: skeleton em vez de spinner,
 *   feedback de progresso, etc.).
 *
 * **Por que não usar slot pattern (children pra tabela)?** Porque
 * a tabela varia em colunas/tipo, e passar via `tableContent` como
 * `React.ReactNode` (nó já renderizado) é o padrão mais simples e
 * sem perder type-safety nas colunas (cada caller já tem o
 * `<Table<TRow>>` tipado e passa o nó pronto).
 */

interface ListingResultAreaProps {
  /**
   * Prefixo dos `data-testid` do spinner/error/overlay/paginação.
   * Cada listagem usa o seu (`systems`, `clients`, `users`, etc.)
   * — preserva os ids estáveis das suítes existentes.
   */
  testIdPrefix: string;
  /** Label acessível do spinner inicial (ex.: "Carregando sistemas"). */
  loadingLabel: string;
  /** Flag de carregamento inicial (primeira request em curso). */
  isInitialLoading: boolean;
  /** Flag de re-fetch em andamento (overlay sobre a tabela). */
  isFetching: boolean;
  /** Mensagem de erro retornada pelo `usePaginatedFetch`. */
  errorMessage: string | null;
  /** Handler do botão "Tentar novamente" no error block. */
  onRetry: () => void;
  /**
   * Conteúdo principal da listagem — tipicamente o `<Table<TRow>>`
   * já tipado pela página chamadora. Renderizado dentro do
   * `TableShell` para que o overlay fique posicionado corretamente.
   */
  tableContent: React.ReactNode;
  /** Total de itens (dispara renderização do `PaginationFooter`). */
  total: number;
  /** Página atual (1-based). */
  page: number;
  /** Total de páginas calculado pelo `usePaginationControls`. */
  totalPages: number;
  /** Quando `true`, o botão "Anterior" fica desabilitado. */
  isFirstPage: boolean;
  /** Quando `true`, o botão "Próxima" fica desabilitado. */
  isLastPage: boolean;
  /** Handler do botão "Anterior". */
  onPrev: () => void;
  /** Handler do botão "Próxima". */
  onNext: () => void;
}

export const ListingResultArea: React.FC<ListingResultAreaProps> = ({
  testIdPrefix,
  loadingLabel,
  isInitialLoading,
  isFetching,
  errorMessage,
  onRetry,
  tableContent,
  total,
  page,
  totalPages,
  isFirstPage,
  isLastPage,
  onPrev,
  onNext,
}) => {
  const showOverlay = isFetching && !isInitialLoading;
  return (
    <>
      {isInitialLoading && (
        <InitialLoadingSpinner testId={`${testIdPrefix}-loading`} label={loadingLabel} />
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={onRetry}
          retryTestId={`${testIdPrefix}-retry`}
        />
      )}

      {!isInitialLoading && !errorMessage && (
        <TableShell>
          {tableContent}
          {showOverlay && <RefetchOverlay testId={`${testIdPrefix}-overlay`} />}
        </TableShell>
      )}

      {!isInitialLoading && !errorMessage && total > 0 && (
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          total={total}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
          onPrev={onPrev}
          onNext={onNext}
          pageInfoTestId={`${testIdPrefix}-page-info`}
          prevTestId={`${testIdPrefix}-prev`}
          nextTestId={`${testIdPrefix}-next`}
        />
      )}
    </>
  );
};
