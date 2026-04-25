import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiClient } from '../api';

import type { AuthContextValue, AuthState, LoginResponse } from './types';
import type { ApiClient } from '../api';

/**
 * Estado inicial do Provider antes da hidratação.
 *
 * `isLoading: true` evita flicker — guardas de rota observam `isLoading`
 * para decidir entre splash e redirect-to-login na Epic #44.
 */
const INITIAL_STATE: AuthState = {
  user: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: true,
};

/**
 * Contexto interno. `null` antes do Provider montar — o hook `useAuth`
 * trata o caso e lança erro descritivo.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);
AuthContext.displayName = 'AuthContext';

interface AuthProviderProps {
  children: React.ReactNode;
  /**
   * Cliente HTTP injetável.
   *
   * Em produção usamos o singleton `apiClient`. Testes podem injetar
   * um stub para isolar o Provider da camada de transporte.
   */
  client?: ApiClient;
}

/**
 * Provider que mantém token, usuário e permissões em memória.
 *
 * Decisões importantes:
 *
 * 1. **Token em ref** — não vai para state porque sua mudança não
 *    precisa rerenderizar a árvore; o `apiClient` lê via `getToken()`
 *    a cada requisição.
 * 2. **Sem `useNavigate`** — Provider pode ser montado fora do
 *    `<BrowserRouter>` em testes; redirect em 401 é responsabilidade do
 *    consumidor (componente de guards na Epic #44 #56).
 * 3. **Sem persistência** — token vive apenas em memória nesta Epic;
 *    Epic #44 #53 adicionará localStorage com sincronização entre abas.
 * 4. **Hidratação placeholder** — Epic #44 #54 substituirá pelo
 *    `verify-token`. Aqui apenas finaliza `isLoading: false`.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  client = apiClient,
}) => {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const tokenRef = useRef<string | null>(null);

  /**
   * Limpa estado e token. Centraliza a transição "autenticado →
   * deslogado" para que `logout` e o handler de 401 reusem.
   */
  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setState({
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // Injeta callbacks no cliente HTTP. Reexecuta quando o cliente muda
  // (cenário de teste); em produção, é one-shot.
  useEffect(() => {
    client.setAuth({
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        clearSession();
      },
    });
    return () => {
      // Em desmontagem (HMR/teste), zera callbacks para evitar que o
      // singleton mantenha referência a um Provider extinto.
      client.setAuth({});
    };
  }, [client, clearSession]);

  // Hidratação inicial (placeholder).
  useEffect(() => {
    // TODO Epic #44 #54: substituir por chamada a `verify-token` quando
    // houver token persistido em localStorage.
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState(prev => ({ ...prev, isLoading: true }));
      try {
        const data = await client.post<LoginResponse>('/auth/login', {
          email,
          password,
        });
        tokenRef.current = data.token;
        setState({
          user: data.user,
          permissions: data.permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        setState(prev => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [client],
  );

  const logout = useCallback(async (): Promise<void> => {
    // Epic #44 #55: chamar `POST /auth/logout` antes de limpar localmente
    // (best-effort; falha de rede não impede o clear).
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (code: string): boolean => state.permissions.includes(code),
    [state.permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      permissions: state.permissions,
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      login,
      logout,
      hasPermission,
    }),
    [state, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
