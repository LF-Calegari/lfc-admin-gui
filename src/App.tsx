import React, { useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';

import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { PermissionsPage } from './pages/PermissionsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RolesPage } from './pages/RolesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { SystemsPage } from './pages/SystemsPage';
import { UsersPage } from './pages/UsersPage';

import type { NavId } from './components/layout/Sidebar';

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

const AppLayout = styled.div`
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

const PAGE_TITLES: Record<NavId, string> = {
  systems:  'Sistemas',
  routes:   'Rotas',
  roles:    'Roles',
  perms:    'Permissões',
  users:    'Usuários',
  tokens:   'Tokens',
  settings: 'Configurações',
  showcase: 'Showcase UI',
};

interface AuthUser {
  name: string;
  role: string;
  permCount: number;
}

function renderPage(page: NavId): React.ReactNode {
  switch (page) {
    case 'systems':
      return <SystemsPage />;
    case 'roles':
      return <RolesPage />;
    case 'users':
      return <UsersPage />;
    case 'perms':
      return <PermissionsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'showcase':
      return <ShowcasePage />;
    case 'routes':
      return (
        <PlaceholderPage
          eyebrow="02 Rotas"
          title="Rotas registradas"
          desc="Endpoints registrados por sistema. Cada rota possui método, path e permissões associadas."
        />
      );
    case 'tokens':
      return (
        <PlaceholderPage
          eyebrow="06 Tokens"
          title="Tokens JWT"
          desc="Tokens emitidos por sistema. tokenVersion atual: 12. Revogar um token invalida a sessão do usuário imediatamente."
        />
      );
    default:
      return null;
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<NavId>('systems');
  const [user] = useState<AuthUser>({
    name: 'admin@lfc.com.br',
    role: 'root',
    permCount: 12,
  });

  const handleLogout = () => {
    // Sessão invalidada — placeholder para integração com lfc-authenticator
    window.location.reload();
  };

  return (
    <>
      <GridOverlay />
      <AppLayout>
        <Sidebar current={currentPage} onNav={setCurrentPage} />
        <MainArea>
          <Topbar
            title={PAGE_TITLES[currentPage]}
            user={user}
            onLogout={handleLogout}
          />
          <ContentArea>
            {renderPage(currentPage)}
          </ContentArea>
        </MainArea>
      </AppLayout>
    </>
  );
}

export default App;
