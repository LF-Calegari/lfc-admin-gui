import { describe, expect, it } from 'vitest';

import type { RoleDto, UserRoleLinkDto } from '@/shared/api';

import {
  buildInitialUserRoleIds,
  computeRoleAssignmentDiff,
  groupRolesBySystem,
  roleDiffHasChanges,
} from '@/pages/users/userRolesHelpers';

/**
 * Suíte dos helpers puros que sustentam a tela de atribuição via role
 * (Issue #71). Helpers vivem fora do componente para que a cobertura
 * seja barata (sem DOM, sem providers) e para que outros call sites
 * futuros reusem sem custo — lição PR #128/#134 sobre projetar shared
 * helpers desde o primeiro PR do recurso.
 */

const ID_SYS_AUTH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ID_SYS_KURTTO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ID_ROLE_ADMIN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ID_ROLE_VIEWER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ID_ROLE_KURTTO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ID_USER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

function makeRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: ID_ROLE_ADMIN,
    systemId: ID_SYS_AUTH,
    name: 'Administrator',
    code: 'admin',
    description: null,
    permissionsCount: null,
    usersCount: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeUserRoleLink(
  overrides: Partial<UserRoleLinkDto> = {},
): UserRoleLinkDto {
  return {
    id: 'link-1',
    userId: ID_USER,
    roleId: ID_ROLE_ADMIN,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

const SYSTEMS_BY_ID = new Map<string, { code: string; name: string }>([
  [ID_SYS_AUTH, { code: 'authenticator', name: 'Authenticator' }],
  [ID_SYS_KURTTO, { code: 'kurtto', name: 'Kurtto' }],
]);

describe('groupRolesBySystem', () => {
  it('devolve array vazio quando o catálogo é vazio', () => {
    expect(groupRolesBySystem([], SYSTEMS_BY_ID)).toEqual([]);
  });

  it('agrupa roles pelo systemId resolvendo code/name via lookup', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: ID_ROLE_ADMIN, systemId: ID_SYS_AUTH, code: 'admin' }),
        makeRole({
          id: ID_ROLE_KURTTO,
          systemId: ID_SYS_KURTTO,
          code: 'kurtto-admin',
        }),
      ],
      SYSTEMS_BY_ID,
    );

    expect(result).toHaveLength(2);
    const auth = result.find((g) => g.systemCode === 'authenticator');
    const kurtto = result.find((g) => g.systemCode === 'kurtto');
    expect(auth?.systemName).toBe('Authenticator');
    expect(auth?.roles).toHaveLength(1);
    expect(auth?.roles[0].id).toBe(ID_ROLE_ADMIN);
    expect(kurtto?.systemName).toBe('Kurtto');
    expect(kurtto?.roles[0].id).toBe(ID_ROLE_KURTTO);
  });

  it('ordena grupos por systemCode (alfabético)', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: ID_ROLE_KURTTO, systemId: ID_SYS_KURTTO }),
        makeRole({ id: ID_ROLE_ADMIN, systemId: ID_SYS_AUTH }),
      ],
      SYSTEMS_BY_ID,
    );
    expect(result.map((g) => g.systemCode)).toEqual(['authenticator', 'kurtto']);
  });

  it('ordena roles dentro do grupo por code', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: 'r3', systemId: ID_SYS_AUTH, code: 'charlie' }),
        makeRole({ id: 'r1', systemId: ID_SYS_AUTH, code: 'alpha' }),
        makeRole({ id: 'r2', systemId: ID_SYS_AUTH, code: 'bravo' }),
      ],
      SYSTEMS_BY_ID,
    );
    expect(result).toHaveLength(1);
    expect(result[0].roles.map((r) => r.code)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('cai no grupo órfão quando systemId é null', () => {
    const result = groupRolesBySystem(
      [
        makeRole({ id: ID_ROLE_ADMIN, systemId: null }),
        makeRole({ id: ID_ROLE_VIEWER, systemId: ID_SYS_AUTH, code: 'viewer' }),
      ],
      SYSTEMS_BY_ID,
    );
    expect(result).toHaveLength(2);
    expect(result[result.length - 1].systemCode).toBe('—');
    expect(result[result.length - 1].roles[0].id).toBe(ID_ROLE_ADMIN);
  });

  it('cai no grupo órfão quando systemId aponta para sistema não no lookup', () => {
    const result = groupRolesBySystem(
      [
        makeRole({
          id: ID_ROLE_ADMIN,
          systemId: 'sistema-removido-uuid',
          code: 'admin',
        }),
      ],
      SYSTEMS_BY_ID,
    );
    expect(result).toHaveLength(1);
    expect(result[0].systemCode).toBe('—');
  });
});

describe('buildInitialUserRoleIds', () => {
  it('devolve set vazio quando o usuário não tem roles vinculadas', () => {
    expect(buildInitialUserRoleIds([])).toEqual(new Set());
  });

  it('extrai roleId de cada vínculo no array', () => {
    const set = buildInitialUserRoleIds([
      makeUserRoleLink({ id: 'l1', roleId: ID_ROLE_ADMIN }),
      makeUserRoleLink({ id: 'l2', roleId: ID_ROLE_VIEWER }),
    ]);
    expect(Array.from(set).sort()).toEqual([ID_ROLE_ADMIN, ID_ROLE_VIEWER].sort());
  });

  it('ignora duplicatas (Set dedup automaticamente)', () => {
    const set = buildInitialUserRoleIds([
      makeUserRoleLink({ id: 'l1', roleId: ID_ROLE_ADMIN }),
      makeUserRoleLink({ id: 'l2', roleId: ID_ROLE_ADMIN }),
    ]);
    expect(set.size).toBe(1);
  });
});

describe('computeRoleAssignmentDiff', () => {
  it('retorna diff vazio quando os sets são idênticos', () => {
    const original = new Set([ID_ROLE_ADMIN]);
    const selected = new Set([ID_ROLE_ADMIN]);
    expect(computeRoleAssignmentDiff(original, selected)).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it('coloca em toAdd os ids presentes apenas em selected', () => {
    const original = new Set<string>();
    const selected = new Set([ID_ROLE_ADMIN, ID_ROLE_VIEWER]);
    const diff = computeRoleAssignmentDiff(original, selected);
    expect([...diff.toAdd].sort()).toEqual(
      [ID_ROLE_ADMIN, ID_ROLE_VIEWER].sort(),
    );
    expect(diff.toRemove).toEqual([]);
  });

  it('coloca em toRemove os ids presentes apenas em original', () => {
    const original = new Set([ID_ROLE_ADMIN, ID_ROLE_VIEWER]);
    const selected = new Set<string>();
    const diff = computeRoleAssignmentDiff(original, selected);
    expect([...diff.toRemove].sort()).toEqual(
      [ID_ROLE_ADMIN, ID_ROLE_VIEWER].sort(),
    );
    expect(diff.toAdd).toEqual([]);
  });

  it('separa adds e removes quando os sets são parcialmente disjuntos', () => {
    const original = new Set([ID_ROLE_ADMIN]);
    const selected = new Set([ID_ROLE_VIEWER]);
    const diff = computeRoleAssignmentDiff(original, selected);
    expect(diff.toAdd).toEqual([ID_ROLE_VIEWER]);
    expect(diff.toRemove).toEqual([ID_ROLE_ADMIN]);
  });
});

describe('roleDiffHasChanges', () => {
  it('false para diff sem operações', () => {
    expect(roleDiffHasChanges({ toAdd: [], toRemove: [] })).toBe(false);
  });

  it('true quando há ao menos um toAdd', () => {
    expect(roleDiffHasChanges({ toAdd: [ID_ROLE_ADMIN], toRemove: [] })).toBe(
      true,
    );
  });

  it('true quando há ao menos um toRemove', () => {
    expect(roleDiffHasChanges({ toAdd: [], toRemove: [ID_ROLE_ADMIN] })).toBe(
      true,
    );
  });
});
