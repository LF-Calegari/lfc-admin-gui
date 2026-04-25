import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from './routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
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

test('rota inexistente exibe placeholder 404', () => {
  renderAt('/rota-que-nao-existe');

  expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
  expect(
    screen.getByText(/Erro 404 — placeholder, será substituído em #7\./),
  ).toBeInTheDocument();
});

test('rota /error/:code exibe placeholder com o código informado', () => {
  renderAt('/error/401');

  expect(screen.getByText('Não autenticado')).toBeInTheDocument();
  expect(
    screen.getByText(/Erro 401 — placeholder, será substituído em #7\./),
  ).toBeInTheDocument();
});

test('itens da Sidebar apontam para rotas reais', () => {
  renderAt('/systems');

  const link = screen.getByRole('link', { name: /Roles/i });
  expect(link).toHaveAttribute('href', '/roles');
});
