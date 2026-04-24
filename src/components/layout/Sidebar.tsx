import {
  Monitor,
  Shuffle,
  Users,
  Lock,
  User,
  Activity,
  Settings,
} from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import logoDark from '../../assets/logo-dark.svg';

export type NavId = 'systems' | 'routes' | 'roles' | 'perms' | 'users' | 'tokens' | 'settings';

interface NavItem {
  id: NavId;
  num: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'systems',  num: '01', label: 'Sistemas',       icon: <Monitor size={15} strokeWidth={1.5} /> },
  { id: 'routes',   num: '02', label: 'Rotas',          icon: <Shuffle size={15} strokeWidth={1.5} /> },
  { id: 'roles',    num: '03', label: 'Roles',          icon: <Users size={15} strokeWidth={1.5} /> },
  { id: 'perms',    num: '04', label: 'Permissões',     icon: <Lock size={15} strokeWidth={1.5} /> },
  { id: 'users',    num: '05', label: 'Usuários',       icon: <User size={15} strokeWidth={1.5} /> },
  { id: 'tokens',   num: '06', label: 'Tokens',         icon: <Activity size={15} strokeWidth={1.5} /> },
  { id: 'settings', num: '07', label: 'Configurações',  icon: <Settings size={15} strokeWidth={1.5} /> },
];

interface SidebarProps {
  current: NavId;
  onNav: (id: NavId) => void;
}

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

const NavLink = styled.a<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 22px;
  font-size: 13.5px;
  color: ${({ $active }) => ($active ? 'var(--accent-ink)' : 'var(--fg2)')};
  text-decoration: none;
  border-left: 2px solid ${({ $active }) => ($active ? 'var(--accent-ink)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent')};
  transition: all 150ms var(--ease-default);
  cursor: pointer;

  &:hover {
    color: var(--fg1);
    background: var(--bg-elevated);
    border-left-color: var(--border-base);
  }
`;

const NavNum = styled.span<{ $active?: boolean }>`
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: ${({ $active }) => ($active ? 'var(--accent-ink)' : 'var(--fg3)')};
  width: 18px;
  flex-shrink: 0;
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

export const Sidebar: React.FC<SidebarProps> = ({ current, onNav }) => (
  <SidebarWrapper>
    <LogoArea>
      <img src={logoDark} alt="LFC Admin" height={28} />
    </LogoArea>
    <PanelLabel>Admin Panel</PanelLabel>
    <Nav>
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.id}
          href={`#${item.id}`}
          $active={current === item.id}
          onClick={e => {
            e.preventDefault();
            onNav(item.id);
          }}
        >
          <NavNum $active={current === item.id}>{item.num}</NavNum>
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </Nav>
    <SidebarFoot>
      <div>v1.0 · LF Calegari</div>
      <FootVersion>tokenVersion: 12</FootVersion>
    </SidebarFoot>
  </SidebarWrapper>
);
