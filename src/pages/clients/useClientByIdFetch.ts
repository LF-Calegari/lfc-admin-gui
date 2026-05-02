import { useCallback, useEffect, useState } from 'react';

import { getClientById } from '../../shared/api';

import type { ApiClient, ClientDto } from '../../shared/api';

/**
 * Estado do fetch inicial — espelha o padrão usado por
 * `ClientDataTab` (módulo prévio à #146/#147 que ainda mantém o
 * estado inline). Encapsulado aqui para que as duas abas que listam
 * sub-coleções de um cliente (`ClientExtraEmailsTab` e
 * `ClientPhonesTab`) reusem a mesma máquina sem duplicar ~30 linhas
 * de boilerplate (lição PR #128/#134/#135).
 */
type FetchState = 'loading' | 'loaded' | 'error';

export interface UseClientByIdFetchResult {
  /** Estado corrente do fetch — controla render condicional na UI. */
  fetchState: FetchState;
  /** `ClientDto` carregado, ou `null` quando ainda não chegou. */
  loadedClient: ClientDto | null;
  /**
   * Dispara um novo fetch (resetando para `loading`) — útil após
   * mutações bem-sucedidas (sincronizar lista) ou erros que indicam
   * drift de estado (404, "Limite atingido").
   */
  triggerRefetch: () => void;
}

/**
 * Hook compartilhado que carrega um cliente individual via
 * `getClientById(id)` e expõe um estado de fetch + função de refetch.
 *
 * **Por que extraído (lição PR #128/#134/#135):** as abas
 * `ClientExtraEmailsTab` (#146) e `ClientPhonesTab` (#147) faziam o
 * mesmo `useEffect` de fetch idêntico (~30 linhas: AbortController,
 * cancellation flag, AbortError suppression, reload counter, error
 * handler). Sonar/JSCPD tokenizam isso como bloco duplicado. Promover
 * a um hook compartilhado deduplica e abre caminho para um terceiro
 * consumidor (ex.: futuras coleções de Cliente sem refator
 * destrutivo).
 *
 * **Cancelamento defensivo:** o effect monta um `AbortController` e
 * uma flag `isCancelled`. Em unmount/route change, ambos disparam:
 * - `controller.abort()` cancela o fetch in-flight no nível HTTP.
 * - `isCancelled` impede `setState` em componente desmontado (evita
 *   warning "Can't perform a React state update on an unmounted
 *   component").
 *
 * Cancelamento explícito (`AbortError`) é silenciado — não vira
 * erro de UI.
 *
 * **Refetch via `reloadCounter`:** incrementar a chave força o effect
 * a rodar de novo (a dep array inclui `reloadCounter`). Padrão
 * idiomático que evita `useEffect` controlado por `setState`
 * artificial — mais simples que SWR/React Query para o caso de um
 * único recurso.
 *
 * **Estado de erro inicial:** quando `id` é vazio/undefined (rota
 * malformada), o estado é setado direto para `error` — preserva o
 * `ErrorRetryBlock` ainda que o fetch nunca dispare.
 *
 * @param id ID do cliente (de `useParams`). `undefined`/string vazia
 *           força `error`.
 * @param client Cliente HTTP injetável para testes; default = singleton.
 */
export function useClientByIdFetch(
  id: string | undefined,
  client?: ApiClient,
): UseClientByIdFetchResult {
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [loadedClient, setLoadedClient] = useState<ClientDto | null>(null);
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  useEffect(() => {
    if (id === undefined || id.length === 0) {
      setFetchState('error');
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setFetchState('loading');

    getClientById(id, { signal: controller.signal }, client)
      .then((dto) => {
        if (isCancelled) return;
        setLoadedClient(dto);
        setFetchState('loaded');
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }
        setFetchState('error');
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [id, client, reloadCounter]);

  const triggerRefetch = useCallback(() => {
    setReloadCounter((prev) => prev + 1);
  }, []);

  return { fetchState, loadedClient, triggerRefetch };
}
