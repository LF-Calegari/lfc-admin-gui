import { RefreshCw, LogOut } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Button, Badge, Card } from '../components/ui';

const Kv = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
`;

const KvRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-subtle);

  &:last-child {
    border-bottom: none;
  }
`;

const KvKey = styled.span`
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg3);
  letter-spacing: 0.04em;
`;

const KvValue = styled.span`
  font-size: 13.5px;
  font-weight: var(--weight-medium);
  font-family: var(--font-mono);
`;

/**
 * Em telas estreitas a linha de ações pode quebrar — `flex-wrap` evita
 * overflow horizontal sem mudar a estrutura semântica.
 */
const Actions = styled.div`
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const SettingsPage: React.FC = () => (
  <>
    <PageHeader
      eyebrow="07 Configurações"
      title="Configurações da conta"
      desc="Tema, idioma e preferências de sessão."
    />
    <Card title="Sessão">
      <Kv>
        <KvRow>
          <KvKey>tokenVersion</KvKey>
          <KvValue>12</KvValue>
        </KvRow>
        <KvRow>
          <KvKey>Expira em</KvKey>
          <KvValue>14 min</KvValue>
        </KvRow>
        <KvRow>
          <KvKey>Refresh automático</KvKey>
          <Badge variant="success" dot>Ativo</Badge>
        </KvRow>
      </Kv>
      <Actions>
        <Button variant="secondary" icon={<RefreshCw size={14} strokeWidth={1.5} />}>Renovar agora</Button>
        <Button variant="danger" icon={<LogOut size={14} strokeWidth={1.5} />}>Invalidar todas as sessões</Button>
      </Actions>
    </Card>
  </>
);
