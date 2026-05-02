import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ClientDto, PagedResponse } from '@/shared/api';

import {
  clientDisplayName,
  createClient,
  DEFAULT_CLIENTS_PAGE_SIZE,
  getClientsByIds,
  isClientDto,
  isPagedClientsResponse,
  listClients,
} from '@/shared/api';

/**
 * Suíte do módulo `src/shared/api/clients.ts` (Issue #73, EPIC #49).
 *
 * Cobre dois consumidores convergentes: a listagem própria de
 * clientes (Issue #73) que valida `listClients`/querystring/type
 * guards completos, e o lookup batch (`getClientsByIds`) consumido
 * pela `UsersListShellPage` (Issue #77 mergeada antes deste PR) para
 * denormalizar nome do cliente vinculado a cada usuário.
 *
 * Estratégia: stubar o `ApiClient` injetado e validar paths, type
 * guards e propagação de `ApiError`. Não bate em `fetch` real —
 * cobertura de transporte HTTP é responsabilidade dos testes em
 * `client.test.ts`.
 */

const CLIENT_PF_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_PJ_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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

function makeClientStub(): ClientStub {
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

function makeRawClientPf(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: CLIENT_PF_ID,
    type: 'PF',
    cpf: '12345678901',
    fullName: 'Ana Cliente',
    cnpj: null,
    corporateName: null,
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    userIds: [],
    extraEmails: [],
    mobilePhones: [],
    landlinePhones: [],
    ...overrides,
  };
}

function makeRawClientPj(overrides: Partial<ClientDto> = {}): ClientDto {
  return {
    id: CLIENT_PJ_ID,
    type: 'PJ',
    cpf: null,
    fullName: null,
    cnpj: '12345678000190',
    corporateName: 'Acme Indústria S/A',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-01-10T12:00:00Z',
    deletedAt: null,
    userIds: [],
    extraEmails: [],
    mobilePhones: [],
    landlinePhones: [],
    ...overrides,
  };
}

function makePaged(
  data: ReadonlyArray<ClientDto>,
  overrides: Partial<PagedResponse<ClientDto>> = {},
): PagedResponse<ClientDto> {
  return {
    data,
    page: 1,
    pageSize: DEFAULT_CLIENTS_PAGE_SIZE,
    total: data.length,
    ...overrides,
  };
}

describe('isClientDto', () => {
  it('aceita PF com cpf/fullName e arrays vazios', () => {
    expect(isClientDto(makeRawClientPf())).toBe(true);
  });

  it('aceita PJ com cnpj/corporateName e arrays vazios', () => {
    expect(isClientDto(makeRawClientPj())).toBe(true);
  });

  it('aceita extraEmails/mobilePhones/landlinePhones populados', () => {
    expect(
      isClientDto(
        makeRawClientPf({
          extraEmails: [
            { id: 'e1', email: 'extra@example.com', createdAt: '2026-01-10T12:00:00Z' },
          ],
          mobilePhones: [
            { id: 'p1', number: '+5511999999999', createdAt: '2026-01-10T12:00:00Z' },
          ],
          landlinePhones: [
            { id: 'p2', number: '+551133334444', createdAt: '2026-01-10T12:00:00Z' },
          ],
          userIds: ['u1', 'u2'],
        }),
      ),
    ).toBe(true);
  });

  it('aceita payload minimalista sem coleções (lookup #77)', () => {
    // Issue #77 (`getClientsByIds`) consome `GET /clients/{id}` e
    // pode receber um payload reduzido em testes — o type guard
    // tolera ausência das 4 coleções sem perder a validação dos
    // campos obrigatórios (`id`/`type`/`createdAt`/`updatedAt`).
    const lean = {
      id: CLIENT_PF_ID,
      type: 'PF' as const,
      cpf: null,
      fullName: 'Ana Cliente',
      cnpj: null,
      corporateName: null,
      createdAt: '2026-01-10T12:00:00Z',
      updatedAt: '2026-01-10T12:00:00Z',
      deletedAt: null,
    };
    expect(isClientDto(lean)).toBe(true);
  });

  it('rejeita type fora de PF/PJ', () => {
    expect(isClientDto({ ...makeRawClientPf(), type: 'XX' })).toBe(false);
  });

  it('rejeita registro sem id', () => {
    const { id: _id, ...rest } = makeRawClientPf();
    expect(isClientDto(rest)).toBe(false);
  });

  it('rejeita coleções com tipo inválido (quando presentes)', () => {
    expect(
      isClientDto({ ...makeRawClientPf(), userIds: 'not-an-array' as unknown }),
    ).toBe(false);
    expect(
      isClientDto({ ...makeRawClientPf(), extraEmails: [{ wrong: 'shape' }] as unknown }),
    ).toBe(false);
  });

  it('aceita deletedAt como string ISO', () => {
    expect(
      isClientDto(makeRawClientPf({ deletedAt: '2026-02-01T00:00:00Z' })),
    ).toBe(true);
  });

  it('rejeita primitivos e null', () => {
    expect(isClientDto(null)).toBe(false);
    expect(isClientDto('string')).toBe(false);
    expect(isClientDto(42)).toBe(false);
  });
});

describe('isPagedClientsResponse', () => {
  it('aceita envelope completo com data válido', () => {
    expect(isPagedClientsResponse(makePaged([makeRawClientPf()]))).toBe(true);
  });

  it('rejeita data não-array', () => {
    expect(
      isPagedClientsResponse({
        data: 'not-array' as unknown,
        page: 1,
        pageSize: 20,
        total: 0,
      }),
    ).toBe(false);
  });

  it('rejeita campos numéricos ausentes', () => {
    expect(
      isPagedClientsResponse({ data: [], page: 1, pageSize: 20 }),
    ).toBe(false);
  });

  it('rejeita item interno inválido (propaga falha de isClientDto)', () => {
    expect(
      isPagedClientsResponse(
        makePaged([{ ...makeRawClientPf(), type: 'XX' } as unknown as ClientDto]),
      ),
    ).toBe(false);
  });
});

describe('clientDisplayName', () => {
  it('retorna fullName para PF', () => {
    expect(clientDisplayName(makeRawClientPf())).toBe('Ana Cliente');
  });

  it('retorna corporateName para PJ', () => {
    expect(clientDisplayName(makeRawClientPj())).toBe('Acme Indústria S/A');
  });

  it('cai no id quando ambos os labels estão ausentes', () => {
    const orphan = makeRawClientPf({ fullName: null, corporateName: null });
    expect(clientDisplayName(orphan)).toBe(CLIENT_PF_ID);
  });

  it('cai no id quando os labels são apenas whitespace', () => {
    const orphan = makeRawClientPf({ fullName: '   ', corporateName: '' });
    expect(clientDisplayName(orphan)).toBe(CLIENT_PF_ID);
  });

  it('prioriza fullName sobre corporateName se ambos estiverem preenchidos', () => {
    const both = makeRawClientPf({
      fullName: 'PF Name',
      corporateName: 'PJ Name',
    });
    expect(clientDisplayName(both)).toBe('PF Name');
  });
});

describe('listClients', () => {
  it('chama GET /clients sem querystring quando params são defaults', async () => {
    const client = makeClientStub();
    const paged = makePaged([makeRawClientPf()]);
    client.get.mockResolvedValueOnce(paged);

    const result = await listClients({}, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/clients', undefined);
    expect(result).toBe(paged);
  });

  it('inclui q quando informado e trim aplicado', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients({ q: '  Ana  ' }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?q=Ana', undefined);
  });

  it('inclui type=PF quando informado', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients({ type: 'PF' }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?type=PF', undefined);
  });

  it('inclui type=PJ quando informado', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients({ type: 'PJ' }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?type=PJ', undefined);
  });

  it('inclui active quando boolean (true)', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients({ active: true }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?active=true', undefined);
  });

  it('inclui active=false quando explicitamente false', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients({ active: false }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?active=false', undefined);
  });

  it('inclui page quando ≠ 1 (default)', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([], { page: 2 }));

    await listClients({ page: 2 }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?page=2', undefined);
  });

  it('inclui pageSize quando ≠ 20 (default)', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([], { pageSize: 50 }));

    await listClients({ pageSize: 50 }, undefined, client as unknown as ApiClient);

    expect(client.get).toHaveBeenCalledWith('/clients?pageSize=50', undefined);
  });

  it('inclui includeDeleted quando true', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients(
      { includeDeleted: true },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledWith('/clients?includeDeleted=true', undefined);
  });

  it('combina vários params na ordem esperada', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients(
      { q: 'ana', type: 'PF', page: 2, pageSize: 50, includeDeleted: true },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledWith(
      '/clients?q=ana&type=PF&page=2&pageSize=50&includeDeleted=true',
      undefined,
    );
  });

  it('omite q vazio (após trim) e omite type fora de PF/PJ', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));

    await listClients(
      { q: '   ', type: undefined },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledWith('/clients', undefined);
  });

  it('lança ApiError(parse) quando o backend devolve envelope inválido', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce({ wrong: 'shape' });

    await expect(
      listClients({}, undefined, client as unknown as ApiClient),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga signal via options', async () => {
    const client = makeClientStub();
    client.get.mockResolvedValueOnce(makePaged([]));
    const controller = new AbortController();

    await listClients(
      {},
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledWith('/clients', { signal: controller.signal });
  });
});

describe('getClientsByIds', () => {
  it('retorna Map vazio quando ids está vazio (sem chamadas ao client)', async () => {
    const client = makeClientStub();
    const result = await getClientsByIds(
      [],
      undefined,
      client as unknown as ApiClient,
    );
    expect(result.size).toBe(0);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('busca cada id e popula o Map preservando o id-chave', async () => {
    const client = makeClientStub();
    const pf = makeRawClientPf();
    const pj = makeRawClientPj();
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
    const client = makeClientStub();
    const pf = makeRawClientPf();
    client.get.mockResolvedValueOnce(pf);

    await getClientsByIds(
      [pf.id, pf.id, pf.id],
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('é best-effort: lookup falho silenciosamente skipa o id', async () => {
    const client = makeClientStub();
    const pf = makeRawClientPf();
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
    const client = makeClientStub();
    const abort = new DOMException('aborted', 'AbortError');
    client.get.mockRejectedValueOnce(abort);

    await expect(
      getClientsByIds(
        [CLIENT_PF_ID],
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toBe(abort);
  });

  it('lança ApiError de network com cancelamento explícito', async () => {
    const client = makeClientStub();
    const networkAbort = {
      kind: 'network' as const,
      message: 'Requisição cancelada.',
    };
    client.get.mockRejectedValueOnce(networkAbort);

    await expect(
      getClientsByIds(
        [CLIENT_PF_ID],
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toBe(networkAbort);
  });
});

/* ─── createClient (Issue #74) ──────────────────────────── */

describe('createClient', () => {
  it('envia POST /clients para PF com cpf+fullName trimados', async () => {
    const client = makeClientStub();
    const created = makeRawClientPf();
    client.post.mockResolvedValueOnce(created);

    const result = await createClient(
      {
        type: 'PF',
        cpf: '  12345678901  ',
        fullName: '  Ana Cliente  ',
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(
      '/clients',
      {
        type: 'PF',
        cpf: '12345678901',
        fullName: 'Ana Cliente',
      },
      undefined,
    );
    expect(result).toBe(created);
  });

  it('envia POST /clients para PJ com cnpj+corporateName trimados', async () => {
    const client = makeClientStub();
    const created = makeRawClientPj();
    client.post.mockResolvedValueOnce(created);

    await createClient(
      {
        type: 'PJ',
        cnpj: '  12345678000190  ',
        corporateName: '  Acme Indústria S/A  ',
      },
      undefined,
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledWith(
      '/clients',
      {
        type: 'PJ',
        cnpj: '12345678000190',
        corporateName: 'Acme Indústria S/A',
      },
      undefined,
    );
  });

  it('omite campos do tipo oposto (PF não envia cnpj/corporateName)', async () => {
    const client = makeClientStub();
    client.post.mockResolvedValueOnce(makeRawClientPf());

    await createClient(
      {
        type: 'PF',
        cpf: '12345678901',
        fullName: 'Ana',
        // Caller mal-comportado tenta enviar campos PJ junto. O
        // helper interno `buildClientMutationBody` os filtra para
        // evitar 400 do backend ("CNPJ não deve ser informado para
        // cliente PF.").
        cnpj: '12345678000190',
        corporateName: 'Algo',
      },
      undefined,
      client as unknown as ApiClient,
    );

    const [, body] = client.post.mock.calls[0];
    expect(body).toEqual({
      type: 'PF',
      cpf: '12345678901',
      fullName: 'Ana',
    });
    expect(body).not.toHaveProperty('cnpj');
    expect(body).not.toHaveProperty('corporateName');
  });

  it('omite campos do tipo oposto (PJ não envia cpf/fullName)', async () => {
    const client = makeClientStub();
    client.post.mockResolvedValueOnce(makeRawClientPj());

    await createClient(
      {
        type: 'PJ',
        cnpj: '12345678000190',
        corporateName: 'Acme',
        cpf: '12345678901',
        fullName: 'Ana',
      },
      undefined,
      client as unknown as ApiClient,
    );

    const [, body] = client.post.mock.calls[0];
    expect(body).toEqual({
      type: 'PJ',
      cnpj: '12345678000190',
      corporateName: 'Acme',
    });
    expect(body).not.toHaveProperty('cpf');
    expect(body).not.toHaveProperty('fullName');
  });

  it('omite campos whitespace-only (PF com fullName apenas espaços)', async () => {
    const client = makeClientStub();
    client.post.mockResolvedValueOnce(makeRawClientPf());

    await createClient(
      {
        type: 'PF',
        cpf: '12345678901',
        fullName: '   ',
      },
      undefined,
      client as unknown as ApiClient,
    );

    const [, body] = client.post.mock.calls[0];
    expect(body).toEqual({
      type: 'PF',
      cpf: '12345678901',
    });
    expect(body).not.toHaveProperty('fullName');
  });

  it('lança ApiError(parse) quando o backend devolve payload inválido', async () => {
    const client = makeClientStub();
    client.post.mockResolvedValueOnce({ wrong: 'shape' });

    await expect(
      createClient(
        {
          type: 'PF',
          cpf: '12345678901',
          fullName: 'Ana',
        },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('propaga signal via options', async () => {
    const client = makeClientStub();
    client.post.mockResolvedValueOnce(makeRawClientPf());
    const controller = new AbortController();

    await createClient(
      { type: 'PF', cpf: '12345678901', fullName: 'Ana' },
      { signal: controller.signal },
      client as unknown as ApiClient,
    );

    expect(client.post).toHaveBeenCalledWith(
      '/clients',
      expect.any(Object),
      { signal: controller.signal },
    );
  });

  it('propaga ApiError 409 do backend (CPF/CNPJ duplicado)', async () => {
    const client = makeClientStub();
    const conflict = {
      kind: 'http' as const,
      status: 409,
      message: 'Já existe cliente com este CPF.',
    };
    client.post.mockRejectedValueOnce(conflict);

    await expect(
      createClient(
        { type: 'PF', cpf: '12345678901', fullName: 'Ana' },
        undefined,
        client as unknown as ApiClient,
      ),
    ).rejects.toBe(conflict);
  });
});
