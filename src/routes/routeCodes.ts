import { matchPath } from 'react-router-dom';

/**
 * Mapeamento `path → routeCode` mantido no frontend.
 *
 * Cada entrada pareia o `path` declarado em `src/routes/index.tsx` com o
 * `routeCode` correspondente esperado pelo `lfc-authenticator` no header
 * `X-Route-Code` do `verify-token`.
 *
 * Decisão (Issue #122): preferimos uma tabela local em vez de um
 * endpoint extra (`GET /auth/route-codes`) por dois motivos:
 *
 * 1. Já existe uma tabela equivalente em `RequirePermission` (cada rota
 *    declara seu `permissionCode` hard-coded em `routes/index.tsx`).
 *    Adicionar `routeCode` aqui mantém o padrão.
 * 2. Latência: cada navegação privada já dispara um `verify-token`;
 *    consultar antes um `/auth/route-codes` dobraria o número de
 *    requisições.
 *
 * Limitação: a tabela duplica conhecimento que vive no backend
 * (`auth-service/AuthService/Domain/.../RouteSeeder`). Mudança de
 * `routeCode` no backend exige PR aqui também — o teste de cobertura
 * de rotas (`tests/routes/routeCodes.test.ts`) garante que toda rota
 * privada do `AppRoutes` esteja mapeada.
 *
 * Os `routeCode`s aqui usam o prefixo do sistema `authenticator`
 * (`AUTH_ADMIN_V1_*`). O backend ainda **não cadastra** as rotas do
 * sistema `authenticator` em `_db.Routes` (apenas `kurtto` está
 * seedado), então em runtime o `verify-token` retornará 400
 * `"Rota inválida"` para qualquer `routeCode` daqui — o `AuthContext`
 * trata esse status como falha de rede (não bloqueia o destino) até a
 * issue separada no `lfc-authenticator` cadastrar as rotas.
 */
interface RouteCodeEntry {
  /** `path` exatamente como declarado no `<Route>` (suporta params). */
  pattern: string;
  /** Code esperado pelo backend no header `X-Route-Code`. */
  routeCode: string;
}

/**
 * Tabela de rotas privadas do `AppRoutes`. Ordem importa: padrões mais
 * específicos primeiro (ainda que hoje não haja sobreposição, evita
 * regressão futura ao adicionar rotas com params).
 *
 * Rotas públicas (`/login`, `/error/:code`, `*` 404) NÃO entram aqui —
 * `RequireAuth` é o único call site, e o guard só roda em subárvores
 * privadas.
 */
const ROUTE_CODES: ReadonlyArray<RouteCodeEntry> = [
  { pattern: '/systems', routeCode: 'AUTH_ADMIN_V1_SYSTEMS' },
  { pattern: '/routes', routeCode: 'AUTH_ADMIN_V1_ROUTES' },
  { pattern: '/roles', routeCode: 'AUTH_ADMIN_V1_ROLES' },
  { pattern: '/permissions', routeCode: 'AUTH_ADMIN_V1_PERMISSIONS' },
  { pattern: '/users', routeCode: 'AUTH_ADMIN_V1_USERS' },
  { pattern: '/tokens', routeCode: 'AUTH_ADMIN_V1_TOKENS' },
  { pattern: '/settings', routeCode: 'AUTH_ADMIN_V1_SETTINGS' },
  { pattern: '/showcase', routeCode: 'AUTH_ADMIN_V1_SHOWCASE' },
];

/**
 * Resolve o `routeCode` para um pathname concreto.
 *
 * - Retorna o code mapeado quando o pathname casa com algum `pattern`.
 * - Retorna `null` quando o pathname não corresponde a nenhuma rota
 *   privada conhecida (ex.: `/`, `/login`, `/error/403`, rota
 *   inexistente). O caller (`RequireAuth`) trata `null` como "não
 *   chamar `verify-token`" — o backend rejeitaria com 400
 *   `"Header X-Route-Code é obrigatório."`, e nada se ganharia em
 *   chamar.
 *
 * Uso de `matchPath` (mesmo helper que o `AppLayout` usa para resolver
 * títulos) garante consistência com o roteador.
 */
export function resolveRouteCode(pathname: string): string | null {
  for (const entry of ROUTE_CODES) {
    if (matchPath({ path: entry.pattern, end: false }, pathname)) {
      return entry.routeCode;
    }
  }
  return null;
}

/**
 * Exposto para testes que precisam iterar sobre todas as entradas
 * mapeadas (ex.: garantir que toda rota privada do `AppRoutes` está
 * coberta). Não exportado pelo `index.ts` — uso interno de teste.
 */
export const ROUTE_CODE_ENTRIES = ROUTE_CODES;
