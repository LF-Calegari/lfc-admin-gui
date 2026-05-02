import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';

import { Badge, Checkbox, useToast } from '../../components/ui';
import {
  assignRoleToUser,
  extractErrorMessage,
  getUserById,
  isFetchAborted,
  listRoles,
  listSystems,
  MAX_ROLES_PAGE_SIZE,
  removeRoleFromUser,
} from '../../shared/api';
import { computeIdSetDiff, idSetDiffHasChanges } from '../../shared/forms';
import {
  AssignmentGroupCard,
  AssignmentGroupCode,
  AssignmentGroupCount,
  AssignmentGroupHeader,
  AssignmentGroupName,
  AssignmentItemBadges,
  AssignmentItemCodeChip,
  AssignmentItemDescription,
  AssignmentItemDetails,
  AssignmentItemList,
  AssignmentItemPrimaryText,
  AssignmentItemRow,
  AssignmentItemTitleRow,
  AssignmentLegendCopy,
  AssignmentLegendItem,
  AssignmentMatrixShell,
  Mono,
} from '../../shared/listing';

import {
  buildInitialUserRoleIds,
  groupRolesBySystem,
} from './userRolesHelpers';

import type {
  RoleAssignmentFailure,
  RoleId,
  RoleSystemGroup,
  SystemLookupMap,
} from './userRolesHelpers';
import type {
  ApiClient,
  RoleDto,
  SystemDto,
  UserDto,
} from '../../shared/api';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha `UserPermissionsShellPage`/`RolesPage`/
 * `RolePermissionsShellPage`. Aceita qualquer string não-vazia com
 * pelo menos um caractere não-whitespace.
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

interface FetchedState {
  user: UserDto;
  roles: ReadonlyArray<RoleDto>;
  systemLookup: SystemLookupMap;
}

/**
 * Constrói o mapa `systemId -> {code, name}` a partir do array de
 * `SystemDto` devolvido por `listSystems`. Mantido fora do componente
 * para tornar testes baratos.
 */
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
 * Atribuição de roles a um usuário (Issue #71 / EPIC #48).
 *
 * Fluxo (espelhando `UserPermissionsShellPage` da Issue #70 e
 * `RolePermissionsShellPage` da Issue #69):
 *
 * 1. Carrega em paralelo `GET /roles` (catálogo paginado),
 *    `GET /systems` (lookup de `systemId -> {code, name}`) e
 *    `GET /users/{id}` (estado atual do usuário, incluindo array
 *    `roles`).
 * 2. Inicializa o set `chosenRoleIds` com os ids das roles do array
 *    `user.roles`.
 * 3. UI exibe lista agrupada por sistema; cada role tem um checkbox
 *    controlado e badges visuais (vínculo atual / pendente).
 * 4. Salvar calcula o diff client-side via `computeIdSetDiff` e
 *    dispara `assignRoleToUser`/`removeRoleFromUser` em paralelo.
 *    Falhas individuais não abortam o lote — agregamos um relatório.
 * 5. Após o salvar, refetch do `getUserById` sincroniza o estado com
 *    o backend (idempotência cobre divergências raras), e a UI
 *    automaticamente reflete em `effective-permissions` na Issue #70
 *    quando o usuário voltar para essa tela.
 *
 * **Visível com** `Roles.Read` + `Users.Update` (gating duplo via
 * `RequirePermission` na rota — ver `src/routes/index.tsx`). A página
 * assume que ambas as permissões já estão garantidas — não duplica a
 * checagem aqui.
 *
 * **Reuso (lição PR #134/#135):** o JSX da matriz vem de
 * `<AssignmentMatrixShell>` em `src/shared/listing/`, compartilhado
 * com `UserPermissionsShellPage`/`RolePermissionsShellPage`. O diff
 * usa `computeIdSetDiff`/`idSetDiffHasChanges` em
 * `src/shared/forms/`. O agrupamento usa `groupBySystem` em
 * `src/shared/listing/` (delegado por `groupRolesBySystem`). O que
 * fica **local** é apenas a copy da legenda e o render do `RoleGroup`.
 */
export const UserRolesShellPage: React.FC<UserRolesShellPageProps> = ({
  client,
}) => {
  const { id: userId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(userId);

  const toast = useToast();

  const [matrixState, setMatrixState] = useState<{
    isInitialLoading: boolean;
    isSaving: boolean;
    errorMessage: string | null;
    fetched: FetchedState | null;
    chosenRoleIds: ReadonlySet<RoleId>;
    baselineRoleIds: ReadonlySet<RoleId>;
    refreshTick: number;
  }>({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    chosenRoleIds: new Set<RoleId>(),
    baselineRoleIds: new Set<RoleId>(),
    refreshTick: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRefetch = useCallback(() => {
    setMatrixState((prev) => ({
      ...prev,
      isInitialLoading: true,
      errorMessage: null,
      refreshTick: prev.refreshTick + 1,
    }));
  }, []);

  useEffect(() => {
    if (!hasValidUserId) {
      setMatrixState((prev) => ({ ...prev, isInitialLoading: false }));
      return undefined;
    }

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
        setMatrixState({
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
        setMatrixState((prev) => ({
          ...prev,
          isInitialLoading: false,
          errorMessage: extractErrorMessage(
            error,
            'Falha ao carregar as roles do usuário. Tente novamente.',
          ),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, hasValidUserId, userId, matrixState.refreshTick]);

  const groups = useMemo<ReadonlyArray<RoleSystemGroup>>(() => {
    if (!matrixState.fetched) return [];
    return groupRolesBySystem(matrixState.fetched.roles, matrixState.fetched.systemLookup);
  }, [matrixState.fetched]);

  const diff = useMemo(
    () => computeIdSetDiff(matrixState.baselineRoleIds, matrixState.chosenRoleIds),
    [matrixState.baselineRoleIds, matrixState.chosenRoleIds],
  );
  const hasUnsavedChanges = idSetDiffHasChanges(diff);

  const handleToggleRole = useCallback((roleId: RoleId, checked: boolean) => {
    setMatrixState((prev) => {
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
    setMatrixState((prev) => ({ ...prev, chosenRoleIds: new Set(prev.baselineRoleIds) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasValidUserId || !hasUnsavedChanges || matrixState.isSaving) {
      return;
    }
    setMatrixState((prev) => ({ ...prev, isSaving: true }));
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
          message: extractErrorMessage(
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
          message: extractErrorMessage(
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
      toast.show(
        `${failureCount} alteração(ões) falharam${appliedCount > 0 ? `, ${appliedCount} aplicada(s)` : ''}. Revise e tente novamente.`,
        { variant: 'warning', title: 'Algumas atualizações falharam' },
      );
    }

    // Refetch após o salvar — backend é a fonte da verdade. Se houve
    // falha parcial, o estado reflete o backend (não o esforço local).
    setMatrixState((prev) => ({
      ...prev,
      isSaving: false,
      isInitialLoading: true,
      errorMessage: null,
      refreshTick: prev.refreshTick + 1,
    }));
  }, [client, diff, hasUnsavedChanges, hasValidUserId, matrixState.isSaving, toast, userId]);

  const pendingCount = diff.toAdd.length + diff.toRemove.length;

  return (
    <AssignmentMatrixShell<RoleSystemGroup>
      eyebrow="06 Usuários · Roles"
      title="Roles do usuário"
      desc="Atribuição de roles. Permissões herdadas via roles ficam visíveis no painel de permissões efetivas após salvar."
      backLink={{
        to: hasValidUserId ? `/usuarios/${userId}` : '/usuarios',
        label: hasValidUserId ? 'Voltar para o usuário' : 'Voltar para Usuários',
      }}
      invalidIdMessage={
        hasValidUserId
          ? undefined
          : 'ID de usuário ausente ou inválido na URL. Volte para a listagem de usuários e selecione um para gerenciar roles.'
      }
      legendAriaLabel="Legenda de status das roles"
      legend={
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
      }
      isInitialLoading={matrixState.isInitialLoading}
      errorMessage={matrixState.errorMessage}
      isEmpty={groups.length === 0}
      isSaving={matrixState.isSaving}
      hasUnsavedChanges={hasUnsavedChanges}
      pendingCount={pendingCount}
      groups={groups}
      onReset={handleResetChanges}
      onSave={handleSave}
      onRetry={handleRefetch}
      emptyTitle="Nenhuma role cadastrada no catálogo."
      emptyHint="Cadastre roles na seção Roles antes de atribuir a um usuário."
      loadingCopy="Carregando roles…"
      groupsAriaLabel="Roles agrupadas por sistema"
      testIdPrefix="user-roles"
      renderGroup={(group) => (
        <RoleGroup
          key={group.systemId || group.systemCode}
          group={group}
          chosenRoleIds={matrixState.chosenRoleIds}
          baselineRoleIds={matrixState.baselineRoleIds}
          isSaving={matrixState.isSaving}
          onToggle={handleToggleRole}
        />
      )}
    />
  );
};

interface RoleGroupProps {
  group: RoleSystemGroup;
  chosenRoleIds: ReadonlySet<RoleId>;
  baselineRoleIds: ReadonlySet<RoleId>;
  isSaving: boolean;
  onToggle: (roleId: RoleId, checked: boolean) => void;
}

const RoleGroup: React.FC<RoleGroupProps> = ({
  group,
  chosenRoleIds,
  baselineRoleIds,
  isSaving,
  onToggle,
}) => (
  <AssignmentGroupCard data-testid={`user-roles-group-${group.systemCode}`}>
    <AssignmentGroupHeader>
      <AssignmentGroupCode>{group.systemCode}</AssignmentGroupCode>
      <AssignmentGroupName>{group.systemName}</AssignmentGroupName>
      <AssignmentGroupCount aria-label={`${group.items.length} roles neste sistema`}>
        {group.items.length}
      </AssignmentGroupCount>
    </AssignmentGroupHeader>
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
