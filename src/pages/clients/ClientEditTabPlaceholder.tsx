import React from 'react';
import styled from 'styled-components';

/**
 * Placeholder visual usado pelas 4 abas do `ClientEditPage` (Issue
 * #144) enquanto o conteúdo real de cada uma é entregue por sub-issues
 * subsequentes (#75 → Dados; #146 → Emails extras; #147 →
 * Celulares/Telefones).
 *
 * **Por que existe — lição PR #134 reaplicada antecipadamente:**
 *
 * Cada uma das 4 abas tem hoje o mesmo conteúdo "Em desenvolvimento."
 * com um título/descrição diferente. Repetir o markup em 4 arquivos
 * (~12 linhas cada) seria gatilho de Sonar New Code Duplication
 * (`>3%`) já no primeiro PR. Centralizar aqui mantém Sonar limpo e
 * elimina o trabalho de remover a duplicação depois.
 *
 * Quando cada aba ganhar conteúdo real (#75/#146/#147), o tabpanel
 * correspondente substituirá a chamada a este placeholder pelo seu
 * componente próprio. Este arquivo permanece enquanto pelo menos 1
 * aba estiver vazia; quando a última for preenchida, ele é removido
 * em PR de manutenção dedicado.
 */
interface ClientEditTabPlaceholderProps {
  /**
   * Título da aba sem conteúdo. Aparece como `<h3>` dentro do panel —
   * o `<h2>` do header da página é mantido como nível 2 ("Detalhe do
   * cliente"), e cada panel usa `<h3>` para criar a hierarquia
   * correta de headings.
   */
  title: string;
  /**
   * Descrição curta do que será habilitado quando a issue companion
   * for entregue. Inclui o número da issue para criar rastreabilidade
   * direta entre o placeholder e o backlog.
   */
  description: string;
}

const Wrapper = styled.div`
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

const Title = styled.h3`
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: var(--tracking-tight);
`;

const Description = styled.p`
  margin: 0;
  color: var(--fg2);
  font-size: var(--text-sm);
  line-height: var(--leading-base);
  max-width: 60ch;
`;

const Notice = styled.span`
  align-self: flex-start;
  margin-top: var(--space-2);
  background: var(--bg-elevated);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg3);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
`;

export const ClientEditTabPlaceholder: React.FC<ClientEditTabPlaceholderProps> = ({
  title,
  description,
}) => (
  <Wrapper>
    <Title>{title}</Title>
    <Description>{description}</Description>
    <Notice>Em desenvolvimento.</Notice>
  </Wrapper>
);
