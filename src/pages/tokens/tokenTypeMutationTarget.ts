import type { TokenTypeDto } from '../../shared/api';

/**
 * Adapter `MutationTarget` para `TokenTypeDto`. O shell
 * `MutationConfirmModal` (em `src/pages/systems/`) exige um target com
 * `name` (label visível em destaque) e `code` (identificador curto
 * exibido em monoespaçado entre parênteses).
 *
 * Para token types o mapeamento é trivial — `name` e `code` já vêm
 * direto do DTO, sem fallbacks complexos como em clientes (PF/PJ) ou
 * usuários (login derivado).
 *
 * Extraído como módulo dedicado pela Issue #175 para deduplicar entre
 * `DeleteTokenTypeConfirm` e `RestoreTokenTypeConfirm` — JSCPD
 * tokenizaria a `interface` + função (~10 linhas com comentários) como
 * bloco idêntico (lição PR #128/#134/#135 — qualquer trecho ≥10 linhas
 * em 2+ arquivos vira `New Code Duplication` no Sonar).
 */
export interface TokenTypeMutationTarget {
  name: string;
  code: string;
}

/**
 * Converte um `TokenTypeDto` (ou `null`) em `TokenTypeMutationTarget`
 * (ou `null` quando o DTO é `null`). O modal não renderiza com
 * `target=null`, então retornar `null` aqui é o fluxo natural quando o
 * pai ainda não selecionou nada.
 */
export function toTokenTypeMutationTarget(
  tokenType: TokenTypeDto | null,
): TokenTypeMutationTarget | null {
  if (!tokenType) return null;
  return { name: tokenType.name, code: tokenType.code };
}
