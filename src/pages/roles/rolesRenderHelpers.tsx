import React from 'react';
import styled from 'styled-components';

import { Mono, Placeholder } from '../../shared/listing';

import type { RoleDto } from '../../shared/api';

/**
 * Truncamento da descrição via ellipsis horizontal — preserva layout
 * em viewports estreitos. Espelha o uso histórico em `RolesPage`/
 * `RolesGlobalListShellPage`.
 */
const DescriptionCell = styled.span`
  display: inline-block;
  max-width: 32ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
`;

/**
 * Render do campo `description` de uma role. Nullable/vazio vira
 * `Placeholder` em-dash. Centralizado entre `RolesPage` (per-system)
 * e `RolesGlobalListShellPage` (cross-system) para evitar duplicação
 * JSCPD/Sonar (lição PR #134/#135).
 */
export function renderRoleDescription(row: RoleDto): React.ReactNode {
  if (
    row.description === null ||
    row.description === undefined ||
    row.description.trim().length === 0
  ) {
    return <Placeholder>—</Placeholder>;
  }
  return (
    <DescriptionCell title={row.description}>{row.description}</DescriptionCell>
  );
}

/**
 * Render de contagem (permissionsCount/usersCount). `null`/`undefined`
 * vira `Placeholder`; numérico renderiza em `Mono`.
 */
export function renderRoleCount(
  value: number | null | undefined,
): React.ReactNode {
  if (typeof value !== 'number') {
    return <Placeholder>—</Placeholder>;
  }
  return <Mono>{value}</Mono>;
}
