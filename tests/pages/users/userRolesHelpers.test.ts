import { describe, expect, it } from 'vitest';

import type { RoleDto, UserRoleSummary } from '@/shared/api';

import {
  buildInitialUserRoleIds,
  groupRolesBySystem,
} from '@/pages/users/userRolesHelpers';

/**
 * Suíte dos helpers puros que sustentam a tela de atribuição de
 * roles a um usuário (Issue #71). Espelha o pattern de
 * `userPermissionsHelpers.test.ts` (Issue #70). Helpers vivem fora
 * do componente para que a cobertura seja barata (sem DOM, sem
 * providers) — lição PR #128 sobre projetar shared helpers desde o
 * primeiro PR do recurso.
 */

const SYS_AUTH = '11111111-1111-1111-1111-111111111111';
const SYS_KURTTO = '22222222-2222-2222-2222-222222222222';

function makeRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: 'r-1',
    name: 'Root',
    code: 'root',
    systemId: SYS_AUTH,
    description: null,
    permissionsCount: null,
    usersCount: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

const SYSTEM_LOOKUP = new Map([
  [SYS_AUTH, { code: 'authenticator', name: 'Authenticator' }],
  [SYS_KURTTO, { code: 'kurtto', name: 'Kurtto' }],
]);

describe('groupRolesBySystem', () => {
  it('agrupa por systemId e ordena por systemCode (lookup)', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: 'r-k', systemId: SYS_KURTTO, code: 'k-admin' }),
        makeRole({ id: 'r-a', systemId: SYS_AUTH, code: 'a-admin' }),
      ],
      SYSTEM_LOOKUP,
    );
    expect(result).toHaveLength(2);
    expect(result[0].systemCode).toBe('authenticator');
    expect(result[1].systemCode).toBe('kurtto');
  });

  it('ordena roles por code dentro do grupo', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: 'r-3', code: 'charlie' }),
        makeRole({ id: 'r-1', code: 'alpha' }),
        makeRole({ id: 'r-2', code: 'bravo' }),
      ],
      SYSTEM_LOOKUP,
    );
    const [group] = result;
    // O grupo segue o shape de `SystemGroup<T>` (campo `items`,
    // herdado de `src/shared/listing/groupBySystem`).
    expect(group.items.map((r) => r.id)).toEqual(['r-1', 'r-2', 'r-3']);
  });

  it('move roles com systemId null para o final ("Sem sistema")', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: 'r-orphan', systemId: null }),
        makeRole({ id: 'r-auth', systemId: SYS_AUTH, code: 'admin' }),
      ],
      SYSTEM_LOOKUP,
    );
    expect(result).toHaveLength(2);
    expect(result[0].systemCode).toBe('authenticator');
    expect(result[1].systemCode).toBe('—');
    expect(result[1].systemName).toBe('Sem sistema');
  });

  it('move roles com systemId vazio (string) para o grupo órfão', () => {
    const result = groupRolesBySystem(
      [makeRole({ id: 'r-orphan', systemId: '' as unknown as string })],
      SYSTEM_LOOKUP,
    );
    expect(result).toHaveLength(1);
    expect(result[0].systemCode).toBe('—');
  });

  it('quando lookup não tem o systemId, usa o id como fallback de code/name', () => {
    const customLookup = new Map<string, { code: string; name: string }>();
    const result = groupRolesBySystem(
      [makeRole({ id: 'r-1', systemId: SYS_AUTH })],
      customLookup,
    );
    expect(result).toHaveLength(1);
    expect(result[0].systemCode).toBe(SYS_AUTH);
    expect(result[0].systemName).toBe(SYS_AUTH);
  });

  it('lista vazia devolve array vazio', () => {
    expect(groupRolesBySystem([], SYSTEM_LOOKUP)).toEqual([]);
  });

  it('lookup default (Map vazio) ainda agrupa, usando id como fallback', () => {
    const result = groupRolesBySystem([
      makeRole({ id: 'r-1', systemId: SYS_AUTH }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(SYS_AUTH);
    expect(result[0].systemCode).toBe(SYS_AUTH);
  });
});

describe('buildInitialUserRoleIds', () => {
  function makeUserRole(overrides: Partial<UserRoleSummary> = {}): UserRoleSummary {
    return {
      id: 'r-1',
      name: 'Root',
      code: 'root',
      systemId: SYS_AUTH,
      ...overrides,
    };
  }

  it('captura todos os ids do array roles do user', () => {
    const set = buildInitialUserRoleIds([
      makeUserRole({ id: 'a' }),
      makeUserRole({ id: 'b' }),
      makeUserRole({ id: 'c' }),
    ]);
    expect(set.size).toBe(3);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
  });

  it('lista vazia devolve set vazio', () => {
    expect(buildInitialUserRoleIds([]).size).toBe(0);
  });

  it('undefined (array ausente) devolve set vazio', () => {
    expect(buildInitialUserRoleIds(undefined).size).toBe(0);
  });
});
