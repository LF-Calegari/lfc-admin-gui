import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell da listagem global de permissões (`/permissoes`).
 *
 * Esqueleto introduzido pela Issue #145 — substitui a antiga
 * `PermissionsPage` (mockada com a matriz Resource.Action) e dá
 * lugar à vista global real, entregue por sub-issues subsequentes.
 */
export const PermissionsListShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="04 Permissões"
    title="Permissões"
    desc="Catálogo global Resource.Action. A matriz completa será habilitada nas próximas iterações."
  />
);
