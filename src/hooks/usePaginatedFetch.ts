import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError } from '../shared/api';

import type { PagedResponse, SafeRequestOptions } from '../shared/api';

/**
 * Estado retornado por `usePaginatedFetch` para o componente consumir.
 *
 * - `rows` — itens da página corrente (vazio em loading/erro).
 * - `pageSize` — tamanho aplicado pelo backend (pode diferir do
 *   solicitado quando o backend impõe limite).
 * - `total` — total filtrado (para cálculo de `totalPages`).
 * - `isInitialLoading` — `true` enquanto a primeira request não
 *   completou (sucesso OU erro). Mantém o componente exibindo spinner
 *   cheio em vez de overlay.
 * - `isFetching` — `true` enquanto qualquer refetch subsequente está
 *   em curso (depois da primeira). Liga o overlay leve sobre os dados
 *   anteriores.
 * - `errorMessage` — mensagem amigável quando o fetch falhou; `null`
 *   em sucesso ou cancelamento.
 * - `refetch` — bumper monotônico que força reexecutar o fetch sem
 *   alterar parâmetros (usado pelo botão "Tentar novamente" e pelos
 *   callbacks pós-mutação `onCreated`/`onUpdated`/`onDeleted`).
 */
export interface UsePaginatedFetchResult<T> {
  rows: ReadonlyArray<T>;
  pageSize: number;
  total: number;
  isInitialLoading: boolean;
  isFetching: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

/**
 * Função de fetch consumida pelo hook. Recebe `options` com `signal`
 * para cancelamento e devolve uma `Promise` do envelope paginado.
 *
 * Tipada com `void` em retorno auxiliar permitiria parametrizar mas
 * complica em uso — preferimos `Promise<PagedResponse<T>>` direto, que
 * é o contrato do `lfc-authenticator` para todos os endpoints de
 * listagem (`GET /systems`, `GET /systems/routes`, etc.).
 */
export type PaginatedFetcher<T> = (
  options: SafeRequestOptions,
) => Promise<PagedResponse<T>>;

interface UsePaginatedFetchConfig<T> {
  /**
   * Função que executa a request — recebe `signal` para cancelamento e
   * devolve o envelope paginado. **Crucial:** o caller deve memoizar
   * com `useCallback` (com dependências sobre os params reais) para
   * que o hook saiba quando refazer fetch. Toda vez que `fetcher`
   * mudar de identidade, o effect dispara nova request.
   */
  fetcher: PaginatedFetcher<T>;
  /**
   * Mensagem genérica usada quando o erro não é um `ApiError` (ex.:
   * `Error('boom')` lançado por algum middleware fora do contrato).
   * Cada página passa sua própria copy em pt-BR ("Falha ao carregar a
   * lista de sistemas..." / "Falha ao carregar a lista de rotas...").
   */
  fallbackErrorMessage: string;
  /**
   * Quando `true`, o effect skipa a request (não chama `fetcher`) e
   * desliga `isInitialLoading`. Usado pela `RoutesPage` quando o
   * `:systemId` da URL é inválido — o componente exibe o aviso
   * dedicado e nunca bate no backend.
   */
  skip?: boolean;
}

/**
 * Hook compartilhado que encapsula o pattern de listagem paginada com
 * cancelamento via AbortController, distinção entre loading inicial e
 * refetch, tratamento padrão de erro e bumper de retry.
 *
 * Originalmente o pattern vivia inline na `SystemsPage` (Issue #126/
 * EPIC #45). A duplicação previsível em `RoutesPage` (Issue #62/EPIC
 * #46) — e nas próximas pages de listagem (Roles, Permissions, Users)
 * — exigiu extrair em hook compartilhado **agora**, no primeiro PR da
 * EPIC nova, em vez de esperar o segundo módulo aparecer e depois
 * refatorar. Lição PR #128: "ao tocar 2+ arquivos similares, projetar
 * shared helpers desde o primeiro PR do recurso, não esperar o segundo
 * modal aparecer e depois refatorar".
 *
 * Decisões importantes:
 *
 * 1. **`fetcher` em vez de `(params) => promise`** — o caller já tem
 *    seus próprios estados de busca/page/filter; passa-los como
 *    parâmetros do hook duplicaria o estado em duas camadas. O caller
 *    memoiza `fetcher` via `useCallback` com dependências sobre os
 *    params, e o hook simplesmente reage à mudança de identidade —
 *    padrão recomendado pelo React quando "params" são heterogêneos
 *    (cada listagem tem seu shape próprio).
 *
 * 2. **`skip` opt-in para validação client-side** — algumas pages
 *    precisam evitar a request quando params são inválidos (ex.:
 *    `RoutesPage` com `:systemId` ausente). Em vez de exigir que cada
 *    caller faça `if (invalid) return early` antes do hook (impossível
 *    porque o hook **deve** ser chamado a cada render), passamos
 *    `skip` como flag. Quando `true`, o hook desliga `isInitialLoading`
 *    e mantém o resto do estado quieto.
 *
 * 3. **Cancelamento via AbortController** — o cleanup do effect
 *    dispara `abort()` no controller anterior antes da próxima
 *    execução. O catch ignora `AbortError` para que cancelamento não
 *    vire toast/Alert — fluxo normal, não erro de UI.
 *
 * 4. **`refetch` é um bumper, não uma chamada direta** — devolver uma
 *    função que dispara fetch fora do useEffect quebra o invariante
 *    "controller.abort() do anterior". Em vez disso, `refetch`
 *    incrementa um nonce monotônico que entra como dependência do
 *    effect, e o React rerunneia o ciclo completo (cleanup + run).
 */
export function usePaginatedFetch<T>(
  config: UsePaginatedFetchConfig<T>,
): UsePaginatedFetchResult<T> {
  const { fetcher, fallbackErrorMessage, skip = false } = config;

  const [rows, setRows] = useState<ReadonlyArray<T>>([]);
  const [pageSize, setPageSize] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  // Controller da request mais recente — usado para cancelar a
  // anterior em mudanças rápidas de params.
  const lastControllerRef = useRef<AbortController | null>(null);
  // Sinaliza se a primeira request já completou. Após o primeiro
  // ciclo, refetches usam `isFetching=true` em vez de
  // `isInitialLoading=true` (overlay leve em vez de spinner cheio).
  const hasCompletedFirstRequestRef = useRef<boolean>(false);

  const refetch = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (skip) {
      // Reset hard quando o caller pede skip (ex.: `:systemId` inválido).
      // Não disparamos `setIsFetching(false)` porque o overlay não está
      // ligado — e mantemos `errorMessage` como está (caller controla).
      setIsInitialLoading(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    lastControllerRef.current?.abort();
    lastControllerRef.current = controller;

    if (hasCompletedFirstRequestRef.current) {
      setIsFetching(true);
    }

    fetcher({ signal: controller.signal })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setPageSize(response.pageSize);
        setTotal(response.total);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Cancelamento explícito (fetch abortado) é fluxo normal — não
        // vira erro de UI. Cobrimos os dois shapes possíveis: o
        // `DOMException(AbortError)` lançado pelo `fetch` nativo e o
        // `ApiError(network)` que o `apiClient` traduz quando o signal
        // é abortado antes da resposta.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (
          isApiError(error) &&
          error.kind === 'network' &&
          error.message === 'Requisição cancelada.'
        ) {
          return;
        }
        setErrorMessage(extractErrorMessage(error, fallbackErrorMessage));
      })
      .finally(() => {
        if (cancelled) return;
        hasCompletedFirstRequestRef.current = true;
        setIsInitialLoading(false);
        setIsFetching(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetcher, fallbackErrorMessage, retryNonce, skip]);

  return {
    rows,
    pageSize,
    total,
    isInitialLoading,
    isFetching,
    errorMessage,
    refetch,
  };
}

/**
 * Extrai mensagem amigável de qualquer erro vindo da camada HTTP.
 *
 * Quando o erro é um `ApiError`, devolvemos a `message` (o cliente já
 * resolveu fallbacks por status). Para erros arbitrários, usamos a
 * `fallback` em pt-BR específica da página chamadora — preserva
 * privacidade da arquitetura (não vaza stack/objeto cru) sem mascarar
 * a origem do problema.
 *
 * Centralizada aqui porque é parte intrínseca do contrato do hook —
 * cada caller passa sua própria copy via `fallbackErrorMessage`.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return error.message;
  }
  return fallback;
}
