import { UserPlus, Filter, Search, MoreHorizontal } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Button, Badge, Input } from '../components/ui';

import type { BadgeVariant } from '../components/ui';

interface UserItem {
  email: string;
  role: string;
  perms: number;
  status: 'active' | 'inactive' | 'verifying' | 'pending';
  last: string;
}

const USERS: UserItem[] = [
  { email: 'admin@lfc.com.br',  role: 'root',    perms: 12, status: 'active',    last: 'há 2 min'  },
  { email: 'ops@lfc.com.br',    role: 'admin',   perms: 8,  status: 'active',    last: 'há 47 min' },
  { email: 'dev@lfc.com.br',    role: 'editor',  perms: 5,  status: 'active',    last: 'há 3 h'    },
  { email: 'audit@lfc.com.br',  role: 'viewer',  perms: 2,  status: 'verifying', last: 'há 1 d'    },
  { email: 'legacy@lfc.com.br', role: 'default', perms: 3,  status: 'inactive',  last: 'há 14 dias'},
];

const STATUS_MAP: Record<UserItem['status'], { variant: BadgeVariant; label: string }> = {
  active:    { variant: 'success', label: 'Ativo' },
  inactive:  { variant: 'danger',  label: 'Inativo' },
  verifying: { variant: 'info',    label: 'Verificando' },
  pending:   { variant: 'warning', label: 'Pendente' },
};

const FilterRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 18px;

  > *:first-child {
    min-width: 280px;
  }
`;

const Spacer = styled.div`
  flex: 1;
`;

const MonoMuted = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
`;

const TableWrap = styled.div`
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-surface);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;

  thead {
    background: var(--bg-elevated);
  }

  th {
    padding: 11px 18px;
    text-align: left;
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg3);
    border-bottom: 1px solid var(--border-subtle);
  }

  tbody tr {
    border-bottom: 1px solid var(--border-subtle);
    transition: background 100ms;

    &:last-child { border-bottom: none; }
    &:hover { background: var(--bg-elevated); }
  }

  td {
    padding: 12px 18px;
    color: var(--fg2);
    vertical-align: middle;

    &:first-child {
      color: var(--fg1);
      font-weight: var(--weight-medium);
    }
  }
`;

const IconBtn = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  width: 28px;
  height: 28px;
  cursor: pointer;
  color: var(--fg3);
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-elevated);
    color: var(--fg1);
    border-color: var(--border-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

export const UsersPage: React.FC = () => (
  <>
    <PageHeader
      eyebrow="05 Usuários"
      title="Usuários do sistema"
      desc="Todos os usuários com acesso a pelo menos um sistema. Desativar um usuário invalida imediatamente suas sessões."
      actions={<Button variant="primary" icon={<UserPlus size={14} strokeWidth={1.5} />}>Convidar usuário</Button>}
    />
    <FilterRow>
      <Input icon={<Search size={14} strokeWidth={1.5} />} placeholder="Buscar por e-mail…" />
      <Button variant="secondary" icon={<Filter size={14} strokeWidth={1.5} />}>Filtrar por role</Button>
      <Spacer />
      <MonoMuted>55 usuários · 1 inativo</MonoMuted>
    </FilterRow>
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Role</th>
            <th>Permissões</th>
            <th>Status</th>
            <th>Última sessão</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {USERS.map(u => {
            const { variant, label } = STATUS_MAP[u.status];
            return (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td><Badge variant="neutral">{u.role}</Badge></td>
                <td><Mono style={{ color: 'var(--fg3)' }}>{u.perms} permissões</Mono></td>
                <td><Badge variant={variant} dot>{label}</Badge></td>
                <td><MonoMuted>{u.last}</MonoMuted></td>
                <td>
                  <IconBtn aria-label="Mais opções">
                    <MoreHorizontal size={14} strokeWidth={1.5} />
                  </IconBtn>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  </>
);
