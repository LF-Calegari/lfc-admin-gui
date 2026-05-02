import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { getSystemsStats, isApiError } from '../../shared/api';

import type { ApiClient, SystemsStats } from '../../shared/api';

/**
 * Painel de stats no topo da `SystemsPage` (Issue #131). Restaura a
 * sensação visual do placeholder antigo (`b95fbce:src/pages/SystemsPage.tsx`)
 * mas com dados reais do backend — duas chamadas paralelas a
 * `GET /systems?pageSize=1` (com e sem `includeDeleted`) extraem `total`
 * suficiente para 3 cards: ativos, inativos, total geral.
 *
 * Decisões:
 *
 * 1. **Componente próprio em vez de inline na `SystemsPage`** — mantém o
 *    JSX da listagem focado em busca/paginação/CRUD; o painel é
 *    self-contained com seu próprio loading/erro.
 * 2. **Refetch via `refreshKey` numérica** — o pai usa o mesmo
 *    `retryNonce` que dispara refetch da tabela; alinhar os ciclos
 *    evita estado dessincronizado (ex.: criar um sistema → tabela
 *    atualiza, cards continuam mostrando o número antigo).
 * 3. **Erro mostra `—`** — nunca bloqueia a tabela. Se o backend cair,
 *    o painel some graciosamente; usuário continua com CRUD funcional.
 * 4. **Cliente HTTP injetável** — espelha o padrão de
 *    `NewSystemModal`/`EditSystemModal` usados na EPIC #45; permite
 *    isolar testes com stub.
 */

const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-5);

  @media (min-width: 48em) {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }
`;

const StatCard = styled.div`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);

  @media (min-width: 48em) {
    padding: var(--space-4) var(--space-5);
  }
`;

const StatNumber = styled.div`
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  letter-spacing: -0.03em;
  color: var(--fg1);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
`;

const StatLabel = styled.div`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg3);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  margin-top: var(--space-1);
`;

interface SystemsStatsRowProps {
  /**
   * Bumper monotônico — quando muda, o painel refaz a busca. O pai
   * (SystemsPage) compartilha o mesmo `retryNonce` que dispara refetch
   * da tabela, assim cards e tabela ficam sempre em sincronia.
   */
  refreshKey: number;
  /** Cliente HTTP injetável — em produção, omitido. */
  client?: ApiClient;
}

interface StatsState {
  data: SystemsStats | null;
  isLoading: boolean;
  hasError: boolean;
}

const INITIAL_STATE: StatsState = {
  data: null,
  isLoading: true,
  hasError: false,
};

/**
 * Renderiza o número quando há dado, `—` (em-dash) em erro, e um
 * placeholder discreto durante o loading. `font-variant-numeric:
 * tabular-nums` no `StatNumber` garante que o em-dash não cause shift
 * de largura quando o número aparece.
 */
function formatStatValue(value: number | null, isLoading: boolean, hasError: boolean): string {
  if (hasError) return '—';
  if (isLoading || value === null) return '…';
  return String(value);
}

export const SystemsStatsRow: React.FC<SystemsStatsRowProps> = ({ refreshKey, client }) => {
  const [state, setState] = useState<StatsState>(INITIAL_STATE);

  // `AbortController` cancela request anterior em refetches rápidos —
  // mesmo padrão usado na lista (RequireAuth, listSystems) na EPIC #45.
  const lastControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    lastControllerRef.current?.abort();
    lastControllerRef.current = controller;

    setState(prev => ({ ...prev, isLoading: true }));

    getSystemsStats({ signal: controller.signal }, client)
      .then(stats => {
        if (cancelled) return;
        setState({ data: stats, isLoading: false, hasError: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Cancelamento explícito não é erro de UI.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (
          isApiError(error) &&
          error.kind === 'network' &&
          error.message === 'Requisição cancelada.'
        ) return;
        // eslint-disable-next-line no-console
        console.warn('[systems-stats] falha ao carregar stats; mostrando "—".', error);
        setState({ data: null, isLoading: false, hasError: true });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, refreshKey]);

  const active = formatStatValue(state.data?.active ?? null, state.isLoading, state.hasError);
  const inactive = formatStatValue(state.data?.inactive ?? null, state.isLoading, state.hasError);
  const total = formatStatValue(state.data?.total ?? null, state.isLoading, state.hasError);

  return (
    <Row aria-label="Estatísticas de sistemas" data-testid="systems-stats-row">
      <StatCard data-testid="systems-stats-active">
        <StatNumber>{active}</StatNumber>
        <StatLabel>Sistemas ativos</StatLabel>
      </StatCard>
      <StatCard data-testid="systems-stats-inactive">
        <StatNumber>{inactive}</StatNumber>
        <StatLabel>Sistemas inativos</StatLabel>
      </StatCard>
      <StatCard data-testid="systems-stats-total">
        <StatNumber>{total}</StatNumber>
        <StatLabel>Total cadastrado</StatLabel>
      </StatCard>
    </Row>
  );
};
