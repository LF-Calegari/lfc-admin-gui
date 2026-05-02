import React from 'react';

import {
  GroupCode as AssignmentGroupCode,
  GroupCount as AssignmentGroupCount,
  GroupHeader as AssignmentGroupHeader,
  GroupName as AssignmentGroupName,
} from './AssignmentMatrixStyles';

/**
 * Cabeçalho padrão de um grupo de "matriz de atribuição" agrupada por
 * sistema — exibe `systemCode` (mono pequeno), `systemName` (heading sm)
 * e contagem de itens (badge à direita) com `aria-label` parametrizado.
 *
 * **Por que existe (lições PR #134/#135):** as três páginas de
 * atribuição (`UserPermissionsShellPage` da #70, `UserRolesShellPage`
 * da #71 via `AssignmentMatrixShell`) e a nova `UserEffectivePermissionsShellPage`
 * (#72) repetiam ~16 linhas de JSX idêntico no header do grupo,
 * variando apenas em (i) literal do `data-testid` e (ii) sufixo do
 * `aria-label` da contagem. JSCPD tokeniza isso como bloco duplicado
 * mesmo entre arquivos diferentes — quando a forma é idêntica,
 * extrair em componente parametrizado é o caminho.
 *
 * **Nota de escopo:** este componente NÃO inclui o `<AssignmentGroupCard>`
 * wrapper externo nem o `<AssignmentItemList>` interno — cada caller
 * controla seus filhos (linhas com checkbox vs read-only). Isolamos
 * apenas o `<AssignmentGroupHeader>` + 3 children, que é o subset
 * realmente repetido.
 */
export interface AssignmentGroupHeaderRowProps {
  /** Code do sistema (ex.: "authenticator"). Renderizado em mono. */
  systemCode: string;
  /** Nome humano do sistema (ex.: "Authenticator"). Renderizado em heading. */
  systemName: string;
  /** Quantidade de itens do grupo (ex.: número de permissões). */
  count: number;
  /**
   * Label completo (i18n) usado como `aria-label` do contador. Ex.:
   * `"5 permissões neste sistema"`, `"3 roles neste sistema"`,
   * `"7 permissões efetivas neste sistema"`. Cada caller decide a
   * copy — manter como prop preserva legibilidade do recurso.
   */
  countAriaLabel: string;
}

export const AssignmentGroupHeaderRow: React.FC<AssignmentGroupHeaderRowProps> = ({
  systemCode,
  systemName,
  count,
  countAriaLabel,
}) => (
  <AssignmentGroupHeader>
    <AssignmentGroupCode>{systemCode}</AssignmentGroupCode>
    <AssignmentGroupName>{systemName}</AssignmentGroupName>
    <AssignmentGroupCount aria-label={countAriaLabel}>{count}</AssignmentGroupCount>
  </AssignmentGroupHeader>
);
