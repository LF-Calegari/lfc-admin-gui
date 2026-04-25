import React from 'react';

import { ErrorPage } from '../components/ErrorPage';

/**
 * 500 — Erro interno.
 *
 * Usa `window.location.reload()` (reload completo) em vez de `navigate(0)`:
 * em caso de erro do servidor ou estado corrompido do SPA, o reload total
 * reinicia bundle, contexto e cache de rede — é a recuperação mais robusta
 * possível sem orquestração de estado dedicada.
 */
export const InternalErrorPage: React.FC = () => (
  <ErrorPage
    code="500"
    title="Erro interno"
    description="Algo inesperado aconteceu do lado do servidor. Tente novamente em instantes — se o problema persistir, contate o suporte."
    actionLabel="Tentar novamente"
    onAction={() => window.location.reload()}
  />
);
