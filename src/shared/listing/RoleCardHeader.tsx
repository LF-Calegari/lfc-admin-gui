import React from 'react';

import { StatusBadge } from './StatusBadge';
import { CardCode, CardDescription, CardHeader, CardName } from './styles';

/**
 * Header padrão dos cards mobile de uma role: `<CardHeader>` com
 * `<CardCode>` + `<StatusBadge>`, seguido por `<CardName>` e
 * (condicionalmente) `<CardDescription>` quando a role tem descrição
 * preenchida.
 *
 * **Por que existe (lição PR #134/#135):** o bloco de 12 linhas com
 * `<CardHeader>` + `<CardCode>` + `<StatusBadge>` + `<CardName>` +
 * `<CardDescription>` (condicional) se repetia idêntico entre
 * `RolesPage` (per-system) e `RolesGlobalListShellPage` (global) —
 * JSCPD/Sonar tokenizam blocos de ≥10 linhas com mesma estrutura
 * como duplicação independente da intenção.
 *
 * Extraído como componente em vez de hook porque é puramente
 * apresentacional (sem estado / hooks) — JSX em árvore fixa,
 * parametrizado apenas pelos campos da role.
 */
export interface RoleCardHeaderProps {
  /** `code` da role (renderizado no `<CardCode>`). */
  code: string;
  /** `name` da role (renderizado no `<CardName>`). */
  name: string;
  /** `description` opcional — exibida como `<CardDescription>` se não vazia. */
  description: string | null | undefined;
  /** ISO timestamp de soft-delete (ou null) para o `<StatusBadge>`. */
  deletedAt: string | null;
}

export const RoleCardHeader: React.FC<RoleCardHeaderProps> = ({
  code,
  name,
  description,
  deletedAt,
}) => (
  <>
    <CardHeader>
      <CardCode>{code}</CardCode>
      <StatusBadge deletedAt={deletedAt} />
    </CardHeader>
    <CardName>{name}</CardName>
    {description !== null &&
      description !== undefined &&
      description.trim().length > 0 && (
        <CardDescription>{description}</CardDescription>
      )}
  </>
);
