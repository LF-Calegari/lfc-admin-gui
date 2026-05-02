import { Check } from 'lucide-react';
import React, { useId } from 'react';
import styled, { css } from 'styled-components';

import { Icon } from './Icon';

const DANGER_COLOR = 'var(--danger)';

export type CheckboxSize = 'sm' | 'md' | 'lg';

interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'type'> {
  /** Texto do label associado ao checkbox. */
  label?: React.ReactNode;
  /** Texto auxiliar abaixo do label. */
  helperText?: string;
  /** Mensagem de erro (também aplica `aria-invalid`). */
  error?: string;
  /** Tamanho da caixa visível. */
  size?: CheckboxSize;
  /** Handler simplificado que recebe diretamente o estado checado. */
  onChange?: (checked: boolean) => void;
}

const sizeStyles: Record<CheckboxSize, ReturnType<typeof css>> = {
  sm: css`
    --checkbox-size: var(--text-sm);
    --checkbox-icon-size: var(--text-xs);
  `,
  md: css`
    --checkbox-size: var(--text-md);
    --checkbox-icon-size: var(--text-sm);
  `,
  lg: css`
    --checkbox-size: var(--text-lg);
    --checkbox-icon-size: var(--text-md);
  `,
};

const Wrapper = styled.label<{ $size: CheckboxSize; $disabled?: boolean }>`
  display: inline-flex;
  align-items: flex-start;
  gap: var(--space-2);
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--fg1);
  user-select: none;
  min-height: var(--touch-min);
  ${({ $size }) => sizeStyles[$size]}

  &[data-disabled='true'] {
    opacity: 0.55;
  }
`;

const HiddenInput = styled.input`
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
`;

const Box = styled.span<{ $hasError?: boolean }>`
  position: relative;
  width: var(--checkbox-size);
  height: var(--checkbox-size);
  flex-shrink: 0;
  border: var(--border-medium) solid
    ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--border-base)')};
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-block-start: var(--space-1);
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  & > svg {
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity var(--duration-fast) var(--ease-default),
      transform var(--duration-fast) var(--ease-default);
    color: var(--fg-inverse);
  }

  ${HiddenInput}:checked + & {
    background: var(--accent);
    border-color: var(--accent);

    & > svg {
      opacity: 1;
      transform: scale(1);
      color: var(--clr-forest);
    }
  }

  ${HiddenInput}:focus-visible + & {
    box-shadow: ${({ $hasError }) =>
      $hasError ? 'var(--focus-ring-danger-soft)' : 'var(--focus-ring-accent)'};
    border-color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--accent)')};
  }

  ${Wrapper}:hover ${HiddenInput}:not(:disabled) + & {
    border-color: ${({ $hasError }) =>
      $hasError ? DANGER_COLOR : 'var(--border-soft-forest)'};
  }
`;

const TextStack = styled.span`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding-block-start: 2px;
`;

const LabelText = styled.span`
  font-size: var(--text-sm);
  color: var(--fg1);
  line-height: var(--leading-snug);
`;

const HelperMsg = styled.span<{ $error?: boolean }>`
  font-size: var(--text-xs);
  color: ${({ $error }) => ($error ? DANGER_COLOR : 'var(--text-muted)')};
`;

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  helperText,
  error,
  size = 'md',
  disabled,
  onChange,
  id: idProp,
  ...props
}) => {
  const generatedId = useId();
  const fieldId = idProp ?? generatedId;
  const helperId = `${fieldId}-helper`;
  const showHelper = error || helperText;

  return (
    <Wrapper htmlFor={fieldId} $size={size} $disabled={disabled} data-disabled={disabled}>
      <HiddenInput
        id={fieldId}
        type="checkbox"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={showHelper ? helperId : undefined}
        onChange={e => onChange?.(e.target.checked)}
        {...props}
      />
      <Box $hasError={!!error}>
        <Icon icon={Check} size="xs" />
      </Box>
      {(label || showHelper) && (
        <TextStack>
          {label && <LabelText>{label}</LabelText>}
          {showHelper && (
            <HelperMsg id={helperId} $error={!!error}>
              {error ?? helperText}
            </HelperMsg>
          )}
        </TextStack>
      )}
    </Wrapper>
  );
};

export type { CheckboxProps };
