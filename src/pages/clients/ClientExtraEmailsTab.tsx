import React from 'react';

import { ClientEditTabPlaceholder } from './ClientEditTabPlaceholder';

/**
 * Aba "Emails extras" do `ClientEditPage` (Issue #144).
 *
 * Atualmente renderiza placeholder porque o conteúdo real (lista de
 * emails extras + CRUD inline) é corpo da Issue #146. Substituirá o
 * placeholder em PR dedicado quando #146 for desbloqueada por esta
 * issue (#144 é pré-requisito do container de abas).
 */
export const ClientExtraEmailsTab: React.FC = () => (
  <ClientEditTabPlaceholder
    title="Emails extras"
    description="Lista de emails adicionais (além do principal). Será habilitada pela Issue #146."
  />
);
