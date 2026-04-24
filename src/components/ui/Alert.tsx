import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react';
import React from 'react';
import styled, { css } from 'styled-components';

export type AlertVariant = 'success' | 'danger' | 'info' | 'warning';

interface AlertProps {
  variant?: AlertVariant;
  onDismiss?: () => void;
  children: React.ReactNode;
}

const variantStyles: Record<AlertVariant, ReturnType<typeof css>> = {
  success: css`
    background: color-mix(in srgb, var(--success) 13%, transparent);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
    color: color-mix(in srgb, var(--accent-ink) 75%, black);
  `,
  danger: css`
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    color: color-mix(in srgb, var(--danger) 60%, black);
  `,
  info: css`
    background: color-mix(in srgb, var(--info) 10%, transparent);
    border-color: color-mix(in srgb, var(--info) 30%, transparent);
    color: color-mix(in srgb, var(--info) 65%, black);
  `,
  warning: css`
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
    color: color-mix(in srgb, var(--warning) 65%, black);
  `,
};

const StyledAlert = styled.div<{ $variant: AlertVariant }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 16px;
  border-radius: var(--radius-md);
  border: 1px solid;
  font-size: 13.5px;
  line-height: 1.55;

  ${({ $variant }) => variantStyles[$variant]}
`;

const AlertBody = styled.div`
  flex: 1;
`;

const DismissButton = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  color: currentColor;
  opacity: 0.6;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;

  &:hover {
    opacity: 1;
  }
`;

const ICONS: Record<AlertVariant, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  danger: <AlertCircle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
};

export const Alert: React.FC<AlertProps> = ({ variant = 'info', onDismiss, children }) => (
  <StyledAlert $variant={variant}>
    {ICONS[variant]}
    <AlertBody>{children}</AlertBody>
    {onDismiss && (
      <DismissButton onClick={onDismiss} aria-label="Fechar">
        <X size={14} />
      </DismissButton>
    )}
  </StyledAlert>
);
