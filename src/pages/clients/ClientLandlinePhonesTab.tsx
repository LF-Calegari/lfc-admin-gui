import React from 'react';

import { ClientPhonesTab } from './ClientPhonesTab';

import type { ApiClient } from '../../shared/api';

interface ClientLandlinePhonesTabProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * o `ClientPhonesTab` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Aba "Telefones fixos" do `ClientEditPage` (Issue #147).
 *
 * Wrapper fino que injeta `kind="landline"` no `ClientPhonesTab`
 * compartilhado. Ver `ClientMobilePhonesTab` para a justificativa do
 * padrão wrapper-fino — manter o descritor `TABS` em `ClientEditPage`
 * com 1 componente por aba simplifica o type-checker e mantém os
 * placeholders de painel sincronizados com a estrutura existente.
 *
 * Substitui o placeholder herdado de #144 — toda a lógica visual e de
 * mutação vive em `ClientPhonesTab`. Lição PR #128/#134/#135.
 */
export const ClientLandlinePhonesTab: React.FC<ClientLandlinePhonesTabProps> = ({
  client,
}) => <ClientPhonesTab kind="landline" client={client} />;
