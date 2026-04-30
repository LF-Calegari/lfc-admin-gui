import { vi } from 'vitest';

/**
 * Factory compartilhada do mock de `useAuth` consumido pelas páginas
 * `SystemsPage` (suítes de listagem e criação — Issue #58).
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
 * Extraído para evitar duplicação entre suítes (lição PR #123 — Sonar
 * conta blocos de 10+ linhas como duplicação independente da intenção).
 */
export function buildAuthMock(getPermissions: () => ReadonlyArray<string>): {
  useAuth: () => {
    user: null;
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
      user: null,
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
