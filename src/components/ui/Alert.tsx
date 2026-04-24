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
    background: rgba(122, 158, 40, 0.13);
    border-color: rgba(122, 158, 40, 0.3);
    color: #3f5a14;
  `,
  danger: css`
    background: rgba(217, 95, 95, 0.1);
    border-color: rgba(217, 95, 95, 0.3);
    color: #9c2e2e;
  `,
  info: css`
    background: rgba(74, 159, 217, 0.1);
    border-color: rgba(74, 159, 217, 0.3);
    color: #1e5c8a;
  `,
  warning: css`
    background: rgba(217, 162, 74, 0.1);
    border-color: rgba(217, 162, 74, 0.3);
    color: #8a5e1e;
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
