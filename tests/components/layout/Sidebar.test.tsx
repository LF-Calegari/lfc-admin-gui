import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from '../../shared/auth/__helpers__/fakeIndexedDB';

import type { ApiClient } from '@/shared/api';
import type { CachedPermissions } from '@/shared/auth';

import { Sidebar } from '@/components/layout/Sidebar';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { AuthProvider } from '@/shared/auth';
import { permissionsCache } from '@/shared/auth/permissionsCache';
import { STORAGE_KEYS } from '@/shared/auth/storage';

/**
 * Reinstala um polyfill estável de `matchMedia` para cada teste — o Sidebar
 * agora consome `useTheme()`, que chama `window.matchMedia` em runtime.
 * O default casa para `false`; quando o teste precisa simular preferência
 * dark do SO, basta passar `dark = true`.
 */
const installMatchMedia = (dark = false) => {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? dark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

/**
 * Decodifica o `src` quando o asset SVG é servido como data URL inline
 * (comportamento do Vite em test). Para `string` simples retorna a
 * própria URL.
 */
const decodeLogoSrc = (src: string): string => {
  const dataUrlMatch = /^data:image\/svg\+xml;base64,(.+)$/.exec(src);
  if (dataUrlMatch) return atob(dataUrlMatch[1]);
  return src;
};

/**
 * Cliente HTTP "inerte" — `verify-token` nunca resolve para evitar que
 * a hidratação do `AuthProvider` dispare `setState` depois do teste
 * capturar a árvore. Como cada teste pré-popula o cache, o estado
 * otimista já é suficiente para pintar a Sidebar.
 */
function makeInertClient(): ApiClient {
  return {
    request: vi.fn(),
    get: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  } as unknown as ApiClient;
}

/**
 * Catálogo padrão para os testes — admin com todos os codes que
 * habilitam itens de menu, garantindo que a Sidebar renderize a lista
 * completa visível em produção.
 */
const FULL_ADMIN_ROUTES: ReadonlyArray<string> = [
  'AUTH_V1_SYSTEMS_LIST',
  'AUTH_V1_SYSTEMS_ROUTES_LIST',
  'AUTH_V1_ROLES_LIST',
  'AUTH_V1_PERMISSIONS_LIST',
  'AUTH_V1_CLIENTS_LIST',
  'AUTH_V1_USERS_LIST',
  'AUTH_V1_TOKEN_TYPES_LIST',
];

async function seedSession(routes: ReadonlyArray<string>): Promise<void> {
  globalThis.localStorage.setItem(STORAGE_KEYS.token, 'jwt-admin-test');
  await permissionsCache.save({
    user: {
      id: 'u-admin',
      name: 'Admin',
      email: 'admin@lfc.com.br',
      identity: 1,
    },
    routes: [...routes],
  } as Omit<CachedPermissions, 'cachedAt'>);
}

interface RenderOptions {
  open?: boolean;
  onClose?: () => void;
}

function renderSidebar({ open = false, onClose = vi.fn() }: RenderOptions = {}) {
  return render(
    <MemoryRouter>
      <AuthProvider client={makeInertClient()} verifyIntervalMs={0} disableSplash>
        <Sidebar open={open} onClose={onClose} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    installMatchMedia(false);
    installFakeIndexedDB();
    globalThis.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    uninstallFakeIndexedDB();
  });

  it('renderiza navegação acessível com itens principais', async () => {
    await seedSession(FULL_ADMIN_ROUTES);
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Sistemas')).toBeInTheDocument(),
    );
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Permissões')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Usuários')).toBeInTheDocument();
  });

  it('exibe itens em ordem hierárquica (Sistemas → Rotas → Roles → Permissões → Clientes → Usuários)', async () => {
    await seedSession(FULL_ADMIN_ROUTES);
    renderSidebar();

    await waitFor(() => expect(screen.getByText('Clientes')).toBeInTheDocument());
    const labels = screen
      .getAllByRole('link')
      .map(link => link.textContent?.trim().replace(/^\d+\s*/, ''));
    const adminItems = labels.filter(label =>
      ['Sistemas', 'Rotas', 'Roles', 'Permissões', 'Clientes', 'Usuários'].includes(
        label ?? '',
      ),
    );
    expect(adminItems).toEqual([
      'Sistemas',
      'Rotas',
      'Roles',
      'Permissões',
      'Clientes',
      'Usuários',
    ]);
  });

  it('itens de Permissões/Clientes/Usuários apontam para rotas em português', async () => {
    await seedSession(FULL_ADMIN_ROUTES);
    renderSidebar();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Permissões/i }),
      ).toHaveAttribute('href', '/permissoes'),
    );
    expect(screen.getByRole('link', { name: /Clientes/i })).toHaveAttribute(
      'href',
      '/clientes',
    );
    expect(screen.getByRole('link', { name: /Usuários/i })).toHaveAttribute(
      'href',
      '/usuarios',
    );
  });

  it('oculta item de menu cujo code de permissão o usuário não tem', async () => {
    // Apenas Sistemas + Roles — Permissões/Clientes/Usuários devem sumir.
    await seedSession(['AUTH_V1_SYSTEMS_LIST', 'AUTH_V1_ROLES_LIST']);
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByText('Sistemas')).toBeInTheDocument(),
    );
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.queryByText('Permissões')).not.toBeInTheDocument();
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument();
  });

  it('item Configurações sempre aparece (sem requiredCode)', async () => {
    await seedSession([]);
    renderSidebar();

    await waitFor(() =>
      expect(screen.getByText('Configurações')).toBeInTheDocument(),
    );
  });

  it('expõe backdrop com aria-hidden para drawer mobile', () => {
    renderSidebar();

    const backdrop = screen.getByTestId('sidebar-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });

  it('aside expõe id="sidebar-drawer" para vincular com aria-controls do hamburger', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toHaveAttribute('id', 'sidebar-drawer');
  });

  it('chama onClose ao clicar no backdrop', () => {
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar no botão de fechar', () => {
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    fireEvent.click(
      screen.getByRole('button', { name: 'Fechar menu de navegação' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar em um link de navegação (drawer mobile)', async () => {
    await seedSession(FULL_ADMIN_ROUTES);
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    await waitFor(() => expect(screen.getByText('Roles')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: /Roles/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('fecha o drawer quando a tecla Escape é pressionada (apenas com open=true)', () => {
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('não dispara onClose para Escape quando o drawer está fechado', () => {
    const onClose = vi.fn();
    renderSidebar({ open: false, onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renderiza logo escura (logo-dark.svg) quando resolvedTheme é light (default)', () => {
    renderSidebar();

    const logo = screen.getByTestId('sidebar-logo') as HTMLImageElement;
    const decoded = decodeLogoSrc(logo.src);

    expect(logo).toHaveAttribute('alt', 'LFC Admin');
    // logo-dark.svg usa fill `#16240F` (forest profundo) — visível sobre
    // fundo claro do tema light.
    expect(decoded).toContain('#16240F');
    expect(decoded).not.toContain('#AECA59');
  });

  it('renderiza logo clara (logo-white.svg) quando resolvedTheme é dark via prefers-color-scheme', () => {
    installMatchMedia(true);
    renderSidebar();

    const logo = screen.getByTestId('sidebar-logo') as HTMLImageElement;
    const decoded = decodeLogoSrc(logo.src);

    // logo-white.svg usa fill `#AECA59` (lime) e `#E2EDD0` (cream) —
    // visível sobre fundo escuro do tema dark, preservando contraste WCAG.
    expect(decoded).toContain('#AECA59');
    expect(decoded).not.toContain('#16240F');
  });

  it('renderiza logo clara quando preferência persistida é dark (sobrepõe SO light)', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderSidebar();

    const logo = screen.getByTestId('sidebar-logo') as HTMLImageElement;
    const decoded = decodeLogoSrc(logo.src);

    expect(decoded).toContain('#AECA59');
    expect(decoded).not.toContain('#16240F');
  });
});
