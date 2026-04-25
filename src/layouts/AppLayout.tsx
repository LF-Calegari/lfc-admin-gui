import React, { useCallback, useEffect, useState } from 'react';
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

/**
 * Trava de scroll body enquanto o drawer está aberto. Aplica via styled
 * `createGlobalStyle` para evitar manipulação imperativa de `document`.
 */
const BodyScrollLock = createGlobalStyle`
  body {
    overflow: hidden;
  }
`;

/**
 * Shell — em mobile ocupa coluna única (Sidebar é drawer overlay e não
 * consome espaço no layout); a partir de `--bp-md` (48em ≈ 768px) volta
 * ao grid de duas colunas.
 */
const Shell = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  min-height: 100vh;
  position: relative;
  z-index: 1;

  @media (min-width: 48em) {
    grid-template-columns: var(--sidebar-w) 1fr;
  }
`;

const MainArea = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
  overflow: hidden;
`;

/**
 * Área de conteúdo. `min-width: 0` evita que filhos com conteúdo extenso
 * (tabelas, blocos de texto longos) gerem overflow horizontal no grid
 * pai. Padding cresce a partir de `--bp-md` para acompanhar o respiro
 * desktop sem prejudicar leitura em 320px.
 */
const ContentArea = styled.main`
  padding: 20px 16px;
  width: 100%;
  min-width: 0;

  @media (min-width: 48em) {
    padding: 28px 24px;
  }

  @media (min-width: 64em) {
    padding: 36px;
    max-width: 1400px;
  }
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

  // Drawer mobile da Sidebar — fechado por padrão.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fecha o drawer ao navegar (mudança de rota): em mobile o drawer some
  // para revelar o conteúdo; em desktop a operação é inerte.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleLogout = () => {
    // Sessão invalidada — placeholder para integração com lfc-authenticator.
    globalThis.location.reload();
  };

  return (
    <>
      <GridOverlay />
      {drawerOpen && <BodyScrollLock />}
      <Shell>
        <Sidebar open={drawerOpen} onClose={handleCloseDrawer} />
        <MainArea>
          <Topbar
            title={title}
            user={user}
            onLogout={handleLogout}
            onMenuClick={handleOpenDrawer}
            drawerOpen={drawerOpen}
          />
          <ContentArea>
            <Outlet />
          </ContentArea>
        </MainArea>
      </Shell>
    </>
  );
};
