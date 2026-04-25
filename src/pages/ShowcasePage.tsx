import { ArrowRight, Check, Plus, Search, Settings as SettingsIcon, Trash2 } from 'lucide-react';
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

const Tones = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
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
          Vitrine isolada de Button, Typography, Icon e Spinner — todos consumindo
          tokens do design system.
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

      {/* ─── Typography ─────────────────────────────────────────── */}
      <Section aria-label="Typography">
        <SectionHead>
          <Caption>Typography</Caption>
          <Heading level={3}>Hierarquia tipográfica</Heading>
        </SectionHead>
        <Stack>
          <Heading level={1}>Heading nível 1</Heading>
          <Heading level={2}>Heading nível 2</Heading>
          <Heading level={3}>Heading nível 3</Heading>
          <Heading level={4}>Heading nível 4</Heading>
          <Body>
            Body é o estilo padrão para parágrafos. Mantém leitura confortável em
            blocos longos consumindo a fonte de body e o leading base.
          </Body>
          <Body muted>Body muted aplica `--text-muted` para texto secundário.</Body>
          <Caption>Caption — uso em metadados, descrições compactas e legendas.</Caption>
          <Label>Label · campos de formulário</Label>
        </Stack>
      </Section>

      {/* ─── Button ─────────────────────────────────────────────── */}
      <Section aria-label="Button">
        <SectionHead>
          <Caption>Button</Caption>
          <Heading level={3}>Variantes, tamanhos e estados</Heading>
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

      {/* ─── Icon ───────────────────────────────────────────────── */}
      <Section aria-label="Icon">
        <SectionHead>
          <Caption>Icon</Caption>
          <Heading level={3}>Wrapper sobre lucide-react</Heading>
        </SectionHead>

        <Stack>
          <Label>Tamanhos</Label>
          <Row>
            <Icon icon={SettingsIcon} size="xs" />
            <Icon icon={SettingsIcon} size="sm" />
            <Icon icon={SettingsIcon} size="md" />
            <Icon icon={SettingsIcon} size="lg" />
            <Icon icon={SettingsIcon} size="xl" />
          </Row>
        </Stack>

        <Stack>
          <Label>Tones semânticas</Label>
          <Tones>
            <Icon icon={Check} tone="primary" title="Primary" />
            <Icon icon={Check} tone="secondary" title="Secondary" />
            <Icon icon={Check} tone="muted" title="Muted" />
            <Icon icon={Check} tone="accent" title="Accent" />
            <Icon icon={Check} tone="success" title="Success" />
            <Icon icon={Check} tone="warning" title="Warning" />
            <Icon icon={Check} tone="danger" title="Danger" />
            <Icon icon={Check} tone="info" title="Info" />
          </Tones>
        </Stack>
      </Section>

      {/* ─── Spinner ────────────────────────────────────────────── */}
      <Section aria-label="Spinner">
        <SectionHead>
          <Caption>Spinner</Caption>
          <Heading level={3}>Indicador de carregamento</Heading>
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
