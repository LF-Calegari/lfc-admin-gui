// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

import { afterEach, vi } from 'vitest';

/**
 * jsdom não implementa `matchMedia`. Polyfill default: nenhuma media
 * query "matches" e listeners são noop. Testes que precisam simular
 * `prefers-color-scheme: dark` substituem esta implementação via
 * `vi.spyOn(window, 'matchMedia')` no próprio teste.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // legacy — Safari < 14
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/**
 * Garante isolamento entre testes que tocam tema (`useTheme`,
 * `ThemeToggle`): limpa `localStorage` e remove `data-theme` no
 * `<html>` para não vazar estado entre suites.
 */
afterEach(() => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
    } catch {
      // ignore — modo privado/cota zerada não quebra o teste seguinte.
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-theme');
  }
});
