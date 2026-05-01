import { ChevronDown } from 'lucide-react';
import React, { useId } from 'react';
import styled, { css } from 'styled-components';

import { Icon } from './Icon';

const DANGER_COLOR = 'var(--danger)';

export type SelectSize = 'sm' | 'md' | 'lg';

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> {
  /** Rótulo associado. */
  label?: string;
  /** Mensagem de erro (também aplica `aria-invalid`). */
  error?: string;
  /** Texto auxiliar abaixo do campo (oculto quando há `error`). */
  helperText?: string;
  /** Tamanho do controle. */
  size?: SelectSize;
  /** Children — espera-se `<option>` filhos do consumidor. */
  children: React.ReactNode;
  /** Handler simplificado que recebe diretamente o valor selecionado. */
  onChange?: (value: string) => void;
}

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
`;

const SelectLabel = styled.label<{ $hasError?: boolean }>`
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--fg2)')};
  letter-spacing: var(--tracking-tight);
`;

const Wrap = styled.div`
  position: relative;
  display: flex;
`;

const sizeStyles: Record<SelectSize, ReturnType<typeof css>> = {
  sm: css`
    padding: var(--space-1) var(--space-3);
    padding-inline-end: calc(var(--space-3) + var(--text-md));
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    min-height: var(--space-8);
  `,
  md: css`
    padding: var(--space-2) var(--space-3);
    padding-inline-end: calc(var(--space-3) + var(--text-md));
    font-size: var(--text-sm);
    border-radius: var(--radius-md);
    min-height: var(--space-10);
  `,
  lg: css`
    padding: var(--space-3) var(--space-4);
    padding-inline-end: calc(var(--space-4) + var(--text-md));
    font-size: var(--text-base);
    border-radius: var(--radius-md);
    min-height: var(--space-12);
  `,
};

const StyledSelect = styled.select<{ $hasError?: boolean; $size: SelectSize }>`
  flex: 1;
  min-width: 0;
  appearance: none;
  background: var(--bg-elevated);
  border: var(--border-thin) solid
    ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--border-base)')};
  font-family: var(--font-sans);
  color: var(--fg1);
  outline: none;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  ${({ $size }) => sizeStyles[$size]}

  &:hover:not(:disabled) {
    border-color: ${({ $hasError }) =>
      $hasError ? DANGER_COLOR : 'var(--border-soft-forest)'};
  }

  &:focus-visible {
    border-color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--accent)')};
    box-shadow: ${({ $hasError }) =>
      $hasError ? 'var(--focus-ring-danger-soft)' : 'var(--focus-ring-accent)'};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--bg-surface);
  }
`;

const Caret = styled.span`
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--fg3);
  display: inline-flex;
`;

const HelperMsg = styled.span<{ $error?: boolean }>`
  font-size: var(--text-xs);
  color: ${({ $error }) => ($error ? DANGER_COLOR : 'var(--text-muted)')};
`;

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  size = 'md',
  onChange,
  id: idProp,
  children,
  ...props
}) => {
  const generatedId = useId();
  const fieldId = idProp ?? generatedId;
  const helperId = `${fieldId}-helper`;
  const showHelper = error || helperText;

  return (
    <Group>
      {label && (
        <SelectLabel htmlFor={fieldId} $hasError={!!error}>
          {label}
        </SelectLabel>
      )}
      <Wrap>
        <StyledSelect
          id={fieldId}
          $hasError={!!error}
          $size={size}
          aria-invalid={error ? true : undefined}
          aria-describedby={showHelper ? helperId : undefined}
          onChange={e => onChange?.(e.target.value)}
          {...props}
        >
          {children}
        </StyledSelect>
        <Caret aria-hidden="true">
          <Icon icon={ChevronDown} size="sm" tone="muted" />
        </Caret>
      </Wrap>
      {showHelper && (
        <HelperMsg id={helperId} $error={!!error}>
          {error ?? helperText}
        </HelperMsg>
      )}
    </Group>
  );
};

export type { SelectProps };
