import { ArrowLeft, Info, Save } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '../../components/layout/PageHeader';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Spinner,
  useToast,
} from '../../components/ui';
import {
  assignPermissionToUser,
  extractErrorMessage,
  isFetchAborted,
  listEffectiveUserPermissions,
  listPermissions,
  MAX_PERMISSIONS_PAGE_SIZE,
  removePermissionFromUser,
} from '../../shared/api';
import {
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
  AssignmentItemMetaRow,
  AssignmentItemPrimaryText,
  AssignmentItemRow,
  AssignmentItemTitleRow,
  AssignmentLegendBar,
  AssignmentLegendCopy,
  AssignmentLegendItem,
  AssignmentLoadingCopy,
  AssignmentLoadingShell,
  AssignmentSaveCounter,
  BackLink,
  ErrorRetryBlock,
  InvalidIdNotice,
  Mono,
} from '../../shared/listing';

import {
  buildInitialDirectPermissionIds,
  buildRoleMembershipsByPermission,
  computeAssignmentDiff,
  diffHasChanges,
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

interface FetchedState {
  permissions: ReadonlyArray<PermissionDto>;
  effective: ReadonlyArray<EffectivePermissionDto>;
}

/**
 * Atribuição direta de permissões a um usuário (Issue #70 / EPIC #48).
 *
 * Fluxo:
 *
 * 1. Carrega em paralelo `GET /permissions` (catálogo) +
 *    `GET /users/{id}/effective-permissions` (estado atual do usuário).
 * 2. Inicializa o set `selectedDirect` com as permissões cujo `sources`
 *    contém `kind === 'direct'`.
 * 3. UI exibe lista agrupada por sistema; cada permissão tem um
 *    checkbox controlado e badges visuais ("Direta" / "Herdada via
 *    Admin, Viewer").
 * 4. Salvar calcula o diff client-side e dispara
 *    `assignPermissionToUser`/`removePermissionFromUser` em paralelo.
 *    Falhas individuais não abortam o lote — agregamos um relatório.
 * 5. Após o salvar, refetch do `effective-permissions` sincroniza o
 *    estado com o backend (idempotência cobre divergências raras).
 *
 * **Visível com** `Permissions.Read` + `Users.Update`. O gating na
 * rota é feito por `RequirePermission` aninhado (ver
 * `src/routes/index.tsx`). A página assume que ambas as permissões
 * já estão garantidas — não duplica a checagem aqui.
 */
export const UserPermissionsShellPage: React.FC<UserPermissionsShellPageProps> = ({
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
    selectedDirect: ReadonlySet<string>;
    originalDirect: ReadonlySet<string>;
    refetchNonce: number;
  }>({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    selectedDirect: new Set<string>(),
    originalDirect: new Set<string>(),
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

  // Carrega catálogo + permissões efetivas em paralelo. Cancelamento
  // via AbortController evita race em mudanças rápidas de :id (caller
  // pode navegar entre usuários). Dependências são apenas `userId`,
  // `hasValidUserId`, `client` e `refetchNonce` para que rerenders
  // disparados por `setSelectedDirect` (estado local de checkboxes)
  // não refacam o fetch.
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
        setState({
          isInitialLoading: false,
          isSaving: false,
          errorMessage: null,
          fetched: { permissions: catalog.data, effective },
          selectedDirect: new Set(originalDirect),
          originalDirect,
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
            'Falha ao carregar as permissões do usuário. Tente novamente.',
          ),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, hasValidUserId, userId, state.refetchNonce]);

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
    if (!hasValidUserId || !hasUnsavedChanges || state.isSaving) {
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
          message: extractErrorMessage(
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
          message: extractErrorMessage(
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
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={handleResetChanges}
              disabled={!hasUnsavedChanges || state.isSaving}
              data-testid="user-permissions-reset"
            >
              Descartar alterações
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Save size={14} aria-hidden="true" />}
              loading={state.isSaving}
              disabled={!hasUnsavedChanges}
              onClick={handleSave}
              data-testid="user-permissions-save"
            >
              Salvar alterações
              {hasUnsavedChanges && (
                <AssignmentSaveCounter
                  aria-label={`${diff.toAdd.length + diff.toRemove.length} alterações pendentes`}
                >
                  {diff.toAdd.length + diff.toRemove.length}
                </AssignmentSaveCounter>
              )}
            </Button>
          </>
        }
      />

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
        <AssignmentLoadingShell
          data-testid="user-permissions-loading"
          aria-live="polite"
        >
          <Spinner size="md" tone="accent" />
          <AssignmentLoadingCopy>Carregando permissões…</AssignmentLoadingCopy>
        </AssignmentLoadingShell>
      )}

      {!state.isInitialLoading && state.errorMessage && (
        <ErrorRetryBlock
          message={state.errorMessage}
          onRetry={handleRefetch}
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
            Cadastre permissões na seção Permissões antes de atribuir
            diretamente a um usuário.
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
              aria-label={`${perm.routeName || perm.routeCode} · ${perm.permissionTypeName || perm.permissionTypeCode}`}
              data-testid={`user-permissions-checkbox-${perm.id}`}
            />
            <AssignmentItemDetails>
              <AssignmentItemTitleRow>
                <AssignmentItemPrimaryText>
                  {perm.routeName || perm.routeCode}
                </AssignmentItemPrimaryText>
                <AssignmentItemCodeChip>
                  <Mono>{perm.permissionTypeCode}</Mono>
                </AssignmentItemCodeChip>
              </AssignmentItemTitleRow>
              <AssignmentItemMetaRow>
                <Mono>{perm.routeCode || '—'}</Mono>
                {perm.description && (
                  <AssignmentItemDescription>
                    {perm.description}
                  </AssignmentItemDescription>
                )}
              </AssignmentItemMetaRow>
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


