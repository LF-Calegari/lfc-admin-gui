import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorPage } from '../components/ErrorPage';

/**
 * 403 — Sem permissão.
 *
 * "Voltar" usa o histórico do navegador (`navigate(-1)`) para que o usuário
 * retorne à página anterior sem perder contexto. Caso o histórico esteja
 * vazio (acesso direto via URL), o navegador permanece na rota atual — o
 * comportamento é tolerante e seguro.
 */
export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorPage
      code="403"
      title="Sem permissão"
      description="Sua conta não tem permissão para acessar este recurso. Solicite acesso ao administrador do sistema ou volte para a tela anterior."
      actionLabel="Voltar"
      onAction={() => navigate(-1)}
    />
  );
};
