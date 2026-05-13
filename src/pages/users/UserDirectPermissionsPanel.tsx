import { ArrowLeft, Info } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { PageHeader } from '../../components/layout/PageHeader';
import {
  Badge,
  Checkbox,
  useToast,
} from '../../components/ui';
import {
  assignPermissionToUser,
  isFetchAborted,
  listEffectiveUserPermissions,
  listPermissions,
  MAX_PERMISSIONS_PAGE_SIZE,
  removePermissionFromUser,
} from '../../shared/api';
import {
  AssignmentDiffToolbar,
  AssignmentEmptyHint,
  AssignmentEmptyShell,
  AssignmentEmptyTitle,
  AssignmentGroupCard,
  AssignmentGroupHeaderRow,
  AssignmentGroupList,
  AssignmentItemBadges,
  AssignmentItemDetails,
  AssignmentItemList,
  AssignmentItemRow,
  AssignmentLegendBar,
  AssignmentLegendCopy,
  AssignmentLegendItem,
  AssignmentPermissionPanelLoading,
  BackLink,
  CatalogPermissionDetailHeader,
  ErrorRetryBlock,
} from '../../shared/listing';

import {
  buildInitialDirectPermissionIds,
  buildRoleMembershipsByPermission,
  computeAssignmentDiff,
  diffHasChanges,
  formatUserPermissionMutationError,
  formatUserPermissionsPanelLoadError,
  groupPermissionsBySystem,
} from './userPermissionsHelpers';

import type {
  PermissionAssignmentFailure,
  PermissionSystemGroup,
  RoleMembershipsByPermission,
} from './userPermissionsHelpers';
import type {
  ApiClient,
  EffectivePermissionDto,
  PermissionDto,
} from '../../shared/api';

const EmbeddedToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
`;

interface FetchedState {
  permissions: ReadonlyArray<PermissionDto>;
  effective: ReadonlyArray<EffectivePermissionDto>;
}

interface UserDirectPermissionPanelState {
  isInitialLoading: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  fetched: FetchedState | null;
  selectedDirect: ReadonlySet<string>;
  originalDirect: ReadonlySet<string>;
  refetchNonce: number;
}

export interface UserDirectPermissionsPanelProps {
  /** Usuário alvo (já validado pelo caller). */
  userId: string;
  /**
   * `fullPage` — rota `/usuarios/:id/permissoes` (Issue #70).
   * `embedded` — seção no detalhe do usuário (Issue #203).
   */
  mode: 'fullPage' | 'embedded';
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido
   * (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

/**
 * Painel de atribuição direta de permissões (POST/DELETE em
 * `/users/{id}/permissions`). Reutilizado pela página dedicada
 * (Issue #70) e pelo detalhe do usuário (Issue #203).
 */
export const UserDirectPermissionsPanel: React.FC<UserDirectPermissionsPanelProps> = ({
  userId,
  mode,
  client,
}) => {
  const toast = useToast();

  const [state, setState] = useState<UserDirectPermissionPanelState>(() => ({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    selectedDirect: new Set<string>(),
    originalDirect: new Set<string>(),
    refetchNonce: 0,
  }));

  const userDirectPermSyncRef = useRef<AbortController | null>(null);

  function reloadPermissionMatrix(): void {
    setState((prev) => ({
      ...prev,
      isInitialLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }

  /**
   * Sincroniza catálogo global (`GET /permissions`) com o conjunto
   * efetivo do usuário (`GET /users/{id}/effective-permissions`) para
   * distinguir vínculos diretos de herança via roles (Issue #203).
   */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    userDirectPermSyncRef.current?.abort();
    userDirectPermSyncRef.current = controller;

    Promise.all([
      listPermissions(
        { pageSize: MAX_PERMISSIONS_PAGE_SIZE },
        { signal: controller.signal },
        client,
      ),
      listEffectiveUserPermissions(
        userId,
        undefined,
        { signal: controller.signal },
        client,
      ),
    ])
      .then(([catalog, effective]) => {
        if (cancelled) return;
        const originalDirect = buildInitialDirectPermissionIds(effective);
        setState((prev) => ({
          isInitialLoading: false,
          isSaving: false,
          errorMessage: null,
          fetched: { permissions: catalog.data, effective },
          selectedDirect: new Set(originalDirect),
          originalDirect,
          refetchNonce: prev.refetchNonce,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isFetchAborted(error)) return;
        setState((prev) => ({
          ...prev,
          isInitialLoading: false,
          errorMessage: formatUserPermissionsPanelLoadError(
            error,
            'Falha ao carregar as permissões do usuário. Tente novamente.',
          ),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, userId, state.refetchNonce]);

  const groups = useMemo<ReadonlyArray<PermissionSystemGroup>>(() => {
    if (!state.fetched) return [];
    return groupPermissionsBySystem(state.fetched.permissions);
  }, [state.fetched]);

  const roleMemberships = useMemo<RoleMembershipsByPermission>(() => {
    if (!state.fetched) return new Map();
    return buildRoleMembershipsByPermission(state.fetched.effective);
  }, [state.fetched]);

  const diff = useMemo(
    () => computeAssignmentDiff(state.originalDirect, state.selectedDirect),
    [state.originalDirect, state.selectedDirect],
  );
  const hasUnsavedChanges = diffHasChanges(diff);

  const handleTogglePermission = useCallback(
    (permissionId: string, checked: boolean) => {
      setState((prev) => {
        const next = new Set(prev.selectedDirect);
        if (checked) {
          next.add(permissionId);
        } else {
          next.delete(permissionId);
        }
        return { ...prev, selectedDirect: next };
      });
    },
    [],
  );

  const handleResetChanges = useCallback(() => {
    setState((prev) => ({ ...prev, selectedDirect: new Set(prev.originalDirect) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || state.isSaving) {
      return;
    }
    setState((prev) => ({ ...prev, isSaving: true }));
    const failures: PermissionAssignmentFailure[] = [];
    let succeededAdd = 0;
    let succeededRemove = 0;

    const addOps = diff.toAdd.map(async (permissionId) => {
      try {
        await assignPermissionToUser(userId, permissionId, undefined, client);
        succeededAdd += 1;
      } catch (error: unknown) {
        failures.push({
          permissionId,
          kind: 'add',
          message: formatUserPermissionMutationError(
            error,
            'Falha ao atribuir permissão. Tente novamente.',
          ),
        });
      }
    });

    const removeOps = diff.toRemove.map(async (permissionId) => {
      try {
        await removePermissionFromUser(userId, permissionId, undefined, client);
        succeededRemove += 1;
      } catch (error: unknown) {
        failures.push({
          permissionId,
          kind: 'remove',
          message: formatUserPermissionMutationError(
            error,
            'Falha ao remover permissão. Tente novamente.',
          ),
        });
      }
    });

    await Promise.all([...addOps, ...removeOps]);

    if (failures.length === 0) {
      const totalApplied = succeededAdd + succeededRemove;
      toast.show(
        totalApplied === 1
          ? '1 alteração de permissão aplicada com sucesso.'
          : `${totalApplied} alterações de permissões aplicadas com sucesso.`,
        { variant: 'success', title: 'Permissões atualizadas' },
      );
    } else {
      const totalApplied = succeededAdd + succeededRemove;
      const failedCount = failures.length;
      const appliedSuffix = totalApplied > 0 ? `, ${totalApplied} aplicada(s)` : '';
      toast.show(
        `${failedCount} alteração(ões) falharam${appliedSuffix}. Revise e tente novamente.`,
        { variant: 'warning', title: 'Algumas atualizações falharam' },
      );
    }

    setState((prev) => ({
      ...prev,
      isSaving: false,
      isInitialLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }, [client, diff, hasUnsavedChanges, state.isSaving, toast, userId]);

  const toolbar = (
    <AssignmentDiffToolbar
      resetTestId="user-permissions-reset"
      saveTestId="user-permissions-save"
      hasUnsavedChanges={hasUnsavedChanges}
      isSaving={state.isSaving}
      pendingCount={diff.toAdd.length + diff.toRemove.length}
      onReset={handleResetChanges}
      onSave={handleSave}
    />
  );

  const legendAndBody = (
    <>
      <AssignmentLegendBar
        role="note"
        aria-label="Legenda de origem das permissões"
      >
        <AssignmentLegendItem>
          <Badge variant="success" dot>
            Direta
          </Badge>
          <AssignmentLegendCopy>
            vínculo direto com o usuário (editável aqui).
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
        <AssignmentLegendItem>
          <Badge variant="info" dot>
            Herdada
          </Badge>
          <AssignmentLegendCopy>
            recebida via role do usuário — edite a role para alterar.
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
      </AssignmentLegendBar>

      {state.isInitialLoading && (
        <AssignmentPermissionPanelLoading testId="user-permissions-loading" />
      )}

      {!state.isInitialLoading && state.errorMessage && (
        <ErrorRetryBlock
          message={state.errorMessage}
          onRetry={reloadPermissionMatrix}
          retryTestId="user-permissions-retry"
        />
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length === 0 && (
        <AssignmentEmptyShell data-testid="user-permissions-empty">
          <Info size={20} strokeWidth={1.5} aria-hidden="true" />
          <AssignmentEmptyTitle>
            Nenhuma permissão cadastrada no catálogo.
          </AssignmentEmptyTitle>
          <AssignmentEmptyHint>
            Cadastre permissões na seção Permissões antes de atribuir diretamente a um
            usuário.
          </AssignmentEmptyHint>
        </AssignmentEmptyShell>
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length > 0 && (
        <AssignmentGroupList aria-label="Permissões agrupadas por sistema">
          {groups.map((group) => (
            <PermissionGroup
              key={group.systemId || group.systemCode}
              group={group}
              selectedDirect={state.selectedDirect}
              originalDirect={state.originalDirect}
              roleMemberships={roleMemberships}
              isSaving={state.isSaving}
              onToggle={handleTogglePermission}
            />
          ))}
        </AssignmentGroupList>
      )}
    </>
  );

  if (mode === 'embedded') {
    return (
      <>
        <EmbeddedToolbar>{toolbar}</EmbeddedToolbar>
        {legendAndBody}
      </>
    );
  }

  return (
    <>
      <BackLink to={`/usuarios/${userId}`} data-testid="user-permissions-back">
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para o usuário
      </BackLink>
      <PageHeader
        eyebrow="06 Usuários · Permissões"
        title="Permissões do usuário"
        desc="Atribuição direta de permissões. Permissões herdadas via roles aparecem em destaque e não são afetadas — para alterá-las, edite as roles do usuário."
        actions={toolbar}
      />
      {legendAndBody}
    </>
  );
};

interface PermissionGroupProps {
  group: PermissionSystemGroup;
  selectedDirect: ReadonlySet<string>;
  originalDirect: ReadonlySet<string>;
  roleMemberships: RoleMembershipsByPermission;
  isSaving: boolean;
  onToggle: (permissionId: string, checked: boolean) => void;
}

const PermissionGroup: React.FC<PermissionGroupProps> = ({
  group,
  selectedDirect,
  originalDirect,
  roleMemberships,
  isSaving,
  onToggle,
}) => (
  <AssignmentGroupCard
    data-testid={`user-permissions-group-${group.systemCode}`}
  >
    <AssignmentGroupHeaderRow
      systemCode={group.systemCode}
      systemName={group.systemName}
      count={group.permissions.length}
      countAriaLabel={`${group.permissions.length} permissões neste sistema`}
    />
    <AssignmentItemList>
      {group.permissions.map((perm) => {
        const isSelected = selectedDirect.has(perm.id);
        const wasOriginallyDirect = originalDirect.has(perm.id);
        const inheritedRoles = roleMemberships.get(perm.id) ?? [];
        const isInherited = inheritedRoles.length > 0;
        const isPending = isSelected !== wasOriginallyDirect;
        return (
          <AssignmentItemRow
            key={perm.id}
            data-testid={`user-permissions-item-${perm.id}`}
            data-pending={isPending || undefined}
          >
            <Checkbox
              checked={isSelected}
              disabled={isSaving}
              onChange={(checked) => onToggle(perm.id, checked)}
              aria-label={`Marcar permissão direta: ${perm.routeName || perm.routeCode} (${perm.permissionTypeName || perm.permissionTypeCode})`}
              data-testid={`user-permissions-checkbox-${perm.id}`}
            />
            <AssignmentItemDetails>
              <CatalogPermissionDetailHeader perm={perm} />
              <AssignmentItemBadges>
                {wasOriginallyDirect && (
                  <Badge variant="success" dot>
                    Direta
                  </Badge>
                )}
                {isInherited && (
                  <Badge variant="info" dot>
                    Herdada · {inheritedRoles.map((r) => r.roleName).join(', ')}
                  </Badge>
                )}
                {isPending && (
                  <Badge variant="warning">
                    {isSelected ? 'Adição pendente' : 'Remoção pendente'}
                  </Badge>
                )}
              </AssignmentItemBadges>
            </AssignmentItemDetails>
          </AssignmentItemRow>
        );
      })}
    </AssignmentItemList>
  </AssignmentGroupCard>
);
