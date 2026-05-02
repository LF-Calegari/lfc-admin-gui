import { clientDisplayName } from '../../shared/api';

import type { ClientDto } from '../../shared/api';

/**
 * Adapter `MutationTarget` para `ClientDto`. O shell
 * `MutationConfirmModal` (em `src/pages/systems/`) exige um target
 * com `name` (label visível em destaque) e `code` (identificador
 * curto exibido em monoespaçado entre parênteses).
 *
 * Para clientes:
 *
 * - `name` → `clientDisplayName(client)` (PF: `fullName`; PJ:
 *   `corporateName`; fallback: `id` curto). Centralizar via helper
 *   evita duplicação com `UsersListShellPage` e o `ClientEditPage`
 *   (lição PR #127).
 * - `code` → CPF (PF) ou CNPJ (PJ). É o identificador mais legível
 *   visível na tabela. Quando ambos são `null` (cenário fora do
 *   contrato mas defensivo), cai em string vazia para que o shell
 *   mantenha o layout — o `<Mono>` ficaria vazio mas não quebra.
 *
 * Extraído como módulo dedicado pela Issue #76 para deduplicar entre
 * `DeleteClientConfirm` e `RestoreClientConfirm` — JSCPD tokenizou
 * a `interface` + função (~14 linhas com comentários) como bloco
 * idêntico (lição PR #128/#134/#135 — qualquer trecho ≥10 linhas em
 * 2+ arquivos vira `New Code Duplication` no Sonar).
 */
export interface ClientMutationTarget {
  name: string;
  code: string;
}

/**
 * Converte um `ClientDto` (ou `null`) em `ClientMutationTarget` (ou
 * `null` quando o cliente é `null`). O modal não renderiza com
 * `target=null`, então retornar `null` aqui é o fluxo natural quando
 * o pai ainda não selecionou nada.
 */
export function toClientMutationTarget(
  client: ClientDto | null,
): ClientMutationTarget | null {
  if (!client) return null;
  const code = client.cpf ?? client.cnpj ?? '';
  return { name: clientDisplayName(client), code };
}
