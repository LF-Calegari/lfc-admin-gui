import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, Swatch, SwatchGrid } from './_shared';

/**
 * Issue #24 — Colors / Status.
 *
 * Espelha `identity/preview/colors-status.html`. Mostra os tokens de
 * status (success/warning/danger/info) com:
 *   - Swatch principal — chip preenchido com o token, nome amigável,
 *     token CSS e valor de referência.
 *   - Exemplo de uso — palavra renderizada sobre o fundo do token,
 *     ilustrando contraste do texto sobre a cor de status.
 *
 * Os hex exibidos correspondem ao tema light. No tema dark os tokens
 * resolvem para variantes mais claras (ver `tokens.css`); a descrição
 * da seção sinaliza essa dependência de tema.
 */

type Contrast = 'forest' | 'white';

/**
 * Token CSS usado para o texto sobre o chip — escolhido para garantir
 * contraste WCAG AA contra o fundo de cada status. A escolha é binária
 * (forest vs. white) porque os 4 status colors caem em duas faixas de
 * luminância distintas.
 */
const CONTRAST_TOKEN: Record<Contrast, string> = {
  forest: 'var(--clr-forest)',
  white: 'var(--clr-white)',
};

const ChipLabel = styled.span<{ $contrast: Contrast }>`
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: ${({ $contrast }) => CONTRAST_TOKEN[$contrast]};
`;

interface StatusColor {
  name: string;
  token: string;
  /** Valor de referência no tema light. */
  value: string;
  /** Esquema de contraste do label sobre o chip. */
  contrast: Contrast;
  /** Texto curto para amostra de uso. */
  sample: string;
}

const STATUS_COLORS: ReadonlyArray<StatusColor> = [
  { name: 'Success', token: '--success', value: '#AECA59', contrast: 'forest', sample: 'success' },
  { name: 'Danger',  token: '--danger',  value: '#D95F5F', contrast: 'white',  sample: 'danger'  },
  { name: 'Warning', token: '--warning', value: '#D9A24A', contrast: 'forest', sample: 'warning' },
  { name: 'Info',    token: '--info',    value: '#4A9FD9', contrast: 'white',  sample: 'info'    },
];

export const ColorsStatus: React.FC = () => (
  <ShowcaseSection
    eyebrow="Colors"
    title="Status"
    description="Tokens semânticos para feedback de estado. Resolvem para variantes mais claras no tema dark; valores hex abaixo correspondem ao tema light."
    ariaLabel="Colors Status"
  >
    <SwatchGrid $min={180}>
      {STATUS_COLORS.map(color => (
        <Swatch
          key={color.token}
          background={`var(${color.token})`}
          name={color.name}
          token={color.token}
          value={color.value}
        >
          <ChipLabel $contrast={color.contrast}>{color.sample}</ChipLabel>
        </Swatch>
      ))}
    </SwatchGrid>
  </ShowcaseSection>
);
