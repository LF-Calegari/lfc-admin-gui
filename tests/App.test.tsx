import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { ApiClient } from '@/shared/api';

import { AppRoutes } from '@/routes';
import { AuthProvider } from '@/shared/auth';

/**
 * Cliente HTTP stub para os testes de árvore: o `AppLayout` agora consome
 * `useAuth()`, e o `AuthProvider` injeta callbacks no client. Como os
 * cenários daqui não exercitam autenticação, devolvemos um stub inerte —
 * sem sessão local, o `verify-token` nem chega a ser chamado.
 */
function makeInertClient(): ApiClient {
  const stub = {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
  };
  return stub as unknown as ApiClient;
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

test('renderiza Sidebar e Topbar com itens de navegação', () => {
  renderAt('/systems');

  expect(screen.getByText('Rotas')).toBeInTheDocument();
  expect(screen.getByText('Roles')).toBeInTheDocument();
  expect(screen.getByText('Permissões')).toBeInTheDocument();
  expect(screen.getByText('Usuários')).toBeInTheDocument();
  expect(screen.getByText('Admin Panel')).toBeInTheDocument();
});

test('exibe o usuário padrão na Topbar', () => {
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
  renderAt('/systems');

  const link = screen.getByRole('link', { name: /Roles/i });
  expect(link).toHaveAttribute('href', '/roles');
});
