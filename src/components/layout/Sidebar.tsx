import {
  Monitor,
  Shuffle,
  Users,
  Lock,
  User,
  Activity,
  Settings,
  Component,
  X,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';

import logoDark from '../../assets/logo-dark.svg';

interface NavItem {
  to: string;
  num: string;
  label: string;
  icon: React.ReactNode;
  /**
   * Quando `true`, o item só é exibido em build de desenvolvimento. Usado
   * para vitrines internas que não devem aparecer em produção.
   */
  devOnly?: boolean;
}

interface SidebarProps {
  /**
   * Em mobile (< `--bp-md`, 48em ≈ 768px) o Sidebar opera como drawer
   * (off-canvas) e este flag controla visibilidade. Em desktop o valor é
   * ignorado — a Sidebar fica sempre visível.
   */
  open: boolean;
  /** Callback disparado quando o drawer pede para fechar (ESC, backdrop, link). */
  onClose: () => void;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/systems',     num: '01', label: 'Sistemas',       icon: <Monitor size={15} strokeWidth={1.5} /> },
  { to: '/routes',      num: '02', label: 'Rotas',          icon: <Shuffle size={15} strokeWidth={1.5} /> },
  { to: '/roles',       num: '03', label: 'Roles',          icon: <Users size={15} strokeWidth={1.5} /> },
  { to: '/permissions', num: '04', label: 'Permissões',     icon: <Lock size={15} strokeWidth={1.5} /> },
  { to: '/users',       num: '05', label: 'Usuários',       icon: <User size={15} strokeWidth={1.5} /> },
  { to: '/tokens',      num: '06', label: 'Tokens',         icon: <Activity size={15} strokeWidth={1.5} /> },
  { to: '/settings',    num: '07', label: 'Configurações',  icon: <Settings size={15} strokeWidth={1.5} /> },
  { to: '/showcase',    num: '08', label: 'Showcase UI',    icon: <Component size={15} strokeWidth={1.5} />, devOnly: true },
];

// Showcase UI é página de demonstração interna do design system —
// expor apenas em build de desenvolvimento para não poluir produção.
const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  item => !item.devOnly || import.meta.env.DEV,
);

/**
 * Backdrop semitransparente que aparece atrás do drawer em mobile.
 *
 * Mantém-se renderizado no DOM mesmo fechado (com `aria-hidden`) para
 * permitir transições suaves sem unmount/mount; em desktop é ocultado
 * via media query — espelha `--bp-md` (48em ≈ 768px).
 */
const Backdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(22, 36, 15, 0.42);
  backdrop-filter: blur(2px);
  z-index: var(--z-overlay);
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity var(--duration-base) var(--ease-default);

  /* Desktop (≥ --bp-md, 48em) — backdrop nunca é exibido. */
  @media (min-width: 48em) {
    display: none;
  }
`;

/**
 * Aside sempre presente no DOM. Em mobile recebe `position: fixed` com
 * `transform: translateX(-100%)` quando fechado; em desktop volta a ser
 * `position: sticky` e ocupa a coluna fixa do grid de `AppLayout`.
 */
const SidebarWrapper = styled.aside<{ $open: boolean }>`
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  padding: 28px 0;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  flex-shrink: 0;

  /* Mobile (< --bp-md) — comporta-se como drawer off-canvas. */
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  height: 100dvh;
  max-width: 86vw;
  z-index: var(--z-modal);
  overflow-y: auto;
  transform: ${({ $open }) => ($open ? 'translateX(0)' : 'translateX(-100%)')};
  transition: transform var(--duration-base) var(--ease-default);
  box-shadow: ${({ $open }) => ($open ? 'var(--shadow-modal)' : 'none')};

  /* Desktop (≥ --bp-md, 48em) — comporta-se como coluna fixa. */
  @media (min-width: 48em) {
    position: sticky;
    height: 100vh;
    transform: none;
    box-shadow: none;
    z-index: var(--z-base);
    max-width: none;
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 22px 20px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
`;

const LogoArea = styled.div`
  display: inline-flex;
  align-items: center;
`;

/**
 * Botão "X" para fechar o drawer em mobile. Em desktop fica oculto via
 * `@media`, espelhando `--bp-md` (48em ≈ 768px).
 */
const CloseButton = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--fg2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  min-width: var(--touch-min);
  min-height: var(--touch-min);
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);

  &:hover {
    background: var(--bg-elevated);
    color: var(--fg1);
    border-color: var(--border-base);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }

  /* Desktop (≥ --bp-md) — drawer não existe, esconder o botão. */
  @media (min-width: 48em) {
    display: none;
  }
`;

const PanelLabel = styled.div`
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg3);
  padding: 0 22px 8px;
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

/**
 * Em mobile (< --bp-md) o item ganha `min-height: var(--touch-min)` para
 * cumprir o critério de touch target ≥ 44×44px. Em desktop volta ao
 * padding compacto original.
 */
const NavItemLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  font-size: 14px;
  color: var(--fg2);
  text-decoration: none;
  border-left: var(--border-thick) solid transparent;
  background: transparent;
  transition: all 150ms var(--ease-default);
  cursor: pointer;
  min-height: var(--touch-min);

  &:hover {
    color: var(--fg1);
    background: var(--bg-elevated);
    border-left-color: var(--border-base);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: -2px;
  }

  &.active {
    color: var(--accent-ink);
    border-left-color: var(--accent-ink);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  /* Desktop (≥ --bp-md, 48em) — densidade compacta padrão. */
  @media (min-width: 48em) {
    padding: 9px 22px;
    font-size: 13.5px;
    min-height: 0;
  }
`;

const NavNum = styled.span`
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  width: 18px;
  flex-shrink: 0;

  ${NavItemLink}.active & {
    color: var(--accent-ink);
  }
`;

const SidebarFoot = styled.div`
  margin-top: auto;
  padding: 22px;
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  letter-spacing: 0.04em;
`;

const FootVersion = styled.div`
  color: var(--accent-ink);
  margin-top: 4px;
  font-family: var(--font-mono);
`;

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const wrapperRef = useRef<HTMLElement | null>(null);

  /**
   * Tecla ESC fecha o drawer. Listener só ativa quando aberto para evitar
   * trabalho desnecessário em desktop ou drawer fechado.
   */
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  /**
   * Move o foco para o aside ao abrir — torna o teclado consistente com a
   * leitura visual do drawer e habilita Tab para varrer os links logo na
   * primeira interação. Em desktop o efeito é inócuo (foco volta com
   * scroll natural).
   */
  useEffect(() => {
    if (open && wrapperRef.current) {
      wrapperRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <>
      <Backdrop
        $open={open}
        aria-hidden="true"
        data-testid="sidebar-backdrop"
        onClick={onClose}
      />
      <SidebarWrapper
        ref={wrapperRef}
        $open={open}
        role="navigation"
        aria-label="Navegação principal"
        aria-modal="true"
        tabIndex={-1}
      >
        <SidebarHeader>
          <LogoArea>
            <img src={logoDark} alt="LFC Admin" height={28} />
          </LogoArea>
          <CloseButton
            type="button"
            aria-label="Fechar menu de navegação"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.5} />
          </CloseButton>
        </SidebarHeader>
        <PanelLabel>Admin Panel</PanelLabel>
        <Nav>
          {NAV_ITEMS.map(item => (
            <NavItemLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <NavNum>{item.num}</NavNum>
              {item.icon}
              <span>{item.label}</span>
            </NavItemLink>
          ))}
        </Nav>
        <SidebarFoot>
          <div>v1.0 · LF Calegari</div>
          <FootVersion>tokenVersion: 12</FootVersion>
        </SidebarFoot>
      </SidebarWrapper>
    </>
  );
};
