import { render, screen } from '@testing-library/react';

import App from './App';

test('renderiza o layout principal com Sidebar e Topbar', () => {
  render(<App />);

  // Sidebar deve exibir os itens de navegação — verificar items únicos
  expect(screen.getByText('Rotas')).toBeInTheDocument();
  expect(screen.getByText('Roles')).toBeInTheDocument();
  expect(screen.getByText('Permissões')).toBeInTheDocument();
  expect(screen.getByText('Usuários')).toBeInTheDocument();
  expect(screen.getByText('Admin Panel')).toBeInTheDocument();
});

test('exibe o usuário padrão na Topbar', () => {
  render(<App />);

  expect(screen.getByText('admin@lfc.com.br')).toBeInTheDocument();
});
