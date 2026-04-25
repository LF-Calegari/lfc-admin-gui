import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, TokenName, TokenValue } from './_shared';

/**
 * Issue #32 — Type Scale.
 *
 * Espelha `identity/preview/type-scale.html`. Substitui a seção
 * "Typography" antiga (que apenas listava `Heading/Body/Caption/Label`
 * sem expor tokens). Aqui cada degrau da escala expõe explicitamente:
 *   - Token de tamanho (`--text-*`).
 *   - Papel semântico (H1..H4, Body, Caption, Label).
 *   - Amostra renderizada.
 *   - Specs tokenizados (tamanho, peso, leading, tracking).
 *
 * O sample de cada linha aplica os mesmos tokens que `Typography.tsx`
 * usa no componente equivalente — assim a régua valida visualmente a
 * fonte de verdade do design system.
 */

const ScaleCard = styled.div`
  display: flex;
  flex-direction: column;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-surface);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 0.7fr) minmax(0, 2fr) minmax(170px, 1fr);
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-4) var(--space-5);
  border-bottom: var(--border-thin) solid var(--border-subtle);

  &:last-child {
    border-bottom: none;
  }

  /* Em telas estreitas vira pilha — espelha --bp-md (48em ≈ 768px). */
  @media (max-width: 48em) {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
`;

const RoleMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

const RoleLabel = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--accent-ink);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
`;

const RoleHint = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
`;

/**
 * Wrappers de amostra. Cada um aplica o conjunto coerente de tokens
 * (size + weight + leading + tracking) usado pelo papel correspondente.
 *
 * Não usamos `Heading/Body/Caption/Label` aqui porque queremos demonstrar
 * a escala isoladamente, sem cores semânticas ou margens dos componentes
 * — a régua precisa ser puramente tipográfica.
 */
const SampleBase = styled.span`
  font-family: var(--font-body);
  color: var(--text-primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SampleH1 = styled(SampleBase)`
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
`;

const SampleH2 = styled(SampleBase)`
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
`;

const SampleH3 = styled(SampleBase)`
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
`;

const SampleH4 = styled(SampleBase)`
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-snug);
`;

const SampleLg = styled(SampleBase)`
  font-size: var(--text-lg);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
`;

const SampleBody = styled(SampleBase)`
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
  line-height: var(--leading-base);
`;

const SampleSm = styled(SampleBase)`
  font-size: var(--text-sm);
  font-weight: var(--weight-regular);
  line-height: var(--leading-snug);
  color: var(--text-secondary);
`;

const SampleXs = styled(SampleBase)`
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--text-secondary);
`;

const SpecMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-end;

  /* Em mobile o alinhamento volta a ficar à esquerda (vira pilha). */
  @media (max-width: 48em) {
    align-items: flex-start;
  }
`;

interface ScaleStep {
  /** Token CSS de tamanho — ex.: `--text-3xl`. */
  sizeToken: string;
  /** Valor resolvido — ex.: `2.75rem`. */
  sizeValue: string;
  /** Papel semântico — ex.: 'H1', 'Body', 'Label'. */
  role: string;
  /** Hint complementar — ex.: 'Heading nível 1'. */
  hint?: string;
  /** Conteúdo da amostra. */
  sample: string;
  /** Componente de amostra a renderizar. */
  Component: React.ComponentType<{ children: React.ReactNode }>;
  /** Token de peso aplicado. */
  weightToken: string;
  weightValue: string;
  /** Token de leading aplicado. */
  leadingToken: string;
  leadingValue: string;
  /** Token de tracking aplicado (opcional — alguns degraus usam o default). */
  trackingToken?: string;
  trackingValue?: string;
}

const SCALE_STEPS: ReadonlyArray<ScaleStep> = [
  {
    sizeToken: '--text-3xl',
    sizeValue: '2.75rem · 44px',
    role: 'H1',
    hint: 'Heading nível 1',
    sample: 'Gerenciamento de Roles',
    Component: SampleH1,
    weightToken: '--weight-bold',
    weightValue: '700',
    leadingToken: '--leading-tight',
    leadingValue: '1.2',
    trackingToken: '--tracking-tight',
    trackingValue: '-0.03em',
  },
  {
    sizeToken: '--text-2xl',
    sizeValue: '2rem · 32px',
    role: 'H2',
    hint: 'Heading nível 2',
    sample: 'Sistemas cadastrados',
    Component: SampleH2,
    weightToken: '--weight-semibold',
    weightValue: '600',
    leadingToken: '--leading-tight',
    leadingValue: '1.2',
    trackingToken: '--tracking-tight',
    trackingValue: '-0.03em',
  },
  {
    sizeToken: '--text-xl',
    sizeValue: '1.5rem · 24px',
    role: 'H3',
    hint: 'Heading nível 3',
    sample: 'Rotas por sistema',
    Component: SampleH3,
    weightToken: '--weight-semibold',
    weightValue: '600',
    leadingToken: '--leading-tight',
    leadingValue: '1.2',
    trackingToken: '--tracking-tight',
    trackingValue: '-0.03em',
  },
  {
    sizeToken: '--text-md',
    sizeValue: '1.0625rem · 17px',
    role: 'H4',
    hint: 'Heading nível 4',
    sample: 'Permissões efetivas',
    Component: SampleH4,
    weightToken: '--weight-semibold',
    weightValue: '600',
    leadingToken: '--leading-snug',
    leadingValue: '1.4',
    trackingToken: '--tracking-normal',
    trackingValue: '0em',
  },
  {
    sizeToken: '--text-lg',
    sizeValue: '1.25rem · 20px',
    role: 'Lead',
    hint: 'Parágrafo de destaque',
    sample: 'Atribua permissões granulares por sistema.',
    Component: SampleLg,
    weightToken: '--weight-medium',
    weightValue: '500',
    leadingToken: '--leading-snug',
    leadingValue: '1.4',
    trackingToken: '--tracking-normal',
    trackingValue: '0em',
  },
  {
    sizeToken: '--text-base',
    sizeValue: '0.9375rem · 15px',
    role: 'Body',
    hint: 'Texto padrão',
    sample: 'Atribua permissões diretamente ao usuário.',
    Component: SampleBody,
    weightToken: '--weight-regular',
    weightValue: '400',
    leadingToken: '--leading-base',
    leadingValue: '1.6',
    trackingToken: '--tracking-normal',
    trackingValue: '0em',
  },
  {
    sizeToken: '--text-sm',
    sizeValue: '0.8125rem · 13px',
    role: 'Caption',
    hint: 'Metadados / legendas',
    sample: 'Última atualização há 3 minutos',
    Component: SampleSm,
    weightToken: '--weight-regular',
    weightValue: '400',
    leadingToken: '--leading-snug',
    leadingValue: '1.4',
    trackingToken: '--tracking-normal',
    trackingValue: '0em',
  },
  {
    sizeToken: '--text-xs',
    sizeValue: '0.6875rem · 11px',
    role: 'Label',
    hint: 'Form labels / eyebrows',
    sample: 'NOME DO SISTEMA',
    Component: SampleXs,
    weightToken: '--weight-medium',
    weightValue: '500',
    leadingToken: '--leading-snug',
    leadingValue: '1.4',
    trackingToken: '--tracking-wide',
    trackingValue: '0.06em',
  },
];

export const TypeScale: React.FC = () => (
  <ShowcaseSection
    eyebrow="Typography"
    title="Scale"
    description="Escala tipográfica completa: H1..H4, Lead, Body, Caption e Label. Cada linha mostra token de tamanho, peso, leading e tracking — espelhando os tokens consumidos por src/components/ui/Typography.tsx."
    ariaLabel="Type Scale"
  >
    <ScaleCard>
      {SCALE_STEPS.map(step => {
        const SampleComponent = step.Component;
        return (
          <Row key={step.sizeToken}>
            <RoleMeta>
              <RoleLabel>{step.role}</RoleLabel>
              {step.hint ? <RoleHint>{step.hint}</RoleHint> : null}
            </RoleMeta>
            <SampleComponent>{step.sample}</SampleComponent>
            <SpecMeta>
              <TokenName>{step.sizeToken}</TokenName>
              <TokenValue>{step.sizeValue}</TokenValue>
              <TokenValue>
                {step.weightToken} · {step.weightValue}
              </TokenValue>
              <TokenValue>
                {step.leadingToken} · {step.leadingValue}
              </TokenValue>
              {step.trackingToken && step.trackingValue ? (
                <TokenValue>
                  {step.trackingToken} · {step.trackingValue}
                </TokenValue>
              ) : null}
            </SpecMeta>
          </Row>
        );
      })}
    </ScaleCard>
  </ShowcaseSection>
);
