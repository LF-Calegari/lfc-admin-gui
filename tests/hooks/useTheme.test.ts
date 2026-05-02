import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, useTheme } from '@/hooks/useTheme';

/**
 * Helper para construir um mock determinístico de `matchMedia` que
 * respeita a query consultada e expõe os listeners para podermos
 * disparar mudanças do SO em tempo de teste.
 *
 * Usamos cast via `unknown` para `MediaQueryList` porque a assinatura
 * de `addEventListener` no DOM é genérica/sobrecarregada e não bate
 * pixel-perfect com a forma simplificada que precisamos no teste.
 * É o padrão recomendado pela docs do Vitest para mocks de matchMedia.
 */
type MediaListener = (event: MediaQueryListEvent) => void;

const createMatchMedia = (initialDark: boolean) => {
  const listeners = new Set<MediaListener>();
  let darkState = initialDark;

  const matchMedia = vi.fn((query: string): MediaQueryList => {
    const list = {
      get matches() {
        return query.includes('dark') ? darkState : false;
      },
      media: query,
      onchange: null,
      addEventListener: (event: string, cb: EventListenerOrEventListenerObject) => {
        if (event === 'change' && typeof cb === 'function') {
          listeners.add(cb as MediaListener);
        }
      },
      removeEventListener: (event: string, cb: EventListenerOrEventListenerObject) => {
        if (event === 'change' && typeof cb === 'function') {
          listeners.delete(cb as MediaListener);
        }
      },
      addListener: (cb: MediaListener) => {
        listeners.add(cb);
      },
      removeListener: (cb: MediaListener) => {
        listeners.delete(cb);
      },
      dispatchEvent: vi.fn(),
    };
    return list as unknown as MediaQueryList;
  });

  const setSystemDark = (next: boolean) => {
    darkState = next;
    listeners.forEach(cb =>
      cb({ matches: next, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent),
    );
  };

  return { matchMedia, setSystemDark };
};

describe('useTheme', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('default é "system" quando localStorage está vazio', () => {
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
  });

  it('resolve "system" para "dark" quando prefers-color-scheme: dark', () => {
    const { matchMedia } = createMatchMedia(true);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolve "system" para "light" quando prefers-color-scheme: light', () => {
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('lê preferência persistida do localStorage', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme persiste e aplica no DOM imediatamente', () => {
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme("system") remove a chave do localStorage', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('system'));

    expect(result.current.theme).toBe('system');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('toggleTheme alterna binariamente light ↔ dark', () => {
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    // Default system → light
    expect(result.current.resolvedTheme).toBe('light');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('reage a mudanças do SO quando theme === "system"', () => {
    const { matchMedia, setSystemDark } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('light');

    act(() => setSystemDark(true));

    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('NÃO reage a mudanças do SO quando theme é explícito', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { matchMedia, setSystemDark } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');

    act(() => setSystemDark(true));

    // Permaneceu light — preferência explícita tem precedência sobre SO.
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignora valores inválidos no localStorage e cai para "system"', () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, 'rainbow');
    const { matchMedia } = createMatchMedia(false);
    vi.spyOn(globalThis, 'matchMedia').mockImplementation(matchMedia);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
  });
});
