import { useMemo } from 'react';

/**
 * Helper genérico de handlers de mudança de campo de formulário.
 *
 * **Por que existe (lição PR #134 — duplicação Sonar):**
 *
 * Cada hook `use<Recurso>Form` (sistemas, rotas, e os futuros roles/
 * users/clients/permissions) declarava handlers `useCallback` com a
 * mesma forma:
 *
 * ```ts
 * const handleNameChange = useCallback((value: string) => {
 *   setFormState((prev) => ({ ...prev, name: value }));
 *   setFieldErrors((prev) =>
 *     prev.name === undefined ? prev : { ...prev, name: undefined },
 *   );
 * }, []);
 * ```
 *
 * Sonar tokenizou ~19 linhas idênticas entre `useSystemForm.ts` e
 * `useRouteForm.ts` como bloco duplicado (parte do 4.7% que reprovou
 * a PR #134). Centralizar a fábrica aqui:
 *
 * - Elimina a duplicação independentemente do número de campos do
 *   recurso (cada hook só lista `(['name','code',...] as const).map(...)`).
 * - Preserva a estabilidade de referência via `useMemo` — a lista de
 *   handlers só é recriada quando os setters mudam (nunca, no uso
 *   normal).
 * - Mantém os erros inline limpos quando o usuário edita o campo
 *   (mesmo comportamento que os handlers manuais tinham).
 *
 * Mantemos em TS+React puro, sem dependência de domínio.
 */

/**
 * Setter compatível com `useState` para o estado do form (objeto com
 * campos de string) e para os erros inline (objeto com erros opcionais
 * por campo).
 */
type FormStateSetter<TState> = React.Dispatch<React.SetStateAction<TState>>;
type FieldErrorsSetter<TErrors> = React.Dispatch<React.SetStateAction<TErrors>>;

/**
 * Conjunto de handlers gerados, indexado por nome de campo. O caller
 * desestrutura e passa cada um para o input correspondente.
 */
export type FieldChangeHandlers<TState> = {
  [K in keyof TState]-?: (value: TState[K]) => void;
};

/**
 * Cria um conjunto de handlers de mudança para os campos listados em
 * `fields`. Cada handler atualiza o campo correspondente do estado e
 * limpa o erro inline associado se houver.
 *
 * - `TState` é o estado do form (ex.: `{name, code, description}`).
 * - `TErrors` é o objeto de erros inline (chaves opcionais).
 *
 * Exemplo:
 *
 * ```ts
 * const handlers = useFieldChangeHandlers(
 *   ['name', 'code', 'description'] as const,
 *   setFormState,
 *   setFieldErrors,
 * );
 * // handlers.name(value), handlers.code(value), etc.
 * ```
 *
 * O `useMemo` garante que os handlers tenham referência estável entre
 * renders (mesmo benefício do `useCallback` original) — útil para
 * componentes filhos memoizados e para os hooks de `useEffect`.
 */
export function useFieldChangeHandlers<TState, TErrors>(
  fields: ReadonlyArray<keyof TState>,
  setFormState: FormStateSetter<TState>,
  setFieldErrors: FieldErrorsSetter<TErrors>,
): FieldChangeHandlers<TState> {
  return useMemo(() => {
    const result = {} as FieldChangeHandlers<TState>;
    for (const field of fields) {
      const handler = (value: TState[typeof field]) => {
        setFormState((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => {
          const errs = prev as TErrors & Record<string, unknown>;
          const key = field as unknown as string;
          if (errs[key] === undefined) return prev;
          return { ...errs, [key]: undefined } as TErrors;
        });
      };
      result[field] = handler as FieldChangeHandlers<TState>[typeof field];
    }
    return result;
    // `fields` é tratado como estável (caller usa `as const` em array
    // literal). Adicionamos os setters como dependências por correção,
    // mas eles vêm de `useState` e nunca mudam de identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFormState, setFieldErrors]);
}
