import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, Stack, TokenName, TokenValue } from './_shared';

/**
 * Issue #31 — Type Display.
 *
 * Espelha `identity/preview/type-display.html`. Apresenta os estilos
 * tipográficos de display usados em hero/marketing — onde a marca fala
 * em voz alta. Cada amostra mostra:
 *   - O texto renderizado no tamanho/peso/leading do estilo.
 *   - As especificações tokenizadas (token de tamanho, peso, leading,
 *     tracking) para inspeção rápida.
 *
 * Usa exclusivamente tokens de `tokens.css`:
 *   - `--font-display` para a família.
 *   - `--text-display` (clamp) e `--text-3xl` para os tamanhos.
 *   - `--weight-bold`, `--leading-tight`, `--tracking-tight` etc.
 *
 * Nenhum valor numérico literal é aplicado em `font-size`, `font-weight`,
 * `line-height` ou `letter-spacing` — o próprio token valida a especificação.
 */

const SamplesGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
`;

const SampleCard = styled.figure`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-6);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  position: relative;
  overflow: hidden;
`;

/**
 * Texto principal da amostra. Cada variante aplica um conjunto coerente
 * de tokens (tamanho + peso + leading + tracking) tipicamente usado em
 * blocos de display.
 */
const HeroText = styled.span`
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);

  > em {
    font-style: normal;
    color: var(--accent-ink);
  }
`;

const SubheroText = styled.span`
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
`;

const SampleMeta = styled.figcaption`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: var(--border-thin) solid var(--border-subtle);
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

const MetaLabel = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--text-muted);
`;

const Alphabet = styled.p`
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
`;

interface DisplaySpec {
  /** Tag/eyebrow exibido acima do texto. */
  tag: string;
  /** Identificador acessível do card. */
  ariaLabel: string;
  /** Conteúdo renderizado dentro do componente principal. */
  sample: React.ReactNode;
  /** Wrapper de texto a usar — Hero (display) ou Subhero (3xl). */
  variant: 'hero' | 'subhero';
  /** Tokens aplicados — exibidos no rodapé do card. */
  tokens: {
    size: { name: string; value: string };
    weight: { name: string; value: string };
    leading: { name: string; value: string };
    tracking: { name: string; value: string };
  };
  /** Linha de amostra de glifos (alfabeto + variantes). */
  alphabet?: string;
}

const DISPLAY_SPECS: ReadonlyArray<DisplaySpec> = [
  {
    tag: 'Geist · Hero',
    ariaLabel: 'Hero display',
    variant: 'hero',
    sample: (
      <>
        Administração <em>segura.</em>
      </>
    ),
    tokens: {
      size: { name: '--text-display', value: 'clamp(3.75rem, 12vw, 7rem)' },
      weight: { name: '--weight-bold', value: '700' },
      leading: { name: '--leading-tight', value: '1.2' },
      tracking: { name: '--tracking-tight', value: '-0.03em' },
    },
    alphabet: 'Aa Bb Cc Dd Ee Ff Gg Hh · Variable 100–900',
  },
  {
    tag: 'Geist · Subhero',
    ariaLabel: 'Subhero display',
    variant: 'subhero',
    sample: 'Identidade visual da plataforma',
    tokens: {
      size: { name: '--text-3xl', value: '2.75rem' },
      weight: { name: '--weight-bold', value: '700' },
      leading: { name: '--leading-tight', value: '1.2' },
      tracking: { name: '--tracking-tight', value: '-0.03em' },
    },
  },
];

const renderSample = (spec: DisplaySpec): React.ReactNode =>
  spec.variant === 'hero' ? (
    <HeroText>{spec.sample}</HeroText>
  ) : (
    <SubheroText>{spec.sample}</SubheroText>
  );

export const TypeDisplay: React.FC = () => (
  <ShowcaseSection
    eyebrow="Typography"
    title="Display"
    description="Estilos de display usados em hero e marketing. Tamanho fluido (clamp) responde da viewport mobile a desktop largo, mantendo proporção da identidade."
    ariaLabel="Type Display"
  >
    <SamplesGrid>
      {DISPLAY_SPECS.map(spec => (
        <SampleCard key={spec.tag} aria-label={spec.ariaLabel}>
          <Stack>
            <MetaLabel>{spec.tag}</MetaLabel>
            {renderSample(spec)}
            {spec.alphabet ? <Alphabet>{spec.alphabet}</Alphabet> : null}
          </Stack>
          <SampleMeta>
            <MetaItem>
              <MetaLabel>Size</MetaLabel>
              <TokenName>{spec.tokens.size.name}</TokenName>
              <TokenValue>{spec.tokens.size.value}</TokenValue>
            </MetaItem>
            <MetaItem>
              <MetaLabel>Weight</MetaLabel>
              <TokenName>{spec.tokens.weight.name}</TokenName>
              <TokenValue>{spec.tokens.weight.value}</TokenValue>
            </MetaItem>
            <MetaItem>
              <MetaLabel>Leading</MetaLabel>
              <TokenName>{spec.tokens.leading.name}</TokenName>
              <TokenValue>{spec.tokens.leading.value}</TokenValue>
            </MetaItem>
            <MetaItem>
              <MetaLabel>Tracking</MetaLabel>
              <TokenName>{spec.tokens.tracking.name}</TokenName>
              <TokenValue>{spec.tokens.tracking.value}</TokenValue>
            </MetaItem>
          </SampleMeta>
        </SampleCard>
      ))}
    </SamplesGrid>
  </ShowcaseSection>
);
