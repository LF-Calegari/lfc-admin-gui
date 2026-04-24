import React from 'react';
import styled, { css } from 'styled-components';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

const sizeStyles = {
  sm: css`
    padding: 5px 10px;
    font-size: 12.5px;
    border-radius: var(--radius-sm);
  `,
  md: css`
    padding: 8px 14px;
    font-size: 13.5px;
    border-radius: var(--radius-md);
  `,
  lg: css`
    padding: 11px 18px;
    font-size: 15px;
    border-radius: var(--radius-md);
  `,
};

const variantStyles = {
  primary: css`
    background: var(--clr-lime);
    color: var(--clr-forest);
    border-color: transparent;
    box-shadow: var(--shadow-button-primary);

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--accent) 80%, var(--clr-white));
    }
    &:active:not(:disabled) {
      background: var(--accent-dim);
      box-shadow: var(--shadow-button-primary-active);
    }
    &:focus-visible {
      box-shadow: var(--focus-ring-accent-strong);
    }
  `,
  secondary: css`
    background: var(--bg-surface);
    color: var(--fg1);
    border-color: var(--border-soft-forest);

    &:hover:not(:disabled) {
      background: var(--bg-elevated);
      border-color: var(--border-medium-forest);
    }
    &:active:not(:disabled) {
      background: var(--bg-overlay);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--border-strong) 60%, transparent);
    }
  `,
  ghost: css`
    background: transparent;
    color: var(--fg2);
    border-color: transparent;

    &:hover:not(:disabled) {
      color: var(--fg1);
      background: var(--bg-ghost-hover);
    }
    &:active:not(:disabled) {
      background: var(--bg-ghost-active);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--border-strong) 60%, transparent);
    }
  `,
  danger: css`
    background: var(--bg-danger-soft);
    color: var(--danger-ink);
    border-color: var(--border-danger-soft);

    &:hover:not(:disabled) {
      background: var(--bg-danger-hover);
      border-color: var(--border-danger-strong);
    }
    &:focus-visible {
      box-shadow: var(--focus-ring-danger);
    }
  `,
};

const StyledButton = styled.button<{ $variant: ButtonVariant; $size: ButtonSize }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  border: 1px solid transparent;
  cursor: pointer;
  letter-spacing: -0.005em;
  line-height: 1.2;
  white-space: nowrap;
  user-select: none;
  position: relative;
  transition:
    background 140ms var(--ease-default),
    border-color 140ms var(--ease-default),
    color 140ms var(--ease-default),
    transform 80ms var(--ease-default),
    box-shadow 140ms var(--ease-default);

  &:focus-visible {
    outline: none;
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    pointer-events: none;
  }

  ${({ $size }) => sizeStyles[$size]}
  ${({ $variant }) => variantStyles[$variant]}
`;

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  ...props
}) => (
  <StyledButton $variant={variant} $size={size} {...props}>
    {icon}
    {children}
  </StyledButton>
);
