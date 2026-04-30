import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock controlável de `useAuth` — cada teste seta `permissionsMock`
 * antes de renderizar a página para simular usuário com/sem permissão
 * `AUTH_V1_SYSTEMS_CREATE`.
 *
 * Mockar via factory dinâmica (em vez de `vi.mock` com retorno fixo)
 * permite alternar permissões dentro da mesma suíte sem reordenar
 * imports — `permissionsMock` vive no escopo do módulo de teste e o
 * mock lê o valor no momento da chamada de `hasPermission`.
 */
let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => ({
  useAuth: () => ({
    user: null,
    permissions: permissionsMock,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (code: string) => permissionsMock.includes(code),
    verifyRoute: vi.fn().mockResolvedValue(true),
  }),
}));

import {
  createSystemsClientStub,
  makePagedResponse,
  makeSystem,
} from './__helpers__/systemsTestHelpers';

import type { ApiClientStub } from './__helpers__/systemsTestHelpers';
import type { ApiError } from '@/shared/api';

import { ToastProvider } from '@/components/ui';
import { SystemsPage } from '@/pages/SystemsPage';

const SYSTEMS_CREATE_PERMISSION = 'AUTH_V1_SYSTEMS_CREATE';

/**
 * Helper de render que envolve a `SystemsPage` num `ToastProvider`
 * porque o `NewSystemModal` consome `useToast()` internamente para
 * disparar feedback de sucesso/erro.
 */
function renderPage(client: ApiClientStub): void {
  render(
    <ToastProvider>
      <SystemsPage client={client} />
    </ToastProvider>,
  );
}

/**
 * Aguarda a primeira renderização da listagem (a `SystemsPage` faz
 * `listSystems` no mount). Centraliza o "esperar listagem" para que
 * cada teste comece em estado estável sem precisar replicar
 * `waitFor` para `client.get`.
 */
async function waitForInitialList(client: ApiClientStub): Promise<void> {
  await waitFor(() => expect(client.get).toHaveBeenCalled());
  await waitFor(() => {
    expect(screen.queryByTestId('systems-loading')).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = '';
});

describe('SystemsPage — criação (Issue #58)', () => {
  describe('gating do botão "Novo sistema"', () => {
    it('não exibe o botão quando o usuário não possui AUTH_V1_SYSTEMS_CREATE', async () => {
      permissionsMock = [];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      expect(screen.queryByTestId('systems-create-open')).not.toBeInTheDocument();
    });

    it('exibe o botão quando o usuário possui AUTH_V1_SYSTEMS_CREATE', async () => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      expect(screen.getByTestId('systems-create-open')).toBeInTheDocument();
      expect(screen.getByTestId('systems-create-open')).toHaveTextContent(/Novo sistema/i);
    });
  });

  describe('abertura e fechamento do modal', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('clicar em "Novo sistema" abre o diálogo com os campos do form', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-name')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-code')).toBeInTheDocument();
      expect(screen.getByTestId('new-system-description')).toBeInTheDocument();
    });

    it('fechar via Esc não dispara nenhuma chamada à API de criação', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('fechar via botão Cancelar não chama POST', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.click(screen.getByTestId('new-system-cancel'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });

    it('fechar via clique no backdrop não chama POST', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.mouseDown(screen.getByTestId('modal-backdrop'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('validação client-side', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('submeter com campos vazios mostra erros inline e não chama POST', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.submit(screen.getByTestId('new-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });

    it('campos com apenas espaços também são tratados como vazios', async () => {
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: '   ' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: '  ' },
      });
      fireEvent.submit(screen.getByTestId('new-system-form'));

      expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Código é obrigatório.')).toBeInTheDocument();
      expect(client.post).not.toHaveBeenCalled();
    });
  });

  describe('submissão bem-sucedida', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('envia POST /systems com body trimado, fecha modal, exibe toast e refaz listSystems', async () => {
      const created = makeSystem({
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Novo Sistema',
        code: 'NEW',
        description: 'Sistema cadastrado pelo teste.',
      });
      const client = createSystemsClientStub();
      client.get
        .mockResolvedValueOnce(makePagedResponse([makeSystem()]))
        .mockResolvedValueOnce(makePagedResponse([makeSystem(), created]));
      client.post.mockResolvedValueOnce(created);

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));

      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: '  Novo Sistema  ' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: '  NEW  ' },
      });
      fireEvent.change(screen.getByTestId('new-system-description'), {
        target: { value: '  Sistema cadastrado pelo teste.  ' },
      });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('new-system-form'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(client.post).toHaveBeenCalledTimes(1);
      });

      expect(client.post).toHaveBeenCalledWith(
        '/systems',
        {
          name: 'Novo Sistema',
          code: 'NEW',
          description: 'Sistema cadastrado pelo teste.',
        },
        undefined,
      );

      // Modal fecha após sucesso.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Toast verde "Sistema criado." (status do ToastProvider).
      expect(await screen.findByText('Sistema criado.')).toBeInTheDocument();

      // Refetch da lista — `client.get` chamado uma 2ª vez.
      await waitFor(() => {
        expect(client.get).toHaveBeenCalledTimes(2);
      });
    });

    it('envia body sem o campo description quando o usuário deixa vazio', async () => {
      const created = makeSystem({
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Sem Desc',
        code: 'NODESC',
      });
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));
      client.post.mockResolvedValueOnce(created);

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: 'Sem Desc' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: 'NODESC' },
      });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('new-system-form'));
        await Promise.resolve();
      });

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      const [, body] = client.post.mock.calls[0];
      expect(body).toEqual({ name: 'Sem Desc', code: 'NODESC' });
      expect(body).not.toHaveProperty('description');
    });
  });

  describe('tratamento de erros do backend', () => {
    beforeEach(() => {
      permissionsMock = [SYSTEMS_CREATE_PERMISSION];
    });

    it('409 (code duplicado) exibe mensagem inline no campo code', async () => {
      const conflictError: ApiError = {
        kind: 'http',
        status: 409,
        message: 'Já existe um sistema com este Code.',
      };
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));
      client.post.mockRejectedValueOnce(conflictError);

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: 'Algum Sistema' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: 'AUTH' },
      });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('new-system-form'));
        await Promise.resolve();
      });

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      // Mensagem inline sob o campo Code.
      expect(await screen.findByText('Já existe um sistema com este Code.')).toBeInTheDocument();

      // Modal NÃO fecha — usuário corrige o code.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('400 com errors mapeia mensagens para os campos correspondentes', async () => {
      const validationError: ApiError = {
        kind: 'http',
        status: 400,
        message: 'Erro de validação.',
        details: {
          errors: {
            Name: ['Name é obrigatório e não pode ser apenas espaços.'],
            Code: ['Code deve ter no máximo 50 caracteres.'],
          },
        },
      };
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));
      client.post.mockRejectedValueOnce(validationError);

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: 'Nome Algum' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: 'CODE' },
      });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('new-system-form'));
        await Promise.resolve();
      });

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      expect(
        await screen.findByText('Name é obrigatório e não pode ser apenas espaços.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Code deve ter no máximo 50 caracteres.')).toBeInTheDocument();
    });

    it('erro genérico de rede dispara toast vermelho e mantém o modal aberto', async () => {
      const networkError: ApiError = {
        kind: 'network',
        message: 'Falha de conexão com o servidor.',
      };
      const client = createSystemsClientStub();
      client.get.mockResolvedValueOnce(makePagedResponse([makeSystem()]));
      client.post.mockRejectedValueOnce(networkError);

      renderPage(client);
      await waitForInitialList(client);

      fireEvent.click(screen.getByTestId('systems-create-open'));
      fireEvent.change(screen.getByTestId('new-system-name'), {
        target: { value: 'Alpha' },
      });
      fireEvent.change(screen.getByTestId('new-system-code'), {
        target: { value: 'ALP' },
      });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('new-system-form'));
        await Promise.resolve();
      });

      await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

      // Toast vermelho (role=alert) com mensagem genérica.
      expect(
        await screen.findByText('Não foi possível criar o sistema. Tente novamente.'),
      ).toBeInTheDocument();

      // Modal segue aberto para o usuário tentar de novo.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
