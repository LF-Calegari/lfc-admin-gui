import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, TokenName, TokenValue } from './_shared';

/**
 * Issue #29 — Spacing.
 *
 * Espelha `identity/preview/spacing.html`. Régua visual de cada token
 * `--space-*`:
 *   - Coluna 1 — nome do token CSS.
 *   - Coluna 2 — barra preenchida com `--accent`, com a largura igual
 *     ao token (ex.: `width: var(--space-4)` rende uma barra de 16px).
 *   - Coluna 3 — valor em rem/px.
 *   - Coluna 4 — uso típico.
 *
 * A barra é dimensionada via `var(--…)` direto na largura, então a
 * própria régua valida o valor do token (sem hardcode).
 */

const RowsCard = styled.div`
  display: flex;
  flex-direction: column;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-surface);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 0.6fr) 1fr minmax(110px, 0.5fr) minmax(160px, 1fr);
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-thin) solid var(--border-subtle);

  &:last-child {
    border-bottom: none;
  }

  /* Em telas estreitas vira pilha — espelha --bp-sm (30em ≈ 480px). */
  @media (max-width: 30em) {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
`;

const BarTrack = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

const Bar = styled.span<{ $token: string }>`
  display: block;
  width: ${({ $token }) => `var(${$token})`};
  height: 6px;
  background: var(--accent);
  border-radius: var(--radius-full);
`;

const UsageText = styled.span`
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
`;

interface SpacingToken {
  token: string;
  /** Valor em rem (definição) e px (referência) — ex.: `0.25rem · 4px`. */
  value: string;
  /** Uso típico. */
  usage: string;
}

const SPACING_TOKENS: ReadonlyArray<SpacingToken> = [
  { token: '--space-1',  value: '0.25rem · 4px',   usage: 'Gaps mínimos' },
  { token: '--space-2',  value: '0.5rem · 8px',    usage: 'Padding interno de badges' },
  { token: '--space-3',  value: '0.75rem · 12px',  usage: 'Gap entre itens de lista' },
  { token: '--space-4',  value: '1rem · 16px',     usage: 'Padding de botões' },
  { token: '--space-5',  value: '1.25rem · 20px',  usage: 'Card body padding' },
  { token: '--space-6',  value: '1.5rem · 24px',   usage: 'Gap entre cards' },
  { token: '--space-8',  value: '2rem · 32px',     usage: 'Padding de seção interna' },
  { token: '--space-10', value: '2.5rem · 40px',   usage: 'Gap entre seções de página' },
  { token: '--space-12', value: '3rem · 48px',     usage: 'Margem entre seções' },
  { token: '--space-16', value: '4rem · 64px',     usage: 'Cabeçalhos hero' },
  { token: '--space-20', value: '5rem · 80px',     usage: 'Espaçamento de página máximo' },
];

export const Spacing: React.FC = () => (
  <ShowcaseSection
    eyebrow="Tokens"
    title="Spacing"
    description="Régua de espaçamento. Cada barra é dimensionada via var(--space-*) — a própria régua valida o valor do token."
    ariaLabel="Spacing"
  >
    <RowsCard>
      {SPACING_TOKENS.map(spacing => (
        <Row key={spacing.token}>
          <TokenName>{spacing.token}</TokenName>
          <BarTrack>
            <Bar $token={spacing.token} aria-hidden="true" />
          </BarTrack>
          <TokenValue>{spacing.value}</TokenValue>
          <UsageText>{spacing.usage}</UsageText>
        </Row>
      ))}
    </RowsCard>
  </ShowcaseSection>
);
