import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Shape mínimo do `User` consumido por componentes que diferenciam o
 * usuário corrente (ex.: `UsersListShellPage` na Issue #82, que esconde
 * a ação "Forçar logout" na própria linha). Espelha o `User` de
 * `@/shared/auth/types` mas mantemos local para não acoplar testes ao
 * shape exato (basta `id` para os cenários atuais).
 */
export interface MockAuthUser {
  id: string;
  name: string;
  email: string;
  identity: number;
}

/**
 * Factory compartilhada do mock de `useAuth` consumido pelas páginas
 * (`SystemsPage`, `UsersListShellPage`, etc.) durante os testes.
 *
 * Como `vi.mock` é içado pelo Vitest **antes** dos imports do módulo de
 * teste, não é possível passar valores mutáveis diretamente para a
 * factory de `vi.mock`. O padrão suportado é receber um *getter*:
 *
 * ```ts
 * import { vi } from 'vitest';
 * import { buildAuthMock } from './__helpers__/mockUseAuth';
 *
 * let permissionsRef: ReadonlyArray<string> = [];
 * vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsRef));
 *
 * // ... cada teste atualiza `permissionsRef` antes de renderizar.
 * ```
 *
 * O getter é avaliado a cada chamada de `useAuth()` / `hasPermission()`
 * dentro do componente — garantindo que os testes possam alternar
 * permissões dentro da mesma suíte sem reordenar imports.
 *
 * **Issue #82:** acrescentamos um segundo getter opcional (`getUser`)
 * para que componentes que diferenciam o usuário corrente (ex.:
 * gating de "Forçar logout" — Issue #82, esconde a ação na linha do
 * próprio operador para evitar 400 self-target do backend) possam
 * exercitar o cenário sem reescrever o mock global. Quando ausente, o
 * default permanece `user: null` (compatível com os call sites
 * existentes — sistemas, rotas, roles, clients, e demais suítes de
 * users que não exercem o gating).
 *
 * Extraído para evitar duplicação entre suítes (lição PR #123 — Sonar
 * conta blocos de 10+ linhas como duplicação independente da intenção).
 */
export function buildAuthMock(
  getPermissions: () => ReadonlyArray<string>,
  getUser?: () => MockAuthUser | null,
): {
  useAuth: () => {
    user: MockAuthUser | null;
    permissions: ReadonlyArray<string>;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    hasPermission: (code: string) => boolean;
    verifyRoute: ReturnType<typeof vi.fn>;
  };
} {
  return {
    useAuth: () => ({
      user: getUser ? getUser() : null,
      permissions: getPermissions(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasPermission: (code: string) => getPermissions().includes(code),
      verifyRoute: vi.fn().mockResolvedValue(true),
    }),
  };
}

/**
 * Setup `beforeEach`/`afterEach` que zera/restaura mocks entre
 * testes — concentra o boilerplate `permissionsMock = [...]; vi.
 * restoreAllMocks();` que se repetia em cada suíte de teste das
 * abas de cliente (`ClientDataTab.test.tsx`,
 * `ClientExtraEmailsTab.test.tsx`).
 *
 * O caller declara `let permissionsMock` e o `vi.mock` no escopo do
 * próprio arquivo (Vitest exige que `vi.mock` seja estático), mas
 * delega o reset/restore a este helper passando o setter da
 * variável. Mantém o boilerplate enxuto e previne `New Code
 * Duplication` no JSCPD/Sonar (lição PR #134/#135).
 *
 * Uso:
 *
 * ```ts
 * let permissionsMock: ReadonlyArray<string> = [];
 * vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));
 * setupPermissionLifecycle((perms) => { permissionsMock = perms; },
 *   ['AUTH_V1_CLIENTS_UPDATE']);
 * ```
 */
export function setupPermissionLifecycle(
  setPermissions: (perms: ReadonlyArray<string>) => void,
  defaultPermissions: ReadonlyArray<string>,
): void {
  beforeEach(() => {
    setPermissions(defaultPermissions);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
