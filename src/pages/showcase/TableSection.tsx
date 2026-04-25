import { Pencil, Trash2 } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { Badge, Button, Icon, Label, Table } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

import type { TableColumn } from '../../components/ui';

/**
 * Issue #38 — Table.
 *
 * Espelha `identity/preview/table.html`. Demonstra:
 *   - Header acessível (`<th scope="col">`)
 *   - Linhas com hover/zebra
 *   - Coluna mono alinhada à direita (números/timestamps)
 *   - Coluna de ações
 *   - Wrapper com scroll horizontal em telas estreitas
 *   - Estado vazio
 */

interface UserRow {
  id: string;
  user: string;
  role: string;
  permissions: string;
  status: 'active' | 'inactive';
  lastSession: string;
}

const USERS: ReadonlyArray<UserRow> = [
  {
    id: 'u1',
    user: 'admin@lfc.com.br',
    role: 'root',
    permissions: '12 permissões',
    status: 'active',
    lastSession: 'há 2 min',
  },
  {
    id: 'u2',
    user: 'ops@lfc.com.br',
    role: 'admin',
    permissions: '8 permissões',
    status: 'active',
    lastSession: 'há 47 min',
  },
  {
    id: 'u3',
    user: 'legacy@lfc.com.br',
    role: 'default',
    permissions: '3 permissões',
    status: 'inactive',
    lastSession: 'há 14 dias',
  },
];

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg3);
`;

const RoleBadge = styled.span`
  display: inline-block;
  padding: 2px var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  border-radius: var(--radius-full);
  border: var(--border-thin) solid var(--border-base);
  background: var(--bg-elevated);
  color: var(--fg2);
`;

const ActionGroup = styled.div`
  display: inline-flex;
  gap: var(--space-2);
  justify-content: flex-end;
`;

const columns: ReadonlyArray<TableColumn<UserRow>> = [
  { key: 'user', label: 'Usuário' },
  {
    key: 'role',
    label: 'Role',
    render: row => <RoleBadge>{row.role}</RoleBadge>,
  },
  {
    key: 'permissions',
    label: 'Permissões',
    render: row => <Mono>{row.permissions}</Mono>,
  },
  {
    key: 'status',
    label: 'Status',
    render: row =>
      row.status === 'active' ? (
        <Badge variant="success" dot>
          Ativo
        </Badge>
      ) : (
        <Badge variant="danger" dot>
          Inativo
        </Badge>
      ),
  },
  {
    key: 'lastSession',
    label: 'Última sessão',
    align: 'right',
    render: row => <Mono>{row.lastSession}</Mono>,
  },
  {
    key: 'actions',
    label: 'Ações',
    isActions: true,
    render: row => (
      <ActionGroup>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Editar ${row.user}`}
          icon={<Icon icon={Pencil} size="xs" />}
        />
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remover ${row.user}`}
          icon={<Icon icon={Trash2} size="xs" />}
        />
      </ActionGroup>
    ),
  },
];

export const TableSection: React.FC = () => (
  <ShowcaseSection
    eyebrow="Components"
    title="Table"
    description="Tabela declarativa via columns + data. Suporta render customizado, alinhamento por coluna, hover, zebra, scroll horizontal automático em telas estreitas e estado vazio."
    ariaLabel="Components Table"
  >
    <Stack>
      <Label>Listagem completa com ações</Label>
      <Table
        columns={columns}
        data={USERS}
        getRowKey={row => row.id}
        caption="Usuários cadastrados"
      />
    </Stack>

    <Stack>
      <Label>Estado vazio</Label>
      <Table
        columns={columns}
        data={[]}
        getRowKey={row => row.id}
        emptyState="Nenhum usuário cadastrado neste sistema."
      />
    </Stack>
  </ShowcaseSection>
);
