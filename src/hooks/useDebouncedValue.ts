import { useEffect, useState } from 'react';

/**
 * Espelha `value` em um estado interno com atraso de `delayMs`.
 *
 * Útil em campos de busca: o `value` reflete o input em tempo real (UI
 * responsiva) e o `debouncedValue` só dispara depois que o usuário para
 * de digitar pelo intervalo configurado — evita uma request por tecla.
 *
 * Cada mudança em `value` reseta o timer; o cleanup garante que apenas
 * o último valor pendente é aplicado quando o componente desmonta ou o
 * `value` muda novamente antes do timeout disparar.
 *
 * `delayMs <= 0` aplica o valor imediatamente — útil em testes que
 * preferem desabilitar o debounce.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
