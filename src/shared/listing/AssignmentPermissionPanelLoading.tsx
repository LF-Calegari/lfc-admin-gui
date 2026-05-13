import React from 'react';

import { Spinner } from '../../components/ui';

import { LoadingCopy, LoadingShell } from './AssignmentMatrixStyles';

export interface AssignmentPermissionPanelLoadingProps {
  /** `data-testid` do shell de loading (ex.: `user-permissions-loading`). */
  testId: string;
}

/**
 * Spinner + copy padrão para carregamento de painéis de matriz de
 * permissões (catálogo + vínculos). Unifica bloco repetido entre
 * telas de role e de usuário (Issue #203 / gate JSCPD).
 */
export const AssignmentPermissionPanelLoading: React.FC<
  AssignmentPermissionPanelLoadingProps
> = ({ testId }) => (
  <LoadingShell data-testid={testId} aria-live="polite">
    <Spinner size="md" tone="accent" />
    <LoadingCopy>Carregando permissões…</LoadingCopy>
  </LoadingShell>
);
