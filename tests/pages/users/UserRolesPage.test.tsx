import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  createUserRolesClientStub,
  ID_ROLE_ADMIN,
  ID_ROLE_OPERATOR,
  ID_ROLE_VIEWER,
  ID_SYS_AUTH,
  ID_SYS_KURTTO,
  ID_USER,
  makePagedRoles,
  makePagedSystems,
  makeRole,
  makeSystem,
  makeUser,
  makeUserRoleSummary,
  primeStubResponses,
  renderUserRolesPage,
  waitForInitialFetch,
} from './__helpers__/userRolesTestHelpers';

import { ToastProvider } from '@/components/ui';
import { UserRolesShellPage } from '@/pages/users';

/**
 * Helper que cria uma Promise que nunca resolve. Necessário para
 * simular um fetch travado (loading state) — `() => {}` em arrow
 * function dispara o lint `no-empty-function`. Wrapper documentado
 * mantém a intenção legível e satisfaz a regra. Espelha
 * `UserPermissionsPage.test.tsx`.
 */
const NEVER_RESOLVES = (): Promise<never> => new Promise<never>(() => undefined);

/**
 * Suíte da `UserRolesShellPage` (Issue #71).
 *
 * Cobre: estados de loading, erro, vazio, render do agrupamento por
 * sistema, distinção visual vinculada vs pendente, diff client-side
 * ao salvar (assign + remove em paralelo), tratamento de :id
 * inválido, e tratamento de falha parcial no salvar.
 *
 * Stub do `ApiClient` injetado via prop `client` — espelha o pattern
 * de `UserPermissionsShellPage`/`RolesPage`. Roteador configurado para
 * `/usuarios/:id/roles` para que `useParams` devolva o id real.
 */

describe('UserRolesShellPage — :id inválido', () => {
  it('exibe InvalidIdNotice quando :id é só whitespace', () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/usuarios/%20/roles']}>
          <Routes>
            <Route
              path="/usuarios/:id/roles"
              element={<UserRolesShellPage client={client} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(screen.getByTestId('user-roles-invalid-id')).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe('UserRolesShellPage — loading e erro inicial', () => {
  it('exibe spinner enquanto as requests não retornam', () => {
    const client = createUserRolesClientStub();
    // Mock que nunca resolve (Promise pendente) — mantém o spinner visível.
    client.get.mockImplementation(NEVER_RESOLVES);

    renderUserRolesPage(client);

    expect(screen.getByTestId('user-roles-loading')).toBeInTheDocument();
  });

  it('exibe ErrorRetryBlock quando o catálogo de roles falha', async () => {
    const client = createUserRolesClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) {
        return Promise.reject({
          kind: 'http',
          status: 500,
          message: 'Falha interna no servidor.',
        });
      }
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystems([makeSystem()]));
      }
      return Promise.resolve(makeUser());
    });

    renderUserRolesPage(client);

    await waitFor(() => {
      expect(screen.getByText('Falha interna no servidor.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('user-roles-retry')).toBeInTheDocument();
  });

  it('exibe ErrorRetryBlock quando getUserById falha', async () => {
    const client = createUserRolesClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) {
        // Backend devolve array cru (não envelope) — listRoles adapta.
        return Promise.resolve([makeRole()]);
      }
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystems([makeSystem()]));
      }
      if (path.startsWith('/users/')) {
        return Promise.reject({
          kind: 'http',
          status: 404,
          message: 'Usuário não encontrado.',
        });
      }
      return Promise.reject(new Error('unexpected'));
    });

    renderUserRolesPage(client);

    await waitFor(() => {
      expect(screen.getByText('Usuário não encontrado.')).toBeInTheDocument();
    });
  });

  it('retry refaz fetch e renderiza grupo após sucesso', async () => {
    const client = createUserRolesClientStub();
    let attempt = 0;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/roles')) {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject({
            kind: 'network',
            message: 'Falha de conexão.',
          });
        }
        // Backend devolve array cru (não envelope) — listRoles adapta.
        return Promise.resolve([makeRole()]);
      }
      if (path.startsWith('/systems')) {
        return Promise.resolve(makePagedSystems([makeSystem()]));
      }
      return Promise.resolve(makeUser());
    });

    renderUserRolesPage(client);

    await waitFor(() => {
      expect(screen.getByTestId('user-roles-retry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('user-roles-retry'));

    await waitForInitialFetch();
    expect(screen.getByTestId('user-roles-group-authenticator')).toBeInTheDocument();
  });
});

describe('UserRolesShellPage — render do catálogo', () => {
  it('renderiza grupos por sistema, ordenados por systemCode', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([
        makeRole({
          id: 'r-kurtto',
          systemId: ID_SYS_KURTTO,
          code: 'k-admin',
          name: 'Kurtto Admin',
        }),
        makeRole({
          id: ID_ROLE_ADMIN,
          systemId: ID_SYS_AUTH,
          code: 'admin',
          name: 'Admin',
        }),
      ]),
      systems: makePagedSystems([
        makeSystem({ id: ID_SYS_AUTH, code: 'authenticator', name: 'Authenticator' }),
        makeSystem({ id: ID_SYS_KURTTO, code: 'kurtto', name: 'Kurtto' }),
      ]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const groups = screen.getAllByLabelText(/roles neste sistema/i);
    expect(groups).toHaveLength(2);
    expect(screen.getByTestId('user-roles-group-authenticator')).toBeInTheDocument();
    expect(screen.getByTestId('user-roles-group-kurtto')).toBeInTheDocument();
  });

  it('exibe estado vazio quando o catálogo é vazio', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    expect(screen.getByTestId('user-roles-empty')).toBeInTheDocument();
  });

  it('marca role atualmente vinculada com badge "Vinculada"', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_ADMIN })]),
      user: makeUser({
        roles: [makeUserRoleSummary({ id: ID_ROLE_ADMIN })],
      }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(`user-roles-item-${ID_ROLE_ADMIN}`);
    expect(item).toHaveTextContent('Vinculada');
  });

  it('checkbox vem desmarcado quando role não está vinculada', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_VIEWER, code: 'viewer' })]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-roles-checkbox-${ID_ROLE_VIEWER}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('checkbox vem marcado quando role já está vinculada', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_ADMIN })]),
      user: makeUser({
        roles: [makeUserRoleSummary({ id: ID_ROLE_ADMIN })],
      }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-roles-checkbox-${ID_ROLE_ADMIN}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('roles sem systemId aparecem no grupo "Sem sistema" (—)', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([
        makeRole({ id: 'r-orphan', systemId: null, code: 'legacy' }),
      ]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    expect(screen.getByTestId('user-roles-group-—')).toBeInTheDocument();
  });
});

describe('UserRolesShellPage — interação e diff client-side', () => {
  it('botão Salvar fica desabilitado quando não há mudanças', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_ADMIN })]),
      user: makeUser({
        roles: [makeUserRoleSummary({ id: ID_ROLE_ADMIN })],
      }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const save = screen.getByTestId('user-roles-save') as HTMLButtonElement;
    expect(save).toBeDisabled();
  });

  it('marcar uma role habilita Salvar e mostra "Adição pendente"', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_VIEWER, code: 'viewer' })]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-roles-checkbox-${ID_ROLE_VIEWER}`,
    );
    fireEvent.click(checkbox);

    expect(screen.getByTestId('user-roles-save')).not.toBeDisabled();
    expect(
      screen.getByTestId(`user-roles-item-${ID_ROLE_VIEWER}`),
    ).toHaveTextContent('Adição pendente');
  });

  it('desmarcar uma role vinculada mostra "Remoção pendente"', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_ADMIN })]),
      user: makeUser({
        roles: [makeUserRoleSummary({ id: ID_ROLE_ADMIN })],
      }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_ADMIN}`),
    );

    expect(
      screen.getByTestId(`user-roles-item-${ID_ROLE_ADMIN}`),
    ).toHaveTextContent('Remoção pendente');
  });

  it('Descartar alterações volta o checkbox ao estado original', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_VIEWER, code: 'viewer' })]),
      user: makeUser({ roles: [] }),
    });

    renderUserRolesPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-roles-checkbox-${ID_ROLE_VIEWER}`,
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByTestId('user-roles-reset'));
    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId('user-roles-save')).toBeDisabled();
  });
});

describe('UserRolesShellPage — salvar diff', () => {
  it('chama assign apenas para adições e remove apenas para remoções', async () => {
    const client = createUserRolesClientStub();
    // Catálogo com 2 roles: VIEWER (estará marcada) e OPERATOR (será
    // desmarcada). User tem só OPERATOR — depois do click esperamos:
    // toAdd=[VIEWER], toRemove=[OPERATOR].
    primeStubResponses(client, {
      roles: makePagedRoles([
        makeRole({ id: ID_ROLE_VIEWER, code: 'viewer', name: 'Viewer' }),
        makeRole({ id: ID_ROLE_OPERATOR, code: 'operator', name: 'Operator' }),
      ]),
      user: makeUser({
        roles: [
          makeUserRoleSummary({ id: ID_ROLE_OPERATOR, code: 'operator', name: 'Operator' }),
        ],
      }),
    });
    client.post.mockResolvedValue({
      id: 'link-1',
      userId: ID_USER,
      roleId: ID_ROLE_VIEWER,
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
      deletedAt: null,
    });
    client.delete.mockResolvedValue(undefined);

    renderUserRolesPage(client);
    await waitForInitialFetch();

    // marca VIEWER
    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_VIEWER}`),
    );
    // desmarca OPERATOR
    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_OPERATOR}`),
    );

    fireEvent.click(screen.getByTestId('user-roles-save'));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });

    const [postPath, postBody] = client.post.mock.calls[0];
    expect(postPath).toBe(`/users/${ID_USER}/roles`);
    expect(postBody).toEqual({ roleId: ID_ROLE_VIEWER });

    expect(client.delete.mock.calls[0][0]).toBe(
      `/users/${ID_USER}/roles/${ID_ROLE_OPERATOR}`,
    );
  });

  it('falha pontual no assign não aborta o lote (remove ainda é executado)', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([
        makeRole({ id: ID_ROLE_VIEWER, code: 'viewer' }),
        makeRole({ id: ID_ROLE_OPERATOR, code: 'operator' }),
      ]),
      user: makeUser({
        roles: [makeUserRoleSummary({ id: ID_ROLE_OPERATOR, code: 'operator' })],
      }),
    });
    client.post.mockRejectedValue({
      kind: 'http',
      status: 400,
      message: 'RoleId inválido.',
    });
    client.delete.mockResolvedValue(undefined);

    renderUserRolesPage(client);
    await waitForInitialFetch();

    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_VIEWER}`),
    );
    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_OPERATOR}`),
    );
    fireEvent.click(screen.getByTestId('user-roles-save'));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });
  });

  it('refaz fetch após salvar (sincroniza estado com backend)', async () => {
    const client = createUserRolesClientStub();
    primeStubResponses(client, {
      roles: makePagedRoles([makeRole({ id: ID_ROLE_VIEWER, code: 'viewer' })]),
      user: makeUser({ roles: [] }),
    });
    client.post.mockResolvedValue({
      id: 'link-1',
      userId: ID_USER,
      roleId: ID_ROLE_VIEWER,
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
      deletedAt: null,
    });

    renderUserRolesPage(client);
    await waitForInitialFetch();

    const initialGetCalls = client.get.mock.calls.length;

    fireEvent.click(
      screen.getByTestId(`user-roles-checkbox-${ID_ROLE_VIEWER}`),
    );
    fireEvent.click(screen.getByTestId('user-roles-save'));

    await waitFor(() => {
      // Após salvar a página dispara refetch — pelo menos uma chamada
      // adicional ao client.get aconteceu.
      expect(client.get.mock.calls.length).toBeGreaterThan(initialGetCalls);
    });
  });
});
