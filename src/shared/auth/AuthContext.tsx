import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { resolveRouteCode } from '../../routes/routeCodes';
import { apiClient, isApiError } from '../api';

import { AuthSplash } from './AuthSplash';
import { permissionsCache } from './permissionsCache';
import { tokenStorage } from './storage';

import type { ApiClient, ApiError } from '../api';
import type {
  AuthContextValue,
  AuthState,
  LoginResponse,
  PermissionsResponse,
  User,
  VerifyTokenResponse,
} from './types';

/**
 * Estado inicial usado quando não há sessão persistida.
 *
 * `isLoading: false` aqui — sem token para revalidar, o app já pode
 * renderizar a tela de login imediatamente. Quando há token, o
 * `useEffect` de hidratação marca `isLoading: true` para sinalizar que
 * o catálogo está sendo carregado de IndexedDB ou refeito via
 * `GET /auth/permissions`.
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
 * Type guard mínimo para o payload reduzido do `verify-token`.
 *
 * O contrato novo é apenas `{ valid, issuedAt, expiresAt }`. Validar
 * antes de confiar no payload protege contra divergência silenciosa
 * de versão entre frontend e backend (proxy intermediário cortando
 * campos, deploy desalinhado).
 */
function isValidVerifyTokenResponse(value: unknown): value is VerifyTokenResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.valid === 'boolean' &&
    typeof record.issuedAt === 'string' &&
    typeof record.expiresAt === 'string'
  );
}

/**
 * Type guard para `GET /auth/permissions`.
 *
 * O endpoint novo carrega `user`, `permissions` (GUIDs),
 * `permissionCodes` e `routeCodes`. Garantimos shape mínimo antes de
 * persistir no cache para evitar gravar lixo em IndexedDB.
 */
function isValidPermissionsResponse(value: unknown): value is PermissionsResponse {
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
  if (!record.user || typeof record.user !== 'object') {
    return false;
  }
  const user = record.user as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    typeof user.identity === 'number'
  );
}

/**
 * Extrai o subset de campos do `PermissionsResponse` que compõem o
 * `User` exposto pela aplicação.
 *
 * Centralizar a projeção evita divergência entre os call sites (login
 * e hidratação remota): qualquer mudança no contrato de `User` fica em
 * um único lugar.
 */
function toUser(payload: PermissionsResponse): User {
  return {
    id: payload.user.id,
    name: payload.user.name,
    email: payload.user.email,
    identity: payload.user.identity,
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
 * Distingue erro 403 (autorizado mas sem direito à rota).
 *
 * No novo contrato (`lfc-authenticator#148`), o `verify-token`
 * responde 403 quando o token é válido mas o usuário não tem
 * `routeCode` autorizado. Tratamos como redirect para `/error/403`
 * preservando `state.from`.
 */
function isForbiddenError(error: unknown): boolean {
  if (!isApiError(error)) {
    return false;
  }
  const httpError = error as ApiError;
  return httpError.kind === 'http' && httpError.status === 403;
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
 * Decisões importantes (Issue #122):
 *
 * 1. **Token em ref, catálogo em state** — token via `tokenStorage`
 *    (`localStorage`, leitura síncrona) para o cliente HTTP injetar
 *    `Authorization` na primeira requisição; catálogo via
 *    `permissionsCache` (IndexedDB, leitura assíncrona) para hidratar
 *    o estado depois.
 * 2. **Hidratação otimista + revalidação remota** — o `useState` lazy
 *    inicializa com token de `tokenStorage`. O `useEffect` de
 *    hidratação carrega o catálogo do IndexedDB; se vazio, dispara
 *    `GET /auth/permissions`. Em paralelo, dispara o `verify-token`
 *    para a rota corrente.
 * 3. **`verify-token` reduzido** — payload novo é `{ valid, issuedAt,
 *    expiresAt }`. Não re-hidrata user/permissions; serve apenas como
 *    sinal de validade do token + autorização da rota corrente.
 * 4. **`X-Route-Code` em todo verify-token** — header obrigatório no
 *    novo contrato. Resolvido pelo caller (login/hidratação periódica
 *    usa rota corrente; navegação usa rota destino via `verifyRoute`).
 * 5. **Tolerância a falha de rede** — quando `verify-token` falha por
 *    `network`/`parse`/`5xx`, mantemos a sessão local; o próximo tick
 *    tentará novamente. Apenas 401 desautentica (via `onUnauthorized`
 *    do client). 403 redireciona para `/error/403` preservando
 *    `state.from`.
 * 6. **Revalidação periódica configurável** — `setInterval` com
 *    intervalo de `VITE_AUTH_VERIFY_INTERVAL_MS` (default 5 min). O
 *    cleanup do `useEffect` cancela o timer no unmount; um
 *    `AbortController` cancela a requisição em voo se o Provider
 *    desmontar antes da resposta.
 * 7. **Login encadeado (POST /auth/login → GET /auth/permissions)** —
 *    o backend retorna apenas `{ token }` no login; o perfil e os
 *    catálogos vêm em `/auth/permissions`. Setamos `tokenRef` entre
 *    as duas chamadas porque o cliente HTTP precisa do header
 *    `Authorization` para a segunda. Falha entre as duas (rede, 401,
 *    payload inválido) limpa a sessão parcial via `clearSession`.
 * 8. **Migração de chaves antigas** — no boot, `tokenStorage
 *    .clearLegacyKeys()` remove `lfc-admin-auth-user` (Issue #53)
 *    para não deixar dado morto.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  client = apiClient,
  verifyIntervalMs,
  splash,
  disableSplash = false,
}) => {
  const navigate = useNavigate();

  // Migração de chaves legadas (Issue #122): roda exatamente uma vez
  // por mount do Provider. `useState` com inicializador lazy garante
  // execução em uma passagem síncrona antes do primeiro render, sem
  // dependência de `useEffect` (evita race com a hidratação que lê
  // `tokenStorage` no mesmo tick).
  useState(() => {
    tokenStorage.clearLegacyKeys();
    return null;
  });

  // Hidratação inicial: leitura síncrona do token em `localStorage`. Se
  // houver token, montamos já autenticado para evitar flash de redirect
  // para `/login` em rotas protegidas após reload — porém com
  // `isLoading: true` para sinalizar que catálogo + verify-token estão
  // em curso.
  const [state, setState] = useState<AuthState>(() => {
    const token = tokenStorage.load();
    if (!token) {
      return UNAUTHENTICATED_STATE;
    }
    return {
      user: null,
      permissions: [],
      isAuthenticated: true,
      isLoading: true,
    };
  });

  // Token também precisa estar disponível no primeiro `getToken()` que o
  // cliente HTTP venha a fazer — por isso lemos novamente `tokenStorage`
  // no initializer do `useRef`. A leitura é barata (uma chave) e mantém
  // os dois caminhos (state e ref) consistentes desde o mount.
  const tokenRef = useRef<string | null>(tokenStorage.load());

  // `wasAuthenticated` permite ao callback `onUnauthorized` decidir se
  // deve disparar a navegação para `/login`. Sem isso, um 401 "limpando
  // estado já vazio" navegaria desnecessariamente.
  const wasAuthenticatedRef = useRef<boolean>(state.isAuthenticated);
  useEffect(() => {
    wasAuthenticatedRef.current = state.isAuthenticated;
  }, [state.isAuthenticated]);

  /**
   * Limpa estado, token, IndexedDB e storage. Centraliza a transição
   * "autenticado → deslogado" para que `logout` e o handler de 401
   * reusem exatamente o mesmo passo a passo.
   *
   * `permissionsCache.clear()` é assíncrono mas não aguardamos —
   * limpar IndexedDB best-effort não bloqueia o fluxo de logout (o
   * usuário precisa sair *agora*; um IDB lento não pode segurar).
   */
  const clearSession = useCallback(() => {
    tokenRef.current = null;
    tokenStorage.clear();
    void permissionsCache.clear();
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
   * Carrega o catálogo do IndexedDB ou refaz `GET /auth/permissions`.
   *
   * Centralizado para que login e hidratação compartilhem o caminho
   * crítico. Em sucesso, persiste no cache, atualiza o estado e
   * devolve o catálogo; em erro, propaga (caller decide se limpa
   * sessão).
   */
  const fetchAndCachePermissions = useCallback(
    async (signal?: AbortSignal): Promise<PermissionsResponse> => {
      const data = await client.get<PermissionsResponse>(
        '/auth/permissions',
        signal ? { signal } : undefined,
      );
      if (!isValidPermissionsResponse(data)) {
        throw {
          kind: 'parse',
          message: 'Resposta inválida do servidor.',
        } satisfies ApiError;
      }
      const user = toUser(data);
      // Persiste em IndexedDB best-effort (falha não propaga). O
      // `cachedAt` é injetado pelo próprio `permissionsCache.save()`.
      void permissionsCache.save({
        user,
        permissions: data.permissions,
        permissionCodes: data.permissionCodes,
        routeCodes: data.routeCodes,
      });
      return data;
    },
    [client],
  );

  /**
   * Hidratação remota + revalidação periódica.
   *
   * Disparada uma vez no mount; quando há token, executa em sequência:
   *
   * 1. Tenta carregar catálogo de IndexedDB (rápido, otimista).
   * 2. Se cache vazio ou inválido, chama `GET /auth/permissions`.
   * 3. Atualiza estado com user/permissions atuais.
   * 4. Sai de `isLoading: false` para a UI renderizar.
   *
   * O `verify-token` por navegação fica a cargo do `RequireAuth`
   * (Issue #122 / adendo) — o `useEffect` aqui só cuida da revalidação
   * **periódica** do token, sem `X-Route-Code` específico (envia o
   * code da rota corrente como sinal de "ainda autorizado"; falha não
   * bloqueia).
   */
  useEffect(() => {
    let cancelled = false;
    const controllers = new Set<AbortController>();

    const performHydrate = async (): Promise<void> => {
      if (!tokenRef.current) {
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      try {
        // 1. Tenta cache local — barato, comum no caminho de reload.
        const cached = await permissionsCache.load();
        if (cancelled) return;

        if (cached) {
          // Hidratação otimista a partir do cache, sem rede.
          setState({
            user: cached.user,
            permissions: cached.permissionCodes,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }

        // 2. Cache vazio: refaz `/auth/permissions` para repopular.
        const data = await fetchAndCachePermissions(controller.signal);
        if (cancelled) return;
        setState({
          user: toUser(data),
          permissions: data.permissionCodes,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorizedError(error)) {
          // O cliente HTTP já chamou `onUnauthorized` → sessão limpa.
          return;
        }
        // Falha de rede / parse / 5xx: não temos como hidratar mas
        // mantemos a sessão local em pé (pode ser que o usuário esteja
        // offline temporariamente). Sai de isLoading para liberar a UI;
        // a navegação seguinte tentará novamente via `verifyRoute`.
        // eslint-disable-next-line no-console
        console.warn('[auth] hidratação inicial falhou; mantendo sessão local até próxima revalidação.');
        setState(prev =>
          prev.isLoading ? { ...prev, isLoading: false } : prev,
        );
      } finally {
        controllers.delete(controller);
      }
    };

    const performPeriodicVerify = async (): Promise<void> => {
      if (!tokenRef.current) {
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      try {
        // Periódico: usa a rota corrente como sinal de "ainda autorizado
        // para o que estou olhando agora". Sem rota privada
        // (resolveRouteCode == null em /, /login, /error/...), pula a
        // chamada — o backend rejeitaria com 400.
        const pathname =
          typeof window === 'undefined' ? '' : window.location.pathname;
        const routeCode = resolveRouteCode(pathname);
        if (!routeCode) {
          return;
        }
        const data = await client.get<VerifyTokenResponse>(
          '/auth/verify-token',
          {
            signal: controller.signal,
            headers: { 'X-Route-Code': routeCode },
          },
        );
        if (cancelled) return;
        if (!isValidVerifyTokenResponse(data)) {
          // Payload inesperado: não desautenticamos por segurança.
          return;
        }
        // Sucesso: nada a fazer (não re-hidrata catálogo). 401/403
        // caem no `catch` abaixo e são tratados.
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorizedError(error)) {
          // Cliente HTTP já limpou via `onUnauthorized`.
          return;
        }
        if (isForbiddenError(error)) {
          // Periódico em rota proibida: o usuário perdeu acesso à
          // rota corrente entre cliques. Não derruba a sessão (token
          // segue válido), mas redireciona para 403.
          if (typeof window !== 'undefined' && window.location.pathname !== '/error/403') {
            try {
              navigate('/error/403', { replace: true });
            } catch {
              window.location.assign('/error/403');
            }
          }
          return;
        }
        // Falha de rede / parse / 5xx / 400 (rota inválida): silencioso.
        // eslint-disable-next-line no-console
        console.warn('[auth] verify-token periódico falhou; mantendo sessão local.');
      } finally {
        controllers.delete(controller);
      }
    };

    // Hidratação inicial: dispara imediatamente quando há token.
    if (tokenRef.current) {
      void performHydrate();
    } else {
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
          void performPeriodicVerify();
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
    // `client`, `verifyIntervalMs`, `fetchAndCachePermissions` e
    // `navigate` são as dependências reais. `clearSession` não entra
    // porque o path 401 é gerenciado pelo `onUnauthorized` do client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, verifyIntervalMs, fetchAndCachePermissions]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState(prev => ({ ...prev, isLoading: true }));
      // `tokenAcquired` distingue falhas pré-token (login) de falhas
      // pós-token (verify-token): o cleanup do segundo caso precisa
      // limpar `tokenRef`/storage para não deixar a aplicação com
      // token "vivo em memória" sem perfil correspondente.
      let tokenAcquired = false;
      try {
        // Issue #118: o backend exige `systemId` no body do login para
        // resolver o catálogo de `routeCodes`/`permissionCodes` do
        // sistema chamador. Lemos do `apiClient` para manter uma única
        // fonte da verdade.
        const systemId = client.getSystemId();
        const loginData = await client.post<LoginResponse>('/auth/login', {
          email,
          password,
          ...(systemId !== null ? { systemId } : {}),
        });
        // Setar `tokenRef` ANTES do /auth/permissions é crítico: o
        // cliente HTTP injeta `Authorization: Bearer ${getToken()}`
        // lendo a ref a cada requisição.
        tokenRef.current = loginData.token;
        tokenStorage.save(loginData.token);
        tokenAcquired = true;

        // Issue #122: catálogo agora vem do endpoint dedicado.
        const permissionsData = await fetchAndCachePermissions();

        const user = toUser(permissionsData);
        const permissions = permissionsData.permissionCodes;
        setState({
          user,
          permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        // Falha pós-login (permissions rejeitou ou payload inválido):
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
    [client, clearSession, fetchAndCachePermissions],
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
    if (tokenRef.current) {
      try {
        await client.get('/auth/logout');
      } catch (error) {
        if (!isUnauthorizedError(error)) {
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

  /**
   * Verifica autorização do usuário para um `routeCode` específico
   * (Issue #122 / adendo).
   *
   * Disparado pelo `RequireAuth` em toda mudança de pathname privado.
   * Trata os 4 cenários do contrato novo:
   *
   * - **200**: usuário autorizado → resolve `true`.
   * - **401**: token inválido/expirado → cliente HTTP já chamou
   *   `onUnauthorized` (limpa sessão + redirect /login). Resolve
   *   `false`.
   * - **403**: usuário sem direito → redireciona para `/error/403`
   *   preservando rota tentada em `state.from`. Resolve `false`.
   * - **400 / network / parse / 5xx**: tolerância. Não bloqueia o
   *   destino — preserva UX em redes instáveis ou enquanto rotas
   *   ainda não estão cadastradas no backend (sistema `authenticator`
   *   não tem rotas seedadas). Resolve `true` para liberar a navegação;
   *   o próximo tick periódico tentará de novo.
   *
   * O parâmetro `fromPathname` (opcional) é a rota de origem usada para
   * popular `state.from` no redirect 403. Quando ausente, lê
   * `window.location.pathname` como fallback (cenários sem Router
   * superior). O `RequireAuth` sempre passa o pathname capturado via
   * `useLocation()` para evitar dependência de `window.location` em
   * jsdom/MemoryRouter.
   */
  const verifyRoute = useCallback(
    async (
      routeCode: string,
      signal?: AbortSignal,
      fromPathname?: string,
    ): Promise<boolean> => {
      if (!tokenRef.current) {
        return false;
      }
      try {
        const data = await client.get<VerifyTokenResponse>(
          '/auth/verify-token',
          {
            signal,
            headers: { 'X-Route-Code': routeCode },
          },
        );
        if (!isValidVerifyTokenResponse(data)) {
          // Payload corrompido: liberamos a navegação por segurança
          // de UX (próximo tick valida). Não logamos aqui — o erro
          // vem de proxy/divergência, raro.
          return true;
        }
        return data.valid === true;
      } catch (error) {
        if (isUnauthorizedError(error)) {
          // Sessão já foi limpa pelo cliente HTTP.
          return false;
        }
        if (isForbiddenError(error)) {
          // Redirect 403 preservando rota tentada.
          const resolvedFrom =
            fromPathname ??
            (typeof window !== 'undefined' ? window.location.pathname : '/');
          const from = { pathname: resolvedFrom };
          try {
            navigate('/error/403', { replace: true, state: { from } });
          } catch {
            if (typeof window !== 'undefined') {
              window.location.assign('/error/403');
            }
          }
          return false;
        }
        // Falha de rede / parse / 5xx / 400 "Rota inválida":
        // silencioso e libera a navegação (UX > consistência estrita).
        // eslint-disable-next-line no-console
        console.warn('[auth] verify-token de navegação falhou; liberando destino.');
        return true;
      }
    },
    [client, navigate],
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
      verifyRoute,
    }),
    [state, login, logout, hasPermission, verifyRoute],
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
