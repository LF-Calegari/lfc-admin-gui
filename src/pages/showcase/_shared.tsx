import React from 'react';
import styled from 'styled-components';

import { Caption, Heading } from '../../components/ui';

/**
 * Helpers compartilhados pelas seções de tokens visuais do Showcase.
 *
 * Estes wrappers replicam a estrutura usada em `ShowcasePage` (Section,
 * SectionHead, SectionBody) e introduzem primitivas específicas do
 * Showcase de tokens — `Swatch`, `TokenLabel`, `TokenName`, `TokenValue`.
 *
 * Convenções:
 *   - Tudo consome tokens de `tokens.css` via `var(--…)`.
 *   - Nenhuma cor hard-coded; valores hex aparecem apenas como labels
 *     informativas (texto), nunca aplicados como `background`/`color`.
 *   - Componentes funcionais; props com prefixo `$` para transient props.
 */

/* ─── Section primitives ─────────────────────────────────── */

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
`;

const StyledSectionHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: var(--border-thin) solid var(--border-subtle);
`;

interface ShowcaseSectionProps {
  /** Caption acima do título (ex.: "Colors", "Radii"). */
  eyebrow: string;
  /** Título da seção. */
  title: string;
  /** Texto descritivo curto. Renderizado abaixo do título quando presente. */
  description?: React.ReactNode;
  /** Conteúdo da seção. */
  children: React.ReactNode;
  /** Identificador acessível — vira `aria-label`. */
  ariaLabel?: string;
}

/**
 * Cabeçalho + caixa padrão das seções de showcase. Padroniza a hierarquia
 * tipográfica e o respiro entre seções.
 */
export const ShowcaseSection: React.FC<ShowcaseSectionProps> = ({
  eyebrow,
  title,
  description,
  children,
  ariaLabel,
}) => (
  <StyledSection aria-label={ariaLabel ?? title}>
    <StyledSectionHead>
      <Caption>{eyebrow}</Caption>
      <Heading level={3}>{title}</Heading>
      {description ? <Caption muted>{description}</Caption> : null}
    </StyledSectionHead>
    {children}
  </StyledSection>
);

/* ─── Token labels (texto informativo) ───────────────────── */

const StyledTokenName = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  color: var(--accent-ink);
  word-break: break-all;
`;

const StyledTokenValue = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  word-break: break-all;
`;

interface TokenTextProps {
  children: React.ReactNode;
}

/** Nome de token CSS — ex.: `--clr-forest`. */
export const TokenName: React.FC<TokenTextProps> = ({ children }) => (
  <StyledTokenName>{children}</StyledTokenName>
);

/** Valor resolvido — ex.: `#16240F`, `4px`, `0.5rem`. */
export const TokenValue: React.FC<TokenTextProps> = ({ children }) => (
  <StyledTokenValue>{children}</StyledTokenValue>
);

/* ─── Swatch ─────────────────────────────────────────────── */

const SwatchCard = styled.figure`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-surface);
`;

/**
 * Quando o chip é claro demais (ex.: `--bg-surface` branco) ele se
 * confunde com o card. Inserimos um inset hairline em `--border-subtle`
 * via `box-shadow: inset` apenas nesse caso, sem alterar o layout.
 */
const SwatchChip = styled.div<{ $bordered?: boolean }>`
  height: 72px;
  ${({ $bordered }) =>
    $bordered ? 'box-shadow: inset 0 0 0 var(--border-thin) var(--border-subtle);' : ''}
`;

const SwatchMeta = styled.figcaption`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border-top: var(--border-thin) solid var(--border-subtle);

  > strong {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
    letter-spacing: var(--tracking-tight);
  }
`;

interface SwatchProps {
  /** Cor/background aplicado ao chip. Aceita qualquer valor CSS válido. */
  background: string;
  /** Nome amigável — ex.: "Forest", "Lime". */
  name?: string;
  /** Nome do token CSS — ex.: `--clr-forest`. */
  token?: string;
  /** Valor resolvido — ex.: `#16240F`. */
  value?: string;
  /** Conteúdo opcional dentro do chip (label, ícone). */
  children?: React.ReactNode;
  /**
   * Quando `true`, força borda inferior no chip — útil para chips muito
   * claros (ex.: `--bg-surface` branco) que sumiriam sem ela.
   */
  borderedChip?: boolean;
  /** Override do `aria-label` da figura (default: `name` ou `token`). */
  ariaLabel?: string;
}

/**
 * Bloco visual padrão para apresentação de tokens de cor.
 *
 * Estrutura: `<figure>` com chip colorido + `<figcaption>` contendo
 * nome amigável, token CSS e valor resolvido.
 *
 * Acessibilidade: o chip é decorativo; o conteúdo informativo está em
 * `<figcaption>`. `aria-label` cobre leitores de tela.
 */
export const Swatch: React.FC<SwatchProps> = ({
  background,
  name,
  token,
  value,
  children,
  borderedChip,
  ariaLabel,
}) => {
  const computedAriaLabel = ariaLabel ?? name ?? token ?? 'color swatch';
  return (
    <SwatchCard aria-label={computedAriaLabel}>
      <SwatchChip
        style={{ background }}
        $bordered={borderedChip}
        role="img"
        aria-hidden="true"
      >
        {children}
      </SwatchChip>
      {(name || token || value) && (
        <SwatchMeta>
          {name ? <strong>{name}</strong> : null}
          {token ? <TokenName>{token}</TokenName> : null}
          {value ? <TokenValue>{value}</TokenValue> : null}
        </SwatchMeta>
      )}
    </SwatchCard>
  );
};

/* ─── Layout primitives ───────────────────────────────────── */

/**
 * Grid responsivo padrão para seções com múltiplos swatches/cards.
 * A largura mínima do item é configurável via prop `$min` (default 160px).
 */
export const SwatchGrid = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: ${({ $min = 160 }) =>
    `repeat(auto-fill, minmax(${$min}px, 1fr))`};
  gap: var(--space-3);
`;

/** Subgrupo de conteúdo dentro de uma seção (label + grid de items). */
export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;
