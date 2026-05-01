import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell da listagem de usuários (`/usuarios`).
 *
 * Esqueleto introduzido pela Issue #145 — substitui a antiga
 * `UsersPage` (mockada com dados estáticos) e dá lugar à listagem
 * real, que será entregue por sub-issues subsequentes (#73, #77, …).
 */
export const UsersListShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="06 Usuários"
    title="Usuários"
    desc="Todos os usuários com acesso a pelo menos um sistema. A listagem completa será habilitada nas próximas iterações."
  />
);
