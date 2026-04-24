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
    border-radius: 9px;
  `,
};

const variantStyles = {
  primary: css`
    background: var(--clr-lime);
    color: var(--clr-forest);
    border-color: transparent;
    box-shadow: 0 1px 0 rgba(22, 36, 15, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.25);

    &:hover:not(:disabled) {
      background: #bdd96a;
    }
    &:active:not(:disabled) {
      background: #8cb139;
      box-shadow: inset 0 1px 2px rgba(22, 36, 15, 0.18);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px rgba(174, 202, 89, 0.28);
    }
  `,
  secondary: css`
    background: var(--bg-surface);
    color: var(--fg1);
    border-color: rgba(22, 36, 15, 0.14);

    &:hover:not(:disabled) {
      background: var(--bg-elevated);
      border-color: rgba(22, 36, 15, 0.28);
    }
    &:active:not(:disabled) {
      background: #e4e9d6;
    }
  `,
  ghost: css`
    background: transparent;
    color: var(--fg2);
    border-color: transparent;

    &:hover:not(:disabled) {
      color: var(--fg1);
      background: rgba(22, 36, 15, 0.05);
    }
    &:active:not(:disabled) {
      background: rgba(22, 36, 15, 0.1);
    }
  `,
  danger: css`
    background: rgba(217, 95, 95, 0.1);
    color: #a83a3a;
    border-color: rgba(217, 95, 95, 0.3);

    &:hover:not(:disabled) {
      background: rgba(217, 95, 95, 0.18);
      border-color: rgba(217, 95, 95, 0.5);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px rgba(217, 95, 95, 0.22);
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
