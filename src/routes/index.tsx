import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { InternalErrorPage } from '../pages/InternalErrorPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PermissionsPage } from '../pages/PermissionsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { RolesPage } from '../pages/RolesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ShowcasePage } from '../pages/ShowcasePage';
import { SystemsPage } from '../pages/SystemsPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { UsersPage } from '../pages/UsersPage';
import { RequireAuth, RequirePermission } from '../shared/auth';

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
 * - Rotas públicas (`/login`, `/error/:code`, wildcard 404) vivem em
 *   top-level, fora dos guards, para serem acessíveis sem sessão e sem
 *   exibir Sidebar/Topbar antes da autenticação.
 * - Toda rota autenticada vive sob `<RequireAuth><AppLayout></AppLayout></RequireAuth>`.
 *   O guard `<RequireAuth>` redireciona para `/login` preservando
 *   `state.from`; em seguida o `<AppLayout>` provê Sidebar + Topbar +
 *   Outlet.
 * - Rotas administrativas com gating de permissão (`/systems`, `/roles`,
 *   `/permissions`, `/users`, `/routes`, `/tokens`) são envolvidas por
 *   `<RequirePermission code="...">`, que redireciona para `/error/403`
 *   quando o usuário autenticado não possui o código exigido.
 * - Rotas administrativas SEM gating de permissão:
 *   - `/` redireciona para `/systems` (decisão estrutural, não dado).
 *   - `/settings` é configuração pessoal — sempre acessível ao usuário
 *     autenticado.
 *   - `/showcase` é catálogo visual interno e fica gated apenas por
 *     `import.meta.env.DEV`; sem semântica de domínio para permissão.
 * - O wildcard `*` renderiza 404 — atende ao critério "rota inexistente
 *   exibe 404" sem trocar a URL digitada pelo usuário.
 *
 * Convenção de codes de permissão:
 *
 * Os codes seguem o padrão real do backend `perm:<Recurso>.<Acao>`,
 * espelhando exatamente as constantes definidas em
 * `auth-service/AuthService/Auth/PermissionPolicies.cs`. Atenção a
 * nomes não óbvios: rotas de sistemas são `SystemsRoutes` (não
 * `Routes`) e tokens são `SystemTokensTypes` (não `Tokens`). O
 * catálogo consumido é `permissionCodes` no `verify-token`, populado
 * em `state.permissions` pelo Provider.
 */
export const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />

    <Route
      element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }
    >
      <Route index element={<Navigate to="/systems" replace />} />

      <Route
        path="/systems"
        element={
          <RequirePermission code="perm:Systems.Read">
            <SystemsPage />
          </RequirePermission>
        }
      />
      <Route
        path="/routes"
        element={
          <RequirePermission code="perm:SystemsRoutes.Read">
            <PlaceholderPage
              eyebrow="02 Rotas"
              title="Rotas registradas"
              desc="Endpoints registrados por sistema. Cada rota possui método, path e permissões associadas."
            />
          </RequirePermission>
        }
      />
      <Route
        path="/roles"
        element={
          <RequirePermission code="perm:Roles.Read">
            <RolesPage />
          </RequirePermission>
        }
      />
      <Route
        path="/permissions"
        element={
          <RequirePermission code="perm:Permissions.Read">
            <PermissionsPage />
          </RequirePermission>
        }
      />
      <Route
        path="/users"
        element={
          <RequirePermission code="perm:Users.Read">
            <UsersPage />
          </RequirePermission>
        }
      />
      <Route
        path="/tokens"
        element={
          <RequirePermission code="perm:SystemTokensTypes.Read">
            <PlaceholderPage
              eyebrow="06 Tokens"
              title="Tokens JWT"
              desc="Tokens emitidos por sistema. tokenVersion atual: 12. Revogar um token invalida a sessão do usuário imediatamente."
            />
          </RequirePermission>
        }
      />
      <Route path="/settings" element={<SettingsPage />} />

      {import.meta.env.DEV && <Route path="/showcase" element={<ShowcasePage />} />}
    </Route>

    <Route path="/error/:code" element={<ErrorRouteResolver />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
