import { describe, expect, it } from "vitest";

import {
  buildInitialRolePermissionIds,
  computeRolePermissionDiff,
  rolePermissionDiffHasChanges,
} from "@/pages/roles/rolePermissionsHelpers";

/**
 * Suíte dos helpers puros de `rolePermissionsHelpers.ts` (Issue #69).
 *
 * Strategy: testes sem React/DOM/providers. Cobrem o diff
 * client-side e o set inicial — o agrupamento por sistema
 * (`groupPermissionsBySystem`) é re-exportado de
 * `userPermissionsHelpers` e já tem suíte dedicada
 * (`tests/pages/users/userPermissionsHelpers.test.ts`), então não
 * duplicamos a cobertura aqui.
 */

const PERM_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PERM_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PERM_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("buildInitialRolePermissionIds", () => {
  it("constrói Set vazio quando não há permissões vinculadas", () => {
    const result = buildInitialRolePermissionIds([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("constrói Set com todos os ids preservados", () => {
    const result = buildInitialRolePermissionIds([PERM_A, PERM_B, PERM_C]);
    expect(result.size).toBe(3);
    expect(result.has(PERM_A)).toBe(true);
    expect(result.has(PERM_B)).toBe(true);
    expect(result.has(PERM_C)).toBe(true);
  });

  it("deduplica ids repetidos (defesa em profundidade contra backend bugado)", () => {
    const result = buildInitialRolePermissionIds([PERM_A, PERM_A, PERM_B]);
    expect(result.size).toBe(2);
    expect(result.has(PERM_A)).toBe(true);
    expect(result.has(PERM_B)).toBe(true);
  });
});

describe("computeRolePermissionDiff", () => {
  it("devolve diff vazio quando estados são iguais", () => {
    const original = new Set([PERM_A, PERM_B]);
    const selected = new Set([PERM_A, PERM_B]);
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  it("identifica adições (selected ⊃ original)", () => {
    const original = new Set([PERM_A]);
    const selected = new Set([PERM_A, PERM_B, PERM_C]);
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([PERM_B, PERM_C]);
    expect(diff.toRemove).toEqual([]);
  });

  it("identifica remoções (original ⊃ selected)", () => {
    const original = new Set([PERM_A, PERM_B, PERM_C]);
    const selected = new Set([PERM_A]);
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([PERM_B, PERM_C]);
  });

  it("identifica adições e remoções simultâneas", () => {
    const original = new Set([PERM_A]);
    const selected = new Set([PERM_B]);
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([PERM_B]);
    expect(diff.toRemove).toEqual([PERM_A]);
  });

  it("ordena toAdd e toRemove de forma determinística (localeCompare)", () => {
    const original = new Set([PERM_C, PERM_B]);
    const selected = new Set([PERM_C, PERM_A]);
    const diff = computeRolePermissionDiff(original, selected);
    // toAdd: PERM_A foi adicionado.
    expect(diff.toAdd).toEqual([PERM_A]);
    // toRemove: PERM_B foi removido.
    expect(diff.toRemove).toEqual([PERM_B]);
  });

  it("estados vazios produzem diff vazio", () => {
    const original = new Set<string>();
    const selected = new Set<string>();
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  it("original vazio + selected populado: tudo é adição", () => {
    const original = new Set<string>();
    const selected = new Set([PERM_A, PERM_B]);
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([PERM_A, PERM_B]);
    expect(diff.toRemove).toEqual([]);
  });

  it("selected vazio + original populado: tudo é remoção", () => {
    const original = new Set([PERM_A, PERM_B]);
    const selected = new Set<string>();
    const diff = computeRolePermissionDiff(original, selected);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([PERM_A, PERM_B]);
  });
});

describe("rolePermissionDiffHasChanges", () => {
  it("retorna false quando ambos os arrays estão vazios", () => {
    expect(rolePermissionDiffHasChanges({ toAdd: [], toRemove: [] })).toBe(
      false,
    );
  });

  it("retorna true quando há adições", () => {
    expect(
      rolePermissionDiffHasChanges({ toAdd: [PERM_A], toRemove: [] }),
    ).toBe(true);
  });

  it("retorna true quando há remoções", () => {
    expect(
      rolePermissionDiffHasChanges({ toAdd: [], toRemove: [PERM_A] }),
    ).toBe(true);
  });

  it("retorna true quando há ambos", () => {
    expect(
      rolePermissionDiffHasChanges({ toAdd: [PERM_A], toRemove: [PERM_B] }),
    ).toBe(true);
  });
});
