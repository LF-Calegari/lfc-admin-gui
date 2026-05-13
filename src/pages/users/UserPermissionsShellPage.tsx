import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '../../components/layout/PageHeader';
import { Alert } from '../../components/ui';
import { BackLink, InvalidIdNotice } from '../../shared/listing';

import { UserDirectPermissionsPanel } from './UserDirectPermissionsPanel';

import type { ApiClient } from '../../shared/api';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha `RolesPage`/`RoutesPage`. Aceita qualquer
 * string não-vazia com pelo menos um caractere não-whitespace.
 */
function isProbablyValidUserId(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

interface UserPermissionsShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido
   * (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

/**
 * Atribuição direta de permissões a um usuário (Issue #70 / EPIC #48).
 * Orquestração de rota + id inválido; o painel compartilhado está em
 * `UserDirectPermissionsPanel` (reuso Issue #203).
 *
 * **Visível com** `Permissions.Read` + `Users.Update`. O gating na
 * rota é feito por `RequirePermission` aninhado (ver
 * `src/routes/index.tsx`). A página assume que ambas as permissões
 * já estão garantidas — não duplica a checagem aqui.
 */
export const UserPermissionsShellPage: React.FC<UserPermissionsShellPageProps> = ({
  client,
}) => {
  const { id: rawUserId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(rawUserId);
  const userId = hasValidUserId ? rawUserId.trim() : '';

  if (!hasValidUserId) {
    return (
      <>
        <BackLink to="/usuarios" data-testid="user-permissions-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Usuários
        </BackLink>
        <PageHeader
          eyebrow="06 Usuários · Permissões"
          title="Permissões do usuário"
          desc="Selecione um usuário para gerenciar permissões diretas."
        />
        <InvalidIdNotice data-testid="user-permissions-invalid-id">
          <Alert variant="warning">
            ID de usuário ausente ou inválido na URL. Volte para a listagem de
            usuários e selecione um para gerenciar permissões diretas.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return <UserDirectPermissionsPanel userId={userId} mode="fullPage" client={client} />;
};
