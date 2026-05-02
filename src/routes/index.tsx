import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { ClientEditPage, ClientsListShellPage } from '../pages/clients';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { InternalErrorPage } from '../pages/InternalErrorPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PermissionsListShellPage } from '../pages/permissions';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { RolePermissionsShellPage } from '../pages/roles/RolePermissionsShellPage';
import { RolesGlobalListShellPage } from '../pages/roles/RolesGlobalListShellPage';
import { RolesPage } from '../pages/RolesPage';
import { RoutesPage } from '../pages/RoutesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ShowcasePage } from '../pages/ShowcasePage';
import { SystemsPage } from '../pages/SystemsPage';
import { TokensListShellPage } from '../pages/tokens';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import {
  UserDetailShellPage,
  UserEffectivePermissionsShellPage,
  UserPermissionsShellPage,
  UserRolesShellPage,
  UsersListShellPage,
} from '../pages/users';
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
 * - Rotas administrativas com gating de permissão (`/systems`,
 *   `/roles`, `/permissoes`, `/clientes`, `/usuarios`, `/routes`,
 *   `/tokens`) são envolvidas por `<RequirePermission code="...">`,
 *   que redireciona para `/error/403` quando o usuário autenticado
 *   não possui o código exigido.
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
 *
 * Convenção de naming das rotas (Issue #145):
 *
 * As novas seções de primeiro nível introduzidas pelas EPICs #48
 * (Permissões) e #49 (Clientes/Usuários) usam paths em português
 * (`/clientes`, `/usuarios`, `/permissoes`) por alinhamento com a UX
 * em pt-BR do painel. Rotas anteriores (`/systems`, `/routes`,
 * `/roles`, `/tokens`) permanecem em inglês — a normalização total
 * fica fora do escopo desta issue.
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
        path="/systems/:systemId/roles/:roleId/permissoes"
        element={
          // Issue #69: a tela exige LER o catálogo de permissões
          // (`AUTH_V1_PERMISSIONS_LIST`) E ATUALIZAR a role
          // (`AUTH_V1_ROLES_UPDATE`). Aninhamos `RequirePermission`
          // para validar ambas — ordem é irrelevante visualmente, mas
          // começamos pela leitura para que o erro mais comum (admin
          // sem `Permissions.Read`) fale primeiro: se o catálogo não
          // pode nem ser carregado, salvar não faz sentido. Espelha
          // o padrão estabelecido em `/usuarios/:id/permissoes` para
          // `UserPermissionsShellPage` (Issue #70).
          <RequirePermission code="AUTH_V1_PERMISSIONS_LIST">
            <RequirePermission code="AUTH_V1_ROLES_UPDATE">
              <RolePermissionsShellPage />
            </RequirePermission>
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
            <RolesGlobalListShellPage />
          </RequirePermission>
        }
      />
      <Route
        path="/permissoes"
        element={
          <RequirePermission code="AUTH_V1_PERMISSIONS_LIST">
            <PermissionsListShellPage />
          </RequirePermission>
        }
      />
      <Route
        path="/clientes"
        element={
          <RequirePermission code="AUTH_V1_CLIENTS_LIST">
            <ClientsListShellPage />
          </RequirePermission>
        }
      />
      <Route
        path="/clientes/:id"
        element={
          <RequirePermission code="AUTH_V1_CLIENTS_GET_BY_ID">
            <ClientEditPage />
          </RequirePermission>
        }
      />
      <Route
        path="/usuarios"
        element={
          <RequirePermission code="AUTH_V1_USERS_LIST">
            <UsersListShellPage />
          </RequirePermission>
        }
      />
      <Route
        path="/usuarios/:id"
        element={
          <RequirePermission code="AUTH_V1_USERS_GET_BY_ID">
            <UserDetailShellPage />
          </RequirePermission>
        }
      />
      <Route
        path="/usuarios/:id/permissoes"
        element={
          // Issue #70: a tela exige LER o catálogo (Permissions.Read,
          // code `AUTH_V1_PERMISSIONS_LIST`) E ATUALIZAR o usuário
          // (Users.Update, code `AUTH_V1_USERS_PERMISSIONS_ASSIGN`).
          // Aninhamos `RequirePermission` para validar ambas — ordem é
          // irrelevante visualmente, mas começamos pela leitura para
          // que o erro mais comum (admin sem `Permissions.Read`) fale
          // primeiro. Se o catálogo não pode nem ser carregado, salvar
          // não faz sentido.
          <RequirePermission code="AUTH_V1_PERMISSIONS_LIST">
            <RequirePermission code="AUTH_V1_USERS_PERMISSIONS_ASSIGN">
              <UserPermissionsShellPage />
            </RequirePermission>
          </RequirePermission>
        }
      />
      <Route
        path="/usuarios/:id/roles"
        element={
          // Issue #71: tela de atribuição de roles ao usuário. Mesmo
          // padrão de gating duplo da Issue #70 — exige LER o catálogo
          // de roles (`Roles.Read`, code `AUTH_V1_ROLES_LIST`) E
          // VINCULAR a um usuário (`Users.Update`, code
          // `AUTH_V1_USERS_ROLES_ASSIGN`). Começamos pelo `Roles.Read`
          // para que o erro mais comum (admin sem leitura do catálogo)
          // fale primeiro — sem o catálogo a tela não pode nem ser
          // exibida com sentido.
          <RequirePermission code="AUTH_V1_ROLES_LIST">
            <RequirePermission code="AUTH_V1_USERS_ROLES_ASSIGN">
              <UserRolesShellPage />
            </RequirePermission>
          </RequirePermission>
        }
      />
      <Route
        path="/usuarios/:id/permissoes-efetivas"
        element={
          // Issue #72: painel READ-ONLY com a união consolidada das
          // permissões efetivas (diretas + via roles). Exige LER o
          // catálogo de permissões (`Permissions.Read`, code
          // `AUTH_V1_PERMISSIONS_LIST`) — para que o operador entenda
          // os codes/nomes das permissões — E LER o usuário
          // (`Users.Read`, code `AUTH_V1_USERS_GET_BY_ID`) — para que o
          // backend autorize o `GET /users/{id}/effective-permissions`
          // (mesma policy `UsersRead` aplicada ao endpoint). Aninhamos
          // `RequirePermission` para validar ambas; começamos pelo
          // `Permissions.Read` para que o erro mais comum (admin sem
          // leitura do catálogo) fale primeiro, espelhando o padrão da
          // Issue #70.
          <RequirePermission code="AUTH_V1_PERMISSIONS_LIST">
            <RequirePermission code="AUTH_V1_USERS_GET_BY_ID">
              <UserEffectivePermissionsShellPage />
            </RequirePermission>
          </RequirePermission>
        }
      />
      <Route
        path="/tokens"
        element={
          // Issue #175: substitui o `<PlaceholderPage>` mockado por
          // CRUD funcional de tipos de token JWT. O título da página
          // ("Tipos de token JWT") é renderizado pelo
          // `TokensListShellPage` via `<PageHeader>` — o label
          // "Tokens" da Sidebar permanece inalterado por economia de
          // espaço (decisão da Issue #175).
          <RequirePermission code="AUTH_V1_TOKEN_TYPES_LIST">
            <TokensListShellPage />
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
