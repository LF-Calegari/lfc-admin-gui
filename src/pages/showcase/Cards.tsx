import { Pencil, Trash2 } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { Badge, Body, Button, Caption, Card, Icon, Label, PermChip } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

/**
 * Issue #36 — Cards.
 *
 * Espelha `identity/preview/cards.html`. Demonstra variantes do Card:
 *   - Padrão (sem header)
 *   - Com header (title + right slot)
 *   - Com ações no body
 *   - Clicável (vira `role="button"` e responde a Enter/Space)
 */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
`;

const Meta = styled.div`
  font-size: var(--text-xs);
  color: var(--fg3);
  margin-block-end: var(--space-3);
`;

const ChipRow = styled.div`
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
`;

const Actions = styled.div`
  display: flex;
  gap: var(--space-2);
  margin-block-start: var(--space-3);
`;

export const Cards: React.FC = () => (
  <ShowcaseSection
    eyebrow="Components"
    title="Cards"
    description="Container modular para entidades de catálogo. Padrão com header opcional (title + right slot), corpo flexível e suporte a clique para virar interativo."
    ariaLabel="Components Cards"
  >
    <Stack>
      <Label>Variantes</Label>
      <Grid>
        {/* Header + status badge + body com chip */}
        <Card
          title="lfc-authenticator"
          right={
            <Badge variant="success" dot>
              Ativo
            </Badge>
          }
        >
          <Meta>ASP.NET Core 10 · PostgreSQL</Meta>
          <ChipRow>
            <PermChip>perm:Systems.Read</PermChip>
            <PermChip>perm:Roles.Read</PermChip>
          </ChipRow>
        </Card>

        {/* Header + status info */}
        <Card
          title="lfc-kurtto"
          right={
            <Badge variant="info" dot>
              Verificando
            </Badge>
          }
        >
          <Meta>Node.js · TypeScript · PostgreSQL</Meta>
          <ChipRow>
            <PermChip>perm:Systems.Read</PermChip>
          </ChipRow>
        </Card>

        {/* Card sem header */}
        <Card>
          <Body muted>Card padrão sem header. Uso para blocos contextuais soltos.</Body>
        </Card>

        {/* Card com ações */}
        <Card title="Configuração de role" right={<Caption>admin</Caption>}>
          <Body muted>3 permissões atribuídas. Última alteração há 4h.</Body>
          <Actions>
            <Button size="sm" variant="secondary" icon={<Icon icon={Pencil} size="xs" />}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" icon={<Icon icon={Trash2} size="xs" />}>
              Remover
            </Button>
          </Actions>
        </Card>
      </Grid>
    </Stack>

    <Stack>
      <Label>Clicável (interativo)</Label>
      <Grid>
        <Card
          title="Abrir detalhes"
          right={<Caption muted>Enter/Space ou clique</Caption>}
          onClick={() => undefined}
        >
          <Body muted>
            Quando o consumidor passa <code>onClick</code>, o card vira `role=&quot;button&quot;`,
            ganha tabIndex e ativa hover/focus elevados.
          </Body>
        </Card>
      </Grid>
    </Stack>
  </ShowcaseSection>
);
