import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError, PagedResponse, SafeRequestOptions } from '@/shared/api';

import { usePaginatedFetch } from '@/hooks/usePaginatedFetch';

/**
 * Suíte do hook compartilhado `usePaginatedFetch` (Issue #62, EPIC #46).
 *
 * Originalmente o pattern vivia inline na `SystemsPage` (EPIC #45) e
 * foi extraído quando a `RoutesPage` introduziu o segundo call site.
 * Lição PR #128: projetar shared helpers desde o primeiro PR do
 * recurso em vez de esperar o segundo módulo aparecer e depois
 * refatorar — o hook centraliza loading/refetch/cancelamento que cada
 * listagem precisaria reimplementar.
 *
 * Estratégia de teste: passar um `fetcher` mockado e validar
 * - Estados de loading (initial/refetch).
 * - Cancelamento via AbortController em refetches sucessivos.
 * - Mensagem de erro em falhas (com fallback genérico).
 * - Skip não chama o fetcher e desliga `isInitialLoading`.
 * - Refetch dispara nova chamada sem mudar params.
 */

interface ListItem {
  id: string;
}

function makePaged(data: ReadonlyArray<ListItem>, total = data.length): PagedResponse<ListItem> {
  return { data, page: 1, pageSize: 20, total };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePaginatedFetch — primeiro fetch', () => {
  it('inicia com isInitialLoading=true e popula rows após sucesso', async () => {
    const fetcher = vi.fn(async () => makePaged([{ id: 'a' }, { id: 'b' }]));

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'Falha genérica.',
      }),
    );

    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.rows).toEqual([]);

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
    });

    expect(result.current.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current.total).toBe(2);
    expect(result.current.errorMessage).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('passa signal AbortController ao fetcher', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(async (options: SafeRequestOptions) => {
      if (options.signal) signals.push(options.signal);
      return makePaged([]);
    });

    renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'X',
      }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});

describe('usePaginatedFetch — refetch e cancelamento', () => {
  it('refetch() incrementa nonce e re-executa o fetcher mantendo isInitialLoading=false', async () => {
    const fetcher = vi.fn(async () => makePaged([{ id: 'a' }]));

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'X',
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    // No segundo fetch, é refetch (não initial), portanto
    // isInitialLoading permanece false e isFetching transita.
    expect(result.current.isInitialLoading).toBe(false);
  });

  it('cancela o fetch anterior quando o fetcher muda de identidade', async () => {
    const signals: AbortSignal[] = [];
    let fetcherKey = 'a';
    const makeFetcher = (key: string) => () =>
      vi.fn(async (options: SafeRequestOptions) => {
        if (options.signal) signals.push(options.signal);
        return makePaged([{ id: key }]);
      });

    const { result, rerender } = renderHook(
      ({ fetcher }: { fetcher: (options: SafeRequestOptions) => Promise<PagedResponse<ListItem>> }) =>
        usePaginatedFetch<ListItem>({ fetcher, fallbackErrorMessage: 'X' }),
      { initialProps: { fetcher: makeFetcher(fetcherKey)() } },
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    fetcherKey = 'b';
    rerender({ fetcher: makeFetcher(fetcherKey)() });

    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(2));

    // O signal #1 (o anterior) deve estar abortado pelo cleanup do
    // useEffect quando o fetcher mudou.
    expect(signals[0].aborted).toBe(true);
  });
});

describe('usePaginatedFetch — erros', () => {
  it('exibe message do ApiError quando fetcher rejeita com ApiError', async () => {
    const apiError: ApiError = {
      kind: 'http',
      status: 500,
      message: 'Erro interno do servidor.',
    };
    const fetcher = vi.fn(async () => {
      throw apiError;
    });

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'Falha genérica.',
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Erro interno do servidor.');
  });

  it('usa fallbackErrorMessage quando fetcher rejeita com erro arbitrário', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'Falha customizada.',
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Falha customizada.');
  });

  it('não exibe erro quando fetcher rejeita com AbortError', async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    });

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'X',
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.errorMessage).toBeNull();
  });

  it('não exibe erro quando fetcher rejeita com ApiError(network) "Requisição cancelada."', async () => {
    const apiError: ApiError = {
      kind: 'network',
      message: 'Requisição cancelada.',
    };
    const fetcher = vi.fn(async () => {
      throw apiError;
    });

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'X',
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.errorMessage).toBeNull();
  });
});

describe('usePaginatedFetch — skip', () => {
  it('não chama o fetcher e desliga isInitialLoading quando skip=true', async () => {
    const fetcher = vi.fn(async () => makePaged([]));

    const { result } = renderHook(() =>
      usePaginatedFetch<ListItem>({
        fetcher,
        fallbackErrorMessage: 'X',
        skip: true,
      }),
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it('volta a chamar o fetcher quando skip muda de true para false', async () => {
    const fetcher = vi.fn(async () => makePaged([{ id: 'a' }]));

    const { result, rerender } = renderHook(
      ({ skip }: { skip: boolean }) =>
        usePaginatedFetch<ListItem>({ fetcher, fallbackErrorMessage: 'X', skip }),
      { initialProps: { skip: true } },
    );

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();

    rerender({ skip: false });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'a' }]));
  });
});
