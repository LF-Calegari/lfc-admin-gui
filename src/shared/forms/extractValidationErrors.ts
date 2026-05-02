/**
 * Helper genérico para extrair erros por campo do payload de
 * `ValidationProblemDetails` do ASP.NET. Cada recurso tem uma lista
 * fechada de chaves esperadas (ex.: `Name`/`Code`/`Description`
 * para sistemas/roles; `Type`/`Cpf`/`FullName`/`Cnpj`/
 * `CorporateName` para clientes); o caller injeta a função
 * `normalizeFieldName` que mapeia o nome PascalCase do backend para
 * a chave camelCase do form, devolvendo `null` para chaves
 * desconhecidas.
 *
 * **Por que existe (lição PR #134/#135):** o corpo do
 * `extract*ValidationErrors` (~12 linhas iterando `Object.entries`)
 * é idêntico entre `clientsFormShared.ts`/`routeFormShared.ts` —
 * jscpd detectou no PR #74. A diferença está apenas na função de
 * normalização de chaves (`normalizeRouteFieldName` vs
 * `normalizeClientFieldName`); centralizar o iterador aqui mantém
 * a tipagem estreita por recurso (`TErrors` é o shape específico)
 * sem duplicar o for-of.
 */
export function extractValidationErrorsByField<TErrors>(
  details: unknown,
  normalizeFieldName: (serverField: string) => keyof TErrors | null,
): TErrors | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const errors = (details as Record<string, unknown>).errors;
  if (!errors || typeof errors !== 'object') {
    return null;
  }
  const result = {} as TErrors;
  let hasAny = false;
  for (const [serverField, raw] of Object.entries(errors)) {
    const field = normalizeFieldName(serverField);
    if (!field) continue;
    const message = pickFirstMessage(raw);
    if (message !== null) {
      (result as Record<string, string>)[field as string] = message;
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

/**
 * Devolve a primeira mensagem string do valor cru retornado pelo
 * backend. Aceita string solta ou array (caso comum em
 * `ValidationProblemDetails`); ignora outros tipos.
 *
 * Extraído como helper privado para que o `for-of` do iterador
 * principal fique linear (Cognitive Complexity < 15) — Sonar
 * reprovaria o aninhamento original em uma função dedicada.
 */
function pickFirstMessage(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return raw[0];
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return null;
}
