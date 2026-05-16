import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '../../components/layout/PageHeader';
import { Alert } from '../../components/ui';
import { BackLink, InvalidIdNotice } from '../../shared/listing';

import { UserRolesPanel } from './UserRolesPanel';

import type { ApiClient } from '../../shared/api';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha `UserPermissionsShellPage`/`RolesPage`.
 */
function isProbablyValidUserId(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

interface UserRolesShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido
   * (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

/**
 * Atribuição de roles a um usuário (Issue #71 / EPIC #48, Issue #208).
 * Orquestração de rota + id inválido; o painel compartilhado está em
 * `UserRolesPanel`.
 *
 * **Visível com** `Roles.Read` + `Users.Update` (gating duplo na rota).
 */
export const UserRolesShellPage: React.FC<UserRolesShellPageProps> = ({ client }) => {
  const { id: rawUserId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(rawUserId);
  const userId = hasValidUserId ? rawUserId.trim() : '';

  if (!hasValidUserId) {
    return (
      <>
        <BackLink to="/usuarios" data-testid="user-roles-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Usuários
        </BackLink>
        <PageHeader
          eyebrow="06 Usuários · Roles"
          title="Roles do usuário"
          desc="Selecione um usuário para gerenciar roles por sistema."
        />
        <InvalidIdNotice data-testid="user-roles-invalid-id">
          <Alert variant="warning">
            ID de usuário ausente ou inválido na URL. Volte para a listagem de
            usuários e selecione um para gerenciar roles.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return <UserRolesPanel userId={userId} mode="fullPage" client={client} />;
};
