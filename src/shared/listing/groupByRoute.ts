import {
  groupByEntityField,
  type EntityFieldAccessors,
  type GroupByEntityFieldOptions,
} from './groupByEntityField';

/**
 * Helper de agrupamento por rota (Issue #198). Wrapper fino sobre
 * `groupByEntityField` que fixa os accessors (`routeId`/`routeCode`/
 * `routeName`) e re-tipa a saída para preservar o vocabulário do
 * recurso (campos `routeId`/`routeCode`/`routeName`/`items`).
 *
 * Espelha `groupBySystem` — ambos os agrupadores compartilham o corpo
 * via `groupByEntityField`. Manter wrappers paralelos por nome
 * preserva a leitura natural nos call-sites (`groupBySystem(roles)`,
 * `groupByRoute(permissions)`) sem custo extra de tokens.
 */

/**
 * Contrato mínimo que cada item agrupável por rota precisa expor.
 * Só consumimos `routeId`/`routeCode`/`routeName` — o resto do shape
 * é livre, preservando o tipo do item ao ser passado por generics.
 *
 * **Decisão de tipagem:** declaramos os campos como `string` (não
 * `string | undefined`) porque o backend (`PermissionResponse`)
 * devolve string vazia em vez de `null` quando o LEFT JOIN não tem
 * match (rota soft-deletada). Itens "órfãos" são detectados via
 * `routeCode.length === 0`.
 */
export interface RouteGroupItem {
  routeId: string;
  routeCode: string;
  routeName: string;
}

/**
 * Bloco visual: todos os itens pertencentes a uma mesma rota.
 * Resultado de `groupByRoute<T>` é `ReadonlyArray<RouteGroup<T>>`,
 * onde `T` extende `RouteGroupItem`.
 */
export interface RouteGroup<T> {
  routeId: string;
  routeCode: string;
  routeName: string;
  items: ReadonlyArray<T>;
}

/**
 * Argumentos do `groupByRoute`. `compareItems` define a ordenação dos
 * itens dentro de cada grupo (cada recurso tem seu critério natural —
 * `permissionTypeCode` para permissões, por exemplo).
 *
 * `orphanFallbackName` default vira `'Sem rota'` quando o item não
 * tem `routeName` (LEFT JOIN do backend devolveu vazio).
 */
export type GroupByRouteOptions<T> = GroupByEntityFieldOptions<T>;

const ROUTE_ACCESSORS: EntityFieldAccessors<RouteGroupItem> = {
  getId: (item) => item.routeId,
  getCode: (item) => item.routeCode,
  getName: (item) => item.routeName,
};

/**
 * Agrupa um catálogo de itens por rota. Itens cujo `routeCode` é
 * vazio ficam num grupo virtual com `routeCode` "—" para que a UI
 * ainda mostre o item em vez de descartá-lo silenciosamente.
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `routeCode` (estabilidade visual; órfãos vão pro fim).
 * 2. Itens dentro de cada grupo via `options.compareItems` (caller
 *    define o critério).
 *
 * Genérico em `T` que extende `RouteGroupItem` — preserva o tipo do
 * item para o caller (sem `as` nem perda de inferência).
 */
export function groupByRoute<T extends RouteGroupItem>(
  items: ReadonlyArray<T>,
  options: GroupByRouteOptions<T>,
): ReadonlyArray<RouteGroup<T>> {
  const groups = groupByEntityField<T>(
    items,
    ROUTE_ACCESSORS as EntityFieldAccessors<T>,
    {
      compareItems: options.compareItems,
      orphanFallbackName: options.orphanFallbackName ?? 'Sem rota',
    },
  );

  return groups.map((group) => ({
    routeId: group.id,
    routeCode: group.code,
    routeName: group.name,
    items: group.items,
  }));
}
