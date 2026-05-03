import { useCallback } from 'react';

import { applyCreateSubmitAction } from './applyCreateSubmitAction';
import {
  classifyApiSubmitError,
  type ApiSubmitErrorCopy,
} from './classifySubmitError';

/**
 * Variantes aceitas pelo `showToast` injetado — espelha o subset usado
 * pelos modals de criação (`success` para o caminho feliz, `danger`
 * para erros). Tipar como literal evita que o caller passe
 * acidentalmente uma variante incompatível com o design system.
 */
type ToastVariant = 'success' | 'danger';

/**
 * Assinatura mínima do `show` retornado por `useToast()` — duplicar
 * aqui o tipo seria pior (acoplaria o helper com o hook do design
 * system). Manter como `function type` deixa o caller passar a
 * referência de `useToast().show` diretamente.
 */
type ShowToast = (
  message: string,
  options: { variant: ToastVariant; title?: string },
) => void;

/**
 * Setters/dispatchers que o modal de criação precisa expor para o hook
 * coordenar o submit. São os mesmos do `useEditEntitySubmit` mais o
 * caminho específico de "conflito inline" — em create o 409 mapeia
 * para um único campo de unicidade (ex.: `code` em sistemas/rotas,
 * `email` em users).
 *
 * `TField` é a união de chaves do form (ex.: `'name' | 'code' |
 * 'description'` para sistemas; `'name' | 'email' | 'password' |
 * 'identity' | 'clientId'` para users). Manter genérico preserva a
 * tipagem do `setFieldErrors` no call-site sem vazar o shape específico
 * do recurso para o hook.
 */
export interface CreateEntitySubmitDispatchers<TField extends string> {
  /** Atualiza o estado de erros inline (Partial respeita as chaves do form). */
  setFieldErrors: (errors: Partial<Record<TField, string>>) => void;
  /** Limpa o `submitError` exibido em Alert no topo do form. */
  setSubmitError: (message: string | null) => void;
  /** Atualiza a flag `isSubmitting` (chamada no `finally`). */
  setIsSubmitting: (value: boolean) => void;
  /**
   * Dispatcher do caminho `bad-request` — recebe `details` cru do
   * backend e a mensagem fallback caso `ValidationProblemDetails` não
   * seja mapeável. Cada modal injeta o `applyBadRequest` retornado
   * pelo seu hook de form (`useSystemForm`/`useRouteForm`/`useUserForm`).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
  /** Dispatcher de toast — espelha a assinatura de `useToast().show`. */
  showToast: ShowToast;
  /**
   * Reset do estado controlado pelo hook do form do recurso
   * (`setFormState(INITIAL_*)`, `setFieldErrors({})`, `setSubmitError(null)`).
   * Disparado no caminho feliz **antes** de `onCreated`/`onClose` para que
   * uma reabertura imediata do modal não veja resíduo. Cada modal injeta
   * sua própria versão (depende do `INITIAL_*_FORM_STATE` do recurso).
   */
  resetForm: () => void;
}

/**
 * Cópia textual e identificadores fixos do recurso. Os literais aqui
 * são os únicos pontos onde "rota"/"sistema"/"usuário" diferem entre
 * os modals — toda a lógica de orquestração vive no hook.
 */
export interface CreateEntitySubmitCopy {
  /**
   * Mensagem do toast verde exibido após sucesso (ex.: 'Sistema
   * criado.', 'Rota criada.', 'Usuário criado.').
   */
  successMessage: string;
  /**
   * Mensagem inline exibida no campo de unicidade quando o backend
   * devolve 409. Quando `undefined`, o helper usa a mensagem do
   * próprio backend (`action.message`) — coerente com o
   * `NewSystemModal`. O `NewRouteModal` injeta um valor explícito
   * porque a copy do backend ("Já existe uma route com este Code.")
   * é menos clara que a copy custom do UI ("Já existe uma rota com
   * este código neste sistema.").
   */
  conflictInlineMessage?: string;
  /** Copy injetada em `classifyApiSubmitError`. */
  submitErrorCopy: ApiSubmitErrorCopy;
}

/**
 * Callbacks de coordenação com o pai e dependências do efeito. Os
 * callbacks devem ser estáveis (memoizados pelo caller) — o hook
 * inclui todos no `useCallback` deps array.
 */
export interface CreateEntitySubmitCallbacks {
  /**
   * Roda a validação client-side e prepara o payload trimado.
   * Devolve o payload pronto para envio quando válido, ou `null`
   * quando há erros client-side (que já foram propagados via
   * `setFieldErrors`).
   *
   * O caller injeta sua versão (`prepareSubmit()` para sistemas/users,
   * `prepareSubmit(systemId)` para rotas — para rotas, basta o caller
   * fechar sobre o `systemId` antes de injetar).
   */
  prepareSubmit: () => unknown | null;
  /**
   * Executa a mutação remota com o payload validado. Tipicamente
   * `(payload) => createSystem(payload, undefined, client)`,
   * `(payload) => createRoute(payload, undefined, client)`,
   * `(payload) => createUser(payload, undefined, client)`.
   */
  mutationFn: (payload: unknown) => Promise<unknown>;
  /** Refetch da lista no pai — disparado após sucesso. */
  onCreated: () => void;
  /** Fecha o modal — disparado após sucesso. */
  onClose: () => void;
}

/**
 * Hook compartilhado pelos modals de criação (`NewSystemModal`,
 * `NewRouteModal`, `NewUserModal` e os futuros do CRUD de roles/clients/
 * permissions) — encapsula o ciclo completo de submit para eliminar a
 * duplicação Sonar de 30+ linhas que aparece quando dois modals de
 * criação usam o mesmo padrão `prepareSubmit -> mutationFn -> classify
 * -> dispatch` com dispatchers idênticos.
 *
 * **Por que existe (lição PR #134/#135 — 6ª recorrência potencial):**
 *
 * Mesmo após extrair `classifyApiSubmitError` em `src/shared/forms/`, o
 * **call-site** do helper (a chamada com os dispatchers fixos +
 * `finally` + `useCallback` deps array + `switch` exaustivo) é
 * praticamente idêntico entre `NewSystemModal` e `NewRouteModal` —
 * Sonar tokeniza esse bloco como New Code Duplication (4.8% > 3% no
 * PR #135). Espelha exatamente o `useEditEntitySubmit` que cobriu o
 * lado "edit" desde a PR #135.
 *
 * Centralizar aqui:
 *
 * 1. Reduz `handleSubmit` de cada modal de criação para ~3 linhas
 *    (preventDefault + dedupe gate + chamada do hook).
 * 2. Garante simetria de comportamento entre os modals (mesmo ordering
 *    de `onCreated` antes de `onClose`, mesmo trim de erros após
 *    sucesso, mesma estratégia de `setIsSubmitting(false)` no
 *    `finally`).
 * 3. Concentra os pontos de evolução (ex.: telemetria de submit,
 *    retry com backoff, cancelamento) em um único lugar — quando o
 *    backend introduzir headers de idempotência ou rate-limit, mexer
 *    aqui propaga para todos os recursos sem refator distribuído.
 *
 * **Por que não usar React Query/SWR aqui?** O projeto não tem essa
 * dependência ainda (ver `package.json`), e adicioná-la num PR de
 * refactor para reduzir duplicação Sonar seria fora de escopo. O hook
 * mantém a forma da implementação atual (try/catch + `useToast`) e
 * preserva os testes de cada modal sem mudança de comportamento
 * observável.
 *
 * **Diferença para `useEditEntitySubmit`:** create não trata 404
 * (backend nunca devolve 404 nesse path — não há entidade para "sumir
 * entre abertura e submit"). Por isso o caso `not-found` cai no
 * fallback `unhandled` (toast genérico) em vez do
 * `onAfterNotFound = onCreated() + onClose()` do edit.
 */
export interface UseCreateEntitySubmitArgs<TField extends string> {
  dispatchers: CreateEntitySubmitDispatchers<TField>;
  copy: CreateEntitySubmitCopy;
  callbacks: CreateEntitySubmitCallbacks;
  /**
   * Campo de unicidade tratado pelo backend em 409 (`'code'` para
   * sistemas e rotas, `'email'` para users). Repassa para
   * `classifyApiSubmitError`. Manter tipo genérico preserva a
   * inferência no call-site
   * (`useCreateEntitySubmit<keyof UserFieldErrors>`).
   */
  conflictField: TField;
}

/**
 * Devolve um `handleSubmit` pronto para injetar no `<form onSubmit>`.
 *
 * O handler retornado faz o `event.preventDefault()` internamente —
 * caller precisa apenas passar `onSubmit={handleSubmit}` sem wrapper
 * inline.
 *
 * Retorna `Promise<void>` mesmo em erro síncrono — o consumidor não
 * precisa await, mas o tipo permite que callers que queiram (ex.:
 * testes) aguardem o ciclo completo.
 */
export function useCreateEntitySubmit<TField extends string>({
  dispatchers,
  copy,
  callbacks,
  conflictField,
}: UseCreateEntitySubmitArgs<TField>): (
  event: React.SyntheticEvent<HTMLFormElement>,
) => Promise<void> {
  const {
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    applyBadRequest,
    showToast,
    resetForm,
  } = dispatchers;
  const { successMessage, conflictInlineMessage, submitErrorCopy } = copy;
  const { prepareSubmit, mutationFn, onCreated, onClose } = callbacks;

  return useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      // `prepareSubmit` valida + zera erros + marca submitting + devolve
      // payload trimado, ou `null` quando há erros client-side. O caller
      // já cuidou do dedupe (`isSubmitting` gate) antes de chegar aqui.
      const payload = prepareSubmit();
      if (payload === null) return;

      try {
        await mutationFn(payload);
        // Mensagem de sucesso fixa (não citamos o nome — o usuário
        // acabou de digitar e a lista será atualizada).
        showToast(successMessage, { variant: 'success' });
        // Ordem importa: reset local + refetch antes de fechar para o
        // pai não ter que coordenar dois ticks separados.
        resetForm();
        onCreated();
        onClose();
      } catch (error: unknown) {
        // `classifyApiSubmitError` decide o `kind`; `applyCreateSubmitAction`
        // despacha os efeitos colaterais (setState/toast). Helper
        // compartilhado entre todos os recursos — eliminou ~16 linhas
        // de switch idêntico ao `applyEditSubmitAction` (lição PR
        // #128/#134/#135).
        const action = classifyApiSubmitError<TField>(
          error,
          submitErrorCopy,
          conflictField,
        );
        applyCreateSubmitAction<TField>(
          action,
          { setFieldErrors, setSubmitError, applyBadRequest, showToast },
          submitErrorCopy,
          { conflictInlineMessage },
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyBadRequest,
      conflictField,
      conflictInlineMessage,
      mutationFn,
      onClose,
      onCreated,
      prepareSubmit,
      resetForm,
      setFieldErrors,
      setIsSubmitting,
      setSubmitError,
      showToast,
      submitErrorCopy,
      successMessage,
    ],
  );
}
