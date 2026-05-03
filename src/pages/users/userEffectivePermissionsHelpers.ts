import { groupBySystem } from '../../shared/listing';

import type {
  EffectivePermissionDto,
  EffectivePermissionSource,
} from '../../shared/api';
import type { SystemGroup } from '../../shared/listing';

/**
 * Helpers puros (sem React) que sustentam a tela read-only de
 * **visualização de permissões efetivas** de um usuário (Issue #72).
 *
 * Diferente da `userPermissionsHelpers.ts` (Issue #70 — atribuição
 * direta com diff client-side), este módulo:
 *
 * - Não calcula diff (a tela é read-only).
 * - Agrupa por sistema o resultado de `listEffectiveUserPermissions`
 *   diretamente (e não o catálogo `listPermissions`), porque o
 *   contrato de "efetivas" já filtra apenas o que o usuário
 *   efetivamente tem.
 * - Constrói uma lista canônica de sistemas únicos a partir das
 *   próprias permissões efetivas, para popular o `<Select>` de
 *   filtro por sistema sem precisar de um fetch adicional ao
 *   `/systems` (decisão deliberada — a Issue #72 não exige listar
 *   sistemas vazios; mostrar apenas sistemas com permissões
 *   efetivas reduz ruído de UI).
 *
 * Mantemos a fonte única de verdade do agrupamento delegando ao
 * `groupBySystem` genérico (`src/shared/listing/groupBySystem.ts`)
 * para evitar duplicação ≥10 linhas com a Issue #70/#71 (lições
 * PR #134/#135 — quando o **corpo** é idêntico entre recursos,
 * extrair em helper genérico).
 */

/**
 * Bloco visual: todas as permissões efetivas de um usuário pertencentes
 * a um mesmo sistema. Ordenadas por `routeCode` + `permissionTypeCode`
 * (mesmo critério do backend para listagens, garante estabilidade
 * visual entre fetches).
 *
 * Tipo é alias do `SystemGroup<EffectivePermissionDto>` genérico —
 * preserva o nome semântico para os call-sites e renomeia o array
 * `items` para `permissions` para legibilidade.
 */
export interface EffectivePermissionSystemGroup {
  systemId: string;
  systemCode: string;
  systemName: string;
  permissions: ReadonlyArray<EffectivePermissionDto>;
}

/**
 * Resumo de uma role que contribui para uma permissão efetiva — usado
 * para renderizar uma badge "Role: Admin" por origem. `roleId` é o id
 * estável usado como key React; `roleCode` aparece em mono-tooltip;
 * `roleName` é o texto humano da badge.
 */
export interface EffectivePermissionRoleSource {
  roleId: string;
  roleCode: string;
  roleName: string;
}

/**
 * Decomposição da `sources` de uma permissão efetiva em duas categorias
 * mutuamente úteis para a UI:
 *
 * - `isDirect`: existe uma origem `kind === 'direct'`.
 * - `roles`: array ordenado por `roleCode` das origens `kind === 'role'`.
 *
 * Backend devolve `sources` ordenadas (direct primeiro, depois roles
 * por `roleCode`); aqui apenas separamos para que a UI render-side
 * possa iterar `roles` sem branch interno e `isDirect` controle a
 * badge "Direta".
 */
export interface EffectivePermissionOriginBreakdown {
  isDirect: boolean;
  roles: ReadonlyArray<EffectivePermissionRoleSource>;
}

/**
 * Item do `<Select>` de filtro por sistema. `systemId` é o valor
 * enviado para o backend via `?systemId=`; `systemCode`/`systemName`
 * são apenas para apresentação. Os items são derivados das permissões
 * efetivas reais (não do catálogo `listSystems`) para mostrar apenas
 * sistemas onde o usuário **efetivamente tem alguma permissão** —
 * reduz ruído de UI (selecionar um sistema vazio mostraria empty).
 */
export interface EffectivePermissionSystemOption {
  systemId: string;
  systemCode: string;
  systemName: string;
}

/**
 * Compara strings com `localeCompare` em pt-BR e ordem natural — o
 * mesmo critério adotado em `userPermissionsHelpers.ts`/
 * `userRolesHelpers.ts`. Mantemos a função local (não exportada) para
 * que cada módulo tenha seu próprio comparador identidade-única — a
 * implementação trivial não justifica importar de um shared.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Compara duas permissões efetivas dentro do mesmo grupo: primeiro por
 * `routeCode`, depois por `permissionTypeCode`. Mantida fora de
 * `groupEffectivePermissionsBySystem` para reduzir complexidade
 * cognitiva (lição PR #134/#135 — Sonar conta branches aninhados;
 * isolar comparadores reduz o "cognitivo" sem prejudicar leitura).
 */
function compareEffectiveInGroup(
  a: EffectivePermissionDto,
  b: EffectivePermissionDto,
): number {
  const byRoute = compareStrings(a.routeCode, b.routeCode);
  if (byRoute !== 0) return byRoute;
  return compareStrings(a.permissionTypeCode, b.permissionTypeCode);
}

/**
 * Adapta o `SystemGroup<EffectivePermissionDto>` genérico para a forma
 * esperada pela página (`permissions` em vez de `items`). Mantemos o
 * adapter simples — só renomeia o campo da coleção.
 */
function toEffectivePermissionGroup(
  group: SystemGroup<EffectivePermissionDto>,
): EffectivePermissionSystemGroup {
  return {
    systemId: group.systemId,
    systemCode: group.systemCode,
    systemName: group.systemName,
    permissions: group.items,
  };
}

/**
 * Agrupa as permissões efetivas de um usuário por sistema. Sistemas
 * sem `systemId` (denormalizado vazio em casos raros — soft-delete em
 * cascata no backend) caem em um grupo virtual com `systemCode` "—"
 * para preservar a permissão na UI em vez de descartá-la
 * silenciosamente.
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `systemCode` (estabilidade visual).
 * 2. Permissões dentro de cada grupo por `routeCode` então
 *    `permissionTypeCode` (mesmo critério do backend para listagens).
 *
 * Função pura — entrada imutável, saída nova. Delega ao
 * `groupBySystem` genérico para alinhar com Issue #70/#71 e evitar
 * duplicação que o Sonar tokenizaria.
 */
export function groupEffectivePermissionsBySystem(
  effective: ReadonlyArray<EffectivePermissionDto>,
): ReadonlyArray<EffectivePermissionSystemGroup> {
  const groups = groupBySystem(effective, {
    compareItems: compareEffectiveInGroup,
  });
  return groups.map(toEffectivePermissionGroup);
}

/**
 * Decompõe o array `sources` de uma permissão em `isDirect` (booleano
 * único) + `roles` (array ordenado por `roleCode`). Origens `role`
 * com `roleId`/`roleCode`/`roleName` ausentes são silenciosamente
 * descartadas — o backend garante esses campos quando `kind === 'role'`,
 * mas o type guard tolera `null`/`undefined`. Em caso de inconsistência
 * raríssima, preferimos esconder a badge a quebrar a UI.
 */
export function breakdownPermissionOrigin(
  sources: ReadonlyArray<EffectivePermissionSource>,
): EffectivePermissionOriginBreakdown {
  const isDirect = sources.some((source) => source.kind === 'direct');
  const roles: Array<EffectivePermissionRoleSource> = [];
  for (const source of sources) {
    if (
      source.kind === 'role' &&
      source.roleId &&
      source.roleCode &&
      source.roleName
    ) {
      roles.push({
        roleId: source.roleId,
        roleCode: source.roleCode,
        roleName: source.roleName,
      });
    }
  }
  roles.sort((a, b) => compareStrings(a.roleCode, b.roleCode));
  return { isDirect, roles };
}

/**
 * Constrói a lista de sistemas únicos a partir das permissões
 * efetivas — usada para popular o `<Select>` de filtro. Cada sistema
 * aparece uma única vez; o array é ordenado por `systemCode` (estável
 * com o agrupamento da lista principal).
 *
 * Decisão (Issue #72): derivamos a lista das próprias permissões
 * efetivas em vez de fazer um fetch a `/systems`. Justificativa:
 *
 * - Reduz round-trip extra (UI já carrega as efetivas; reaproveita).
 * - Filtra automaticamente sistemas sem permissões efetivas — o
 *   `<Select>` mostra apenas opções "úteis" (selecionar um sistema
 *   sem permissão efetiva mostraria empty, que é ruído).
 *
 * Sistemas com `systemId` vazio (caso degenerado) são descartados —
 * o `<Select>` precisa de `value` único e estável, e oferecer um
 * "sem sistema" no dropdown adicionaria semântica confusa para o
 * operador. Permissões nesse estado continuam visíveis no agrupamento
 * principal (sob "—"), apenas não filtramos por elas.
 */
export function deriveSystemOptionsFromEffective(
  effective: ReadonlyArray<EffectivePermissionDto>,
): ReadonlyArray<EffectivePermissionSystemOption> {
  const seen = new Map<string, EffectivePermissionSystemOption>();
  for (const item of effective) {
    if (item.systemId && !seen.has(item.systemId)) {
      seen.set(item.systemId, {
        systemId: item.systemId,
        systemCode: item.systemCode,
        systemName: item.systemName,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    compareStrings(a.systemCode, b.systemCode),
  );
}
