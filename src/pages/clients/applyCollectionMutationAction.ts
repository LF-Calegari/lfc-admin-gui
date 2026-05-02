/**
 * Helpers de aplicação de ação de mutação para as abas de coleção
 * de cliente (`ClientExtraEmailsTab` — Issue #146 e
 * `ClientPhonesTab` — Issue #147).
 *
 * **Por que extraído (lição PR #128/#134/#135):** ambas as abas
 * tinham o mesmo `switch (action.kind)` com 47 linhas exatamente
 * iguais (`inline` / `limit-reached` / `not-found` / `toast` /
 * `unhandled`) divergindo só no callback de `setAddModal`. Sonar/
 * JSCPD tokenizam isso como bloco duplicado entre arquivos.
 * Promover para uma função pura agnóstica do tipo concreto da
 * coleção zera a duplicação e abre caminho para o terceiro
 * consumidor sem refator destrutivo.
 *
 * Mantemos os helpers em TS puro (sem React) para que os testes
 * unitários possam exercitar o branching sem render — basta passar
 * spies como dispatchers.
 */

/**
 * Side-effect imperativo aplicado pelo helper na UI — abstrai
 * `useToast().show` para que o helper rode em testes sem provider.
 */
type ShowToast = (
  message: string,
  options: { variant: 'success' | 'danger' | 'info'; title?: string },
) => void;

/**
 * Dispatchers que o caller injeta para que o helper toque no estado
 * do modal de adicionar. Cada modificação atômica vira um callback
 * separado — facilita o teste e mantém a função pura por dentro.
 */
export interface ApplyAddCollectionDispatchers {
  /** Seta o erro inline e desliga `isSubmitting`. */
  setInlineErrorAndStop: (message: string) => void;
  /** Reseta o modal (fecha + descarta input + isSubmitting=false). */
  resetAddModal: () => void;
  /** Apenas desliga `isSubmitting` (mantém modal aberto). */
  stopSubmitting: () => void;
}

/**
 * Ação aceita pelo `applyAddCollectionAction`. Cobre o conjunto
 * comum entre `AddExtraEmailErrorAction` e `AddPhoneErrorAction`
 * (mesmas variantes — divergem só nos literais que cada call site
 * passa). O caller alarga o tipo do classifier deles para este
 * shape, garantindo que TypeScript valide exaustividade.
 */
export type ApplyAddCollectionAction =
  | { kind: 'inline'; message: string }
  | { kind: 'limit-reached'; message: string }
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

/**
 * Aplica uma `ApplyAddCollectionAction` aos dispatchers + side-effects.
 *
 * - `inline` → seta erro inline e mantém modal aberto.
 * - `limit-reached` → idem `inline` + `triggerRefetch` para sincronizar
 *   estado com servidor.
 * - `not-found` → toast vermelho + reseta modal + refetch.
 * - `toast` → toast vermelho + mantém modal aberto.
 * - `unhandled` → idem `toast` (mensagem genérica vem do classifier).
 *
 * Não retorna nada — todos os efeitos são imperativos via dispatchers.
 */
export function applyAddCollectionAction(
  action: ApplyAddCollectionAction,
  dispatchers: ApplyAddCollectionDispatchers,
  show: ShowToast,
  triggerRefetch: () => void,
): void {
  switch (action.kind) {
    case 'inline':
      dispatchers.setInlineErrorAndStop(action.message);
      break;
    case 'limit-reached':
      dispatchers.setInlineErrorAndStop(action.message);
      triggerRefetch();
      break;
    case 'not-found':
      show(action.message, { variant: 'danger', title: action.title });
      dispatchers.resetAddModal();
      triggerRefetch();
      break;
    case 'toast':
    case 'unhandled':
      show(action.message, { variant: 'danger', title: action.title });
      dispatchers.stopSubmitting();
      break;
  }
}

/**
 * Dispatchers do modal de confirmação de remoção. Cada modificação
 * atômica vira um callback — o caller controla a transição de
 * estado.
 */
export interface ApplyRemoveCollectionDispatchers {
  /** Reseta o confirm (fecha + isSubmitting=false). */
  resetRemoveConfirm: () => void;
  /** Mantém o confirm aberto e apenas desliga `isSubmitting`. */
  stopSubmitting: () => void;
}

/**
 * Ação aceita pelo `applyRemoveCollectionAction`. Cobre o conjunto
 * comum (`not-found`, `toast`, `unhandled`) compartilhado entre as
 * abas. `RemoveExtraEmailErrorAction` adiciona um `username` extra
 * tratado pelo caller antes de chegar aqui.
 */
export type ApplyRemoveCollectionAction =
  | { kind: 'not-found'; message: string; title: string }
  | { kind: 'toast'; message: string; title: string }
  | { kind: 'unhandled'; message: string; title: string };

/**
 * Aplica uma `ApplyRemoveCollectionAction` aos dispatchers + side-effects.
 *
 * - `not-found` → toast vermelho + reseta confirm + refetch.
 * - `toast` → toast vermelho + mantém confirm aberto.
 * - `unhandled` → idem `toast`.
 */
export function applyRemoveCollectionAction(
  action: ApplyRemoveCollectionAction,
  dispatchers: ApplyRemoveCollectionDispatchers,
  show: ShowToast,
  triggerRefetch: () => void,
): void {
  switch (action.kind) {
    case 'not-found':
      show(action.message, { variant: 'danger', title: action.title });
      dispatchers.resetRemoveConfirm();
      triggerRefetch();
      break;
    case 'toast':
    case 'unhandled':
      show(action.message, { variant: 'danger', title: action.title });
      dispatchers.stopSubmitting();
      break;
  }
}
