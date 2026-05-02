import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell de detalhe/edição de usuário (`/usuarios/:id`).
 *
 * Esqueleto introduzido pela Issue #145 para permitir que sub-issues
 * subsequentes populem o conteúdo (abas, dados, roles atribuídas,
 * sessões ativas) sem precisar mexer em rota/menu.
 */
export const UserDetailShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="06 Usuários · Detalhe"
    title="Detalhe do usuário"
    desc="Edição de usuário, roles e sessões. Conteúdo será habilitado nas próximas iterações."
  />
);
