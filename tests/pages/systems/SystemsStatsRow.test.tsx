import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSystemsClientStub, makePagedResponse } from '../__helpers__/systemsTestHelpers';

import type { ApiError } from '@/shared/api';

import { SystemsStatsRow } from '@/pages/systems/SystemsStatsRow';

/**
 * Testes do painel de stats da `SystemsPage` (Issue #131).
 *
 * O componente faz duas chamadas paralelas a `GET /systems?pageSize=1`
 * (com e sem `includeDeleted`) e calcula `inactive = total - active`.
 * Os 3 cards (`active`, `inactive`, `total`) renderizam em sequência —
 * cobrimos render inicial, sucesso, erro e refetch via `refreshKey`.
 *
 * Reuso de `createSystemsClientStub` + `makePagedResponse` mantém
 * paridade com as suítes da EPIC #45 e evita duplicação Sonar (lições
 * PRs #123/#127/#128).
 */

beforeEach(() => {
  // Sem fake timers — o componente não usa setTimeout/debounce, e
  // habilitar fake-timers apenas confunde `waitFor` do RTL.
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Stub que devolve `total` específico para cada chamada — primeira é
 * sem `includeDeleted` (active), segunda é com (totalIncludingDeleted).
 * Ordem importa: `getSystemsStats` faz `Promise.all([active, includingDeleted])`.
 */
function stubStatsClient(activeTotal: number, totalIncludingDeleted: number) {
  const client = createSystemsClientStub();
  client.get.mockImplementation((path: unknown) => {
    if (typeof path !== 'string') return Promise.reject(new Error('unexpected path'));
    if (path.includes('includeDeleted=true')) {
      return Promise.resolve(makePagedResponse([], { total: totalIncludingDeleted, pageSize: 1 }));
    }
    return Promise.resolve(makePagedResponse([], { total: activeTotal, pageSize: 1 }));
  });
  return client;
}

describe('SystemsStatsRow — Issue #131', () => {
  it('renderiza skeleton ("…") em todos os cards no primeiro render', () => {
    const client = createSystemsClientStub();
    // Não resolve — força o estado de loading.
    client.get.mockImplementation(() => new Promise<never>(() => undefined));

    render(<SystemsStatsRow refreshKey={0} client={client} />);

    const active = screen.getByTestId('systems-stats-active');
    const inactive = screen.getByTestId('systems-stats-inactive');
    const total = screen.getByTestId('systems-stats-total');
    expect(active.textContent).toContain('…');
    expect(inactive.textContent).toContain('…');
    expect(total.textContent).toContain('…');
  });

  it('renderiza números reais após as duas chamadas resolverem', async () => {
    const client = stubStatsClient(7, 10); // 7 ativos, 10 total → 3 inativos

    render(<SystemsStatsRow refreshKey={0} client={client} />);

    await waitFor(() => {
      expect(screen.getByTestId('systems-stats-active').textContent).toContain('7');
    });
    expect(screen.getByTestId('systems-stats-inactive').textContent).toContain('3');
    expect(screen.getByTestId('systems-stats-total').textContent).toContain('10');
  });

  it('mostra "—" em todos os cards quando o backend falha (degrada gracioso)', async () => {
    const apiError: ApiError = { kind: 'network', message: 'Falha de conexão.' };
    const client = createSystemsClientStub();
    client.get.mockRejectedValue(apiError);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<SystemsStatsRow refreshKey={0} client={client} />);

    await waitFor(() => {
      expect(screen.getByTestId('systems-stats-active').textContent).toContain('—');
    });
    expect(screen.getByTestId('systems-stats-inactive').textContent).toContain('—');
    expect(screen.getByTestId('systems-stats-total').textContent).toContain('—');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('refetch quando refreshKey muda', async () => {
    const client = stubStatsClient(2, 2);

    const { rerender } = render(<SystemsStatsRow refreshKey={0} client={client} />);
    await waitFor(() => {
      expect(screen.getByTestId('systems-stats-active').textContent).toContain('2');
    });

    // Backend agora devolve outros números — simula que outro tab criou sistemas.
    client.get.mockReset();
    client.get.mockImplementation((path: unknown) => {
      if (typeof path !== 'string') return Promise.reject(new Error('unexpected path'));
      const total = path.includes('includeDeleted=true') ? 8 : 5;
      return Promise.resolve(makePagedResponse([], { total, pageSize: 1 }));
    });

    rerender(<SystemsStatsRow refreshKey={1} client={client} />);

    await waitFor(() => {
      expect(screen.getByTestId('systems-stats-active').textContent).toContain('5');
    });
    expect(screen.getByTestId('systems-stats-inactive').textContent).toContain('3');
    expect(screen.getByTestId('systems-stats-total').textContent).toContain('8');
  });

  it('clamp de inactive em zero quando backend retorna inconsistência (active > total)', async () => {
    // Cenário defensivo: backend devolveu números inconsistentes (race
    // entre as 2 chamadas, soft-delete entre uma e outra). O componente
    // não pode renderizar inactive negativo.
    const client = stubStatsClient(5, 4);

    render(<SystemsStatsRow refreshKey={0} client={client} />);

    await waitFor(() => {
      expect(screen.getByTestId('systems-stats-active').textContent).toContain('5');
    });
    expect(screen.getByTestId('systems-stats-inactive').textContent).toContain('0');
    expect(screen.getByTestId('systems-stats-total').textContent).toContain('4');
  });

  it('cancelamento de request anterior ao mudar refreshKey rapidamente', async () => {
    const client = createSystemsClientStub();
    const signals: AbortSignal[] = [];
    client.get.mockImplementation(
      (_path: unknown, options?: { signal?: AbortSignal }) => {
        if (options?.signal) signals.push(options.signal);
        return Promise.resolve(makePagedResponse([], { total: 1, pageSize: 1 }));
      },
    );

    const { rerender } = render(<SystemsStatsRow refreshKey={0} client={client} />);
    rerender(<SystemsStatsRow refreshKey={1} client={client} />);
    rerender(<SystemsStatsRow refreshKey={2} client={client} />);

    // Primeiro lote (refreshKey=0) deve estar abortado pelo cleanup.
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0].aborted).toBe(true);
  });
});
