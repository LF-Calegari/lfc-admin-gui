// Issue #146 — aba "Emails extras" do `ClientEditPage`. Espelha o
// pattern de `ClientPhonesTab` (#147) reusando os componentes/hooks
// compartilhados em `clientCollection*` para deduplicar a estrutura.
import { Mail, Plus } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import {
  Alert,
  Button,
  Icon,
  useToast,
} from '../../components/ui';
import {
  addClientExtraEmail,
  MAX_CLIENT_EXTRA_EMAILS,
  removeClientExtraEmail,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import { ErrorRetryBlock, InitialLoadingSpinner } from '../../shared/listing';

// Componentes shared das abas de coleção (extraídos em #147 para
// reuso entre #146 e #147 — lição PR #128/#134/#135).
import { ClientCollectionAddInputModal } from './ClientCollectionAddInputModal';
import { ClientCollectionListRow } from './ClientCollectionListRow';
import { ClientCollectionRemoveConfirmModal } from './ClientCollectionRemoveConfirmModal';
import {
  Counter,
  EmptyHint,
  EmptyShell,
  EmptyTitle,
  ListContainer,
  ListHeader,
  TabHeading,
  TabIntro,
  TabSection,
} from './clientCollectionTabStyles';
import {
  classifyAddExtraEmailError,
  classifyRemoveExtraEmailError,
  EXTRA_EMAIL_MAX,
  validateExtraEmailInput,
  type ExtraEmailErrorCopy,
} from './clientExtraEmailsHelpers';
import { useClientAddCollectionModal } from './useClientAddCollectionModal';
import { useClientByIdFetch } from './useClientByIdFetch';
import { useClientCollectionAddSubmit } from './useClientCollectionAddSubmit';
import { useClientCollectionRemoveSubmit } from './useClientCollectionRemoveSubmit';
import { useClientRemoveCollectionConfirm } from './useClientRemoveCollectionConfirm';

import type { ApiClient, ClientEmailDto } from '../../shared/api';

/**
 * Code de permissão exigido para mutações no tab (Issue #146).
 *
 * Espelha o `AUTH_V1_CLIENTS_UPDATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`POST/DELETE /clients/{id}/emails*` rodam
 * `[Authorize(Policy = PermissionPolicies.ClientsUpdate)]`); o gating
 * client-side é apenas UX — esconder os botões "Adicionar"/"Remover"
 * quando o operador não pode persistir é mais claro do que deixar o
 * submit cair em 401/403.
 */
const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

/**
 * Cópia textual injetada nas funções `classify*ExtraEmailError`.
 * Centralizada para que asserts de teste e renderização compartilhem
 * uma fonte de verdade — qualquer ajuste de copy acontece em uma
 * referência só.
 */
const ADD_ERROR_COPY: ExtraEmailErrorCopy = {
  genericFallback: 'Não foi possível adicionar o email. Tente novamente.',
  forbiddenTitle: 'Falha ao adicionar email',
  notFoundMessage:
    'Cliente não encontrado ou foi removido. A página foi atualizada.',
};

const REMOVE_ERROR_COPY: ExtraEmailErrorCopy = {
  genericFallback: 'Não foi possível remover o email. Tente novamente.',
  forbiddenTitle: 'Falha ao remover email',
  notFoundMessage:
    'Email extra já havia sido removido. A lista foi atualizada.',
};

/**
 * Mensagem amigável exibida no `ErrorRetryBlock` quando o fetch
 * inicial do cliente falha (rede, parse, 401/403, etc.).
 */
const FETCH_ERROR_MESSAGE = 'Não foi possível carregar os dados do cliente.';

/**
 * Estilos da aba são compartilhados em `clientCollectionTabStyles.ts`
 * com `ClientPhonesTab` (Issue #147 — paridade com #146). Linha
 * (`ListRow`/`ListContainer`/`ListRowLeft`/`ListRowValue`) e shell de
 * empty state (`EmptyShell`/`EmptyTitle`/`EmptyHint`) ganham
 * paridade visual entre as duas abas, e a confirmação de remoção
 * usa o `ClientCollectionRemoveConfirmModal` compartilhado.
 */

interface ClientExtraEmailsTabProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `getClientById`/`addClientExtraEmail`/`removeClientExtraEmail`
   * caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Aba "Emails extras" do `ClientEditPage` (Issue #146).
 *
 * Substitui o placeholder herdado de #144. Carrega o cliente via
 * `GET /clients/{id}` (mesmo padrão do `ClientDataTab`) para
 * popular `extraEmails` e oferece add/remove com mapeamento
 * completo dos erros do backend.
 *
 * **Estados visuais (critério "estados visuais completos"):**
 *
 * - `loading` (`InitialLoadingSpinner`) — primeiro fetch.
 * - `error` (`ErrorRetryBlock`) — falha de rede/parse/401/403.
 * - `loaded:empty` — empty state com ícone + dica de próximo passo.
 * - `loaded:list` — lista com até 3 linhas.
 * - `loaded:full` — botão "Adicionar email" desabilitado (limite 3).
 * - `add-submitting` / `remove-submitting` — botões em loading.
 *
 * **Gating de permissão (critério "Visível com `Clients.Update`"):**
 *
 * Quando o usuário não tem `AUTH_V1_CLIENTS_UPDATE`, o tab vira
 * readonly: a lista continua visível (útil para auditoria) mas os
 * botões "Adicionar" e "Remover" ficam ocultos. O backend é a
 * fonte autoritativa (rejeitaria com 401/403 mesmo se a UI
 * exibisse os botões); o gating client-side é apenas UX.
 *
 * **Tratamento de erros:**
 *
 * Add (`addClientExtraEmail`):
 * - 400 "Limite de 3..." → inline + refetch (UI já desabilita o
 *   botão preventivamente; chegar aqui significa race com outra
 *   sessão).
 * - 400 "Email extra inválido." → inline (validação client-side
 *   já cobriu, defensivo).
 * - 409 "Email extra já cadastrado..." → inline.
 * - 409 "Este email está sendo usado como username..." → inline
 *   com mensagem orientadora do backend.
 * - 404 → toast vermelho + refetch (cliente removido).
 * - 401/403 → toast vermelho.
 *
 * Remove (`removeClientExtraEmail`):
 * - 400 "Não é permitido remover email que esteja sendo usado
 *   como username." → toast vermelho com mensagem orientadora.
 * - 404 → toast vermelho + refetch (email já removido).
 * - 401/403 → toast vermelho.
 *
 * Reusa `MAX_CLIENT_EXTRA_EMAILS` (3) para a regra do botão
 * desabilitado — fonte da verdade compartilhada com a função API
 * (`MAX_CLIENT_EXTRA_EMAILS` em `shared/api/clients.ts`). Lição
 * PR #128 — projetar shared helpers desde o primeiro PR do recurso.
 */
export const ClientExtraEmailsTab: React.FC<ClientExtraEmailsTabProps> = ({
  client,
}) => {
  const { id } = useParams<{ id: string }>();
  const { show } = useToast();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(CLIENTS_UPDATE_PERMISSION);

  /**
   * Fetch inicial encapsulado em hook compartilhado — o
   * `useClientByIdFetch` cuida do `useEffect` + `AbortController` +
   * `reloadCounter` que, em #146, vivia inline e foi promovido em
   * #147 para reuso pelas duas abas (lição PR #128/#134/#135 —
   * extrair quando o segundo consumidor real aparece).
   */
  const { fetchState, loadedClient, triggerRefetch } = useClientByIdFetch(
    id,
    client,
  );

  /**
   * Hooks compartilhados encapsulam o `useState` + handlers do modal
   * de adicionar e do confirm de remoção. Lição PR #128/#134/#135 —
   * extraído quando o segundo consumidor (#146 + #147) apareceu para
   * evitar duplicação no JSCPD/Sonar.
   */
  const addModal = useClientAddCollectionModal();
  const removeConfirm = useClientRemoveCollectionConfirm<ClientEmailDto>();

  const handleRetry = useCallback(() => {
    triggerRefetch();
  }, [triggerRefetch]);

  const extraEmails = useMemo<ReadonlyArray<ClientEmailDto>>(
    () => loadedClient?.extraEmails ?? [],
    [loadedClient],
  );
  const isLimitReached = extraEmails.length >= MAX_CLIENT_EXTRA_EMAILS;

  /* ─── Add modal handlers ──────────────────────────────── */

  const { handleOpen: handleOpenAddModal, handleSubmit: handleSubmitAdd } =
    addModal.buildHandlers({
      isLimitReached,
      isReady: loadedClient !== null,
      validate: validateExtraEmailInput,
    });

  /**
   * Effect que dispara a chamada HTTP quando o modal sinaliza
   * `isSubmitting=true`. Encapsulado em `useClientCollectionAddSubmit`
   * compartilhado com `ClientPhonesTab` (#147) — lição PR
   * #128/#134/#135.
   */
  useClientCollectionAddSubmit({
    isSubmitting: addModal.state.isSubmitting,
    value: addModal.state.value,
    clientId: loadedClient?.id ?? null,
    client,
    addFn: addClientExtraEmail,
    classifyError: classifyAddExtraEmailError,
    copy: ADD_ERROR_COPY,
    successToast: 'Email extra adicionado.',
    modal: addModal,
    show,
    triggerRefetch,
  });

  /* ─── Remove confirm handlers ─────────────────────────── */

  const { submit: submitRemove } = useClientCollectionRemoveSubmit({
    client,
    removeFn: removeClientExtraEmail,
    classifyError: classifyRemoveExtraEmailError,
    copy: REMOVE_ERROR_COPY,
    successToast: 'Email extra removido.',
    confirm: removeConfirm,
    show,
    triggerRefetch,
  });

  const handleConfirmRemove = useCallback(async () => {
    if (
      removeConfirm.state.isSubmitting ||
      removeConfirm.state.target === null ||
      loadedClient === null
    ) {
      return;
    }
    // O classifier do email tem um caso `username` (400 orientadora)
    // que não existe no de phones — interceptamos aqui para que o
    // hook compartilhado trate apenas o subset comum.
    await submitRemove(
      loadedClient.id,
      removeConfirm.state.target.id,
      (action) => {
        if (action.kind === 'username') {
          show(action.message, {
            variant: 'danger',
            title: action.title,
          });
          removeConfirm.stopSubmitting();
          return true;
        }
        return false;
      },
    );
  }, [loadedClient, removeConfirm, show, submitRemove]);

  /* ─── Render ──────────────────────────────────────────── */

  if (fetchState === 'loading') {
    return (
      <InitialLoadingSpinner
        testId="client-extra-emails-loading"
        label="Carregando emails extras"
      />
    );
  }

  if (fetchState === 'error') {
    return (
      <ErrorRetryBlock
        message={FETCH_ERROR_MESSAGE}
        onRetry={handleRetry}
        retryTestId="client-extra-emails-retry"
      />
    );
  }

  return (
    <>
      <TabSection aria-labelledby="client-extra-emails-heading">
        <TabHeading id="client-extra-emails-heading">Emails extras</TabHeading>
        <TabIntro>
          Cadastre até {MAX_CLIENT_EXTRA_EMAILS} emails adicionais (além
          do email principal). Emails que já estejam em uso como
          username de algum usuário não podem ser adicionados.
        </TabIntro>

        <ListHeader>
          <Counter data-testid="client-extra-emails-counter">
            {extraEmails.length} de {MAX_CLIENT_EXTRA_EMAILS} cadastrados
          </Counter>
          {canUpdate && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} strokeWidth={1.75} aria-hidden="true" />}
              onClick={handleOpenAddModal}
              disabled={isLimitReached}
              data-testid="client-extra-emails-add"
            >
              Adicionar email
            </Button>
          )}
        </ListHeader>

        {isLimitReached && canUpdate && (
          <Alert variant="info">
            Limite de {MAX_CLIENT_EXTRA_EMAILS} emails extras atingido. Remova
            algum existente para adicionar outro.
          </Alert>
        )}

        {extraEmails.length === 0 ? (
          <EmptyShell data-testid="client-extra-emails-empty">
            <Icon icon={Mail} size="lg" tone="muted" />
            <EmptyTitle>Nenhum email extra cadastrado</EmptyTitle>
            <EmptyHint>
              {canUpdate
                ? 'Use o botão "Adicionar email" acima para cadastrar o primeiro.'
                : 'Esse cliente ainda não possui emails extras.'}
            </EmptyHint>
          </EmptyShell>
        ) : (
          <ListContainer aria-label="Emails extras do cliente">
            {extraEmails.map((emailDto) => (
              <ClientCollectionListRow
                key={emailDto.id}
                id={emailDto.id}
                value={emailDto.email}
                icon={Mail}
                canRemove={canUpdate}
                onRemove={() => removeConfirm.open(emailDto)}
                removeAriaLabel={`Remover email ${emailDto.email}`}
                testIdPrefix="client-extra-emails"
              />
            ))}
          </ListContainer>
        )}
      </TabSection>

      <ClientCollectionAddInputModal
        open={addModal.state.open}
        onClose={addModal.close}
        title="Adicionar email extra"
        description="Informe o novo email a ser cadastrado para este cliente."
        inputLabel="Email"
        placeholder="ana@exemplo.com"
        inputType="email"
        autoComplete="email"
        maxLength={EXTRA_EMAIL_MAX}
        value={addModal.state.value}
        inputError={addModal.state.inputError}
        isSubmitting={addModal.state.isSubmitting}
        onChange={addModal.setValue}
        onSubmit={handleSubmitAdd}
        testIdPrefix="client-extra-emails"
      />

      <ClientCollectionRemoveConfirmModal
        title="Remover email extra?"
        prefix="O email"
        descriptionSuffix="será removido da lista de emails extras deste cliente. Essa ação é imediata."
        target={removeConfirm.state.target?.email ?? null}
        isSubmitting={removeConfirm.state.isSubmitting}
        onClose={removeConfirm.close}
        onConfirm={handleConfirmRemove}
        testIdPrefix="client-extra-emails"
      />
    </>
  );
};
