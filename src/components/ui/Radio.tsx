import React, { useId } from 'react';
import styled, { css } from 'styled-components';

const DANGER_COLOR = 'var(--danger)';

export type RadioSize = 'sm' | 'md' | 'lg';

interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'type'> {
  /** Texto do label associado ao radio. */
  label?: React.ReactNode;
  /** Texto auxiliar abaixo do label. */
  helperText?: string;
  /** Mensagem de erro (também aplica `aria-invalid`). */
  error?: string;
  /** Tamanho do controle. */
  size?: RadioSize;
  /** Handler simplificado que recebe diretamente o estado checado. */
  onChange?: (checked: boolean) => void;
}

const sizeStyles: Record<RadioSize, ReturnType<typeof css>> = {
  sm: css`
    --radio-size: var(--text-sm);
    --radio-dot-size: 6px;
  `,
  md: css`
    --radio-size: var(--text-md);
    --radio-dot-size: 8px;
  `,
  lg: css`
    --radio-size: var(--text-lg);
    --radio-dot-size: 10px;
  `,
};

const Wrapper = styled.label<{ $size: RadioSize; $disabled?: boolean }>`
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

const Circle = styled.span<{ $hasError?: boolean }>`
  position: relative;
  width: var(--radio-size);
  height: var(--radio-size);
  flex-shrink: 0;
  border: var(--border-medium) solid
    ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--border-base)')};
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-block-start: var(--space-1);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  &::after {
    content: '';
    width: var(--radio-dot-size);
    height: var(--radio-dot-size);
    border-radius: var(--radius-full);
    background: var(--accent);
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity var(--duration-fast) var(--ease-default),
      transform var(--duration-fast) var(--ease-default);
  }

  ${HiddenInput}:checked + & {
    border-color: var(--accent);
    &::after {
      opacity: 1;
      transform: scale(1);
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

export const Radio: React.FC<RadioProps> = ({
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
        type="radio"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={showHelper ? helperId : undefined}
        onChange={e => onChange?.(e.target.checked)}
        {...props}
      />
      <Circle $hasError={!!error} />
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

/* ─── RadioGroup ─────────────────────────────────────────── */

interface RadioOption {
  /** Valor enviado quando esta opção é escolhida. */
  value: string;
  /** Texto do label exibido. */
  label: React.ReactNode;
  /** Texto auxiliar opcional. */
  helperText?: string;
  /** Permite desabilitar opção individualmente. */
  disabled?: boolean;
}

interface RadioGroupProps {
  /** Atributo `name` compartilhado entre os radios — obrigatório para que o navegador trate como grupo. */
  name: string;
  /** Valor atualmente selecionado (controlado). */
  value?: string;
  /** Valor inicial (não-controlado). */
  defaultValue?: string;
  /** Opções do grupo. */
  options: ReadonlyArray<RadioOption>;
  /** Tamanho aplicado a todos os radios. */
  size?: RadioSize;
  /** Mensagem de erro do grupo. */
  error?: string;
  /** Texto auxiliar do grupo. */
  helperText?: string;
  /** Rótulo do grupo (renderizado como `<legend>`). */
  legend?: React.ReactNode;
  /** Direção dos radios. */
  direction?: 'vertical' | 'horizontal';
  /** Callback disparado quando o valor selecionado muda. */
  onChange?: (value: string) => void;
}

const Fieldset = styled.fieldset<{ $direction: 'vertical' | 'horizontal' }>`
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const Legend = styled.legend`
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--fg2);
  margin-block-end: var(--space-1);
  letter-spacing: var(--tracking-tight);
`;

const Options = styled.div<{ $direction: 'vertical' | 'horizontal' }>`
  display: flex;
  flex-direction: ${({ $direction }) => ($direction === 'horizontal' ? 'row' : 'column')};
  gap: ${({ $direction }) => ($direction === 'horizontal' ? 'var(--space-4)' : 'var(--space-2)')};
  flex-wrap: ${({ $direction }) => ($direction === 'horizontal' ? 'wrap' : 'nowrap')};
`;

const GroupHelper = styled.span<{ $error?: boolean }>`
  font-size: var(--text-xs);
  color: ${({ $error }) => ($error ? DANGER_COLOR : 'var(--text-muted)')};
`;

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  defaultValue,
  options,
  size = 'md',
  error,
  helperText,
  legend,
  direction = 'vertical',
  onChange,
}) => {
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleChange = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  const showHelper = error || helperText;

  return (
    <Fieldset $direction={direction} aria-invalid={error ? true : undefined}>
      {legend && <Legend>{legend}</Legend>}
      <Options $direction={direction} role="radiogroup">
        {options.map(opt => (
          <Radio
            key={opt.value}
            name={name}
            value={opt.value}
            checked={currentValue === opt.value}
            disabled={opt.disabled}
            label={opt.label}
            helperText={opt.helperText}
            size={size}
            onChange={checked => {
              if (checked) handleChange(opt.value);
            }}
          />
        ))}
      </Options>
      {showHelper && <GroupHelper $error={!!error}>{error ?? helperText}</GroupHelper>}
    </Fieldset>
  );
};

export type { RadioProps, RadioGroupProps, RadioOption };
