import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { apiClient, isApiError } from '../api';

import { AuthSplash } from './AuthSplash';
import { sessionStorage } from './storage';

import type { ApiClient, ApiError } from '../api';
import type {
  AuthContextValue,
  AuthState,
  LoginResponse,
  User,
  VerifyTokenResponse,
} from './types';

/**
 * Estado inicial usado quando não há sessão persistida.
 *
 * `isLoading: false` aqui — sem sessão para revalidar, o app já pode
 * renderizar a tela de login imediatamente. Quando há sessão, o lazy
 * initializer marca `isLoading: true` para sinalizar a revalidação
 * remota em andamento (Issue #54).
 */
const UNAUTHENTICATED_STATE: AuthState = {
  user: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: false,
};

/**
 * Default do intervalo de revalidação periódica em milissegundos.
 *
 * Resolvido a partir de `VITE_AUTH_VERIFY_INTERVAL_MS`; quando ausente,
 * inválido ou não-numérico, cai em 5 minutos — equilíbrio entre detectar
 * revogações server-side rapidamente e não saturar o backend.
 */
const DEFAULT_VERIFY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Resolve o intervalo de revalidação a partir de variável de ambiente.
 *
 * - `0` (string ou número) → desativa a revalidação periódica;
 * - valores não numéricos / negativos → cai no default;
 * - valores muito pequenos (< 1000 ms) → cai no default para evitar
 *   loops abusivos por configuração equivocada.
 */
function resolveVerifyInterval(): number {
  const raw: unknown = import.meta.env.VITE_AUTH_VERIFY_INTERVAL_MS;
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_VERIFY_INTERVAL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_VERIFY_INTERVAL_MS;
  }
  if (parsed === 0) {
    return 0;
  }
  if (parsed < 1000) {
    return DEFAULT_VERIFY_INTERVAL_MS;
  }
  return parsed;
}

/**
 * Type guard mínimo para o payload do endpoint `verify-token`.
 *
 * O contrato real do `auth-service` é achatado: `{ id, name, email,
 * identity, permissions: Guid[], permissionCodes: string[],
 * routeCodes: string[] }`. Validamos os campos essenciais (`id`,
 * `name`, `email` strings; `identity` numérico; `permissionCodes` e
 * `routeCodes` arrays) antes de o Provider confiar no payload — defesa
 * contra resposta corrompida em proxies intermediários ou divergência
 * silenciosa de versão entre frontend/backend.
 *
 * `permissions` (GUIDs) também é exigido como array para manter simetria
 * com o backend, mas o Provider nunca consome diretamente — o catálogo
 * que alimenta `hasPermission()` é `permissionCodes` (ex.:
 * `perm:Systems.Read`). Cada item de `permissionCodes` deve ser string
 * para evitar que entradas corrompidas escapem para `state.permissions`.
 */
function isValidVerifyTokenResponse(value: unknown): value is VerifyTokenResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.permissions)) {
    return false;
  }
  if (!Array.isArray(record.permissionCodes)) {
    return false;
  }
  if (!record.permissionCodes.every(item => typeof item === 'string')) {
    return false;
  }
  if (!Array.isArray(record.routeCodes)) {
    return false;
  }
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.email === 'string' &&
    typeof record.identity === 'number'
  );
}

/**
 * Extrai o subset de campos do `VerifyTokenResponse` que compõem o
 * `User` exposto pela aplicação.
 *
 * Centralizar a projeção evita divergência entre os call sites (login e
 * hidratação remota): qualquer mudança no contrato de `User` fica em um
 * único lugar.
 */
function toUser(payload: VerifyTokenResponse): User {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    identity: payload.identity,
  };
}

/**
 * Distingue erro 401 (token inválido/expirado) de qualquer outra falha.
 *
 * Em 401 o cliente HTTP já dispara `onUnauthorized` (limpa sessão); o
 * Provider apenas precisa saber se deve manter a sessão local em pé
 * (qualquer outro erro, especialmente `network`).
 */
function isUnauthorizedError(error: unknown): boolean {
  if (!isApiError(error)) {
    return false;
  }
  const httpError = error as ApiError;
  return httpError.kind === 'http' && httpError.status === 401;
}

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
  /**
   * Override do intervalo (ms) entre revalidações periódicas.
   *
   * Útil em testes que precisam acionar o tick manualmente via fake
   * timers. Em produção o valor vem de `VITE_AUTH_VERIFY_INTERVAL_MS`.
   *
   * Passar `0` desativa a revalidação periódica (a hidratação inicial
   * continua acontecendo).
   */
  verifyIntervalMs?: number;
  /**
   * Override do componente de splash. Default: `<AuthSplash />`. Testes
   * podem injetar um placeholder para asserir o estado de carregamento
   * sem montar o componente visual completo.
   */
  splash?: React.ReactNode;
  /**
   * Quando `true`, renderiza `children` mesmo durante a hidratação
   * inicial (splash desativada). Útil para testes que precisam observar
   * o `useAuth()` enquanto `isLoading` ainda é `true` — em produção fica
   * sempre `false`.
   */
  disableSplash?: boolean;
}

/**
 * Provider que mantém token, usuário e permissões.
 *
 * Decisões importantes:
 *
 * 1. **Token em ref** — não vai para state porque sua mudança não
 *    precisa rerenderizar a árvore; o `apiClient` lê via `getToken()`
 *    a cada requisição.
 * 2. **Hidratação otimista + revalidação remota** — Issue #54: o
 *    `useState` lazy initializer carrega a sessão de `localStorage` e
 *    marca `isLoading: true` quando há sessão (vai revalidar). O
 *    `useEffect` chama `GET /auth/verify-token` e atualiza `user` +
 *    `permissions` com o snapshot atual do backend, capturando mudanças
 *    server-side (role removida, permissão revogada) sem novo login.
 * 3. **Splash durante hidratação inicial** — `isLoading: true` faz o
 *    Provider renderizar `<AuthSplash />` em vez de `children`, evitando
 *    flicker de UI semi-autenticada antes da revalidação.
 * 4. **Tolerância a falha de rede** — quando o `verify-token` falha por
 *    `network`/`parse`, mantemos a sessão local; o próximo tick tentará
 *    novamente. Apenas 401 desautentica (via `onUnauthorized` do client).
 * 5. **Revalidação periódica configurável** — `setInterval` com
 *    intervalo de `VITE_AUTH_VERIFY_INTERVAL_MS` (default 5 min). O
 *    cleanup do `useEffect` cancela o timer no unmount; um
 *    `AbortController` cancela a requisição em voo se o Provider
 *    desmontar antes da resposta.
 * 6. **Redirect em 401 via `useNavigate`** — quando a sessão é limpa
 *    pelo handler de 401, navegamos para `/login` preservando a rota
 *    de origem. Curto-circuito em `/login` evita loop.
 * 7. **Persistência em login feliz** — `sessionStorage.save` é chamado
 *    antes de atualizar o estado, garantindo que mesmo um crash
 *    síncrono entre `save` e `setState` ainda preserve a sessão.
 * 8. **Limpeza tripla** — `clearSession` zera storage, ref e state em
 *    um único ponto, reusado por `logout`, `onUnauthorized` e por
 *    falhas pós-login (`verify-token` rejeitou após token aceito).
 * 9. **Login encadeado (POST /auth/login → GET /auth/verify-token)** —
 *    o backend retorna apenas `{ token }` no login; o perfil e o
 *    catálogo `permissionCodes` vêm em `verify-token`. Setamos
 *    `tokenRef` entre as duas chamadas porque o cliente HTTP precisa
 *    do header `Authorization` para a segunda. Falha entre as duas
 *    (rede, 401, payload inválido) limpa a sessão parcial via
 *    `clearSession`.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  client = apiClient,
  verifyIntervalMs,
  splash,
  disableSplash = false,
}) => {
  const navigate = useNavigate();

  // Hidratação inicial: leitura síncrona em `localStorage`. Se houver
  // sessão válida, montamos já autenticado para evitar flash de redirect
  // para `/login` em rotas protegidas após reload — porém com
  // `isLoading: true` para sinalizar que uma revalidação remota está
  // em curso (Issue #54).
  const [state, setState] = useState<AuthState>(() => {
    const persisted = sessionStorage.load();
    if (!persisted) {
      return UNAUTHENTICATED_STATE;
    }
    return {
      user: persisted.user,
      permissions: persisted.permissions,
      isAuthenticated: true,
      isLoading: true,
    };
  });

  // Token também precisa estar disponível no primeiro `getToken()` que o
  // cliente HTTP venha a fazer — por isso lemos novamente o storage no
  // initializer do `useRef`. A leitura é barata (duas chaves) e mantém
  // os dois caminhos (state e ref) consistentes desde o mount.
  const tokenRef = useRef<string | null>(sessionStorage.load()?.token ?? null);

  // `wasAuthenticated` permite ao callback `onUnauthorized` decidir se
  // deve disparar a navegação para `/login`. Sem isso, um 401 "limpando
  // estado já vazio" navegaria desnecessariamente.
  const wasAuthenticatedRef = useRef<boolean>(state.isAuthenticated);
  useEffect(() => {
    wasAuthenticatedRef.current = state.isAuthenticated;
  }, [state.isAuthenticated]);

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

  /**
   * Redireciona para `/login` quando o usuário está em rota privada e
   * acaba de perder a sessão. Curto-circuito em `/login` evita loop.
   *
   * Tolerante a `useNavigate` ausente (cenários onde o Provider é usado
   * em ambiente sem Router — futuro, hoje sempre dentro de BrowserRouter).
   */
  const redirectToLogin = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/login') return;
    try {
      navigate('/login', { replace: true });
    } catch {
      // Em ambientes sem Router context, `navigate` lança — degradamos
      // graciosamente para `window.location` como fallback.
      window.location.assign('/login');
    }
  }, [navigate]);

  // Injeta callbacks no cliente HTTP. Reexecuta quando o cliente muda
  // (cenário de teste); em produção, é one-shot.
  useEffect(() => {
    client.setAuth({
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        const wasAuthenticated = wasAuthenticatedRef.current;
        clearSession();
        if (wasAuthenticated) {
          redirectToLogin();
        }
      },
    });
    return () => {
      // Em desmontagem (HMR/teste), zera callbacks para evitar que o
      // singleton mantenha referência a um Provider extinto.
      client.setAuth({});
    };
  }, [client, clearSession, redirectToLogin]);

  /**
   * Hidratação remota + revalidação periódica.
   *
   * Disparada uma vez no mount; quando há sessão local, chama
   * `verify-token`. Em sucesso, sincroniza `user` + `permissions` com
   * o snapshot atual do backend e marca `isLoading: false`. Em erro
   * 401, o handler do cliente já limpou a sessão; em outros erros
   * (rede/parse), mantemos a sessão local e seguimos.
   *
   * O `setInterval` aqui executa o mesmo `verify-token` periodicamente
   * para refletir mudanças server-side (role atualizada, permissões
   * revogadas) sem novo login. O intervalo é configurável via prop
   * `verifyIntervalMs` (testes) ou env `VITE_AUTH_VERIFY_INTERVAL_MS`
   * (produção). Passar `0` desativa o intervalo, mas a hidratação
   * inicial sempre acontece.
   */
  useEffect(() => {
    let cancelled = false;
    const controllers = new Set<AbortController>();

    const performVerify = async (): Promise<void> => {
      if (!tokenRef.current) {
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const data = await client.get<VerifyTokenResponse>(
          '/auth/verify-token',
          { signal: controller.signal },
        );
        if (cancelled) return;
        if (!isValidVerifyTokenResponse(data)) {
          // Resposta com shape inesperado: não desautenticamos por
          // segurança — mantemos a sessão local para o tick seguinte
          // tentar novamente. Apenas saímos de `isLoading` para a UI
          // não ficar travada na splash.
          setState(prev =>
            prev.isLoading ? { ...prev, isLoading: false } : prev,
          );
          return;
        }
        // Projeta o payload achatado em `User` e usa `permissionCodes`
        // (e não `permissions`/GUIDs nem `routeCodes`) como catálogo
        // consumido por `hasPermission()`. Persiste antes de setState
        // pelos mesmos motivos do `login`.
        const user = toUser(data);
        const permissions = data.permissionCodes;
        sessionStorage.save({
          token: tokenRef.current,
          user,
          permissions,
        });
        setState({
          user,
          permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorizedError(error)) {
          // O cliente HTTP já chamou `onUnauthorized` → sessão limpa.
          // Aqui só precisamos garantir que `isLoading` saia de `true`.
          // (O `clearSession` já fez isso, mas reforçamos contra
          // ordens de set-state diferentes em corner cases de teste.)
          return;
        }
        // Falha de rede / parse / 5xx: mantém sessão local. Logamos
        // um warning para diagnóstico, sem expor detalhes sensíveis.
        // eslint-disable-next-line no-console
        console.warn('[auth] verify-token falhou; mantendo sessão local até próxima revalidação.');
        setState(prev =>
          prev.isLoading ? { ...prev, isLoading: false } : prev,
        );
      } finally {
        controllers.delete(controller);
      }
    };

    // Hidratação inicial: dispara imediatamente quando há token.
    if (tokenRef.current) {
      void performVerify();
    } else {
      // Sem sessão local: garante isLoading=false (já é o padrão, mas
      // protege contra mudanças futuras no initializer).
      setState(prev =>
        prev.isLoading ? { ...prev, isLoading: false } : prev,
      );
    }

    // Revalidação periódica.
    const interval =
      typeof verifyIntervalMs === 'number'
        ? verifyIntervalMs
        : resolveVerifyInterval();
    let timer: ReturnType<typeof setInterval> | null = null;
    if (interval > 0) {
      timer = setInterval(() => {
        if (tokenRef.current) {
          void performVerify();
        }
      }, interval);
    }

    return () => {
      cancelled = true;
      if (timer !== null) {
        clearInterval(timer);
      }
      // Cancela requisições em voo para não chamar setState após unmount.
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
    // `client` e `verifyIntervalMs` são as dependências reais; demais
    // setters/refs são estáveis. Não incluímos `clearSession` porque o
    // path 401 é gerenciado pelo `onUnauthorized` do cliente HTTP.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, verifyIntervalMs]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState(prev => ({ ...prev, isLoading: true }));
      // `tokenAcquired` distingue falhas pré-token (login) de falhas
      // pós-token (verify-token): o cleanup do segundo caso precisa
      // limpar `tokenRef`/storage para não deixar a aplicação com
      // token "vivo em memória" sem perfil correspondente.
      let tokenAcquired = false;
      try {
        const loginData = await client.post<LoginResponse>('/auth/login', {
          email,
          password,
        });
        // Setar `tokenRef` ANTES do verify é crítico: o cliente HTTP
        // injeta `Authorization: Bearer ${getToken()}` lendo a ref a
        // cada requisição. Sem isso, o `verify-token` sai sem header
        // de autenticação e o backend responde 401.
        tokenRef.current = loginData.token;
        tokenAcquired = true;

        const verifyData = await client.get<VerifyTokenResponse>(
          '/auth/verify-token',
        );
        if (!isValidVerifyTokenResponse(verifyData)) {
          // Backend respondeu 200 mas com payload inesperado. Tratamos
          // como falha pós-login: zera token e propaga erro tipado para
          // a UI exibir mensagem genérica.
          throw {
            kind: 'parse',
            message: 'Resposta inválida do servidor.',
          } satisfies ApiError;
        }

        const user = toUser(verifyData);
        const permissions = verifyData.permissionCodes;

        // Persiste antes de atualizar o estado: assim qualquer falha
        // posterior (ainda que improvável) não deixa a sessão "viva em
        // memória, morta em disco".
        sessionStorage.save({
          token: loginData.token,
          user,
          permissions,
        });
        setState({
          user,
          permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        // Falha pós-login (verify-token rejeitou ou payload inválido):
        // o token já foi setado em `tokenRef`, então precisamos limpar
        // tudo via `clearSession` para não deixar header `Authorization`
        // pendurado em chamadas seguintes.
        //
        // Falha pré-login (credenciais inválidas, rede): `tokenRef`
        // ainda é `null`/o valor anterior, basta sair de `isLoading`.
        // Em ambos os casos, o erro é re-lançado para o caller decidir
        // a apresentação.
        if (tokenAcquired) {
          clearSession();
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
        throw error;
      }
    },
    [client, clearSession],
  );

  const logout = useCallback(async (): Promise<void> => {
    // Issue #55: notifica o backend para incrementar `tokenVersion`,
    // invalidando todos os JWTs emitidos antes — o `auth-service` expõe
    // `GET /api/v1/auth/logout` (com `Authorization: Bearer`).
    //
    // A chamada é best-effort: falha de rede ou 401 (já deslogado de
    // qualquer forma) não impede a limpeza local. O usuário pediu
    // logout; o estado local sempre cai. Errar no remoto e manter sessão
    // local presa é UX inaceitável.
    //
    // O `clearSession` zera ref, storage e state em uma única passagem,
    // e o `redirectToLogin` cobre o critério "em qualquer caso,
    // redireciona para /login" (Issue #55). Curto-circuitamos em
    // `/login` lá dentro para não fazer push redundante.
    if (tokenRef.current) {
      try {
        await client.get('/auth/logout');
      } catch (error) {
        if (!isUnauthorizedError(error)) {
          // Falha de rede ou 5xx — apenas logamos um warning para
          // diagnóstico. Não expomos `error` em console para evitar
          // vazar metadados de request em logs do navegador.
          // eslint-disable-next-line no-console
          console.warn('[auth] logout remoto falhou; sessão local foi encerrada.');
        }
      }
    }
    clearSession();
    redirectToLogin();
  }, [client, clearSession, redirectToLogin]);

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

  // Splash apenas durante a hidratação inicial (sessão local +
  // revalidação remota em curso). Em revalidações periódicas
  // posteriores, `isLoading` permanece `false` para não esconder a UI.
  const showSplash = state.isLoading && state.isAuthenticated && !disableSplash;

  return (
    <AuthContext.Provider value={value}>
      {showSplash ? (splash ?? <AuthSplash />) : children}
    </AuthContext.Provider>
  );
};
