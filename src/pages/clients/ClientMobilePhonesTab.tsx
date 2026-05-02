import React from 'react';

import { ClientPhonesTab } from './ClientPhonesTab';

import type { ApiClient } from '../../shared/api';

interface ClientMobilePhonesTabProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * o `ClientPhonesTab` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Aba "Celulares" do `ClientEditPage` (Issue #147).
 *
 * Wrapper fino que injeta `kind="mobile"` no `ClientPhonesTab`
 * compartilhado. Manter o wrapper (em vez de `ClientEditPage`
 * referenciar `ClientPhonesTab` diretamente) preserva a estrutura de
 * `TABS` em `ClientEditPage` (1 componente por aba), o que mantém o
 * descritor estático simples e o type-checker feliz com
 * `React.ComponentType` sem precisar de prop binding extra.
 *
 * Substitui o placeholder herdado de #144 — toda a lógica visual e de
 * mutação vive em `ClientPhonesTab`. Lição PR #128/#134/#135 — projetar
 * shared helpers desde o primeiro PR do recurso para evitar duplicação
 * Sonar entre as duas abas.
 */
export const ClientMobilePhonesTab: React.FC<ClientMobilePhonesTabProps> = ({
  client,
}) => <ClientPhonesTab kind="mobile" client={client} />;
