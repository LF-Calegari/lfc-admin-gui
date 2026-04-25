import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Filter,
  Lock,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Icon, Input, Label } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

import type { IconTone, IconSize } from '../../components/ui';
import type { LucideIcon } from 'lucide-react';

/**
 * Issue #40 — Icons (revisar/expandir).
 *
 * Galeria principal com os ícones lucide mais usados no admin (espelhando
 * `identity/preview/icons.html`), tones semânticas, tamanhos e composição
 * com texto/botão. Inclui busca/filtro opcional por nome.
 */

interface IconEntry {
  name: string;
  Icon: LucideIcon;
  /** Aliases adicionais para busca (ex.: "delete" → trash). */
  aliases?: ReadonlyArray<string>;
}

const ICONS: ReadonlyArray<IconEntry> = [
  { name: 'systems', Icon: Monitor, aliases: ['monitor'] },
  { name: 'routes', Icon: Shuffle, aliases: ['shuffle', 'redirect'] },
  { name: 'roles', Icon: Users, aliases: ['users', 'group'] },
  { name: 'permissions', Icon: Lock, aliases: ['lock', 'security'] },
  { name: 'clients', Icon: UserPlus, aliases: ['user-plus'] },
  { name: 'users', Icon: User, aliases: ['user'] },
  { name: 'token', Icon: Activity, aliases: ['activity', 'pulse'] },
  { name: 'logout', Icon: LogOut, aliases: ['log-out', 'signout'] },
  { name: 'settings', Icon: Settings, aliases: ['gear'] },
  { name: 'search', Icon: Search, aliases: ['find'] },
  { name: 'filter', Icon: Filter, aliases: [] },
  { name: 'add', Icon: Plus, aliases: ['plus', 'new'] },
  { name: 'edit', Icon: Pencil, aliases: ['pencil', 'update'] },
  { name: 'delete', Icon: Trash2, aliases: ['trash', 'remove'] },
  { name: 'restore', Icon: RotateCcw, aliases: ['rotate-ccw', 'undo'] },
  { name: 'check', Icon: Check, aliases: ['ok'] },
];

const Gallery = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: var(--border-thin);
  background: var(--border-subtle);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
`;

const IconCell = styled.figure`
  margin: 0;
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-2) var(--space-3);
  transition: background var(--duration-fast) var(--ease-default);

  &:hover {
    background: var(--bg-elevated);
  }
`;

const IconName = styled.figcaption`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg3);
  letter-spacing: var(--tracking-wide);
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
`;

const Empty = styled.p`
  margin: 0;
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
  background: var(--bg-surface);
  border: var(--border-thin) dashed var(--border-base);
  border-radius: var(--radius-md);
`;

const SIZES: ReadonlyArray<IconSize> = ['xs', 'sm', 'md', 'lg', 'xl'];
const TONES: ReadonlyArray<{ value: IconTone; label: string }> = [
  { value: 'primary', label: 'primary' },
  { value: 'secondary', label: 'secondary' },
  { value: 'muted', label: 'muted' },
  { value: 'accent', label: 'accent' },
  { value: 'success', label: 'success' },
  { value: 'warning', label: 'warning' },
  { value: 'danger', label: 'danger' },
  { value: 'info', label: 'info' },
];

export const Icons: React.FC = () => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICONS;
    return ICONS.filter(entry => {
      if (entry.name.includes(q)) return true;
      return entry.aliases?.some(alias => alias.includes(q));
    });
  }, [query]);

  return (
    <ShowcaseSection
      eyebrow="Components"
      title="Icons"
      description="Wrapper sobre lucide-react. Tamanhos semânticos (xs→xl), tones por token e composição com texto/botão. Use a busca para localizar ícones por nome ou alias."
      ariaLabel="Components Icons"
    >
      <Stack>
        <Label>Galeria · ícones do admin</Label>
        <Input
          aria-label="Buscar ícones"
          placeholder="Buscar por nome ou alias (ex.: trash, gear)"
          value={query}
          onChange={setQuery}
          icon={<Icon icon={Search} size="sm" />}
        />
        {filtered.length === 0 ? (
          <Empty>
            Nenhum ícone para <code>{query}</code>.
          </Empty>
        ) : (
          <Gallery>
            {filtered.map(entry => (
              <IconCell key={entry.name}>
                <Icon icon={entry.Icon} size="md" tone="secondary" title={entry.name} />
                <IconName>{entry.name}</IconName>
              </IconCell>
            ))}
          </Gallery>
        )}
      </Stack>

      <Stack>
        <Label>Tamanhos · xs / sm / md / lg / xl</Label>
        <Row>
          {SIZES.map(size => (
            <Icon key={size} icon={Settings} size={size} tone="secondary" title={`size ${size}`} />
          ))}
        </Row>
      </Stack>

      <Stack>
        <Label>Tones semânticas</Label>
        <Row>
          {TONES.map(tone => (
            <Icon key={tone.value} icon={Check} tone={tone.value} title={tone.label} />
          ))}
        </Row>
      </Stack>

      <Stack>
        <Label>Composição com texto e botão</Label>
        <Row>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Icon icon={CheckCircle2} tone="success" /> Operação concluída
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Icon icon={X} tone="danger" /> Falha
          </span>
          <Button icon={<Icon icon={Plus} size="sm" />}>Novo sistema</Button>
          <Button variant="ghost" icon={<Icon icon={ArrowRight} size="sm" />}>
            Próximo
          </Button>
        </Row>
      </Stack>
    </ShowcaseSection>
  );
};
