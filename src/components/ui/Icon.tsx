import React from 'react';
import styled from 'styled-components';

import type { LucideIcon } from 'lucide-react';

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type IconTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'disabled'
  | 'inverse'
  | 'accent'
  | 'danger'
  | 'warning'
  | 'info'
  | 'success'
  | 'currentColor';

interface IconProps {
  /** Componente de ícone exportado por `lucide-react`. */
  icon: LucideIcon;
  /** Tamanho semântico mapeado a tokens de tipografia. */
  size?: IconSize;
  /** Cor semântica mapeada a tokens. */
  tone?: IconTone;
  /** Espessura do traço (proporcional ao tamanho). */
  strokeWidth?: number;
  /** Texto alternativo. Quando omitido, o ícone é tratado como decorativo (`aria-hidden`). */
  title?: string;
  className?: string;
}

const sizeMap: Record<IconSize, string> = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
};

const toneMap: Record<IconTone, string> = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  muted: 'var(--text-muted)',
  disabled: 'var(--text-disabled)',
  inverse: 'var(--fg-inverse)',
  accent: 'var(--accent-ink)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  success: 'var(--accent-ink)',
  currentColor: 'currentColor',
};

const IconWrapper = styled.span<{ $size: IconSize; $tone: IconTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => sizeMap[$size]};
  height: ${({ $size }) => sizeMap[$size]};
  color: ${({ $tone }) => toneMap[$tone]};
  flex-shrink: 0;
  line-height: 0;

  & > svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

export const Icon: React.FC<IconProps> = ({
  icon: IconComponent,
  size = 'md',
  tone = 'currentColor',
  strokeWidth = 1.6,
  title,
  className,
}) => {
  const decorative = !title;

  return (
    <IconWrapper $size={size} $tone={tone} className={className}>
      <IconComponent
        strokeWidth={strokeWidth}
        aria-hidden={decorative ? true : undefined}
        role={decorative ? undefined : 'img'}
        focusable={false}
      >
        {!decorative && <title>{title}</title>}
      </IconComponent>
    </IconWrapper>
  );
};

export type { IconProps, IconSize, IconTone };
