import React from 'react';
import styled from 'styled-components';

import logoDarkUrl from '../../assets/logo-dark.svg';
import logoWhiteUrl from '../../assets/logo-white.svg';
import { useTheme } from '../../hooks/useTheme';

import { ShowcaseSection, SwatchGrid, TokenName, TokenValue } from './_shared';

/**
 * Issue #30 — Logo.
 *
 * Espelha `identity/preview/logo.html`. Mostra:
 *   - Variantes do logo full sobre fundos claro e escuro.
 *   - Tamanhos mínimos recomendados, com o logo renderizado em cada
 *     altura para validar legibilidade.
 *
 * Os SVGs vivem em `src/assets/` (já consumidos pelo Sidebar). Reusar
 * a mesma fonte garante coerência entre Sidebar e Showcase.
 */

const VariantCard = styled.figure`
  display: flex;
  flex-direction: column;
  margin: 0;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-surface);
`;

const VariantPreview = styled.div<{ $variant: 'light' | 'dark' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  padding: var(--space-6);
  background: ${({ $variant }) =>
    $variant === 'dark' ? 'var(--clr-forest)' : 'var(--clr-white)'};
`;

const VariantMeta = styled.figcaption`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
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

const SizeCard = styled.figure`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  margin: 0;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const SizePreview = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 72px;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
`;

const SizeMeta = styled.figcaption`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  > strong {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }
`;

interface LogoVariant {
  name: string;
  description: string;
  src: string;
  alt: string;
  variant: 'light' | 'dark';
  surfaceLabel: string;
}

const LOGO_VARIANTS: ReadonlyArray<LogoVariant> = [
  {
    name: 'Logo White',
    description: 'Versão clara do logo, sobre fundo escuro.',
    src: logoWhiteUrl,
    alt: 'LFC Authenticator logo (versão clara)',
    variant: 'dark',
    surfaceLabel: 'bg: --clr-forest',
  },
  {
    name: 'Logo Dark',
    description: 'Versão escura do logo, sobre fundo claro.',
    src: logoDarkUrl,
    alt: 'LFC Authenticator logo (versão escura)',
    variant: 'light',
    surfaceLabel: 'bg: --clr-white',
  },
];

interface LogoSize {
  /** Altura em px aplicada ao `<img height>`. */
  height: number;
  /** Rótulo amigável — ex.: "Sidebar". */
  name: string;
  /** Uso típico. */
  usage: string;
}

const LOGO_SIZES: ReadonlyArray<LogoSize> = [
  { height: 24, name: 'Mínimo', usage: 'tamanho mínimo legível · favicon expandido' },
  { height: 32, name: 'Compact', usage: 'topbars densas e drawers' },
  { height: 38, name: 'Sidebar', usage: 'altura padrão usada hoje no Sidebar' },
  { height: 56, name: 'Hero', usage: 'cabeçalhos de página e telas de auth' },
];

export const Logo: React.FC = () => {
  // Os swatches "Logo White / Logo Dark" são intencionalmente fixos —
  // mostram cada variante sobre seu fundo canônico (`--clr-forest` /
  // `--clr-white`). Já a régua de tamanhos renderiza sobre `--bg-surface`,
  // que muda por tema, portanto seleciona o asset com contraste correto
  // em runtime — mesma estratégia usada pelo Sidebar.
  const { resolvedTheme } = useTheme();
  const surfaceLogo = resolvedTheme === 'dark' ? logoWhiteUrl : logoDarkUrl;

  return (
    <ShowcaseSection
      eyebrow="Brand"
      title="Logo"
      description="Variantes oficiais do logo e tamanhos mínimos recomendados. Use sempre a versão de contraste correto sobre o fundo onde for aplicada."
      ariaLabel="Logo"
    >
      <SwatchGrid $min={260}>
        {LOGO_VARIANTS.map(variant => (
          <VariantCard key={variant.name} aria-label={variant.name}>
            <VariantPreview $variant={variant.variant}>
              <img src={variant.src} alt={variant.alt} height={38} />
            </VariantPreview>
            <VariantMeta>
              <strong>{variant.name}</strong>
              <TokenName>{variant.surfaceLabel}</TokenName>
              <TokenValue>{variant.description}</TokenValue>
            </VariantMeta>
          </VariantCard>
        ))}
      </SwatchGrid>
      <SwatchGrid $min={200}>
        {LOGO_SIZES.map(size => (
          <SizeCard key={size.height} aria-label={`${size.name} ${size.height}px`}>
            <SizePreview>
              <img
                src={surfaceLogo}
                alt={`Logo em ${size.height}px de altura`}
                height={size.height}
              />
            </SizePreview>
            <SizeMeta>
              <strong>{size.name}</strong>
              <TokenName>{`${size.height}px`}</TokenName>
              <TokenValue>{size.usage}</TokenValue>
            </SizeMeta>
          </SizeCard>
        ))}
      </SwatchGrid>
    </ShowcaseSection>
  );
};
