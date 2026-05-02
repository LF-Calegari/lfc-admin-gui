import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Badge, Checkbox, useToast } from '../../components/ui';
import {
  assignRoleToUser,
  getUserById,
  isApiError,
  listAllRoles,
  listSystems,
  MAX_ROLES_PAGE_SIZE,
  removeRoleFromUser,
} from '../../shared/api';
import {
  AssignmentMatrixShell,
  Mono,
} from '../../shared/listing';
import {
  GroupCard,
  GroupCode,
  GroupCount,
  GroupHeader,
  GroupName,
  ItemBadges,
  ItemCodeChip,
  ItemDescription,
  ItemDetails,
  ItemList,
  ItemPrimaryText,
  ItemRow,
  ItemTitleRow,
  LegendCopy,
  LegendItem,
} from '../../shared/listing/AssignmentMatrixStyles';

import {
  buildInitialUserRoleIds,
  computeRoleAssignmentDiff,
  groupRolesBySystem,
  roleDiffHasChanges,
} from './userRolesHelpers';

import type {
  RoleAssignmentFailure,
  RoleId,
  RoleSystemGroup,
} from './userRolesHelpers';
import type {
  ApiClient,
  RoleDto,
  SystemDto,
  UserDetailDto,
} from '../../shared/api';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha `UserPermissionsShellPage`/`RolesPage`.
 * Aceita qualquer string não-vazia com pelo menos um caractere
 * não-whitespace.
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
  roles: ReadonlyArray<RoleDto>;
  user: UserDetailDto;
  systems: ReadonlyMap<string, { code: string; name: string }>;
}

/**
 * Atribuição via role a um usuário (Issue #71 / EPIC #48).
 *
 * Fluxo:
 *
 * 1. Carrega em paralelo `GET /roles?pageSize=100` (catálogo
 *    completo de roles), `GET /systems` (para denormalizar
 *    `systemCode`/`systemName` ao agrupar) e `GET /users/{id}`
 *    (estado atual do usuário com `roles[]` vinculadas).
 * 2. Inicializa o set `selectedRoles` com `user.roles[].roleId`.
 * 3. UI exibe lista agrupada por sistema; cada role tem checkbox
 *    controlado.
 * 4. Salvar calcula o diff client-side e dispara
 *    `assignRoleToUser`/`removeRoleFromUser` em paralelo. Falhas
 *    individuais não abortam o lote — agregamos um relatório.
 * 5. Após salvar, refetch do `getUserById` sincroniza o estado com
 *    o backend (idempotência cobre divergências raras). Permissões
 *    efetivas (Issue #70) são re-fetchadas automaticamente quando
 *    o admin retornar à tela de permissões — esta tela invalida o
 *    estado local mas não o cache global de outras rotas.
 *
 * **Visível com** `Roles.Read` (`AUTH_V1_ROLES_LIST`) +
 * `Users.Update` (`AUTH_V1_USERS_ROLES_ASSIGN`). O gating na rota é
 * feito por `RequirePermission` aninhado (ver `src/routes/index.tsx`).
 *
 * **Compartilhamento de UI:** delega o chrome (header, legenda, save
 * button, loading/error/empty shells) ao `AssignmentMatrixShell` em
 * `src/shared/listing/AssignmentMatrixShell.tsx` — fonte única de
 * verdade compartilhada com `UserPermissionsShellPage` (Issue #70) e
 * `RolePermissionsShellPage` (Issue #69), evitando duplicação de
 * JSX/CSS-in-JS que tokenizaria como bloco no Sonar (lições PR
 * #134/#135).
 */
export const UserRolesShellPage: React.FC<UserRolesShellPageProps> = ({
  client,
}) => {
  const { id: userId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(userId);

  const toast = useToast();

  const [state, setState] = useState<{
    isInitialLoading: boolean;
    isSaving: boolean;
    errorMessage: string | null;
    fetched: FetchedState | null;
    selectedRoles: ReadonlySet<RoleId>;
    originalRoles: ReadonlySet<RoleId>;
    refetchNonce: number;
  }>({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    selectedRoles: new Set<RoleId>(),
    originalRoles: new Set<RoleId>(),
    refetchNonce: 0,
  });

  const lastControllerRef = useRef<AbortController | null>(null);

  const handleRefetch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isInitialLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }, []);

  // Carrega catálogo (roles) + lookup (systems) + estado do usuário em
  // paralelo. Cancelamento via AbortController evita race em mudanças
  // rápidas de :id (caller pode navegar entre usuários).
  useEffect(() => {
    if (!hasValidUserId) {
      setState((prev) => ({ ...prev, isInitialLoading: false }));
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    lastControllerRef.current?.abort();
    lastControllerRef.current = controller;

    Promise.all([
      listAllRoles(
        { pageSize: MAX_ROLES_PAGE_SIZE },
        { signal: controller.signal },
        client,
      ),
      listSystems(
        { pageSize: MAX_ROLES_PAGE_SIZE },
        { signal: controller.signal },
        client,
      ),
      getUserById(userId, { signal: controller.signal }, client),
    ])
      .then(([rolesEnvelope, systemsEnvelope, user]) => {
        if (cancelled) return;
        const systemsById = buildSystemsLookup(systemsEnvelope.data);
        const originalRoles = buildInitialUserRoleIds(user.roles);
        setState({
          isInitialLoading: false,
          isSaving: false,
          errorMessage: null,
          fetched: { roles: rolesEnvelope.data, user, systems: systemsById },
          selectedRoles: new Set(originalRoles),
          originalRoles,
          refetchNonce: 0,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isFetchAborted(error)) return;
        setState((prev) => ({
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
  }, [client, hasValidUserId, userId, state.refetchNonce]);

  const groups = useMemo<ReadonlyArray<RoleSystemGroup>>(() => {
    if (!state.fetched) return [];
    return groupRolesBySystem(state.fetched.roles, state.fetched.systems);
  }, [state.fetched]);

  const diff = useMemo(
    () => computeRoleAssignmentDiff(state.originalRoles, state.selectedRoles),
    [state.originalRoles, state.selectedRoles],
  );
  const hasUnsavedChanges = roleDiffHasChanges(diff);

  const handleToggleRole = useCallback(
    (roleId: RoleId, checked: boolean) => {
      setState((prev) => {
        const next = new Set(prev.selectedRoles);
        if (checked) {
          next.add(roleId);
        } else {
          next.delete(roleId);
        }
        return { ...prev, selectedRoles: next };
      });
    },
    [],
  );

  const handleResetChanges = useCallback(() => {
    setState((prev) => ({ ...prev, selectedRoles: new Set(prev.originalRoles) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasValidUserId || !hasUnsavedChanges || state.isSaving) {
      return;
    }
    setState((prev) => ({ ...prev, isSaving: true }));
    const failures: RoleAssignmentFailure[] = [];
    let succeededAdd = 0;
    let succeededRemove = 0;

    const addOps = diff.toAdd.map(async (roleId) => {
      try {
        await assignRoleToUser(userId, roleId, undefined, client);
        succeededAdd += 1;
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
        succeededRemove += 1;
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
      const totalApplied = succeededAdd + succeededRemove;
      toast.show(
        totalApplied === 1
          ? '1 alteração de role aplicada com sucesso. Permissões efetivas atualizadas.'
          : `${totalApplied} alterações de roles aplicadas com sucesso. Permissões efetivas atualizadas.`,
        { variant: 'success', title: 'Roles atualizadas' },
      );
    } else {
      const totalApplied = succeededAdd + succeededRemove;
      const failedCount = failures.length;
      toast.show(
        `${failedCount} alteração(ões) falharam${totalApplied > 0 ? `, ${totalApplied} aplicada(s)` : ''}. Revise e tente novamente.`,
        { variant: 'warning', title: 'Algumas atualizações falharam' },
      );
    }

    // Refetch após o salvar — backend é a fonte da verdade. Se houve
    // falha parcial, o estado reflete o backend (não o esforço local).
    setState((prev) => ({
      ...prev,
      isSaving: false,
      isInitialLoading: true,
      errorMessage: null,
      refetchNonce: prev.refetchNonce + 1,
    }));
  }, [client, diff, hasUnsavedChanges, hasValidUserId, state.isSaving, toast, userId]);

  const renderGroup = useCallback(
    (group: RoleSystemGroup) => (
      <RoleGroup
        key={group.systemId || group.systemCode}
        group={group}
        selectedRoles={state.selectedRoles}
        originalRoles={state.originalRoles}
        isSaving={state.isSaving}
        onToggle={handleToggleRole}
      />
    ),
    [
      state.selectedRoles,
      state.originalRoles,
      state.isSaving,
      handleToggleRole,
    ],
  );

  return (
    <AssignmentMatrixShell<RoleSystemGroup>
      eyebrow="06 Usuários · Roles"
      title="Roles do usuário"
      desc={
        hasValidUserId
          ? 'Vincule ou desvincule roles deste usuário. Permissões herdadas via essas roles aparecem refletidas no painel de permissões efetivas.'
          : 'Selecione um usuário para gerenciar a atribuição via role.'
      }
      backLink={
        hasValidUserId
          ? { to: `/usuarios/${userId}`, label: 'Voltar para o usuário' }
          : { to: '/usuarios', label: 'Voltar para Usuários' }
      }
      invalidIdMessage={
        hasValidUserId
          ? undefined
          : 'ID de usuário ausente ou inválido na URL. Volte para a listagem de usuários e selecione um para gerenciar a atribuição via role.'
      }
      legend={
        <>
          <LegendItem>
            <Badge variant="success" dot>
              Vinculada
            </Badge>
            <LegendCopy>
              role atualmente atribuída ao usuário (editável aqui).
            </LegendCopy>
          </LegendItem>
          <LegendItem>
            <Badge variant="warning">Pendente</Badge>
            <LegendCopy>
              alteração não persistida — pressione Salvar alterações para
              aplicar.
            </LegendCopy>
          </LegendItem>
        </>
      }
      legendAriaLabel="Legenda de origem das roles"
      groupsAriaLabel="Roles agrupadas por sistema"
      isInitialLoading={state.isInitialLoading}
      errorMessage={state.errorMessage}
      isEmpty={groups.length === 0}
      isSaving={state.isSaving}
      hasUnsavedChanges={hasUnsavedChanges}
      pendingCount={diff.toAdd.length + diff.toRemove.length}
      groups={groups}
      onReset={handleResetChanges}
      onSave={handleSave}
      onRetry={handleRefetch}
      emptyTitle="Nenhuma role cadastrada no catálogo."
      emptyHint="Cadastre roles na seção Sistemas → Roles antes de atribuir a um usuário."
      loadingCopy="Carregando roles…"
      renderGroup={renderGroup}
      testIdPrefix="user-roles"
    />
  );
};

interface RoleGroupProps {
  group: RoleSystemGroup;
  selectedRoles: ReadonlySet<RoleId>;
  originalRoles: ReadonlySet<RoleId>;
  isSaving: boolean;
  onToggle: (roleId: RoleId, checked: boolean) => void;
}

const RoleGroup: React.FC<RoleGroupProps> = ({
  group,
  selectedRoles,
  originalRoles,
  isSaving,
  onToggle,
}) => (
  <GroupCard data-testid={`user-roles-group-${groupTestKey(group)}`}>
    <GroupHeader>
      <GroupCode>{group.systemCode || '—'}</GroupCode>
      <GroupName>{group.systemName}</GroupName>
      <GroupCount aria-label={`${group.roles.length} roles neste sistema`}>
        {group.roles.length}
      </GroupCount>
    </GroupHeader>
    <ItemList>
      {group.roles.map((role) => {
        const isSelected = selectedRoles.has(role.id);
        const wasOriginallyLinked = originalRoles.has(role.id);
        const isPending = isSelected !== wasOriginallyLinked;
        return (
          <ItemRow
            key={role.id}
            data-testid={`user-roles-item-${role.id}`}
            data-pending={isPending || undefined}
          >
            <Checkbox
              checked={isSelected}
              disabled={isSaving}
              onChange={(checked) => onToggle(role.id, checked)}
              aria-label={`${role.name} · ${role.code}`}
              data-testid={`user-roles-checkbox-${role.id}`}
            />
            <ItemDetails>
              <ItemTitleRow>
                <ItemPrimaryText>{role.name}</ItemPrimaryText>
                <ItemCodeChip>
                  <Mono>{role.code}</Mono>
                </ItemCodeChip>
              </ItemTitleRow>
              {role.description && (
                <ItemDescription>{role.description}</ItemDescription>
              )}
              <ItemBadges>
                {wasOriginallyLinked && (
                  <Badge variant="success" dot>
                    Vinculada
                  </Badge>
                )}
                {isPending && (
                  <Badge variant="warning">
                    {isSelected ? 'Adição pendente' : 'Remoção pendente'}
                  </Badge>
                )}
              </ItemBadges>
            </ItemDetails>
          </ItemRow>
        );
      })}
    </ItemList>
  </GroupCard>
);

/**
 * Constrói o lookup `systemId → {code,name}` a partir do envelope
 * `listSystems`. Mantido separado de `groupRolesBySystem` para que
 * a página possa reusar o mapa em outros contextos (ex.: header de
 * navegação no futuro) sem refazer o `Map`.
 */
function buildSystemsLookup(
  systems: ReadonlyArray<SystemDto>,
): ReadonlyMap<string, { code: string; name: string }> {
  const map = new Map<string, { code: string; name: string }>();
  for (const system of systems) {
    map.set(system.id, { code: system.code, name: system.name });
  }
  return map;
}

/**
 * Constrói uma chave determinística para o `data-testid` do grupo.
 * Quando `systemCode` está presente, usa o code (lê melhor); quando
 * vazio (órfão), usa "orphan" para não colidir com outros sistemas.
 */
function groupTestKey(group: RoleSystemGroup): string {
  return group.systemCode.length > 0 ? group.systemCode : 'orphan';
}

/**
 * Distingue erros de cancelamento (esperados durante navegação rápida)
 * dos erros reais de UI. Espelha o pattern de
 * `UserPermissionsShellPage`/`usePaginatedFetch`.
 */
function isFetchAborted(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (
    isApiError(error) &&
    error.kind === 'network' &&
    error.message === 'Requisição cancelada.'
  ) {
    return true;
  }
  return false;
}

/**
 * Extrai mensagem amigável de qualquer erro vindo da camada HTTP.
 * Quando o erro é um `ApiError`, devolvemos a `message` (o cliente já
 * resolveu fallbacks por status). Para erros arbitrários, usamos a
 * `fallback` em pt-BR específica do contexto.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return error.message;
  }
  return fallback;
}
