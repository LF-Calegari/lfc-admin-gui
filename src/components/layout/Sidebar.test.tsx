import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from '../../hooks/useTheme';

import { Sidebar } from './Sidebar';

/**
 * Reinstala um polyfill estável de `matchMedia` para cada teste — o Sidebar
 * agora consome `useTheme()`, que chama `window.matchMedia` em runtime.
 * O default casa para `false`; quando o teste precisa simular preferência
 * dark do SO, basta passar `dark = true`.
 */
const installMatchMedia = (dark = false) => {
  Object.defineProperty(window, 'matchMedia', {
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
  const dataUrlMatch = src.match(/^data:image\/svg\+xml;base64,(.+)$/);
  if (dataUrlMatch) return atob(dataUrlMatch[1]);
  return src;
};

function renderSidebar(open = false, onClose: () => void = vi.fn()) {
  return render(
    <MemoryRouter>
      <Sidebar open={open} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    installMatchMedia(false);
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

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

  it('aside expõe id="sidebar-drawer" para vincular com aria-controls do hamburger', () => {
    renderSidebar(false);

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toHaveAttribute('id', 'sidebar-drawer');
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

  it('renderiza logo escura (logo-dark.svg) quando resolvedTheme é light (default)', () => {
    renderSidebar(false);

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
    renderSidebar(false);

    const logo = screen.getByTestId('sidebar-logo') as HTMLImageElement;
    const decoded = decodeLogoSrc(logo.src);

    // logo-white.svg usa fill `#AECA59` (lime) e `#E2EDD0` (cream) —
    // visível sobre fundo escuro do tema dark, preservando contraste WCAG.
    expect(decoded).toContain('#AECA59');
    expect(decoded).not.toContain('#16240F');
  });

  it('renderiza logo clara quando preferência persistida é dark (sobrepõe SO light)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderSidebar(false);

    const logo = screen.getByTestId('sidebar-logo') as HTMLImageElement;
    const decoded = decodeLogoSrc(logo.src);

    expect(decoded).toContain('#AECA59');
    expect(decoded).not.toContain('#16240F');
  });
});
