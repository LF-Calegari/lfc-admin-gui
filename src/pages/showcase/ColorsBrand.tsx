import React from 'react';

import { ShowcaseSection, Swatch, SwatchGrid } from './_shared';

/**
 * Issue #23 — Colors / Brand.
 *
 * Espelha `identity/preview/colors-brand.html`. Mostra a paleta bruta
 * de marca (raw) que vive em `:root` do `tokens.css`. Estes valores
 * não mudam com o tema; tokens semânticos (`--bg-base`, `--accent`,
 * etc.) é que compõem a partir desta paleta.
 *
 * Cada swatch exibe nome amigável, token CSS e valor hex.
 */

interface BrandColor {
  name: string;
  token: string;
  value: string;
  /**
   * Quando `true`, força borda no chip — usado para o cream, que sumiria
   * sobre `--bg-surface` claro.
   */
  borderedChip?: boolean;
}

const BRAND_COLORS: ReadonlyArray<BrandColor> = [
  { name: 'Forest',     token: '--clr-forest',     value: '#16240F' },
  { name: 'Forest Mid', token: '--clr-forest-mid', value: '#1E3516' },
  { name: 'Hunter',     token: '--clr-hunter',     value: '#5B7D47' },
  { name: 'Green',      token: '--clr-green',      value: '#8CB139' },
  { name: 'Lime ★',     token: '--clr-lime',       value: '#AECA59' },
  { name: 'Sage',       token: '--clr-sage',       value: '#809A96' },
  { name: 'Cream',      token: '--clr-cream',      value: '#DDE9CA', borderedChip: true },
];

export const ColorsBrand: React.FC = () => (
  <ShowcaseSection
    eyebrow="Colors"
    title="Brand"
    description="Paleta bruta da identidade. Tokens semânticos por tema compõem a partir destes valores — raramente devem ser usados diretamente em componentes."
    ariaLabel="Colors Brand"
  >
    <SwatchGrid $min={160}>
      {BRAND_COLORS.map(color => (
        <Swatch
          key={color.token}
          background={`var(${color.token})`}
          name={color.name}
          token={color.token}
          value={color.value}
          borderedChip={color.borderedChip}
        />
      ))}
    </SwatchGrid>
  </ShowcaseSection>
);
