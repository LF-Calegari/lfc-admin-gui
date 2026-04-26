import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { ApiError } from '@/shared/api';

import { createApiClient, isApiError } from '@/shared/api';



/**
 * Constrói uma resposta `fetch` mockada com defaults sensatos.
 *
 * Centraliza a configuração para que cada teste expresse só o que é
 * relevante — status, body, headers — sem reescrever boilerplate.
 */
function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

/**
 * Resposta sem corpo (204 No Content) — usada para verificar leitura
 * tolerante de respostas vazias.
 */
function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

describe('createApiClient', () => {
  // Mock tipado de `fetch`. `unknown[]` no input afrouxa a comparação com a
  // assinatura sobrecarregada do `fetch` global sem perder o `Response`
  // como retorno — basta para os asserts feitos pelos testes.
  let fetchSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<Response>>>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL e métodos', () => {
    test('GET concatena baseUrl e path corretamente', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = createApiClient({ baseUrl: 'https://api.example.com/v1' });

      await client.get('/systems');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/systems');
      expect((init as RequestInit).method).toBe('GET');
    });

    test('GET tolera baseUrl com trailing slash e path sem leading slash', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
      const client = createApiClient({ baseUrl: 'https://api.example.com/v1/' });

      await client.get('systems');

      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/v1/systems');
    });

    test('POST serializa body objeto como JSON e seta Content-Type', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'abc' }));
      const client = createApiClient({ baseUrl: 'https://api.example.com' });

      await client.post('/systems', { name: 'Auth' });

      const [, init] = fetchSpy.mock.calls[0];
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      expect(reqInit.body).toBe(JSON.stringify({ name: 'Auth' }));
      const headers = new Headers(reqInit.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Accept')).toBe('application/json');
    });

    test('PUT, PATCH e DELETE invocam o método HTTP correspondente', async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(noContentResponse());
      const client = createApiClient({ baseUrl: '' });

      await client.put('/r/1', { a: 1 });
      await client.patch('/r/1', { a: 2 });
      await client.delete('/r/1');

      expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('PUT');
      expect((fetchSpy.mock.calls[1][1] as RequestInit).method).toBe('PATCH');
      expect((fetchSpy.mock.calls[2][1] as RequestInit).method).toBe('DELETE');
    });

    test('204 No Content retorna undefined sem tentar parsear', async () => {
      fetchSpy.mockResolvedValueOnce(noContentResponse());
      const client = createApiClient({ baseUrl: '' });

      const result = await client.delete<undefined>('/r/1');

      expect(result).toBeUndefined();
    });

    test('headers customizados sobrescrevem defaults', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({ baseUrl: '' });

      await client.get('/x', { headers: { 'X-Trace-Id': 't-123' } });

      const headers = new Headers(
        (fetchSpy.mock.calls[0][1] as RequestInit).headers,
      );
      expect(headers.get('X-Trace-Id')).toBe('t-123');
    });

    test('signal de AbortController é repassado ao fetch', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({ baseUrl: '' });
      const controller = new AbortController();

      await client.get('/x', { signal: controller.signal });

      expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(
        controller.signal,
      );
    });
  });

  describe('X-System-Id (Issue #118)', () => {
    /**
     * Helper que dispara um GET único com o cliente configurado e
     * retorna os headers efetivamente enviados ao `fetch`. Centraliza
     * o boilerplate (mock de resposta + leitura dos headers da call)
     * para que os testes expressem só o cenário sendo coberto —
     * configuração e expectativa — eliminando duplicação que dispara
     * o Quality Gate do SonarCloud.
     */
    async function captureHeaders(
      configOverrides: Partial<Parameters<typeof createApiClient>[0]>,
      requestOptions?: { headers?: Record<string, string> },
    ): Promise<Headers> {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({ baseUrl: '', ...configOverrides });
      await client.get('/r', requestOptions);
      return new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers);
    }

    test.each([
      {
        name: 'injeta X-System-Id quando o cliente é configurado com systemId',
        config: { systemId: '843740f1-a264-4d65-a881-7fc1640d7cc6' },
        options: undefined,
        expected: '843740f1-a264-4d65-a881-7fc1640d7cc6',
      },
      {
        // Compatibilidade com testes legados e cenários onde o cliente
        // é criado sem identificação (em produção isso nunca acontece —
        // o boot em `src/shared/api/index.ts` falha fail-fast).
        name: 'omite X-System-Id quando systemId NÃO é configurado',
        config: {},
        options: undefined,
        expected: null,
      },
      {
        // Não é caso de uso real, mas garante que a ordem de aplicação
        // é a esperada (overrides do consumidor têm precedência) —
        // evita surpresas se um endpoint específico precisar trocar
        // o id.
        name: 'headers customizados podem sobrescrever X-System-Id pontualmente',
        config: { systemId: 'default' },
        options: { headers: { 'X-System-Id': 'override' } },
        expected: 'override',
      },
    ])('$name', async ({ config, options, expected }) => {
      const headers = await captureHeaders(config, options);
      if (expected === null) {
        expect(headers.has('X-System-Id')).toBe(false);
      } else {
        expect(headers.get('X-System-Id')).toBe(expected);
      }
    });

    test('emite X-System-Id em todas as chamadas (GET, POST, PUT, PATCH, DELETE)', async () => {
      // O contrato da Issue #118 é "todas as chamadas" — não filtramos
      // por endpoint. O backend valida onde for relevante.
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(noContentResponse());
      const client = createApiClient({ baseUrl: '', systemId: 'sys-123' });

      await client.get('/r');
      await client.post('/r', { a: 1 });
      await client.put('/r/1', { a: 2 });
      await client.patch('/r/1', { a: 3 });
      await client.delete('/r/1');

      for (const call of fetchSpy.mock.calls) {
        const headers = new Headers((call[1] as RequestInit).headers);
        expect(headers.get('X-System-Id')).toBe('sys-123');
      }
    });

    test('getSystemId retorna o valor configurado e null quando ausente', () => {
      const withId = createApiClient({ baseUrl: '', systemId: 'sys-abc' });
      expect(withId.getSystemId()).toBe('sys-abc');

      const without = createApiClient({ baseUrl: '' });
      expect(without.getSystemId()).toBeNull();
    });
  });

  describe('Authorization', () => {
    test('injeta Bearer quando getToken retorna token', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({
        baseUrl: '',
        getToken: () => 'jwt-abc',
      });

      await client.get('/me');

      const headers = new Headers(
        (fetchSpy.mock.calls[0][1] as RequestInit).headers,
      );
      expect(headers.get('Authorization')).toBe('Bearer jwt-abc');
    });

    test('omite Authorization quando getToken retorna null', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({ baseUrl: '', getToken: () => null });

      await client.get('/public');

      const headers = new Headers(
        (fetchSpy.mock.calls[0][1] as RequestInit).headers,
      );
      expect(headers.has('Authorization')).toBe(false);
    });

    test('lê getToken a cada requisição (token rotativo)', async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}));
      let token = 'first';
      const client = createApiClient({ baseUrl: '', getToken: () => token });

      await client.get('/x');
      token = 'second';
      await client.get('/x');

      const first = new Headers(
        (fetchSpy.mock.calls[0][1] as RequestInit).headers,
      );
      const second = new Headers(
        (fetchSpy.mock.calls[1][1] as RequestInit).headers,
      );
      expect(first.get('Authorization')).toBe('Bearer first');
      expect(second.get('Authorization')).toBe('Bearer second');
    });

    test('setAuth atualiza callbacks após criação', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));
      const client = createApiClient({ baseUrl: '' });
      client.setAuth({ getToken: () => 'late-token' });

      await client.get('/x');

      const headers = new Headers(
        (fetchSpy.mock.calls[0][1] as RequestInit).headers,
      );
      expect(headers.get('Authorization')).toBe('Bearer late-token');
    });
  });

  describe('Tratamento de erros', () => {
    test('401 chama onUnauthorized e lança ApiError(http, 401)', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ code: 'UNAUTHORIZED', message: 'Token expirado' }, {
          status: 401,
        }),
      );
      const onUnauthorized = vi.fn();
      const client = createApiClient({ baseUrl: '', onUnauthorized });

      await expect(client.get('/me')).rejects.toMatchObject({
        kind: 'http',
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Token expirado',
      });
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    test('403 propaga ApiError(http, 403) sem chamar onUnauthorized', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ code: 'FORBIDDEN', message: 'Sem acesso' }, {
          status: 403,
        }),
      );
      const onUnauthorized = vi.fn();
      const client = createApiClient({ baseUrl: '', onUnauthorized });

      await expect(client.get('/admin')).rejects.toMatchObject({
        kind: 'http',
        status: 403,
        code: 'FORBIDDEN',
      });
      expect(onUnauthorized).not.toHaveBeenCalled();
    });

    test('500 retorna ApiError(http) com mensagem padrão quando body vazio', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));
      const client = createApiClient({ baseUrl: '' });

      await expect(client.get('/x')).rejects.toMatchObject({
        kind: 'http',
        status: 500,
      });
    });

    test('falha de rede vira ApiError(network)', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const client = createApiClient({ baseUrl: '' });

      let captured: unknown;
      try {
        await client.get('/x');
      } catch (e) {
        captured = e;
      }
      expect(isApiError(captured)).toBe(true);
      expect((captured as ApiError).kind).toBe('network');
      expect((captured as ApiError).message).toBe('Falha de conexão com o servidor.');
    });

    test('AbortError vira ApiError(network) com mensagem dedicada', async () => {
      const abortErr = new DOMException('aborted', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortErr);
      const client = createApiClient({ baseUrl: '' });

      await expect(client.get('/x')).rejects.toMatchObject({
        kind: 'network',
        message: 'Requisição cancelada.',
      });
    });

    test('JSON inválido em resposta 2xx vira ApiError(parse)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('{not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const client = createApiClient({ baseUrl: '' });

      await expect(client.get('/x')).rejects.toMatchObject({ kind: 'parse' });
    });

    test('isApiError distingue ApiError de outros valores', () => {
      expect(isApiError({ kind: 'network', message: 'x' })).toBe(true);
      expect(isApiError({ kind: 'http', status: 404, message: 'x' })).toBe(true);
      expect(isApiError(new Error('boom'))).toBe(false);
      expect(isApiError(null)).toBe(false);
      expect(isApiError({ kind: 'invalid', message: 'x' })).toBe(false);
    });
  });

  describe('Resposta', () => {
    test('parseia JSON e retorna corpo tipado', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Auth' }));
      const client = createApiClient({ baseUrl: '' });

      const result = await client.get<{ id: number; name: string }>('/x');

      expect(result).toEqual({ id: 1, name: 'Auth' });
    });

    test('retorna texto cru quando Content-Type não é JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('plain text', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );
      const client = createApiClient({ baseUrl: '' });

      const result = await client.get<string>('/x');
      expect(result).toBe('plain text');
    });
  });
});
