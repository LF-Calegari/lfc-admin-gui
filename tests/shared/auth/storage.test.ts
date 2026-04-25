import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PersistedSession } from '@/shared/auth/storage';

import { sessionStorage, STORAGE_KEYS } from '@/shared/auth/storage';

/**
 * Sessão de exemplo usada como fixture em vários testes. Mantida
 * imutável (`as const`) para evitar mutação acidental entre testes —
 * cada teste que precisar variar campos deve produzir cópia.
 */
const SAMPLE_SESSION: PersistedSession = {
  token: 'jwt-abc-123',
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
    identity: 42,
  },
  permissions: ['Systems.Read', 'Systems.Create'],
};

/**
 * Limpa storage entre testes. O `setupTests` global já faz isso em
 * `afterEach`, mas mantemos limpeza explícita aqui para que cada teste
 * possa configurar pré-condições sem assumir ordem de execução.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sessionStorage.load', () => {
  test('retorna null quando localStorage está vazio', () => {
    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando apenas a chave do token está presente', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'algum-token');

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando apenas a chave do user está presente', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ user: SAMPLE_SESSION.user, permissions: [] }),
    );

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna sessão válida quando ambas as chaves estão consistentes', () => {
    sessionStorage.save(SAMPLE_SESSION);

    const loaded = sessionStorage.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.token).toBe(SAMPLE_SESSION.token);
    expect(loaded?.user).toEqual(SAMPLE_SESSION.user);
    expect(loaded?.permissions).toEqual(SAMPLE_SESSION.permissions);
  });

  test('retorna null quando o JSON do user é inválido', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'algum-token');
    window.localStorage.setItem(STORAGE_KEYS.user, '{not-json');

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando o shape do user não bate (campos faltando)', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'algum-token');
    window.localStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ user: { id: 'u-1' }, permissions: [] }),
    );

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando permissions não é array', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'algum-token');
    window.localStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ user: SAMPLE_SESSION.user, permissions: 'admin' }),
    );

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando user é null', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'algum-token');
    window.localStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ user: null, permissions: [] }),
    );

    expect(sessionStorage.load()).toBeNull();
  });

  test('retorna null quando localStorage.getItem lança', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage indisponível');
    });

    expect(sessionStorage.load()).toBeNull();
  });
});

describe('sessionStorage.save', () => {
  test('persiste token e payload do usuário em chaves namespaced', () => {
    sessionStorage.save(SAMPLE_SESSION);

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe(SAMPLE_SESSION.token);
    const userJson = window.localStorage.getItem(STORAGE_KEYS.user);
    expect(userJson).not.toBeNull();
    expect(JSON.parse(userJson as string)).toEqual({
      user: SAMPLE_SESSION.user,
      permissions: SAMPLE_SESSION.permissions,
    });
  });

  test('sobrescreve sessão existente sem deixar dados antigos', () => {
    sessionStorage.save(SAMPLE_SESSION);
    const novoToken = 'jwt-rotacionado';
    sessionStorage.save({
      ...SAMPLE_SESSION,
      token: novoToken,
      permissions: ['Systems.Delete'],
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe(novoToken);
    const loaded = sessionStorage.load();
    expect(loaded?.permissions).toEqual(['Systems.Delete']);
  });

  test('não propaga exceção quando setItem lança (quota / private mode)', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => sessionStorage.save(SAMPLE_SESSION)).not.toThrow();
  });
});

describe('sessionStorage.clear', () => {
  test('remove ambas as chaves quando há sessão', () => {
    sessionStorage.save(SAMPLE_SESSION);

    sessionStorage.clear();

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
  });

  test('é idempotente quando não há sessão persistida', () => {
    expect(() => sessionStorage.clear()).not.toThrow();
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('não propaga exceção quando removeItem lança', () => {
    vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => {
      throw new Error('storage indisponível');
    });

    expect(() => sessionStorage.clear()).not.toThrow();
  });

  test('não preserva apenas uma das duas chaves após clear', () => {
    sessionStorage.save(SAMPLE_SESSION);
    sessionStorage.clear();

    expect(sessionStorage.load()).toBeNull();
  });
});
