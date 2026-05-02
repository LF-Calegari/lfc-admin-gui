import React from 'react';

import { ClientEditTabPlaceholder } from './ClientEditTabPlaceholder';

/**
 * Aba "Celulares" do `ClientEditPage` (Issue #144).
 *
 * Atualmente renderiza placeholder porque o conteúdo real (lista de
 * celulares + CRUD inline) é corpo da Issue #147 (parte 1).
 * Substituirá o placeholder quando #147 for desbloqueada por esta
 * issue.
 */
export const ClientMobilePhonesTab: React.FC = () => (
  <ClientEditTabPlaceholder
    title="Celulares"
    description="Lista de celulares cadastrados. Será habilitada pela Issue #147 (parte 1)."
  />
);
