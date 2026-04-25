import React, { useState } from 'react';
import { Outlet, useLocation, matchPath } from 'react-router-dom';
import styled, { createGlobalStyle } from 'styled-components';

import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';

interface AuthUser {
  name: string;
  role: string;
  permCount: number;
}

interface RouteTitleEntry {
  pattern: string;
  title: string;
}

/**
 * Mapeamento de rota → título exibido na Topbar. Suporta padrões com params
 * via `matchPath` (ex.: `/error/:code`). A primeira correspondência ganha,
 * por isso ordene do mais específico ao mais genérico.
 */
const ROUTE_TITLES: RouteTitleEntry[] = [
  { pattern: '/systems', title: 'Sistemas' },
  { pattern: '/routes', title: 'Rotas' },
  { pattern: '/roles', title: 'Roles' },
  { pattern: '/permissions', title: 'Permissões' },
  { pattern: '/users', title: 'Usuários' },
  { pattern: '/tokens', title: 'Tokens' },
  { pattern: '/settings', title: 'Configurações' },
  { pattern: '/showcase', title: 'Showcase UI' },
  { pattern: '/error/:code', title: 'Erro' },
];

const FALLBACK_TITLE = 'Admin';

const GridOverlay = createGlobalStyle`
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: var(--grid-cell) var(--grid-cell);
    pointer-events: none;
    z-index: 0;
  }
`;

const Shell = styled.div`
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  min-height: 100vh;
  position: relative;
  z-index: 1;
`;

const MainArea = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: hidden;
`;

const ContentArea = styled.main`
  padding: 36px;
  max-width: 1400px;
  width: 100%;
`;

function resolveTitle(pathname: string): string {
  for (const entry of ROUTE_TITLES) {
    if (matchPath({ path: entry.pattern, end: false }, pathname)) {
      return entry.title;
    }
  }
  return FALLBACK_TITLE;
}

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const title = resolveTitle(location.pathname);

  // Sessão estática enquanto não há integração com lfc-authenticator.
  const [user] = useState<AuthUser>({
    name: 'admin@lfc.com.br',
    role: 'root',
    permCount: 12,
  });

  const handleLogout = () => {
    // Sessão invalidada — placeholder para integração com lfc-authenticator.
    window.location.reload();
  };

  return (
    <>
      <GridOverlay />
      <Shell>
        <Sidebar />
        <MainArea>
          <Topbar title={title} user={user} onLogout={handleLogout} />
          <ContentArea>
            <Outlet />
          </ContentArea>
        </MainArea>
      </Shell>
    </>
  );
};
