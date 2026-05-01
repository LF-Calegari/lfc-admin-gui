import { X } from 'lucide-react';
import React from 'react';
import styled, { css } from 'styled-components';

import { Icon } from './Icon';

/**
 * Variantes semânticas do Chip — espelham a paleta dos demais componentes
 * de status (Badge, Alert) para coerência visual.
 */
export type ChipVariant =
  | 'default'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

export type ChipSize = 'sm' | 'md';

interface BaseChipProps {
  /** Texto do chip. */
  label: string;
  /** Variante semântica. */
  variant?: ChipVariant;
  /** Tamanho — `sm` é compacto (rótulos), `md` é interativo. */
  size?: ChipSize;
  /** Ícone à esquerda do label. Aceita qualquer ReactNode (ex.: `<Icon />`). */
  icon?: React.ReactNode;
  /** Estado visual de selecionado — usado em chips de filtro. */
  selected?: boolean;
  /**
   * Quando presente, renderiza um botão "X" à direita que dispara o handler.
   * Torna o chip semanticamente removível.
   */
  onRemove?: () => void;
  /** Callback de clique no chip todo. Quando definido, o chip vira interativo. */
  onClick?: () => void;
  /** Permite desabilitar o chip quando interativo. */
  disabled?: boolean;
  /** Override de `aria-label` — útil quando o label é truncado/ambíguo. */
  ariaLabel?: string;
}

export type ChipProps = BaseChipProps;

/* ─── Variant styles ──────────────────────────────────────── */

const variantStyles: Record<ChipVariant, ReturnType<typeof css>> = {
  default: css`
    background: var(--bg-elevated);
    color: var(--fg2);
    border-color: var(--border-base);
  `,
  success: css`
    background: color-mix(in srgb, var(--success) 13%, transparent);
    color: var(--accent-ink);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
  `,
  danger: css`
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  `,
  warning: css`
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  `,
  info: css`
    background: color-mix(in srgb, var(--info) 10%, transparent);
    color: var(--info);
    border-color: color-mix(in srgb, var(--info) 30%, transparent);
  `,
};

const sizeStyles: Record<ChipSize, ReturnType<typeof css>> = {
  sm: css`
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    gap: var(--space-1);
  `,
  md: css`
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    gap: var(--space-2);
  `,
};

const StyledChip = styled.span<{
  $variant: ChipVariant;
  $size: ChipSize;
  $interactive: boolean;
  $selected: boolean;
}>`
  display: inline-flex;
  align-items: center;
  border: var(--border-thin) solid transparent;
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  white-space: nowrap;
  user-select: none;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $size }) => sizeStyles[$size]}

  ${({ $interactive }) =>
    $interactive &&
    css`
      cursor: pointer;
      min-height: var(--touch-min);

      &:hover:not([aria-disabled='true']) {
        background: color-mix(in srgb, currentColor 14%, var(--bg-surface));
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring-accent);
        border-color: var(--accent);
      }

      &[aria-disabled='true'] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `}

  ${({ $selected }) =>
    $selected &&
    css`
      background: color-mix(in srgb, var(--accent) 18%, var(--bg-surface));
      border-color: var(--accent);
      color: var(--accent-ink);
    `}
`;

const RemoveButton = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  color: currentColor;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-inline-start: var(--space-1);
  width: var(--space-4);
  height: var(--space-4);
  border-radius: var(--radius-full);
  opacity: 0.7;
  transition:
    background var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 18%, transparent);
    opacity: 1;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-accent);
    opacity: 1;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const IconSlot = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
`;

/**
 * Chip — pílula compacta usada para tags, filtros, atributos e seleções.
 *
 * Interativo quando recebe `onClick` (vira `<button>`-like com `role="button"`).
 * Removível quando recebe `onRemove` (renderiza ícone X clicável separado).
 *
 * Para chips específicos de permissão, ver `PermChip`.
 */
export const Chip: React.FC<ChipProps> = ({
  label,
  variant = 'default',
  size = 'md',
  icon,
  selected = false,
  onRemove,
  onClick,
  disabled = false,
  ariaLabel,
  // eslint-disable-next-line sonarjs/cognitive-complexity -- TODO: extrair em helper menor (débito técnico, PR separada)
}) => {
  const interactive = typeof onClick === 'function';

  const handleKeyDown = interactive
    ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }
    : undefined;

  const handleClick = interactive
    ? () => {
        if (disabled) return;
        onClick?.();
      }
    : undefined;

  return (
    <StyledChip
      $variant={variant}
      $size={size}
      $interactive={interactive}
      $selected={selected}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      aria-disabled={interactive && disabled ? true : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {icon && <IconSlot aria-hidden="true">{icon}</IconSlot>}
      <span>{label}</span>
      {onRemove && (
        <RemoveButton
          type="button"
          onClick={e => {
            e.stopPropagation();
            if (!disabled) onRemove();
          }}
          disabled={disabled}
          aria-label={`Remover ${label}`}
        >
          <Icon icon={X} size="xs" />
        </RemoveButton>
      )}
    </StyledChip>
  );
};
