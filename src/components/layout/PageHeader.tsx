import React from 'react';
import styled from 'styled-components';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  desc?: string;
  actions?: React.ReactNode;
}

const HeaderWrapper = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
`;

const HeaderLeft = styled.div``;

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
  font-size: 28px;
  font-weight: var(--weight-bold);
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--fg1);
  margin: 6px 0 8px;
`;

const Desc = styled.p`
  color: var(--fg2);
  font-size: 14px;
  max-width: 60ch;
  margin: 0;
  line-height: var(--leading-base);
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
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
