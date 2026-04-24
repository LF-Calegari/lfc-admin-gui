import { Filter, Plus, Shuffle, Activity } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Button, Badge, PermChip, Card } from '../components/ui';

import type { BadgeVariant } from '../components/ui';

interface SystemItem {
  id: string;
  name: string;
  stack: string;
  status: 'active' | 'inactive' | 'verifying' | 'pending';
  routes: number;
  tokens: number;
}

const INITIAL_SYSTEMS: SystemItem[] = [
  { id: 'sys_a1b2c3', name: 'lfc-authenticator',  stack: 'ASP.NET Core 10 · PostgreSQL',        status: 'active',    routes: 42, tokens: 128 },
  { id: 'sys_d4e5f6', name: 'lfc-kurtto',         stack: 'Node.js · TypeScript · PostgreSQL',   status: 'verifying', routes: 14, tokens: 22  },
  { id: 'sys_g7h8i9', name: 'lfc-reportd',        stack: 'Go 1.22 · ClickHouse',               status: 'active',    routes: 8,  tokens: 41  },
  { id: 'sys_j0k1l2', name: 'lfc-legacy-bridge',  stack: 'Python 3.12 · MySQL',                status: 'inactive',  routes: 3,  tokens: 0   },
];

const STATUS_MAP: Record<SystemItem['status'], { variant: BadgeVariant; label: string }> = {
  active:    { variant: 'success', label: 'Ativo' },
  inactive:  { variant: 'danger',  label: 'Inativo' },
  verifying: { variant: 'info',    label: 'Verificando' },
  pending:   { variant: 'warning', label: 'Pendente' },
};

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 26px;
`;

const StatCard = styled.div`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
`;

const StatNumber = styled.div`
  font-size: 28px;
  font-weight: var(--weight-bold);
  letter-spacing: -0.03em;
  color: var(--fg1);
`;

const StatLabel = styled.div`
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-top: 4px;
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
`;

const CardMeta = styled.div`
  font-size: 12.5px;
  color: var(--fg3);
  margin-bottom: 12px;
`;

const PermRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`;

const CardStats = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--fg2);
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  align-items: center;

  > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
`;

const MonoMuted = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
`;

export const SystemsPage: React.FC = () => (
  <>
    <PageHeader
      eyebrow="01 Sistemas"
      title="Sistemas cadastrados"
      desc="Serviços registrados no ecossistema de autenticação. Cada sistema possui suas próprias rotas, roles e permissões."
      actions={
        <>
          <Button variant="secondary" icon={<Filter size={14} strokeWidth={1.5} />}>Filtrar</Button>
          <Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />}>Novo sistema</Button>
        </>
      }
    />
    <StatRow>
      <StatCard><StatNumber>4</StatNumber><StatLabel>Sistemas</StatLabel></StatCard>
      <StatCard><StatNumber>67</StatNumber><StatLabel>Rotas totais</StatLabel></StatCard>
      <StatCard><StatNumber>191</StatNumber><StatLabel>Tokens ativos</StatLabel></StatCard>
      <StatCard><StatNumber>1</StatNumber><StatLabel>Inativo</StatLabel></StatCard>
    </StatRow>
    <Grid2>
      {INITIAL_SYSTEMS.map(s => {
        const { variant, label } = STATUS_MAP[s.status];
        return (
          <Card
            key={s.id}
            title={s.name}
            right={<Badge variant={variant} dot>{label}</Badge>}
          >
            <CardMeta>{s.stack}</CardMeta>
            <PermRow>
              <PermChip>perm:Systems.Read</PermChip>
              <PermChip>perm:Routes.List</PermChip>
            </PermRow>
            <CardStats>
              <span><Shuffle size={12} strokeWidth={1.5} /> {s.routes} rotas</span>
              <span><Activity size={12} strokeWidth={1.5} /> {s.tokens} tokens</span>
              <MonoMuted>{s.id}</MonoMuted>
            </CardStats>
          </Card>
        );
      })}
    </Grid2>
  </>
);
