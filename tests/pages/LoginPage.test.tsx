import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient, ApiError } from '@/shared/api';
import type { LoginResponse } from '@/shared/auth';

import { LoginPage } from '@/pages/LoginPage';
import { AuthProvider } from '@/shared/auth';

/**
 * Stub mínimo de `ApiClient` injetado no `AuthProvider` durante os
 * testes — isola a página de qualquer chamada real ao backend.
 *
 * Cada teste configura `post` via `mockResolvedValue` ou
 * `mockRejectedValue` conforme o cenário sendo coberto.
 */
function createClientStub(): ApiClient & {
  post: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
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
    setAuth: ReturnType<typeof vi.fn>;
  };
}

const SAMPLE_LOGIN: LoginResponse = {
  token: 'jwt-xyz',
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@lfc.com.br',
  },
  permissions: ['Systems.Read'],
};

type ClientStub = ReturnType<typeof createClientStub>;

interface RenderOptions {
  client?: ClientStub;
  initialEntries?: Array<string | { pathname: string; state?: unknown }>;
}

/**
 * Renderiza `LoginPage` dentro de `AuthProvider` + `MemoryRouter` com
 * uma rota destino (`/systems`) que registra a navegação para validar o
 * redirect pós-login.
 */
function renderLogin(options: RenderOptions = {}): { client: ClientStub } {
  const client = options.client ?? createClientStub();
  render(
    <AuthProvider client={client}>
      <MemoryRouter initialEntries={options.initialEntries ?? ['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/systems"
            element={<div data-testid="systems-page">systems</div>}
          />
          <Route
            path="/permissions"
            element={<div data-testid="permissions-page">permissions</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return { client };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('LoginPage — render inicial', () => {
  it('renderiza brand, formulário e CTA principal', () => {
    renderLogin();

    expect(screen.getByRole('img', { name: /LF Calegari Admin/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeInTheDocument();
  });

  it('campos começam vazios e botão habilitado', () => {
    renderLogin();
    const email = screen.getByLabelText(/E-mail/i) as HTMLInputElement;
    const password = screen.getByLabelText(/Senha/i) as HTMLInputElement;
    const submit = screen.getByRole('button', { name: /Entrar/i });

    expect(email.value).toBe('');
    expect(password.value).toBe('');
    expect(submit).toBeEnabled();
  });

  it('aplica foco automático no primeiro campo (e-mail) ao montar', () => {
    renderLogin();
    const email = screen.getByLabelText(/E-mail/i);
    expect(email).toHaveFocus();
  });
});

describe('LoginPage — validação client-side', () => {
  it('exibe erro inline quando email está vazio ao submeter', async () => {
    const { client } = renderLogin();
    const submit = screen.getByRole('button', { name: /Entrar/i });

    fireEvent.click(submit);

    expect(await screen.findByText(/Informe seu e-mail\./i)).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('exibe erro inline quando email é inválido', async () => {
    const { client } = renderLogin();

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'naoeumemail' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(await screen.findByText(/E-mail inválido\./i)).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('exibe erro inline quando senha está vazia', async () => {
    const { client } = renderLogin();

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(await screen.findByText(/Informe sua senha\./i)).toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('limpa erro inline ao digitar novamente no campo', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    expect(await screen.findByText(/Informe seu e-mail\./i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'a' },
    });
    expect(screen.queryByText(/Informe seu e-mail\./i)).not.toBeInTheDocument();
  });
});

describe('LoginPage — submit feliz', () => {
  it('chama login com credenciais e redireciona para /systems por padrão', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/auth/login', {
        email: 'ada@lfc.com.br',
        password: 'segredo',
      });
    });

    expect(await screen.findByTestId('systems-page')).toBeInTheDocument();
  });

  it('redireciona para a rota original preservada em location.state.from', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    renderLogin({
      client,
      initialEntries: [
        { pathname: '/login', state: { from: { pathname: '/permissions' } } },
      ],
    });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(await screen.findByTestId('permissions-page')).toBeInTheDocument();
  });

  it('faz trim do e-mail antes de submeter', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: '  ada@lfc.com.br  ' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('/auth/login', {
        email: 'ada@lfc.com.br',
        password: 'segredo',
      });
    });
  });
});

describe('LoginPage — submit com erro', () => {
  it('exibe Alert acessível com mensagem fixa para 401', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    };
    const client = createClientStub();
    client.post.mockRejectedValueOnce(apiError);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'errada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(/E-mail ou senha inválidos\./i);
  });

  it('exibe mensagem do backend para erros não-401', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 503,
      message: 'Serviço temporariamente indisponível.',
    };
    const client = createClientStub();
    client.post.mockRejectedValueOnce(apiError);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Serviço temporariamente indisponível\./i);
  });

  it('exibe mensagem genérica quando o erro não é ApiError', async () => {
    const client = createClientStub();
    client.post.mockRejectedValueOnce(new Error('boom'));
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Falha ao entrar/i);
  });

  it('limpa o Alert ao digitar novamente em qualquer campo', async () => {
    const apiError: ApiError = { kind: 'http', status: 401, message: 'x' };
    const client = createClientStub();
    client.post.mockRejectedValueOnce(apiError);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'errada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'errada2' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LoginPage — estado loading', () => {
  it('marca o botão como aria-busy enquanto a requisição está em andamento', async () => {
    const noopResolve: (value: LoginResponse) => void = () => {
      // intencional: substituído pelo resolve real abaixo.
    };
    let resolveLogin: (value: LoginResponse) => void = noopResolve;
    const pending = new Promise<LoginResponse>(resolve => {
      resolveLogin = resolve;
    });
    const client = createClientStub();
    client.post.mockReturnValueOnce(pending);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('login-submit')).toHaveAttribute('aria-busy', 'true');
    });
    expect(screen.getByTestId('login-submit')).toBeDisabled();

    resolveLogin(SAMPLE_LOGIN);
    await screen.findByTestId('systems-page');
  });
});

describe('LoginPage — já autenticado', () => {
  it('redireciona imediatamente para /systems quando sessão já está ativa', async () => {
    const client = createClientStub();
    client.post.mockResolvedValueOnce(SAMPLE_LOGIN);
    renderLogin({ client });

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ada@lfc.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    // Após login, mesmo navegando para /login, o efeito é o redirect imediato.
    expect(await screen.findByTestId('systems-page')).toBeInTheDocument();
  });
});
