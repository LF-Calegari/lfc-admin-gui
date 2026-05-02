import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, matchPath } from 'react-router-dom';
import styled, { createGlobalStyle } from 'styled-components';

import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { useAuth } from '../shared/auth';

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
 * por isso ordene do mais específico ao mais genérico — em particular,
 * `/usuarios/:id/permissoes` precisa vir antes de `/usuarios/:id` para
 * pintar o título correto.
 */
const ROUTE_TITLES: RouteTitleEntry[] = [
  // Issue #62: `/systems/:systemId/routes` precisa vir ANTES de
  // `/systems` — `matchPath` com `end: false` faz prefix-match e o
  // primeiro padrão que casar ganha. Sem essa ordem, a Topbar exibiria
  // "Sistemas" na página de listagem de rotas escopada a um sistema.
  { pattern: '/systems/:systemId/routes', title: 'Rotas' },
  // Issue #66: mesma regra — `/systems/:systemId/roles` precisa vir
  // ANTES de `/systems`, pelo mesmo motivo do `matchPath` prefix-match.
  { pattern: '/systems/:systemId/roles', title: 'Roles' },
  { pattern: '/systems', title: 'Sistemas' },
  { pattern: '/routes', title: 'Rotas' },
  { pattern: '/roles', title: 'Roles' },
  { pattern: '/permissoes', title: 'Permissões' },
  { pattern: '/usuarios/:id/permissoes', title: 'Permissões do usuário' },
  { pattern: '/usuarios/:id', title: 'Detalhe do usuário' },
  { pattern: '/usuarios', title: 'Usuários' },
  { pattern: '/clientes/:id', title: 'Detalhe do cliente' },
  { pattern: '/clientes', title: 'Clientes' },
  { pattern: '/tokens', title: 'Tokens' },
  { pattern: '/settings', title: 'Configurações' },
  { pattern: '/showcase', title: 'Showcase UI' },
  { pattern: '/error/:code', title: 'Erro' },
];

const FALLBACK_TITLE = 'Admin';

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

  const auth = useAuth();

  /**
   * Sessão exposta para a Topbar. Derivada do `useAuth()` quando há
   * usuário autenticado; cai em fallback genérico até o Provider terminar
   * de hidratar (apenas se a rota privada for pintada antes da splash, o
   * que não acontece em fluxo normal — defesa contra corner case).
   */
  const user = useMemo<AuthUser>(() => {
    if (auth.user) {
      const roleLabel = auth.user.roles?.[0] ?? 'user';
      return {
        name: auth.user.email,
        role: roleLabel,
        permCount: auth.permissions.length,
      };
    }
    return {
      name: 'admin@lfc.com.br',
      role: 'root',
      permCount: 12,
    };
  }, [auth.user, auth.permissions]);

  // Drawer mobile da Sidebar — fechado por padrão.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fecha o drawer ao navegar (mudança de rota): em mobile o drawer some
  // para revelar o conteúdo; em desktop a operação é inerte.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);

  /**
   * Encerra a sessão via `useAuth().logout()`. O Provider já cuida de:
   * (1) chamar `GET /auth/logout` para invalidar `tokenVersion` no
   * backend; (2) limpar storage/estado; (3) redirecionar para `/login`.
   *
   * `void` é intencional: o handler do botão não precisa aguardar a
   * Promise — a navegação é disparada de dentro do `logout`.
   */
  const handleLogout = useCallback(() => {
    void auth.logout();
  }, [auth]);

  return (
    <>
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
