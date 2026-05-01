import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { STORAGE_KEYS, tokenStorage } from '@/shared/auth/storage';

/**
 * Token usado como fixture nos testes. Mantido como constante simples
 * (`as const`) — qualquer string serve, o storage não interpreta o
 * conteúdo.
 */
const SAMPLE_TOKEN = 'jwt-abc-123';

/**
 * Limpa storage entre testes. O `setupTests` global já faz isso em
 * `afterEach`, mas mantemos limpeza explícita aqui para que cada teste
 * possa configurar pré-condições sem assumir ordem de execução.
 */
beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tokenStorage.load', () => {
  test('retorna null quando localStorage está vazio', () => {
    expect(tokenStorage.load()).toBeNull();
  });

  test('retorna o token quando a chave está presente', () => {
    tokenStorage.save(SAMPLE_TOKEN);

    expect(tokenStorage.load()).toBe(SAMPLE_TOKEN);
  });

  test('retorna null quando o valor é vazio (defensivo)', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.token, '');

    expect(tokenStorage.load()).toBeNull();
  });

  test('retorna null quando o valor é apenas whitespace', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.token, '   ');

    expect(tokenStorage.load()).toBeNull();
  });

  test('retorna null quando localStorage.getItem lança', () => {
    vi.spyOn(Object.getPrototypeOf(globalThis.localStorage), 'getItem').mockImplementation(() => {
      throw new Error('storage indisponível');
    });

    expect(tokenStorage.load()).toBeNull();
  });
});

describe('tokenStorage.save', () => {
  test('persiste token na chave namespaced', () => {
    tokenStorage.save(SAMPLE_TOKEN);

    expect(globalThis.localStorage.getItem(STORAGE_KEYS.token)).toBe(SAMPLE_TOKEN);
  });

  test('sobrescreve token existente', () => {
    tokenStorage.save(SAMPLE_TOKEN);
    const novoToken = 'jwt-rotacionado';
    tokenStorage.save(novoToken);

    expect(globalThis.localStorage.getItem(STORAGE_KEYS.token)).toBe(novoToken);
    expect(tokenStorage.load()).toBe(novoToken);
  });

  test('não propaga exceção quando setItem lança (quota / private mode)', () => {
    vi.spyOn(Object.getPrototypeOf(globalThis.localStorage), 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => tokenStorage.save(SAMPLE_TOKEN)).not.toThrow();
  });
});

describe('tokenStorage.clear', () => {
  test('remove a chave do token quando presente', () => {
    tokenStorage.save(SAMPLE_TOKEN);

    tokenStorage.clear();

    expect(globalThis.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('é idempotente quando não há token persistido', () => {
    expect(() => tokenStorage.clear()).not.toThrow();
    expect(globalThis.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('não propaga exceção quando removeItem lança', () => {
    vi.spyOn(Object.getPrototypeOf(globalThis.localStorage), 'removeItem').mockImplementation(() => {
      throw new Error('storage indisponível');
    });

    expect(() => tokenStorage.clear()).not.toThrow();
  });

  test('load retorna null após clear', () => {
    tokenStorage.save(SAMPLE_TOKEN);
    tokenStorage.clear();

    expect(tokenStorage.load()).toBeNull();
  });
});

describe('tokenStorage.clearLegacyKeys (Issue #122 — migração)', () => {
  test('remove a chave legada lfc-admin-auth-user quando presente', () => {
    globalThis.localStorage.setItem(
      STORAGE_KEYS.legacyUser,
      JSON.stringify({ user: { id: 'u-1' }, permissions: [] }),
    );

    tokenStorage.clearLegacyKeys();

    expect(globalThis.localStorage.getItem(STORAGE_KEYS.legacyUser)).toBeNull();
  });

  test('é idempotente quando a chave legada não existe', () => {
    expect(() => tokenStorage.clearLegacyKeys()).not.toThrow();
    expect(globalThis.localStorage.getItem(STORAGE_KEYS.legacyUser)).toBeNull();
  });

  test('não toca na chave do token (token sobrevive à migração)', () => {
    tokenStorage.save(SAMPLE_TOKEN);
    globalThis.localStorage.setItem(STORAGE_KEYS.legacyUser, '{}');

    tokenStorage.clearLegacyKeys();

    expect(globalThis.localStorage.getItem(STORAGE_KEYS.token)).toBe(SAMPLE_TOKEN);
    expect(globalThis.localStorage.getItem(STORAGE_KEYS.legacyUser)).toBeNull();
  });

  test('não propaga exceção quando removeItem lança', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.legacyUser, '{}');
    vi.spyOn(Object.getPrototypeOf(globalThis.localStorage), 'removeItem').mockImplementation(() => {
      throw new Error('storage indisponível');
    });

    expect(() => tokenStorage.clearLegacyKeys()).not.toThrow();
  });
});
