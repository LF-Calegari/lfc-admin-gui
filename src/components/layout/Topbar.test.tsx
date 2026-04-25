import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renderiza título e usuário recebidos via props', () => {
    render(<Topbar title="Sistemas" user={{ name: 'admin@lfc.com.br', role: 'root', permCount: 12 }} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Sistemas' })).toBeInTheDocument();
    expect(screen.getByText('admin@lfc.com.br')).toBeInTheDocument();
  });

  it('chama onMenuClick ao clicar no hamburger', () => {
    const onMenuClick = vi.fn();
    render(
      <Topbar
        title="Sistemas"
        user={{ name: 'admin@lfc.com.br', role: 'root', permCount: 12 }}
        onMenuClick={onMenuClick}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir menu de navegação' }),
    );
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('hamburger declara aria-label acessível em mobile', () => {
    render(<Topbar title="Sistemas" />);

    const button = screen.getByTestId('topbar-menu-button');
    expect(button).toHaveAttribute('aria-label', 'Abrir menu de navegação');
  });

  it('busca colapsada expande ao clicar no toggle de busca', () => {
    render(<Topbar title="Sistemas" />);

    const toggle = screen.getByRole('button', { name: 'Abrir busca' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('busca expandida pode ser fechada via botão close', () => {
    render(<Topbar title="Sistemas" />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir busca' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar busca' }));

    const toggle = screen.getByRole('button', { name: 'Abrir busca' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('chama onLogout ao clicar no botão Sair', () => {
    const onLogout = vi.fn();
    render(
      <Topbar
        title="Sistemas"
        user={{ name: 'admin@lfc.com.br', role: 'root', permCount: 12 }}
        onLogout={onLogout}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
