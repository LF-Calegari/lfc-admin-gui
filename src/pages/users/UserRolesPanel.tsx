import { Info } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import { Badge, Checkbox, Spinner, useToast } from '../../components/ui';
import {
  assignRoleToUser,
  getUserById,
  isFetchAborted,
  listRoles,
  listSystems,
  MAX_ROLES_PAGE_SIZE,
  removeRoleFromUser,
} from '../../shared/api';
import { computeIdSetDiff, idSetDiffHasChanges } from '../../shared/forms';
import {
  AssignmentDiffToolbar,
  AssignmentEmptyHint,
  AssignmentEmptyShell,
  AssignmentEmptyTitle,
  AssignmentGroupCard,
  AssignmentGroupHeaderRow,
  AssignmentGroupList,
  AssignmentItemBadges,
  AssignmentItemCodeChip,
  AssignmentItemDescription,
  AssignmentItemDetails,
  AssignmentItemList,
  AssignmentItemPrimaryText,
  AssignmentItemRow,
  AssignmentItemTitleRow,
  AssignmentLegendBar,
  AssignmentLegendCopy,
  AssignmentLegendItem,
  AssignmentLoadingCopy,
  AssignmentLoadingShell,
  AssignmentMatrixShell,
  ErrorRetryBlock,
  Mono,
} from '../../shared/listing';

import {
  buildInitialUserRoleIds,
  formatUserRoleMutationError,
  formatUserRolesPanelLoadError,
  groupRolesBySystem,
} from './userRolesHelpers';

import type {
  RoleAssignmentFailure,
  RoleSystemGroup,
  SystemLookupMap,
} from './userRolesHelpers';
import type {
  ApiClient,
  RoleDto,
  SystemDto,
  UserDto,
} from '../../shared/api';

const EmbeddedToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
`;

interface FetchedState {
  user: UserDto;
  roles: ReadonlyArray<RoleDto>;
  systemLookup: SystemLookupMap;
}

interface UserRolesPanelState {
  isInitialLoading: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  fetched: FetchedState | null;
  chosenRoleIds: ReadonlySet<string>;
  baselineRoleIds: ReadonlySet<string>;
  refreshTick: number;
}

export interface UserRolesPanelProps {
  /** Usuário alvo (já validado pelo caller). */
  userId: string;
  /**
   * `fullPage` — rota `/usuarios/:id/roles` (Issue #71).
   * `embedded` — seção no detalhe do usuário (Issue #208).
   */
  mode: 'fullPage' | 'embedded';
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido
   * (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

function buildSystemLookup(
  systems: ReadonlyArray<SystemDto>,
): SystemLookupMap {
  const map = new Map<string, { code: string; name: string }>();
  for (const system of systems) {
    map.set(system.id, { code: system.code, name: system.name });
  }
  return map;
}

/**
 * Painel de atribuição de roles por sistema (POST/DELETE em
 * `/users/{id}/roles`). Reutilizado pela página dedicada (Issue #71)
 * e pelo detalhe do usuário (Issue #208).
 */
export const UserRolesPanel: React.FC<UserRolesPanelProps> = ({
  userId,
  mode,
  client,
}) => {
  const toast = useToast();

  const [state, setState] = useState<UserRolesPanelState>({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    chosenRoleIds: new Set<string>(),
    baselineRoleIds: new Set<string>(),
    refreshTick: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRefetch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isInitialLoading: true,
      errorMessage: null,
      refreshTick: prev.refreshTick + 1,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    Promise.all([
      listRoles({ pageSize: MAX_ROLES_PAGE_SIZE }, { signal: controller.signal }, client),
      listSystems({ pageSize: MAX_ROLES_PAGE_SIZE }, { signal: controller.signal }, client),
      getUserById(userId, { signal: controller.signal }, client),
    ])
      .then(([rolesResponse, systemsResponse, user]) => {
        if (cancelled) return;
        const baselineRoleIds = buildInitialUserRoleIds(user.roles);
        setState({
          isInitialLoading: false,
          isSaving: false,
          errorMessage: null,
          fetched: {
            user,
            roles: rolesResponse.data,
            systemLookup: buildSystemLookup(systemsResponse.data),
          },
          chosenRoleIds: new Set(baselineRoleIds),
          baselineRoleIds,
          refreshTick: 0,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isFetchAborted(error)) return;
        setState((prev) => ({
          ...prev,
          isInitialLoading: false,
          errorMessage: formatUserRolesPanelLoadError(
            error,
            'Falha ao carregar as roles do usuário. Tente novamente.',
          ),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, userId, state.refreshTick]);

  const groups = useMemo<ReadonlyArray<RoleSystemGroup>>(() => {
    if (!state.fetched) return [];
    return groupRolesBySystem(state.fetched.roles, state.fetched.systemLookup);
  }, [state.fetched]);

  const diff = useMemo(
    () => computeIdSetDiff(state.baselineRoleIds, state.chosenRoleIds),
    [state.baselineRoleIds, state.chosenRoleIds],
  );
  const hasUnsavedChanges = idSetDiffHasChanges(diff);
  const pendingCount = diff.toAdd.length + diff.toRemove.length;

  const handleToggleRole = useCallback((roleId: string, checked: boolean) => {
    setState((prev) => {
      const next = new Set(prev.chosenRoleIds);
      if (checked) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
      return { ...prev, chosenRoleIds: next };
    });
  }, []);

  const handleResetChanges = useCallback(() => {
    setState((prev) => ({ ...prev, chosenRoleIds: new Set(prev.baselineRoleIds) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || state.isSaving) {
      return;
    }
    setState((prev) => ({ ...prev, isSaving: true }));
    const failures: RoleAssignmentFailure[] = [];
    let addedSuccess = 0;
    let removedSuccess = 0;

    const addOps = diff.toAdd.map(async (roleId) => {
      try {
        await assignRoleToUser(userId, roleId, undefined, client);
        addedSuccess += 1;
      } catch (error: unknown) {
        failures.push({
          roleId,
          kind: 'add',
          message: formatUserRoleMutationError(
            error,
            'Falha ao atribuir role. Tente novamente.',
          ),
        });
      }
    });

    const removeOps = diff.toRemove.map(async (roleId) => {
      try {
        await removeRoleFromUser(userId, roleId, undefined, client);
        removedSuccess += 1;
      } catch (error: unknown) {
        failures.push({
          roleId,
          kind: 'remove',
          message: formatUserRoleMutationError(
            error,
            'Falha ao remover role. Tente novamente.',
          ),
        });
      }
    });

    await Promise.all([...addOps, ...removeOps]);

    if (failures.length === 0) {
      const appliedCount = addedSuccess + removedSuccess;
      toast.show(
        appliedCount === 1
          ? '1 alteração de role aplicada com sucesso.'
          : `${appliedCount} alterações de roles aplicadas com sucesso.`,
        { variant: 'success', title: 'Roles atualizadas' },
      );
    } else {
      const appliedCount = addedSuccess + removedSuccess;
      const failureCount = failures.length;
      const appliedSuffix = appliedCount > 0 ? `, ${appliedCount} aplicada(s)` : '';
      toast.show(
        `${failureCount} alteração(ões) falharam${appliedSuffix}. Revise e tente novamente.`,
        { variant: 'warning', title: 'Algumas atualizações falharam' },
      );
    }

    setState((prev) => ({
      ...prev,
      isSaving: false,
      isInitialLoading: true,
      errorMessage: null,
      refreshTick: prev.refreshTick + 1,
    }));
  }, [client, diff, hasUnsavedChanges, state.isSaving, toast, userId]);

  const legend = (
    <>
      <AssignmentLegendItem>
        <Badge variant="success" dot>
          Vinculada
        </Badge>
        <AssignmentLegendCopy>
          role atualmente vinculada ao usuário.
        </AssignmentLegendCopy>
      </AssignmentLegendItem>
      <AssignmentLegendItem>
        <Badge variant="warning">Pendente</Badge>
        <AssignmentLegendCopy>alteração ainda não salva.</AssignmentLegendCopy>
      </AssignmentLegendItem>
    </>
  );

  const toolbar = (
    <AssignmentDiffToolbar
      resetTestId="user-roles-reset"
      saveTestId="user-roles-save"
      hasUnsavedChanges={hasUnsavedChanges}
      isSaving={state.isSaving}
      pendingCount={pendingCount}
      onReset={handleResetChanges}
      onSave={handleSave}
    />
  );

  const matrixBody = (
    <>
      <AssignmentLegendBar role="note" aria-label="Legenda de status das roles">
        {legend}
      </AssignmentLegendBar>

      {state.isInitialLoading && (
        <AssignmentLoadingShell data-testid="user-roles-loading" aria-live="polite">
          <Spinner size="md" tone="accent" />
          <AssignmentLoadingCopy>Carregando roles…</AssignmentLoadingCopy>
        </AssignmentLoadingShell>
      )}

      {!state.isInitialLoading && state.errorMessage && (
        <ErrorRetryBlock
          message={state.errorMessage}
          onRetry={handleRefetch}
          retryTestId="user-roles-retry"
        />
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length === 0 && (
        <AssignmentEmptyShell data-testid="user-roles-empty">
          <Info size={20} strokeWidth={1.5} aria-hidden="true" />
          <AssignmentEmptyTitle>
            Nenhuma role cadastrada no catálogo.
          </AssignmentEmptyTitle>
          <AssignmentEmptyHint>
            Cadastre roles na seção Roles antes de atribuir a um usuário.
          </AssignmentEmptyHint>
        </AssignmentEmptyShell>
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length > 0 && (
        <AssignmentGroupList aria-label="Roles agrupadas por sistema">
          {groups.map((group) => (
            <RoleGroup
              key={group.systemId || group.systemCode}
              group={group}
              chosenRoleIds={state.chosenRoleIds}
              baselineRoleIds={state.baselineRoleIds}
              isSaving={state.isSaving}
              onToggle={handleToggleRole}
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
        {matrixBody}
      </>
    );
  }

  return (
    <AssignmentMatrixShell<RoleSystemGroup>
      eyebrow="06 Usuários · Roles"
      title="Roles do usuário"
      desc="Atribuição de roles por sistema. Permissões herdadas via roles ficam visíveis no painel de permissões efetivas após salvar."
      backLink={{
        to: `/usuarios/${userId}`,
        label: 'Voltar para o usuário',
      }}
      legend={legend}
      legendAriaLabel="Legenda de status das roles"
      groupsAriaLabel="Roles agrupadas por sistema"
      isInitialLoading={state.isInitialLoading}
      errorMessage={state.errorMessage}
      isEmpty={groups.length === 0}
      isSaving={state.isSaving}
      hasUnsavedChanges={hasUnsavedChanges}
      pendingCount={pendingCount}
      groups={groups}
      onReset={handleResetChanges}
      onSave={handleSave}
      onRetry={handleRefetch}
      emptyTitle="Nenhuma role cadastrada no catálogo."
      emptyHint="Cadastre roles na seção Roles antes de atribuir a um usuário."
      loadingCopy="Carregando roles…"
      testIdPrefix="user-roles"
      renderGroup={(group) => (
        <RoleGroup
          key={group.systemId || group.systemCode}
          group={group}
          chosenRoleIds={state.chosenRoleIds}
          baselineRoleIds={state.baselineRoleIds}
          isSaving={state.isSaving}
          onToggle={handleToggleRole}
        />
      )}
    />
  );
};

interface RoleGroupProps {
  group: RoleSystemGroup;
  chosenRoleIds: ReadonlySet<string>;
  baselineRoleIds: ReadonlySet<string>;
  isSaving: boolean;
  onToggle: (roleId: string, checked: boolean) => void;
}

const RoleGroup: React.FC<RoleGroupProps> = ({
  group,
  chosenRoleIds,
  baselineRoleIds,
  isSaving,
  onToggle,
}) => (
  <AssignmentGroupCard data-testid={`user-roles-group-${group.systemCode}`}>
    <AssignmentGroupHeaderRow
      systemCode={group.systemCode}
      systemName={group.systemName}
      count={group.items.length}
      countAriaLabel={`${group.items.length} roles neste sistema`}
    />
    <AssignmentItemList>
      {group.items.map((role) => {
        const checkboxChecked = chosenRoleIds.has(role.id);
        const wasInitiallyLinked = baselineRoleIds.has(role.id);
        const hasUnsavedChange = checkboxChecked !== wasInitiallyLinked;
        return (
          <AssignmentItemRow
            key={role.id}
            data-testid={`user-roles-item-${role.id}`}
            data-pending={hasUnsavedChange || undefined}
          >
            <Checkbox
              checked={checkboxChecked}
              disabled={isSaving}
              onChange={(checked) => onToggle(role.id, checked)}
              aria-label={`${role.name} · ${role.code}`}
              data-testid={`user-roles-checkbox-${role.id}`}
            />
            <AssignmentItemDetails>
              <AssignmentItemTitleRow>
                <AssignmentItemPrimaryText>{role.name}</AssignmentItemPrimaryText>
                <AssignmentItemCodeChip>
                  <Mono>{role.code}</Mono>
                </AssignmentItemCodeChip>
              </AssignmentItemTitleRow>
              {role.description && (
                <AssignmentItemDescription>{role.description}</AssignmentItemDescription>
              )}
              <AssignmentItemBadges>
                {wasInitiallyLinked && (
                  <Badge variant="success" dot>
                    Vinculada
                  </Badge>
                )}
                {hasUnsavedChange && (
                  <Badge variant="warning">
                    {checkboxChecked ? 'Adição pendente' : 'Remoção pendente'}
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
