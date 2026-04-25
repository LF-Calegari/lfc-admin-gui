import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styled, { css, keyframes } from 'styled-components';

import { Icon } from './Icon';

import type { LucideIcon } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  /** Variante semântica (default `info`). */
  variant?: ToastVariant;
  /** Título destacado. */
  title?: string;
  /** Tempo em ms até auto-dismiss. `0` desliga; default 5000. */
  duration?: number;
  /** Mostra botão de fechar (default `true`). */
  dismissible?: boolean;
}

interface ToastEntry {
  id: string;
  message: React.ReactNode;
  variant: ToastVariant;
  title?: string;
  duration: number;
  dismissible: boolean;
}

interface ToastContextValue {
  /** Dispara um toast. Retorna o id (caso queira fechar manualmente). */
  show: (message: React.ReactNode, options?: ToastOptions) => string;
  /** Fecha um toast pelo id. */
  dismiss: (id: string) => void;
  /** Fecha todos os toasts ativos. */
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ─── Hook ───────────────────────────────────────────────── */

/**
 * Hook que retorna a API de toasts.
 *
 * Lança erro quando usado fora do `<ToastProvider>` para falhar cedo —
 * preferência sobre fallback silencioso.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>');
  }
  return ctx;
}

/* ─── Visual ─────────────────────────────────────────────── */

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const variantColors: Record<ToastVariant, ReturnType<typeof css>> = {
  info: css`
    --toast-accent: var(--info);
  `,
  success: css`
    --toast-accent: var(--accent-ink);
  `,
  warning: css`
    --toast-accent: var(--warning);
  `,
  danger: css`
    --toast-accent: var(--danger);
  `,
};

const Stack = styled.div`
  position: fixed;
  right: var(--space-5);
  bottom: var(--space-5);
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-3);
  width: 360px;
  max-width: calc(100vw - var(--space-8));
  z-index: var(--z-toast);
  pointer-events: none;
`;

const ToastCard = styled.div<{ $variant: ToastVariant }>`
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-base);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--fg1);
  font-size: var(--text-sm);
  position: relative;
  overflow: hidden;
  animation: ${slideIn} var(--duration-base) var(--ease-bounce);

  ${({ $variant }) => variantColors[$variant]}

  &::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    inset-block-start: 0;
    inset-block-end: 0;
    width: var(--border-thicker);
    background: var(--toast-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const IconTile = styled.span`
  width: var(--space-6);
  height: var(--space-6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--toast-accent);
  color: var(--bg-surface);
  align-self: start;
  margin-block-start: 2px;
  flex-shrink: 0;
`;

const Body = styled.div`
  min-width: 0;
  line-height: var(--leading-snug);
`;

const Title = styled.div`
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  letter-spacing: var(--tracking-tight);
  font-size: var(--text-sm);
`;

const Message = styled.div`
  color: var(--fg2);
  font-size: var(--text-sm);
  margin-block-start: 2px;
`;

const CloseBtn = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg3);
  cursor: pointer;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: start;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
  min-width: var(--space-6);
  min-height: var(--space-6);

  &:hover {
    background: var(--bg-ghost-hover);
    color: var(--fg1);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-accent);
    color: var(--fg1);
  }
`;

const variantIcons: Record<ToastVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/* ─── ToastItem ──────────────────────────────────────────── */

interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.duration <= 0) return;

    timerRef.current = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [toast.duration, toast.id, onDismiss]);

  return (
    <ToastCard
      $variant={toast.variant}
      role={toast.variant === 'danger' ? 'alert' : 'status'}
      aria-live={toast.variant === 'danger' ? 'assertive' : 'polite'}
    >
      <IconTile aria-hidden="true">
        <Icon icon={variantIcons[toast.variant]} size="xs" tone="currentColor" />
      </IconTile>
      <Body>
        {toast.title && <Title>{toast.title}</Title>}
        <Message>{toast.message}</Message>
      </Body>
      {toast.dismissible && (
        <CloseBtn
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Fechar notificação"
        >
          <Icon icon={X} size="xs" />
        </CloseBtn>
      )}
    </ToastCard>
  );
};

/* ─── Provider ───────────────────────────────────────────── */

interface ToastProviderProps {
  children: React.ReactNode;
  /** Duração default em ms quando o consumidor não especifica. */
  defaultDuration?: number;
}

let toastIdCounter = 0;
function makeToastId(): string {
  toastIdCounter += 1;
  return `toast-${toastIdCounter}-${Date.now()}`;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  defaultDuration = 5000,
}) => {
  const [toasts, setToasts] = useState<ReadonlyArray<ToastEntry>>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const show = useCallback(
    (message: React.ReactNode, options?: ToastOptions): string => {
      const id = makeToastId();
      const entry: ToastEntry = {
        id,
        message,
        variant: options?.variant ?? 'info',
        title: options?.title,
        duration: options?.duration ?? defaultDuration,
        dismissible: options?.dismissible ?? true,
      };
      setToasts(prev => [...prev, entry]);
      return id;
    },
    [defaultDuration],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ show, dismiss, dismissAll }),
    [show, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <Stack aria-label="Notificações">
            {toasts.map(t => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </Stack>,
          document.body,
        )}
    </ToastContext.Provider>
  );
};
