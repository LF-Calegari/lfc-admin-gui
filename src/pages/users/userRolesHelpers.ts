import { extractErrorMessage, isApiError } from '../../shared/api';
import { groupBySystem, type SystemGroup } from '../../shared/listing';

import type { RoleDto, UserRoleSummary } from '../../shared/api';

/**
 * Helpers puros (sem React) que sustentam a tela de atribuição de
 * roles a um usuário (Issue #71). Espelham o pattern de
 * `userPermissionsHelpers.ts` (Issue #70) e
 * `rolePermissionsHelpers.ts` (Issue #69):
 *
 * - Concentrar agrupamento + seleção inicial em funções puras mantém
 *   a `UserRolesShellPage` enxuta e os testes baratos (sem DOM, sem
 *   providers).
 * - O diff em si **não** vive aqui — usamos `computeIdSetDiff` /
 *   `idSetDiffHasChanges` em `src/shared/forms/`, compartilhado com
 *   as matrizes de permissão (lição PR #134/#135 — Sonar tokeniza
 *   algoritmos idênticos como duplicação se vivem em arquivos
 *   diferentes).
 * - O agrupamento por sistema delega ao `groupBySystem` em
 *   `src/shared/listing/` (lição PR #134/#135 — quando o **corpo**
 *   da função de agrupamento é idêntico entre recursos, extrair em
 *   helper genérico em vez de manter cópias paralelas).
 *
 * **Diferença para `userPermissionsHelpers`:** este módulo agrupa por
 * `Role.SystemId` (não por permissão denormalizada) — o backend
 * (`lfc-authenticator#163`) passou a expor `SystemId` no `RoleDto` e
 * `UserRoleSummary`. `RoleDto` ainda tipa `systemId` como
 * `string | null` (compatibilidade com payloads legados); roles
 * com `systemId === null` caem num grupo virtual "Sem sistema" para
 * ficarem visíveis em vez de descartadas.
 */

/**
 * Bloco visual: todas as roles pertencentes a um mesmo sistema.
 * Wrapper sobre `SystemGroup<RoleDto>` — preserva o nome
 * `RoleSystemGroup` para legibilidade local sem reabrir o tipo
 * compartilhado.
 */
export type RoleSystemGroup = SystemGroup<RoleDto & { systemCode: string; systemName: string }>;

/**
 * Falha pontual de sincronização: ao aplicar o diff, alguma chamada
 * de `assignRoleToUser`/`removeRoleFromUser` pode falhar (404 do
 * vínculo, 400 de role inativa, network). Capturamos `roleId` +
 * `kind` + `message` para que a UI informe ao usuário quais roles
 * NÃO foram persistidas e ele possa retentar — preferimos falhar
 * parcial em vez de aborto total porque a operação é idempotente
 * (refetch normaliza). Espelha `PermissionAssignmentFailure`.
 */
export interface RoleAssignmentFailure {
  roleId: string;
  kind: 'add' | 'remove';
  message: string;
}

/**
 * Lookup `systemId -> {code, name}` carregado pela página via
 * `listSystems`. Necessário porque o `RoleDto` ainda **não traz**
 * `systemCode`/`systemName` denormalizados (pendente no backend).
 * Quando o backend evoluir para projetar esses campos, este lookup
 * pode ser removido.
 */
export type SystemLookupMap = ReadonlyMap<
  string,
  { code: string; name: string }
>;

/**
 * Tipo intermediário usado para alimentar `groupBySystem`. O helper
 * compartilhado exige `systemId/systemCode/systemName` como `string`
 * (não nullable), então enriquecemos cada `RoleDto` antes de agrupar:
 * roles sem `systemId` recebem strings vazias, e o `compareSystemGroups`
 * do helper move grupos sem `systemCode` para o final.
 */
type EnrichedRole = RoleDto & {
  systemId: string;
  systemCode: string;
  systemName: string;
};

function compareRolesByCode(a: EnrichedRole, b: EnrichedRole): number {
  return a.code.localeCompare(b.code, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Resolve `systemCode`/`systemName` de uma role consultando o
 * `systemLookup` (carregado via `listSystems`). Cai num placeholder
 * baseado no `systemId` quando o lookup ainda não chegou (visível
 * apenas durante o curto intervalo entre `setState` paralelos no
 * mount).
 */
function enrichRole(role: RoleDto, lookup: SystemLookupMap): EnrichedRole {
  if (!role.systemId) {
    return {
      ...role,
      systemId: '',
      systemCode: '',
      systemName: '',
    };
  }
  const meta = lookup.get(role.systemId);
  return {
    ...role,
    systemId: role.systemId,
    systemCode: meta?.code ?? role.systemId,
    systemName: meta?.name ?? role.systemId,
  };
}

/**
 * Agrupa um catálogo de roles por sistema. Roles sem `systemId`
 * (`null`) ficam num grupo virtual "Sem sistema" via o helper
 * compartilhado `groupBySystem` em `src/shared/listing/`.
 *
 * O parâmetro `systemLookup` é o mapa `systemId -> {code, name}`
 * carregado pela página via `listSystems` — `RoleDto` ainda **não**
 * traz `systemCode`/`systemName` denormalizados, então a página
 * resolve o lookup em paralelo e injeta aqui.
 *
 * Resultado é ordenado:
 *
 * 1. Grupos por `systemCode` (estabilidade visual; órfão sempre por
 *    último, regra do `groupBySystem` compartilhado).
 * 2. Roles dentro de cada grupo por `code` (mesmo critério adotado
 *    por `RolesPage`).
 *
 * Função pura — entrada imutável, saída nova.
 */
export function groupRolesBySystem(
  roles: ReadonlyArray<RoleDto>,
  systemLookup: SystemLookupMap = new Map(),
): ReadonlyArray<RoleSystemGroup> {
  if (roles.length === 0) return [];
  const enriched = roles.map((role) => enrichRole(role, systemLookup));
  return groupBySystem(enriched, { compareItems: compareRolesByCode });
}

/**
 * Constrói o set inicial de roles atualmente vinculadas ao usuário a
 * partir do array `roles` do `UserResponse` enriquecido (Issue #71 —
 * lfc-authenticator#167). Quando o array é `undefined` (o que não
 * deveria acontecer no `GET /users/{id}`, mas pode acontecer com
 * proxies/cache desalinhados), devolve set vazio em vez de quebrar.
 *
 * Set imutável (do ponto de vista do caller). Valor retornado é um
 * `Set<string>` real para que `has(id)` em renders seja O(1).
 */
export function buildInitialUserRoleIds(
  userRoles: ReadonlyArray<UserRoleSummary> | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!userRoles) return ids;
  for (const role of userRoles) {
    ids.add(role.id);
  }
  return ids;
}

/**
 * Mensagem ao falhar o carregamento inicial (catálogo de roles,
 * sistemas ou usuário) — Issue #208.
 */
export function formatUserRolesPanelLoadError(
  error: unknown,
  fallback: string,
): string {
  if (isApiError(error) && error.kind === 'http') {
    if (error.status === 404) {
      return (
        error.message ||
        'Usuário não encontrado ou sem permissão para consultar as roles.'
      );
    }
    if (error.status === 403) {
      return (
        error.message ||
        'Você não tem permissão para carregar o catálogo de roles ou os vínculos deste usuário.'
      );
    }
    if (error.status === 400) {
      return error.message || 'Requisição inválida ao carregar roles.';
    }
  }
  return extractErrorMessage(error, fallback);
}

/**
 * Mensagem por falha em `assignRoleToUser` / `removeRoleFromUser`
 * (Issue #208 — duplicidade idempotente no backend retorna 200/201;
 * mensagens orientam 400/403/404).
 */
export function formatUserRoleMutationError(
  error: unknown,
  fallback: string,
): string {
  if (isApiError(error) && error.kind === 'http') {
    if (error.status === 403) {
      return (
        error.message ||
        'Permissão negada: sua conta não pode atribuir ou remover esta role.'
      );
    }
    if (error.status === 404) {
      return (
        error.message ||
        'Usuário, role ou vínculo não encontrado. Recarregue a página para sincronizar.'
      );
    }
    if (error.status === 400) {
      return (
        error.message ||
        'Não foi possível alterar o vínculo da role (dados inválidos ou role já vinculada).'
      );
    }
    if (error.status === 409) {
      return (
        error.message ||
        'Esta role já está vinculada a este usuário.'
      );
    }
  }
  return extractErrorMessage(error, fallback);
}
