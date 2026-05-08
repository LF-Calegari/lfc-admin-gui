/**
 * Helper genérico que centraliza o algoritmo de agrupamento de itens
 * por uma entidade denormalizada (sistema, rota, etc.). Os wrappers
 * concretos (`groupBySystem`, `groupByRoute`) fixam apenas os
 * accessors `getId`/`getCode`/`getName` — todo o restante (ordenação
 * dos grupos, tratamento de órfãos, ordenação dos itens dentro do
 * grupo) vive aqui.
 *
 * **Por que existe (lição PR #134/#135):** introduzir um wrapper novo
 * (`groupByRoute` para a Issue #198) replicando o corpo de
 * `groupBySystem` tokenizaria como bloco duplicado no Sonar — a única
 * variação entre os dois agrupadores é a tripla de campos lidos do
 * item (`system*` versus `route*`). Centralizar aqui parametriza
 * exatamente essa diferença e mantém um único caminho lógico.
 *
 * Função pura — entrada imutável, saída nova. Não importa do React,
 * pode ser usada em testes, hooks de memo ou efeitos sem custo.
 */

/** Marcador visível do grupo órfão no `code` retornado. */
export const ORPHAN_DISPLAY_CODE = '—';
/** Chave do bucket virtual para itens sem entidade. Privada ao módulo. */
const ORPHAN_BUCKET_KEY = '__orphan__';

/**
 * Compara strings com `localeCompare` em pt-BR — mesmo critério usado
 * em outros pontos da UI para estabilidade entre browsers.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Acessores que cada agrupador concreto fornece para extrair a tripla
 * `id`/`code`/`name` da entidade denormalizada do item. Mantemos como
 * funções puras (em vez de chaves) porque preservam tipagem forte e
 * evitam `keyof T` que perderia o `string` literal nos call-sites.
 */
export interface EntityFieldAccessors<T> {
  getId: (item: T) => string;
  getCode: (item: T) => string;
  getName: (item: T) => string;
}

/**
 * Argumentos comuns aceitos pelos agrupadores. `compareItems` define
 * a ordenação dos itens dentro de cada grupo (cada recurso tem seu
 * critério natural — `permissionTypeCode`, `code`, etc.).
 */
export interface GroupByEntityFieldOptions<T> {
  compareItems: (a: T, b: T) => number;
  /** Nome exibido no grupo virtual quando o item não tem `name`. */
  orphanFallbackName?: string;
}

/**
 * Bloco visual: todos os itens pertencentes à mesma entidade
 * denormalizada. Os wrappers (`SystemGroup`, `RouteGroup`) re-tipam
 * essa shape com nomes específicos do recurso para preservar o
 * vocabulário do call-site.
 */
export interface EntityGroup<T> {
  id: string;
  code: string;
  name: string;
  items: ReadonlyArray<T>;
}

interface EntityMeta {
  id: string;
  code: string;
  name: string;
}

interface BucketsResult<T> {
  buckets: Map<string, T[]>;
  meta: Map<string, EntityMeta>;
}

/**
 * Constrói os buckets indexados por `code` (ou `__orphan__` quando o
 * item não tem entidade denormalizada). Função separada do agrupador
 * principal para reduzir complexidade cognitiva conforme regra do
 * `eslint-plugin-sonarjs` (limite 15).
 */
function buildBuckets<T>(
  items: ReadonlyArray<T>,
  accessors: EntityFieldAccessors<T>,
  orphanFallbackName: string,
): BucketsResult<T> {
  const buckets = new Map<string, T[]>();
  const meta = new Map<string, EntityMeta>();

  for (const item of items) {
    const code = accessors.getCode(item);
    const isOrphan = code.length === 0;
    const key = isOrphan ? ORPHAN_BUCKET_KEY : code;
    const existingBucket = buckets.get(key);
    if (existingBucket) {
      existingBucket.push(item);
      continue;
    }
    buckets.set(key, [item]);
    const name = accessors.getName(item);
    meta.set(key, {
      id: accessors.getId(item),
      code: isOrphan ? ORPHAN_DISPLAY_CODE : code,
      name: name.length > 0 ? name : orphanFallbackName,
    });
  }

  return { buckets, meta };
}

/**
 * Compara dois grupos: empurra o grupo órfão (`code === '—'`) para o
 * final independentemente da ordenação alfabética, e em seguida ordena
 * por `code` em ordem natural. Mantido fora do agrupador principal
 * para reduzir a contagem cognitiva (regra Sonar) — espelha o pattern
 * herdado de `groupBySystem`.
 */
function compareEntityGroups<T>(a: EntityGroup<T>, b: EntityGroup<T>): number {
  const aOrphan = a.code === ORPHAN_DISPLAY_CODE;
  const bOrphan = b.code === ORPHAN_DISPLAY_CODE;
  if (aOrphan && !bOrphan) return 1;
  if (!aOrphan && bOrphan) return -1;
  return compareStrings(a.code, b.code);
}

/**
 * Agrupa um catálogo de itens pela tripla `id/code/name` extraída via
 * `accessors`. Itens cujo `code` é vazio (LEFT JOIN do backend não
 * encontrou a entidade — soft-delete em cascata, por exemplo) ficam
 * num grupo virtual com `code` "—" para que a UI ainda mostre o item
 * em vez de descartá-lo silenciosamente.
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `code` (estabilidade visual; órfãos vão pro fim).
 * 2. Itens dentro de cada grupo via `options.compareItems`.
 *
 * Genérico em `T` — preserva o tipo do item para o caller (sem `as`
 * nem perda de inferência) e isola o algoritmo dos nomes específicos
 * de campo (system/route/etc.).
 */
export function groupByEntityField<T>(
  items: ReadonlyArray<T>,
  accessors: EntityFieldAccessors<T>,
  options: GroupByEntityFieldOptions<T>,
): ReadonlyArray<EntityGroup<T>> {
  if (items.length === 0) {
    return [];
  }

  const orphanFallbackName = options.orphanFallbackName ?? 'Sem entidade';
  const { buckets, meta } = buildBuckets(items, accessors, orphanFallbackName);

  const groups: EntityGroup<T>[] = [];
  for (const [key, bucketItems] of buckets) {
    const entry = meta.get(key);
    if (!entry) continue;
    bucketItems.sort(options.compareItems);
    groups.push({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      items: bucketItems,
    });
  }

  groups.sort(compareEntityGroups);
  return groups;
}
