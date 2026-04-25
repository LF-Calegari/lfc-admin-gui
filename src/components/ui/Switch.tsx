import React, { useId } from 'react';
import styled, { css } from 'styled-components';

export type SwitchSize = 'sm' | 'md' | 'lg';

interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'type'> {
  /** Texto do label associado ao switch. */
  label?: React.ReactNode;
  /** Texto auxiliar abaixo do label. */
  helperText?: string;
  /** Tamanho do controle. */
  size?: SwitchSize;
  /** Handler simplificado que recebe diretamente o estado. */
  onChange?: (checked: boolean) => void;
}

const sizeStyles: Record<SwitchSize, ReturnType<typeof css>> = {
  sm: css`
    --switch-w: 28px;
    --switch-h: 16px;
    --switch-thumb: 12px;
  `,
  md: css`
    --switch-w: 36px;
    --switch-h: 20px;
    --switch-thumb: 16px;
  `,
  lg: css`
    --switch-w: 44px;
    --switch-h: 24px;
    --switch-thumb: 20px;
  `,
};

const Wrapper = styled.label<{ $size: SwitchSize; $disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
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

const Track = styled.span`
  position: relative;
  width: var(--switch-w);
  height: var(--switch-h);
  flex-shrink: 0;
  background: var(--bg-overlay);
  border: var(--border-thin) solid var(--border-base);
  border-radius: var(--radius-full);
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: var(--border-thin);
    transform: translateY(-50%);
    width: var(--switch-thumb);
    height: var(--switch-thumb);
    background: var(--bg-surface);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    transition: transform var(--duration-fast) var(--ease-default);
  }

  ${HiddenInput}:checked + & {
    background: var(--accent);
    border-color: var(--accent);

    &::after {
      transform: translateY(-50%)
        translateX(calc(var(--switch-w) - var(--switch-thumb) - var(--border-thin) * 3));
    }
  }

  ${HiddenInput}:focus-visible + & {
    box-shadow: var(--focus-ring-accent);
    border-color: var(--accent);
  }

  ${Wrapper}:hover ${HiddenInput}:not(:disabled) + & {
    border-color: var(--border-soft-forest);
  }
`;

const TextStack = styled.span`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
`;

const LabelText = styled.span`
  font-size: var(--text-sm);
  color: var(--fg1);
  line-height: var(--leading-snug);
`;

const HelperMsg = styled.span`
  font-size: var(--text-xs);
  color: var(--text-muted);
`;

export const Switch: React.FC<SwitchProps> = ({
  label,
  helperText,
  size = 'md',
  disabled,
  onChange,
  id: idProp,
  ...props
}) => {
  const generatedId = useId();
  const fieldId = idProp ?? generatedId;
  const helperId = `${fieldId}-helper`;

  return (
    <Wrapper htmlFor={fieldId} $size={size} $disabled={disabled} data-disabled={disabled}>
      <HiddenInput
        id={fieldId}
        type="checkbox"
        role="switch"
        disabled={disabled}
        aria-describedby={helperText ? helperId : undefined}
        onChange={e => onChange?.(e.target.checked)}
        {...props}
      />
      <Track />
      {(label || helperText) && (
        <TextStack>
          {label && <LabelText>{label}</LabelText>}
          {helperText && <HelperMsg id={helperId}>{helperText}</HelperMsg>}
        </TextStack>
      )}
    </Wrapper>
  );
};

export type { SwitchProps };
