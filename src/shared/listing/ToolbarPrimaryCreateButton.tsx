import { Plus } from 'lucide-react';
import React from 'react';

import { Button } from '../../components/ui';

export interface ToolbarPrimaryCreateButtonProps {
  /** `data-testid` estável por página (ex.: `permissions-create-open`). */
  testId: string;
  /** Texto do botão (ex.: "Nova permissão"). */
  label: string;
  onClick: () => void;
}

/**
 * CTA primária "+ Novo …" do slot `actions` do `ListingToolbar` —
 * extraída para evitar blocos ≥10 linhas idênticos entre páginas de
 * listagem (Issue #201 vs listagem global de rotas — JSCPD/Sonar).
 */
export const ToolbarPrimaryCreateButton: React.FC<ToolbarPrimaryCreateButtonProps> = ({
  testId,
  label,
  onClick,
}) => (
  <Button
    variant="primary"
    size="md"
    icon={<Plus size={14} strokeWidth={1.75} />}
    onClick={onClick}
    data-testid={testId}
  >
    {label}
  </Button>
);
