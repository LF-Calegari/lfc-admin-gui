import React from 'react';
import styled, { css } from 'styled-components';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, ReturnType<typeof css>> = {
  success: css`
    background: rgba(122, 158, 40, 0.14);
    color: var(--accent-ink);
    border-color: rgba(174, 202, 89, 0.25);
  `,
  danger: css`
    background: rgba(217, 95, 95, 0.1);
    color: var(--danger);
    border-color: rgba(217, 95, 95, 0.25);
  `,
  warning: css`
    background: rgba(217, 162, 74, 0.1);
    color: var(--warning);
    border-color: rgba(217, 162, 74, 0.25);
  `,
  info: css`
    background: rgba(74, 159, 217, 0.1);
    color: var(--info);
    border-color: rgba(74, 159, 217, 0.25);
  `,
  neutral: css`
    background: var(--bg-elevated);
    color: var(--fg2);
    border-color: var(--border-base);
  `,
};

const StyledBadge = styled.span<{ $variant: BadgeVariant; $dot: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--weight-medium);
  border-radius: var(--radius-full);
  border: 1px solid;
  letter-spacing: 0.02em;

  ${({ $variant }) => variantStyles[$variant]}

  ${({ $dot }) =>
    $dot &&
    css`
      &::before {
        content: '';
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }
    `}
`;

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', dot = false, children }) => (
  <StyledBadge $variant={variant} $dot={dot}>
    {children}
  </StyledBadge>
);
