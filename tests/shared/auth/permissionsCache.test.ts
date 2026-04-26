import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  disableIndexedDB,
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from './__helpers__/fakeIndexedDB';

import type { CachedPermissions } from '@/shared/auth/permissionsCache';

import {
  PERMISSIONS_CACHE_KEYS,
  permissionsCache,
} from '@/shared/auth/permissionsCache';


/**
 * Catálogo de exemplo usado em vários cenários — cobre todos os campos
 * obrigatórios validados pelo type guard interno do `permissionsCache`.
 *
 * `cachedAt` é injetado pelo próprio `save()`; o caller passa o subset
 * sem o timestamp.
 */
const SAMPLE: Omit<CachedPermissions, 'cachedAt'> = {
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
    identity: 42,
  },
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read', 'perm:Systems.Create'],
  routeCodes: ['AUTH_ADMIN_V1_SYSTEMS'],
};

beforeEach(() => {
  installFakeIndexedDB();
});

afterEach(() => {
  uninstallFakeIndexedDB();
});

describe('permissionsCache.load', () => {
  test('retorna null quando o store está vazio', async () => {
    expect(await permissionsCache.load()).toBeNull();
  });

  test('retorna o catálogo persistido após save', async () => {
    await permissionsCache.save(SAMPLE);

    const loaded = await permissionsCache.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.user).toEqual(SAMPLE.user);
    expect(loaded?.permissions).toEqual(SAMPLE.permissions);
    expect(loaded?.permissionCodes).toEqual(SAMPLE.permissionCodes);
    expect(loaded?.routeCodes).toEqual(SAMPLE.routeCodes);
    expect(typeof loaded?.cachedAt).toBe('number');
  });

  test('retorna null quando IndexedDB está indisponível (browser sem suporte)', async () => {
    uninstallFakeIndexedDB();
    disableIndexedDB();

    expect(await permissionsCache.load()).toBeNull();

    // Reinstala para o `afterEach` limpar normalmente.
    installFakeIndexedDB();
  });
});

describe('permissionsCache.save', () => {
  test('grava cachedAt como epoch ms próximo de Date.now()', async () => {
    const before = Date.now();
    await permissionsCache.save(SAMPLE);
    const after = Date.now();

    const loaded = await permissionsCache.load();
    expect(loaded?.cachedAt).toBeGreaterThanOrEqual(before);
    expect(loaded?.cachedAt).toBeLessThanOrEqual(after);
  });

  test('sobrescreve o catálogo anterior', async () => {
    await permissionsCache.save(SAMPLE);

    const novo: Omit<CachedPermissions, 'cachedAt'> = {
      ...SAMPLE,
      permissionCodes: ['perm:Permissions.Read'],
    };
    await permissionsCache.save(novo);

    const loaded = await permissionsCache.load();
    expect(loaded?.permissionCodes).toEqual(['perm:Permissions.Read']);
  });

  test('não propaga exceção quando IndexedDB está indisponível', async () => {
    uninstallFakeIndexedDB();
    disableIndexedDB();

    await expect(permissionsCache.save(SAMPLE)).resolves.toBeUndefined();

    installFakeIndexedDB();
  });
});

describe('permissionsCache.clear', () => {
  test('remove o catálogo após save', async () => {
    await permissionsCache.save(SAMPLE);
    expect(await permissionsCache.load()).not.toBeNull();

    await permissionsCache.clear();

    expect(await permissionsCache.load()).toBeNull();
  });

  test('é idempotente quando o store está vazio', async () => {
    await expect(permissionsCache.clear()).resolves.toBeUndefined();
    expect(await permissionsCache.load()).toBeNull();
  });

  test('não propaga exceção quando IndexedDB está indisponível', async () => {
    uninstallFakeIndexedDB();
    disableIndexedDB();

    await expect(permissionsCache.clear()).resolves.toBeUndefined();

    installFakeIndexedDB();
  });
});

describe('permissionsCache — chaves expostas (PERMISSIONS_CACHE_KEYS)', () => {
  test('expõe identificadores estáveis para teste/depuração', () => {
    expect(PERMISSIONS_CACHE_KEYS.dbName).toBe('lfc-admin-auth');
    expect(PERMISSIONS_CACHE_KEYS.dbVersion).toBe(1);
    expect(PERMISSIONS_CACHE_KEYS.storeName).toBe('permissions');
    expect(PERMISSIONS_CACHE_KEYS.recordKey).toBe('current');
  });
});
