import { computeIdSetDiff, idSetDiffHasChanges } from '../../shared/forms';
import { groupBySystem } from '../../shared/listing';

import type { IdSetDiff } from '../../shared/forms';
import type { SystemGroup } from '../../shared/listing';
import type { RoleDto, UserRoleLinkDto } from '../../shared/api';

/**
 * Helpers puros (sem React) que sustentam a tela de atribuição via
 * role a um usuário (Issue #71 — `/usuarios/:id/roles`). Concentrar
 * agrupamento por sistema, diff e classificação aqui mantém a
 * `UserRolesShellPage` quase só com orquestração de estado/UI —
 * testes ficam de baixo custo (sem DOM, sem providers) e a página
 * fica enxuta.
 *
 * **Por que separado de `userPermissionsHelpers`:** o conjunto de
 * helpers da Issue #70 trabalha em cima de `PermissionDto` +
 * `EffectivePermissionDto`; aqui trabalhamos em cima de `RoleDto` +
 * `UserRoleLinkDto`. Os tipos de domínio são diferentes, mas os
 * **algoritmos** (group-by-system, set diff) são idênticos — por isso
 * delegamos para os helpers genéricos em `src/shared/forms/` e
 * `src/shared/listing/`. Lição PR #134/#135 reforçou que módulos
 * paralelos com corpo similar tokenizam como duplicação no Sonar; a
 * delegação ao genérico evita esse caminho.
 */

/**
 * Identifica de forma estável uma role pelo seu `id`. Tipado como
 * alias para tornar a intenção explícita nos sets/maps.
 */
export type RoleId = string;

/**
 * Bloco visual: todas as roles pertencentes a um mesmo sistema.
 * Ordenadas por `code` para estabilidade visual entre fetches (mesmo
 * critério do backend para listagem em `RolesController.GetAll`).
 */
export interface RoleSystemGroup {
  systemId: string;
  systemCode: string;
  systemName: string;
  roles: ReadonlyArray<RoleDto>;
}

/**
 * Diff entre o estado original (roles atualmente vinculadas) e o
 * estado selecionado (após o usuário clicar nos checkboxes). Cada
 * array é mutuamente exclusivo: uma role ou é adicionada (estava
 * desmarcada e ficou marcada), ou removida (estava marcada e ficou
 * desmarcada), nunca as duas.
 *
 * Estendemos `IdSetDiff` em vez de redefinir o shape — o tipo
 * continua compatível com `idSetDiffHasChanges` e os helpers
 * genéricos.
 */
export type RoleAssignmentDiff = IdSetDiff;

/**
 * Falha pontual de sincronização: ao aplicar o diff, alguma chamada
 * pode falhar (404 do vínculo, 400 de role inativa, network).
 * Capturamos `roleId` + `kind` + `message` para o relatório de toast.
 */
export interface RoleAssignmentFailure {
  roleId: RoleId;
  kind: 'add' | 'remove';
  message: string;
}

/**
 * Compara strings com `localeCompare` em pt-BR — mesmo critério do
 * backend e dos demais helpers para estabilidade entre browsers.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Compara duas roles dentro do mesmo grupo: por `code`. Mantido fora
 * de `groupRolesBySystem` para reduzir complexidade cognitiva.
 */
function compareRolesInGroup(a: RoleDto, b: RoleDto): number {
  return compareStrings(a.code, b.code);
}

/**
 * Item enriquecido para passar ao `groupBySystem` — `RoleDto` original
 * só carrega `systemId`, mas o agrupador genérico exige
 * `systemId`/`systemCode`/`systemName`. Aqui projetamos para shape
 * compatível usando o lookup `systemsById` carregado em paralelo
 * pela página.
 */
interface GroupedRoleItem extends RoleDto {
  systemId: string;
  systemCode: string;
  systemName: string;
}

/**
 * Adapta o `SystemGroup<GroupedRoleItem>` genérico para a forma
 * esperada pela página (`roles` em vez de `items`). Devolve apenas o
 * `RoleDto` (sem o sufixo de enriquecimento).
 */
function toRoleGroup(group: SystemGroup<GroupedRoleItem>): RoleSystemGroup {
  return {
    systemId: group.systemId,
    systemCode: group.systemCode,
    systemName: group.systemName,
    roles: group.items,
  };
}

/**
 * Agrupa um catálogo de roles por sistema. Roles com `systemId`
 * `null`/ausente ou cujo `systemId` não está no lookup (ex.: sistema
 * soft-deletado) caem no grupo virtual "—".
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `systemCode` (estabilidade visual; órfãos no fim).
 * 2. Roles dentro de cada grupo por `code` (espelha
 *    `RolesController.GetAll` no backend).
 *
 * Função pura — entrada imutável, saída nova.
 */
export function groupRolesBySystem(
  roles: ReadonlyArray<RoleDto>,
  systemsById: ReadonlyMap<string, { code: string; name: string }>,
): ReadonlyArray<RoleSystemGroup> {
  if (roles.length === 0) {
    return [];
  }
  const enriched: GroupedRoleItem[] = roles.map((role) => {
    const systemId = role.systemId ?? '';
    const meta = systemId.length > 0 ? systemsById.get(systemId) : undefined;
    return {
      ...role,
      systemId,
      systemCode: meta?.code ?? '',
      systemName: meta?.name ?? '',
    };
  });

  const groups = groupBySystem(enriched, {
    compareItems: compareRolesInGroup,
  });
  return groups.map(toRoleGroup);
}

/**
 * Constrói o set inicial de roles vinculadas ao usuário a partir do
 * payload de `getUserById`. Cada `UserRoleLinkDto` em `user.roles`
 * aponta para uma role ativa.
 */
export function buildInitialUserRoleIds(
  links: ReadonlyArray<UserRoleLinkDto>,
): Set<RoleId> {
  const ids = new Set<RoleId>();
  for (const link of links) {
    ids.add(link.roleId);
  }
  return ids;
}

/**
 * Calcula o diff `original` vs `selected`. Delega ao helper
 * compartilhado `computeIdSetDiff` para preservar fonte única de
 * verdade da ordenação (lições PR #134/#135).
 */
export function computeRoleAssignmentDiff(
  originalRoles: ReadonlySet<RoleId>,
  selectedRoles: ReadonlySet<RoleId>,
): RoleAssignmentDiff {
  return computeIdSetDiff(originalRoles, selectedRoles);
}

/**
 * Devolve `true` quando o diff contém ao menos uma operação. Usado
 * pela UI para habilitar/desabilitar o botão "Salvar". Implementação
 * delega ao `idSetDiffHasChanges` genérico.
 */
export function roleDiffHasChanges(diff: RoleAssignmentDiff): boolean {
  return idSetDiffHasChanges(diff);
}
