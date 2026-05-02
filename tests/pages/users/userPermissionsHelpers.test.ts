import { describe, expect, it } from 'vitest';

import type {
  EffectivePermissionDto,
  PermissionDto,
} from '@/shared/api';

import {
  buildInitialDirectPermissionIds,
  buildRoleMembershipsByPermission,
  computeAssignmentDiff,
  diffHasChanges,
  groupPermissionsBySystem,
} from '@/pages/users/userPermissionsHelpers';

/**
 * Suíte dos helpers puros que sustentam a tela de atribuição direta de
 * permissões (Issue #70). Helpers vivem fora do componente para que a
 * cobertura seja barata (sem DOM, sem providers) e para que outros
 * call sites futuros (PermissionsListShellPage com mesmo agrupamento
 * por sistema) reusem sem custo — lição PR #128 sobre projetar
 * shared helpers desde o primeiro PR do recurso.
 */

function makePermission(overrides: Partial<PermissionDto> = {}): PermissionDto {
  return {
    id: 'p-1',
    routeId: 'r-1',
    routeCode: 'A_ROUTE',
    routeName: 'Rota A',
    systemId: 's-1',
    systemCode: 'auth',
    systemName: 'Authenticator',
    permissionTypeId: 'pt-1',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    description: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeEffective(
  overrides: Partial<EffectivePermissionDto> = {},
): EffectivePermissionDto {
  return {
    permissionId: 'p-1',
    routeCode: 'A_ROUTE',
    routeName: 'Rota A',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    systemId: 's-1',
    systemCode: 'auth',
    systemName: 'Authenticator',
    sources: [{ kind: 'direct' }],
    ...overrides,
  };
}

describe('groupPermissionsBySystem', () => {
  it('agrupa por systemCode e ordena por systemCode', () => {
    const result = groupPermissionsBySystem([
      makePermission({ id: 'p-k', systemId: 's-k', systemCode: 'kurtto', systemName: 'Kurtto', routeCode: 'K_ROUTE' }),
      makePermission({ id: 'p-a', systemId: 's-a', systemCode: 'auth', systemName: 'Authenticator' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].systemCode).toBe('auth');
    expect(result[1].systemCode).toBe('kurtto');
  });

  it('ordena permissões por routeCode → permissionTypeCode dentro do grupo', () => {
    const result = groupPermissionsBySystem([
      makePermission({ id: 'p-2', routeCode: 'B_ROUTE', permissionTypeCode: 'Read' }),
      makePermission({ id: 'p-1', routeCode: 'A_ROUTE', permissionTypeCode: 'Update' }),
      makePermission({ id: 'p-3', routeCode: 'A_ROUTE', permissionTypeCode: 'Read' }),
    ]);
    const [group] = result;
    expect(group.permissions.map((p) => p.id)).toEqual(['p-3', 'p-1', 'p-2']);
  });

  it('move permissões com sistema vazio para o final ("Sem sistema")', () => {
    const result = groupPermissionsBySystem([
      makePermission({
        id: 'p-orphan',
        systemCode: '',
        systemName: '',
        systemId: '',
      }),
      makePermission({ id: 'p-auth', systemCode: 'auth' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].systemCode).toBe('auth');
    expect(result[1].systemCode).toBe('—');
    expect(result[1].systemName).toBe('Sem sistema');
  });

  it('lista vazia devolve array vazio', () => {
    expect(groupPermissionsBySystem([])).toEqual([]);
  });
});

describe('buildInitialDirectPermissionIds', () => {
  it('captura apenas permissões com source kind=direct', () => {
    const set = buildInitialDirectPermissionIds([
      makeEffective({ permissionId: 'p-direct', sources: [{ kind: 'direct' }] }),
      makeEffective({
        permissionId: 'p-role',
        sources: [
          {
            kind: 'role',
            roleId: 'r-1',
            roleCode: 'admin',
            roleName: 'Admin',
          },
        ],
      }),
      makeEffective({
        permissionId: 'p-both',
        sources: [
          { kind: 'direct' },
          { kind: 'role', roleId: 'r-2', roleCode: 'viewer', roleName: 'Viewer' },
        ],
      }),
    ]);
    expect(set.has('p-direct')).toBe(true);
    expect(set.has('p-role')).toBe(false);
    expect(set.has('p-both')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('lista vazia devolve set vazio', () => {
    expect(buildInitialDirectPermissionIds([]).size).toBe(0);
  });
});

describe('buildRoleMembershipsByPermission', () => {
  it('lista as roles que herdam cada permissão, ordenadas por roleCode', () => {
    const map = buildRoleMembershipsByPermission([
      makeEffective({
        permissionId: 'p-x',
        sources: [
          { kind: 'role', roleId: 'r-2', roleCode: 'viewer', roleName: 'Viewer' },
          { kind: 'role', roleId: 'r-1', roleCode: 'admin', roleName: 'Admin' },
        ],
      }),
    ]);
    const roles = map.get('p-x');
    expect(roles).toBeDefined();
    expect(roles).toHaveLength(2);
    expect(roles?.[0].roleCode).toBe('admin');
    expect(roles?.[1].roleCode).toBe('viewer');
  });

  it('ignora permissões com source apenas direct', () => {
    const map = buildRoleMembershipsByPermission([
      makeEffective({ permissionId: 'p-x', sources: [{ kind: 'direct' }] }),
    ]);
    expect(map.has('p-x')).toBe(false);
  });

  it('ignora sources de role sem roleId/roleCode/roleName', () => {
    const map = buildRoleMembershipsByPermission([
      makeEffective({
        permissionId: 'p-y',
        sources: [
          { kind: 'role', roleId: null, roleCode: null, roleName: null },
        ],
      }),
    ]);
    expect(map.has('p-y')).toBe(false);
  });
});

describe('computeAssignmentDiff', () => {
  it('toAdd lista permissões novas; toRemove lista removidas', () => {
    const original = new Set(['a', 'b']);
    const selected = new Set(['b', 'c']);
    const diff = computeAssignmentDiff(original, selected);
    expect(diff.toAdd).toEqual(['c']);
    expect(diff.toRemove).toEqual(['a']);
  });

  it('estados iguais geram diff vazio', () => {
    const original = new Set(['a', 'b']);
    const selected = new Set(['a', 'b']);
    const diff = computeAssignmentDiff(original, selected);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
    expect(diffHasChanges(diff)).toBe(false);
  });

  it('diff com mudanças retorna diffHasChanges=true', () => {
    expect(
      diffHasChanges(computeAssignmentDiff(new Set(['a']), new Set(['b']))),
    ).toBe(true);
  });

  it.each([
    {
      name: 'apenas adições',
      original: ['a'],
      selected: ['a', 'b', 'c'],
      toAdd: ['b', 'c'],
      toRemove: [],
    },
    {
      name: 'apenas remoções',
      original: ['a', 'b', 'c'],
      selected: ['a'],
      toAdd: [],
      toRemove: ['b', 'c'],
    },
    {
      name: 'add e remove simultâneos',
      original: ['a', 'b'],
      selected: ['c', 'd'],
      toAdd: ['c', 'd'],
      toRemove: ['a', 'b'],
    },
  ])('cenário "$name"', ({ original, selected, toAdd, toRemove }) => {
    const diff = computeAssignmentDiff(new Set(original), new Set(selected));
    expect(diff.toAdd).toEqual(toAdd);
    expect(diff.toRemove).toEqual(toRemove);
  });
});
