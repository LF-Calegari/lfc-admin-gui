import { Eye, EyeOff } from 'lucide-react';
import React, { useId, useState } from 'react';
import styled from 'styled-components';

const DANGER_COLOR = 'var(--danger)';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /**
   * Controla a renderização do toggle de visibilidade no slot
   * direito do input. Significativo apenas quando `type="password"`:
   *
   * - `undefined` (default) ou `true` em `type="password"` → renderiza
   *   o botão `Eye`/`EyeOff` que alterna o `type` real do input
   *   entre `password` e `text`.
   * - `false` → preserva o comportamento "cego" original (sem toggle).
   *
   * Para qualquer `type !== 'password'`, esta prop é ignorada (o
   * toggle só faz sentido em campos mascarados).
   */
  revealable?: boolean;
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
  color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--fg2)')};
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

const StyledInput = styled.input<{
  $hasError?: boolean;
  $hasIcon?: boolean;
  $hasTrailingAction?: boolean;
}>`
  flex: 1;
  min-width: 0;
  background: var(--bg-elevated);
  border: 1px solid ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--border-base)')};
  border-radius: var(--radius-md);
  padding: 9px 12px;
  padding-left: ${({ $hasIcon }) => ($hasIcon ? '34px' : '12px')};
  padding-right: ${({ $hasTrailingAction }) => ($hasTrailingAction ? '38px' : '12px')};
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--fg1);
  outline: none;
  transition: all 150ms var(--ease-default);

  &::placeholder {
    color: var(--fg3);
  }

  &:hover:not(:disabled) {
    border-color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--border-soft-forest)')};
  }

  &:focus-visible {
    border-color: ${({ $hasError }) => ($hasError ? DANGER_COLOR : 'var(--accent)')};
    box-shadow: ${({ $hasError }) =>
      $hasError
        ? 'var(--focus-ring-danger-soft)'
        : 'var(--focus-ring-accent)'};
  }
`;

/**
 * Botão do slot direito que alterna a visibilidade da senha.
 *
 * Decisões visuais:
 *
 * - `position: absolute` à direita do `InputWrap` para coexistir com
 *   o `IconSlot` esquerdo sem reflow do layout.
 * - Cor base `var(--fg3)` (paridade com `IconSlot`); hover/focus
 *   migram para `var(--fg1)` mantendo contraste suficiente.
 * - `:focus-visible` herda o ring `var(--focus-ring-accent)` para
 *   coerência com o restante dos controles do design system.
 * - `disabled` herda do input pai via `disabled` prop — quando o
 *   form bloqueia interação durante submit, o toggle também é
 *   desabilitado e perde a interatividade visual.
 * - Tamanho 28×28 cabe folgadamente nos `9px` de padding vertical do
 *   input (altura final ≈ 38px) sem causar overflow.
 */
const RevealButton = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--fg3);
  cursor: pointer;
  padding: 0;
  transition: color 150ms var(--ease-default), background 150ms var(--ease-default),
    box-shadow 150ms var(--ease-default);

  &:hover:not(:disabled) {
    color: var(--fg1);
    background: var(--bg-surface);
  }

  &:focus-visible {
    outline: none;
    color: var(--fg1);
    box-shadow: var(--focus-ring-accent);
  }

  &:disabled {
    color: var(--text-disabled);
    cursor: not-allowed;
  }

  & > svg {
    display: block;
    width: 16px;
    height: 16px;
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
  type,
  revealable,
  disabled,
  ...props
}) => {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  // Estado local de visibilidade da senha. Não vaza para fora do
  // componente: cada `<Input>` mantém o próprio toggle, e nenhum
  // caller controla o "está revelado?".
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  // O toggle só faz sentido em campos `type="password"`. Quando o
  // caller passa `revealable={false}`, preservamos o comportamento
  // cego original (showcase, casos defensivos como confirmação de
  // delete crítico).
  const showRevealButton = type === 'password' && revealable !== false;

  // Quando o input é password e o operador clicou no toggle, trocamos
  // o `type` real para `text` para que o conteúdo digitado fique
  // visível. Em qualquer outro caso, mantemos o `type` original.
  const effectiveType = showRevealButton && isPasswordVisible ? 'text' : type;

  const handleToggleVisibility = (): void => {
    setIsPasswordVisible(prev => !prev);
  };

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
          type={effectiveType}
          disabled={disabled}
          $hasError={!!error}
          $hasIcon={!!icon}
          $hasTrailingAction={showRevealButton}
          onChange={e => onChange?.(e.target.value)}
          {...props}
        />
        {showRevealButton && (
          <RevealButton
            type="button"
            onClick={handleToggleVisibility}
            disabled={disabled}
            aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={isPasswordVisible}
            aria-controls={inputId}
            data-testid="input-password-toggle"
          >
            {isPasswordVisible ? (
              <EyeOff aria-hidden="true" focusable={false} strokeWidth={1.6} />
            ) : (
              <Eye aria-hidden="true" focusable={false} strokeWidth={1.6} />
            )}
          </RevealButton>
        )}
      </InputWrap>
      {error && <ErrorMsg>{error}</ErrorMsg>}
    </InputGroup>
  );
};
