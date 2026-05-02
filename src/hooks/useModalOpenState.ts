import { useCallback, useState } from 'react';

/**
 * Estado boolean controlado de visibilidade de um modal + os
 * handlers `open`/`close` correspondentes. Espelha o padrão usado
 * pelas páginas de listagem (`SystemsPage`, `RoutesPage`, `RolesPage`,
 * `UsersListShellPage`, `ClientsListShellPage`) para gerenciar a
 * abertura do modal "Novo X" disparado pela toolbar.
 *
 * **Por que existe (lição PR #134/#135):** o trio
 *
 * ```tsx
 * const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
 * const handleOpenCreateModal = useCallback(() => {
 *   setIsCreateModalOpen(true);
 * }, []);
 * const handleCloseCreateModal = useCallback(() => {
 *   setIsCreateModalOpen(false);
 * }, []);
 * ```
 *
 * é literalmente idêntico entre `UsersListShellPage` (PR #155 — #78)
 * e `ClientsListShellPage` (PR #74) — jscpd detectou ~18 linhas
 * duplicadas. Centralizar aqui:
 *
 * - Reduz cada página a 1 linha (`const { isOpen, open, close } =
 *   useModalOpenState();`).
 * - Garante simetria de comportamento entre as páginas.
 * - Concentra evolução futura (ex.: telemetria de abertura, focus
 *   trap, etc.) em um único lugar.
 *
 * O hook é genérico (não acoplado a "Create" ou "Edit") — pode ser
 * reusado por qualquer modal cuja abertura seja controlada pela
 * página pai. Mantemos os identificadores neutros (`open`/`close`)
 * para preservar leitura natural no callsite.
 */
export interface UseModalOpenStateReturn {
  /** Flag de visibilidade — passe direto para `<Modal open={...}>`. */
  isOpen: boolean;
  /** Abre o modal. Memoizado — referência estável entre renders. */
  open: () => void;
  /** Fecha o modal. Memoizado — referência estável entre renders. */
  close: () => void;
}

export function useModalOpenState(initialOpen = false): UseModalOpenStateReturn {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, open, close };
}
