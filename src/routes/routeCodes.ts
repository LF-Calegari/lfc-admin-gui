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
 * Os codes aqui são os mesmos cadastrados pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator` (prefixo
 * `AUTH_V1_*`). Cada página privada navega via o code de "list" do
 * recurso correspondente — o backend consolidou permissões e rotas em
 * um único catálogo, então o `X-Route-Code` é o mesmo code consultado
 * em `hasPermission` no gating cliente.
 *
 * Páginas sem mapeamento (ex.: `/settings`, `/showcase`) não disparam
 * `verify-token` — `resolveRouteCode` devolve `null` e o `RequireAuth`
 * pula a chamada para evitar 400 `"Rota inválida"` do backend.
 *
 * Convenção de naming (Issue #145): rotas em português (`/clientes`,
 * `/usuarios`, `/permissoes`) representam as seções introduzidas
 * pelas EPICs #48/#49; rotas anteriores em inglês permanecem para não
 * estourar o escopo da issue.
 */
interface RouteCodeEntry {
  /** `path` exatamente como declarado no `<Route>` (suporta params). */
  pattern: string;
  /** Code esperado pelo backend no header `X-Route-Code`. */
  routeCode: string;
}

/**
 * Tabela de rotas privadas do `AppRoutes`. Ordem importa: padrões mais
 * específicos primeiro para que `matchPath({ end: false })` resolva
 * `/usuarios/:id/permissoes` para `AUTH_V1_USERS_PERMISSIONS_ASSIGN`
 * antes de cair em `/usuarios/:id`.
 *
 * Rotas públicas (`/login`, `/error/:code`, `*` 404) NÃO entram aqui —
 * `RequireAuth` é o único call site, e o guard só roda em subárvores
 * privadas.
 */
const ROUTE_CODES: ReadonlyArray<RouteCodeEntry> = [
  // Issue #62 (EPIC #46): listagem de rotas escopada a um sistema.
  // O `/systems/:id/routes` é o caminho real cadastrado no
  // `AuthenticatorRoutesSeeder` para `AUTH_V1_SYSTEMS_ROUTES_LIST`. A
  // página global `/routes` é placeholder herdado da fundação (#43) e
  // será desativada quando a EPIC #46 concluir; até lá ela continua no
  // `AppRoutes` gated apenas pelo `RequirePermission` client-side, sem
  // entrada própria nesta tabela — `resolveRouteCode('/routes')`
  // devolve `null` e o `RequireAuth` pula o `verify-token`. Isso é
  // intencional para preservar o invariante "um routeCode por linha"
  // exigido pelos testes de sanidade.
  { pattern: '/systems/:id/routes', routeCode: 'AUTH_V1_SYSTEMS_ROUTES_LIST' },
  // Issue #66 (EPIC #47): listagem de roles escopada a um sistema.
  // Mesma decisão da Issue #62 — `/systems/:id/roles` é o caminho
  // canônico cadastrado pelo `AuthenticatorRoutesSeeder` para
  // `AUTH_V1_ROLES_LIST`. A página global `/roles` é placeholder
  // herdado da fundação (#43) e fica fora desta tabela enquanto
  // existir, para preservar o invariante "um routeCode por linha"
  // exigido pelos testes de sanidade — `resolveRouteCode('/roles')`
  // devolve `null` e o `RequireAuth` pula o `verify-token`. O
  // ordenamento garante que `/systems/:id/roles` vença `/systems`
  // no `matchPath` (mesmo motivo da regra de routes).
  { pattern: '/systems/:id/roles', routeCode: 'AUTH_V1_ROLES_LIST' },
  { pattern: '/systems', routeCode: 'AUTH_V1_SYSTEMS_LIST' },
  // Issue #145: rotas em português introduzidas pelas EPICs #48
  // (Permissões) e #49 (Clientes/Usuários). Sub-rotas mais específicas
  // precedem as listagens — `/usuarios/:id/permissoes` precisa vencer
  // `/usuarios/:id` no `matchPath`. As páginas globais `/permissoes`
  // (vista global) e `/clientes`/`/usuarios` mantêm seus próprios codes
  // de "list" porque, ao contrário de `/routes`/`/roles` (placeholders
  // sem rota canônica), as 3 novas seções têm rotas concretas
  // cadastradas no `AuthenticatorRoutesSeeder` e estão no escopo
  // ativo das EPICs.
  { pattern: '/permissoes', routeCode: 'AUTH_V1_PERMISSIONS_LIST' },
  { pattern: '/usuarios/:id/permissoes', routeCode: 'AUTH_V1_USERS_PERMISSIONS_ASSIGN' },
  { pattern: '/usuarios/:id', routeCode: 'AUTH_V1_USERS_GET_BY_ID' },
  { pattern: '/usuarios', routeCode: 'AUTH_V1_USERS_LIST' },
  { pattern: '/clientes/:id', routeCode: 'AUTH_V1_CLIENTS_GET_BY_ID' },
  { pattern: '/clientes', routeCode: 'AUTH_V1_CLIENTS_LIST' },
  { pattern: '/tokens', routeCode: 'AUTH_V1_TOKEN_TYPES_LIST' },
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
 * títulos) garante consistência com o roteador. `end: false` aceita
 * subpaths — útil para que `/usuarios/42/edit` (futura sub-rota) caia
 * no code de "list" enquanto não houver sub-rota mais específica
 * cadastrada acima.
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
