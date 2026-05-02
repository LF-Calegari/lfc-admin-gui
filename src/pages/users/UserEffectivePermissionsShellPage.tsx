import { ArrowLeft, Info } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, Badge, Select, Spinner } from '../../components/ui';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import { listEffectiveUserPermissions } from '../../shared/api';
import {
  AssignmentEmptyHint,
  AssignmentEmptyShell,
  AssignmentEmptyTitle,
  AssignmentGroupCard,
  AssignmentGroupHeaderRow,
  AssignmentGroupList,
  AssignmentItemBadges,
  AssignmentItemCodeChip,
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
  BackLink,
  ErrorRetryBlock,
  InvalidIdNotice,
  Mono,
} from '../../shared/listing';

import {
  breakdownPermissionOrigin,
  deriveSystemOptionsFromEffective,
  groupEffectivePermissionsBySystem,
} from './userEffectivePermissionsHelpers';

import type {
  EffectivePermissionRoleSource,
  EffectivePermissionSystemGroup,
  EffectivePermissionSystemOption,
} from './userEffectivePermissionsHelpers';
import type { ApiClient, EffectivePermissionDto } from '../../shared/api';

/**
 * Heurística leve para descartar `:id` claramente inválido antes de
 * bater no backend — espelha `UserPermissionsShellPage`/
 * `UserRolesShellPage`. Aceita qualquer string não-vazia com pelo menos
 * um caractere não-whitespace.
 */
function isProbablyValidUserId(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valor especial do `<Select>` que representa "sem filtro" (mostrar
 * permissões de todos os sistemas). Mantemos como constante para que o
 * comparador (`selectedSystemId === ALL_SYSTEMS_OPTION_VALUE`) seja
 * explícito e o teste possa importar a constante em vez de duplicar
 * o literal.
 */
export const ALL_SYSTEMS_OPTION_VALUE = '__all__';

interface UserEffectivePermissionsShellPageProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido
   * (cada wrapper de API usa o singleton `apiClient`).
   */
  client?: ApiClient;
}

/**
 * Painel **read-only** consolidado das permissões efetivas de um
 * usuário (Issue #72 / EPIC #48).
 *
 * Conceito: enquanto a `UserPermissionsShellPage` (Issue #70) edita
 * apenas vínculos diretos e a `UserRolesShellPage` (Issue #71) edita
 * apenas vínculos via role, esta página **mostra a união consolidada**
 * — uma única lista agrupada por sistema com badges de origem por
 * permissão. Sem checkbox, sem botão "Salvar"; o operador entende o
 * impacto efetivo das atribuições e, se quiser alterar, navega para a
 * tela dedicada (link no header e backlink padrão).
 *
 * Fluxo:
 *
 * 1. Carrega `GET /users/{id}/effective-permissions` via
 *    `useSingleFetchWithAbort` (sem filtro no primeiro fetch).
 * 2. Deriva a lista de sistemas únicos do payload (cache em
 *    `cachedSystemOptions`) para popular o `<Select>` de filtro —
 *    apenas sistemas com permissões efetivas aparecem como opção,
 *    reduzindo ruído no dropdown. O cache é preservado entre filtros
 *    para que o operador possa voltar para "Todos" ou trocar de
 *    sistema sem que a lista de opções encolha.
 * 3. Quando o operador escolhe um sistema, o `useCallback` do `fetcher`
 *    muda de identidade e o hook refaz a request com `?systemId=`
 *    (server-side filtering — alinhado com o contrato do backend).
 * 4. Renderiza grupos por sistema; cada permissão exibe a badge "Direta"
 *    (variant success) e/ou uma badge "Role: <Nome>" por origem `role`.
 *
 * **Visível com** `Permissions.Read` + `Users.Read`. O gating
 * client-side fica na rota (`RequirePermission` aninhado em
 * `src/routes/index.tsx`); a página assume que ambas as permissões já
 * estão garantidas — não duplica a checagem aqui.
 *
 * **Reuso (lições PR #134/#135):** primitivos visuais
 * (`AssignmentLegendBar`, `AssignmentGroupCard`, `AssignmentItemRow`,
 * `AssignmentGroupHeaderRow`) vêm de `src/shared/listing/`,
 * compartilhados com Issue #69/#70/#71. Orquestração de fetch
 * (cancelamento + handleRefetch + state de loading/error) vem de
 * `useSingleFetchWithAbort` em `src/hooks/`. Não usamos
 * `AssignmentMatrixShell` porque ele inclui Save/Reset/contador —
 * elementos exclusivos das telas de mutação. Esta página tem layout
 * próprio (header sem actions, sem legenda Pendente, lista mais
 * enxuta).
 */
export const UserEffectivePermissionsShellPage: React.FC<
  UserEffectivePermissionsShellPageProps
> = ({ client }) => {
  const { id: userId } = useParams<{ id: string }>();
  const hasValidUserId = isProbablyValidUserId(userId);

  const [selectedSystemId, setSelectedSystemId] = useState<string>(
    ALL_SYSTEMS_OPTION_VALUE,
  );

  // Cache da lista de sistemas únicos derivada do **primeiro** fetch
  // sem filtro — preservada para que o `<Select>` continue mostrando
  // todos os sistemas mesmo depois de o operador filtrar (escolher
  // "Authenticator" não deveria esconder "Kurtto" do dropdown).
  // Usamos `useRef` em vez de `useState` para preservar o cache sem
  // disparar render extra: o cache é atualizado durante o `useMemo`
  // de `systemOptions` (derivação síncrona), então `Select` aparece
  // no mesmo render em que `effectiveData` chega.
  const cachedSystemOptionsRef = useRef<
    ReadonlyArray<EffectivePermissionSystemOption> | null
  >(null);

  const handleSystemChange = useCallback((value: string) => {
    setSelectedSystemId(value);
  }, []);

  // Fetcher memoizado — depende apenas do `userId`, do filtro e do
  // `client` injetado. O hook `useSingleFetchWithAbort` reage a
  // mudanças na identidade do fetcher para reexecutar.
  const fetcher = useCallback(
    (options: { signal?: AbortSignal }) => {
      const requestedSystemId =
        selectedSystemId === ALL_SYSTEMS_OPTION_VALUE ? undefined : selectedSystemId;
      return listEffectiveUserPermissions(
        userId ?? '',
        requestedSystemId,
        options,
        client,
      );
    },
    [client, selectedSystemId, userId],
  );

  const {
    data: effectiveData,
    isInitialLoading,
    errorMessage,
    refetch: handleRefetch,
  } = useSingleFetchWithAbort<ReadonlyArray<EffectivePermissionDto>>({
    fetcher,
    fallbackErrorMessage:
      'Falha ao carregar as permissões efetivas. Tente novamente.',
    skip: !hasValidUserId,
  });

  // Deriva `systemOptions` síncrono ao render: quando `effectiveData`
  // chega pela primeira vez (cache `null`), popula a ref com a lista de
  // sistemas únicos e devolve essa lista. Filtros subsequentes NÃO
  // recalculam — preservam o cache para que o operador possa voltar
  // para "Todos os sistemas" sem perder opções do dropdown.
  const systemOptions = useMemo<
    ReadonlyArray<EffectivePermissionSystemOption>
  >(() => {
    if (cachedSystemOptionsRef.current !== null) {
      return cachedSystemOptionsRef.current;
    }
    if (!effectiveData) {
      return [];
    }
    const derived = deriveSystemOptionsFromEffective(effectiveData);
    cachedSystemOptionsRef.current = derived;
    return derived;
  }, [effectiveData]);

  const groups = useMemo<ReadonlyArray<EffectivePermissionSystemGroup>>(() => {
    if (!effectiveData) return [];
    return groupEffectivePermissionsBySystem(effectiveData);
  }, [effectiveData]);

  if (!hasValidUserId) {
    return (
      <>
        <BackLink to="/usuarios" data-testid="user-effective-permissions-back">
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          Voltar para Usuários
        </BackLink>
        <PageHeader
          eyebrow="06 Usuários · Permissões efetivas"
          title="Permissões efetivas"
          desc="Selecione um usuário para visualizar suas permissões efetivas."
        />
        <InvalidIdNotice data-testid="user-effective-permissions-invalid-id">
          <Alert variant="warning">
            ID de usuário ausente ou inválido na URL. Volte para a listagem de
            usuários e selecione um para visualizar as permissões efetivas.
          </Alert>
        </InvalidIdNotice>
      </>
    );
  }

  const hasSystemOptions = systemOptions.length > 0;

  return (
    <>
      <BackLink
        to={`/usuarios/${userId}`}
        data-testid="user-effective-permissions-back"
      >
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para o usuário
      </BackLink>
      <PageHeader
        eyebrow="06 Usuários · Permissões efetivas"
        title="Permissões efetivas"
        desc="Painel consolidado, somente leitura, com todas as permissões efetivas do usuário (diretas e herdadas via roles). Para alterar atribuições, use as telas dedicadas de Permissões e Roles do usuário."
      />

      <AssignmentLegendBar
        role="note"
        aria-label="Legenda de origem das permissões efetivas"
      >
        <AssignmentLegendItem>
          <Badge variant="success" dot>
            Direta
          </Badge>
          <AssignmentLegendCopy>
            vínculo direto entre o usuário e a permissão.
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
        <AssignmentLegendItem>
          <Badge variant="info" dot>
            Role
          </Badge>
          <AssignmentLegendCopy>
            permissão herdada via uma role atribuída ao usuário.
          </AssignmentLegendCopy>
        </AssignmentLegendItem>
      </AssignmentLegendBar>

      {hasSystemOptions && (
        <FilterRow data-testid="user-effective-permissions-filter">
          <Select
            label="Filtrar por sistema"
            size="sm"
            value={selectedSystemId}
            onChange={handleSystemChange}
            data-testid="user-effective-permissions-system-select"
            aria-label="Filtrar permissões efetivas por sistema"
          >
            <option value={ALL_SYSTEMS_OPTION_VALUE}>Todos os sistemas</option>
            {systemOptions.map((option) => (
              <option key={option.systemId} value={option.systemId}>
                {option.systemName} ({option.systemCode})
              </option>
            ))}
          </Select>
        </FilterRow>
      )}

      {isInitialLoading && (
        <AssignmentLoadingShell
          data-testid="user-effective-permissions-loading"
          aria-live="polite"
        >
          <Spinner size="md" tone="accent" />
          <AssignmentLoadingCopy>
            Carregando permissões efetivas…
          </AssignmentLoadingCopy>
        </AssignmentLoadingShell>
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={handleRefetch}
          retryTestId="user-effective-permissions-retry"
        />
      )}

      {!isInitialLoading && !errorMessage && groups.length === 0 && (
        <AssignmentEmptyShell data-testid="user-effective-permissions-empty">
          <Info size={20} strokeWidth={1.5} aria-hidden="true" />
          <AssignmentEmptyTitle>
            Nenhuma permissão efetiva para este usuário.
          </AssignmentEmptyTitle>
          <AssignmentEmptyHint>
            Atribua permissões diretamente ao usuário ou vincule-o a roles
            que contenham permissões.
          </AssignmentEmptyHint>
        </AssignmentEmptyShell>
      )}

      {!isInitialLoading && !errorMessage && groups.length > 0 && (
        <AssignmentGroupList aria-label="Permissões efetivas agrupadas por sistema">
          {groups.map((group) => (
            <EffectivePermissionGroup
              key={group.systemId || group.systemCode}
              group={group}
            />
          ))}
        </AssignmentGroupList>
      )}
    </>
  );
};

interface EffectivePermissionGroupProps {
  group: EffectivePermissionSystemGroup;
}

const EffectivePermissionGroup: React.FC<EffectivePermissionGroupProps> = ({
  group,
}) => (
  <AssignmentGroupCard
    data-testid={`user-effective-permissions-group-${group.systemCode}`}
  >
    <AssignmentGroupHeaderRow
      systemCode={group.systemCode}
      systemName={group.systemName}
      count={group.permissions.length}
      countAriaLabel={`${group.permissions.length} permissões efetivas neste sistema`}
    />
    <AssignmentItemList>
      {group.permissions.map((perm) => (
        <EffectivePermissionItem key={perm.permissionId} permission={perm} />
      ))}
    </AssignmentItemList>
  </AssignmentGroupCard>
);

interface EffectivePermissionItemProps {
  permission: EffectivePermissionDto;
}

const EffectivePermissionItem: React.FC<EffectivePermissionItemProps> = ({
  permission,
}) => {
  const breakdown = useMemo(
    () => breakdownPermissionOrigin(permission.sources),
    [permission.sources],
  );
  return (
    <AssignmentItemRow
      data-testid={`user-effective-permissions-item-${permission.permissionId}`}
    >
      <AssignmentItemDetails>
        <AssignmentItemTitleRow>
          <AssignmentItemPrimaryText>
            {permission.routeName || permission.routeCode}
          </AssignmentItemPrimaryText>
          <AssignmentItemCodeChip>
            <Mono>{permission.permissionTypeCode}</Mono>
          </AssignmentItemCodeChip>
        </AssignmentItemTitleRow>
        <AssignmentItemMetaRow>
          <Mono>{permission.routeCode || '—'}</Mono>
        </AssignmentItemMetaRow>
        <AssignmentItemBadges>
          {breakdown.isDirect && (
            <Badge variant="success" dot>
              Direta
            </Badge>
          )}
          {breakdown.roles.map((role) => (
            <RoleOriginBadge key={role.roleId} role={role} />
          ))}
        </AssignmentItemBadges>
      </AssignmentItemDetails>
    </AssignmentItemRow>
  );
};

interface RoleOriginBadgeProps {
  role: EffectivePermissionRoleSource;
}

/**
 * Badge dedicada para origem `role` — cada role contribuinte gera uma
 * badge "Role: <Nome>" individual. Mantemos componente próprio (em vez
 * de inline) para preservar uma `key` React estável (`role.roleId`) e
 * isolar a copy "Role: <Nome>" em uma fonte única — qualquer mudança
 * de microcopy fica num único ponto, e os testes podem validar a copy
 * por `getByText(/^Role:/)` sem depender da estrutura interna do
 * componente `<Badge>`.
 */
const RoleOriginBadge: React.FC<RoleOriginBadgeProps> = ({ role }) => (
  <Badge variant="info" dot>
    Role: {role.roleName}
  </Badge>
);

/**
 * Linha do filtro — wrapper que limita a largura do `<Select>` para que
 * ele não ocupe toda a página em desktop. Margin-bottom para separar
 * visualmente da lista de grupos. Mantemos local porque o pattern é
 * exclusivo desta página (a `ListingToolbar` é específica das tabelas
 * com Search + Switch, não se encaixa em filtro single-select read-only).
 */
const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: flex-end;
  margin-bottom: var(--space-5);

  & > * {
    min-width: 240px;
    max-width: 360px;
  }
`;
