/**
 * Type guard genérico para DTOs com shape Name/Code/Description +
 * datas de auditoria (`createdAt`/`updatedAt`/`deletedAt`).
 *
 * Vários recursos do `lfc-authenticator` compartilham esse shape
 * mínimo:
 *
 * - `SystemDto` (`shared/api/systems.ts`)
 * - `TokenTypeDto` (`shared/api/tokenTypes.ts` — Issue #175)
 *
 * Outros (rotas, roles) adicionam campos extras (`systemId`,
 * `systemTokenTypeId`, etc.) e por isso não consomem este helper
 * direto — reusam apenas as validações dos campos compartilhados via
 * composição.
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** antes desta extração,
 * os corpos de `isSystemDto` e `isTokenTypeDto` eram literalmente
 * idênticos (~20 linhas). JSCPD detectou clones de 28 e 20 linhas
 * entre `systems.ts`, `routes.ts` e `tokenTypes.ts`. Centralizar a
 * checagem aqui colapsa todos os call sites para uma única chamada
 * — cada wrapper específico só checa os campos extras que adiciona.
 *
 * Tolera `description`/`deletedAt` ausentes (tratados como `null`
 * pelos consumidores). Os demais campos são obrigatórios.
 */
export function isNameCodeDescriptionDto(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.code === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    (record.description === null ||
      record.description === undefined ||
      typeof record.description === 'string') &&
    (record.deletedAt === null ||
      record.deletedAt === undefined ||
      typeof record.deletedAt === 'string')
  );
}
