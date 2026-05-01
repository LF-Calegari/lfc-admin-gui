import { Search } from "lucide-react";
import React from "react";

import { Input, Switch } from "../../components/ui";

import { SearchSlot, Toolbar, ToolbarActions } from "./styles";

/**
 * Toolbar superior das listagens — com `Input` de busca, `Switch` de
 * "Mostrar inativas" e slot livre para CTAs (botão "Novo X" gated
 * por permissão).
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O bloco JSX:
 *
 * ```jsx
 * <Toolbar>
 *   <SearchSlot>
 *     <Input label="Buscar" type="search" placeholder="..." icon={<Search />}
 *            value={searchTerm} onChange={handleSearchChange}
 *            aria-label="..." data-testid="...-search" />
 *   </SearchSlot>
 *   <ToolbarActions>
 *     <Switch label="Mostrar inativas" helperText="..."
 *             checked={includeDeleted} onChange={handleIncludeDeletedChange}
 *             data-testid="...-include-deleted" />
 *     {canX && <Button ...>Novo X</Button>}
 *   </ToolbarActions>
 * </Toolbar>
 * ```
 *
 * aparecia idêntico em 3 páginas com diferença apenas em literais
 * ("rota"/"role"/"sistema") e na CTA opcional. Centralizar elimina
 * duplicação. A CTA fica como `actions` (slot React.ReactNode) para
 * preservar a flexibilidade — cada página continua decidindo seu
 * gating de permissão e copy.
 */
interface ListingToolbarProps {
  /** Valor corrente do input de busca. */
  searchValue: string;
  /** Callback do input de busca. */
  onSearchChange: (value: string) => void;
  /** Placeholder do input (ex.: "Nome ou código da role"). */
  searchPlaceholder: string;
  /** ARIA-label do input (ex.: "Buscar roles por nome ou código"). */
  searchAriaLabel: string;
  /** `data-testid` do input (ex.: "roles-search"). */
  searchTestId: string;

  /** Estado corrente do toggle "Mostrar inativas". */
  includeDeletedValue: boolean;
  /** Callback do toggle. */
  onIncludeDeletedChange: (value: boolean) => void;
  /** Helper text do toggle (ex.: "Inclui roles com remoção lógica."). */
  includeDeletedHelperText: string;
  /** `data-testid` do toggle (ex.: "roles-include-deleted"). */
  includeDeletedTestId: string;

  /**
   * Slot opcional para CTAs (botão "Novo X", links de ações em massa,
   * etc.). Cada página resolve gating de permissão antes de passar.
   */
  actions?: React.ReactNode;
}

export const ListingToolbar: React.FC<ListingToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  searchTestId,
  includeDeletedValue,
  onIncludeDeletedChange,
  includeDeletedHelperText,
  includeDeletedTestId,
  actions,
}) => (
  <Toolbar>
    <SearchSlot>
      <Input
        label="Buscar"
        type="search"
        placeholder={searchPlaceholder}
        icon={<Search size={14} strokeWidth={1.5} />}
        value={searchValue}
        onChange={onSearchChange}
        aria-label={searchAriaLabel}
        data-testid={searchTestId}
      />
    </SearchSlot>
    <ToolbarActions>
      <Switch
        label="Mostrar inativas"
        helperText={includeDeletedHelperText}
        checked={includeDeletedValue}
        onChange={onIncludeDeletedChange}
        data-testid={includeDeletedTestId}
      />
      {actions}
    </ToolbarActions>
  </Toolbar>
);
