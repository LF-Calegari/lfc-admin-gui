import { useEffect } from 'react';

import {
  applyAddCollectionAction,
  type ApplyAddCollectionAction,
} from './applyCollectionMutationAction';

import type { ApiClient, BodyRequestOptions } from '../../shared/api';

/**
 * Side-effect imperativo para toast — abstrai `useToast().show` para
 * que o hook não acople ao provider e os testes possam injetar spies.
 */
type ShowToast = (
  message: string,
  options: { variant: 'success' | 'danger' | 'info'; title?: string },
) => void;

/**
 * Cópia de erro injetada pelo caller (alias do `SharedHttpErrorCopy`
 * em `src/shared/forms/`). Mantida como `unknown`-friendly aqui para
 * preservar o contrato do classifier injetado, que aceita qualquer
 * subset compatível.
 */
interface AddCopy {
  genericFallback: string;
  forbiddenTitle: string;
  notFoundMessage: string;
}

/**
 * Subset do `useClientAddCollectionModal` que este hook precisa para
 * aplicar a ação. Aceitar a interface mínima (em vez do hook inteiro)
 * deixa o helper agnóstico ao shape do estado interno.
 */
interface AddModalDispatchers {
  reset: () => void;
  setInlineErrorAndStop: (message: string) => void;
  stopSubmitting: () => void;
}

interface UseClientCollectionAddSubmitArgs {
  /** Estado de submit do modal (`addModal.state.isSubmitting`). */
  isSubmitting: boolean;
  /** Valor do input no instante em que `isSubmitting` virou `true`. */
  value: string;
  /**
   * `id` do cliente alvo (vindo do `loadedClient`). `null` desativa
   * o effect — pré-condição para o submit ser disparado.
   */
  clientId: string | null;
  /** Cliente HTTP injetável para testes (default = singleton). */
  client?: ApiClient;
  /**
   * Função API que faz o POST efetivo (`addClientExtraEmail`,
   * `addClientMobilePhone`, etc.). Recebe `id`, `value`, `options`,
   * `client` — assinatura padrão das funções de mutação do
   * `shared/api/clients.ts`.
   */
  addFn: (
    clientId: string,
    value: string,
    options?: BodyRequestOptions,
    client?: ApiClient,
  ) => Promise<unknown>;
  /**
   * Classifier que converte `unknown` lançado pelo `addFn` em uma
   * `ApplyAddCollectionAction` discriminada. Tipicamente
   * `classifyAddPhoneError` ou `classifyAddExtraEmailError`.
   */
  classifyError: (error: unknown, copy: AddCopy) => ApplyAddCollectionAction;
  /** Cópia injetada no classifier (mensagens em pt-BR). */
  copy: AddCopy;
  /** Toast exibido em caso de sucesso. */
  successToast: string;
  /** Dispatchers do modal (vindo de `useClientAddCollectionModal`). */
  modal: AddModalDispatchers;
  /** Callback `useToast().show` — o caller passa para isolar provider. */
  show: ShowToast;
  /** Função para refazer o fetch após sucesso/limit-reached/not-found. */
  triggerRefetch: () => void;
}

/**
 * Hook que dispara a chamada HTTP de adicionar item quando o modal
 * sinaliza `isSubmitting=true`, e mapeia o resultado para os
 * dispatchers do modal.
 *
 * **Por que extraído (lição PR #128/#134/#135):** ambas as abas
 * `ClientExtraEmailsTab` (#146) e `ClientPhonesTab` (#147) tinham o
 * mesmo `useEffect` de ~38 linhas (`AbortController` + `then`/
 * `catch` + `applyAddCollectionAction`) divergindo só em `addFn` e
 * `classifyError`. Sonar/JSCPD tokenizava como bloco duplicado entre
 * arquivos. Promover para hook compartilhado deduplica e abre caminho
 * para o terceiro consumidor sem refator destrutivo.
 *
 * **Cancelamento defensivo:** o effect monta um `AbortController` e
 * uma flag `isCancelled` — em unmount ou em refetch concorrente, o
 * fetch in-flight é cancelado e o `setState` resultante é ignorado
 * (evita "Can't perform a React state update on an unmounted
 * component").
 *
 * **Closure stale:** `addModal.state.value` é capturado no instante
 * em que `isSubmitting` virou `true`. O `eslint-disable-next-line` é
 * intencional — incluir `value` na dep array recriaria o effect a
 * cada keystroke, disparando submits espúrios.
 */
export function useClientCollectionAddSubmit({
  isSubmitting,
  value,
  clientId,
  client,
  addFn,
  classifyError,
  copy,
  successToast,
  modal,
  show,
  triggerRefetch,
}: UseClientCollectionAddSubmitArgs): void {
  useEffect(() => {
    if (!isSubmitting || clientId === null) return;
    let isCancelled = false;
    const controller = new AbortController();

    addFn(clientId, value.trim(), { signal: controller.signal }, client)
      .then(() => {
        if (isCancelled) return;
        show(successToast, { variant: 'success' });
        modal.reset();
        triggerRefetch();
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }
        const action = classifyError(error, copy);
        applyAddCollectionAction(
          action,
          {
            setInlineErrorAndStop: modal.setInlineErrorAndStop,
            resetAddModal: modal.reset,
            stopSubmitting: modal.stopSubmitting,
          },
          show,
          triggerRefetch,
        );
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
    // `value` é capturado no instante em que `isSubmitting` vira
    // `true`; subsequentes keystrokes não disparam novo submit
    // (`isSubmitting=true` só vira `false` ao terminar).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting, clientId, client, show, triggerRefetch]);
}
