import { describe, expect, it } from 'vitest';

import {
  computeIdSetDiff,
  idSetDiffHasChanges,
} from '@/shared/forms';

/**
 * Suíte do helper genérico `computeIdSetDiff` em
 * `src/shared/forms/computeIdSetDiff.ts`. Helper centraliza o cálculo
 * de diff usado por:
 *
 * - `userPermissionsHelpers.computeAssignmentDiff` (Issue #70).
 * - `userRolesHelpers.computeRoleAssignmentDiff` (Issue #71).
 * - Qualquer recurso futuro com checkboxes "salvar diff" similar.
 *
 * Cobertura aqui é "fonte única" — wrappers nos módulos do recurso só
 * precisam validar que repassam corretamente para o helper, sem
 * reexercer todos os cenários de diff.
 */

describe('computeIdSetDiff', () => {
  it('retorna diff vazio quando ambos os sets são vazios', () => {
    expect(computeIdSetDiff(new Set(), new Set())).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it('retorna diff vazio quando os sets são idênticos', () => {
    expect(computeIdSetDiff(new Set(['a', 'b']), new Set(['a', 'b']))).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it('coloca em toAdd ids presentes só em selected', () => {
    const diff = computeIdSetDiff(new Set(), new Set(['a', 'b']));
    expect([...diff.toAdd].sort()).toEqual(['a', 'b']);
    expect(diff.toRemove).toEqual([]);
  });

  it('coloca em toRemove ids presentes só em original', () => {
    const diff = computeIdSetDiff(new Set(['x', 'y']), new Set());
    expect(diff.toAdd).toEqual([]);
    expect([...diff.toRemove].sort()).toEqual(['x', 'y']);
  });

  it('separa adds e removes em sets parcialmente disjuntos', () => {
    const diff = computeIdSetDiff(
      new Set(['a', 'b']),
      new Set(['b', 'c']),
    );
    expect(diff.toAdd).toEqual(['c']);
    expect(diff.toRemove).toEqual(['a']);
  });

  it('ordena toAdd e toRemove deterministicamente (localeCompare)', () => {
    const diff = computeIdSetDiff(
      new Set(),
      new Set(['z', 'a', 'm', 'b']),
    );
    // Ordem natural: a, b, m, z
    expect(diff.toAdd).toEqual(['a', 'b', 'm', 'z']);
  });

  it('aceita ReadonlySet (não mutante)', () => {
    const original: ReadonlySet<string> = new Set(['x']);
    const selected: ReadonlySet<string> = new Set(['y']);
    const diff = computeIdSetDiff(original, selected);
    expect(diff.toAdd).toEqual(['y']);
    expect(diff.toRemove).toEqual(['x']);
    // Sets originais permanecem intactos.
    expect(original.has('x')).toBe(true);
    expect(selected.has('y')).toBe(true);
  });
});

describe('idSetDiffHasChanges', () => {
  it('false quando ambos toAdd e toRemove estão vazios', () => {
    expect(idSetDiffHasChanges({ toAdd: [], toRemove: [] })).toBe(false);
  });

  it('true quando há toAdd', () => {
    expect(idSetDiffHasChanges({ toAdd: ['a'], toRemove: [] })).toBe(true);
  });

  it('true quando há toRemove', () => {
    expect(idSetDiffHasChanges({ toAdd: [], toRemove: ['a'] })).toBe(true);
  });

  it('true quando há ambos', () => {
    expect(idSetDiffHasChanges({ toAdd: ['a'], toRemove: ['b'] })).toBe(true);
  });
});
