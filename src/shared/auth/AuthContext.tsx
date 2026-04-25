import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiClient } from '../api';

import { sessionStorage } from './storage';

import type { AuthContextValue, AuthState, LoginResponse } from './types';
import type { ApiClient } from '../api';

/**
 * Estado inicial usado quando não há sessão persistida.
 *
 * `isLoading: false` aqui — a Issue #53 entrega apenas hidratação
 * síncrona a partir de `localStorage`. A revalidação remota via
 * `verify-token` (Issue #54) é quem voltará a sinalizar `true` durante
 * a checagem inicial.
 */
const UNAUTHENTICATED_STATE: AuthState = {
  user: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: false,
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
 * Provider que mantém token, usuário e permissões.
 *
 * Decisões importantes:
 *
 * 1. **Token em ref** — não vai para state porque sua mudança não
 *    precisa rerenderizar a árvore; o `apiClient` lê via `getToken()`
 *    a cada requisição.
 * 2. **Sem `useNavigate`** — Provider pode ser montado fora do
 *    `<BrowserRouter>` em testes; redirect em 401 é responsabilidade do
 *    consumidor (componente de guards na Epic #44 #56).
 * 3. **Hidratação síncrona via `sessionStorage`** — o `useState` lazy
 *    initializer carrega a sessão de `localStorage` antes do primeiro
 *    render, evitando flash da tela de login ao recarregar a página
 *    (Issue #53). A revalidação remota fica para Issue #54.
 * 4. **Persistência em login feliz** — `sessionStorage.save` é chamado
 *    antes de atualizar o estado, garantindo que mesmo um crash
 *    síncrono entre `save` e `setState` ainda preserve a sessão.
 * 5. **Limpeza tripla** — `clearSession` zera storage, ref e state em
 *    um único ponto, reusado por `logout` e por `onUnauthorized`.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  client = apiClient,
}) => {
  // Hidratação inicial: leitura síncrona em `localStorage`. Se houver
  // sessão válida, montamos já autenticado para evitar flash de redirect
  // para `/login` em rotas protegidas após reload.
  const [state, setState] = useState<AuthState>(() => {
    const persisted = sessionStorage.load();
    if (!persisted) {
      return UNAUTHENTICATED_STATE;
    }
    return {
      user: persisted.user,
      permissions: persisted.permissions,
      isAuthenticated: true,
      isLoading: false,
    };
  });

  // Token também precisa estar disponível no primeiro `getToken()` que o
  // cliente HTTP venha a fazer — por isso lemos novamente o storage no
  // initializer do `useRef`. A leitura é barata (duas chaves) e mantém
  // os dois caminhos (state e ref) consistentes desde o mount.
  const tokenRef = useRef<string | null>(sessionStorage.load()?.token ?? null);

  /**
   * Limpa estado, token e storage. Centraliza a transição
   * "autenticado → deslogado" para que `logout` e o handler de 401
   * reusem exatamente o mesmo passo a passo.
   */
  const clearSession = useCallback(() => {
    tokenRef.current = null;
    sessionStorage.clear();
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

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState(prev => ({ ...prev, isLoading: true }));
      try {
        const data = await client.post<LoginResponse>('/auth/login', {
          email,
          password,
        });
        // Persiste antes de atualizar o estado: assim qualquer falha
        // posterior (ainda que improvável) não deixa a sessão "viva em
        // memória, morta em disco".
        sessionStorage.save({
          token: data.token,
          user: data.user,
          permissions: data.permissions,
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
