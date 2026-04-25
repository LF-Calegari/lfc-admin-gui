import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';


import type { ApiClient, ApiError } from '@/shared/api';
import type { LoginResponse, VerifyTokenResponse } from '@/shared/auth';

import { AuthProvider, useAuth } from '@/shared/auth';
import { STORAGE_KEYS } from '@/shared/auth/storage';

/**
 * Constrói um stub de `ApiClient` que registra chamadas e devolve
 * respostas controladas. Cada teste configura o comportamento de `post`
 * via `mockResolvedValue` / `mockRejectedValue`.
 */
function createClientStub(): ApiClient & {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
  } as unknown as ApiClient & {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    setAuth: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  };
}

interface WrapperOptions {
  initialEntries?: ReadonlyArray<string>;
  verifyIntervalMs?: number;
  /**
   * `false` por padrão nos testes de hook (`renderHook` precisa que o
   * children renderize sempre, senão `result.current` fica `null`
   * enquanto a splash está visível). O teste dedicado de splash UI
   * passa `false` aqui e renderiza com `render` em vez de `renderHook`.
   */
  disableSplash?: boolean;
}

/**
 * Wrapper de teste que monta o Provider com um cliente injetado e
 * `MemoryRouter` para satisfazer o `useNavigate` interno.
 */
function makeWrapper(client: ApiClient, options: WrapperOptions = {}) {
  const {
    initialEntries = ['/'],
    verifyIntervalMs = 0,
    disableSplash = true,
  } = options;
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[...initialEntries]}>
      <Routes>
        <Route
          path="*"
          element={
            <AuthProvider
              client={client}
              verifyIntervalMs={verifyIntervalMs}
              disableSplash={disableSplash}
            >
              {children}
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  Wrapper.displayName = 'AuthProviderTestWrapper';
  return Wrapper;
}

/**
 * Acessa a última chamada registrada por um mock — alternativa a
 * `Array.prototype.at(-1)`, que exige `lib: ES2022`. Mantém compat com o
 * `target: ES2020` do projeto.
 */
function lastCall<T>(mockCalls: ReadonlyArray<T>): T | undefined {
  return mockCalls.length > 0 ? mockCalls[mockCalls.length - 1] : undefined;
}

const SAMPLE_LOGIN: LoginResponse = {
  token: 'jwt-xyz',
};

/**
 * Perfil retornado por `verify-token` logo após o login feliz —
 * espelha o contrato real do `auth-service` (id/name/email/identity +
 * permissions/Guid[] + permissionCodes/string[] + routeCodes/string[]).
 *
 * Usado também em testes de hidratação otimista após reload.
 */
const SAMPLE_VERIFY: VerifyTokenResponse = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@lfc.com.br',
  identity: 42,
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read', 'perm:Systems.Create'],
  routeCodes: ['KURTTO_V1_URLS_HOME'],
};

/**
 * Espelho do `User` projetado pelo Provider a partir de `SAMPLE_VERIFY`.
 * Centraliza o shape esperado pela maioria dos asserts.
 */
const SAMPLE_USER = {
  id: SAMPLE_VERIFY.id,
  name: SAMPLE_VERIFY.name,
  email: SAMPLE_VERIFY.email,
  identity: SAMPLE_VERIFY.identity,
};

const SAMPLE_PERMISSIONS = SAMPLE_VERIFY.permissionCodes;

/**
 * Resposta de `verify-token` para a revalidação periódica — simula o
 * cenário em que o backend acrescentou um `permissionCode` (por exemplo,
 * uma permissão recém-concedida) e o Provider precisa refletir o
 * snapshot atualizado.
 */
const VERIFY_RESPONSE: VerifyTokenResponse = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@lfc.com.br',
  identity: 42,
  permissions: ['11111111-1111-1111-1111-111111111111'],
  permissionCodes: ['perm:Systems.Read', 'perm:Systems.Create', 'perm:Systems.Update'],
  routeCodes: ['KURTTO_V1_URLS_HOME'],
};

const VERIFY_USER = {
  id: VERIFY_RESPONSE.id,
  name: VERIFY_RESPONSE.name,
  email: VERIFY_RESPONSE.email,
  identity: VERIFY_RESPONSE.identity,
};

const VERIFY_PERMISSIONS = VERIFY_RESPONSE.permissionCodes;

const UNAUTHORIZED_ERROR: ApiError = {
  kind: 'http',
  status: 401,
  code: 'TOKEN_INVALID',
  message: 'Sessão expirada.',
};

const NETWORK_ERROR: ApiError = {
  kind: 'network',
  message: 'Falha de conexão com o servidor.',
};

/**
 * Pré-popula `localStorage` para simular sessão persistida — usado nos
 * testes de hidratação remota.
 *
 * O shape gravado espelha o `PersistedSession` real (User com `identity`
 * + permissions = permissionCodes), de modo que os testes leiam
 * exatamente o que o Provider gravou em sessões anteriores.
 */
function seedPersistedSession(): void {
  window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
  window.localStorage.setItem(
    STORAGE_KEYS.user,
    JSON.stringify({
      user: SAMPLE_USER,
      permissions: SAMPLE_PERMISSIONS,
    }),
  );
}

/**
 * Garante storage limpo antes de cada teste — evita vazar sessão
 * persistida entre cenários, especialmente nos testes de hidratação
 * que dependem do estado de `localStorage` no momento do mount.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAuth fora do Provider', () => {
  test('lança erro descritivo', () => {
    // Suprime o `console.error` esperado do React durante teste de erro.
    const noop = (): void => {
      // intencionalmente vazio — apenas absorver logs de erro do React.
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(noop);
    expect(() => renderHook(() => useAuth())).toThrow(
      /useAuth deve ser usado dentro de um <AuthProvider>/,
    );
    errorSpy.mockRestore();
  });
});

describe('AuthProvider — estado inicial', () => {
  test('expõe estado deslogado e finaliza isLoading após hidratação', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isAuthenticated).toBe(false);
    // Sem sessão local, verify-token NÃO deve ser chamado.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('injeta getToken e onUnauthorized no client via setAuth', () => {
    const client = createClientStub();
    renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    expect(client.setAuth).toHaveBeenCalled();
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(typeof latest?.getToken).toBe('function');
    expect(typeof latest?.onUnauthorized).toBe('function');
    // Antes do login, getToken() retorna null.
    expect(latest?.getToken?.()).toBeNull();
  });
});

describe('AuthProvider — login', () => {
  test('caminho feliz: encadeia POST /auth/login + GET /auth/verify-token e popula estado', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(client.post).toHaveBeenCalledWith('/auth/login', {
      email: 'ada@lfc.com.br',
      password: 'secret',
    });
    expect(client.get).toHaveBeenCalledWith('/auth/verify-token');
    // `permissions` no estado é o catálogo de `permissionCodes`, não os
    // GUIDs brutos em `verify-token.permissions` nem os `routeCodes`
    // (filtrados para kurtto).
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSIONS);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  test('após login, getToken injetado no client retorna o token recebido', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBe('jwt-xyz');
  });

  test('tokenRef é setado ANTES do verify-token (header Authorization presente)', async () => {
    // Asserção crítica do contrato: o `verify-token` precisa ler o token
    // recém-recebido via `getToken()` para que o cliente HTTP injete
    // `Authorization: Bearer ...`. Capturamos o valor de `getToken()` no
    // momento exato da chamada `client.get`.
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);

    let tokenAtVerify: string | null | undefined;
    client.get.mockImplementationOnce(async () => {
      tokenAtVerify = lastCall(client.setAuth.mock.calls)?.[0]?.getToken?.();
      return SAMPLE_VERIFY;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(tokenAtVerify).toBe('jwt-xyz');
  });

  test('falha de credenciais propaga ApiError e mantém estado deslogado', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    };
    const client = createClientStub();
    client.post.mockRejectedValueOnce(apiError);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('ada@lfc.com.br', 'wrong');
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
    // `verify-token` nunca chega a ser chamado quando o login rejeita.
    expect(client.get).not.toHaveBeenCalled();
  });

  test('falha no verify-token pós-login limpa sessão parcial e propaga erro', async () => {
    // Cenário: backend aceitou as credenciais mas a chamada subsequente
    // a `verify-token` falhou (ex.: rede caiu, 5xx, payload corrompido).
    // O Provider já tinha aceitado o token em `tokenRef`; precisa
    // limpar tudo (storage + ref + state) para não deixar um header
    // `Authorization` pendurado em chamadas seguintes.
    const apiError: ApiError = {
      kind: 'network',
      message: 'Falha de conexão com o servidor.',
    };
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockRejectedValueOnce(apiError);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Capturamos a rejection diretamente — `await expect(act(..)).rejects`
    // pode liberar antes do bloco `finally` interno do Provider rodar
    // sob certas timings, gerando race com asserts subsequentes em
    // `tokenRef`.
    let captured: unknown;
    await act(async () => {
      try {
        await result.current.login('ada@lfc.com.br', 'secret');
      } catch (e) {
        captured = e;
      }
    });

    expect(captured).toMatchObject({ kind: 'network' });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    // Storage limpo — a sessão parcial (token sem perfil) foi descartada.
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();

    // Token injetado no client também foi zerado.
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });

  test('verify-token com payload inválido pós-login limpa sessão e propaga ApiError(parse)', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // Resposta sem campos obrigatórios — o type guard deve rejeitar.
    client.get.mockResolvedValueOnce({ permissions: [] } as unknown);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let captured: unknown;
    await act(async () => {
      try {
        await result.current.login('ada@lfc.com.br', 'secret');
      } catch (e) {
        captured = e;
      }
    });

    expect(captured).toMatchObject({ kind: 'parse' });
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });
});

describe('AuthProvider — logout', () => {
  test('limpa estado e zera token após logout', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // 1ª chamada: verify-token do login encadeado; 2ª: logout remoto.
    client.get
      .mockResolvedValueOnce(SAMPLE_VERIFY)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(result.current.isAuthenticated).toBe(false);
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });

  test('chama GET /auth/logout para invalidar tokenVersion remoto (Issue #55)', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get
      .mockResolvedValueOnce(SAMPLE_VERIFY)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenCalledWith('/auth/logout');
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('logout sem sessão ativa NÃO chama o endpoint remoto', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('falha de rede no logout remoto ainda limpa estado e storage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // 1ª chamada: verify-token (login feliz); 2ª: logout falha por rede.
    client.get
      .mockResolvedValueOnce(SAMPLE_VERIFY)
      .mockRejectedValueOnce(NETWORK_ERROR);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('logout em 401 (já deslogado no backend) limpa local sem warning', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    // 1ª chamada: verify-token do login feliz; 2ª: logout em 401.
    client.get
      .mockResolvedValueOnce(SAMPLE_VERIFY)
      .mockImplementationOnce(async () => {
        // Simula o comportamento real do client HTTP em 401: dispara
        // `onUnauthorized` (que limpa sessão) e rejeita com ApiError.
        const config = lastCall(client.setAuth.mock.calls)?.[0];
        config?.onUnauthorized?.();
        throw UNAUTHORIZED_ERROR;
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    // 401 é silencioso: o usuário já estava deslogado de qualquer forma.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('logout redireciona para /login após sucesso remoto', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Primeira chamada: hidratação verify-token; Segunda: logout remoto.
    client.get
      .mockResolvedValueOnce(VERIFY_RESPONSE)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });

    let capturedPath = '';
    const PathProbe: React.FC = () => {
      const location = useLocation();
      capturedPath = location.pathname;
      return null;
    };

    const TriggerScreen: React.FC = () => {
      const authValue = useAuth();
      return (
        <>
          <PathProbe />
          <button
            type="button"
            data-testid="trigger-logout"
            onClick={() => {
              void authValue.logout();
            }}
          >
            sair
          </button>
        </>
      );
    };

    const LoginScreen: React.FC = () => (
      <>
        <PathProbe />
        <div data-testid="login-screen">login</div>
      </>
    );

    render(
      <MemoryRouter initialEntries={['/systems']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/systems" element={<TriggerScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    expect(capturedPath).toBe('/systems');

    await act(async () => {
      screen.getByTestId('trigger-logout').click();
    });

    await waitFor(() => expect(capturedPath).toBe('/login'));
    expect(client.get).toHaveBeenLastCalledWith('/auth/logout');
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('logout redireciona para /login mesmo após falha remota', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Hidratação OK, depois logout falha por rede.
    client.get
      .mockResolvedValueOnce(VERIFY_RESPONSE)
      .mockRejectedValueOnce(NETWORK_ERROR);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    let capturedPath = '';
    const PathProbe: React.FC = () => {
      const location = useLocation();
      capturedPath = location.pathname;
      return null;
    };

    const TriggerScreen: React.FC = () => {
      const authValue = useAuth();
      return (
        <>
          <PathProbe />
          <button
            type="button"
            data-testid="trigger-logout"
            onClick={() => {
              void authValue.logout();
            }}
          >
            sair
          </button>
        </>
      );
    };

    const LoginScreen: React.FC = () => (
      <>
        <PathProbe />
        <div data-testid="login-screen">login</div>
      </>
    );

    render(
      <MemoryRouter initialEntries={['/systems']}>
        <AuthProvider client={client} verifyIntervalMs={0} disableSplash>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/systems" element={<TriggerScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    expect(capturedPath).toBe('/systems');

    await act(async () => {
      screen.getByTestId('trigger-logout').click();
    });

    await waitFor(() => expect(capturedPath).toBe('/login'));
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('AuthProvider — hasPermission', () => {
  test('retorna false enquanto deslogado', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasPermission('perm:Systems.Read')).toBe(false);
  });

  test('retorna true para permissões presentes após login', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(result.current.hasPermission('perm:Systems.Read')).toBe(true);
    expect(result.current.hasPermission('perm:Systems.Create')).toBe(true);
    expect(result.current.hasPermission('perm:Systems.Delete')).toBe(false);
  });
});

describe('AuthProvider — onUnauthorized', () => {
  test('callback injetado no client limpa sessão quando disparado', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    expect(result.current.isAuthenticated).toBe(true);

    const onUnauthorized = lastCall(client.setAuth.mock.calls)?.[0]
      ?.onUnauthorized as () => void;
    expect(typeof onUnauthorized).toBe('function');

    act(() => {
      onUnauthorized();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
  });
});

describe('AuthProvider — persistência (Issue #53)', () => {
  test('hidrata estado a partir de localStorage no mount', async () => {
    // Pré-condição: storage já contém uma sessão válida (simula reload
    // após login bem-sucedido em sessão anterior).
    seedPersistedSession();
    const client = createClientStub();
    // Verify-token bem-sucedido para destravar isLoading.
    client.get.mockResolvedValueOnce(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // Render inicial já é autenticado.
    expect(result.current.isAuthenticated).toBe(true);

    // Token persistido também alimenta o getToken injetado no client.
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBe('jwt-persistido');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  test('ignora dados corrompidos em storage e mantém estado deslogado', () => {
    window.localStorage.setItem(STORAGE_KEYS.token, 'jwt-persistido');
    window.localStorage.setItem(STORAGE_KEYS.user, '{json-quebrado');

    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    const latest = lastCall(client.setAuth.mock.calls)?.[0];
    expect(latest?.getToken?.()).toBeNull();
  });

  test('login persiste token e user em localStorage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');
    const userJson = window.localStorage.getItem(STORAGE_KEYS.user);
    expect(userJson).not.toBeNull();
    // Storage espelha a projeção que o Provider faz: User com `identity`
    // e permissions = permissionCodes (nunca os GUIDs brutos).
    expect(JSON.parse(userJson as string)).toEqual({
      user: SAMPLE_USER,
      permissions: SAMPLE_PERMISSIONS,
    });
  });

  test('logout limpa ambas as chaves do localStorage', async () => {
    // Estado inicial: sessão já hidratada do storage. A 1ª chamada
    // a `client.get` é a hidratação otimista; a 2ª, o logout remoto.
    seedPersistedSession();

    const client = createClientStub();
    client.get
      .mockResolvedValueOnce(VERIFY_RESPONSE)
      .mockResolvedValueOnce({ message: 'Sessão encerrada.' });
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.isAuthenticated).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('callback onUnauthorized (401) limpa localStorage', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    client.get.mockResolvedValueOnce(SAMPLE_VERIFY);
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('ada@lfc.com.br', 'secret');
    });
    // Confirma pré-condição: storage está populado.
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-xyz');

    const onUnauthorized = lastCall(client.setAuth.mock.calls)?.[0]
      ?.onUnauthorized as () => void;
    act(() => {
      onUnauthorized();
    });

    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
  });
});

describe('AuthProvider — verify-token (Issue #54)', () => {
  test('com sessão local, hidrata via GET /auth/verify-token e atualiza permissions', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValueOnce(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // Mount inicial já está autenticado (otimista) com permissões antigas
    // e isLoading=true sinalizando revalidação em curso.
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSIONS);

    // Após o verify-token resolver, permissões são atualizadas com o
    // snapshot fresco — `permissionCodes` é a fonte da verdade para o
    // que o frontend chama de `permissions`.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).toHaveBeenCalledWith(
      '/auth/verify-token',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.permissions).toEqual(VERIFY_PERMISSIONS);
    expect(result.current.user).toEqual(VERIFY_USER);
  });

  test('sem sessão local, NÃO chama verify-token no mount', async () => {
    const client = createClientStub();
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.get).not.toHaveBeenCalled();
  });

  test('verify-token com 401 limpa sessão e redireciona para /login', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Simula o comportamento real do client HTTP: em 401, dispara
    // `onUnauthorized` antes de rejeitar a Promise.
    client.get.mockImplementationOnce(async () => {
      const config = lastCall(client.setAuth.mock.calls)?.[0];
      config?.onUnauthorized?.();
      throw UNAUTHORIZED_ERROR;
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { initialEntries: ['/systems'] }),
    });

    // O verify-token resolve assincronamente; aguardamos a transição
    // para `isAuthenticated: false` em vez de afirmar o estado inicial
    // (que pode ou não ter sido capturado antes do `useEffect` rodar).
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.permissions).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  test('verify-token com falha de rede mantém sessão local intacta', async () => {
    seedPersistedSession();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createClientStub();
    client.get.mockRejectedValueOnce(NETWORK_ERROR);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Sessão local preservada — usuário continua autenticado com último
    // snapshot conhecido.
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSIONS);
    expect(window.localStorage.getItem(STORAGE_KEYS.token)).toBe('jwt-persistido');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('verify-token com payload inválido mantém sessão local', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Resposta sem `id`/`name`/`email`/`identity`/`permissionCodes`/`routeCodes`
    // válidos — Provider deve descartar silenciosamente e manter sessão local.
    client.get.mockResolvedValueOnce({ permissions: [] } as unknown);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(SAMPLE_USER);
    expect(result.current.permissions).toEqual(SAMPLE_PERMISSIONS);
  });

  test('revalidação periódica chama verify-token a cada tick', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValue(VERIFY_RESPONSE);

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { verifyIntervalMs: 50 }),
    });

    // A hidratação inicial dispara a chamada #1; cada tick subsequente
    // adiciona mais uma. Asserimos apenas a transição de "1 → ≥3" para
    // evitar corrida com intervalo de 50ms vs. agendamento do React.
    await waitFor(
      () => expect(client.get.mock.calls.length).toBeGreaterThanOrEqual(3),
      { timeout: 1500 },
    );
    // Desmonta explicitamente para liberar `setInterval` antes de o
    // próximo teste começar — `renderHook` faz auto-cleanup, mas sob
    // intervalo de 50ms o timer pode disparar entre tests vizinhos.
    unmount();
  });

  test('verifyIntervalMs=0 desativa revalidação periódica mas mantém hidratação inicial', async () => {
    seedPersistedSession();
    const client = createClientStub();
    client.get.mockResolvedValue(VERIFY_RESPONSE);

    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client, { verifyIntervalMs: 0 }),
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Aguarda um pouco para garantir que nenhum tick adicional chegou.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  test('renderiza splash enquanto verify-token está em curso (sessão local)', async () => {
    seedPersistedSession();
    const client = createClientStub();
    // Promise pendente para manter `isLoading: true` enquanto asserimos
    // a presença da splash.
    let resolveVerify: ((value: VerifyTokenResponse) => void) | null = null;
    client.get.mockImplementationOnce(
      () =>
        new Promise<VerifyTokenResponse>(resolve => {
          resolveVerify = resolve;
        }),
    );

    render(
      <MemoryRouter>
        <AuthProvider client={client} verifyIntervalMs={0}>
          <div data-testid="protected-content">conteúdo protegido</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Splash visível, conteúdo protegido oculto.
    expect(screen.getByTestId('auth-splash')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // Resolve o verify-token: splash desaparece, conteúdo aparece.
    await act(async () => {
      resolveVerify?.(VERIFY_RESPONSE);
    });

    await waitFor(() =>
      expect(screen.queryByTestId('auth-splash')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  test('sem sessão local, NÃO exibe splash e renderiza children imediatamente', () => {
    const client = createClientStub();
    render(
      <MemoryRouter>
        <AuthProvider client={client} verifyIntervalMs={0}>
          <div data-testid="public-content">conteúdo público</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('auth-splash')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-content')).toBeInTheDocument();
  });

  test('unmount cancela revalidação pendente via AbortController', async () => {
    seedPersistedSession();
    const client = createClientStub();
    let abortSignal: AbortSignal | undefined;
    client.get.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
      abortSignal = options?.signal;
      // Promise pendente — nunca resolve — para asserir o abort.
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(client),
    });

    // O `useEffect` que dispara o verify-token roda após o primeiro
    // commit; aguardamos até que o mock receba o signal antes de
    // desmontar.
    await waitFor(() => expect(abortSignal).toBeDefined());
    expect(abortSignal?.aborted).toBe(false);

    unmount();
    expect(abortSignal?.aborted).toBe(true);
  });
});
