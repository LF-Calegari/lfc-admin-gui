import React, { useCallback, useState } from 'react';

/**
 * Estado controlado do modal de adicionar item compartilhado entre
 * `ClientExtraEmailsTab` (#146) e `ClientPhonesTab` (#147).
 *
 * `value` é genérico em `string` (todos os modais hoje têm input
 * único); cenários futuros com mais de um campo vão estender este
 * shape ou abrir um hook próprio.
 */
export interface AddCollectionModalState {
  open: boolean;
  value: string;
  inputError: string | null;
  isSubmitting: boolean;
}

const INITIAL_STATE: AddCollectionModalState = {
  open: false,
  value: '',
  inputError: null,
  isSubmitting: false,
};

export interface UseClientAddCollectionModalResult {
  /** Estado corrente do modal — ler para passar ao `<ClientCollectionAddInputModal>`. */
  state: AddCollectionModalState;
  /** Abre o modal com input vazio. */
  open: () => void;
  /** Fecha o modal (descartando rascunho). No-op enquanto `isSubmitting`. */
  close: () => void;
  /** Atualiza `value` (chamado a cada keystroke do input) e zera `inputError`. */
  setValue: (value: string) => void;
  /**
   * Marca `isSubmitting=true` se a validação client-side aprovou.
   * `validate` retorna `null` para válido ou string com mensagem
   * inline. Reflete a transição atomicamente — em um único
   * `setState` o caller não vê estado intermediário.
   */
  beginSubmit: (validate: (trimmed: string) => string | null) => void;
  /** Reseta para o estado inicial — usado no caminho de sucesso. */
  reset: () => void;
  /** Seta erro inline e desliga `isSubmitting` — caso `inline` do classifier. */
  setInlineErrorAndStop: (message: string) => void;
  /** Apenas desliga `isSubmitting` (mantém modal aberto) — caso `toast`. */
  stopSubmitting: () => void;
  /**
   * Retorna handlers prontos para o componente consumidor — `open`
   * gateado por `isLimitReached` e `submit` que chama `beginSubmit`
   * com o validator injetado. Centralizar evita duplicação dos dois
   * handlers entre `ClientExtraEmailsTab` (#146) e `ClientPhonesTab`
   * (#147).
   */
  buildHandlers: (params: {
    isLimitReached: boolean;
    isReady: boolean;
    validate: (trimmed: string) => string | null;
  }) => {
    handleOpen: () => void;
    handleSubmit: (event?: React.SyntheticEvent<HTMLFormElement>) => void;
  };
}

/**
 * Hook compartilhado que encapsula o `useState` + handlers do modal
 * de adicionar item.
 *
 * **Por que extraído (lição PR #128/#134/#135):** ambas as abas
 * (`ClientExtraEmailsTab` e `ClientPhonesTab`) tinham o mesmo
 * conjunto de callbacks (`handleOpenAddModal`, `handleCloseAddModal`,
 * `handleValueChange`, `setInlineErrorAndStop`, etc.) — JSCPD
 * tokenizava ~20 linhas como bloco duplicado entre os arquivos.
 * Promover para hook compartilhado deduplica e expõe uma API
 * declarativa (`open()`, `close()`, `setValue(v)`, `beginSubmit(v)`,
 * `reset()`) que torna os call sites mais legíveis.
 *
 * **Padrão "begin submit":** o caller chama `beginSubmit(validate)` no
 * handler de submit; o hook valida via callback e seta
 * `isSubmitting=true` apenas se passou. O branching inteiro de
 * "validar → setar erro inline OU `isSubmitting`" acontece dentro do
 * `setState` (atômico) — o caller não precisa coordenar dois
 * `setState`s.
 */
export function useClientAddCollectionModal(): UseClientAddCollectionModalResult {
  const [state, setState] = useState<AddCollectionModalState>(INITIAL_STATE);

  const open = useCallback(() => {
    setState({
      open: true,
      value: '',
      inputError: null,
      isSubmitting: false,
    });
  }, []);

  const close = useCallback(() => {
    // No-op enquanto submit está em andamento — preserva o feedback
    // visual e evita race com a request in-flight.
    setState((prev) => (prev.isSubmitting ? prev : INITIAL_STATE));
  }, []);

  const setValue = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      value,
      // Limpa o erro no primeiro keystroke após erro — feedback
      // mais leve que "permanecer marcado vermelho até resubmit".
      inputError: null,
    }));
  }, []);

  const beginSubmit = useCallback(
    (validate: (trimmed: string) => string | null) => {
      setState((prev) => {
        if (prev.isSubmitting) return prev;
        const trimmed = prev.value.trim();
        const inputError = validate(trimmed);
        if (inputError !== null) {
          return { ...prev, inputError };
        }
        return { ...prev, inputError: null, isSubmitting: true };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const setInlineErrorAndStop = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      inputError: message,
      isSubmitting: false,
    }));
  }, []);

  const stopSubmitting = useCallback(() => {
    setState((prev) => ({ ...prev, isSubmitting: false }));
  }, []);

  const buildHandlers = useCallback(
    (params: {
      isLimitReached: boolean;
      isReady: boolean;
      validate: (trimmed: string) => string | null;
    }) => ({
      handleOpen: () => {
        if (params.isLimitReached) return;
        open();
      },
      handleSubmit: (event?: React.SyntheticEvent<HTMLFormElement>) => {
        event?.preventDefault();
        if (!params.isReady) return;
        beginSubmit(params.validate);
      },
    }),
    [beginSubmit, open],
  );

  return {
    state,
    open,
    close,
    setValue,
    beginSubmit,
    reset,
    setInlineErrorAndStop,
    stopSubmitting,
    buildHandlers,
  };
}
