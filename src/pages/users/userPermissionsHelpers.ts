import { computeIdSetDiff, idSetDiffHasChanges } from '../../shared/forms';
import { groupBySystem } from '../../shared/listing';

import type {
  EffectivePermissionDto,
  EffectivePermissionSource,
  PermissionDto,
} from '../../shared/api';
import type { IdSetDiff } from '../../shared/forms';
import type { SystemGroup } from '../../shared/listing';

/**
 * Helpers puros (sem React) que sustentam a tela de atribuição direta
 * de permissões a um usuário (Issue #70). Concentrar agrupamento, diff
 * e classificação aqui mantém a `UserPermissionsShellPage` quase só com
 * orquestração de estado/UI — testes ficam de baixo custo (sem DOM,
 * sem providers) e a página fica enxuta.
 *
 * **Por que delegamos para `src/shared/{forms,listing}/`:** Issue #71
 * (atribuição via role) precisa do mesmo cálculo de diff e do mesmo
 * agrupamento por sistema. Manter cópias paralelas neste módulo (e em
 * `userRolesHelpers.ts`) tokeniza como bloco duplicado no Sonar
 * (lição PR #134/#135 — quando o **corpo** é idêntico entre recursos,
 * extrair em helper genérico). Os wrappers preservam os tipos
 * específicos do recurso (`string`, `PermissionAssignmentDiff`)
 * para que call-sites continuem expressivos.
 */

/**
 * Bloco visual: todas as permissões pertencentes a um mesmo sistema.
 * Ordenadas por `routeCode` + `permissionTypeCode` para estabilidade
 * visual entre fetches (mesmo critério do backend para listagens).
 *
 * Tipo é um alias do `SystemGroup<PermissionDto>` genérico — preserva
 * o nome semântico para os call-sites e mantém a coleção como
 * `permissions` (não `items`) para legibilidade da página.
 */
export interface PermissionSystemGroup {
  systemId: string;
  systemCode: string;
  systemName: string;
  permissions: ReadonlyArray<PermissionDto>;
}

/**
 * Diff entre o estado original (permissões diretas atualmente
 * atribuídas) e o estado selecionado (após o usuário clicar nos
 * checkboxes). Cada array é mutuamente exclusivo: uma permissão ou
 * é adicionada (estava desmarcada e ficou marcada), ou removida
 * (estava marcada e ficou desmarcada), nunca as duas. O salvar dispara
 * um `assignPermissionToUser` por id em `toAdd` e um
 * `removePermissionFromUser` por id em `toRemove`.
 *
 * Estendemos `IdSetDiff` em vez de redefinir o shape — o tipo continua
 * compatível com `idSetDiffHasChanges` e os helpers genéricos.
 */
export type PermissionAssignmentDiff = IdSetDiff;

/**
 * Falha pontual de sincronização: ao aplicar o diff, alguma chamada
 * pode falhar (404 do vínculo, 400 de permissão inativa, network).
 * Capturamos `permissionId` + `kind` + `message` para que a UI
 * informe ao usuário quais permissões NÃO foram persistidas e ele
 * possa retentar — preferimos falhar parcial em vez de aborto total
 * porque a operação é idempotente (refetch normaliza).
 */
export interface PermissionAssignmentFailure {
  permissionId: string;
  kind: 'add' | 'remove';
  message: string;
}

/**
 * Compara strings com `localeCompare` em pt-BR e ordem natural — o
 * mesmo critério do backend (`StringComparer.Ordinal`) somado ao
 * fallback de `localeCompare` para estabilidade entre browsers
 * (Safari/Firefox/Chromium). Evita "FOO" antes de "foo" inconsistente.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Compara duas permissões dentro do mesmo grupo: primeiro por
 * `routeCode`, depois por `permissionTypeCode` em desempate. Reusado
 * dentro do `Array.sort` do agrupamento. Mantido fora de
 * `groupPermissionsBySystem` para não inflar a complexidade cognitiva
 * (lição PR #134/#135 — Sonar conta branches aninhados; isolar
 * comparadores reduz o "cognitivo" sem prejudicar leitura).
 */
function comparePermissionsInGroup(a: PermissionDto, b: PermissionDto): number {
  const byRoute = compareStrings(a.routeCode, b.routeCode);
  if (byRoute !== 0) return byRoute;
  return compareStrings(a.permissionTypeCode, b.permissionTypeCode);
}

/**
 * Adapta o `SystemGroup<PermissionDto>` genérico para a forma esperada
 * pela página (`permissions` em vez de `items`). Mantemos o adapter
 * simples — só renomeia o campo da coleção.
 */
function toPermissionGroup(group: SystemGroup<PermissionDto>): PermissionSystemGroup {
  return {
    systemId: group.systemId,
    systemCode: group.systemCode,
    systemName: group.systemName,
    permissions: group.items,
  };
}

/**
 * Agrupa um catálogo de permissões por sistema. Sistemas sem `systemId`
 * (denormalizado vazio quando o LEFT JOIN do backend não encontrou o
 * sistema da rota — soft-delete em cascata) ficam num grupo virtual
 * com `systemCode` "—" para que a UI ainda mostre o item em vez de
 * descartá-lo silenciosamente. Esse caso é raro mas previsto pelo
 * contrato `PermissionResponse` do backend (`string.Empty`).
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `systemCode` (estabilidade visual).
 * 2. Permissões dentro de cada grupo por `routeCode` então
 *    `permissionTypeCode` (mesmo critério do backend para listagens).
 *
 * Função pura — entrada imutável, saída nova. A complexidade cognitiva
 * fica abaixo do limite Sonar via delegação ao `groupBySystem` genérico
 * (`src/shared/listing/groupBySystem.ts`).
 */
export function groupPermissionsBySystem(
  permissions: ReadonlyArray<PermissionDto>,
): ReadonlyArray<PermissionSystemGroup> {
  const groups = groupBySystem(permissions, {
    compareItems: comparePermissionsInGroup,
  });
  return groups.map(toPermissionGroup);
}

/**
 * Verifica se uma permissão tem origem direta no array `sources` do
 * `EffectivePermissionDto`. Backend devolve `kind === 'direct'` quando
 * o vínculo `UserPermission` é o caminho efetivo.
 */
function hasDirectSource(sources: ReadonlyArray<EffectivePermissionSource>): boolean {
  return sources.some((source) => source.kind === 'direct');
}

/**
 * Constrói o set inicial de permissões diretas atualmente atribuídas
 * ao usuário a partir do response de `listEffectiveUserPermissions`.
 * Filtramos por `kind === 'direct'` porque a tela só edita o vínculo
 * direto — heranças via role são exibidas como informação visual mas
 * não fazem parte do diff.
 *
 * Set imutável (do ponto de vista do caller). Valor retornado é um
 * `Set<string>` real para que `has(id)` em renders seja O(1).
 */
export function buildInitialDirectPermissionIds(
  effective: ReadonlyArray<EffectivePermissionDto>,
): Set<string> {
  const ids = new Set<string>();
  for (const item of effective) {
    if (hasDirectSource(item.sources)) {
      ids.add(item.permissionId);
    }
  }
  return ids;
}

/**
 * Mapa `permissionId → roles que herdam`. Usado pela UI para mostrar
 * tooltip/badge "Herdada via Admin, Viewer". Quando uma permissão
 * **não** tem origem `role`, ela não aparece no mapa (lookup por
 * `Map.get(id)?.length ?? 0` resolve sem branch).
 */
export type RoleMembershipsByPermission = ReadonlyMap<
  string,
  ReadonlyArray<{ roleId: string; roleCode: string; roleName: string }>
>;

/**
 * Constrói o mapa `permissionId → roles` a partir das fontes (`sources`)
 * de cada `EffectivePermissionDto`. Roles são ordenadas por `roleCode`
 * para estabilidade visual.
 *
 * Backend devolve `roleId`/`roleCode`/`roleName` `null`-able quando
 * `kind === 'direct'`; ignoramos esses casos. Quando `kind === 'role'`,
 * o backend garante os 3 campos preenchidos (validado em runtime).
 */
export function buildRoleMembershipsByPermission(
  effective: ReadonlyArray<EffectivePermissionDto>,
): RoleMembershipsByPermission {
  const map = new Map<
    string,
    Array<{ roleId: string; roleCode: string; roleName: string }>
  >();

  for (const item of effective) {
    const roles = item.sources
      .filter((s) => s.kind === 'role' && s.roleId && s.roleCode && s.roleName)
      .map((s) => ({
        roleId: s.roleId as string,
        roleCode: s.roleCode as string,
        roleName: s.roleName as string,
      }));
    if (roles.length === 0) continue;
    roles.sort((a, b) => compareStrings(a.roleCode, b.roleCode));
    map.set(item.permissionId, roles);
  }

  return map;
}

/**
 * Calcula o diff entre o estado salvo (`originalDirect`) e o estado
 * pendente de salvar (`selectedDirect`). Apenas permissões que mudaram
 * de estado entram no diff — permissões cujo checkbox permaneceu igual
 * são omitidas para minimizar requisições.
 *
 * Algoritmo:
 *
 * - `toAdd` = `selectedDirect \ originalDirect` (estavam desmarcadas,
 *   foram marcadas).
 * - `toRemove` = `originalDirect \ selectedDirect` (estavam marcadas,
 *   foram desmarcadas).
 *
 * Resultados ordenados pela ordem natural dos ids (`localeCompare`)
 * para tornar o teste determinístico — a UI não depende da ordem,
 * mas testes que comparam arrays se beneficiam.
 *
 * Implementação delega ao `computeIdSetDiff` genérico em
 * `src/shared/forms/computeIdSetDiff.ts` — o cálculo é idêntico ao da
 * Issue #71 (roles), portanto centralizar evita duplicação que o
 * Sonar tokenizaria.
 */
export function computeAssignmentDiff(
  originalDirect: ReadonlySet<string>,
  selectedDirect: ReadonlySet<string>,
): PermissionAssignmentDiff {
  return computeIdSetDiff(originalDirect, selectedDirect);
}

/**
 * Devolve `true` quando o diff contém ao menos uma operação. Usado
 * pela UI para habilitar/desabilitar o botão "Salvar".
 *
 * Implementação delega ao `idSetDiffHasChanges` genérico para preservar
 * fonte única de verdade entre Issue #70 (permissões) e Issue #71
 * (roles).
 */
export function diffHasChanges(diff: PermissionAssignmentDiff): boolean {
  return idSetDiffHasChanges(diff);
}
