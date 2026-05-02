import { Trash2, Undo2 } from 'lucide-react';
import React from 'react';

import { Button } from '../../components/ui';

/**
 * Par de botões "Desativar" / "Restaurar" para uma linha com soft-
 * delete (`deletedAt: string | null`).
 *
 * Os botões são mutuamente exclusivos por construção: "Desativar"
 * aparece apenas em linhas ativas (`deletedAt === null`) e "Restaurar"
 * apenas em linhas soft-deletadas (`deletedAt !== null`). O caller
 * passa o gating de permissão (`canDelete`/`canRestore`) e o helper
 * combina com a checagem de `deletedAt` para decidir o que renderizar
 * — alinha com o padrão das listagens (`SystemsPage`,
 * `ClientsListShellPage`, `TokensListShellPage`).
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** o par de
 * `<Button variant="ghost">` (Desativar com `Trash2` + Restaurar com
 * `Undo2`) duplicava ~13 linhas entre `ClientsListShellPage` e
 * `TokensListShellPage`. JSCPD detectou o clone. Centralizar aqui
 * elimina a duplicação na raiz; cada caller só passa os handlers e
 * o copy do label aria.
 *
 * **Por que não cobrir `<RowActions>` wrapper?** O wrapper (display:
 * flex + gap) já vive em `src/shared/listing/styles.ts` e cada
 * página importa diretamente. Manter este helper agnóstico do wrapper
 * permite que uma página inclua botões adicionais (ex.: "Editar"
 * antes de "Desativar") sem precisar de prop slot — o caller compõe
 * livremente os filhos do `<RowActions>`.
 */

interface SoftDeleteRestoreButtonsProps {
  /**
   * Estado de soft-delete da linha. `null` indica linha ativa
   * (renderiza "Desativar"); valor não-nulo indica linha soft-
   * deletada (renderiza "Restaurar"). Espelha o tipo do campo
   * `deletedAt` dos DTOs (`SystemDto`/`TokenTypeDto`/etc.).
   */
  deletedAt: string | null;
  /**
   * Gating de permissão para o botão "Desativar". Quando `false`, o
   * botão não aparece mesmo em linha ativa. Tipicamente consumido a
   * partir de `useAuth().hasPermission(<RECURSO>_DELETE)`.
   */
  canDelete: boolean;
  /**
   * Gating de permissão para o botão "Restaurar". Quando `false`, o
   * botão não aparece mesmo em linha soft-deletada. Tipicamente
   * consumido a partir de `useAuth().hasPermission(<RECURSO>_RESTORE)`.
   */
  canRestore: boolean;
  /** Handler do botão "Desativar". */
  onDelete: () => void;
  /** Handler do botão "Restaurar". */
  onRestore: () => void;
  /**
   * `aria-label` do botão "Desativar" (ex.: `Desativar tipo de token
   * Acesso padrão`). O caller compõe a string completa para que o
   * recurso e o nome da entidade fiquem explícitos para tecnologias
   * assistivas.
   */
  deleteAriaLabel: string;
  /**
   * `aria-label` do botão "Restaurar" (ex.: `Restaurar tipo de token
   * Acesso padrão`).
   */
  restoreAriaLabel: string;
  /** `data-testid` do botão "Desativar" (ex.: `token-types-delete-<id>`). */
  deleteTestId: string;
  /** `data-testid` do botão "Restaurar" (ex.: `token-types-restore-<id>`). */
  restoreTestId: string;
}

export const SoftDeleteRestoreButtons: React.FC<SoftDeleteRestoreButtonsProps> = ({
  deletedAt,
  canDelete,
  canRestore,
  onDelete,
  onRestore,
  deleteAriaLabel,
  restoreAriaLabel,
  deleteTestId,
  restoreTestId,
}) => {
  const isActive = deletedAt === null;
  return (
    <>
      {canDelete && isActive && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} strokeWidth={1.5} />}
          onClick={onDelete}
          aria-label={deleteAriaLabel}
          data-testid={deleteTestId}
        >
          Desativar
        </Button>
      )}
      {canRestore && !isActive && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Undo2 size={14} strokeWidth={1.5} />}
          onClick={onRestore}
          aria-label={restoreAriaLabel}
          data-testid={restoreTestId}
        >
          Restaurar
        </Button>
      )}
    </>
  );
};
