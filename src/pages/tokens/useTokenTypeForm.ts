import {
  useNameCodeDescriptionForm,
  type NameCodeDescriptionFormFieldProps,
  type NameCodeDescriptionFormState,
  type UseNameCodeDescriptionFormReturn,
} from '../../shared/forms';

export { useNameCodeDescriptionFormFieldProps as useTokenTypeFormFieldProps } from '../../shared/forms';

/**
 * Hook compartilhado pelo modal de criação (`NewTokenTypeModal`) e
 * edição (`EditTokenTypeModal`) de tipos de token (Issue #175).
 *
 * Delegação direta para o helper genérico `useNameCodeDescriptionForm`
 * em `src/shared/forms/` — o token type tem o mesmo shape de 3 campos
 * (`Name`/`Code`/`Description`) que sistemas/roles, sem necessidade
 * de decorar `prepareSubmit` (diferente de `useRoleForm`/
 * `useRouteForm`, que injetam `systemId`).
 *
 * Mantemos um wrapper local em vez de consumir
 * `useNameCodeDescriptionForm` direto pelos modais para preservar:
 *
 * 1. **Acoplamento de domínio explícito** — o caller importa de
 *    `./useTokenTypeForm`, deixando claro que está usando o form do
 *    recurso "token types". Mudanças futuras (ex.: adicionar campo
 *    `tags` exclusivo do recurso) ficam isoladas neste módulo sem
 *    vazar para o helper genérico.
 * 2. **Simetria com `useSystemForm`/`useRoleForm`/`useRouteForm`** — o
 *    pattern do projeto é "cada recurso tem seu hook"; quebrar a
 *    convenção introduziria assimetria sem ganho real.
 *
 * **Lição PR #134/#135 reforçada:** a duplicação prévia da
 * `<Recurso>FormFieldProps` interface + `use<Recurso>FormFieldProps`
 * hook foi extraída para `useNameCodeDescriptionFormFieldProps` em
 * `src/shared/forms/`, eliminando os ~27 linhas idênticas detectadas
 * pelo JSCPD entre `useRoleForm.ts` e este módulo. Os exports locais
 * são aliases estruturais — preservam a API por recurso sem
 * duplicar implementação.
 */

/**
 * Tipo de retorno do hook — alias estrutural do retorno do helper
 * genérico. Token types não precisam decorar `prepareSubmit` (mesmo
 * shape que sistemas — não há `systemId` para injetar).
 */
export type UseTokenTypeFormReturn = UseNameCodeDescriptionFormReturn;

export function useTokenTypeForm(
  initialState: NameCodeDescriptionFormState,
): UseTokenTypeFormReturn {
  return useNameCodeDescriptionForm(initialState);
}

/**
 * Tipo do conjunto de props consumido por `<TokenTypeFormBody>` —
 * alias estrutural de `NameCodeDescriptionFormFieldProps` (helper
 * genérico em `src/shared/forms/`). Centralizar a declaração lá
 * elimina duplicação entre `useRoleForm.RoleFormFieldProps` e este
 * tipo (lição PR #134/#135 — JSCPD/Sonar tokenizam blocos ≥10 linhas
 * como `New Code Duplication` mesmo entre tipos sintaticamente
 * idênticos).
 */
export type TokenTypeFormFieldProps = NameCodeDescriptionFormFieldProps;

