import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, SwatchGrid, TokenName, TokenValue } from './_shared';

/**
 * Issue #27 — Radii.
 *
 * Espelha `identity/preview/radii.html`. Cada célula apresenta o token
 * `--radius-*` com:
 *   - O próprio cartão usando o raio (borda externa).
 *   - Um chip preenchido em accent reforçando o raio aplicado.
 *   - Token CSS e valor.
 *
 * Os tokens vêm direto de `tokens.css`; valores ao lado são meramente
 * informativos (espelham os literais definidos lá).
 */

const RadiusCard = styled.figure<{ $radiusToken: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  margin: 0;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: ${({ $radiusToken }) => `var(${$radiusToken})`};
  background: var(--bg-elevated);
`;

const RadiusChip = styled.span<{ $radiusToken: string }>`
  width: 48px;
  height: 48px;
  background: var(--accent);
  border: var(--border-thin) solid var(--accent-dim);
  border-radius: ${({ $radiusToken }) => `var(${$radiusToken})`};
`;

const RadiusMeta = styled.figcaption`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
`;

interface RadiusToken {
  token: string;
  value: string;
  /** Uso típico — aparece após o valor. */
  hint?: string;
}

const RADIUS_TOKENS: ReadonlyArray<RadiusToken> = [
  { token: '--radius-sm',   value: '4px' },
  { token: '--radius-md',   value: '8px',    hint: 'default' },
  { token: '--radius-lg',   value: '12px',   hint: 'cards' },
  { token: '--radius-xl',   value: '16px' },
  { token: '--radius-2xl',  value: '20px' },
  { token: '--radius-full', value: '9999px', hint: 'pills' },
];

export const Radii: React.FC = () => (
  <ShowcaseSection
    eyebrow="Tokens"
    title="Radii"
    description="Escala de bordas arredondadas. O cartão e o chip refletem o mesmo token, facilitando a leitura visual da progressão."
    ariaLabel="Radii"
  >
    <SwatchGrid $min={150}>
      {RADIUS_TOKENS.map(radius => (
        <RadiusCard
          key={radius.token}
          $radiusToken={radius.token}
          aria-label={radius.token}
        >
          <RadiusChip $radiusToken={radius.token} aria-hidden="true" />
          <RadiusMeta>
            <TokenName>{radius.token}</TokenName>
            <TokenValue>
              {radius.value}
              {radius.hint ? ` · ${radius.hint}` : ''}
            </TokenValue>
          </RadiusMeta>
        </RadiusCard>
      ))}
    </SwatchGrid>
  </ShowcaseSection>
);
