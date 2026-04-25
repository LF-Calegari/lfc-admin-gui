import React from 'react';
import styled from 'styled-components';

import { Body, Button, Heading } from '../ui';

interface ErrorPageProps {
  /**
   * Código do erro exibido em destaque (ex.: `404`, `401`, `403`, `500`).
   * Aceita string para permitir códigos customizados em integrações futuras.
   */
  code: string;
  /** Título curto e direto que descreve o erro. */
  title: string;
  /**
   * Texto de apoio. Aceita `ReactNode` para suportar links inline em casos
   * em que a descrição precise direcionar para outras partes da aplicação.
   */
  description: React.ReactNode;
  /** Rótulo da ação principal (CTA). */
  actionLabel: string;
  /** Handler executado ao clicar no CTA. */
  onAction: () => void;
}

/**
 * Layout mobile-first centralizado (vertical e horizontal) usando flex.
 * Em telas maiores ganha respiro adicional via `gap` e `padding`.
 *
 * Renderiza como `<section>` para evitar `<main>` aninhado dentro do
 * `<ContentArea as="main">` do `AppLayout` (apenas um `<main>` por
 * documento). A semântica de "página de erro" fica explícita pelo
 * `aria-labelledby` que aponta para o código exibido em destaque.
 */
const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-5);
  padding: var(--space-12) var(--space-4);
  max-width: var(--measure-base);
  margin: 0 auto;

  @media (min-width: 48em) {
    gap: var(--space-6);
    padding: var(--space-16) var(--space-8);
  }
`;

const CodeMark = styled.span`
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--accent-ink);
  display: inline-block;
`;

const TextStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
`;

const Description = styled(Body)`
  max-width: var(--measure-narrow);
  color: var(--text-secondary);
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: var(--space-2);

  & > button {
    width: 100%;
    max-width: var(--measure-cta);
  }

  @media (min-width: 30em) {
    & > button {
      width: auto;
      min-width: var(--measure-cta-min);
    }
  }
`;

export const ErrorPage: React.FC<ErrorPageProps> = ({
  code,
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <Wrapper aria-labelledby="error-page-code">
    <CodeMark id="error-page-code" aria-label={`Erro ${code}`}>
      {code}
    </CodeMark>
    <TextStack>
      <Heading level={2} as="h1">
        {title}
      </Heading>
      <Description as="p">{description}</Description>
    </TextStack>
    <ActionRow>
      <Button
        type="button"
        variant="primary"
        size="lg"
        onClick={onAction}
        aria-label={actionLabel}
      >
        {actionLabel}
      </Button>
    </ActionRow>
  </Wrapper>
);

export type { ErrorPageProps };
