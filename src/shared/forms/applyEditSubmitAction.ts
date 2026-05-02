import type { ApiSubmitErrorAction } from './classifySubmitError';

/**
 * Variante de toast injetada nos cenários de erro. Centralizamos o
 * literal aqui para que o helper não dependa do shape interno do
 * `useToast` do design system.
 */
type ToastVariant = 'danger';

/**
 * Cópia textual injetada por cada modal de edição. Os literais aqui
 * são os únicos pontos onde "rota"/"sistema" diferem — toda a árvore
 * de decisão (`switch (action.kind)`) vive no helper.
 */
export interface EditSubmitActionCopy {
  /**
   * Mensagem inline exibida no campo de unicidade quando o backend
   * devolve 409. Quando `undefined`, o helper usa a mensagem do
   * próprio backend (`action.message`) — coerente com o
   * `EditSystemModal`, que propaga "Já existe outro sistema com este
   * Code." literal. O `EditRouteModal` injeta um valor explícito
   * porque a copy do backend ("Já existe uma route com este Code.")
   * é menos clara que a copy custom do UI ("Já existe outra rota com
   * este código neste sistema.").
   */
  conflictInlineMessage?: string;
  /** Texto exibido em toast quando a entidade some entre abertura e submit (404). */
  notFoundMessage: string;
  /** Título usado em toasts vermelhos (404 e fallback). Espelha `forbiddenTitle` do `ApiSubmitErrorCopy`. */
  forbiddenTitle: string;
}

/**
 * Dispatchers injetados pelo modal — separar a decisão (helper puro
 * sobre o `action.kind`) dos efeitos colaterais (`setState`, `show`,
 * `onClose`, `onUpdated`) preserva testabilidade e elimina a
 * duplicação de 33 linhas que apareceria entre `EditSystemModal` e
 * `EditRouteModal` (Sonar tokeniza o switch como bloco idêntico
 * mesmo quando os literais diferem — lição PR #134).
 *
 * Tipos genéricos:
 *
 * - `TField` é a união de chaves do form do recurso (`'name' | 'code'
 *   | 'description'` para sistemas; `... | 'systemTokenTypeId'` para
 *   rotas). Aceito como type parameter para que `setFieldErrors`
 *   receba um `Record` parcial respeitando as chaves do form.
 */
export interface EditSubmitActionDispatchers<TField extends string> {
  /** Atualiza o estado de erros inline. Recebe um objeto parcial. */
  setFieldErrors: (errors: Partial<Record<TField, string>>) => void;
  /** Limpa o `submitError` exibido em Alert no topo do form. */
  setSubmitError: (message: string | null) => void;
  /**
   * Dispatcher do caminho `bad-request` — recebe `details` cru do
   * backend e a mensagem fallback caso `ValidationProblemDetails` não
   * seja mapeável. Cada modal injeta o `applyBadRequest` retornado
   * pelo seu hook de form (`useSystemForm`/`useRouteForm`).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
  /** Dispatcher de toast — espelha a assinatura de `useToast().show`. */
  showToast: (message: string, options: { variant: ToastVariant; title?: string }) => void;
  /**
   * Side-effect chamado após detecção de 404 (entidade removida entre
   * abertura e submit). Em ambos os modals atuais é
   * `() => { onUpdated(); onClose(); }` — refetch + fechar modal.
   */
  onAfterNotFound: () => void;
}

/**
 * Despacha as ações de erro classificadas por `classifyApiSubmitError`
 * para o shape comum dos modals de edição.
 *
 * Cobre exaustivamente os 5 valores de `action.kind`:
 *
 * - `conflict` (409) → mensagem inline customizada no campo de
 *   unicidade (`copy.conflictInlineMessage`), limpa `submitError`.
 * - `bad-request` (400) → delega para `dispatchers.applyBadRequest`
 *   com o `details`/`fallbackMessage` do action.
 * - `not-found` (404) → toast vermelho com `copy.notFoundMessage` +
 *   `dispatchers.onAfterNotFound()` (tipicamente
 *   `onUpdated() + onClose()`).
 * - `toast` (401/403) → toast vermelho com a mensagem do backend.
 * - `unhandled` (demais) → toast vermelho com fallback genérico do
 *   próprio action.
 *
 * Centralizado aqui (em vez de duplicado em cada `<EditXModal>`) para
 * eliminar BLOCKER de duplicação Sonar (lição PR #128/#134) — esse
 * bloco de switch foi 5ª/6ª recorrência potencial de New Code
 * Duplication.
 */
export function applyEditSubmitAction<TField extends string>(
  action: ApiSubmitErrorAction<TField>,
  dispatchers: EditSubmitActionDispatchers<TField>,
  copy: EditSubmitActionCopy,
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
      dispatchers.showToast(copy.notFoundMessage, {
        variant: 'danger',
        title: copy.forbiddenTitle,
      });
      dispatchers.onAfterNotFound();
      break;
    case 'toast':
      dispatchers.showToast(action.message, { variant: 'danger', title: action.title });
      break;
    case 'unhandled':
      dispatchers.showToast(action.fallback, { variant: 'danger', title: action.title });
      break;
  }
}
