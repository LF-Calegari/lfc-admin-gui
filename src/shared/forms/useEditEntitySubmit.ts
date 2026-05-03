import { useCallback } from 'react';

import {
  applyEditSubmitAction,
  type EditSubmitActionCopy,
} from './applyEditSubmitAction';
import {
  classifyApiSubmitError,
  type ApiSubmitErrorCopy,
} from './classifySubmitError';

/**
 * Variantes aceitas pelo `showToast` injetado — espelha o subset usado
 * pelos modals de edição (`success` para o caminho feliz, `danger`
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
 * Setters/dispatchers que o modal de edição precisa expor para o hook
 * coordenar o submit. São os mesmos que `applyEditSubmitAction`
 * consome, mais o `setIsSubmitting` e o `showToast` para o caminho
 * feliz.
 *
 * `TField` é a união de chaves do form (ex.: `'name' | 'code' |
 * 'description'` para sistemas; idem + `'systemTokenTypeId'` para
 * rotas). Manter genérico preserva a tipagem do `setFieldErrors` no
 * call-site sem vazar o shape específico do recurso para o hook.
 */
export interface EditEntitySubmitDispatchers<TField extends string> {
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
   * pelo seu hook de form (`useSystemForm`/`useRouteForm`).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
  /** Dispatcher de toast — espelha a assinatura de `useToast().show`. */
  showToast: ShowToast;
}

/**
 * Cópias textuais e identificadores fixos do recurso. Os literais aqui
 * são os únicos pontos onde "rota"/"sistema" diferem entre os modals —
 * toda a lógica de orquestração vive no hook.
 */
export interface EditEntitySubmitCopy {
  /**
   * Mensagem do toast verde exibido após sucesso (ex.: 'Sistema
   * atualizado.', 'Rota atualizada.').
   */
  successMessage: string;
  /** Copy injetada em `classifyApiSubmitError`. */
  submitErrorCopy: ApiSubmitErrorCopy;
  /** Copy injetada em `applyEditSubmitAction`. */
  editSubmitActionCopy: EditSubmitActionCopy;
}

/**
 * Callbacks de coordenação com o pai e dependências do efeito. Os
 * callbacks devem ser estáveis (memoizados pelo caller) — o hook
 * inclui todos no `useCallback` deps array.
 */
export interface EditEntitySubmitCallbacks {
  /**
   * Roda a validação client-side e prepara o payload trimado.
   * Devolve o payload pronto para envio quando válido, ou `null`
   * quando há erros client-side (que já foram propagados via
   * `setFieldErrors`).
   *
   * O caller injeta sua versão (`prepareSubmit()` para sistemas,
   * `prepareSubmit(systemId)` para rotas — para rotas, basta o caller
   * fechar sobre o `route.systemId` antes de injetar).
   */
  prepareSubmit: () => unknown | null;
  /**
   * Executa a mutação remota com o payload validado. Tipicamente
   * `(payload) => updateSystem(system.id, payload, undefined, client)`
   * ou `(payload) => updateRoute(route.id, payload, undefined, client)`.
   */
  mutationFn: (payload: unknown) => Promise<unknown>;
  /** Refetch da lista no pai — disparado após sucesso e após 404. */
  onUpdated: () => void;
  /** Fecha o modal — disparado após sucesso e após 404. */
  onClose: () => void;
}

/**
 * Hook compartilhado pelos modals de edição (`EditSystemModal`,
 * `EditRouteModal` e os futuros do CRUD de roles/users/clients/
 * permissions) — encapsula o ciclo completo de submit para eliminar
 * a duplicação Sonar de 25+ linhas que aparece quando dois modals de
 * edição usam `applyEditSubmitAction` com dispatchers idênticos.
 *
 * **Por que existe (lição PR #134/#135 — 6ª recorrência):**
 *
 * Mesmo após extrair `applyEditSubmitAction` em `src/shared/forms/`,
 * o **call-site** do helper (a chamada com os dispatchers fixos +
 * `finally` + `useCallback` deps array) é praticamente idêntico entre
 * `EditSystemModal` e `EditRouteModal` — Sonar tokenizou esse bloco
 * como New Code Duplication (4.8% > 3% no PR #135).
 *
 * Centralizar aqui:
 *
 * 1. Reduz `handleSubmit` de cada modal para ~3 linhas (preventDefault
 *    + dedupe gate + chamada do hook).
 * 2. Garante simetria de comportamento entre os modals (mesmo ordering
 *    de `onUpdated` antes de `onClose`, mesmo trim de erros após
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
 */
export interface UseEditEntitySubmitArgs<TField extends string> {
  dispatchers: EditEntitySubmitDispatchers<TField>;
  copy: EditEntitySubmitCopy;
  callbacks: EditEntitySubmitCallbacks;
  /**
   * Campo de unicidade tratado pelo backend em 409 (`'code'` para
   * sistemas e rotas). Repassa para `classifyApiSubmitError`. Manter
   * tipo genérico preserva a inferência no call-site
   * (`useEditEntitySubmit<keyof RouteFieldErrors>`).
   */
  conflictField: TField;
}

/**
 * Devolve um `handleSubmit` pronto para injetar no `<form onSubmit>`.
 *
 * O caller já fez o `event.preventDefault()` ou o handler retornado
 * faz internamente — preferimos a segunda opção para que o hook seja
 * 100% drop-in (`onSubmit={handleSubmit}` sem wrapper inline).
 *
 * Retorna `Promise<void>` mesmo em erro síncrono — o consumidor não
 * precisa await, mas o tipo permite que callers que queiram (ex.:
 * testes) aguardem o ciclo completo.
 */
export function useEditEntitySubmit<TField extends string>({
  dispatchers,
  copy,
  callbacks,
  conflictField,
}: UseEditEntitySubmitArgs<TField>): (
  event: React.SyntheticEvent<HTMLFormElement>,
) => Promise<void> {
  const { setFieldErrors, setSubmitError, setIsSubmitting, applyBadRequest, showToast } =
    dispatchers;
  const { successMessage, submitErrorCopy, editSubmitActionCopy } = copy;
  const { prepareSubmit, mutationFn, onUpdated, onClose } = callbacks;

  return useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      // `prepareSubmit` valida + zera erros + marca submitting + devolve
      // payload trimado, ou `null` quando há erros client-side. O caller
      // já cuidou do dedupe (`isSubmitting` gate) e do null-check da
      // entidade (`!system`/`!route`) antes de chegar aqui.
      const payload = prepareSubmit();
      if (payload === null) return;

      try {
        await mutationFn(payload);
        // Mensagem de sucesso fixa (não citamos o nome — o usuário
        // acabou de editá-lo e a lista será atualizada).
        showToast(successMessage, { variant: 'success' });
        // Ordem importa: refetch antes de fechar para o pai não ter
        // que coordenar dois ticks separados.
        setFieldErrors({});
        setSubmitError(null);
        onUpdated();
        onClose();
      } catch (error: unknown) {
        // `classifyApiSubmitError` decide o `kind`; `applyEditSubmitAction`
        // despacha os efeitos colaterais (setState/toast/onClose).
        // Helper compartilhado entre todos os recursos — eliminou ~33
        // linhas de switch duplicado (lição PR #134/#135).
        const action = classifyApiSubmitError<TField>(error, submitErrorCopy, conflictField);
        applyEditSubmitAction<TField>(
          action,
          {
            setFieldErrors,
            setSubmitError,
            applyBadRequest,
            showToast,
            onAfterNotFound: () => {
              onUpdated();
              onClose();
            },
          },
          editSubmitActionCopy,
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyBadRequest,
      conflictField,
      editSubmitActionCopy,
      mutationFn,
      onClose,
      onUpdated,
      prepareSubmit,
      setFieldErrors,
      setIsSubmitting,
      setSubmitError,
      showToast,
      submitErrorCopy,
      successMessage,
    ],
  );
}
