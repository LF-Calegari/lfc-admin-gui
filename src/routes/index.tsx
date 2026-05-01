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
import { RoutesPage } from '../pages/RoutesPage';
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
 * Os codes seguem o padrão real do backend (`AuthenticatorRoutesSeeder`)
 * `AUTH_V1_<RECURSO>_<ACAO>` — cada code identifica uma rota de API.
 * O backend consolidou permissões e rotas em um único catálogo, então
 * o gating de cada página usa o code de "list" do recurso correspondente
 * (`AUTH_V1_SYSTEMS_LIST` para `/systems`, etc.). O `state.permissions`
 * exposto pelo Provider é populado com a lista `routes` de
 * `GET /auth/permissions`, então `hasPermission(code)` consulta a mesma
 * lista usada no `X-Route-Code` do `verify-token`.
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
          <RequirePermission code="AUTH_V1_SYSTEMS_LIST">
            <SystemsPage />
          </RequirePermission>
        }
      />
      <Route
        path="/systems/:systemId/routes"
        element={
          <RequirePermission code="AUTH_V1_SYSTEMS_ROUTES_LIST">
            <RoutesPage />
          </RequirePermission>
        }
      />
      <Route
        path="/systems/:systemId/roles"
        element={
          <RequirePermission code="AUTH_V1_ROLES_LIST">
            <RolesPage />
          </RequirePermission>
        }
      />
      <Route
        path="/routes"
        element={
          <RequirePermission code="AUTH_V1_SYSTEMS_ROUTES_LIST">
            <PlaceholderPage
              eyebrow="02 Rotas"
              title="Rotas registradas"
              desc="Endpoints registrados por sistema. Cada rota possui método, path e permissões associadas. Para listar as rotas de um sistema específico, abra o sistema correspondente."
            />
          </RequirePermission>
        }
      />
      <Route
        path="/roles"
        element={
          <RequirePermission code="AUTH_V1_ROLES_LIST">
            <PlaceholderPage
              eyebrow="03 Roles"
              title="Gerenciamento de Roles"
              desc="Roles agrupam permissões e podem ser atribuídas a usuários do sistema. Para listar as roles de um sistema específico, abra o sistema correspondente."
            />
          </RequirePermission>
        }
      />
      <Route
        path="/permissions"
        element={
          <RequirePermission code="AUTH_V1_PERMISSIONS_LIST">
            <PermissionsPage />
          </RequirePermission>
        }
      />
      <Route
        path="/users"
        element={
          <RequirePermission code="AUTH_V1_USERS_LIST">
            <UsersPage />
          </RequirePermission>
        }
      />
      <Route
        path="/tokens"
        element={
          <RequirePermission code="AUTH_V1_TOKEN_TYPES_LIST">
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
