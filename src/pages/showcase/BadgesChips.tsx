import { Hash, Tag } from 'lucide-react';
import React, { useState } from 'react';
import styled from 'styled-components';

import { Badge, Chip, Icon, Label, PermChip } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

/**
 * Issue #35 — Badges & Chips.
 *
 * Espelha `identity/preview/badges-chips.html`. Cobre:
 *   - Badges com dot (status: success/danger/warning/info)
 *   - Badges neutras (rótulos curtos)
 *   - Chips removíveis (filtros aplicados)
 *   - Chips com ícone
 *   - Chips selecionáveis (toggles de filtro)
 *   - PermChip (caso específico mantido por compatibilidade)
 */

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
`;

interface FilterOption {
  id: string;
  label: string;
}

const FILTERS: ReadonlyArray<FilterOption> = [
  { id: 'active', label: 'Ativos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'inactive', label: 'Inativos' },
  { id: 'archived', label: 'Arquivados' },
];

const REMOVABLE_INITIAL = ['frontend', 'auth', 'admin'] as const;

function filterRemoved(prev: ReadonlyArray<string>, target: string): string[] {
  return prev.filter(x => x !== target);
}

export const BadgesChips: React.FC = () => {
  const [selected, setSelected] = useState<string>('active');
  const [removable, setRemovable] = useState<ReadonlyArray<string>>(REMOVABLE_INITIAL);

  // Extraído como função nomeada (`filterRemoved`) acima do componente para
  // achatar a estrutura: a closure original
  // `removable.map(item => (<Chip onRemove={() => setRemovable(prev => prev.filter(x => x !== item))} />))`
  // tinha 4+ níveis de aninhamento e disparava `sonarjs/S2004`.
  const buildRemoveHandler = (item: string) => () => {
    setRemovable(prev => filterRemoved(prev, item));
  };

  return (
    <ShowcaseSection
      eyebrow="Components"
      title="Badges & Chips"
      description="Badges comunicam estado em pontos (status do recurso). Chips são pílulas usadas para filtros ativos, atributos e seleções múltiplas."
      ariaLabel="Components Badges & Chips"
    >
      <Stack>
        <Label>Badges · status com dot</Label>
        <Row>
          <Badge variant="success" dot>
            Ativo
          </Badge>
          <Badge variant="danger" dot>
            Inativo
          </Badge>
          <Badge variant="warning" dot>
            Pendente
          </Badge>
          <Badge variant="info" dot>
            Verificando
          </Badge>
        </Row>
      </Stack>

      <Stack>
        <Label>Badges · neutras (rótulos)</Label>
        <Row>
          <Badge variant="neutral">admin</Badge>
          <Badge variant="neutral">root</Badge>
          <Badge variant="neutral">v1.4.2</Badge>
        </Row>
      </Stack>

      <Stack>
        <Label>Chips · ícone + variante</Label>
        <Row>
          <Chip label="Lime" variant="success" icon={<Icon icon={Tag} size="xs" />} />
          <Chip label="Beta" variant="warning" icon={<Icon icon={Tag} size="xs" />} />
          <Chip label="ID 421" variant="info" icon={<Icon icon={Hash} size="xs" />} />
          <Chip label="Erro" variant="danger" icon={<Icon icon={Tag} size="xs" />} />
        </Row>
      </Stack>

      <Stack>
        <Label>Chips · removíveis (filtros aplicados)</Label>
        <Row>
          {removable.length === 0 ? (
            <Chip label="Nenhum filtro ativo" variant="default" />
          ) : (
            removable.map(item => (
              <Chip
                key={item}
                label={item}
                variant="success"
                onRemove={buildRemoveHandler(item)}
              />
            ))
          )}
        </Row>
      </Stack>

      <Stack>
        <Label>Chips · selecionáveis (filtros toggles)</Label>
        <Row>
          {FILTERS.map(opt => (
            <Chip
              key={opt.id}
              label={opt.label}
              selected={selected === opt.id}
              onClick={() => setSelected(opt.id)}
            />
          ))}
        </Row>
      </Stack>

      <Stack>
        <Label>PermChip · caso específico</Label>
        <Row>
          <PermChip>perm:Systems.Create</PermChip>
          <PermChip>perm:Users.Read</PermChip>
          <PermChip>perm:Roles.Delete</PermChip>
        </Row>
      </Stack>
    </ShowcaseSection>
  );
};
