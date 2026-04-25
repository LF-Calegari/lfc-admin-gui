import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';

function renderSidebar(open = false, onClose: () => void = vi.fn()) {
  return render(
    <MemoryRouter>
      <Sidebar open={open} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('renderiza navegação acessível com itens principais', () => {
    renderSidebar(false);

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Sistemas')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Usuários')).toBeInTheDocument();
  });

  it('expõe backdrop com aria-hidden para drawer mobile', () => {
    renderSidebar(false);

    const backdrop = screen.getByTestId('sidebar-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });

  it('chama onClose ao clicar no backdrop', () => {
    const onClose = vi.fn();
    renderSidebar(true, onClose);

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar no botão de fechar', () => {
    const onClose = vi.fn();
    renderSidebar(true, onClose);

    fireEvent.click(
      screen.getByRole('button', { name: 'Fechar menu de navegação' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar em um link de navegação (drawer mobile)', () => {
    const onClose = vi.fn();
    renderSidebar(true, onClose);

    fireEvent.click(screen.getByRole('link', { name: /Roles/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('fecha o drawer quando a tecla Escape é pressionada (apenas com open=true)', () => {
    const onClose = vi.fn();
    renderSidebar(true, onClose);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('não dispara onClose para Escape quando o drawer está fechado', () => {
    const onClose = vi.fn();
    renderSidebar(false, onClose);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
