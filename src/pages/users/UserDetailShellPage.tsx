import { ArrowLeft } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, Badge, Spinner } from '../../components/ui';
import {
  extractErrorMessage,
  getUserById,
  isApiError,
  isFetchAborted,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  BackLink,
  ErrorRetryBlock,
  InvalidIdNotice,
  Mono,
} from '../../shared/listing';

import { UserDirectPermissionsPanel } from './UserDirectPermissionsPanel';
import { UserRolesPanel } from './UserRolesPanel';

import type { ApiClient, UserDto } from '../../shared/api';

const PERMISSIONS_LIST = 'AUTH_V1_PERMISSIONS_LIST';
const USERS_PERMISSIONS_ASSIGN = 'AUTH_V1_USERS_PERMISSIONS_ASSIGN';
const ROLES_LIST = 'AUTH_V1_ROLES_LIST';
const USERS_ROLES_ASSIGN = 'AUTH_V1_USERS_ROLES_ASSIGN';
const USERS_GET_BY_ID = 'AUTH_V1_USERS_GET_BY_ID';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha outras páginas de usuário.
 */
function isProbablyValidUserId(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const PageStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const SummaryCard = styled.div`
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background: var(--bg-surface-raised);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const SummaryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
`;

const SummaryLabel = styled.span`
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--fg3);
`;

const SummaryValue = styled.span`
  font-size: var(--text-sm);
  color: var(--fg1);
`;

const QuickLinks = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
`;

const QuickLink = styled(Link)`
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--accent);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition:
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);

  &:hover {
    color: var(--fg1);
    background: var(--bg-ghost-hover);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-border);
  }
`;

const DirectSection = styled.section`
  margin-top: var(--space-2);
  padding-top: var(--space-4);
  border-top: var(--border-thin) solid var(--border-subtle);
`;

const SectionHeading = styled.h2`
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0 0 var(--space-2);
`;

const SectionHelp = styled.p`
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--fg3);
  max-width: 56rem;
  line-height: var(--leading-relaxed);
`;

const UserLoadingShell = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
  justify-content: center;
  color: var(--fg3);
  font-size: var(--text-sm);
`;

interface UserDetailShellPageProps {
  client?: ApiClient;
}

/**
 * Detalhe do usuário (`/usuarios/:id`) — Issue #203 acrescenta dados
 * básicos, links rápidos e seção de permissões diretas (mesmo contrato
 * da Issue #70), com RBAC client-side alinhado às rotas aninhadas.
 */
export const UserDetailShellPage: React.FC<UserDetailShellPageProps> = ({ client }) => {
  const { id: rawUserId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(rawUserId);
  const userId = hasValidUserId ? rawUserId.trim() : '';

  const { hasPermission } = useAuth();
  const canManageDirectPermissions =
    hasPermission(PERMISSIONS_LIST) && hasPermission(USERS_PERMISSIONS_ASSIGN);
  const canManageRoles =
    hasPermission(ROLES_LIST) && hasPermission(USERS_ROLES_ASSIGN);
  const canOpenRolesPage = canManageRoles;
  const canOpenEffectivePage =
    hasPermission(PERMISSIONS_LIST) && hasPermission(USERS_GET_BY_ID);

  const [userState, setUserState] = useState<{
    isLoading: boolean;
    errorMessage: string | null;
    user: UserDto | null;
    refetchNonce: number;
  }>({
    isLoading: true,
    errorMessage: null,
    user: null,
    refetchNonce: 0,
  });

  const lastUserFetchRef = useRef<AbortController | null>(null);

  const handleUserRefetch = useCallback(() => {
    setUserState((prev) => ({
      ...prev,
      isLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }, []);

  useEffect(() => {
    if (!hasValidUserId) {
      setUserState((prev) => ({ ...prev, isLoading: false, user: null, errorMessage: null }));
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    lastUserFetchRef.current?.abort();
    lastUserFetchRef.current = controller;

    getUserById(userId, { signal: controller.signal }, client)
      .then((user) => {
        if (cancelled) return;
        setUserState((prev) => ({
          ...prev,
          isLoading: false,
          errorMessage: null,
          user,
          refetchNonce: prev.refetchNonce,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isFetchAborted(error)) return;
        let message = extractErrorMessage(
          error,
          'Falha ao carregar o usuário. Tente novamente.',
        );
        if (isApiError(error) && error.kind === 'http') {
          if (error.status === 404) {
            message =
              error.message ||
              'Usuário não encontrado ou foi removido. Volte para a listagem.';
          } else if (error.status === 403) {
            message =
              error.message ||
              'Você não tem permissão para visualizar este usuário.';
          } else if (error.status === 400) {
            message = error.message || 'Requisição inválida ao consultar o usuário.';
          }
        }
        setUserState((prev) => ({
          ...prev,
          isLoading: false,
          errorMessage: message,
          user: null,
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, hasValidUserId, userId, userState.refetchNonce]);

  if (!hasValidUserId) {
    return (
      <PageStack>
        <BackLink to="/usuarios" data-testid="user-detail-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Usuários
        </BackLink>
        <PageHeader
          eyebrow="06 Usuários · Detalhe"
          title="Detalhe do usuário"
          desc="Visualize dados, roles e permissões diretas do usuário selecionado."
        />
        <InvalidIdNotice data-testid="user-detail-invalid-id">
          <Alert variant="warning">
            ID de usuário ausente ou inválido na URL. Volte para a listagem de usuários e
            selecione um registro válido.
          </Alert>
        </InvalidIdNotice>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <BackLink to="/usuarios" data-testid="user-detail-back">
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para Usuários
      </BackLink>
      <PageHeader
        eyebrow="06 Usuários · Detalhe"
        title={userState.user ? userState.user.name : 'Detalhe do usuário'}
        desc="Dados cadastrais, roles por sistema, permissões diretas e atalhos para permissões efetivas."
      />

      {userState.isLoading && (
        <UserLoadingShell data-testid="user-detail-loading" aria-live="polite">
          <Spinner size="md" tone="accent" />
          <span>Carregando usuário…</span>
        </UserLoadingShell>
      )}

      {!userState.isLoading && userState.errorMessage && (
        <ErrorRetryBlock
          message={userState.errorMessage}
          onRetry={handleUserRefetch}
          retryTestId="user-detail-retry"
        />
      )}

      {!userState.isLoading && !userState.errorMessage && userState.user && (
        <>
          <SummaryCard data-testid="user-detail-summary">
            <SummaryRow>
              <SummaryLabel>E-mail</SummaryLabel>
              <SummaryValue>{userState.user.email}</SummaryValue>
            </SummaryRow>
            <SummaryRow>
              <SummaryLabel>Identidade</SummaryLabel>
              <SummaryValue>
                <Mono>{String(userState.user.identity)}</Mono>
              </SummaryValue>
            </SummaryRow>
            <SummaryRow>
              <SummaryLabel>Status</SummaryLabel>
              {userState.user.active ? (
                <Badge variant="success" dot>
                  Ativo
                </Badge>
              ) : (
                <Badge variant="warning" dot>
                  Inativo
                </Badge>
              )}
            </SummaryRow>
            <SummaryRow>
              <SummaryLabel>Id</SummaryLabel>
              <SummaryValue>
                <Mono>{userState.user.id}</Mono>
              </SummaryValue>
            </SummaryRow>
            <QuickLinks aria-label="Atalhos do usuário">
              {canOpenRolesPage && (
                <QuickLink to={`/usuarios/${userId}/roles`} data-testid="user-detail-link-roles">
                  Gerenciar roles
                </QuickLink>
              )}
              {canOpenEffectivePage && (
                <QuickLink
                  to={`/usuarios/${userId}/permissoes-efetivas`}
                  data-testid="user-detail-link-effective"
                >
                  Permissões efetivas
                </QuickLink>
              )}
              {canManageDirectPermissions && (
                <QuickLink
                  to={`/usuarios/${userId}/permissoes`}
                  data-testid="user-detail-link-permissions-full"
                >
                  Abrir permissões em tela cheia
                </QuickLink>
              )}
            </QuickLinks>
          </SummaryCard>

          {canManageRoles ? (
            <DirectSection aria-labelledby="user-detail-roles-heading">
              <SectionHeading id="user-detail-roles-heading">
                Roles por sistema
              </SectionHeading>
              <SectionHelp>
                Vínculos entre este usuário e roles do catálogo, agrupados por sistema.
                Marque ou desmarque as roles desejadas e use &quot;Salvar alterações&quot; —
                a role permanece no catálogo ao remover o vínculo. Roles já vinculadas
                aparecem com o selo &quot;Vinculada&quot;.
              </SectionHelp>
              <UserRolesPanel userId={userId} mode="embedded" client={client} />
            </DirectSection>
          ) : (
            <div data-testid="user-detail-roles-locked">
              <Alert variant="info">
                Para atribuir ou remover roles aqui, é necessário permissão de listagem do
                catálogo de roles e de atualização de usuários (mesmo conjunto exigido pela
                rota &quot;Roles do usuário&quot; em tela cheia).
              </Alert>
            </div>
          )}

          {canManageDirectPermissions ? (
            <DirectSection aria-labelledby="user-detail-direct-permissions-heading">
              <SectionHeading id="user-detail-direct-permissions-heading">
                Permissões diretas
              </SectionHeading>
              <SectionHelp>
                Vínculos adicionais entre este usuário e permissões do catálogo, sem passar
                por roles. Remover uma permissão direta não altera herança via roles — use
                &quot;Gerenciar roles&quot; para isso. Alterações só são persistidas após
                &quot;Salvar alterações&quot;; em seguida a lista é recarregada do servidor.
              </SectionHelp>
              <UserDirectPermissionsPanel
                userId={userId}
                mode="embedded"
                client={client}
              />
            </DirectSection>
          ) : (
            <div data-testid="user-detail-direct-permissions-locked">
              <Alert variant="info">
                Para atribuir ou remover permissões diretas aqui, é necessário permissão de
                listagem do catálogo de permissões e de atualização de usuários (mesmo
                conjunto exigido pela rota &quot;Permissões do usuário&quot; em tela cheia).
                {canOpenEffectivePage && (
                  <>
                    {' '}
                    Você pode{' '}
                    <Link to={`/usuarios/${userId}/permissoes-efetivas`}>
                      consultar as permissões efetivas
                    </Link>{' '}
                    em modo leitura.
                  </>
                )}
              </Alert>
            </div>
          )}
        </>
      )}
    </PageStack>
  );
};
