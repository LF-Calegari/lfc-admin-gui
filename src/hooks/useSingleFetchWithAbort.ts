import { useCallback, useEffect, useRef, useState } from 'react';

import { extractErrorMessage, isFetchAborted } from '../shared/api';

import type { SafeRequestOptions } from '../shared/api';

/**
 * Função de fetch consumida pelo hook. Recebe `options` com `signal`
 * para cancelamento e devolve uma `Promise` do recurso (não-paginado).
 *
 * Genérico em `T` — o caller define o tipo do recurso devolvido pelo
 * backend (ex.: `ReadonlyArray<EffectivePermissionDto>` para o painel
 * de permissões efetivas, `UserDto` para um detalhe).
 */
export type SingleFetcher<T> = (options: SafeRequestOptions) => Promise<T>;

/**
 * Estado retornado por `useSingleFetchWithAbort` para o componente
 * consumir.
 *
 * - `data` — payload da última request bem-sucedida (`null` em
 *   loading inicial / erro).
 * - `isInitialLoading` — `true` enquanto a primeira request não
 *   completou (sucesso OU erro).
 * - `errorMessage` — mensagem amigável quando o fetch falhou; `null`
 *   em sucesso ou cancelamento.
 * - `refetch` — força reexecutar o fetch (usado pelo botão "Tentar
 *   novamente" e por callbacks pós-mutação).
 */
export interface UseSingleFetchWithAbortResult<T> {
  data: T | null;
  isInitialLoading: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

interface UseSingleFetchWithAbortConfig<T> {
  /**
   * Função que executa a request — recebe `signal` para cancelamento e
   * devolve o payload tipado. **Crucial:** o caller deve memoizar com
   * `useCallback` (com dependências sobre os params reais) para que o
   * hook saiba quando refazer fetch. Toda vez que `fetcher` mudar de
   * identidade, o effect dispara nova request.
   */
  fetcher: SingleFetcher<T>;
  /**
   * Mensagem genérica usada quando o erro não é um `ApiError` reconhecido
   * pelo `extractErrorMessage`. Cada página passa sua própria copy em
   * pt-BR (ex.: "Falha ao carregar as permissões efetivas...").
   */
  fallbackErrorMessage: string;
  /**
   * Quando `true`, o effect skipa a request e desliga `isInitialLoading`.
   * Usado por páginas que recebem `:id` da URL e querem evitar bater no
   * backend quando o id é claramente inválido (validação client-side).
   */
  skip?: boolean;
}

/**
 * Hook compartilhado que encapsula o pattern de fetch único de um
 * recurso (não-paginado) com cancelamento via AbortController,
 * tratamento padrão de erro e bumper de retry.
 *
 * **Por que existe (lições PR #134/#135):** as páginas
 * `UserPermissionsShellPage` (Issue #70) e
 * `UserEffectivePermissionsShellPage` (Issue #72) repetiam ~38 linhas
 * de orquestração idêntica:
 *
 * 1. `useState` com `{ isInitialLoading, errorMessage, fetched, refetchNonce }`.
 * 2. `useRef<AbortController>` para cancelar requests anteriores.
 * 3. `handleRefetch` callback bumpando o nonce.
 * 4. `useEffect` que cria controller, chama fetcher, trata erros
 *    genericamente via `extractErrorMessage` + `isFetchAborted`.
 *
 * JSCPD tokeniza esse bloco como duplicado mesmo com call-sites em
 * páginas diferentes — extrair em hook genérico parametrizado por
 * `TData` mantém a fonte única e elimina o clone.
 *
 * **Diferença vs `usePaginatedFetch`:**
 *
 * - `usePaginatedFetch` lida com `PagedResponse<T>` (envelope com
 *   `page`/`pageSize`/`total`/`data`) e expõe `rows` em vez de `data`.
 * - Este hook lida com qualquer payload (`T`) e expõe `data` direto.
 *
 * Páginas que carregam **um único recurso** (efetivas, detalhe de
 * usuário, role com permissões) usam este; páginas que carregam **uma
 * página de lista** usam `usePaginatedFetch`.
 */
export function useSingleFetchWithAbort<T>(
  config: UseSingleFetchWithAbortConfig<T>,
): UseSingleFetchWithAbortResult<T> {
  const { fetcher, fallbackErrorMessage, skip = false } = config;

  const [state, setState] = useState<{
    data: T | null;
    isInitialLoading: boolean;
    errorMessage: string | null;
    refetchNonce: number;
  }>({
    data: null,
    isInitialLoading: true,
    errorMessage: null,
    refetchNonce: 0,
  });

  const lastControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isInitialLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }, []);

  useEffect(() => {
    if (skip) {
      setState((prev) => ({ ...prev, isInitialLoading: false }));
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    lastControllerRef.current?.abort();
    lastControllerRef.current = controller;

    setState((prev) => ({ ...prev, isInitialLoading: true, errorMessage: null }));

    fetcher({ signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          data,
          isInitialLoading: false,
          errorMessage: null,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isFetchAborted(error)) return;
        setState((prev) => ({
          ...prev,
          isInitialLoading: false,
          errorMessage: extractErrorMessage(error, fallbackErrorMessage),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetcher, fallbackErrorMessage, skip, state.refetchNonce]);

  return {
    data: state.data,
    isInitialLoading: state.isInitialLoading,
    errorMessage: state.errorMessage,
    refetch,
  };
}
