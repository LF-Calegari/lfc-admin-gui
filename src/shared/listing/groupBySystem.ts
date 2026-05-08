import {
  groupByEntityField,
  type EntityFieldAccessors,
  type GroupByEntityFieldOptions,
} from './groupByEntityField';

/**
 * Helper de agrupamento por sistema. Wrapper fino sobre
 * `groupByEntityField` que fixa os accessors (`systemId`/`systemCode`/
 * `systemName`) e re-tipa a saída para preservar o vocabulário do
 * recurso (campos `systemId`/`systemCode`/`systemName`/`items`).
 *
 * **Por que existe (lições PR #134/#135):** o corpo do agrupador é
 * compartilhado com `groupByRoute` (Issue #198) — manter implementação
 * paralela tokenizaria como bloco duplicado no Sonar. Centralizar em
 * `groupByEntityField` parametriza apenas a tripla de campos lidos do
 * item, mantendo um único caminho lógico.
 *
 * Usado por:
 *
 * - `userPermissionsHelpers.groupPermissionsBySystem` (Issue #70).
 * - `userRolesHelpers.groupRolesBySystem` (Issue #71).
 * - Listagens futuras que precisem agrupar entidades denormalizadas
 *   por `systemCode`/`systemName`/`systemId`.
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
 * Argumentos do `groupBySystem`. `compareItems` define a ordenação
 * dos itens dentro de cada grupo (cada recurso tem seu critério
 * natural — `routeCode` para permissões, `code` para roles).
 *
 * `orphanFallbackName` default vira `'Sem sistema'` quando o item não
 * tem `systemName` (LEFT JOIN do backend devolveu vazio).
 */
export type GroupBySystemOptions<T> = GroupByEntityFieldOptions<T>;

const SYSTEM_ACCESSORS: EntityFieldAccessors<SystemGroupItem> = {
  getId: (item) => item.systemId,
  getCode: (item) => item.systemCode,
  getName: (item) => item.systemName,
};

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
 *    define o critério).
 *
 * Genérico em `T` que extende `SystemGroupItem` — preserva o tipo do
 * item para o caller (sem `as` nem perda de inferência).
 */
export function groupBySystem<T extends SystemGroupItem>(
  items: ReadonlyArray<T>,
  options: GroupBySystemOptions<T>,
): ReadonlyArray<SystemGroup<T>> {
  const groups = groupByEntityField<T>(
    items,
    SYSTEM_ACCESSORS as EntityFieldAccessors<T>,
    {
      compareItems: options.compareItems,
      orphanFallbackName: options.orphanFallbackName ?? 'Sem sistema',
    },
  );

  return groups.map((group) => ({
    systemId: group.id,
    systemCode: group.code,
    systemName: group.name,
    items: group.items,
  }));
}
