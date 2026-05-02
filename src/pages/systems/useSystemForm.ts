import { useCallback } from "react";

import {
  useNameCodeDescriptionForm,
  type UseNameCodeDescriptionFormReturn,
} from "../../shared/forms";

import { type SystemFormState } from "./systemFormShared";

import type { CreateSystemPayload } from "../../shared/api";

/**
 * Hook compartilhado pelos formulários de criação (`NewSystemModal`)
 * e edição (`EditSystemModal`) de sistemas.
 *
 * **Após o PR #68 (lição PR #134/#135 reforçada):** delega para o
 * helper genérico `useNameCodeDescriptionForm` em
 * `src/shared/forms/`. O `prepareSubmit` original retornava direto
 * `{name, code, description}` — o helper genérico devolve o mesmo
 * shape (`NameCodeDescriptionFormState`), que é estruturalmente
 * compatível com `CreateSystemPayload` (description é optional no
 * payload, mas string trimada é aceita).
 *
 * Os handlers eram literalmente idênticos entre os modals (~14
 * linhas cada bloco × 2 arquivos = 28 linhas duplicadas) — cenário
 * clássico de BLOCKER de duplicação Sonar (lição PR #123/#127 —
 * Sonar conta blocos de 10+ linhas como `New Code Duplication`
 * independente da intenção). Centralizamos no helper compartilhado
 * para que o BLOCKER nunca volte.
 *
 * O caller é dono da lógica de submit (que precisa do contexto de
 * `createSystem` vs `updateSystem`), do reset entre aberturas e do
 * mapping de erros — o hook só cuida do que é genuinamente
 * compartilhado.
 */

export type UseSystemFormReturn = Omit<
  UseNameCodeDescriptionFormReturn,
  "prepareSubmit"
> & {
  /**
   * Roda a validação client-side e, se passar, prepara o
   * `CreateSystemPayload` trimado. Diferente do `useRoleForm` (que
   * exige `systemId` injetado pelo caller), `useSystemForm`
   * devolve o payload sem `systemId` — o backend de sistemas usa o
   * próprio token JWT como contexto, não precisa do campo no body.
   */
  prepareSubmit: () => CreateSystemPayload | null;
};

export function useSystemForm(
  initialState: SystemFormState,
): UseSystemFormReturn {
  const inner = useNameCodeDescriptionForm(initialState);

  const prepareSubmit = useCallback((): CreateSystemPayload | null => {
    const trimmed = inner.prepareSubmit();
    if (trimmed === null) return null;
    return {
      name: trimmed.name,
      code: trimmed.code,
      description: trimmed.description,
    };
  }, [inner]);

  return {
    ...inner,
    prepareSubmit,
  };
}
