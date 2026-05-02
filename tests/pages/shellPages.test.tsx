import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { ClientDetailShellPage, ClientsListShellPage } from '@/pages/clients';
import { PermissionsListShellPage } from '@/pages/permissions';
import { UserDetailShellPage } from '@/pages/users';

/**
 * Suíte agregada para as páginas-shell introduzidas pela Issue #145.
 *
 * Cada shell delega ao `PlaceholderPage` (catálogo de eyebrow/título/desc),
 * então testá-las isoladamente seria duplicação direta. Aqui usamos
 * `it.each` para validar contrato visual mínimo (header presente,
 * eyebrow esperado, aviso "Em desenvolvimento.") em todas as shells
 * remanescentes em uma única tabela — mantém o Sonar limpo de blocos
 * repetidos e facilita ampliar a tabela quando novas shells aparecerem.
 *
 * À medida que cada shell ganha conteúdo real, ela sai desta tabela e
 * passa a ser coberta por uma suíte dedicada
 * (`tests/pages/<recurso>/<Pagina>.test.tsx`). Issue #77 promoveu a
 * `UsersListShellPage` a listagem real (com tabela/busca/paginação),
 * então a entrada respectiva foi removida — a cobertura migrou para
 * `tests/pages/UsersListShellPage.test.tsx`. Issue #70 promoveu a
 * `UserPermissionsShellPage` a tela funcional (matriz de checkbox por
 * permissão), com cobertura em
 * `tests/pages/users/UserPermissionsPage.test.tsx`.
 *
 * As asserts cobrem:
 * - Renderização sem warning/exception (cada shell é um componente
 *   React puro sem dependência de Provider/contexto, então
 *   `render` direto é suficiente).
 * - Eyebrow correto (mantém a numeração e o nome da seção alinhados
 *   com a Sidebar).
 * - Título correto.
 * - Aviso "Em desenvolvimento." presente — sinal explícito de que o
 *   conteúdo virá em sub-issues posteriores.
 */
interface ShellCase {
  name: string;
  Component: React.ComponentType;
  eyebrow: string;
  title: string;
}

const SHELL_CASES: ReadonlyArray<ShellCase> = [
  {
    name: 'ClientsListShellPage',
    Component: ClientsListShellPage,
    eyebrow: '05 Clientes',
    title: 'Clientes',
  },
  {
    name: 'ClientDetailShellPage',
    Component: ClientDetailShellPage,
    eyebrow: '05 Clientes · Detalhe',
    title: 'Detalhe do cliente',
  },
  {
    name: 'PermissionsListShellPage',
    Component: PermissionsListShellPage,
    eyebrow: '04 Permissões',
    title: 'Permissões',
  },
  {
    name: 'UserDetailShellPage',
    Component: UserDetailShellPage,
    eyebrow: '06 Usuários · Detalhe',
    title: 'Detalhe do usuário',
  },
  // Nota: `UserPermissionsShellPage` foi promovida pela Issue #70 a
  // tela funcional (deixou de delegar ao `PlaceholderPage`). Por isso
  // não aparece mais nesta tabela — sua cobertura vive em
  // `tests/pages/users/UserPermissionsPage.test.tsx`.
];

describe('Shell pages — contrato visual mínimo (Issue #145)', () => {
  it.each(SHELL_CASES)(
    '$name renderiza eyebrow, título e aviso "Em desenvolvimento."',
    ({ Component, eyebrow, title }) => {
      render(<Component />);

      expect(screen.getByText(eyebrow)).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: title }),
      ).toBeInTheDocument();
      expect(screen.getByText('Em desenvolvimento.')).toBeInTheDocument();
    },
  );
});
