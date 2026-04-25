import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorPage } from '../components/ErrorPage';

/**
 * 404 — Página não encontrada.
 *
 * Ação principal volta o usuário para a raiz `/`, que hoje redireciona
 * para `/systems` (definido em `AppRoutes`). Quando houver dashboard
 * dedicado, basta atualizar o redirect raiz.
 */
export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorPage
      code="404"
      title="Página não encontrada"
      description="O endereço acessado não existe ou foi movido. Verifique o link ou volte para a tela inicial do painel."
      actionLabel="Voltar ao início"
      onAction={() => navigate('/')}
    />
  );
};
