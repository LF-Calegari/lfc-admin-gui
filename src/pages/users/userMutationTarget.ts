import type { UserDto } from '../../shared/api';

/**
 * Adapter `MutationTarget` para `UserDto` reusado pelos wrappers de
 * `MutationConfirmModal` no recurso de usuários (ToggleUserActiveConfirm
 * #80, ForceLogoutUserConfirm #82, e futuros confirm-only modals).
 *
 * O shell `MutationConfirmModal` exibe `target.name` em destaque +
 * `target.code` em monoespaçado entre parênteses — para usuários, o
 * "código" semântico é o e-mail (único por usuário, identificador
 * legível). Mantemos o shell genérico intacto (Systems/Routes continuam
 * usando `code` literal sem regressão) e apenas mapeamos `code` para
 * `email` neste adapter.
 *
 * **Por que extrair em módulo compartilhado?**
 *
 * Sonar/JSCPD tokeniza ≥10 linhas idênticas como duplicação (lições
 * PR #134/#135 — `New Code Duplication > 3%` é BLOCKER). O bloco
 * `UserTarget` interface + `toTarget` function (~11 linhas com
 * comentário) era idêntico entre `ToggleUserActiveConfirm` e
 * `ForceLogoutUserConfirm`. Extrair de uma vez evita a 7ª recorrência
 * de duplicação Sonar e centraliza qualquer evolução futura (ex.: se
 * a UX decidir mostrar `identity` em vez de `email` no `code`, muda
 * em um único lugar).
 */
export interface UserTarget {
  name: string;
  code: string;
}

/**
 * Converte um `UserDto | null` em `UserTarget | null` para alimentar
 * o `MutationConfirmModal`. Retorna `null` quando `user` é `null` —
 * o shell não renderiza nada nesse caso (caller controla `open` em
 * conjunto com `target`).
 */
export function toUserTarget(user: UserDto | null): UserTarget | null {
  if (!user) return null;
  return { name: user.name, code: user.email };
}
