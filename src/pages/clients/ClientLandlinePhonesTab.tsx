import React from 'react';

import { ClientEditTabPlaceholder } from './ClientEditTabPlaceholder';

/**
 * Aba "Telefones fixos" do `ClientEditPage` (Issue #144).
 *
 * Atualmente renderiza placeholder porque o conteúdo real (lista de
 * telefones fixos + CRUD inline) é corpo da Issue #147 (parte 2).
 * Substituirá o placeholder quando #147 for desbloqueada por esta
 * issue.
 */
export const ClientLandlinePhonesTab: React.FC = () => (
  <ClientEditTabPlaceholder
    title="Telefones fixos"
    description="Lista de telefones fixos cadastrados. Será habilitada pela Issue #147 (parte 2)."
  />
);
