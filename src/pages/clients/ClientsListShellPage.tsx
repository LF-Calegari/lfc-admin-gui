import React from 'react';

import { PlaceholderPage } from '../PlaceholderPage';

/**
 * Página-shell da listagem de clientes (`/clientes`).
 *
 * Esta página é parte do esqueleto de navegação introduzido pela
 * Issue #145. O conteúdo real (filtros, tabela, paginação, ações de
 * CRUD) será entregue por sub-issues subsequentes da EPIC #49 — o
 * objetivo aqui é apenas registrar a rota, vincular ao item de menu
 * e disparar o `RequirePermission` correto, mantendo a navegação
 * consistente com as demais áreas do painel.
 */
export const ClientsListShellPage: React.FC = () => (
  <PlaceholderPage
    eyebrow="05 Clientes"
    title="Clientes"
    desc="Pessoas e empresas cadastradas no ecossistema. A listagem completa será habilitada nas próximas iterações da EPIC de Clientes."
  />
);
