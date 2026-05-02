import type {
  EffectivePermissionDto,
  EffectivePermissionSource,
  PermissionDto,
} from '../../shared/api';

/**
 * Helpers puros (sem React) que sustentam a tela de atribuição direta
 * de permissões a um usuário (Issue #70). Concentrar agrupamento, diff
 * e classificação aqui mantém a `UserPermissionsShellPage` quase só com
 * orquestração de estado/UI — testes ficam de baixo custo (sem DOM,
 * sem providers) e a página fica enxuta.
 *
 * **Por que separado da página (lição PR #128/#134):** quando a
 * `PermissionsListShellPage` (sub-issue futura da EPIC #48) ganhar um
 * agrupamento similar por sistema, a função `groupPermissionsBySystem`
 * é candidata óbvia a reuso. Manter pura e exportada desde já evita
 * o "vamos extrair quando duplicar" — política proativa cobrada pelo
 * histórico de Sonar New Code Duplication.
 */

/**
 * Identifica de forma estável uma permissão pelo seu `id`. Tipado como
 * alias para tornar a intenção explícita nos sets/maps (`Set<PermissionId>`
 * lê melhor do que `Set<string>`).
 */
export type PermissionId = string;

/**
 * Bloco visual: todas as permissões pertencentes a um mesmo sistema.
 * Ordenadas por `routeCode` + `permissionTypeCode` para estabilidade
 * visual entre fetches (mesmo critério do backend para listagens).
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
 */
export interface PermissionAssignmentDiff {
  toAdd: ReadonlyArray<PermissionId>;
  toRemove: ReadonlyArray<PermissionId>;
}

/**
 * Falha pontual de sincronização: ao aplicar o diff, alguma chamada
 * pode falhar (404 do vínculo, 400 de permissão inativa, network).
 * Capturamos `permissionId` + `kind` + `message` para que a UI
 * informe ao usuário quais permissões NÃO foram persistidas e ele
 * possa retentar — preferimos falhar parcial em vez de aborto total
 * porque a operação é idempotente (refetch normaliza).
 */
export interface PermissionAssignmentFailure {
  permissionId: PermissionId;
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

/** Chave usada para o bucket "órfão" (sistema vazio/inexistente). */
const ORPHAN_BUCKET_KEY = '__orphan__';
/** Marcador visível do grupo órfão no `systemCode`. */
const ORPHAN_DISPLAY_CODE = '—';

interface SystemMeta {
  systemId: string;
  systemCode: string;
  systemName: string;
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
 * Compara dois grupos: empurra o grupo órfão (`systemCode === '—'`)
 * para o final independentemente da ordenação alfabética, e em seguida
 * ordena por `systemCode` em ordem natural.
 */
function compareSystemGroups(a: PermissionSystemGroup, b: PermissionSystemGroup): number {
  const aOrphan = a.systemCode === ORPHAN_DISPLAY_CODE;
  const bOrphan = b.systemCode === ORPHAN_DISPLAY_CODE;
  if (aOrphan && !bOrphan) return 1;
  if (!aOrphan && bOrphan) return -1;
  return compareStrings(a.systemCode, b.systemCode);
}

/**
 * Constrói os buckets indexados por `systemCode` (ou `__orphan__`
 * quando o sistema não está denormalizado). Função separada de
 * `groupPermissionsBySystem` para reduzir complexidade cognitiva
 * conforme regra do `eslint-plugin-sonarjs` (limite 15).
 */
function buildBuckets(
  permissions: ReadonlyArray<PermissionDto>,
): { buckets: Map<string, PermissionDto[]>; systemMeta: Map<string, SystemMeta> } {
  const buckets = new Map<string, PermissionDto[]>();
  const systemMeta = new Map<string, SystemMeta>();

  for (const perm of permissions) {
    const isOrphan = perm.systemCode.length === 0;
    const key = isOrphan ? ORPHAN_BUCKET_KEY : perm.systemCode;
    const existingBucket = buckets.get(key);
    if (existingBucket) {
      existingBucket.push(perm);
      continue;
    }
    buckets.set(key, [perm]);
    systemMeta.set(key, {
      systemId: perm.systemId,
      systemCode: isOrphan ? ORPHAN_DISPLAY_CODE : perm.systemCode,
      systemName: perm.systemName.length > 0 ? perm.systemName : 'Sem sistema',
    });
  }

  return { buckets, systemMeta };
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
 * Função pura — entrada imutável, saída nova. A complexidade
 * cognitiva é mantida abaixo do limite Sonar via sub-funções
 * dedicadas (`buildBuckets`/`comparePermissionsInGroup`/
 * `compareSystemGroups`).
 */
export function groupPermissionsBySystem(
  permissions: ReadonlyArray<PermissionDto>,
): ReadonlyArray<PermissionSystemGroup> {
  if (permissions.length === 0) {
    return [];
  }

  const { buckets, systemMeta } = buildBuckets(permissions);

  const groups: PermissionSystemGroup[] = [];
  for (const [key, items] of buckets) {
    const meta = systemMeta.get(key);
    if (!meta) continue;
    items.sort(comparePermissionsInGroup);
    groups.push({
      systemId: meta.systemId,
      systemCode: meta.systemCode,
      systemName: meta.systemName,
      permissions: items,
    });
  }

  groups.sort(compareSystemGroups);
  return groups;
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
 * `Set<PermissionId>` real para que `has(id)` em renders seja O(1).
 */
export function buildInitialDirectPermissionIds(
  effective: ReadonlyArray<EffectivePermissionDto>,
): Set<PermissionId> {
  const ids = new Set<PermissionId>();
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
  PermissionId,
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
    PermissionId,
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
 */
export function computeAssignmentDiff(
  originalDirect: ReadonlySet<PermissionId>,
  selectedDirect: ReadonlySet<PermissionId>,
): PermissionAssignmentDiff {
  const toAdd: PermissionId[] = [];
  const toRemove: PermissionId[] = [];

  for (const id of selectedDirect) {
    if (!originalDirect.has(id)) {
      toAdd.push(id);
    }
  }
  for (const id of originalDirect) {
    if (!selectedDirect.has(id)) {
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
export function diffHasChanges(diff: PermissionAssignmentDiff): boolean {
  return diff.toAdd.length > 0 || diff.toRemove.length > 0;
}
