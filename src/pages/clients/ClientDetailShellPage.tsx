import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell de detalhe/edição de cliente (`/clientes/:id`).
 *
 * Esqueleto introduzido pela Issue #145 para permitir que sub-issues
 * subsequentes (EPIC #49) populem o conteúdo (abas, dados pessoais,
 * contatos, histórico) sem precisar mexer em rota/menu.
 */
export const ClientDetailShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="05 Clientes · Detalhe"
    title="Detalhe do cliente"
    desc="Edição em abas. Conteúdo será habilitado nas próximas iterações da EPIC de Clientes."
  />
);
