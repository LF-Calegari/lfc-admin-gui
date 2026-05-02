import { useCallback, useState } from 'react';

/**
 * Estado controlado do confirm de remoção compartilhado entre
 * `ClientExtraEmailsTab` (#146) e `ClientPhonesTab` (#147).
 *
 * `target` é genérico — cada caller passa seu DTO concreto via
 * `RemoveCollectionConfirmState<T>` instanciado.
 */
export interface RemoveCollectionConfirmState<T> {
  target: T | null;
  isSubmitting: boolean;
}

export interface UseClientRemoveCollectionConfirmResult<T> {
  /** Estado corrente — caller passa para o `<ClientCollectionRemoveConfirmModal>`. */
  state: RemoveCollectionConfirmState<T>;
  /** Abre o confirm com o `target` selecionado. */
  open: (target: T) => void;
  /** Fecha o confirm (cancelar/ESC/backdrop). No-op enquanto `isSubmitting`. */
  close: () => void;
  /**
   * Marca `isSubmitting=true` se ainda não está submetendo. Usado
   * antes de chamar a função de remoção para garantir que o spinner
   * apareça e o handler ignore submits duplicados.
   */
  beginSubmit: () => void;
  /** Reseta para o estado inicial — usado no caminho de sucesso. */
  reset: () => void;
  /** Apenas desliga `isSubmitting` (mantém confirm aberto) — caso `toast`. */
  stopSubmitting: () => void;
}

/**
 * Hook compartilhado que encapsula o `useState` + handlers do
 * confirm de remoção.
 *
 * **Por que extraído (lição PR #128/#134/#135):** ambas as abas
 * tinham o mesmo conjunto de callbacks (`handleOpenRemoveConfirm`,
 * `handleCloseRemoveConfirm`, transição `isSubmitting=true`/`false`)
 * — JSCPD tokenizava ~13 linhas como bloco duplicado. Promover para
 * hook compartilhado deduplica e expõe uma API declarativa.
 */
export function useClientRemoveCollectionConfirm<T>(): UseClientRemoveCollectionConfirmResult<T> {
  const initialState: RemoveCollectionConfirmState<T> = {
    target: null,
    isSubmitting: false,
  };
  const [state, setState] = useState<RemoveCollectionConfirmState<T>>(initialState);

  const open = useCallback((target: T) => {
    setState({ target, isSubmitting: false });
  }, []);

  const close = useCallback(() => {
    setState((prev) => (prev.isSubmitting ? prev : { target: null, isSubmitting: false }));
  }, []);

  const beginSubmit = useCallback(() => {
    setState((prev) => (prev.isSubmitting ? prev : { ...prev, isSubmitting: true }));
  }, []);

  const reset = useCallback(() => {
    setState({ target: null, isSubmitting: false });
  }, []);

  const stopSubmitting = useCallback(() => {
    setState((prev) => ({ ...prev, isSubmitting: false }));
  }, []);

  return {
    state,
    open,
    close,
    beginSubmit,
    reset,
    stopSubmitting,
  };
}
