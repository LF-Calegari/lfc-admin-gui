import React from 'react';
import styled, { css } from 'styled-components';

import { Spinner } from './Spinner';

/**
 * Variantes visuais do Button.
 *
 * - `primary`: ação principal (CTA), destaque máximo.
 * - `secondary`: ação secundária neutra.
 * - `ghost`: ação terciária sem fundo.
 * - `danger`: legado — preservado por compat com páginas existentes
 *   (ex.: `SettingsPage`). Para novas telas, prefira combinar
 *   `secondary` com confirmação por modal.
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Variante visual do botão.
   *
   * `danger` é tratado como legado — ver JSDoc de `ButtonVariant`.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

const sizeStyles: Record<ButtonSize, ReturnType<typeof css>> = {
  sm: css`
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    min-height: var(--space-8);
  `,
  md: css`
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    border-radius: var(--radius-md);
    min-height: var(--space-10);
  `,
  lg: css`
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-base);
    border-radius: var(--radius-md);
    min-height: var(--space-12);
  `,
};

const variantStyles: Record<ButtonVariant, ReturnType<typeof css>> = {
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
      box-shadow: var(--focus-ring-border);
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
      box-shadow: var(--focus-ring-border);
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

const StyledButton = styled.button<{
  $variant: ButtonVariant;
  $size: ButtonSize;
  $loading: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  border: var(--border-thin) solid transparent;
  cursor: pointer;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  white-space: nowrap;
  user-select: none;
  position: relative;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  &:focus-visible {
    outline: none;
  }

  &:active:not(:disabled) {
    transform: translateY(var(--press-offset));
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    pointer-events: none;
  }

  ${({ $loading }) =>
    $loading &&
    css`
      cursor: progress;
    `}

  ${({ $size }) => sizeStyles[$size]}
  ${({ $variant }) => variantStyles[$variant]}
`;

const ContentLayer = styled.span<{ $hidden: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
  pointer-events: none;
`;

const SpinnerLayer = styled.span`
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;

const spinnerToneByVariant: Record<ButtonVariant, 'inverse' | 'accent' | 'currentColor'> = {
  primary: 'currentColor',
  secondary: 'accent',
  ghost: 'currentColor',
  danger: 'currentColor',
};

const spinnerSizeByButton: Record<ButtonSize, 'sm' | 'md'> = {
  sm: 'sm',
  md: 'sm',
  lg: 'md',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <StyledButton
      $variant={variant}
      $size={size}
      $loading={loading}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      {...props}
    >
      <ContentLayer $hidden={loading}>
        {icon}
        {children}
      </ContentLayer>
      {loading && (
        <SpinnerLayer>
          <Spinner size={spinnerSizeByButton[size]} tone={spinnerToneByVariant[variant]} />
        </SpinnerLayer>
      )}
    </StyledButton>
  );
};

export type { ButtonProps, ButtonVariant, ButtonSize };
