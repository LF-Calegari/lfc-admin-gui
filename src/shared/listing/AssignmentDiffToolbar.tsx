import { Save } from 'lucide-react';
import React from 'react';

import { Button } from '../../components/ui';

import { SaveCounter } from './AssignmentMatrixStyles';

export interface AssignmentDiffToolbarProps {
  resetTestId: string;
  saveTestId: string;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  pendingCount: number;
  onReset: () => void;
  onSave: () => void;
}

/**
 * Botões "Descartar alterações" + "Salvar alterações" com contador
 * usados nas matrizes de permissões (role ↔ catálogo, usuário ↔
 * catálogo). Centraliza o bloco duplicado detectado pelo JSCPD/Sonar
 * entre `RolePermissionsShellPage` e `UserDirectPermissionsPanel`
 * (Issue #203).
 */
export const AssignmentDiffToolbar: React.FC<AssignmentDiffToolbarProps> = ({
  resetTestId,
  saveTestId,
  hasUnsavedChanges,
  isSaving,
  pendingCount,
  onReset,
  onSave,
}) => (
  <>
    <Button
      variant="secondary"
      size="md"
      onClick={onReset}
      disabled={!hasUnsavedChanges || isSaving}
      data-testid={resetTestId}
    >
      Descartar alterações
    </Button>
    <Button
      variant="primary"
      size="md"
      icon={<Save size={14} aria-hidden="true" />}
      loading={isSaving}
      disabled={!hasUnsavedChanges}
      onClick={onSave}
      data-testid={saveTestId}
    >
      Salvar alterações
      {hasUnsavedChanges && (
        <SaveCounter aria-label={`${pendingCount} alterações pendentes`}>
          {pendingCount}
        </SaveCounter>
      )}
    </Button>
  </>
);
