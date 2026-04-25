import { useCallback, useEffect, useState } from 'react';

/**
 * Tema escolhido pelo usuário.
 *
 * - `light` / `dark` — escolhas explícitas (persistidas no `localStorage`).
 * - `system` — segue `prefers-color-scheme` do navegador. É o default
 *   quando não há valor persistido. Quando o usuário troca a preferência
 *   do sistema o `resolvedTheme` reage em tempo real (via matchMedia).
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Tema efetivamente aplicado no DOM (resolução de `system`). */
export type ResolvedTheme = 'light' | 'dark';

/** Chave do `localStorage` — fonte de verdade de persistência. */
export const THEME_STORAGE_KEY = 'lfc-admin-theme';

/** Atributo aplicado em `<html>` para alternar tokens semânticos. */
const THEME_ATTRIBUTE = 'data-theme';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/**
 * Lê preferência persistida. SSR-safe: retorna `system` quando `window`
 * não está disponível ou quando `localStorage` lança (ex.: modo privado
 * com cota zerada).
 */
const readStoredPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
};

/**
 * Detecta o tema preferido do sistema operacional. Caso `matchMedia`
 * não esteja disponível (jsdom sem polyfill, navegadores legados), cai
 * para `light` como padrão conservador.
 */
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (preference: ThemePreference): ResolvedTheme =>
  preference === 'system' ? getSystemTheme() : preference;

/**
 * Aplica `data-theme` no `<html>`. Centralizado para garantir que todas
 * as transições passem pelo mesmo ponto de DOM.
 */
const applyDocumentTheme = (resolved: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
};

interface UseThemeResult {
  /** Preferência escolhida pelo usuário (`light` | `dark` | `system`). */
  theme: ThemePreference;
  /** Tema efetivamente aplicado (resolução de `system`). */
  resolvedTheme: ResolvedTheme;
  /**
   * Persiste nova preferência. `system` remove a chave do `localStorage`
   * para que outros consumidores (script anti-FOUC) percebam ausência
   * de escolha persistida.
   */
  setTheme: (preference: ThemePreference) => void;
  /** Alterna binariamente entre `light` ↔ `dark`. Ignora `system`. */
  toggleTheme: () => void;
}

/**
 * Hook unificado para tema.
 *
 * Persistência em `localStorage` (`lfc-admin-theme`) e detecção do
 * sistema via `matchMedia('(prefers-color-scheme: dark)')`. Quando
 * `theme === 'system'`, o `resolvedTheme` reage em tempo real às
 * mudanças do SO (não exige reload).
 *
 * O atributo `data-theme` no `<html>` é aplicado tanto na primeira
 * renderização quanto a cada mudança — em conjunto com o script
 * anti-FOUC do `index.html`, garante que a paleta correta esteja
 * presente desde o primeiro frame.
 */
export const useTheme = (): UseThemeResult => {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference()),
  );

  /**
   * Recalcula `resolvedTheme` e aplica no DOM sempre que a preferência
   * muda. Trata também o caso de `system` quando o SO troca em runtime.
   */
  useEffect(() => {
    const next = resolveTheme(theme);
    setResolvedTheme(next);
    applyDocumentTheme(next);
  }, [theme]);

  /**
   * Quando a preferência é `system`, espelha mudanças do SO em runtime
   * (usuário troca dark/light no SO sem recarregar a página). Listener
   * só ativa nesse modo para evitar trabalho desnecessário.
   */
  useEffect(() => {
    if (theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      const next: ResolvedTheme = event.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyDocumentTheme(next);
    };

    // Compat: Safari < 14 expõe addListener/removeListener no lugar
    // dos eventos modernos. Tipamos com union pra cobrir os dois.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [theme]);

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference);
    if (typeof window === 'undefined') return;
    try {
      if (preference === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // Persistência é best-effort — modo privado/cota zerada não
      // deve quebrar a UX. O estado em memória continua válido.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      // Se estiver em `system`, decide com base no resolvido atual e
      // promove para escolha explícita oposta.
      const current: ResolvedTheme = prev === 'system' ? resolveTheme(prev) : prev;
      const next: ThemePreference = current === 'dark' ? 'light' : 'dark';
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(THEME_STORAGE_KEY, next);
        }
      } catch {
        // ver comentário em `setTheme`.
      }
      return next;
    });
  }, []);

  return { theme, resolvedTheme, setTheme, toggleTheme };
};
