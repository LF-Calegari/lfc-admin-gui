import { ArrowLeft, Info, Save } from 'lucide-react';
import React from 'react';

import { PageHeader } from '../../components/layout/PageHeader';
import { Alert, Button, Spinner } from '../../components/ui';

import {
  EmptyHint as AssignmentEmptyHint,
  EmptyShell as AssignmentEmptyShell,
  EmptyTitle as AssignmentEmptyTitle,
  GroupList as AssignmentGroupList,
  LegendBar as AssignmentLegendBar,
  LoadingCopy as AssignmentLoadingCopy,
  LoadingShell as AssignmentLoadingShell,
  SaveCounter as AssignmentSaveCounter,
} from './AssignmentMatrixStyles';
import { ErrorRetryBlock } from './ErrorRetryBlock';
import { BackLink, InvalidIdNotice } from './styles';

/**
 * Shell de página para "matriz de atribuição via checkbox" — header,
 * legenda, botões de salvar/descartar, estados de loading/error/empty,
 * e wrapper da lista de grupos. Compartilhado por:
 *
 * - `UserPermissionsShellPage` (Issue #70 — atribuição direta de
 *   permissões a um usuário).
 * - `UserRolesShellPage` (Issue #71 — atribuição via role a um
 *   usuário).
 * - `RolePermissionsShellPage` (Issue #69 — associação de permissões
 *   a uma role).
 *
 * **Por que existe:** as três páginas compartilhavam mais de 80
 * linhas idênticas de JSX (BackLink, PageHeader com botões, legend
 * bar, loading/error/empty shells, group list wrapper). JSCPD
 * tokeniza esse JSX como bloco duplicado; centralizar aqui evita
 * a regressão Sonar (lições PR #134/#135 — quando dois call-sites
 * passam configs idênticas para o mesmo helper, o call-site vira
 * candidato a hook/componente próprio).
 *
 * **API:** o caller injeta apenas o que difere entre as três telas:
 *
 * - Cabeçalho (`eyebrow`, `title`, `desc`, `backLink`).
 * - Legenda (`legend` — `<AssignmentLegendItem>` em ReactNode).
 * - Estado de UI (`isInitialLoading`, `errorMessage`, `isEmpty`,
 *   `isSaving`, `hasUnsavedChanges`, `pendingCount`, `groups`).
 * - Handlers (`onReset`, `onSave`, `onRetry`).
 * - Test IDs (`testIdPrefix`).
 * - Render do grupo (`renderGroup`).
 * - Cópias específicas do recurso (`emptyTitle`, `emptyHint`,
 *   `loadingCopy`, `groupsAriaLabel`, `legendAriaLabel`).
 *
 * O wrapper `<>...</>` do React lida com o caso `:id` inválido — a
 * decisão é do caller via `invalidIdMessage`.
 */
export interface AssignmentMatrixShellProps<TGroup> {
  /** Eyebrow do PageHeader (numeração + seção). */
  eyebrow: string;
  /** Título do PageHeader. */
  title: string;
  /** Descrição do PageHeader (suporta múltiplas linhas). */
  desc: string;
  /** Configuração do BackLink (rota + label). */
  backLink: {
    to: string;
    label: string;
  };
  /**
   * Quando definido, renderiza apenas o aviso "id inválido" em vez
   * do conteúdo principal — o caller controla a heurística (`useParams`
   * + validação de UUID).
   */
  invalidIdMessage?: string;
  /** Conteúdo da legenda (badges + descrições). */
  legend: React.ReactNode;
  /** aria-label da `LegendBar` para leitores de tela. */
  legendAriaLabel: string;
  /** aria-label da `GroupList` para leitores de tela. */
  groupsAriaLabel: string;
  /** Estado isInitialLoading do fetch. */
  isInitialLoading: boolean;
  /** Mensagem de erro (quando fetch falha) ou `null` em sucesso. */
  errorMessage: string | null;
  /** Flag isEmpty (quando catálogo vem vazio). */
  isEmpty: boolean;
  /** Estado isSaving (durante mutações de save). */
  isSaving: boolean;
  /** Existe ao menos uma alteração não salva? */
  hasUnsavedChanges: boolean;
  /** Quantidade de alterações pendentes (exibida no contador). */
  pendingCount: number;
  /** Grupos a renderizar quando state está em sucesso. */
  groups: ReadonlyArray<TGroup>;
  /** Callback do botão "Descartar alterações". */
  onReset: () => void;
  /** Callback do botão "Salvar alterações" (assíncrono). */
  onSave: () => void;
  /** Callback do botão "Tentar novamente" no estado de erro. */
  onRetry: () => void;
  /** Texto do título do estado vazio. */
  emptyTitle: string;
  /** Texto da dica do estado vazio. */
  emptyHint: string;
  /** Mensagem do estado de loading. */
  loadingCopy: string;
  /** Render prop para um grupo individual. */
  renderGroup: (group: TGroup) => React.ReactNode;
  /** Prefixo dos `data-testid` (ex.: 'user-permissions', 'user-roles'). */
  testIdPrefix: string;
}

/**
 * Renderiza a estrutura completa da página de atribuição (matriz de
 * checkboxes agrupada por sistema). Genérico em `TGroup` — caller
 * passa o tipo do grupo (`PermissionSystemGroup`/`RoleSystemGroup`/
 * etc) e o render-prop correspondente.
 */
export function AssignmentMatrixShell<TGroup>(
  props: AssignmentMatrixShellProps<TGroup>,
): React.ReactElement {
  const {
    eyebrow,
    title,
    desc,
    backLink,
    invalidIdMessage,
    legend,
    legendAriaLabel,
    groupsAriaLabel,
    isInitialLoading,
    errorMessage,
    isEmpty,
    isSaving,
    hasUnsavedChanges,
    pendingCount,
    groups,
    onReset,
    onSave,
    onRetry,
    emptyTitle,
    emptyHint,
    loadingCopy,
    renderGroup,
    testIdPrefix,
  } = props;

  if (invalidIdMessage) {
    return (
      <>
        <BackLink to={backLink.to} data-testid={`${testIdPrefix}-back`}>
          <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
          {backLink.label}
        </BackLink>
        <PageHeader eyebrow={eyebrow} title={title} desc={desc} />
        <InvalidIdNotice data-testid={`${testIdPrefix}-invalid-id`}>
          <Alert variant="warning">{invalidIdMessage}</Alert>
        </InvalidIdNotice>
      </>
    );
  }

  return (
    <>
      <BackLink to={backLink.to} data-testid={`${testIdPrefix}-back`}>
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        {backLink.label}
      </BackLink>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        desc={desc}
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={onReset}
              disabled={!hasUnsavedChanges || isSaving}
              data-testid={`${testIdPrefix}-reset`}
            >
              Descartar alterações
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Save size={14} aria-hidden="true" />}
              loading={isSaving}
              disabled={!hasUnsavedChanges}
              onClick={onSave}
              data-testid={`${testIdPrefix}-save`}
            >
              Salvar alterações
              {hasUnsavedChanges && (
                <AssignmentSaveCounter
                  aria-label={`${pendingCount} alterações pendentes`}
                >
                  {pendingCount}
                </AssignmentSaveCounter>
              )}
            </Button>
          </>
        }
      />

      <AssignmentLegendBar role="note" aria-label={legendAriaLabel}>
        {legend}
      </AssignmentLegendBar>

      {isInitialLoading && (
        <AssignmentLoadingShell
          data-testid={`${testIdPrefix}-loading`}
          aria-live="polite"
        >
          <Spinner size="md" tone="accent" />
          <AssignmentLoadingCopy>{loadingCopy}</AssignmentLoadingCopy>
        </AssignmentLoadingShell>
      )}

      {!isInitialLoading && errorMessage && (
        <ErrorRetryBlock
          message={errorMessage}
          onRetry={onRetry}
          retryTestId={`${testIdPrefix}-retry`}
        />
      )}

      {!isInitialLoading && !errorMessage && isEmpty && (
        <AssignmentEmptyShell data-testid={`${testIdPrefix}-empty`}>
          <Info size={20} strokeWidth={1.5} aria-hidden="true" />
          <AssignmentEmptyTitle>{emptyTitle}</AssignmentEmptyTitle>
          <AssignmentEmptyHint>{emptyHint}</AssignmentEmptyHint>
        </AssignmentEmptyShell>
      )}

      {!isInitialLoading && !errorMessage && !isEmpty && (
        <AssignmentGroupList aria-label={groupsAriaLabel}>
          {groups.map((group) => renderGroup(group))}
        </AssignmentGroupList>
      )}
    </>
  );
}
