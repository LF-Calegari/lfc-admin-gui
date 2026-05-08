import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import { buildAuthMock } from './__helpers__/mockUseAuth';
import {
  createPermissionsClientStub,
  ID_ROUTE_USERS_CREATE,
  ID_ROUTE_USERS_LIST,
  ID_SYSTEM_AUTH,
  ID_TYPE_CREATE,
  ID_TYPE_READ,
  makePagedPermissionsResponse,
  makePagedRoutesResponse,
  makePagedSystemsResponse,
  makePermission,
  makePermissionType,
  makeRouteDto,
  makeSystem,
  renderPermissionsListPage,
  seedPermissionsListGetMock,
  waitForInitialList,
} from './__helpers__/permissionsTestHelpers';
/* eslint-enable import/order */

import type { PermissionDto } from '@/shared/api';

/**
 * Suíte do fluxo "Nova permissão" na `PermissionsListShellPage` (Issue #201).
 */

const PERMISSIONS_LIST_PERMISSION = 'AUTH_V1_PERMISSIONS_LIST';
const PERMISSIONS_CREATE_PERMISSION = 'AUTH_V1_PERMISSIONS_CREATE';

let permissionsMock: ReadonlyArray<string> = [
  PERMISSIONS_LIST_PERMISSION,
  PERMISSIONS_CREATE_PERMISSION,
];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

const SAMPLE_SYSTEMS = makePagedSystemsResponse([
  makeSystem({ id: ID_SYSTEM_AUTH, code: 'authenticator', name: 'Authenticator' }),
]);

const ROW_ALICE: PermissionDto = makePermission({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  routeCode: 'AUTH_V1_USERS_LIST',
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  permissionsMock = [PERMISSIONS_LIST_PERMISSION, PERMISSIONS_CREATE_PERMISSION];
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openCreateModal(client: ReturnType<typeof createPermissionsClientStub>): Promise<void> {
  seedPermissionsListGetMock({
    client,
    systemsResponse: SAMPLE_SYSTEMS,
    permissionsQueue: [makePagedPermissionsResponse([ROW_ALICE])],
    routesPaged: makePagedRoutesResponse([
      makeRouteDto({ id: ID_ROUTE_USERS_LIST }),
      makeRouteDto({
        id: ID_ROUTE_USERS_CREATE,
        code: 'AUTH_V1_USERS_CREATE',
        name: 'POST /api/v1/users',
      }),
    ]),
    permissionTypes: [
      makePermissionType({ id: ID_TYPE_READ, name: 'Ler', code: 'read' }),
      makePermissionType({ id: ID_TYPE_CREATE, name: 'Criar', code: 'create' }),
    ],
  });

  renderPermissionsListPage(client);
  await waitForInitialList(client);

  fireEvent.click(screen.getByTestId('permissions-create-open'));

  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getByTestId('new-permission-type-id')).not.toBeDisabled();
  });
}

describe('PermissionsListShellPage — Nova permissão (Issue #201)', () => {
  describe('gating do botão', () => {
    it('oculta o CTA sem AUTH_V1_PERMISSIONS_CREATE', async () => {
      permissionsMock = [PERMISSIONS_LIST_PERMISSION];
      const client = createPermissionsClientStub();
      seedPermissionsListGetMock({
        client,
        systemsResponse: SAMPLE_SYSTEMS,
        permissionsQueue: [makePagedPermissionsResponse([ROW_ALICE])],
      });
      renderPermissionsListPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('permissions-create-open')).not.toBeInTheDocument();
    });

    it('exibe "Nova permissão" quando o usuário possui CREATE', async () => {
      const client = createPermissionsClientStub();
      seedPermissionsListGetMock({
        client,
        systemsResponse: SAMPLE_SYSTEMS,
        permissionsQueue: [makePagedPermissionsResponse([ROW_ALICE])],
      });
      renderPermissionsListPage(client);
      await waitForInitialList(client);

      const btn = screen.getByTestId('permissions-create-open');
      expect(btn).toHaveTextContent(/Nova permissão/i);
    });
  });

  describe('modal — validação e submissão', () => {
    it('submeter sem preencher campos obrigatórios mantém POST ausente', async () => {
      const client = createPermissionsClientStub();
      await openCreateModal(client);

      fireEvent.submit(screen.getByTestId('new-permission-form'));

      expect(screen.getByText('Selecione um sistema.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('caminho feliz: POST /permissions e mensagem de sucesso', async () => {
      const client = createPermissionsClientStub();
      await openCreateModal(client);

      const created = makePermission({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        routeId: ID_ROUTE_USERS_CREATE,
        permissionTypeId: ID_TYPE_CREATE,
        permissionTypeCode: 'create',
        permissionTypeName: 'Criar',
      });
      client.post.mockResolvedValueOnce(created);

      fireEvent.change(screen.getByTestId('new-permission-system-id'), {
        target: { value: ID_SYSTEM_AUTH },
      });

      await waitFor(() => {
        expect(screen.getByTestId('new-permission-route-id')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByTestId('new-permission-route-id'), {
        target: { value: ID_ROUTE_USERS_CREATE },
      });
      fireEvent.change(screen.getByTestId('new-permission-type-id'), {
        target: { value: ID_TYPE_CREATE },
      });

      fireEvent.submit(screen.getByTestId('new-permission-form'));

      await waitFor(() => {
        expect(client.post).toHaveBeenCalledTimes(1);
      });

      expect(client.post.mock.calls[0][0]).toBe('/permissions');
      expect(client.post.mock.calls[0][1]).toEqual({
        routeId: ID_ROUTE_USERS_CREATE,
        permissionTypeId: ID_TYPE_CREATE,
      });

      await waitFor(() => {
        expect(screen.getByText('Permissão criada.')).toBeInTheDocument();
      });
    });

    it('400 do backend mapeia erro no campo da rota', async () => {
      const client = createPermissionsClientStub();
      await openCreateModal(client);

      client.post.mockRejectedValueOnce({
        kind: 'http',
        status: 400,
        message: 'One or more validation errors occurred.',
        details: {
          errors: {
            RouteId: ['RouteId inválido ou rota inativa.'],
          },
        },
      });

      fireEvent.change(screen.getByTestId('new-permission-system-id'), {
        target: { value: ID_SYSTEM_AUTH },
      });
      await waitFor(() => {
        expect(screen.getByTestId('new-permission-route-id')).not.toBeDisabled();
      });
      fireEvent.change(screen.getByTestId('new-permission-route-id'), {
        target: { value: ID_ROUTE_USERS_LIST },
      });
      fireEvent.change(screen.getByTestId('new-permission-type-id'), {
        target: { value: ID_TYPE_READ },
      });

      fireEvent.submit(screen.getByTestId('new-permission-form'));

      await waitFor(() => {
        expect(screen.getByText('RouteId inválido ou rota inativa.')).toBeInTheDocument();
      });
    });
  });
});
