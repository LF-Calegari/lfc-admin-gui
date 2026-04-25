import React from 'react';

import { ShowcaseSection, Swatch, SwatchGrid } from './_shared';

/**
 * Issue #25 — Colors / Surfaces.
 *
 * Espelha `identity/preview/colors-surfaces.html`. Tokens de superfície
 * (`--bg-*`) e bordas (`--border-*`) que mudam por tema. Os valores hex
 * exibidos correspondem ao tema light — no tema dark cada token resolve
 * para a tonalidade equivalente em forest profundo (ver `tokens.css`).
 *
 * Como contrastam? Surfaces formam a hierarquia de profundidade:
 *   base (página) → surface (cards) → elevated (hover) → overlay (pressed).
 * As bordas formam o eixo de ênfase visual:
 *   subtle (hairline) → base (default) → strong (acento).
 */

interface SurfaceColor {
  name: string;
  token: string;
  /** Valor de referência no tema light. */
  value: string;
  /** Uso típico do token (sufixo da meta). */
  hint: string;
  /**
   * Quando `true`, força borda no chip — usado para `--bg-surface`
   * (branco puro no light) que sumiria sobre o card de surface.
   */
  borderedChip?: boolean;
}

const SURFACE_COLORS: ReadonlyArray<SurfaceColor> = [
  { name: 'Base',     token: '--bg-base',     value: '#F2F4EA', hint: 'page' },
  { name: 'Surface',  token: '--bg-surface',  value: '#FFFFFF', hint: 'cards', borderedChip: true },
  { name: 'Elevated', token: '--bg-elevated', value: '#ECEFE0', hint: 'hover' },
  { name: 'Overlay',  token: '--bg-overlay',  value: '#E0E5CD', hint: 'pressed' },
];

const BORDER_COLORS: ReadonlyArray<SurfaceColor> = [
  { name: 'Subtle', token: '--border-subtle', value: 'rgba(22,36,15,0.08)', hint: 'hairline' },
  { name: 'Base',   token: '--border-base',   value: 'rgba(22,36,15,0.16)', hint: 'default' },
  { name: 'Strong', token: '--border-strong', value: 'rgba(91,125,71,0.55)', hint: 'accent' },
];

export const ColorsSurfaces: React.FC = () => (
  <ShowcaseSection
    eyebrow="Colors"
    title="Surfaces & borders"
    description="Tokens de superfície e borda — tema-dependentes. Alterne o tema acima para ver as variantes dark."
    ariaLabel="Colors Surfaces"
  >
    <SwatchGrid $min={170}>
      {SURFACE_COLORS.map(color => (
        <Swatch
          key={color.token}
          background={`var(${color.token})`}
          name={`${color.name} · ${color.hint}`}
          token={color.token}
          value={color.value}
          borderedChip={color.borderedChip}
        />
      ))}
    </SwatchGrid>
    <SwatchGrid $min={170}>
      {BORDER_COLORS.map(color => (
        <Swatch
          key={color.token}
          background={`var(${color.token})`}
          name={`${color.name} · ${color.hint}`}
          token={color.token}
          value={color.value}
        />
      ))}
    </SwatchGrid>
  </ShowcaseSection>
);
