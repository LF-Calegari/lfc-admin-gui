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
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--accent-ink);
    border-color: color-mix(in srgb, var(--success) 25%, transparent);
  `,
  danger: css`
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 25%, transparent);
  `,
  warning: css`
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 25%, transparent);
  `,
  info: css`
    background: color-mix(in srgb, var(--info) 10%, transparent);
    color: var(--info);
    border-color: color-mix(in srgb, var(--info) 25%, transparent);
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
