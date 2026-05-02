import { ArrowLeft, Info, Save } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";

import { PageHeader } from "../../components/layout/PageHeader";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Spinner,
  useToast,
} from "../../components/ui";
import {
  assignPermissionToRole,
  isApiError,
  listPermissions,
  listRolePermissions,
  MAX_PERMISSIONS_PAGE_SIZE,
  removePermissionFromRole,
} from "../../shared/api";
import {
  AssignmentEmptyHint,
  AssignmentEmptyShell,
  AssignmentEmptyTitle,
  AssignmentGroupCard,
  AssignmentGroupCode,
  AssignmentGroupCount,
  AssignmentGroupHeader,
  AssignmentGroupList,
  AssignmentGroupName,
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
} from "../../shared/listing";

import {
  buildInitialRolePermissionIds,
  computeRolePermissionDiff,
  groupPermissionsBySystem,
  rolePermissionDiffHasChanges,
} from "./rolePermissionsHelpers";

import type {
  PermissionId,
  PermissionSystemGroup,
  RolePermissionAssignmentFailure,
} from "./rolePermissionsHelpers";
import type { ApiClient, PermissionDto } from "../../shared/api";

/**
 * Heurística leve para descartar `:roleId`/`:systemId` claramente
 * inválidos antes de bater no backend — espelha
 * `UserPermissionsShellPage`/`RolesPage`/`RoutesPage`. Aceita qualquer
 * string não-vazia com pelo menos um caractere não-whitespace.
 */
function isProbablyValidId(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface RolePermissionsShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção,
   * omitido (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

interface FetchedState {
  permissions: ReadonlyArray<PermissionDto>;
  assigned: ReadonlyArray<string>;
}

/**
 * Distingue erros de cancelamento (esperados durante navegação rápida)
 * dos erros reais de UI. Espelha o pattern de
 * `UserPermissionsShellPage`/`usePaginatedFetch`.
 */
function isFetchAborted(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (
    isApiError(error) &&
    error.kind === "network" &&
    error.message === "Requisição cancelada."
  ) {
    return true;
  }
  return false;
}

/**
 * Extrai mensagem amigável de qualquer erro vindo da camada HTTP.
 * Quando o erro é um `ApiError`, devolvemos a `message` (o cliente já
 * resolveu fallbacks por status). Para erros arbitrários, usamos a
 * `fallback` em pt-BR específica do contexto. Espelha
 * `UserPermissionsShellPage` — mantida local em vez de promover a
 * shared porque o trecho vive em arquivos diferentes mas está abaixo
 * do limite de duplicação (≤10 linhas com diferença de copy).
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return error.message;
  }
  return fallback;
}

/**
 * Associação de permissões a uma role (Issue #69 / EPIC #47).
 *
 * Fluxo:
 *
 * 1. Carrega em paralelo `GET /permissions?systemId=...` (catálogo
 *    filtrado pelo sistema da role, lfc-authenticator#165) +
 *    `GET /roles/{roleId}/permissions` (estado atual da role).
 * 2. Inicializa o set `selectedAssigned` com as permissões já
 *    vinculadas à role.
 * 3. UI exibe lista agrupada por sistema (apenas o sistema da role,
 *    em geral); cada permissão tem um checkbox controlado e badge
 *    "Vinculada" para o estado original e badge "Adição/Remoção
 *    pendente" para mudanças não salvas.
 * 4. Salvar calcula o diff client-side e dispara
 *    `assignPermissionToRole`/`removePermissionFromRole` em paralelo.
 *    Falhas individuais não abortam o lote — agregamos um relatório
 *    via toast (idempotência cobre divergências raras).
 * 5. Após o salvar, refetch sincroniza o estado com o backend.
 *
 * **Visível com** `Roles.Update` (code `AUTH_V1_ROLES_UPDATE`,
 * espelho do gating do botão "Editar" da `RolesPage`). O gating na
 * rota é feito por `RequirePermission`. A página assume que a
 * permissão já está garantida — não duplica a checagem aqui.
 *
 * **Filtro por sistema (lfc-authenticator#163/#165):** o backend
 * agora persiste `SystemId` em `AppRole`. A UI lê `:systemId` da URL
 * `/systems/:systemId/roles/:roleId/permissoes` e filtra o catálogo
 * via `listPermissions({ systemId })`. Mostrar apenas permissões do
 * mesmo sistema da role evita confusão (não faz sentido vincular
 * uma permissão de "kurtto" a uma role do "authenticator") e alinha
 * com a regra do backend (que rejeita o assign cross-system com 400
 * "Permissão pertence a outro sistema").
 */
export const RolePermissionsShellPage: React.FC<
  RolePermissionsShellPageProps
> = ({ client }) => {
  const { systemId, roleId } = useParams<{
    systemId: string;
    roleId: string;
  }>();
  const hasValidSystemId = isProbablyValidId(systemId);
  const hasValidRoleId = isProbablyValidId(roleId);
  const hasValidIds = hasValidSystemId && hasValidRoleId;

  const toast = useToast();

  const [state, setState] = useState<{
    isInitialLoading: boolean;
    isSaving: boolean;
    errorMessage: string | null;
    fetched: FetchedState | null;
    selectedAssigned: ReadonlySet<PermissionId>;
    originalAssigned: ReadonlySet<PermissionId>;
    refetchNonce: number;
  }>({
    isInitialLoading: true,
    isSaving: false,
    errorMessage: null,
    fetched: null,
    selectedAssigned: new Set<PermissionId>(),
    originalAssigned: new Set<PermissionId>(),
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

  // Carrega catálogo + permissões da role em paralelo. Cancelamento
  // via AbortController evita race em mudanças rápidas de :roleId
  // (caller pode navegar entre roles). Dependências são apenas
  // `roleId`, `systemId`, `hasValidIds`, `client` e `refetchNonce`
  // para que rerenders disparados por toggles (estado local de
  // checkboxes) não refacam o fetch.
  useEffect(() => {
    if (!hasValidIds) {
      setState((prev) => ({ ...prev, isInitialLoading: false }));
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    lastControllerRef.current?.abort();
    lastControllerRef.current = controller;

    Promise.all([
      listPermissions(
        { systemId, pageSize: MAX_PERMISSIONS_PAGE_SIZE },
        { signal: controller.signal },
        client,
      ),
      listRolePermissions(roleId, { signal: controller.signal }, client),
    ])
      .then(([catalog, assigned]) => {
        if (cancelled) return;
        const originalAssigned = buildInitialRolePermissionIds(assigned);
        setState({
          isInitialLoading: false,
          isSaving: false,
          errorMessage: null,
          fetched: { permissions: catalog.data, assigned },
          selectedAssigned: new Set(originalAssigned),
          originalAssigned,
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
            "Falha ao carregar as permissões da role. Tente novamente.",
          ),
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, hasValidIds, roleId, systemId, state.refetchNonce]);

  const groups = useMemo<ReadonlyArray<PermissionSystemGroup>>(() => {
    if (!state.fetched) return [];
    return groupPermissionsBySystem(state.fetched.permissions);
  }, [state.fetched]);

  const diff = useMemo(
    () =>
      computeRolePermissionDiff(state.originalAssigned, state.selectedAssigned),
    [state.originalAssigned, state.selectedAssigned],
  );
  const hasUnsavedChanges = rolePermissionDiffHasChanges(diff);

  const handleTogglePermission = useCallback(
    (permissionId: PermissionId, checked: boolean) => {
      setState((prev) => {
        const next = new Set(prev.selectedAssigned);
        if (checked) {
          next.add(permissionId);
        } else {
          next.delete(permissionId);
        }
        return { ...prev, selectedAssigned: next };
      });
    },
    [],
  );

  const handleResetChanges = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedAssigned: new Set(prev.originalAssigned),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!hasValidIds || !hasUnsavedChanges || state.isSaving) {
      return;
    }
    setState((prev) => ({ ...prev, isSaving: true }));
    const failures: RolePermissionAssignmentFailure[] = [];
    let succeededAdd = 0;
    let succeededRemove = 0;

    const addOps = diff.toAdd.map(async (permissionId) => {
      try {
        await assignPermissionToRole(roleId, permissionId, undefined, client);
        succeededAdd += 1;
      } catch (error: unknown) {
        failures.push({
          permissionId,
          kind: "add",
          message: extractErrorMessage(
            error,
            "Falha ao vincular permissão. Tente novamente.",
          ),
        });
      }
    });

    const removeOps = diff.toRemove.map(async (permissionId) => {
      try {
        await removePermissionFromRole(
          roleId,
          permissionId,
          undefined,
          client,
        );
        succeededRemove += 1;
      } catch (error: unknown) {
        failures.push({
          permissionId,
          kind: "remove",
          message: extractErrorMessage(
            error,
            "Falha ao remover permissão. Tente novamente.",
          ),
        });
      }
    });

    await Promise.all([...addOps, ...removeOps]);

    if (failures.length === 0) {
      const totalApplied = succeededAdd + succeededRemove;
      toast.show(
        totalApplied === 1
          ? "1 alteração de permissão aplicada com sucesso."
          : `${totalApplied} alterações de permissões aplicadas com sucesso.`,
        { variant: "success", title: "Permissões atualizadas" },
      );
    } else {
      const totalApplied = succeededAdd + succeededRemove;
      const failedCount = failures.length;
      toast.show(
        `${failedCount} alteração(ões) falharam${
          totalApplied > 0 ? `, ${totalApplied} aplicada(s)` : ""
        }. Revise e tente novamente.`,
        { variant: "warning", title: "Algumas atualizações falharam" },
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
  }, [
    client,
    diff,
    hasUnsavedChanges,
    hasValidIds,
    roleId,
    state.isSaving,
    toast,
  ]);

  if (!hasValidIds) {
    return (
      <>
        <BackLink to="/systems" data-testid="role-permissions-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Sistemas
        </BackLink>
        <PageHeader
          eyebrow="03 Roles · Permissões"
          title="Permissões da role"
          desc="Selecione um sistema e uma role para gerenciar permissões vinculadas."
        />
        <InvalidIdNotice data-testid="role-permissions-invalid-id">
          <Alert variant="warning">
            ID de sistema ou de role ausente/inválido na URL. Volte para a
            listagem de roles e selecione uma role para gerenciar suas
            permissões.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return (
    <>
      <BackLink
        to={`/systems/${systemId}/roles`}
        data-testid="role-permissions-back"
      >
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para Roles do sistema
      </BackLink>
      <PageHeader
        eyebrow="03 Roles · Permissões"
        title="Permissões da role"
        desc="Vincule ou desvincule permissões à role selecionada. Apenas permissões pertencentes ao mesmo sistema da role são listadas — alterações entram em vigor imediatamente após salvar."
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={handleResetChanges}
              disabled={!hasUnsavedChanges || state.isSaving}
              data-testid="role-permissions-reset"
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
              data-testid="role-permissions-save"
            >
              Salvar alterações
              {hasUnsavedChanges && (
                <AssignmentSaveCounter
                  aria-label={`${
                    diff.toAdd.length + diff.toRemove.length
                  } alterações pendentes`}
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
        aria-label="Legenda dos vínculos da role"
      >
        <AssignmentLegendItem>
          <Badge variant="success" dot>
            Vinculada
          </Badge>
          <AssignmentLegendCopy>
            permissão atualmente vinculada à role.
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
        <AssignmentLegendItem>
          <Badge variant="warning">Pendente</Badge>
          <AssignmentLegendCopy>
            alteração ainda não persistida (clique em Salvar).
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
      </AssignmentLegendBar>

      {state.isInitialLoading && (
        <AssignmentLoadingShell
          data-testid="role-permissions-loading"
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
          retryTestId="role-permissions-retry"
        />
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length === 0 && (
        <AssignmentEmptyShell data-testid="role-permissions-empty">
          <Info size={20} strokeWidth={1.5} aria-hidden="true" />
          <AssignmentEmptyTitle>
            Nenhuma permissão cadastrada para este sistema.
          </AssignmentEmptyTitle>
          <AssignmentEmptyHint>
            Cadastre permissões na seção Permissões antes de vincular a uma
            role do sistema.
          </AssignmentEmptyHint>
        </AssignmentEmptyShell>
      )}

      {!state.isInitialLoading && !state.errorMessage && groups.length > 0 && (
        <AssignmentGroupList aria-label="Permissões disponíveis para vincular à role">
          {groups.map((group) => (
            <PermissionGroup
              key={group.systemId || group.systemCode}
              group={group}
              selectedAssigned={state.selectedAssigned}
              originalAssigned={state.originalAssigned}
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
  selectedAssigned: ReadonlySet<PermissionId>;
  originalAssigned: ReadonlySet<PermissionId>;
  isSaving: boolean;
  onToggle: (permissionId: PermissionId, checked: boolean) => void;
}

const PermissionGroup: React.FC<PermissionGroupProps> = ({
  group,
  selectedAssigned,
  originalAssigned,
  isSaving,
  onToggle,
}) => (
  <AssignmentGroupCard
    data-testid={`role-permissions-group-${group.systemCode}`}
  >
    <AssignmentGroupHeader>
      <AssignmentGroupCode>{group.systemCode}</AssignmentGroupCode>
      <AssignmentGroupName>{group.systemName}</AssignmentGroupName>
      <AssignmentGroupCount
        aria-label={`${group.permissions.length} permissões neste sistema`}
      >
        {group.permissions.length}
      </AssignmentGroupCount>
    </AssignmentGroupHeader>
    <AssignmentItemList>
      {group.permissions.map((perm) => {
        const isSelected = selectedAssigned.has(perm.id);
        const wasOriginallyAssigned = originalAssigned.has(perm.id);
        const isPending = isSelected !== wasOriginallyAssigned;
        return (
          <AssignmentItemRow
            key={perm.id}
            data-testid={`role-permissions-item-${perm.id}`}
            data-pending={isPending || undefined}
          >
            <Checkbox
              checked={isSelected}
              disabled={isSaving}
              onChange={(checked) => onToggle(perm.id, checked)}
              aria-label={`${perm.routeName || perm.routeCode} · ${
                perm.permissionTypeName || perm.permissionTypeCode
              }`}
              data-testid={`role-permissions-checkbox-${perm.id}`}
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
                <Mono>{perm.routeCode || "—"}</Mono>
                {perm.description && (
                  <AssignmentItemDescription>
                    {perm.description}
                  </AssignmentItemDescription>
                )}
              </AssignmentItemMetaRow>
              <AssignmentItemBadges>
                {wasOriginallyAssigned && (
                  <Badge variant="success" dot>
                    Vinculada
                  </Badge>
                )}
                {isPending && (
                  <Badge variant="warning">
                    {isSelected ? "Adição pendente" : "Remoção pendente"}
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
