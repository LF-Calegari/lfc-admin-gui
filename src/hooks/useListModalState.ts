import { useCallback, useMemo, useState } from 'react';

/**
 * Cápsula de estado para um modal de listagem (criação OU edição/
 * exclusão por linha). Centraliza o trio `[selecionado, abrir,
 * fechar]` que aparece em todas as páginas de listagem do
 * admin-gui (Sistemas/Rotas/Roles/Usuários/Clientes).
 *
 * **Por que existe (lição PR #134/#135 — prevenção):**
 *
 * Antes desta extração, cada `*ListShellPage`/`*Page` declarava
 * inline algo como:
 *
 * ```ts
 * const [editingX, setEditingX] = useState<XDto | null>(null);
 * const handleOpenEditModal = useCallback((row: XDto) => {
 *   setEditingX(row);
 * }, []);
 * const handleCloseEditModal = useCallback(() => {
 *   setEditingX(null);
 * }, []);
 * ```
 *
 * O JSCPD/Sonar tokeniza esse bloco de 11+ linhas como duplicação
 * cross-recurso (`SystemsPage` × `RoutesPage` × `RolesPage` ×
 * `UsersListShellPage` — todas reproduziam o mesmo trio). Esta
 * extração colapsa para uma chamada de hook por uso, eliminando
 * o clone na fonte.
 *
 * @template T — DTO da entidade (ex.: `UserDto`, `SystemDto`).
 *
 * @example
 * const { selected: editingUser, open: openEditUser, close: closeEditUser } =
 *   useListModalState<UserDto>();
 *
 * // Ao clicar no botão "Editar":  openEditUser(user)
 * // Ao fechar/sucesso:            closeEditUser()
 * // No JSX:                       editingUser !== null && <EditUserModal ... />
 */
export interface ListModalState<T> {
  /** Entidade selecionada para o modal, ou `null` quando fechado. */
  selected: T | null;
  /** Abre o modal selecionando a entidade. */
  open: (entity: T) => void;
  /** Fecha o modal limpando a seleção. */
  close: () => void;
}

export function useListModalState<T>(): ListModalState<T> {
  const [selected, setSelected] = useState<T | null>(null);

  const open = useCallback((entity: T) => {
    setSelected(entity);
  }, []);

  const close = useCallback(() => {
    setSelected(null);
  }, []);

  return useMemo(() => ({ selected, open, close }), [selected, open, close]);
}

/**
 * Variante para modais "abrir/fechar" sem entidade associada (ex.:
 * "Novo X" — não há `row` selecionado, só estado boolean). Centraliza
 * o `[isOpen, openHandler, closeHandler]` que repete em toda página
 * de listagem.
 */
export interface ToggleModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function useToggleModalState(initial = false): ToggleModalState {
  const [isOpen, setIsOpen] = useState<boolean>(initial);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
}
