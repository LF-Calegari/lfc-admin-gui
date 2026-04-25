import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';

const installMatchMedia = (initialDark: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('dark') ? initialDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza com aria-label e aria-pressed coerentes ao tema atual', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: 'Ativar tema escuro' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('alterna o tema ao clicar e atualiza aria-label', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(button);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-label', 'Ativar tema claro');
  });

  it('persiste a escolha em localStorage com a chave correta', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);

    fireEvent.click(screen.getByTestId('theme-toggle'));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('respeita preferência de sistema (dark) no primeiro render', () => {
    installMatchMedia(true);
    render(<ThemeToggle />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('respeita preferência persistida sobre o sistema', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    installMatchMedia(true);
    render(<ThemeToggle />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('é acessível via teclado (botão com type=button e role)', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });
});
