import {
  Monitor,
  Shuffle,
  Users,
  Lock,
  User,
  Activity,
  Settings,
  Component,
} from 'lucide-react';
import React from 'react';
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

const SidebarWrapper = styled.aside`
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  padding: 28px 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow-y: auto;
  width: var(--sidebar-w);
  flex-shrink: 0;
`;

const LogoArea = styled.div`
  padding: 0 22px 20px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
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

const NavItemLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 22px;
  font-size: 13.5px;
  color: var(--fg2);
  text-decoration: none;
  border-left: var(--border-thick) solid transparent;
  background: transparent;
  transition: all 150ms var(--ease-default);
  cursor: pointer;

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

export const Sidebar: React.FC = () => (
  <SidebarWrapper>
    <LogoArea>
      <img src={logoDark} alt="LFC Admin" height={28} />
    </LogoArea>
    <PanelLabel>Admin Panel</PanelLabel>
    <Nav>
      {NAV_ITEMS.map(item => (
        <NavItemLink
          key={item.to}
          to={item.to}
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
);
