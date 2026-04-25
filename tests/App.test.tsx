import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ApiClient } from '@/shared/api';

import { AppRoutes } from '@/routes';
import { AuthProvider } from '@/shared/auth';
import { STORAGE_KEYS } from '@/shared/auth/storage';

/**
 * Cliente HTTP stub para os testes de árvore: o `AppLayout` consome
 * `useAuth()`, e o `AuthProvider` injeta callbacks no client. O
 * `verify-token` retorna uma Promise pendente para evitar que o
 * `setState` da hidratação aconteça depois do teste capturar a árvore
 * (gera warnings de `act` desnecessários em assertivas síncronas).
 *
 * Como o estado otimista vindo do `localStorage` já é suficiente para
 * pintar Sidebar/Topbar/conteúdo, a Promise pendente não prejudica os
 * cenários cobertos aqui.
 */
function makeInertClient(): ApiClient {
  const stub = {
    request: vi.fn(),
    get: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
  };
  return stub as unknown as ApiClient;
}

/**
 * Pré-popula `localStorage` com uma sessão de admin.
 *
 * Após a Issue #56, `<RequireAuth>` redireciona qualquer rota privada
 * para `/login` quando não há sessão; e `<RequirePermission>` redireciona
 * para `/error/403` quando o code não está presente. Para preservar os
 * cenários originais (Sidebar/Topbar pintadas em `/systems`), semeamos
 * uma sessão com permissões suficientes para todas as rotas listadas.
 */
function seedAdminSession(): void {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-admin-test');
  window.localStorage.setItem(
    STORAGE_KEYS.user,
    JSON.stringify({
      user: {
        id: 'u-admin',
        name: 'Admin',
        email: 'admin@lfc.com.br',
      },
      permissions: ['Systems.Read', 'Roles.Read', 'Permissions.Read', 'Users.Read'],
    }),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider client={makeInertClient()} verifyIntervalMs={0} disableSplash>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

test('renderiza Sidebar e Topbar com itens de navegação', () => {
  seedAdminSession();
  renderAt('/systems');

  expect(screen.getByText('Rotas')).toBeInTheDocument();
  expect(screen.getByText('Roles')).toBeInTheDocument();
  expect(screen.getByText('Permissões')).toBeInTheDocument();
  expect(screen.getByText('Usuários')).toBeInTheDocument();
  expect(screen.getByText('Admin Panel')).toBeInTheDocument();
});

test('exibe o usuário autenticado na Topbar', () => {
  seedAdminSession();
  renderAt('/systems');

  expect(screen.getByText('admin@lfc.com.br')).toBeInTheDocument();
});

test('rota inexistente exibe pagina 404', () => {
  renderAt('/rota-que-nao-existe');

  expect(screen.getByText('404')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Voltar ao início' }),
  ).toBeInTheDocument();
});

test('rota /error/:code resolve a pagina correspondente ao codigo', () => {
  renderAt('/error/401');

  expect(screen.getByText('401')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Não autenticado' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fazer login' })).toBeInTheDocument();
});

test('rota /error/:code com codigo desconhecido cai no 404', () => {
  renderAt('/error/999');

  expect(screen.getByText('404')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeInTheDocument();
});

test('itens da Sidebar apontam para rotas reais', () => {
  seedAdminSession();
  renderAt('/systems');

  const link = screen.getByRole('link', { name: /Roles/i });
  expect(link).toHaveAttribute('href', '/roles');
});
