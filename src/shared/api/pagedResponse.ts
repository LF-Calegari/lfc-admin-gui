import type { PagedResponse } from './systems';

/**
 * Helper genérico para validar o envelope `PagedResponse<T>`
 * recebido do `lfc-authenticator`. Encapsula a checagem de campos
 * fixos (`page`/`pageSize`/`total` numéricos + `data` array) e
 * delega a validação dos itens ao type guard específico do recurso.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar/JSCPD):**
 *
 * O bloco:
 *
 * ```ts
 * if (!value || typeof value !== 'object') return false;
 * const record = value as Record<string, unknown>;
 * if (
 *   typeof record.page !== 'number' ||
 *   typeof record.pageSize !== 'number' ||
 *   typeof record.total !== 'number' ||
 *   !Array.isArray(record.data)
 * ) return false;
 * return record.data.every(<itemGuard>);
 * ```
 *
 * é idêntico em cada `is<Recurso>PagedResponse` (`isPagedSystemsResponse`,
 * `isPagedRoutesResponse`, `isPagedRolesResponse`, `isPagedClientsResponse`).
 * Sem este helper, JSCPD/Sonar tokenizam ~14 linhas como bloco
 * duplicado em cada novo recurso CRUD que entrar (`isPagedUsersResponse`,
 * `isPagedPermissionsResponse`, etc.) — exatamente o gatilho da 5ª
 * recorrência prevista pela lição PR #134/#135.
 *
 * O helper é parametrizado pelo type guard do item (`isItem`); cada
 * recurso continua dono da sua validação específica de shape, mas o
 * envelope passa a ter apenas uma fonte de verdade.
 */
export function isPagedResponseEnvelope<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is PagedResponse<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.page !== 'number' ||
    typeof record.pageSize !== 'number' ||
    typeof record.total !== 'number' ||
    !Array.isArray(record.data)
  ) {
    return false;
  }
  return record.data.every(isItem);
}
