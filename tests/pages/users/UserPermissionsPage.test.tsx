import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  createUserPermissionsClientStub,
  ID_PERM_ROLES_LIST,
  ID_PERM_USERS_LIST,
  ID_PERM_USERS_UPDATE,
  ID_ROLE_ADMIN,
  ID_SYS_AUTH,
  ID_SYS_KURTTO,
  ID_USER,
  makeEffective,
  makePagedPermissions,
  makePermission,
  primeStubResponses,
  renderUserPermissionsPage,
  waitForInitialFetch,
} from './__helpers__/userPermissionsTestHelpers';

import { ToastProvider } from '@/components/ui';
import { UserPermissionsShellPage } from '@/pages/users';

/**
 * Helper que cria uma Promise que nunca resolve. Necessário para
 * simular um fetch travado (loading state) — `() => {}` em arrow
 * function dispara o lint `no-empty-function`. Wrapper documentado
 * mantém a intenção legível e satisfaz a regra.
 */
const NEVER_RESOLVES = (): Promise<never> => new Promise<never>(() => undefined);

/**
 * Suíte da `UserPermissionsShellPage` (Issue #70).
 *
 * Cobre: estados de loading, erro, vazio, render do agrupamento por
 * sistema, distinção visual direta vs herdada, diff client-side ao
 * salvar (assign + remove em paralelo), tratamento de :id inválido,
 * e tratamento de falha parcial no salvar.
 *
 * Stub do `ApiClient` injetado via prop `client` — espelha o pattern
 * de `RolesPage`/`RoutesPage`. Roteador configurado para
 * `/usuarios/:id/permissoes` para que `useParams` devolva o id real.
 */

describe('UserPermissionsShellPage — :id inválido', () => {
  it('exibe InvalidIdNotice quando :id é só whitespace', () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/usuarios/%20/permissoes']}>
          <Routes>
            <Route
              path="/usuarios/:id/permissoes"
              element={<UserPermissionsShellPage client={client} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(screen.getByTestId('user-permissions-invalid-id')).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe('UserPermissionsShellPage — loading e erro inicial', () => {
  it('exibe spinner enquanto as requests não retornam', () => {
    const client = createUserPermissionsClientStub();
    // Mock que nunca resolve (Promise pendente) — mantém o spinner visível.
    client.get.mockImplementation(NEVER_RESOLVES);

    renderUserPermissionsPage(client);

    expect(screen.getByTestId('user-permissions-loading')).toBeInTheDocument();
  });

  it('exibe ErrorRetryBlock quando catálogo falha', async () => {
    const client = createUserPermissionsClientStub();
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/permissions')) {
        return Promise.reject({
          kind: 'http',
          status: 500,
          message: 'Falha interna no servidor.',
        });
      }
      return Promise.resolve([]);
    });

    renderUserPermissionsPage(client);

    await waitFor(() => {
      expect(screen.getByText('Falha interna no servidor.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('user-permissions-retry')).toBeInTheDocument();
  });

  it('retry refaz fetch e renderiza grupo após sucesso', async () => {
    const client = createUserPermissionsClientStub();
    let attempt = 0;
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/permissions')) {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject({
            kind: 'network',
            message: 'Falha de conexão.',
          });
        }
        return Promise.resolve(makePagedPermissions([makePermission()]));
      }
      return Promise.resolve([]);
    });

    renderUserPermissionsPage(client);

    await waitFor(() => {
      expect(screen.getByTestId('user-permissions-retry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('user-permissions-retry'));

    await waitForInitialFetch();
    expect(screen.getByTestId('user-permissions-group-authenticator')).toBeInTheDocument();
  });
});

describe('UserPermissionsShellPage — render do catálogo', () => {
  it('renderiza grupos por sistema, ordenados por systemCode', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({
          id: 'p-kurtto',
          systemId: ID_SYS_KURTTO,
          systemCode: 'kurtto',
          systemName: 'Kurtto',
          routeCode: 'KURTTO_V1_FOO',
          routeName: 'Foo',
        }),
        makePermission({
          id: ID_PERM_USERS_LIST,
          systemId: ID_SYS_AUTH,
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
      ]),
      effective: [],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const groups = screen.getAllByLabelText(
      /permissões neste sistema/i,
    );
    expect(groups).toHaveLength(2);
    // Ambos os grupos visíveis — a ordem alfabética coloca 'authenticator' antes de 'kurtto'.
    expect(screen.getByTestId('user-permissions-group-authenticator')).toBeInTheDocument();
    expect(screen.getByTestId('user-permissions-group-kurtto')).toBeInTheDocument();
  });

  it('exibe estado vazio quando o catálogo é vazio', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([]),
      effective: [],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    expect(screen.getByTestId('user-permissions-empty')).toBeInTheDocument();
  });

  it('marca permissão direta atualmente atribuída com badge "Direta"', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_USERS_LIST }),
      ]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_LIST })],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(`user-permissions-item-${ID_PERM_USERS_LIST}`);
    expect(item).toHaveTextContent('Direta');
  });

  it('marca permissão herdada via role com badge "Herdada · <Role>"', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_ROLES_LIST }),
      ]),
      effective: [
        makeEffective({
          permissionId: ID_PERM_ROLES_LIST,
          sources: [
            {
              kind: 'role',
              roleId: ID_ROLE_ADMIN,
              roleCode: 'admin',
              roleName: 'Administrator',
            },
          ],
        }),
      ],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(`user-permissions-item-${ID_PERM_ROLES_LIST}`);
    expect(item).toHaveTextContent(/Herdada · Administrator/);
  });

  it('checkbox vem desmarcado quando permissão não é direta', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_USERS_UPDATE }),
      ]),
      effective: [],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-permissions-checkbox-${ID_PERM_USERS_UPDATE}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('checkbox vem marcado quando permissão é direta', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_USERS_LIST }),
      ]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_LIST })],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-permissions-checkbox-${ID_PERM_USERS_LIST}`,
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

describe('UserPermissionsShellPage — interação e diff client-side', () => {
  it('botão Salvar fica desabilitado quando não há mudanças', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_USERS_LIST })]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_LIST })],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const save = screen.getByTestId('user-permissions-save') as HTMLButtonElement;
    expect(save).toBeDisabled();
  });

  it('marcar uma permissão habilita Salvar e mostra "Adição pendente"', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_USERS_UPDATE })]),
      effective: [],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-permissions-checkbox-${ID_PERM_USERS_UPDATE}`,
    );
    fireEvent.click(checkbox);

    expect(screen.getByTestId('user-permissions-save')).not.toBeDisabled();
    expect(
      screen.getByTestId(`user-permissions-item-${ID_PERM_USERS_UPDATE}`),
    ).toHaveTextContent('Adição pendente');
  });

  it('desmarcar uma permissão direta mostra "Remoção pendente"', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_USERS_LIST })]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_LIST })],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    fireEvent.click(
      screen.getByTestId(`user-permissions-checkbox-${ID_PERM_USERS_LIST}`),
    );

    expect(
      screen.getByTestId(`user-permissions-item-${ID_PERM_USERS_LIST}`),
    ).toHaveTextContent('Remoção pendente');
  });

  it('Descartar alterações volta o checkbox ao estado original', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([makePermission({ id: ID_PERM_USERS_UPDATE })]),
      effective: [],
    });

    renderUserPermissionsPage(client);

    await waitForInitialFetch();
    const checkbox = screen.getByTestId(
      `user-permissions-checkbox-${ID_PERM_USERS_UPDATE}`,
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByTestId('user-permissions-reset'));
    expect(checkbox.checked).toBe(false);
    expect(screen.getByTestId('user-permissions-save')).toBeDisabled();
  });
});

describe('UserPermissionsShellPage — salvar diff', () => {
  it('chama assign apenas para adições e remove apenas para remoções', async () => {
    const client = createUserPermissionsClientStub();
    // Catálogo com 2 permissões: USERS_LIST (estará marcada) e USERS_UPDATE
    // (será desmarcada). Effective tem só USERS_UPDATE como direta —
    // depois do click esperamos: toAdd=[USERS_LIST], toRemove=[USERS_UPDATE].
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_USERS_LIST }),
        makePermission({
          id: ID_PERM_USERS_UPDATE,
          routeCode: 'AUTH_V1_USERS_UPDATE',
          routeName: 'Atualizar usuário',
          permissionTypeCode: 'Update',
          permissionTypeName: 'Edição',
        }),
      ]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_UPDATE })],
    });
    client.post.mockResolvedValue({
      id: 'link-1',
      userId: ID_USER,
      permissionId: ID_PERM_USERS_LIST,
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
      deletedAt: null,
    });
    client.delete.mockResolvedValue(undefined);

    renderUserPermissionsPage(client);
    await waitForInitialFetch();

    // marca USERS_LIST
    fireEvent.click(
      screen.getByTestId(`user-permissions-checkbox-${ID_PERM_USERS_LIST}`),
    );
    // desmarca USERS_UPDATE
    fireEvent.click(
      screen.getByTestId(`user-permissions-checkbox-${ID_PERM_USERS_UPDATE}`),
    );

    fireEvent.click(screen.getByTestId('user-permissions-save'));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });

    const [postPath, postBody] = client.post.mock.calls[0];
    expect(postPath).toBe(`/users/${ID_USER}/permissions`);
    expect(postBody).toEqual({ permissionId: ID_PERM_USERS_LIST });

    expect(client.delete.mock.calls[0][0]).toBe(
      `/users/${ID_USER}/permissions/${ID_PERM_USERS_UPDATE}`,
    );
  });

  it('falha pontual no assign não aborta o lote (remove ainda é executado)', async () => {
    const client = createUserPermissionsClientStub();
    primeStubResponses(client, {
      catalog: makePagedPermissions([
        makePermission({ id: ID_PERM_USERS_LIST }),
        makePermission({
          id: ID_PERM_USERS_UPDATE,
          routeCode: 'AUTH_V1_USERS_UPDATE',
          permissionTypeCode: 'Update',
        }),
      ]),
      effective: [makeEffective({ permissionId: ID_PERM_USERS_UPDATE })],
    });
    client.post.mockRejectedValue({
      kind: 'http',
      status: 400,
      message: 'PermissionId inválido.',
    });
    client.delete.mockResolvedValue(undefined);

    renderUserPermissionsPage(client);
    await waitForInitialFetch();

    fireEvent.click(
      screen.getByTestId(`user-permissions-checkbox-${ID_PERM_USERS_LIST}`),
    );
    fireEvent.click(
      screen.getByTestId(`user-permissions-checkbox-${ID_PERM_USERS_UPDATE}`),
    );
    fireEvent.click(screen.getByTestId('user-permissions-save'));

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
    });
  });
});
