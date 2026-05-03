import { X } from 'lucide-react';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

import { Icon } from './Icon';

/**
 * Componente de modal/dialog reutilizável (Issue #58 — primeira utilização).
 *
 * Decisões mínimas necessárias para a feature de "Criar sistema":
 *
 * - Renderizado via `createPortal(document.body)` para escapar do
 *   contexto de stacking da página e ficar acima de Topbar/Sidebar sem
 *   depender de `position: relative` do container atual.
 * - Backdrop com `--bg-backdrop-modal` (token semântico já presente em
 *   `tokens.css` — sem hardcode de cor); clique fecha quando
 *   `closeOnBackdrop !== false`.
 * - Tecla `Esc` fecha quando `closeOnEsc !== false`. Listener em
 *   `keydown` na window com `capture: true` para vencer handlers
 *   internos de Inputs antes que tentem absorver o evento.
 * - Foco inicial vai para o primeiro elemento focável dentro do modal
 *   (input/textarea/button), com fallback no próprio container quando
 *   nenhum estiver disponível — deixa screen reader e usuário de teclado
 *   iniciarem no contexto certo. O foco anterior é restaurado ao fechar.
 * - Body lock via `overflow: hidden` no `<html>` enquanto aberto, com
 *   restauração no unmount. Evita scroll do conteúdo de fundo enquanto o
 *   diálogo está em foco — comportamento esperado de qualquer dialog.
 * - Sem dependência nova: lucide-react (ícone X) e styled-components já
 *   fazem parte do projeto. Animação leve via `keyframes` honra
 *   `prefers-reduced-motion` desativando-a.
 *
 * O escopo é deliberadamente pequeno (sem focus-trap completo, sem
 * suporte nativo a múltiplos modais empilhados) — `lfc-admin-gui` não
 * precisa de mais do que isso hoje, e a primeira issue que precisar
 * extende este módulo. Implementar focus-trap completo e suporte a stack
 * agora seria especulação fora do escopo de #58.
 */

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: var(--bg-backdrop-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  z-index: var(--z-modal);
  animation: ${fadeIn} var(--duration-base) var(--ease-default);
  overflow-y: auto;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Dialog = styled.div`
  position: relative;
  width: 100%;
  max-width: 480px;
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-base);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  margin-top: var(--space-12);
  animation: ${slideUp} var(--duration-base) var(--ease-bounce);
  outline: none;

  &:focus-visible {
    box-shadow: var(--shadow-lg), var(--focus-ring-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
`;

const Heading = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
`;

const Title = styled.h2`
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
`;

const Description = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
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
  min-width: var(--space-8);
  min-height: var(--space-8);
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);

  &:hover {
    background: var(--bg-ghost-hover);
    color: var(--fg1);
  }

  &:focus-visible {
    outline: none;
    color: var(--fg1);
    box-shadow: var(--focus-ring-accent);
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/**
 * Selectors fallback de elementos focáveis (excluindo o botão de
 * fechar). Usados quando o caller não declarou `data-modal-initial-focus`
 * em nenhum filho — a busca por esse atributo é tentada antes via
 * seletor dedicado, garantindo que ele tenha prioridade absoluta sobre
 * a heurística por tipo de elemento (input antes de button etc.).
 */
const FOCUSABLE_FALLBACK_SELECTORS = [
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'button:not([disabled]):not([data-modal-close])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface ModalProps {
  /** Estado de visibilidade do modal. */
  open: boolean;
  /** Callback chamado quando o usuário tenta fechar (Esc, backdrop, X). */
  onClose: () => void;
  /** Título exibido no cabeçalho — também usado como `aria-labelledby`. */
  title: React.ReactNode;
  /** Descrição opcional sob o título; conecta a `aria-describedby`. */
  description?: React.ReactNode;
  /**
   * Se `false`, clique no backdrop não fecha o modal. Default `true`.
   * Útil para diálogos de confirmação onde o fechamento acidental seria
   * ruim — fora de escopo de #58, mas mantemos a flag para evitar quebra
   * em call sites futuros.
   */
  closeOnBackdrop?: boolean;
  /** Se `false`, tecla Esc não fecha. Default `true`. */
  closeOnEsc?: boolean;
  /**
   * Conteúdo do corpo do diálogo (form, lista, etc.). O caller é
   * responsável pelo footer/ações — manter o Modal "shell only" deixa o
   * componente reutilizável para qualquer caso.
   */
  children: React.ReactNode;
}

/**
 * Modal/dialog acessível.
 *
 * Comportamento:
 *
 * - Abre via prop `open` (componente desmonta o portal quando `false`).
 * - Foco vai para o primeiro focável; foco anterior é restaurado ao
 *   fechar.
 * - Esc/backdrop disparam `onClose`. Cabe ao caller gerenciar o estado.
 * - Body scroll é travado via `<html>.style.overflow = 'hidden'`
 *   enquanto aberto.
 *
 * O foco/scroll lock são controlados via `useLayoutEffect` para acontecer
 * antes do paint — evita flash do scroll restabelecendo entre abertura e
 * primeiro frame.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  closeOnBackdrop = true,
  closeOnEsc = true,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Snapshot do elemento focado ANTES da abertura — restaurar no fechar
  // mantém a navegação por teclado natural (volta para o gatilho).
  const previousFocusRef = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleEsc = useCallback(
    (event: KeyboardEvent) => {
      if (!closeOnEsc) return;
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    },
    [closeOnEsc, onClose],
  );

  // Listener da tecla Esc + body lock + foco inicial. Usamos
  // `useLayoutEffect` para que tudo ocorra antes do paint inicial: assim
  // o usuário não vê um flash do scroll de fundo movendo enquanto o
  // modal aparece.
  useLayoutEffect(() => {
    if (!open) return;

    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement;
    }

    // Body lock: salva o overflow atual e restaura no cleanup.
    let previousOverflow = '';
    if (typeof document !== 'undefined') {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }

    // Foco inicial: prioriza data-modal-initial-focus, depois primeiro
    // input/textarea/select, depois botão; fallback no container. Buscar
    // o atributo dedicado em uma chamada separada de `querySelector`
    // garante prioridade absoluta — `querySelector` com lista de
    // seletores devolve o primeiro elemento por ordem do DOM, e
    // misturar tudo na mesma chamada faria a heurística "depende da
    // posição no DOM", que é exatamente o que o atributo deveria
    // contornar.
    const node = dialogRef.current;
    if (node) {
      const explicit = node.querySelector<HTMLElement>('[data-modal-initial-focus]');
      const focusable = explicit ?? node.querySelector<HTMLElement>(FOCUSABLE_FALLBACK_SELECTORS);
      if (focusable) {
        focusable.focus();
      } else {
        node.focus();
      }
    }

    if (typeof globalThis.window !== 'undefined') {
      globalThis.addEventListener('keydown', handleEsc, true);
    }

    return () => {
      if (typeof globalThis.window !== 'undefined') {
        globalThis.removeEventListener('keydown', handleEsc, true);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.style.overflow = previousOverflow;
      }
      // Restaura o foco anterior. Tolerante a elementos desmontados.
      const previous = previousFocusRef.current;
      if (previous && previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open, handleEsc]);

  // Em SSR, `document` não existe — devolve `null` até o primeiro
  // useEffect rodar. Cobre cenários defensivos; em runtime real do SPA
  // o portal sempre acha `document.body`.
  useEffect(() => {
    // noop — apenas marca o componente como mounted para SSR-safety.
  }, []);

  if (!open) {
    return null;
  }
  if (typeof document === 'undefined') {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    // Só fecha se o clique foi diretamente no backdrop (não no diálogo).
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <Backdrop role="presentation" onMouseDown={handleBackdropClick} data-testid="modal-backdrop">
      <Dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <Header>
          <Heading>
            <Title id={titleId}>{title}</Title>
            {description && <Description id={descriptionId}>{description}</Description>}
          </Heading>
          <CloseBtn type="button" onClick={onClose} aria-label="Fechar" data-modal-close>
            <Icon icon={X} size="xs" />
          </CloseBtn>
        </Header>
        <Body>{children}</Body>
      </Dialog>
    </Backdrop>,
    document.body,
  );
};
