import { useCallback } from 'react';

import {
  applyRemoveCollectionAction,
  type ApplyRemoveCollectionAction,
} from './applyCollectionMutationAction';

import type { ApiClient, SafeRequestOptions } from '../../shared/api';

/**
 * Side-effect imperativo para toast (abstrai `useToast().show`).
 */
type ShowToast = (
  message: string,
  options: { variant: 'success' | 'danger' | 'info'; title?: string },
) => void;

interface RemoveCopy {
  genericFallback: string;
  forbiddenTitle: string;
  notFoundMessage: string;
}

/**
 * Subset do `useClientRemoveCollectionConfirm` que este hook precisa
 * para aplicar a ação. Aceita interface mínima — caller injeta os
 * dispatchers vindos do hook concreto.
 */
interface RemoveConfirmDispatchers {
  reset: () => void;
  beginSubmit: () => void;
  stopSubmitting: () => void;
}

interface UseClientCollectionRemoveSubmitArgs<TAction> {
  /** Cliente HTTP injetável (default = singleton). */
  client?: ApiClient;
  /**
   * Função API que faz o DELETE efetivo. Recebe `clientId`, `itemId`,
   * `options`, `client`. Tipicamente `removeClientExtraEmail`,
   * `removeClientMobilePhone`, etc.
   */
  removeFn: (
    clientId: string,
    itemId: string,
    options?: SafeRequestOptions,
    client?: ApiClient,
  ) => Promise<void>;
  /**
   * Classifier que converte `unknown` lançado por `removeFn` em
   * `TAction` discriminado. `TAction` deve incluir as variantes
   * comuns (`not-found`/`toast`/`unhandled`) — caller pode estender
   * com casos próprios (ex.: `username` no email).
   */
  classifyError: (error: unknown, copy: RemoveCopy) => TAction;
  /** Cópia injetada no classifier (mensagens em pt-BR). */
  copy: RemoveCopy;
  /** Toast exibido em caso de sucesso. */
  successToast: string;
  /** Dispatchers do confirm (vindo de `useClientRemoveCollectionConfirm`). */
  confirm: RemoveConfirmDispatchers;
  /** Callback `useToast().show` injetado pelo caller. */
  show: ShowToast;
  /** Função para refazer o fetch após sucesso/not-found. */
  triggerRefetch: () => void;
}

/**
 * Resultado retornado pelo hook — função `submit` que o caller chama
 * passando `clientId` + `itemId` + opcional handler para casos
 * específicos do classifier (ex.: `username` no email).
 */
export interface UseClientCollectionRemoveSubmitResult<TAction> {
  /**
   * Executa o DELETE e mapeia o resultado. Retorna `Promise<void>` —
   * o caller pode `await` se precisar de side-effects depois.
   *
   * `customAction` é chamado com a ação classificada **antes** do
   * fluxo padrão. Se retornar `true`, o hook entende que o caller
   * tratou e não delega ao `applyRemoveCollectionAction`. Se retornar
   * `false` (ou ausente), o hook trata os casos comuns (`not-found`/
   * `toast`/`unhandled`) automaticamente.
   *
   * **Por que esse padrão?** O `removeClientExtraEmail` tem um caso
   * extra `username` (400 com mensagem orientadora — toast vermelho)
   * que não existe em `removeClientMobilePhone`/`removeClientLandlinePhone`.
   * Em vez de duplicar todo o handler para gerenciar essa única
   * variante, o caller passa `customAction` que intercepta o caso
   * específico.
   */
  submit: (
    clientId: string,
    itemId: string,
    customAction?: (action: TAction) => boolean,
  ) => Promise<void>;
}

/**
 * Hook compartilhado que encapsula `try`/`catch` do DELETE para os
 * removes de coleções de cliente.
 *
 * **Por que extraído (lição PR #128/#134/#135):** o `handleConfirmRemove`
 * de ambas as abas (`ClientExtraEmailsTab` — #146 e `ClientPhonesTab`
 * — #147) tinha ~20 linhas idênticas (`beginSubmit` → `await removeFn`
 * → `show` success → `reset` → `triggerRefetch` no try; `classify` →
 * `applyRemoveCollectionAction` no catch). Sonar/JSCPD tokenizava
 * como bloco duplicado entre arquivos. Promover para hook deduplica.
 *
 * **Compatibilidade com classifier estendido:** o classifier do email
 * inclui `username` (400 orientadora) que o phone não tem. O type
 * `TAction` é union ampla — caller passa `customAction` que
 * intercepta variantes próprias antes de cair no fluxo padrão.
 */
export function useClientCollectionRemoveSubmit<TAction>({
  client,
  removeFn,
  classifyError,
  copy,
  successToast,
  confirm,
  show,
  triggerRefetch,
}: UseClientCollectionRemoveSubmitArgs<TAction>): UseClientCollectionRemoveSubmitResult<TAction> {
  const submit = useCallback(
    async (
      clientId: string,
      itemId: string,
      customAction?: (action: TAction) => boolean,
    ): Promise<void> => {
      confirm.beginSubmit();
      try {
        await removeFn(clientId, itemId, undefined, client);
        show(successToast, { variant: 'success' });
        confirm.reset();
        triggerRefetch();
      } catch (error: unknown) {
        const action = classifyError(error, copy);
        // Caller pode interceptar variantes próprias do classifier
        // antes do fluxo padrão. Quando `customAction` consome a
        // ação (retorna `true`), encerramos sem delegar ao
        // `applyRemoveCollectionAction`.
        if (customAction !== undefined && customAction(action)) {
          return;
        }
        // Cast seguro — `customAction` intercepta variantes próprias
        // do classifier (ex.: `username` no email); o fluxo padrão
        // recebe apenas o subset coberto por `applyRemoveCollectionAction`
        // (`not-found`/`toast`/`unhandled`). Caller é responsável por
        // garantir esse contrato no `customAction`.
        applyRemoveCollectionAction(
          action as unknown as ApplyRemoveCollectionAction,
          {
            resetRemoveConfirm: confirm.reset,
            stopSubmitting: confirm.stopSubmitting,
          },
          show,
          triggerRefetch,
        );
      }
    },
    [client, classifyError, confirm, copy, removeFn, show, successToast, triggerRefetch],
  );

  return { submit };
}
