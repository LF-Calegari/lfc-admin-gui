import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { InternalErrorPage } from '../pages/InternalErrorPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PermissionsPage } from '../pages/PermissionsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { RolesPage } from '../pages/RolesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ShowcasePage } from '../pages/ShowcasePage';
import { SystemsPage } from '../pages/SystemsPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { UsersPage } from '../pages/UsersPage';

/**
 * Mapa de páginas por código de erro suportado. Códigos desconhecidos caem
 * no 404 — preserva o critério "rota inexistente exibe 404".
 */
const ERROR_PAGES: Record<string, React.ComponentType> = {
  '401': UnauthorizedPage,
  '403': ForbiddenPage,
  '404': NotFoundPage,
  '500': InternalErrorPage,
};

/**
 * Resolve dinamicamente a página de erro a partir do parâmetro `:code` da
 * URL. Concentrar a decisão aqui mantém `AppRoutes` declarativo.
 */
const ErrorRouteResolver: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const PageComponent = (code && ERROR_PAGES[code]) || NotFoundPage;
  return <PageComponent />;
};

/**
 * Estrutura de rotas do painel administrativo.
 *
 * Convenções:
 * - Toda rota autenticada vive sob `<AppLayout>` (Sidebar + Topbar + Outlet).
 * - O índice `/` redireciona para `/systems` para preservar UX legada.
 * - Rotas `/error/:code` mapeiam para as páginas reais de erro
 *   (404/401/403/500) via `ERROR_PAGES`.
 * - O wildcard `*` renderiza o 404 — atende ao critério "rota inexistente
 *   exibe 404" sem trocar a URL digitada pelo usuário.
 * - A rota `/showcase` só é registrada em build de desenvolvimento.
 */
export const AppRoutes: React.FC = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Navigate to="/systems" replace />} />

      <Route path="/systems" element={<SystemsPage />} />
      <Route
        path="/routes"
        element={
          <PlaceholderPage
            eyebrow="02 Rotas"
            title="Rotas registradas"
            desc="Endpoints registrados por sistema. Cada rota possui método, path e permissões associadas."
          />
        }
      />
      <Route path="/roles" element={<RolesPage />} />
      <Route path="/permissions" element={<PermissionsPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route
        path="/tokens"
        element={
          <PlaceholderPage
            eyebrow="06 Tokens"
            title="Tokens JWT"
            desc="Tokens emitidos por sistema. tokenVersion atual: 12. Revogar um token invalida a sessão do usuário imediatamente."
          />
        }
      />
      <Route path="/settings" element={<SettingsPage />} />

      {import.meta.env.DEV && <Route path="/showcase" element={<ShowcasePage />} />}

      <Route path="/error/:code" element={<ErrorRouteResolver />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
);
