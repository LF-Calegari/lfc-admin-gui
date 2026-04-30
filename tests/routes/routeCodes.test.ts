import { describe, expect, it } from 'vitest';

import { resolveRouteCode, ROUTE_CODE_ENTRIES } from '@/routes/routeCodes';

/**
 * Tabela de cenários positivos: cada path privado mapeado pelo
 * `AppRoutes` deve devolver o `routeCode` esperado pelo backend.
 *
 * Mantemos a tabela em sincronia com a definição em
 * `src/routes/routeCodes.ts` — divergência é regressão.
 */
interface ResolveCase {
  pathname: string;
  expected: string;
}

const POSITIVE_CASES: ReadonlyArray<ResolveCase> = [
  { pathname: '/systems', expected: 'AUTH_V1_SYSTEMS_LIST' },
  { pathname: '/routes', expected: 'AUTH_V1_SYSTEMS_ROUTES_LIST' },
  { pathname: '/roles', expected: 'AUTH_V1_ROLES_LIST' },
  { pathname: '/permissions', expected: 'AUTH_V1_PERMISSIONS_LIST' },
  { pathname: '/users', expected: 'AUTH_V1_USERS_LIST' },
  { pathname: '/tokens', expected: 'AUTH_V1_TOKEN_TYPES_LIST' },
];

/**
 * `/settings` e `/showcase` não têm rota equivalente cadastrada no
 * `AuthenticatorRoutesSeeder` — `resolveRouteCode` devolve `null` e o
 * `RequireAuth` pula a chamada de `verify-token`.
 */
const NEGATIVE_CASES: ReadonlyArray<string> = [
  '/',
  '/login',
  '/error/403',
  '/error/404',
  '/rota-inexistente',
  '/settings',
  '/showcase',
  '',
];

describe('resolveRouteCode — paths privados conhecidos', () => {
  it.each(POSITIVE_CASES)(
    'mapeia $pathname → $expected',
    ({ pathname, expected }) => {
      expect(resolveRouteCode(pathname)).toBe(expected);
    },
  );

  it('mapeia subpaths via matchPath não-strict', () => {
    // `matchPath({ end: false })` aceita subpaths — útil quando as
    // páginas evoluírem para `:id`/abas/etc sem precisar atualizar a
    // tabela.
    expect(resolveRouteCode('/systems/123')).toBe('AUTH_V1_SYSTEMS_LIST');
    expect(resolveRouteCode('/users/42/edit')).toBe('AUTH_V1_USERS_LIST');
  });
});

describe('resolveRouteCode — paths não privados ou desconhecidos', () => {
  it.each(NEGATIVE_CASES)('retorna null para %s', pathname => {
    expect(resolveRouteCode(pathname)).toBeNull();
  });
});

describe('ROUTE_CODE_ENTRIES — sanidade do mapeamento', () => {
  it('todos os routeCodes começam com prefixo AUTH_V1_ (catálogo do authenticator)', () => {
    for (const entry of ROUTE_CODE_ENTRIES) {
      expect(entry.routeCode).toMatch(/^AUTH_V1_/);
    }
  });

  it('não há routeCodes duplicados entre patterns', () => {
    const seen = new Set<string>();
    for (const entry of ROUTE_CODE_ENTRIES) {
      expect(seen.has(entry.routeCode)).toBe(false);
      seen.add(entry.routeCode);
    }
  });

  it('não há patterns duplicados', () => {
    const seen = new Set<string>();
    for (const entry of ROUTE_CODE_ENTRIES) {
      expect(seen.has(entry.pattern)).toBe(false);
      seen.add(entry.pattern);
    }
  });
});
