import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  createUserEffectivePermissionsClientStub,
  ID_PERM_ROLES_LIST,
  ID_PERM_USERS_LIST,
  ID_PERM_USERS_UPDATE,
  ID_ROLE_VIEWER,
  ID_SYS_AUTH,
  ID_SYS_KURTTO,
  ID_USER,
  makeEffective,
  makeRoleSource,
  primeStubResponses,
  renderUserEffectivePermissionsPage,
  waitForInitialFetch,
} from './__helpers__/userEffectivePermissionsTestHelpers';

import { ToastProvider } from '@/components/ui';
import { UserEffectivePermissionsShellPage } from '@/pages/users';

/**
 * Helper que cria uma Promise que nunca resolve. Necessário para
 * simular um fetch travado (loading state) — `() => {}` em arrow
 * function dispara `no-empty-function`. Wrapper documentado mantém a
 * intenção legível e satisfaz a regra (mesmo pattern de
 * `UserPermissionsPage.test.tsx`).
 */
const NEVER_RESOLVES = (): Promise<never> => new Promise<never>(() => undefined);

/**
 * Suíte da `UserEffectivePermissionsShellPage` (Issue #72).
 *
 * Cobre: estados de loading, erro, vazio, render do agrupamento por
 * sistema, badges de origem (Direta + Role: X múltiplas), filtro por
 * sistema com refetch server-side, tratamento de :id inválido.
 *
 * Stub do `ApiClient` injetado via prop `client` — espelha o pattern
 * de `UserPermissionsPage.test.tsx`. Roteador configurado para
 * `/usuarios/:id/permissoes-efetivas` para que `useParams` devolva o
 * id real.
 */

describe('UserEffectivePermissionsShellPage — :id inválido', () => {
  it('exibe InvalidIdNotice quando :id é só whitespace', () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client);

    render(
      <ToastProvider>
        <MemoryRouter
          initialEntries={['/usuarios/%20/permissoes-efetivas']}
        >
          <Routes>
            <Route
              path="/usuarios/:id/permissoes-efetivas"
              element={<UserEffectivePermissionsShellPage client={client} />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(
      screen.getByTestId('user-effective-permissions-invalid-id'),
    ).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe('UserEffectivePermissionsShellPage — loading e erro inicial', () => {
  it('exibe spinner enquanto a request não retorna', () => {
    const client = createUserEffectivePermissionsClientStub();
    client.get.mockImplementation(NEVER_RESOLVES);

    renderUserEffectivePermissionsPage(client);

    expect(
      screen.getByTestId('user-effective-permissions-loading'),
    ).toBeInTheDocument();
  });

  it('exibe ErrorRetryBlock quando a request falha', async () => {
    const client = createUserEffectivePermissionsClientStub();
    client.get.mockRejectedValue({
      kind: 'http',
      status: 500,
      message: 'Falha interna no servidor.',
    });

    renderUserEffectivePermissionsPage(client);

    await waitFor(() => {
      expect(screen.getByText('Falha interna no servidor.')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('user-effective-permissions-retry'),
    ).toBeInTheDocument();
  });

  it('retry refaz a request e renderiza o grupo após sucesso', async () => {
    const client = createUserEffectivePermissionsClientStub();
    let attempt = 0;
    client.get.mockImplementation(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject({ kind: 'network', message: 'Falha de conexão.' });
      }
      return Promise.resolve([makeEffective()]);
    });

    renderUserEffectivePermissionsPage(client);

    await waitFor(() => {
      expect(
        screen.getByTestId('user-effective-permissions-retry'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('user-effective-permissions-retry'));

    await waitForInitialFetch();
    expect(
      screen.getByTestId('user-effective-permissions-group-authenticator'),
    ).toBeInTheDocument();
  });
});

describe('UserEffectivePermissionsShellPage — render do agrupamento', () => {
  it('renderiza grupos por sistema, ordenados por systemCode', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: 'p-kurtto',
          systemId: ID_SYS_KURTTO,
          systemCode: 'kurtto',
          systemName: 'Kurtto',
          routeCode: 'KURTTO_V1_FOO',
          routeName: 'Foo',
        }),
        makeEffective({
          permissionId: ID_PERM_USERS_LIST,
          systemId: ID_SYS_AUTH,
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const groups = screen.getAllByLabelText(
      /permissões efetivas neste sistema/i,
    );
    expect(groups).toHaveLength(2);
    expect(
      screen.getByTestId('user-effective-permissions-group-authenticator'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('user-effective-permissions-group-kurtto'),
    ).toBeInTheDocument();
  });

  it('exibe estado vazio quando o usuário não tem permissões efetivas', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, { effective: [] });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    expect(
      screen.getByTestId('user-effective-permissions-empty'),
    ).toBeInTheDocument();
  });
});

describe('UserEffectivePermissionsShellPage — badges de origem', () => {
  it('permissão direta apenas exibe badge "Direta"', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: ID_PERM_USERS_LIST,
          sources: [{ kind: 'direct' }],
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(
      `user-effective-permissions-item-${ID_PERM_USERS_LIST}`,
    );
    expect(item).toHaveTextContent('Direta');
    expect(item).not.toHaveTextContent('Role:');
  });

  it('permissão herdada via uma role exibe badge "Role: <nome>"', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: ID_PERM_ROLES_LIST,
          sources: [makeRoleSource()],
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(
      `user-effective-permissions-item-${ID_PERM_ROLES_LIST}`,
    );
    expect(item).toHaveTextContent(/Role:\s*Administrator/);
    expect(item).not.toHaveTextContent('Direta');
  });

  it('permissão herdada via múltiplas roles exibe uma badge por role', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: ID_PERM_USERS_UPDATE,
          sources: [
            makeRoleSource({
              roleId: ID_ROLE_VIEWER,
              roleCode: 'viewer',
              roleName: 'Viewer',
            }),
            makeRoleSource(),
          ],
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(
      `user-effective-permissions-item-${ID_PERM_USERS_UPDATE}`,
    );
    // Duas badges separadas, uma por role contribuinte (ordem alfabética
    // por roleCode: 'admin' antes de 'viewer'). Validamos via texto +
    // contagem de matches dentro do item — como Badge não aceita
    // `data-testid` nativamente, manter a asserção visual textual evita
    // depender da estrutura interna do styled-component.
    expect(item).toHaveTextContent(/Role:\s*Administrator/);
    expect(item).toHaveTextContent(/Role:\s*Viewer/);
    const matches = within(item).getAllByText(/^Role:/);
    expect(matches).toHaveLength(2);
  });

  it('permissão direta + via role exibe ambas as badges', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: ID_PERM_USERS_LIST,
          sources: [{ kind: 'direct' }, makeRoleSource()],
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const item = screen.getByTestId(
      `user-effective-permissions-item-${ID_PERM_USERS_LIST}`,
    );
    expect(item).toHaveTextContent('Direta');
    expect(item).toHaveTextContent(/Role:\s*Administrator/);
  });
});

describe('UserEffectivePermissionsShellPage — filtro por sistema', () => {
  it('popula o <Select> apenas com sistemas presentes nas efetivas', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          permissionId: ID_PERM_USERS_LIST,
          systemId: ID_SYS_AUTH,
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
        makeEffective({
          permissionId: 'p-kurtto',
          systemId: ID_SYS_KURTTO,
          systemCode: 'kurtto',
          systemName: 'Kurtto',
          routeCode: 'KURTTO_V1_FOO',
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    const select = screen.getByTestId(
      'user-effective-permissions-system-select',
    ) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    // Inclui "Todos os sistemas" + os 2 sistemas únicos.
    expect(options).toContain('Todos os sistemas');
    expect(options).toContain('Authenticator (authenticator)');
    expect(options).toContain('Kurtto (kurtto)');
    expect(options).toHaveLength(3);
  });

  it('escolher um sistema dispara nova request com ?systemId=', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          systemId: ID_SYS_AUTH,
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
        makeEffective({
          permissionId: 'p-kurtto',
          systemId: ID_SYS_KURTTO,
          systemCode: 'kurtto',
          systemName: 'Kurtto',
          routeCode: 'KURTTO_V1_FOO',
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);
    await waitForInitialFetch();

    // Primeiro fetch: sem filtro (querystring vazia)
    expect(client.get).toHaveBeenCalledWith(
      `/users/${ID_USER}/effective-permissions`,
      expect.any(Object),
    );

    fireEvent.change(
      screen.getByTestId('user-effective-permissions-system-select'),
      { target: { value: ID_SYS_AUTH } },
    );

    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith(
        `/users/${ID_USER}/effective-permissions?systemId=${ID_SYS_AUTH}`,
        expect.any(Object),
      );
    });
  });

  it('voltar para "Todos os sistemas" dispara request sem filtro', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, {
      effective: [
        makeEffective({
          systemId: ID_SYS_AUTH,
          systemCode: 'authenticator',
          systemName: 'Authenticator',
        }),
      ],
    });

    renderUserEffectivePermissionsPage(client);
    await waitForInitialFetch();

    fireEvent.change(
      screen.getByTestId('user-effective-permissions-system-select'),
      { target: { value: ID_SYS_AUTH } },
    );
    await waitFor(() => {
      expect(client.get).toHaveBeenCalledWith(
        `/users/${ID_USER}/effective-permissions?systemId=${ID_SYS_AUTH}`,
        expect.any(Object),
      );
    });

    // Volta para "Todos os sistemas" — espera-se request sem ?systemId=
    fireEvent.change(
      screen.getByTestId('user-effective-permissions-system-select'),
      { target: { value: '__all__' } },
    );

    await waitFor(() => {
      const lastCall = client.get.mock.calls[client.get.mock.calls.length - 1];
      expect(lastCall[0]).toBe(`/users/${ID_USER}/effective-permissions`);
    });
  });

  it('não exibe o filtro quando o usuário não tem permissões efetivas', async () => {
    const client = createUserEffectivePermissionsClientStub();
    primeStubResponses(client, { effective: [] });

    renderUserEffectivePermissionsPage(client);

    await waitForInitialFetch();
    expect(
      screen.queryByTestId('user-effective-permissions-system-select'),
    ).not.toBeInTheDocument();
  });

  it('preserva opções de sistema cacheadas após filtrar (não encolhem ao filtrar)', async () => {
    const client = createUserEffectivePermissionsClientStub();
    let callIndex = 0;
    const allEffective = [
      makeEffective({
        systemId: ID_SYS_AUTH,
        systemCode: 'authenticator',
        systemName: 'Authenticator',
      }),
      makeEffective({
        permissionId: 'p-kurtto',
        systemId: ID_SYS_KURTTO,
        systemCode: 'kurtto',
        systemName: 'Kurtto',
        routeCode: 'KURTTO_V1_FOO',
      }),
    ];
    const filteredAuthOnly = [allEffective[0]];
    client.get.mockImplementation((path: string) => {
      if (path.includes('/effective-permissions')) {
        callIndex += 1;
        // Primeiro fetch: sem filtro (todas). Segundo: apenas o sistema
        // filtrado — simula filtragem real do backend.
        return Promise.resolve(callIndex === 1 ? allEffective : filteredAuthOnly);
      }
      return Promise.reject(new Error('URL inesperada'));
    });

    renderUserEffectivePermissionsPage(client);
    await waitForInitialFetch();

    // Antes do filtro: 2 sistemas no dropdown.
    let select = screen.getByTestId(
      'user-effective-permissions-system-select',
    ) as HTMLSelectElement;
    expect(select.options).toHaveLength(3); // 2 sistemas + "Todos"

    // Filtra por Authenticator.
    fireEvent.change(select, { target: { value: ID_SYS_AUTH } });
    await waitFor(() => {
      expect(callIndex).toBe(2);
    });
    await waitForInitialFetch();

    // Mesmo após filtrar, o dropdown mantém Kurtto como opção (cache de
    // `systemOptions` preservado entre filtros — caso contrário o
    // operador ficaria preso no sistema atual).
    select = screen.getByTestId(
      'user-effective-permissions-system-select',
    ) as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toContain('Kurtto (kurtto)');
  });
});
