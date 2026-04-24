import { Download } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';
import { Button, PermChip, Card } from '../components/ui';

interface PermGroup {
  res: string;
  actions: string[];
}

const PERM_GROUPS: PermGroup[] = [
  { res: 'Systems', actions: ['Create', 'Read', 'Update', 'Delete'] },
  { res: 'Roles',   actions: ['Create', 'Read', 'Update', 'Delete', 'Assign'] },
  { res: 'Users',   actions: ['Create', 'Read', 'Update', 'Delete', 'Invite'] },
  { res: 'Routes',  actions: ['List', 'Register', 'Deregister'] },
  { res: 'Tokens',  actions: ['Issue', 'Revoke', 'Inspect'] },
];

const PermGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
`;

const ChipWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const MonoMuted = styled.span`
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
`;

export const PermissionsPage: React.FC = () => (
  <>
    <PageHeader
      eyebrow="04 Permissões"
      title="Matriz de permissões"
      desc="Modelo Resource.Action. Permissões são atribuídas via roles ou diretamente a usuários. Qualquer alteração incrementa tokenVersion."
      actions={<Button variant="secondary" icon={<Download size={14} strokeWidth={1.5} />}>Exportar JSON</Button>}
    />
    <PermGrid>
      {PERM_GROUPS.map(g => (
        <Card
          key={g.res}
          title={g.res}
          right={<MonoMuted>{g.actions.length}</MonoMuted>}
        >
          <ChipWrap>
            {g.actions.map(a => (
              <PermChip key={a}>{`perm:${g.res}.${a}`}</PermChip>
            ))}
          </ChipWrap>
        </Card>
      ))}
    </PermGrid>
  </>
);
