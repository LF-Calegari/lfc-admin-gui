import React from 'react';

import {
  ItemCodeChip,
  ItemDescription,
  ItemMetaRow,
  ItemPrimaryText,
  ItemTitleRow,
} from './AssignmentMatrixStyles';
import { Mono } from './styles';

import type { PermissionDto } from '../api';

type HeaderPerm = Pick<
  PermissionDto,
  'routeName' | 'routeCode' | 'permissionTypeCode' | 'description'
>;

/**
 * Bloco comum de título + metadados de uma permissão do catálogo nas
 * matrizes de vínculo (role ↔ permissão, usuário ↔ permissão).
 * Extraído para eliminar duplicação JSCPD entre
 * `RolePermissionsShellPage` e `UserDirectPermissionsPanel` (Issue #203).
 */
export const CatalogPermissionDetailHeader: React.FC<{ perm: HeaderPerm }> = ({
  perm,
}) => (
  <>
    <ItemTitleRow>
      <ItemPrimaryText>{perm.routeName || perm.routeCode}</ItemPrimaryText>
      <ItemCodeChip>
        <Mono>{perm.permissionTypeCode}</Mono>
      </ItemCodeChip>
    </ItemTitleRow>
    <ItemMetaRow>
      <Mono>{perm.routeCode || '—'}</Mono>
      {perm.description ? (
        <ItemDescription>{perm.description}</ItemDescription>
      ) : null}
    </ItemMetaRow>
  </>
);
