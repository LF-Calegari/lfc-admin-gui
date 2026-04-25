import { Search, Bell, LogOut, Menu, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { ThemeToggle } from '../ui/ThemeToggle';

interface TopbarUser {
  name: string;
  role?: string;
  permCount?: number;
}

interface TopbarProps {
  title: string;
  user?: TopbarUser;
  onLogout?: () => void;
  /**
   * Disparado pelo hamburger em mobile (< `--bp-md`). Em desktop o botão é
   * ocultado via `@media`, então o handler é inerte.
   */
  onMenuClick?: () => void;
  /**
   * Reflete o estado do drawer controlado pelo layout. Usado para expor
   * `aria-expanded` no botão hamburger e indicar a leitores de tela se o
   * `#sidebar-drawer` (referenciado em `aria-controls`) está aberto.
   */
  drawerOpen?: boolean;
}

const TopbarWrapper = styled.header`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-base) 88%, transparent);
  backdrop-filter: saturate(140%) blur(10px);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);

  /* Desktop (≥ --bp-md, 48em) — gap e padding mais arejados. */
  @media (min-width: 48em) {
    gap: 24px;
    padding: 18px 36px;
  }
`;

/**
 * Botão hamburger — visível somente em mobile (< --bp-md, 48em ≈ 768px).
 * Cumpre touch target ≥ 44×44px via `--touch-min`.
 */
const MenuButton = styled.button`
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
  flex-shrink: 0;
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

const TopbarTitle = styled.h1`
  margin: 0;
  font-size: 14px;
  font-weight: var(--weight-medium);
  color: var(--fg2);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;

  /* Desktop (≥ --bp-md, 48em). */
  @media (min-width: 48em) {
    font-size: 15px;
  }
`;

const TopbarRight = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;

  @media (min-width: 48em) {
    gap: 10px;
  }
`;

/**
 * Wrapper da busca. Em mobile fica colapsada como ícone clicável; ao
 * expandir, ocupa a linha inteira sobre o resto da Topbar (overlay
 * absoluto). Em desktop retorna ao layout inline tradicional.
 */
const SearchSlot = styled.div<{ $expanded: boolean }>`
  /* Mobile (< --bp-md) — comportamento expansível. */
  position: ${({ $expanded }) => ($expanded ? 'absolute' : 'static')};
  inset: ${({ $expanded }) => ($expanded ? '0' : 'auto')};
  background: ${({ $expanded }) =>
    $expanded ? 'var(--bg-base)' : 'transparent'};
  display: flex;
  align-items: center;
  padding: ${({ $expanded }) => ($expanded ? '14px 16px' : '0')};
  z-index: var(--z-raised);

  /* Desktop (≥ --bp-md, 48em) — busca sempre inline. */
  @media (min-width: 48em) {
    position: static;
    inset: auto;
    background: transparent;
    padding: 0;
    flex: 0 1 auto;
  }
`;

const SearchToggle = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--fg2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

  /* Desktop (≥ --bp-md, 48em) — busca permanece inline, ocultar toggle. */
  @media (min-width: 48em) {
    display: none;
  }
`;

const SearchBox = styled.div<{ $expanded: boolean }>`
  display: ${({ $expanded }) => ($expanded ? 'flex' : 'none')};
  align-items: center;
  gap: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  width: 100%;
  color: var(--fg3);
  transition:
    border-color 150ms var(--ease-default),
    box-shadow 150ms var(--ease-default);

  &:hover {
    border-color: var(--border-base);
  }

  &:focus-within {
    border-color: var(--accent);
    box-shadow: var(--focus-ring-accent);
  }

  /* Desktop (≥ --bp-md, 48em) — sempre visível, largura fixa. */
  @media (min-width: 48em) {
    display: flex;
    width: 320px;
  }
`;

const SearchInput = styled.input`
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--fg1);
  flex: 1;
  min-width: 0;

  &::placeholder {
    color: var(--fg3);
  }
`;

const SearchKbd = styled.kbd`
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg3);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  display: none;

  /* Desktop (≥ --bp-md, 48em) — atalho só relevante com teclado físico. */
  @media (min-width: 48em) {
    display: inline-flex;
  }
`;

const SearchClose = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  min-width: var(--touch-min);
  min-height: var(--touch-min);

  &:hover {
    color: var(--fg1);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }

  /* Desktop (≥ --bp-md, 48em) — drawer-search não existe, esconder. */
  @media (min-width: 48em) {
    display: none;
  }
`;

const IconButton = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--fg2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-min);
  min-height: var(--touch-min);
  transition: all 150ms var(--ease-default);

  &:hover:not(:disabled) {
    background: var(--bg-elevated);
    color: var(--fg1);
    border-color: var(--border-base);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  /* Desktop (≥ --bp-md, 48em) — botões compactos no canto. */
  @media (min-width: 48em) {
    width: 34px;
    height: 34px;
    min-width: 0;
    min-height: 0;
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;

  /* Desktop (≥ --bp-md, 48em) — exibe meta + separador esquerdo. */
  @media (min-width: 48em) {
    gap: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--border-subtle);
    margin-left: 4px;
  }
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--clr-lime), var(--clr-green));
  color: var(--clr-forest);
  font-weight: var(--weight-bold);
  font-size: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
`;

/**
 * Bloco com nome/role do usuário. Oculto em mobile para preservar espaço
 * — a identidade fica representada pelo Avatar; em desktop reaparece.
 */
const UserMeta = styled.div`
  display: none;

  @media (min-width: 48em) {
    display: block;
  }
`;

const UserName = styled.div`
  font-size: 13px;
  font-weight: var(--weight-medium);
  color: var(--fg1);
`;

const UserRole = styled.div`
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
`;

/**
 * Bell de notificações — informacional secundário. Em mobile fica oculto
 * para reduzir a densidade da Topbar; reaparece a partir de --bp-md.
 */
const NotificationsButton = styled(IconButton)`
  display: none;

  @media (min-width: 48em) {
    display: inline-flex;
  }
`;

export const Topbar: React.FC<TopbarProps> = ({
  title,
  user,
  onLogout,
  onMenuClick,
  drawerOpen = false,
}) => {
  const initials = user?.name?.[0]?.toUpperCase() ?? 'A';
  const roleLabel = user
    ? `${user.role ?? 'root'} · ${user.permCount ?? 12} perms`
    : 'root · 12 perms';

  // Em mobile a busca colapsa em ícone; ao expandir, mostramos input
  // ocupando a linha inteira sobre a Topbar.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  return (
    <TopbarWrapper>
      <MenuButton
        type="button"
        aria-label="Abrir menu de navegação"
        aria-controls="sidebar-drawer"
        aria-expanded={drawerOpen}
        onClick={onMenuClick}
        data-testid="topbar-menu-button"
      >
        <Menu size={18} strokeWidth={1.5} />
      </MenuButton>
      <TopbarTitle>{title}</TopbarTitle>
      <TopbarRight>
        <SearchToggle
          type="button"
          aria-label="Abrir busca"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} strokeWidth={1.5} />
        </SearchToggle>
        <SearchSlot $expanded={searchOpen}>
          <SearchBox $expanded={searchOpen}>
            <Search size={14} strokeWidth={1.5} />
            <SearchInput
              ref={searchInputRef}
              placeholder="Buscar sistemas, usuários, permissões…"
              aria-label="Buscar no painel"
            />
            <SearchKbd>⌘K</SearchKbd>
            <SearchClose
              type="button"
              aria-label="Fechar busca"
              onClick={() => setSearchOpen(false)}
            >
              <X size={16} strokeWidth={1.5} />
            </SearchClose>
          </SearchBox>
        </SearchSlot>
        <NotificationsButton
          type="button"
          aria-label="Notificações (em breve)"
          title="Notificações (em breve)"
          disabled
          aria-disabled="true"
        >
          <Bell size={16} strokeWidth={1.5} />
        </NotificationsButton>
        <ThemeToggle />
        <UserSection>
          <Avatar>{initials}</Avatar>
          <UserMeta>
            <UserName>{user?.name ?? 'admin@lfc'}</UserName>
            <UserRole>{roleLabel}</UserRole>
          </UserMeta>
          <IconButton type="button" onClick={onLogout} title="Sair" aria-label="Sair">
            <LogOut size={16} strokeWidth={1.5} />
          </IconButton>
        </UserSection>
      </TopbarRight>
    </TopbarWrapper>
  );
};
