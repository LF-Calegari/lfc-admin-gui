import React, { useState } from 'react';
import styled from 'styled-components';

import { Alert } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

import type { AlertVariant } from '../../components/ui';

/**
 * Issue #34 — Alerts.
 *
 * Espelha `identity/preview/alerts.html`. Demonstra as 4 variantes do
 * componente Alert, com exemplo de close opcional para mostrar a
 * interação `onDismiss`.
 */

interface AlertSpec {
  variant: AlertVariant;
  title: string;
  body: React.ReactNode;
}

const ALERTS: ReadonlyArray<AlertSpec> = [
  {
    variant: 'success',
    title: 'Sistema criado',
    body: (
      <>
        <strong>lfc-authenticator</strong> registrado. ID: <code>sys_a1b2c3</code>
      </>
    ),
  },
  {
    variant: 'danger',
    title: 'Erro 403 · Permissão negada',
    body: (
      <>
        Você não possui <code>perm:Systems.Delete</code> neste sistema.
      </>
    ),
  },
  {
    variant: 'warning',
    title: 'Token expira em breve',
    body: (
      <>
        Sessão expira em <strong>14 minutos</strong>. Renovação automática ativa.
      </>
    ),
  },
  {
    variant: 'info',
    title: 'Modo verificação',
    body: (
      <>
        Novas rotas em <strong>lfc-kurtto</strong> aguardam aprovação. <code>tokenVersion: 12</code>
      </>
    ),
  },
];

const TitleLine = styled.strong`
  display: block;
  font-weight: var(--weight-semibold);
  margin-block-end: var(--space-1);
  letter-spacing: var(--tracking-tight);
`;

const Body = styled.span`
  font-size: var(--text-sm);
  line-height: var(--leading-snug);

  & code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--bg-elevated);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    color: var(--accent-ink);
    border: 0;
  }
`;

export const Alerts: React.FC = () => {
  const [dismissibleOpen, setDismissibleOpen] = useState(true);

  return (
    <ShowcaseSection
      eyebrow="Components"
      title="Alerts"
      description="Mensagens não-modais usadas inline em telas. Variantes info, success, warning e danger; suporte a botão de fechar quando o consumidor passa onDismiss."
      ariaLabel="Components Alerts"
    >
      <Stack>
        {ALERTS.map(spec => (
          <Alert key={spec.variant} variant={spec.variant}>
            <TitleLine>{spec.title}</TitleLine>
            <Body>{spec.body}</Body>
          </Alert>
        ))}

        {dismissibleOpen && (
          <Alert variant="info" onDismiss={() => setDismissibleOpen(false)}>
            <TitleLine>Demo · Alert dispensável</TitleLine>
            <Body>Clique no X à direita para fechar este aviso.</Body>
          </Alert>
        )}
      </Stack>
    </ShowcaseSection>
  );
};
