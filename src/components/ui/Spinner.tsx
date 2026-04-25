import React from 'react';
import styled, { css, keyframes } from 'styled-components';

type SpinnerSize = 'sm' | 'md' | 'lg';
type SpinnerTone = 'accent' | 'neutral' | 'inverse' | 'currentColor';

interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'role' | 'aria-label'> {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  label?: string;
}

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const sizeStyles: Record<SpinnerSize, ReturnType<typeof css>> = {
  sm: css`
    width: var(--text-sm);
    height: var(--text-sm);
    border-width: var(--border-medium);
  `,
  md: css`
    width: var(--text-md);
    height: var(--text-md);
    border-width: var(--border-thick);
  `,
  lg: css`
    width: var(--text-xl);
    height: var(--text-xl);
    border-width: var(--border-thicker);
  `,
};

const toneColor: Record<SpinnerTone, string> = {
  accent: 'var(--accent-ink)',
  neutral: 'var(--text-muted)',
  inverse: 'var(--fg-inverse)',
  currentColor: 'currentColor',
};

const SpinnerWrapper = styled.span<{ $size: SpinnerSize; $tone: SpinnerTone }>`
  display: inline-block;
  flex-shrink: 0;
  border-style: solid;
  border-color: ${({ $tone }) => `color-mix(in srgb, ${toneColor[$tone]} 22%, transparent)`};
  border-top-color: ${({ $tone }) => toneColor[$tone]};
  border-radius: var(--radius-full);
  animation: ${rotate} var(--duration-slower) linear infinite;

  ${({ $size }) => sizeStyles[$size]}

  @media (prefers-reduced-motion: reduce) {
    animation-duration: calc(var(--duration-slower) * 4);
  }
`;

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  tone = 'accent',
  label = 'Carregando',
  ...props
}) => (
  <SpinnerWrapper
    $size={size}
    $tone={tone}
    role="status"
    aria-live="polite"
    aria-label={label}
    {...props}
  />
);

export type { SpinnerProps, SpinnerSize, SpinnerTone };
