import React from "react";

import { Spinner } from "../../components/ui";

import { InitialLoading } from "./styles";

/**
 * Container com `Spinner` "lg" exibido durante o primeiro fetch da
 * listagem. Reaproveitado pelas listagens (`SystemsPage`,
 * `RoutesPage`, `RolesPage` e próximas).
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O bloco JSX:
 *
 * ```jsx
 * <InitialLoading data-testid="...-loading">
 *   <Spinner size="lg" label="Carregando ..." />
 * </InitialLoading>
 * ```
 *
 * aparecia idêntico em 3 páginas com diferença apenas no `testId` e
 * label. Centralizar elimina duplicação e padroniza o tamanho/copy
 * do spinner.
 */
interface InitialLoadingSpinnerProps {
  /** `data-testid` do container (ex.: `roles-loading`). */
  testId: string;
  /** Texto acessível do spinner (ex.: `"Carregando roles"`). */
  label: string;
}

export const InitialLoadingSpinner: React.FC<InitialLoadingSpinnerProps> = ({
  testId,
  label,
}) => (
  <InitialLoading data-testid={testId}>
    <Spinner size="lg" label={label} />
  </InitialLoading>
);
