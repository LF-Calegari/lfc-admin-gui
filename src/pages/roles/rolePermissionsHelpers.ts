/**
 * Helpers puros (sem React) que sustentam a tela de associação de
 * permissões a uma role (Issue #69, EPIC #47). Concentrar diff e
 * classificação aqui mantém a `RolePermissionsShellPage` quase só
 * com orquestração de estado/UI — testes ficam de baixo custo (sem
 * DOM, sem providers) e a página fica enxuta.
 *
 * **Reuso (lição PR #128/#134):** o agrupamento por sistema
 * (`groupPermissionsBySystem`) é compartilhado com a Issue #70
 * (`UserPermissionsShellPage`) — mantemos uma única fonte de verdade
 * em `userPermissionsHelpers.ts` em vez de duplicar a lógica aqui.
 * Política proativa cobrada pelo histórico de Sonar New Code
 * Duplication: ao invés de "vamos extrair quando duplicar", reusamos
 * desde o primeiro consumer adicional.
 */

import {
  groupPermissionsBySystem,
  type PermissionSystemGroup,
} from "../users/userPermissionsHelpers";

/**
 * Re-exports dos tipos compartilhados — evita que `RolePermissionsShellPage`
 * tenha que importar diretamente de `pages/users/userPermissionsHelpers`,
 * o que aumentaria o acoplamento cross-feature visível. A abstração de
 * "permissões agrupadas por sistema" é genérica (catálogo do
 * `lfc-authenticator`), mas a fonte do cálculo está em users por motivos
 * históricos (chegou primeiro). Esses re-exports são o ponto de
 * extensão quando/se for hora de promover o agrupamento para
 * `src/shared/permissions/`.
 */
export type { PermissionSystemGroup };
export { groupPermissionsBySystem };

/**
 * Diff entre o estado original (permissões atualmente vinculadas à
 * role) e o estado selecionado (após o usuário clicar nos checkboxes).
 * Cada array é mutuamente exclusivo: uma permissão ou é adicionada
 * (estava desmarcada e ficou marcada), ou removida (estava marcada e
 * ficou desmarcada), nunca as duas. O salvar dispara um
 * `assignPermissionToRole` por id em `toAdd` e um
 * `removePermissionFromRole` por id em `toRemove`.
 *
 * Tipo separado de `PermissionAssignmentDiff` (em
 * `userPermissionsHelpers`) por dois motivos: (i) mantém a semântica
 * explícita ("role-bound" vs "user-direct") nos call sites, e (ii)
 * evita acoplamento entre módulos quando algum dia o backend
 * divergir o contrato (ex.: vínculos role-permission ganham
 * `expiresAt` que vínculos user-permission não têm).
 */
export interface RolePermissionAssignmentDiff {
  toAdd: ReadonlyArray<string>;
  toRemove: ReadonlyArray<string>;
}

/**
 * Falha pontual de sincronização: ao aplicar o diff, alguma chamada
 * pode falhar (404 do vínculo, 400 de permissão inativa, network).
 * Capturamos `permissionId` + `kind` + `message` para que a UI
 * informe ao usuário quais permissões NÃO foram persistidas e ele
 * possa retentar — preferimos falhar parcial em vez de aborto total
 * porque a operação é idempotente (refetch normaliza). Mesma forma
 * de `PermissionAssignmentFailure` em `userPermissionsHelpers`.
 */
export interface RolePermissionAssignmentFailure {
  permissionId: string;
  kind: "add" | "remove";
  message: string;
}

/**
 * Compara strings com `localeCompare` em pt-BR para estabilidade
 * entre browsers (Safari/Firefox/Chromium). Usado para tornar o
 * diff determinístico — testes que comparam arrays se beneficiam.
 * Mesma estratégia de `userPermissionsHelpers.ts` (mantida local
 * para evitar export cross-arquivo de função privada).
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

/**
 * Constrói o set inicial de permissões vinculadas à role a partir
 * do response de `listRolePermissions`. Diferente do user (que
 * filtra por `kind === 'direct'`), aqui o backend já devolve
 * **apenas** os ids das permissões vinculadas — não há "herança",
 * a role ou tem ou não tem.
 *
 * Set imutável (do ponto de vista do caller). Valor retornado é um
 * `Set<string>` real para que `has(id)` em renders seja O(1).
 */
export function buildInitialRolePermissionIds(
  permissionIds: ReadonlyArray<string>,
): Set<string> {
  return new Set<string>(permissionIds);
}

/**
 * Calcula o diff entre o estado salvo (`originalAssigned`) e o estado
 * pendente de salvar (`selectedAssigned`). Apenas permissões que
 * mudaram de estado entram no diff — permissões cujo checkbox
 * permaneceu igual são omitidas para minimizar requisições.
 *
 * Algoritmo:
 *
 * - `toAdd` = `selectedAssigned \ originalAssigned` (estavam
 *   desmarcadas, foram marcadas).
 * - `toRemove` = `originalAssigned \ selectedAssigned` (estavam
 *   marcadas, foram desmarcadas).
 *
 * Resultados ordenados pela ordem natural dos ids (`localeCompare`)
 * para tornar o teste determinístico — a UI não depende da ordem,
 * mas testes que comparam arrays se beneficiam. Espelha
 * `computeAssignmentDiff` de `userPermissionsHelpers`, mas mantemos
 * função separada por causa do tipo de retorno semanticamente
 * distinto (ver `RolePermissionAssignmentDiff`).
 */
export function computeRolePermissionDiff(
  originalAssigned: ReadonlySet<string>,
  selectedAssigned: ReadonlySet<string>,
): RolePermissionAssignmentDiff {
  const toAdd: string[] = [];
  const toRemove: string[] = [];

  for (const id of selectedAssigned) {
    if (!originalAssigned.has(id)) {
      toAdd.push(id);
    }
  }
  for (const id of originalAssigned) {
    if (!selectedAssigned.has(id)) {
      toRemove.push(id);
    }
  }

  toAdd.sort((a, b) => compareStrings(a, b));
  toRemove.sort((a, b) => compareStrings(a, b));

  return { toAdd, toRemove };
}

/**
 * Devolve `true` quando o diff contém ao menos uma operação. Usado
 * pela UI para habilitar/desabilitar o botão "Salvar".
 */
export function rolePermissionDiffHasChanges(
  diff: RolePermissionAssignmentDiff,
): boolean {
  return diff.toAdd.length > 0 || diff.toRemove.length > 0;
}
