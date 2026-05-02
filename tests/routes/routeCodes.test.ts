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
  // Issue #62: a listagem real de rotas vive em `/systems/:id/routes` e
  // resolve para `AUTH_V1_SYSTEMS_ROUTES_LIST`. A ordem da tabela em
  // `routeCodes.ts` garante que esse pattern, mais específico, tenha
  // prioridade sobre `/systems` no `matchPath`.
  {
    pathname: '/systems/11111111-1111-1111-1111-111111111111/routes',
    expected: 'AUTH_V1_SYSTEMS_ROUTES_LIST',
  },
  // Issue #66: a listagem real de roles vive em `/systems/:id/roles` e
  // resolve para `AUTH_V1_ROLES_LIST`. Mesma ordem importa — pattern
  // mais específico vence `/systems` no `matchPath`.
  {
    pathname: '/systems/11111111-1111-1111-1111-111111111111/roles',
    expected: 'AUTH_V1_ROLES_LIST',
  },
  // Issue #69: associar permissões a uma role específica do sistema.
  // Sub-rota mais específica vence `/systems/:id/roles` no `matchPath`
  // — backend exige policy `RolesUpdate`, code `AUTH_V1_ROLES_UPDATE`.
  {
    pathname:
      '/systems/11111111-1111-1111-1111-111111111111/roles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/permissoes',
    expected: 'AUTH_V1_ROLES_UPDATE',
  },
  // Issue #145: rotas em PT introduzidas pelas EPICs #48/#49.
  { pathname: '/permissoes', expected: 'AUTH_V1_PERMISSIONS_LIST' },
  { pathname: '/clientes', expected: 'AUTH_V1_CLIENTS_LIST' },
  { pathname: '/clientes/42', expected: 'AUTH_V1_CLIENTS_GET_BY_ID' },
  { pathname: '/usuarios', expected: 'AUTH_V1_USERS_LIST' },
  { pathname: '/usuarios/42', expected: 'AUTH_V1_USERS_GET_BY_ID' },
  { pathname: '/usuarios/42/permissoes', expected: 'AUTH_V1_USERS_PERMISSIONS_ASSIGN' },
  { pathname: '/tokens', expected: 'AUTH_V1_TOKEN_TYPES_LIST' },
];

/**
 * `/settings` e `/showcase` não têm rota equivalente cadastrada no
 * `AuthenticatorRoutesSeeder` — `resolveRouteCode` devolve `null` e o
 * `RequireAuth` pula a chamada de `verify-token`. Incluímos também
 * `/routes` (Issue #62) e `/roles` (Issue #66): as páginas globais
 * continuam no `AppRoutes` como placeholders gated apenas client-side,
 * sem entrada própria nesta tabela — as listagens reais vivem em
 * `/systems/:id/routes` e `/systems/:id/roles`.
 */
const NEGATIVE_CASES: ReadonlyArray<string> = [
  '/',
  '/login',
  '/error/403',
  '/error/404',
  '/rota-inexistente',
  '/settings',
  '/showcase',
  '/routes',
  '/roles',
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
    // Sub-rota mais específica vence: edição é resolvida pelo
    // `:id` antes do `/usuarios` cair no LIST.
    expect(resolveRouteCode('/usuarios/42/edit')).toBe('AUTH_V1_USERS_GET_BY_ID');
  });

  it('precedência: /usuarios/:id/permissoes vence /usuarios/:id e /usuarios', () => {
    // A ordem em ROUTE_CODE_ENTRIES coloca o pattern mais específico
    // primeiro — a primeira correspondência ganha, então a sub-rota
    // de atribuição direta de permissões deve resolver corretamente
    // mesmo que `/usuarios` e `/usuarios/:id` também sejam possíveis
    // matches sob `end: false`.
    expect(resolveRouteCode('/usuarios/42/permissoes')).toBe(
      'AUTH_V1_USERS_PERMISSIONS_ASSIGN',
    );
  });

  it('precedência: /systems/:id/roles/:roleId/permissoes vence /systems/:id/roles', () => {
    // Issue #69 — a tela de associação de permissões a uma role
    // específica precisa vencer a listagem de roles do sistema. A
    // ordem em `ROUTE_CODE_ENTRIES` coloca o pattern mais específico
    // primeiro; sem isso, `matchPath({ end: false })` casaria com
    // `/systems/:id/roles` antes e a UI bateria em `verify-token`
    // com o code de listagem (e o backend negaria 401/403 já que o
    // recurso real é o assign).
    expect(
      resolveRouteCode(
        '/systems/11111111-1111-1111-1111-111111111111/roles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/permissoes',
      ),
    ).toBe('AUTH_V1_ROLES_UPDATE');
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
