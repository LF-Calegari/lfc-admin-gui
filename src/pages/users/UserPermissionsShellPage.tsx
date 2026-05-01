import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell de atribuição direta de permissões a um usuário
 * (`/usuarios/:id/permissoes`).
 *
 * Esqueleto introduzido pela Issue #145 — o conteúdo (matriz de
 * permissões com ações granulares) será entregue pela Issue #70.
 */
export const UserPermissionsShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="06 Usuários · Permissões"
    title="Permissões do usuário"
    desc="Atribuição direta de permissões. Sobrescreve as roles. Conteúdo será habilitado pela Issue #70."
  />
);
