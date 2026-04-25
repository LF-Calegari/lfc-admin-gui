import React from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorPage } from '../components/ErrorPage';

/**
 * 401 — Não autenticado.
 *
 * Ainda não existe rota `/login` no SPA — a autenticação será feita pelo
 * `lfc-authenticator` em uma issue futura. Enquanto isso, a ação reaproveita
 * o redirect padrão da raiz (`/` → `/systems`) para devolver o usuário a um
 * ponto seguro do painel. O `// TODO` documenta a integração futura.
 */
export const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();

  // TODO: integrar com lfc-authenticator quando rota de login estiver disponível.
  return (
    <ErrorPage
      code="401"
      title="Não autenticado"
      description="Sua sessão expirou ou você ainda não está autenticado. Faça login novamente para continuar usando o painel."
      actionLabel="Fazer login"
      onAction={() => navigate('/')}
    />
  );
};
