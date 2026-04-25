import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, SwatchGrid, TokenName, TokenValue } from './_shared';

/**
 * Issue #28 — Shadows.
 *
 * Espelha `identity/preview/shadows.html`. Mostra a escala xs→xl mais
 * tokens semânticos pré-existentes (`--shadow-card`, `--shadow-modal`,
 * `--shadow-glow`).
 *
 * Todas as sombras são **tema-dependentes**: no tema light usam preto
 * com alpha baixo; no dark usam preto puro com alpha mais alto para
 * compensar o fundo escuro (ver `tokens.css`).
 */

const ShadowCard = styled.figure<{ $shadowToken: string }>`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 110px;
  padding: var(--space-4);
  margin: 0;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: ${({ $shadowToken }) => `var(${$shadowToken})`};
`;

const ShadowMeta = styled.figcaption`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

interface ShadowToken {
  token: string;
  /** Uso típico ou descrição curta. */
  hint: string;
}

/**
 * Escala incremental — base recomendada para componentes que crescem
 * em elevação (xs hairline → xl page-level overlay).
 */
const SHADOW_SCALE: ReadonlyArray<ShadowToken> = [
  { token: '--shadow-xs', hint: 'hairline · cells' },
  { token: '--shadow-sm', hint: 'subtle · chips' },
  { token: '--shadow-md', hint: 'cards · hover' },
  { token: '--shadow-lg', hint: 'popover · sheets' },
  { token: '--shadow-xl', hint: 'modal · 24px drop' },
];

/**
 * Tokens semânticos — usados por componentes específicos. Mantidos
 * separados para deixar claro que não fazem parte da escala numérica.
 */
const SHADOW_SEMANTIC: ReadonlyArray<ShadowToken> = [
  { token: '--shadow-card',  hint: 'Card · elevação base' },
  { token: '--shadow-modal', hint: 'Modal · overlay' },
  { token: '--shadow-glow',  hint: 'Accent · focus glow' },
];

export const Shadows: React.FC = () => (
  <ShowcaseSection
    eyebrow="Tokens"
    title="Shadows"
    description="Escala de elevação (xs→xl) e sombras semânticas. Tema-dependentes: ficam mais profundas no dark para compensar o fundo escuro."
    ariaLabel="Shadows"
  >
    <SwatchGrid $min={180}>
      {SHADOW_SCALE.map(shadow => (
        <ShadowCard
          key={shadow.token}
          $shadowToken={shadow.token}
          aria-label={shadow.token}
        >
          <ShadowMeta>
            <TokenName>{shadow.token}</TokenName>
            <TokenValue>{shadow.hint}</TokenValue>
          </ShadowMeta>
        </ShadowCard>
      ))}
    </SwatchGrid>
    <SwatchGrid $min={180}>
      {SHADOW_SEMANTIC.map(shadow => (
        <ShadowCard
          key={shadow.token}
          $shadowToken={shadow.token}
          aria-label={shadow.token}
        >
          <ShadowMeta>
            <TokenName>{shadow.token}</TokenName>
            <TokenValue>{shadow.hint}</TokenValue>
          </ShadowMeta>
        </ShadowCard>
      ))}
    </SwatchGrid>
  </ShowcaseSection>
);
