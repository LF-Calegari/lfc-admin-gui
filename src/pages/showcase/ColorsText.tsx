import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, TokenName, TokenValue } from './_shared';

/**
 * Issue #26 — Colors / Text.
 *
 * Espelha `identity/preview/colors-text.html`. Lista os tokens de cor
 * tipográfica com:
 *   - Token CSS aplicado ao texto (lado esquerdo).
 *   - Amostra de texto pintada com o token (centro), com bolinha
 *     decorativa do mesmo tom como reforço visual.
 *   - Valor de referência no tema light (lado direito).
 *
 * Inclui `--fg-inverse` em uma linha sobre `--clr-forest` para mostrar
 * o caso de texto sobre fundo escuro (ex.: dentro de um botão primary
 * ou de um chip preenchido com a marca).
 */

const RowsCard = styled.div`
  display: flex;
  flex-direction: column;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-surface);
`;

const Row = styled.div<{ $inverse?: boolean }>`
  display: grid;
  grid-template-columns: minmax(140px, 0.6fr) 1fr minmax(120px, 0.5fr);
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-thin) solid var(--border-subtle);
  background: ${({ $inverse }) =>
    $inverse ? 'var(--clr-forest)' : 'var(--bg-surface)'};

  &:last-child {
    border-bottom: none;
  }

  /* Em telas estreitas a grade de 3 colunas vira pilha — espelha --bp-sm (30em ≈ 480px). */
  @media (max-width: 30em) {
    grid-template-columns: 1fr;
    gap: var(--space-1);
    padding: var(--space-3);
  }
`;

const Sample = styled.span<{ $colorToken: string }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: ${({ $colorToken }) => `var(${$colorToken})`};
`;

const Dot = styled.span<{ $colorToken: string }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-sm);
  background: ${({ $colorToken }) => `var(${$colorToken})`};
`;

const ValueCell = styled.span`
  display: flex;
  justify-content: flex-end;

  @media (max-width: 30em) {
    justify-content: flex-start;
  }
`;

interface TextColor {
  token: string;
  /** Valor de referência no tema light. */
  value: string;
  /** Frase ilustrativa do uso. */
  sample: string;
  /** Quando `true`, renderiza a linha sobre fundo `--clr-forest`. */
  inverseRow?: boolean;
}

const TEXT_COLORS: ReadonlyArray<TextColor> = [
  { token: '--text-primary',   value: '#1B2A12', sample: 'Conteúdo principal do sistema' },
  { token: '--text-secondary', value: '#4A5E42', sample: 'Labels e textos de suporte' },
  { token: '--text-muted',     value: '#6E8164', sample: 'Placeholders, hints e meta-informação' },
  { token: '--text-disabled',  value: '#B5BEA8', sample: 'Texto em estado desabilitado' },
  { token: '--accent-ink',     value: '#5A7D1F', sample: 'Link / acento com contraste WCAG AA' },
  { token: '--fg-inverse',     value: '#FFFFFF', sample: 'Texto sobre fundo escuro (botão primary)', inverseRow: true },
];

export const ColorsText: React.FC = () => (
  <ShowcaseSection
    eyebrow="Colors"
    title="Text"
    description="Hierarquia de cor tipográfica. Os valores hex correspondem ao tema light; no dark cada token resolve para a variante creme correspondente."
    ariaLabel="Colors Text"
  >
    <RowsCard>
      {TEXT_COLORS.map(color => (
        <Row key={color.token} $inverse={color.inverseRow}>
          <TokenName>{color.token}</TokenName>
          <Sample $colorToken={color.token}>
            <Dot $colorToken={color.token} aria-hidden="true" />
            {color.sample}
          </Sample>
          <ValueCell>
            <TokenValue>{color.value}</TokenValue>
          </ValueCell>
        </Row>
      ))}
    </RowsCard>
  </ShowcaseSection>
);
