import React from "react";

/**
 * Região ARIA-live invisível visualmente que anuncia transições de
 * estado da listagem para leitores de tela.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O `<span aria-live="polite">` com inline-style de "visually hidden"
 * (clip-rect, w/h 1, etc.) aparecia idêntico em 3 páginas (~12
 * linhas). Centralizar elimina a duplicação e fixa o estilo
 * acessibilidade-correto em uma única fonte de verdade.
 *
 * A copy específica de cada listagem ("Carregando roles..." vs
 * "Atualizando rotas...") fica no caller via prop `message`. O
 * `testId` é parametrizado para que cada página mantenha asserts
 * estáveis.
 */
interface LiveRegionProps {
  /** Mensagem corrente lida pelo screen reader. */
  message: string;
  /** `data-testid` da região (ex.: `roles-live`). */
  testId: string;
}

const HIDDEN_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export const LiveRegion: React.FC<LiveRegionProps> = ({ message, testId }) => (
  <span
    aria-live="polite"
    aria-atomic="true"
    style={HIDDEN_STYLE}
    data-testid={testId}
  >
    {message}
  </span>
);
