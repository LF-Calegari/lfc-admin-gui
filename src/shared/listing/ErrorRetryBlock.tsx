import { RotateCcw } from "lucide-react";
import React from "react";

import { Alert, Button } from "../../components/ui";

import { ErrorBlock } from "./styles";

/**
 * Bloco de erro com `Alert` + botão "Tentar novamente". Reaproveitado
 * pelas listagens (`SystemsPage`, `RoutesPage`, `RolesPage` e
 * próximas) que falam com o `lfc-authenticator` via
 * `usePaginatedFetch`.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O bloco JSX:
 *
 * ```jsx
 * <ErrorBlock>
 *   <Alert variant="danger">{errorMessage}</Alert>
 *   <Button variant="secondary" size="sm" icon={<RotateCcw .../>}
 *           onClick={handleRefetch} data-testid="...-retry">
 *     Tentar novamente
 *   </Button>
 * </ErrorBlock>
 * ```
 *
 * aparecia idêntico em 3 páginas (12 linhas tokenizadas pelo Sonar/
 * jscpd como duplicação). Centralizar evita que cada nova listagem
 * (Issue #66+) reintroduza o mesmo bloco. O `testId` é parametrizado
 * para que cada página mantenha sua própria asserção
 * (`systems-retry`, `routes-retry`, `roles-retry`, etc).
 */
interface ErrorRetryBlockProps {
  /** Mensagem amigável a exibir no `Alert`. */
  message: string;
  /** Callback do botão "Tentar novamente" — tipicamente `refetch` do `usePaginatedFetch`. */
  onRetry: () => void;
  /** `data-testid` do botão (ex.: `roles-retry`). Mantém asserts estáveis. */
  retryTestId: string;
}

export const ErrorRetryBlock: React.FC<ErrorRetryBlockProps> = ({
  message,
  onRetry,
  retryTestId,
}) => (
  <ErrorBlock>
    <Alert variant="danger">{message}</Alert>
    <Button
      variant="secondary"
      size="sm"
      icon={<RotateCcw size={14} strokeWidth={1.5} />}
      onClick={onRetry}
      data-testid={retryTestId}
    >
      Tentar novamente
    </Button>
  </ErrorBlock>
);
