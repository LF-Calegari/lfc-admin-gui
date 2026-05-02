import { describe, expect, it } from 'vitest';

import type { EffectivePermissionDto } from '@/shared/api';

import {
  breakdownPermissionOrigin,
  deriveSystemOptionsFromEffective,
  groupEffectivePermissionsBySystem,
} from '@/pages/users/userEffectivePermissionsHelpers';

/**
 * Suíte unitária dos helpers puros que sustentam a Issue #72. Sem DOM
 * nem React — testes baratos focados em entrada/saída.
 *
 * Espelha o pattern de `userPermissionsHelpers.test.ts` (Issue #70) e
 * `userRolesHelpers.test.ts` (Issue #71): cada helper exposto pela
 * página é exercitado isoladamente com cenários canônicos +
 * arestas (vazio, denormalizado vazio, ordem instável de entrada).
 */

const SYS_AUTH = 'sys-auth-uuid';
const SYS_KURTTO = 'sys-kurtto-uuid';
const ROLE_ADMIN = 'role-admin-uuid';
const ROLE_VIEWER = 'role-viewer-uuid';

function makeEffective(
  overrides: Partial<EffectivePermissionDto> = {},
): EffectivePermissionDto {
  return {
    permissionId: 'perm-uuid',
    routeCode: 'AUTH_V1_USERS_LIST',
    routeName: 'Listar usuários',
    permissionTypeCode: 'Read',
    permissionTypeName: 'Leitura',
    systemId: SYS_AUTH,
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    sources: [{ kind: 'direct' }],
    ...overrides,
  };
}

describe('groupEffectivePermissionsBySystem', () => {
  it('devolve array vazio para entrada vazia', () => {
    expect(groupEffectivePermissionsBySystem([])).toEqual([]);
  });

  it('agrupa por sistema mantendo metadados', () => {
    const result = groupEffectivePermissionsBySystem([
      makeEffective({ permissionId: 'p1' }),
      makeEffective({
        permissionId: 'p2',
        systemId: SYS_KURTTO,
        systemCode: 'kurtto',
        systemName: 'Kurtto',
      }),
    ]);
    expect(result).toHaveLength(2);
    const auth = result.find((g) => g.systemCode === 'authenticator');
    const kurtto = result.find((g) => g.systemCode === 'kurtto');
    expect(auth?.permissions).toHaveLength(1);
    expect(kurtto?.permissions).toHaveLength(1);
    expect(kurtto?.systemName).toBe('Kurtto');
  });

  it('ordena grupos por systemCode', () => {
    const result = groupEffectivePermissionsBySystem([
      makeEffective({
        permissionId: 'p1',
        systemId: SYS_KURTTO,
        systemCode: 'kurtto',
        systemName: 'Kurtto',
      }),
      makeEffective({ permissionId: 'p2' }),
    ]);
    expect(result.map((g) => g.systemCode)).toEqual(['authenticator', 'kurtto']);
  });

  it('ordena permissões dentro de um grupo por routeCode então permissionTypeCode', () => {
    const result = groupEffectivePermissionsBySystem([
      makeEffective({
        permissionId: 'p1',
        routeCode: 'AUTH_V1_USERS_LIST',
        permissionTypeCode: 'Update',
      }),
      makeEffective({
        permissionId: 'p2',
        routeCode: 'AUTH_V1_USERS_LIST',
        permissionTypeCode: 'Read',
      }),
      makeEffective({
        permissionId: 'p3',
        routeCode: 'AUTH_V1_ROLES_LIST',
        permissionTypeCode: 'Read',
      }),
    ]);
    expect(result).toHaveLength(1);
    const codes = result[0].permissions.map(
      (p) => `${p.routeCode}:${p.permissionTypeCode}`,
    );
    expect(codes).toEqual([
      'AUTH_V1_ROLES_LIST:Read',
      'AUTH_V1_USERS_LIST:Read',
      'AUTH_V1_USERS_LIST:Update',
    ]);
  });

  it('coloca itens com systemCode vazio em grupo virtual "—" no final', () => {
    const result = groupEffectivePermissionsBySystem([
      makeEffective({ permissionId: 'p-orphan', systemId: '', systemCode: '', systemName: '' }),
      makeEffective({ permissionId: 'p-auth' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].systemCode).toBe('authenticator');
    expect(result[1].systemCode).toBe('—');
  });
});

describe('breakdownPermissionOrigin', () => {
  it('devolve isDirect=true para fonte única kind=direct', () => {
    const result = breakdownPermissionOrigin([{ kind: 'direct' }]);
    expect(result.isDirect).toBe(true);
    expect(result.roles).toEqual([]);
  });

  it('extrai roles ordenadas por roleCode', () => {
    const result = breakdownPermissionOrigin([
      {
        kind: 'role',
        roleId: ROLE_VIEWER,
        roleCode: 'viewer',
        roleName: 'Viewer',
      },
      {
        kind: 'role',
        roleId: ROLE_ADMIN,
        roleCode: 'admin',
        roleName: 'Administrator',
      },
    ]);
    expect(result.isDirect).toBe(false);
    expect(result.roles.map((r) => r.roleCode)).toEqual(['admin', 'viewer']);
  });

  it('combina direct + roles preservando ambos', () => {
    const result = breakdownPermissionOrigin([
      { kind: 'direct' },
      {
        kind: 'role',
        roleId: ROLE_ADMIN,
        roleCode: 'admin',
        roleName: 'Administrator',
      },
    ]);
    expect(result.isDirect).toBe(true);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].roleName).toBe('Administrator');
  });

  it('descarta silenciosamente fontes role com campos faltando', () => {
    const result = breakdownPermissionOrigin([
      { kind: 'role', roleId: null, roleCode: 'admin', roleName: 'Admin' },
      { kind: 'role', roleId: ROLE_ADMIN, roleCode: null, roleName: 'Admin' },
      { kind: 'role', roleId: ROLE_ADMIN, roleCode: 'admin', roleName: null },
      { kind: 'role', roleId: ROLE_VIEWER, roleCode: 'viewer', roleName: 'Viewer' },
    ]);
    expect(result.isDirect).toBe(false);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].roleId).toBe(ROLE_VIEWER);
  });
});

describe('deriveSystemOptionsFromEffective', () => {
  it('devolve array vazio para entrada vazia', () => {
    expect(deriveSystemOptionsFromEffective([])).toEqual([]);
  });

  it('deduplica sistemas e ordena por systemCode', () => {
    const result = deriveSystemOptionsFromEffective([
      makeEffective({
        permissionId: 'p1',
        systemId: SYS_KURTTO,
        systemCode: 'kurtto',
        systemName: 'Kurtto',
      }),
      makeEffective({ permissionId: 'p2' }),
      makeEffective({
        permissionId: 'p3',
        systemId: SYS_KURTTO,
        systemCode: 'kurtto',
        systemName: 'Kurtto',
      }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.systemCode)).toEqual(['authenticator', 'kurtto']);
  });

  it('descarta sistemas com systemId vazio (caso degenerado)', () => {
    const result = deriveSystemOptionsFromEffective([
      makeEffective({ permissionId: 'p-orphan', systemId: '', systemCode: '', systemName: '' }),
      makeEffective({ permissionId: 'p-auth' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].systemId).toBe(SYS_AUTH);
  });
});
