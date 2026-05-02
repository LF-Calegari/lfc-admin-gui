import { Trash2, type LucideIcon } from 'lucide-react';
import React from 'react';

import { Button, Icon } from '../../components/ui';

import {
  ListRow,
  ListRowLeft,
  ListRowValue,
} from './clientCollectionTabStyles';

interface ClientCollectionListRowProps {
  /** ID do item — usado em `key` (caller passa) e como sufixo de `data-testid`. */
  id: string;
  /** Valor textual exibido na linha (email/telefone/etc.). */
  value: string;
  /** Ícone (lucide-react) renderizado à esquerda do valor. */
  icon: LucideIcon;
  /**
   * Se `true`, o valor é renderizado em fonte monoespaçada (apropriado
   * para telefone). Default `false` (sans, apropriado para email).
   */
  mono?: boolean;
  /**
   * Mostra ou esconde o botão "Remover". Caller passa `canUpdate` —
   * gating de permissão acontece na aba consumidora, não aqui.
   */
  canRemove: boolean;
  /** Callback chamado ao clicar em "Remover". */
  onRemove: () => void;
  /**
   * `aria-label` do botão "Remover" — caller passa label
   * contextualizado (ex.: `"Remover email ana@x.com"`,
   * `"Remover +5518981789845"`).
   */
  removeAriaLabel: string;
  /**
   * Prefixo de `data-testid` (ex.: `client-extra-emails`,
   * `client-mobile-phones`). Estável para asserts.
   */
  testIdPrefix: string;
}

/**
 * Linha de item compartilhada entre as abas que listam coleções de
 * subentidades de cliente (`ClientExtraEmailsTab` — Issue #146;
 * `ClientPhonesTab` — Issue #147).
 *
 * **Por que extraído (lição PR #128/#134/#135):** o JSX do `<ListRow>`
 * (incluindo `<ListRowLeft><Icon/><ListRowValue/></ListRowLeft>` +
 * gating do botão "Remover") era idêntico entre as duas abas,
 * divergindo apenas em qual valor exibir e qual aria-label usar.
 * Sonar/JSCPD tokenizava como bloco duplicado entre arquivos.
 * Promover para componente compartilhado deduplica.
 */
export const ClientCollectionListRow: React.FC<ClientCollectionListRowProps> = ({
  id,
  value,
  icon,
  mono = false,
  canRemove,
  onRemove,
  removeAriaLabel,
  testIdPrefix,
}) => (
  <ListRow data-testid={`${testIdPrefix}-row-${id}`}>
    <ListRowLeft>
      <Icon icon={icon} size="sm" tone="muted" />
      <ListRowValue $mono={mono} title={value}>
        {value}
      </ListRowValue>
    </ListRowLeft>
    {canRemove && (
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />}
        onClick={onRemove}
        aria-label={removeAriaLabel}
        data-testid={`${testIdPrefix}-remove-${id}`}
      >
        Remover
      </Button>
    )}
  </ListRow>
);
