import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ClientDto } from '@/shared/api';

import {
  clientDisplayName,
  DEFAULT_CLIENTS_PAGE_SIZE,
  getClientsByIds,
  isClientDto,
  isPagedClientsResponse,
  listClients,
} from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/clients.ts` (Issue #77, EPIC #49).
 *
 * Esta sub-issue não exige a tela de Clientes propriamente dita —
 * apenas o lookup batch (`getClientsByIds`) consumido pela
 * `UsersListShellPage` para denormalizar o nome do cliente vinculado
 * a cada usuário. Os helpers `listClients`/`isClientDto`/etc. são
 * pré-fabricados aqui para evitar refatoração destrutiva quando a
 * issue dedicada da listagem de clientes da EPIC #49 chegar (lição
 * PR #128 — projetar shared helpers desde o primeiro PR do recurso).
 */

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_PJ_ID = '22222222-2222-2222-2222-222222222222';

interface ClientStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  setAuth: ReturnType<typeof vi.fn>;
  getSystemId: ReturnType<typeof vi.fn>;
}

function createStub(): ClientStub {
  return {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuth: vi.fn(),
    getSystemId: vi.fn(() => 'system-test-uuid'),
  };
}

function makeClientPF(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: CLIENT_ID,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Alice Cliente',
    cnpj: null,
    corporateName: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeClientPJ(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: CLIENT_PJ_ID,
    type: 'PJ',
    cpf: null,
    fullName: null,
    cnpj: '12345678000190',
    corporateName: 'Empresa LTDA',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('isClientDto', () => {
  it('aceita payload PF com fullName/cpf', () => {
    expect(isClientDto(makeClientPF())).toBe(true);
  });

  it('aceita payload PJ com corporateName/cnpj', () => {
    expect(isClientDto(makeClientPJ())).toBe(true);
  });

  it('aceita payload com todos os opcionais ausentes', () => {
    const lean = {
      id: CLIENT_ID,
      type: 'PF',
      createdAt: '2026-01-10T12:00:00Z',
      updatedAt: '2026-01-10T12:00:00Z',
    };
    expect(isClientDto(lean)).toBe(true);
  });

  it('rejeita objetos sem campos obrigatórios', () => {
    expect(isClientDto(null)).toBe(false);
    expect(isClientDto(undefined)).toBe(false);
    expect(isClientDto({})).toBe(false);
    expect(isClientDto({ id: 1, type: 'PF' })).toBe(false);
  });

  it('rejeita campos opcionais com tipo inválido', () => {
    expect(
      isClientDto(makeClientPF({ fullName: 0 as unknown as string })),
    ).toBe(false);
    expect(
      isClientDto(makeClientPJ({ cnpj: 0 as unknown as string })),
    ).toBe(false);
  });
});

describe('isPagedClientsResponse', () => {
  it('aceita envelope válido', () => {
    expect(
      isPagedClientsResponse({
        data: [makeClientPF()],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toBe(true);
  });

  it('rejeita envelope com data com itens inválidos', () => {
    expect(
      isPagedClientsResponse({
        data: [{ broken: true }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toBe(false);
  });
});

describe('clientDisplayName', () => {
  it('retorna fullName para PF', () => {
    expect(clientDisplayName(makeClientPF())).toBe('Alice Cliente');
  });

  it('retorna corporateName para PJ', () => {
    expect(clientDisplayName(makeClientPJ())).toBe('Empresa LTDA');
  });

  it('cai no id quando ambos os labels estão ausentes', () => {
    const orphan = makeClientPF({ fullName: null, corporateName: null });
    expect(clientDisplayName(orphan)).toBe(CLIENT_ID);
  });

  it('cai no id quando os labels são apenas whitespace', () => {
    const orphan = makeClientPF({ fullName: '   ', corporateName: '' });
    expect(clientDisplayName(orphan)).toBe(CLIENT_ID);
  });

  it('prioriza fullName sobre corporateName se ambos estiverem preenchidos', () => {
    const both = makeClientPF({
      fullName: 'PF Name',
      corporateName: 'PJ Name',
    });
    expect(clientDisplayName(both)).toBe('PF Name');
  });
});

describe('listClients — querystring', () => {
  it('emite GET /clients sem querystring quando params são default', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: DEFAULT_CLIENTS_PAGE_SIZE,
      total: 0,
    });

    await listClients({}, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[0][0]).toBe('/clients');
  });

  it('serializa q + type + active + page + pageSize', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 2,
      pageSize: 50,
      total: 100,
    });

    await listClients(
      {
        q: 'alice',
        type: 'PF',
        active: true,
        page: 2,
        pageSize: 50,
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get.mock.calls[0][0]).toBe(
      '/clients?q=alice&type=PF&active=true&page=2&pageSize=50',
    );
  });

  it('omite type quando não é PF/PJ', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({
      data: [],
      page: 1,
      pageSize: DEFAULT_CLIENTS_PAGE_SIZE,
      total: 0,
    });

    // @ts-expect-error — propositalmente passa tipo inválido para
    // garantir que o builder ignora valores fora do enum.
    await listClients({ type: 'XX' }, undefined, client as unknown as ApiClient);
    expect(client.get.mock.calls[0][0]).toBe('/clients');
  });

  it('lança ApiError(parse) quando o backend devolve payload inválido', async () => {
    const client = createStub();
    client.get.mockResolvedValueOnce({ malformed: true });

    await expect(
      listClients({}, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('getClientsByIds', () => {
  it('retorna Map vazio quando ids está vazio (sem chamadas ao client)', async () => {
    const client = createStub();
    const result = await getClientsByIds(
      [],
      undefined,
      client as unknown as ApiClient,
    );
    expect(result.size).toBe(0);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('busca cada id e popula o Map preservando o id-chave', async () => {
    const client = createStub();
    const pf = makeClientPF();
    const pj = makeClientPJ();
    client.get.mockResolvedValueOnce(pf).mockResolvedValueOnce(pj);

    const result = await getClientsByIds(
      [pf.id, pj.id],
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.size).toBe(2);
    expect(result.get(pf.id)).toEqual(pf);
    expect(result.get(pj.id)).toEqual(pj);
    expect(client.get.mock.calls[0][0]).toBe(`/clients/${pf.id}`);
    expect(client.get.mock.calls[1][0]).toBe(`/clients/${pj.id}`);
  });

  it('skipa ids duplicados sem refazer chamada', async () => {
    const client = createStub();
    const pf = makeClientPF();
    client.get.mockResolvedValueOnce(pf);

    await getClientsByIds(
      [pf.id, pf.id, pf.id],
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('é best-effort: lookup falho silenciosamente skipa o id', async () => {
    const client = createStub();
    const pf = makeClientPF();
    client.get
      .mockRejectedValueOnce({ kind: 'http', status: 404, message: 'x' })
      .mockResolvedValueOnce(pf);

    const result = await getClientsByIds(
      ['missing-id', pf.id],
      undefined,
      client as unknown as ApiClient,
    );

    expect(result.size).toBe(1);
    expect(result.get(pf.id)).toEqual(pf);
    expect(result.has('missing-id')).toBe(false);
  });

  it('lança AbortError quando a requisição é cancelada', async () => {
    const client = createStub();
    const abort = new DOMException('aborted', 'AbortError');
    client.get.mockRejectedValueOnce(abort);

    await expect(
      getClientsByIds(
        [CLIENT_ID],
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toBe(abort);
  });

  it('lança ApiError de network com cancelamento explícito', async () => {
    const client = createStub();
    const networkAbort = {
      kind: 'network' as const,
      message: 'Requisição cancelada.',
    };
    client.get.mockRejectedValueOnce(networkAbort);

    await expect(
      getClientsByIds(
        [CLIENT_ID],
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toBe(networkAbort);
  });
});
