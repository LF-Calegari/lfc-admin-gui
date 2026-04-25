import React, { useId } from 'react';
import styled, { css } from 'styled-components';

export type TextareaSize = 'sm' | 'md' | 'lg';

interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'size'> {
  /** Rótulo associado ao campo. */
  label?: string;
  /** Mensagem de erro (também aplica `aria-invalid`). */
  error?: string;
  /** Texto auxiliar abaixo do campo (oculto quando há `error`). */
  helperText?: string;
  /** Tamanho — afeta padding e tipografia. */
  size?: TextareaSize;
  /** Handler simplificado que recebe diretamente o valor. */
  onChange?: (value: string) => void;
}

const TextareaGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
`;

const TextareaLabel = styled.label<{ $hasError?: boolean }>`
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--fg2)')};
  letter-spacing: var(--tracking-tight);
`;

const sizeStyles: Record<TextareaSize, ReturnType<typeof css>> = {
  sm: css`
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    border-radius: var(--radius-sm);
  `,
  md: css`
    padding: var(--space-3) var(--space-3);
    font-size: var(--text-base);
    border-radius: var(--radius-md);
  `,
  lg: css`
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-md);
    border-radius: var(--radius-md);
  `,
};

const StyledTextarea = styled.textarea<{
  $hasError?: boolean;
  $size: TextareaSize;
}>`
  resize: vertical;
  min-height: calc(var(--space-12) * 2);
  background: var(--bg-elevated);
  border: var(--border-thin) solid
    ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--border-base)')};
  font-family: var(--font-sans);
  color: var(--fg1);
  outline: none;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);

  ${({ $size }) => sizeStyles[$size]}

  &::placeholder {
    color: var(--fg3);
  }

  &:hover:not(:disabled) {
    border-color: ${({ $hasError }) =>
      $hasError ? 'var(--danger)' : 'var(--border-soft-forest)'};
  }

  &:focus-visible {
    border-color: ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--accent)')};
    box-shadow: ${({ $hasError }) =>
      $hasError ? 'var(--focus-ring-danger-soft)' : 'var(--focus-ring-accent)'};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--bg-surface);
  }
`;

const HelperMsg = styled.span<{ $error?: boolean }>`
  font-size: var(--text-xs);
  color: ${({ $error }) => ($error ? 'var(--danger)' : 'var(--text-muted)')};
`;

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  helperText,
  size = 'md',
  onChange,
  id: idProp,
  rows = 4,
  ...props
}) => {
  const generatedId = useId();
  const fieldId = idProp ?? generatedId;
  const helperId = `${fieldId}-helper`;
  const showHelper = error || helperText;

  return (
    <TextareaGroup>
      {label && (
        <TextareaLabel htmlFor={fieldId} $hasError={!!error}>
          {label}
        </TextareaLabel>
      )}
      <StyledTextarea
        id={fieldId}
        $hasError={!!error}
        $size={size}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={showHelper ? helperId : undefined}
        onChange={e => onChange?.(e.target.value)}
        {...props}
      />
      {showHelper && (
        <HelperMsg id={helperId} $error={!!error}>
          {error ?? helperText}
        </HelperMsg>
      )}
    </TextareaGroup>
  );
};

export type { TextareaProps };
