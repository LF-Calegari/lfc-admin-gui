import React from "react";

import { Spinner } from "../../components/ui";

import { Overlay } from "./styles";

/**
 * Overlay leve com `Spinner` exibido sobre a tabela/cards durante
 * refetches subsequentes (busca/paginação/toggle). Reaproveitado
 * pelas listagens (`SystemsPage`, `RoutesPage`, `RolesPage` e
 * próximas).
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O bloco JSX:
 *
 * ```jsx
 * <Overlay aria-hidden="true" data-testid="...-overlay">
 *   <Spinner size="md" label="Atualizando" />
 * </Overlay>
 * ```
 *
 * aparecia idêntico em 3 páginas. Centralizar evita reintroduções
 * em listagens novas. O `data-testid` é parametrizado para que cada
 * página mantenha asserts estáveis.
 */
interface RefetchOverlayProps {
  /** `data-testid` do overlay (ex.: `roles-overlay`). */
  testId: string;
}

export const RefetchOverlay: React.FC<RefetchOverlayProps> = ({ testId }) => (
  <Overlay aria-hidden="true" data-testid={testId}>
    <Spinner size="md" label="Atualizando" />
  </Overlay>
);
