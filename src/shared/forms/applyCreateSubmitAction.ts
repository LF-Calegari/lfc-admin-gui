import type { ApiSubmitErrorAction, ApiSubmitErrorCopy } from './classifySubmitError';

/**
 * Variante de toast injetada nos cenários de erro. Centralizamos o
 * literal aqui para que o helper não dependa do shape interno do
 * `useToast` do design system.
 */
type ToastVariant = 'danger';

/**
 * Cópia textual injetada por cada modal de criação. Os literais aqui
 * são os únicos pontos onde "rota"/"sistema"/"usuário" diferem — toda
 * a árvore de decisão (`switch (action.kind)`) vive no helper.
 *
 * Espelha `EditSubmitActionCopy` mas sem `notFoundMessage` (create
 * nunca recebe 404 do backend — não há entidade para "sumir entre
 * abertura e submit").
 */
export interface CreateSubmitActionCopy {
  /**
   * Mensagem inline exibida no campo de unicidade quando o backend
   * devolve 409. Quando `undefined`, o helper usa a mensagem do
   * próprio backend (`action.message`) — coerente com o
   * `NewSystemModal`. O `NewRouteModal`/`NewUserModal` injetam um
   * valor explícito porque a copy do backend é menos clara que a
   * copy custom do UI.
   */
  conflictInlineMessage?: string;
}

/**
 * Dispatchers injetados pelo modal — separar a decisão (helper puro
 * sobre o `action.kind`) dos efeitos colaterais (`setState`, `show`)
 * preserva testabilidade e elimina a duplicação de switch entre
 * `useCreateEntitySubmit` e `applyEditSubmitAction` (Sonar tokeniza
 * o switch como bloco idêntico — ~16 linhas — mesmo quando os
 * literais diferem; lição PR #134).
 *
 * Tipos genéricos:
 *
 * - `TField` é a união de chaves do form do recurso (`'name' | 'code'
 *   | 'description'` para sistemas; `... | 'systemTokenTypeId'` para
 *   rotas; `'name' | 'email' | 'password' | 'identity' | 'clientId'`
 *   para users). Aceito como type parameter para que `setFieldErrors`
 *   receba um `Record` parcial respeitando as chaves do form.
 */
export interface CreateSubmitActionDispatchers<TField extends string> {
  /** Atualiza o estado de erros inline. Recebe um objeto parcial. */
  setFieldErrors: (errors: Partial<Record<TField, string>>) => void;
  /** Limpa o `submitError` exibido em Alert no topo do form. */
  setSubmitError: (message: string | null) => void;
  /**
   * Dispatcher do caminho `bad-request` — recebe `details` cru do
   * backend e a mensagem fallback caso `ValidationProblemDetails` não
   * seja mapeável. Cada modal injeta o `applyBadRequest` retornado
   * pelo seu hook de form.
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
  /** Dispatcher de toast — espelha a assinatura de `useToast().show`. */
  showToast: (message: string, options: { variant: ToastVariant; title?: string }) => void;
}

/**
 * Despacha as ações de erro classificadas por `classifyApiSubmitError`
 * para o shape comum dos modals de criação.
 *
 * Cobre exaustivamente os 5 valores de `action.kind`:
 *
 * - `conflict` (409) → mensagem inline customizada no campo de
 *   unicidade (`copy.conflictInlineMessage` ou `action.message` do
 *   backend), limpa `submitError`.
 * - `bad-request` (400) → delega para `dispatchers.applyBadRequest`
 *   com o `details`/`fallbackMessage` do action.
 * - `not-found` (404) → toast vermelho com `errorCopy.genericFallback`
 *   (não esperado em create — se chegar, mostra fallback).
 * - `toast` (401/403) → toast vermelho com a mensagem do backend.
 * - `unhandled` (demais) → toast vermelho com fallback genérico do
 *   próprio action.
 *
 * Centralizado aqui (em vez de duplicado em cada `useCreateEntitySubmit`)
 * para eliminar BLOCKER de duplicação Sonar — esse bloco de switch é
 * 16 linhas idênticas comparado ao `applyEditSubmitAction` (lição PR
 * #128/#134). Diferente do edit, `not-found` cai no fallback (sem
 * `onAfterNotFound`).
 */
export function applyCreateSubmitAction<TField extends string>(
  action: ApiSubmitErrorAction<TField>,
  dispatchers: CreateSubmitActionDispatchers<TField>,
  errorCopy: ApiSubmitErrorCopy,
  copy: CreateSubmitActionCopy,
): void {
  switch (action.kind) {
    case 'conflict':
      dispatchers.setFieldErrors({
        [action.field]: copy.conflictInlineMessage ?? action.message,
      } as Partial<Record<TField, string>>);
      dispatchers.setSubmitError(null);
      break;
    case 'bad-request':
      dispatchers.applyBadRequest(action.details, action.fallbackMessage);
      break;
    case 'not-found':
      // Não esperado em create — backend nunca devolve 404 nesse
      // path. Tratamos como fallback genérico defensivamente.
      dispatchers.showToast(errorCopy.genericFallback, {
        variant: 'danger',
        title: errorCopy.forbiddenTitle,
      });
      break;
    case 'toast':
      dispatchers.showToast(action.message, { variant: 'danger', title: action.title });
      break;
    case 'unhandled':
      dispatchers.showToast(action.fallback, { variant: 'danger', title: action.title });
      break;
  }
}
