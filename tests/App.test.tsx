import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { installFakeIndexedDB, uninstallFakeIndexedDB } from './shared/auth/__helpers__/fakeIndexedDB';

import type { ApiClient } from '@/shared/api';
import type { CachedPermissions } from '@/shared/auth';

import { AppRoutes } from '@/routes';
import { AuthProvider } from '@/shared/auth';
import { permissionsCache, PERMISSIONS_CACHE_KEYS } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';


/**
 * Cliente HTTP stub para os testes de árvore: o `AppLayout` consome
 * `useAuth()`, e o `AuthProvider` injeta callbacks no client. O
 * `verify-token` retorna uma Promise pendente para evitar que o
 * `setState` da hidratação aconteça depois do teste capturar a árvore
 * (gera warnings de `act` desnecessários em assertivas síncronas).
 *
 * Como o estado otimista vindo do cache em IndexedDB já é suficiente
 * para pintar Sidebar/Topbar/conteúdo, a Promise pendente não
 * prejudica os cenários cobertos aqui.
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
    getSystemId: vi.fn(() => 'system-test-uuid'),
  };
  return stub as unknown as ApiClient;
}

/**
 * Pré-popula token (`localStorage`) e catálogo (IndexedDB) para
 * simular sessão admin completa.
 *
 * Após a Issue #122, o token vive em `localStorage` (`tokenStorage`)
 * e o catálogo de permissões em IndexedDB (`permissionsCache`). Para
 * preservar os cenários originais (Sidebar/Topbar pintadas em
 * `/systems`), semeamos uma sessão com permissões suficientes para
 * todas as rotas listadas.
 */
async function seedAdminSession(): Promise<void> {
  globalThis.localStorage.setItem(STORAGE_KEYS.token, 'jwt-admin-test');
  await permissionsCache.save({
    user: {
      id: 'u-admin',
      name: 'Admin',
      email: 'admin@lfc.com.br',
      identity: 1,
    },
    routes: [
      'AUTH_V1_SYSTEMS_LIST',
      'AUTH_V1_ROLES_LIST',
      'AUTH_V1_PERMISSIONS_LIST',
      'AUTH_V1_USERS_LIST',
    ],
  } as Omit<CachedPermissions, 'cachedAt'>);
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
  installFakeIndexedDB();
  globalThis.localStorage.clear();
});

afterEach(() => {
  uninstallFakeIndexedDB();
});

test('renderiza Sidebar e Topbar com itens de navegação', async () => {
  await seedAdminSession();
  renderAt('/systems');

  // O catálogo é hidratado via IndexedDB de forma assíncrona — aguardamos
  // o conteúdo aparecer antes de asserir os links.
  await waitFor(() => expect(screen.getByText('Rotas')).toBeInTheDocument());
  expect(screen.getByText('Roles')).toBeInTheDocument();
  expect(screen.getByText('Permissões')).toBeInTheDocument();
  expect(screen.getByText('Usuários')).toBeInTheDocument();
  expect(screen.getByText('Admin Panel')).toBeInTheDocument();
});

test('exibe o usuário autenticado na Topbar', async () => {
  await seedAdminSession();
  renderAt('/systems');

  await waitFor(() =>
    expect(screen.getByText('admin@lfc.com.br')).toBeInTheDocument(),
  );
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

test('itens da Sidebar apontam para rotas reais', async () => {
  await seedAdminSession();
  renderAt('/systems');

  await waitFor(() => {
    const link = screen.getByRole('link', { name: /Roles/i });
    expect(link).toHaveAttribute('href', '/roles');
  });
});

test('seedAdminSession grava o catálogo no IndexedDB esperado', async () => {
  // Smoke test: confirma que o helper de seed gravou na DB esperada,
  // evitando que regressões na nomenclatura passem despercebidas.
  await seedAdminSession();
  expect(PERMISSIONS_CACHE_KEYS.dbName).toBe('lfc-admin-auth');
  expect(PERMISSIONS_CACHE_KEYS.recordKey).toBe('current');
  const cached = await permissionsCache.load();
  expect(cached?.user.email).toBe('admin@lfc.com.br');
});
