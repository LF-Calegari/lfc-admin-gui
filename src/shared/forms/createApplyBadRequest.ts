import { useCallback } from 'react';

/**
 * Decisão devolvida por `decide*BadRequestHandling` (cada
 * `<recurso>FormShared.ts` tem o seu, todos com o mesmo shape):
 *
 * - `field-errors`: o backend mandou `ValidationProblemDetails` e
 *   conseguimos mapear para chaves do form do recurso. Caller
 *   despacha em `setFieldErrors` e limpa `submitError`.
 * - `submit-error`: o backend mandou 400 sem `errors` mapeáveis.
 *   Caller exibe a mensagem em `Alert` no topo via `setSubmitError`.
 *
 * Genérico em `TErrors` para preservar o tipo do shape de erros do
 * recurso (`SystemFieldErrors`, `RouteFieldErrors`,
 * `RoleFieldErrors`, `ClientFieldErrors`).
 */
export type ApplyBadRequestDecision<TErrors> =
  | { kind: 'field-errors'; errors: TErrors }
  | { kind: 'submit-error'; message: string };

/**
 * Setters do hook de form que `applyBadRequest` precisa para
 * despachar a decisão. Mesma assinatura usada por
 * `useSystemForm`/`useRouteForm`/`useRoleForm`/`useClientForm`.
 */
export interface ApplyBadRequestDispatchers<TErrors> {
  setFieldErrors: React.Dispatch<React.SetStateAction<TErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Hook factory que devolve um `applyBadRequest` memoizado pronto
 * para ser exposto pelos hooks de form. Evita a duplicação Sonar
 * de ~10 linhas (`if (decision.kind === 'field-errors') { ... } else
 * { ... }`) entre os 4+ hooks de form do projeto (lição PR #134/#135
 * — bloco repetido entre `useRouteForm` e `useClientForm` foi
 * detectado por jscpd no PR #74).
 *
 * Cada hook chamador injeta a sua função `decide*BadRequestHandling`
 * (que conhece o shape específico do recurso) — o helper genérico
 * apenas despacha a decisão. Manter o `decide*` específico do
 * recurso preserva a tipagem estreita das mensagens (não há
 * benefício em unificar parsing além do `extract*ValidationErrors`,
 * que já vive em cada `<recurso>FormShared.ts`).
 */
export function useApplyBadRequest<TErrors>(
  decide: (details: unknown, fallbackMessage: string) => ApplyBadRequestDecision<TErrors>,
  dispatchers: ApplyBadRequestDispatchers<TErrors>,
): (details: unknown, fallbackMessage: string) => void {
  const { setFieldErrors, setSubmitError } = dispatchers;
  return useCallback(
    (details: unknown, fallbackMessage: string): void => {
      const decision = decide(details, fallbackMessage);
      if (decision.kind === 'field-errors') {
        setFieldErrors(decision.errors);
        setSubmitError(null);
      } else {
        setSubmitError(decision.message);
      }
    },
    [decide, setFieldErrors, setSubmitError],
  );
}
