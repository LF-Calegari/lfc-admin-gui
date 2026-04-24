import React from 'react';
import styled from 'styled-components';

interface CardProps {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}

const StyledCard = styled.div<{ $clickable?: boolean }>`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 200ms var(--ease-default);
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  &:hover {
    border-color: var(--border-base);
    box-shadow: var(--shadow-card);
    transform: translateY(-1px);
  }
`;

const CardHead = styled.div`
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const CardTitle = styled.span`
  font-size: 14.5px;
  font-weight: var(--weight-semibold);
  letter-spacing: -0.01em;
  color: var(--fg1);
`;

const CardBody = styled.div`
  padding: 16px 18px;
`;

export const Card: React.FC<CardProps> = ({ title, right, children, onClick }) => (
  <StyledCard $clickable={!!onClick} onClick={onClick}>
    {(title || right) && (
      <CardHead>
        {title && <CardTitle>{title}</CardTitle>}
        {right}
      </CardHead>
    )}
    <CardBody>{children}</CardBody>
  </StyledCard>
);
