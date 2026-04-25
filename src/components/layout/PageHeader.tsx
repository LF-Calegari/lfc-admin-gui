import React from 'react';
import styled from 'styled-components';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  desc?: string;
  actions?: React.ReactNode;
}

/**
 * Em mobile (< --bp-md, 48em) empilha verticalmente o cabeçalho para
 * preservar legibilidade do título e dar espaço aos CTAs. A partir de
 * `--bp-md` retorna à diagonal `space-between`.
 */
const HeaderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-6);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 32px;
  }
`;

const HeaderLeft = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent-ink);
  margin-bottom: 8px;
`;

const Title = styled.h2`
  font-size: 22px;
  font-weight: var(--weight-bold);
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--fg1);
  margin: 6px 0 8px;
  word-break: break-word;

  @media (min-width: 48em) {
    font-size: 28px;
  }
`;

const Desc = styled.p`
  color: var(--fg2);
  font-size: 14px;
  max-width: 60ch;
  margin: 0;
  line-height: var(--leading-base);
`;

/**
 * Em mobile os CTAs viram `flex-wrap` para acomodar telas estreitas; em
 * desktop voltam à linha única à direita do header.
 */
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;

  @media (min-width: 48em) {
    flex-wrap: nowrap;
  }
`;

export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, desc, actions }) => (
  <HeaderWrapper>
    <HeaderLeft>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Title>{title}</Title>
      {desc && <Desc>{desc}</Desc>}
    </HeaderLeft>
    {actions && <Actions>{actions}</Actions>}
  </HeaderWrapper>
);
