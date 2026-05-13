import { useCallback } from 'react';

import { listSystems } from '../shared/api';

import { useSingleFetchWithAbort } from './useSingleFetchWithAbort';

import type { ApiClient, PagedResponse, SafeRequestOptions, SystemDto } from '../shared/api';

/**
 * Catálogo de sistemas para modais que precisam de `<Select>` de sistema
 * (`NewRouteModal` modo global, `NewPermissionModal`). Centraliza o par
 * `useCallback` + `useSingleFetchWithAbort` que o JSCPD tokenizava como
 * duplicação ≥10 linhas (Issue #201).
 */
export function useModalListSystemsFetch(params: {
  open: boolean;
  /** Quando `true`, não dispara request mesmo com `open` (ex.: rota per-system). */
  skip: boolean;
  pageSize: number;
  client?: ApiClient;
  fallbackErrorMessage: string;
}): ReturnType<
  typeof useSingleFetchWithAbort<PagedResponse<SystemDto>>
> {
  const { open, skip, pageSize, client, fallbackErrorMessage } = params;

  const fetcher = useCallback(
    (options: SafeRequestOptions): Promise<PagedResponse<SystemDto>> =>
      listSystems({ pageSize }, options, client),
    [client, pageSize],
  );

  return useSingleFetchWithAbort({
    fetcher,
    fallbackErrorMessage,
    skip: !open || skip,
  });
}
