import { ArrowRight, Plus, Search, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import styled from 'styled-components';

import {
  Body,
  Button,
  Caption,
  Heading,
  Icon,
  Label,
  Spinner,
  ThemeToggle,
} from '../components/ui';
import { useTheme } from '../hooks/useTheme';

import { Alerts } from './showcase/Alerts';
import { BadgesChips } from './showcase/BadgesChips';
import { Cards } from './showcase/Cards';
import { ColorsBrand } from './showcase/ColorsBrand';
import { ColorsStatus } from './showcase/ColorsStatus';
import { ColorsSurfaces } from './showcase/ColorsSurfaces';
import { ColorsText } from './showcase/ColorsText';
import { Icons } from './showcase/Icons';
import { Inputs } from './showcase/Inputs';
import { Logo } from './showcase/Logo';
import { Radii } from './showcase/Radii';
import { Shadows } from './showcase/Shadows';
import { Spacing } from './showcase/Spacing';
import { TableSection } from './showcase/TableSection';
import { Toasts } from './showcase/Toasts';
import { TypeDisplay } from './showcase/TypeDisplay';
import { TypeMono } from './showcase/TypeMono';
import { TypeScale } from './showcase/TypeScale';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  max-width: 960px;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
`;

const SectionHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const SwatchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
`;

const Swatch = styled.div<{ $dark?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: ${({ $dark }) => ($dark ? 'var(--clr-forest)' : 'var(--bg-elevated)')};
`;

/**
 * Linha que evidencia o estado atual do tema. Expõe a preferência
 * persistida (`theme`) e o valor resolvido (`resolvedTheme`) para
 * facilitar QA visual durante desenvolvimento.
 */
const ThemeRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const ThemeStatus = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

const ThemeBadge = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--accent-ink);
`;

export const ShowcasePage: React.FC = () => {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const { theme, resolvedTheme } = useTheme();

  const triggerLoading = () => {
    setLoadingDemo(true);
    globalThis.setTimeout(() => setLoadingDemo(false), 1600);
  };

  return (
    <Page>
      <SectionHead>
        <Caption>00 Showcase</Caption>
        <Heading level={1}>Componentes base</Heading>
        <Body muted>
          Vitrine isolada do design system: tokens visuais (cores, raios,
          sombras, espaçamento, logo), tipografia e componentes base — todos
          consumindo tokens definidos em <code>src/styles/tokens.css</code>.
        </Body>
      </SectionHead>

      {/* ─── Theme ──────────────────────────────────────────────── */}
      <Section aria-label="Theme">
        <SectionHead>
          <Caption>Theme</Caption>
          <Heading level={3}>Tema claro / escuro</Heading>
        </SectionHead>
        <Body muted>
          Use o toggle no Topbar (ou o duplicado abaixo) para alternar entre
          claro e escuro. A escolha é persistida em <code>localStorage</code> sob
          a chave <code>lfc-admin-theme</code>; sem escolha persistida o tema
          segue <code>prefers-color-scheme</code> do sistema.
        </Body>
        <ThemeRow>
          <ThemeToggle />
          <ThemeStatus>
            <Caption>
              Preferência: <ThemeBadge>{theme}</ThemeBadge>
            </Caption>
            <Caption>
              Resolvido: <ThemeBadge>{resolvedTheme}</ThemeBadge>
            </Caption>
          </ThemeStatus>
        </ThemeRow>
      </Section>

      {/* ─── Tokens visuais (Epic #22 / PR-A1) ──────────────────── */}
      <ColorsBrand />
      <ColorsStatus />
      <ColorsSurfaces />
      <ColorsText />
      <Radii />
      <Shadows />
      <Spacing />
      <Logo />

      {/* ─── Typography (Epic #22 / PR-A2) ──────────────────────── */}
      <TypeDisplay />
      <TypeScale />
      <TypeMono />

      {/* ─── Components (Epic #22 / PR-A3) ──────────────────────── */}

      {/* Button (existente) */}
      <Section aria-label="Button">
        <SectionHead>
          <Caption>Components</Caption>
          <Heading level={3}>Buttons · variantes, tamanhos e estados</Heading>
        </SectionHead>

        <Stack>
          <Label>Variantes</Label>
          <Row>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <Icon icon={Trash2} size="sm" /> Excluir
            </Button>
          </Row>
        </Stack>

        <Stack>
          <Label>Tamanhos</Label>
          <Row>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
        </Stack>

        <Stack>
          <Label>Com ícone</Label>
          <Row>
            <Button icon={<Icon icon={Plus} size="sm" />}>Novo sistema</Button>
            <Button variant="secondary" icon={<Icon icon={Search} size="sm" />}>
              Buscar
            </Button>
            <Button variant="ghost" icon={<Icon icon={ArrowRight} size="sm" />}>
              Próximo
            </Button>
          </Row>
        </Stack>

        <Stack>
          <Label>Estados</Label>
          <Row>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled secondary
            </Button>
            <Button loading>Loading</Button>
            <Button variant="secondary" loading>
              Carregando…
            </Button>
            <Button onClick={triggerLoading} loading={loadingDemo}>
              {loadingDemo ? 'Processando' : 'Disparar loading'}
            </Button>
          </Row>
        </Stack>
      </Section>

      {/* Icons (#40 — expandido) */}
      <Icons />

      {/* Alerts (#34) */}
      <Alerts />

      {/* Badges & Chips (#35) */}
      <BadgesChips />

      {/* Cards (#36) */}
      <Cards />

      {/* Inputs (#37) */}
      <Inputs />

      {/* Table (#38) */}
      <TableSection />

      {/* Toasts (#39) */}
      <Toasts />

      {/* ─── Spinner (existente) ────────────────────────────────── */}
      <Section aria-label="Spinner">
        <SectionHead>
          <Caption>Components</Caption>
          <Heading level={3}>Spinner · indicador de carregamento</Heading>
        </SectionHead>

        <Stack>
          <Label>Tamanhos</Label>
          <Row>
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </Row>
        </Stack>

        <Stack>
          <Label>Tones</Label>
          <SwatchGrid>
            <Swatch>
              <Spinner tone="accent" />
              <Caption>accent</Caption>
            </Swatch>
            <Swatch>
              <Spinner tone="neutral" />
              <Caption>neutral</Caption>
            </Swatch>
            <Swatch $dark>
              <Spinner tone="inverse" />
              <Caption muted>inverse</Caption>
            </Swatch>
          </SwatchGrid>
        </Stack>
      </Section>
    </Page>
  );
};
