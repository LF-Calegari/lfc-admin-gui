import { describe, expect, it } from 'vitest';

import type { SystemGroupItem } from '@/shared/listing';

import { groupBySystem } from '@/shared/listing';

/**
 * Suíte do helper genérico `groupBySystem` em
 * `src/shared/listing/groupBySystem.ts`. Helper centraliza o
 * agrupamento por sistema usado por:
 *
 * - `userPermissionsHelpers.groupPermissionsBySystem` (Issue #70).
 * - `userRolesHelpers.groupRolesBySystem` (Issue #71).
 * - Listagens futuras que precisem do mesmo padrão.
 *
 * Cobertura aqui é "fonte única" — wrappers nos módulos do recurso só
 * precisam validar o adapter de tipo (renomear `items` → `permissions`/
 * `roles`), sem reexercer todos os cenários de agrupamento.
 */

interface MockItem extends SystemGroupItem {
  id: string;
  name: string;
}

function makeItem(overrides: Partial<MockItem> = {}): MockItem {
  return {
    id: 'i1',
    systemId: 'sys-auth',
    systemCode: 'authenticator',
    systemName: 'Authenticator',
    name: 'item-1',
    ...overrides,
  };
}

const compareById = (a: MockItem, b: MockItem): number =>
  a.id.localeCompare(b.id);

describe('groupBySystem', () => {
  it('devolve array vazio quando o input é vazio', () => {
    expect(groupBySystem([], { compareItems: compareById })).toEqual([]);
  });

  it('agrupa um único item em um único grupo', () => {
    const result = groupBySystem(
      [makeItem({ id: 'a' })],
      { compareItems: compareById },
    );
    expect(result).toHaveLength(1);
    expect(result[0].systemCode).toBe('authenticator');
    expect(result[0].items).toHaveLength(1);
  });

  it('agrupa itens distintos pelo systemCode', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemId: 'sys-auth',
          systemCode: 'authenticator',
        }),
        makeItem({
          id: 'b',
          systemId: 'sys-kurtto',
          systemCode: 'kurtto',
          systemName: 'Kurtto',
        }),
      ],
      { compareItems: compareById },
    );
    expect(result).toHaveLength(2);
    const auth = result.find((g) => g.systemCode === 'authenticator');
    const kurtto = result.find((g) => g.systemCode === 'kurtto');
    expect(auth?.items).toHaveLength(1);
    expect(kurtto?.items).toHaveLength(1);
  });

  it('ordena grupos alfabeticamente por systemCode', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemCode: 'kurtto',
          systemName: 'Kurtto',
        }),
        makeItem({
          id: 'b',
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
      ],
      { compareItems: compareById },
    );
    expect(result.map((g) => g.systemCode)).toEqual([
      'authenticator',
      'kurtto',
    ]);
  });

  it('ordena itens dentro do grupo via compareItems', () => {
    const result = groupBySystem(
      [
        makeItem({ id: 'c' }),
        makeItem({ id: 'a' }),
        makeItem({ id: 'b' }),
      ],
      { compareItems: compareById },
    );
    expect(result[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('coloca itens com systemCode vazio no grupo "—" (órfão)', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemCode: '',
          systemName: '',
        }),
      ],
      { compareItems: compareById },
    );
    expect(result).toHaveLength(1);
    expect(result[0].systemCode).toBe('—');
    expect(result[0].systemName).toBe('Sem sistema');
  });

  it('respeita orphanFallbackName customizado', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemCode: '',
          systemName: '',
        }),
      ],
      {
        compareItems: compareById,
        orphanFallbackName: 'Sistema desconhecido',
      },
    );
    expect(result[0].systemName).toBe('Sistema desconhecido');
  });

  it('empurra grupo órfão para o final mesmo com sistemas alfabeticamente posteriores', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemCode: '',
          systemName: '',
        }),
        makeItem({
          id: 'b',
          systemCode: 'zulu',
          systemName: 'Zulu',
        }),
      ],
      { compareItems: compareById },
    );
    // Zulu antes de — porque órfão sempre vai pro fim.
    expect(result.map((g) => g.systemCode)).toEqual(['zulu', '—']);
  });

  it('preserva systemName quando definido (não usa fallback)', () => {
    const result = groupBySystem(
      [
        makeItem({
          id: 'a',
          systemCode: 'xyz',
          systemName: 'Sistema XYZ',
        }),
      ],
      { compareItems: compareById },
    );
    expect(result[0].systemName).toBe('Sistema XYZ');
  });

  it('reune múltiplos itens do mesmo sistema', () => {
    const result = groupBySystem(
      [
        makeItem({ id: 'a', systemCode: 'auth' }),
        makeItem({ id: 'b', systemCode: 'auth' }),
        makeItem({ id: 'c', systemCode: 'auth' }),
      ],
      { compareItems: compareById },
    );
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(3);
  });
});
