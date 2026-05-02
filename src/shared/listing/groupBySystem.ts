/**
 * Helper genérico de agrupamento por sistema. Usado por:
 *
 * - `userPermissionsHelpers.groupPermissionsBySystem` (Issue #70).
 * - `userRolesHelpers.groupRolesBySystem` (Issue #71).
 * - Listagens futuras que precisem agrupar entidades denormalizadas
 *   por `systemCode`/`systemName`/`systemId`.
 *
 * **Por que vive em `src/shared/listing/`:** o corpo das duas funções
 * de agrupamento (build buckets, ordenar grupos, push de "órfãos"
 * para o final) tinha ~52 linhas idênticas entre os dois recursos,
 * divergindo apenas em (i) tipo do item e (ii) critério de ordenação
 * dentro do grupo. Sonar tokeniza isso como bloco duplicado (lição
 * PR #134/#135). Centralizar aqui parametriza o critério de ordem e
 * mantém o tipo do item via generics — call-site fica reduzido a 1
 * chamada por recurso.
 *
 * Função pura — entrada imutável, saída nova. Não importa do React,
 * pode ser usada em testes, hooks de memo ou efeitos sem custo.
 */

/**
 * Contrato mínimo que cada item agrupável precisa expor. Só consumimos
 * `systemId`/`systemCode`/`systemName` — o resto do shape é livre,
 * preservando o tipo do item ao ser passado por generics.
 *
 * **Decisão de tipagem:** declaramos os campos como `string` (não
 * `string | undefined`) porque os DTOs do backend (`PermissionDto`/
 * `RoleDto`) garantem `string` — quando o LEFT JOIN não tem match, o
 * backend devolve string vazia em vez de `null`. Itens "órfãos" são
 * detectados via `systemCode.length === 0`.
 */
export interface SystemGroupItem {
  systemId: string;
  systemCode: string;
  systemName: string;
}

/**
 * Bloco visual: todos os itens pertencentes a um mesmo sistema.
 * Resultado de `groupBySystem<T>` é `ReadonlyArray<SystemGroup<T>>`,
 * onde `T` extende `SystemGroupItem`.
 *
 * `items` é tipado como `ReadonlyArray<T>` para preservar a
 * imutabilidade do resultado — caller não consegue mutar o array
 * devolvido.
 */
export interface SystemGroup<T> {
  systemId: string;
  systemCode: string;
  systemName: string;
  items: ReadonlyArray<T>;
}

/**
 * Argumentos do `groupBySystem`.
 *
 * - `compareItems` — comparador estável dos itens dentro de um mesmo
 *   grupo (ex.: por `routeCode` em PermissionDto, por `code` em
 *   RoleDto). Mantido como parâmetro porque a ordem natural varia
 *   entre recursos.
 * - `orphanFallbackName` — nome exibido no grupo virtual quando o
 *   item não tem `systemName` (LEFT JOIN do backend devolveu vazio).
 *   Default: `'Sem sistema'` para casar com o pattern já adotado.
 */
export interface GroupBySystemOptions<T> {
  compareItems: (a: T, b: T) => number;
  orphanFallbackName?: string;
}

/** Marcador visível do grupo órfão no `systemCode`. */
const ORPHAN_DISPLAY_CODE = '—';
/** Chave do bucket virtual para itens sem sistema. Privada ao módulo. */
const ORPHAN_BUCKET_KEY = '__orphan__';

/**
 * Compara strings com `localeCompare` em pt-BR — mesmo critério usado
 * em outros pontos da UI para estabilidade entre browsers.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Compara dois grupos: empurra o grupo órfão (`systemCode === '—'`)
 * para o final independentemente da ordenação alfabética, e em seguida
 * ordena por `systemCode` em ordem natural. Mantido fora de
 * `groupBySystem` para que a complexidade cognitiva do algoritmo
 * principal fique abaixo do limite Sonar (15) — espelha o pattern de
 * `userPermissionsHelpers.compareSystemGroups` (lição PR #134/#135 —
 * isolar comparadores reduz a contagem cognitiva).
 */
function compareSystemGroups<T>(a: SystemGroup<T>, b: SystemGroup<T>): number {
  const aOrphan = a.systemCode === ORPHAN_DISPLAY_CODE;
  const bOrphan = b.systemCode === ORPHAN_DISPLAY_CODE;
  if (aOrphan && !bOrphan) return 1;
  if (!aOrphan && bOrphan) return -1;
  return compareStrings(a.systemCode, b.systemCode);
}

interface SystemMeta {
  systemId: string;
  systemCode: string;
  systemName: string;
}

interface BucketsResult<T> {
  buckets: Map<string, T[]>;
  systemMeta: Map<string, SystemMeta>;
}

/**
 * Constrói os buckets indexados por `systemCode` (ou `__orphan__`
 * quando o item não tem sistema denormalizado). Função separada de
 * `groupBySystem` para reduzir complexidade cognitiva conforme regra
 * do `eslint-plugin-sonarjs` (limite 15) — espelha o pattern de
 * `userPermissionsHelpers.buildBuckets`.
 */
function buildBuckets<T extends SystemGroupItem>(
  items: ReadonlyArray<T>,
  orphanFallbackName: string,
): BucketsResult<T> {
  const buckets = new Map<string, T[]>();
  const systemMeta = new Map<string, SystemMeta>();

  for (const item of items) {
    const isOrphan = item.systemCode.length === 0;
    const key = isOrphan ? ORPHAN_BUCKET_KEY : item.systemCode;
    const existingBucket = buckets.get(key);
    if (existingBucket) {
      existingBucket.push(item);
      continue;
    }
    buckets.set(key, [item]);
    systemMeta.set(key, {
      systemId: item.systemId,
      systemCode: isOrphan ? ORPHAN_DISPLAY_CODE : item.systemCode,
      systemName: item.systemName.length > 0 ? item.systemName : orphanFallbackName,
    });
  }

  return { buckets, systemMeta };
}

/**
 * Agrupa um catálogo de itens por sistema. Itens cujo `systemCode` é
 * vazio (LEFT JOIN do backend não encontrou o sistema — soft-delete
 * em cascata) ficam num grupo virtual com `systemCode` "—" para que
 * a UI ainda mostre o item em vez de descartá-lo silenciosamente.
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `systemCode` (estabilidade visual; órfãos vão pro fim).
 * 2. Itens dentro de cada grupo via `options.compareItems` (caller
 *    define o critério: `routeCode` para permissões, `code` para roles).
 *
 * Genérico em `T` que extende `SystemGroupItem` — preserva o tipo do
 * item para o caller (sem `as` nem perda de inferência).
 */
export function groupBySystem<T extends SystemGroupItem>(
  items: ReadonlyArray<T>,
  options: GroupBySystemOptions<T>,
): ReadonlyArray<SystemGroup<T>> {
  if (items.length === 0) {
    return [];
  }

  const orphanFallbackName = options.orphanFallbackName ?? 'Sem sistema';
  const { buckets, systemMeta } = buildBuckets(items, orphanFallbackName);

  const groups: SystemGroup<T>[] = [];
  for (const [key, bucketItems] of buckets) {
    const meta = systemMeta.get(key);
    if (!meta) continue;
    bucketItems.sort(options.compareItems);
    groups.push({
      systemId: meta.systemId,
      systemCode: meta.systemCode,
      systemName: meta.systemName,
      items: bucketItems,
    });
  }

  groups.sort(compareSystemGroups);
  return groups;
}
