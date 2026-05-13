import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { buildAuthMock, setupPermissionLifecycle } from '../__helpers__/mockUseAuth';

import {
  createUserPermissionsClientStub,
  ID_USER,
  makeEffective,
  makePagedPermissions,
  makePermission,
} from './__helpers__/userPermissionsTestHelpers';
import { makeUser } from './__helpers__/userRolesTestHelpers';

import { ToastProvider } from '@/components/ui';
import { UserDetailShellPage } from '@/pages/users';

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

setupPermissionLifecycle(
  (perms) => {
    permissionsMock = perms;
  },
  [
    'AUTH_V1_USERS_GET_BY_ID',
    'AUTH_V1_PERMISSIONS_LIST',
    'AUTH_V1_USERS_PERMISSIONS_ASSIGN',
    'AUTH_V1_ROLES_LIST',
    'AUTH_V1_USERS_ROLES_ASSIGN',
  ],
);

function primeUserDetailHappyPath(
  client: ReturnType<typeof createUserPermissionsClientStub>,
): void {
  client.get.mockImplementation((path: string) => {
    if (path === `/users/${ID_USER}`) {
      return Promise.resolve(makeUser({ id: ID_USER }));
    }
    if (path.startsWith('/permissions')) {
      return Promise.resolve(makePagedPermissions([makePermission()]));
    }
    if (path.includes('/effective-permissions')) {
      return Promise.resolve([makeEffective()]);
    }
    return Promise.reject(new Error(`URL não coberta pelo stub: ${path}`));
  });
}

describe('UserDetailShellPage', () => {
  it('exibe aviso quando :id é inválido', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/usuarios/%20']}>
          <Routes>
            <Route path="/usuarios/:id" element={<UserDetailShellPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(screen.getByTestId('user-detail-invalid-id')).toBeInTheDocument();
    expect(screen.getByTestId('user-detail-back')).toBeInTheDocument();
  });

  it('carrega usuário, resumo, atalhos e painel de permissões diretas', async () => {
    const client = createUserPermissionsClientStub();
    primeUserDetailHappyPath(client);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/usuarios/${ID_USER}`]}>
          <Routes>
            <Route path="/usuarios/:id" element={<UserDetailShellPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('user-detail-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('user-detail-summary')).toBeInTheDocument();
    expect(screen.getByTestId('user-detail-link-roles')).toBeInTheDocument();
    expect(screen.getByTestId('user-detail-link-effective')).toBeInTheDocument();
    expect(screen.getByTestId('user-detail-link-permissions-full')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Permissões diretas' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('user-permissions-loading')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('user-permissions-group-authenticator')).toBeInTheDocument();
  });

  it('sem AUTH_V1_USERS_PERMISSIONS_ASSIGN: oculta painel e exibe aviso', async () => {
    permissionsMock = ['AUTH_V1_USERS_GET_BY_ID', 'AUTH_V1_PERMISSIONS_LIST'];

    const client = createUserPermissionsClientStub();
    primeUserDetailHappyPath(client);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/usuarios/${ID_USER}`]}>
          <Routes>
            <Route path="/usuarios/:id" element={<UserDetailShellPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-detail-summary')).toBeInTheDocument();
    });

    expect(screen.getByTestId('user-detail-direct-permissions-locked')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permissões diretas' })).not.toBeInTheDocument();
  });

  it('GET /users/:id com 404: mensagem e botão de nova tentativa', async () => {
    const client = createUserPermissionsClientStub();
    client.get.mockImplementation((path: string) => {
      if (path === `/users/${ID_USER}`) {
        return Promise.reject({ kind: 'http', status: 404, message: 'Usuário não localizado.' });
      }
      return Promise.reject(new Error(path));
    });

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/usuarios/${ID_USER}`]}>
          <Routes>
            <Route path="/usuarios/:id" element={<UserDetailShellPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Usuário não localizado.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('user-detail-retry')).toBeInTheDocument();
  });
});
