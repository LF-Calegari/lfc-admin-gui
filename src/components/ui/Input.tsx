import React, { useId } from 'react';
import styled from 'styled-components';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  onChange?: (value: string) => void;
}

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const InputLabel = styled.label<{ $hasError?: boolean }>`
  font-size: 12px;
  font-weight: var(--weight-medium);
  color: ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--fg2)')};
  letter-spacing: -0.01em;
`;

const InputWrap = styled.div`
  position: relative;
  display: flex;
`;

const IconSlot = styled.span`
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fg3);
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const StyledInput = styled.input<{ $hasError?: boolean; $hasIcon?: boolean }>`
  flex: 1;
  min-width: 0;
  background: var(--bg-elevated);
  border: 1px solid ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--border-base)')};
  border-radius: var(--radius-md);
  padding: 9px 12px;
  padding-left: ${({ $hasIcon }) => ($hasIcon ? '34px' : '12px')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--fg1);
  outline: none;
  transition: all 150ms var(--ease-default);

  &::placeholder {
    color: var(--fg3);
  }

  &:hover:not(:disabled) {
    border-color: ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--border-soft-forest)')};
  }

  &:focus-visible {
    border-color: ${({ $hasError }) => ($hasError ? 'var(--danger)' : 'var(--accent)')};
    box-shadow: ${({ $hasError }) =>
      $hasError
        ? 'var(--focus-ring-danger-soft)'
        : 'var(--focus-ring-accent)'};
  }
`;

const ErrorMsg = styled.span`
  font-size: 11px;
  color: var(--danger);
`;

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  onChange,
  id: idProp,
  ...props
}) => {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  return (
    <InputGroup>
      {label && (
        <InputLabel htmlFor={inputId} $hasError={!!error}>
          {label}
        </InputLabel>
      )}
      <InputWrap>
        {icon && <IconSlot>{icon}</IconSlot>}
        <StyledInput
          id={inputId}
          $hasError={!!error}
          $hasIcon={!!icon}
          onChange={e => onChange?.(e.target.value)}
          {...props}
        />
      </InputWrap>
      {error && <ErrorMsg>{error}</ErrorMsg>}
    </InputGroup>
  );
};
