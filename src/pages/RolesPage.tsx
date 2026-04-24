import { Plus, MoreHorizontal } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Button, Badge } from '../components/ui';

interface RoleItem {
  name: string;
  users: number;
  perms: number;
  desc: string;
  system: string;
}

const ROLES: RoleItem[] = [
  { name: 'root',    users: 2,  perms: 12, desc: 'Acesso irrestrito a todos os sistemas',          system: '—' },
  { name: 'admin',   users: 6,  perms: 8,  desc: 'Gerenciamento de usuários e permissões',         system: 'lfc-authenticator' },
  { name: 'editor',  users: 14, perms: 5,  desc: 'Criar e editar recursos, sem deletar',           system: 'lfc-authenticator' },
  { name: 'viewer',  users: 32, perms: 2,  desc: 'Leitura apenas',                                 system: 'lfc-authenticator' },
  { name: 'default', users: 1,  perms: 3,  desc: 'Role de fallback para usuários legados',         system: '—' },
];

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

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--bg-elevated);
    }
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

const MonoMuted = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
`;

const IconBtn = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
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
`;

export const RolesPage: React.FC = () => (
  <>
    <PageHeader
      eyebrow="03 Roles"
      title="Gerenciamento de Roles"
      desc="Roles agrupam permissões e podem ser atribuídas a usuários. Permissões diretas sobrescrevem as da role."
      actions={<Button variant="primary" icon={<Plus size={14} strokeWidth={1.5} />}>Nova role</Button>}
    />
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Sistema</th>
            <th>Permissões</th>
            <th>Usuários</th>
            <th>Descrição</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map(r => (
            <tr key={r.name}>
              <td><Badge variant="neutral">{r.name}</Badge></td>
              <td><MonoMuted>{r.system}</MonoMuted></td>
              <td><Mono>{r.perms} permissões</Mono></td>
              <td><Mono>{r.users}</Mono></td>
              <td>{r.desc}</td>
              <td>
                <IconBtn aria-label="Mais opções">
                  <MoreHorizontal size={14} strokeWidth={1.5} />
                </IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  </>
);
