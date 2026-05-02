// Issue #147 — abas "Celulares" e "Telefones fixos" do
// `ClientEditPage`, parametrizadas por `kind`. Espelha #146 reusando
// os componentes/hooks compartilhados em `clientCollection*`.
import { Phone, Plus, Smartphone, type LucideIcon } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import {
  Alert,
  Button,
  Icon,
  useToast,
} from '../../components/ui';
import {
  addClientLandlinePhone,
  addClientMobilePhone,
  MAX_CLIENT_PHONES_PER_TYPE,
  removeClientLandlinePhone,
  removeClientMobilePhone,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import { ErrorRetryBlock, InitialLoadingSpinner } from '../../shared/listing';

// Componentes shared das abas de coleção (compartilhados com #146 —
// emails extras — para deduplicar lista, modais e hooks de mutação).
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
  classifyAddPhoneError,
  classifyRemovePhoneError,
  PHONE_MAX_LENGTH,
  validatePhoneInput,
  type PhoneErrorCopy,
} from './clientPhonesHelpers';
import { useClientAddCollectionModal } from './useClientAddCollectionModal';
import { useClientByIdFetch } from './useClientByIdFetch';
import { useClientCollectionAddSubmit } from './useClientCollectionAddSubmit';
import { useClientCollectionRemoveSubmit } from './useClientCollectionRemoveSubmit';
import { useClientRemoveCollectionConfirm } from './useClientRemoveCollectionConfirm';

import type { ApiClient, ClientDto, ClientPhoneDto } from '../../shared/api';

/**
 * Code de permissão exigido para mutações nas abas de contatos
 * (Issue #147 — paridade com Issue #146).
 *
 * Espelha o `AUTH_V1_CLIENTS_UPDATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`POST/DELETE /clients/{id}/(mobiles|phones)`
 * rodam `[Authorize(Policy = PermissionPolicies.ClientsUpdate)]`); o
 * gating client-side é apenas UX — esconder os botões "Adicionar"/
 * "Remover" quando o operador não pode persistir é mais claro do que
 * deixar o submit cair em 401/403.
 */
const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

/**
 * Discriminador da aba — espelha o `ClientPhone.Type` do backend
 * (`mobile` para celulares, `phone` para fixos). Não usamos as strings
 * literais do backend aqui para reduzir acoplamento; um único `kind`
 * por aba seleciona endpoint, copy e ícone via `PHONE_KIND_CONFIG`.
 */
export type ClientPhoneKind = 'mobile' | 'landline';

/**
 * Configuração injetada pelas abas (`ClientMobilePhonesTab` e
 * `ClientLandlinePhonesTab`). Centralizar copy + endpoints em uma
 * tabela única evita branching `if (kind === 'mobile')` espalhado pelo
 * componente — cada caso carrega o conjunto completo de literais que
 * a UI exibe.
 */
interface PhoneKindConfig {
  /** Título da aba (usado no `<TabHeading>` e como `aria-labelledby`). */
  heading: string;
  /** Descrição introdutória renderizada abaixo do título. */
  intro: string;
  /** Rótulo do contador (singular/plural, conforme tipo). */
  counterLabel: string;
  /** Texto do botão "Adicionar" (singular do tipo). */
  addButtonLabel: string;
  /** Título do modal de adicionar. */
  addModalTitle: string;
  /** Descrição do modal de adicionar. */
  addModalDescription: string;
  /** Label do input no modal de adicionar. */
  inputLabel: string;
  /** Título do modal de confirmação de remoção. */
  removeModalTitle: string;
  /** Texto descritivo do confirm de remoção (já com prefixo). */
  removeDescriptionPrefix: string;
  /** Mensagem do empty state (sem registros). */
  emptyTitle: string;
  /** Hint do empty state quando o operador pode adicionar. */
  emptyHintEditable: string;
  /** Hint do empty state quando o operador é só leitor. */
  emptyHintReadonly: string;
  /** Cópia para `classifyAddPhoneError` (`PhoneErrorCopy`). */
  addCopy: PhoneErrorCopy;
  /** Cópia para `classifyRemovePhoneError` (`PhoneErrorCopy`). */
  removeCopy: PhoneErrorCopy;
  /** Toast de sucesso após adicionar. */
  addSuccessToast: string;
  /** Toast de sucesso após remover. */
  removeSuccessToast: string;
  /** Mensagem do `Alert` quando a lista atinge o limite. */
  limitAlertMessage: string;
  /** Texto exibido após o número quando o limite é atingido. */
  limitAlertHint: string;
  /** Ícone (lucide-react) usado nas linhas e empty state. */
  RowIcon: LucideIcon;
  /** Prefixo de `data-testid` (mobile / landline). Estável para asserts. */
  testIdPrefix: string;
  /** Função de fetch para add. */
  addFn: typeof addClientMobilePhone;
  /** Função de fetch para remove. */
  removeFn: typeof removeClientMobilePhone;
  /** Seletor da coleção dentro do `ClientDto`. */
  selectCollection: (dto: ClientDto) => ReadonlyArray<ClientPhoneDto>;
  /** Label de carregamento (lido por leitor de tela). */
  loadingLabel: string;
}

/**
 * Mensagem amigável exibida no `ErrorRetryBlock` quando o fetch
 * inicial do cliente falha (rede, parse, 401/403, etc.). Compartilhada
 * entre as duas abas porque o erro de fetch é genérico ao cliente.
 */
const FETCH_ERROR_MESSAGE = 'Não foi possível carregar os dados do cliente.';

/**
 * Estilos da aba são compartilhados em `clientCollectionTabStyles.ts`
 * com `ClientExtraEmailsTab` (#146) — paridade visual entre as abas
 * e zero duplicação de tokens (lição PR #128/#134/#135). A linha
 * usa `ListRowValue $mono` para que o número de telefone seja
 * renderizado em fonte monoespaçada (legibilidade), enquanto o email
 * (#146) usa o default `font-sans`.
 */

interface ClientPhonesTabProps {
  /** Discriminador da aba — `mobile` (celulares) ou `landline` (fixos). */
  kind: ClientPhoneKind;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `getClientById`/`addClient(Mobile|Landline)Phone`/
   * `removeClient(Mobile|Landline)Phone` caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Configurações estáticas por tipo de aba — tabela única consultada
 * pelo `ClientPhonesTab` para resolver copy/ícones/endpoints. Manter
 * inline (em vez de spread por arquivo) facilita ler os dois conjuntos
 * de literais lado a lado.
 */
const PHONE_KIND_CONFIG: Record<ClientPhoneKind, PhoneKindConfig> = {
  mobile: {
    heading: 'Celulares',
    intro: `Cadastre até ${MAX_CLIENT_PHONES_PER_TYPE} celulares neste cliente. Use o formato internacional E.164 (ex.: +5518981789845).`,
    counterLabel: 'cadastrados',
    addButtonLabel: 'Adicionar celular',
    addModalTitle: 'Adicionar celular',
    addModalDescription: 'Informe o novo número de celular no formato internacional (DDI + DDD + número).',
    inputLabel: 'Celular',
    removeModalTitle: 'Remover celular?',
    removeDescriptionPrefix: 'O celular',
    emptyTitle: 'Nenhum celular cadastrado',
    emptyHintEditable: 'Use o botão "Adicionar celular" acima para cadastrar o primeiro.',
    emptyHintReadonly: 'Esse cliente ainda não possui celulares cadastrados.',
    addCopy: {
      genericFallback: 'Não foi possível adicionar o celular. Tente novamente.',
      forbiddenTitle: 'Falha ao adicionar celular',
      notFoundMessage: 'Cliente não encontrado ou foi removido. A página foi atualizada.',
    },
    removeCopy: {
      genericFallback: 'Não foi possível remover o celular. Tente novamente.',
      forbiddenTitle: 'Falha ao remover celular',
      notFoundMessage: 'Celular já havia sido removido. A lista foi atualizada.',
    },
    addSuccessToast: 'Celular adicionado.',
    removeSuccessToast: 'Celular removido.',
    limitAlertMessage: `Limite de ${MAX_CLIENT_PHONES_PER_TYPE} celulares atingido.`,
    limitAlertHint: 'Remova algum existente para adicionar outro.',
    RowIcon: Smartphone,
    testIdPrefix: 'client-mobile-phones',
    addFn: addClientMobilePhone,
    removeFn: removeClientMobilePhone,
    selectCollection: (dto: ClientDto) => dto.mobilePhones ?? [],
    loadingLabel: 'Carregando celulares',
  },
  landline: {
    heading: 'Telefones fixos',
    intro: `Cadastre até ${MAX_CLIENT_PHONES_PER_TYPE} telefones fixos neste cliente. Use o formato internacional E.164 (ex.: +551832345678).`,
    counterLabel: 'cadastrados',
    addButtonLabel: 'Adicionar telefone',
    addModalTitle: 'Adicionar telefone fixo',
    addModalDescription: 'Informe o novo número de telefone fixo no formato internacional (DDI + DDD + número).',
    inputLabel: 'Telefone fixo',
    removeModalTitle: 'Remover telefone fixo?',
    removeDescriptionPrefix: 'O telefone fixo',
    emptyTitle: 'Nenhum telefone fixo cadastrado',
    emptyHintEditable: 'Use o botão "Adicionar telefone" acima para cadastrar o primeiro.',
    emptyHintReadonly: 'Esse cliente ainda não possui telefones fixos cadastrados.',
    addCopy: {
      genericFallback: 'Não foi possível adicionar o telefone. Tente novamente.',
      forbiddenTitle: 'Falha ao adicionar telefone',
      notFoundMessage: 'Cliente não encontrado ou foi removido. A página foi atualizada.',
    },
    removeCopy: {
      genericFallback: 'Não foi possível remover o telefone. Tente novamente.',
      forbiddenTitle: 'Falha ao remover telefone',
      notFoundMessage: 'Telefone já havia sido removido. A lista foi atualizada.',
    },
    addSuccessToast: 'Telefone adicionado.',
    removeSuccessToast: 'Telefone removido.',
    limitAlertMessage: `Limite de ${MAX_CLIENT_PHONES_PER_TYPE} telefones fixos atingido.`,
    limitAlertHint: 'Remova algum existente para adicionar outro.',
    RowIcon: Phone,
    testIdPrefix: 'client-landline-phones',
    addFn: addClientLandlinePhone,
    removeFn: removeClientLandlinePhone,
    selectCollection: (dto: ClientDto) => dto.landlinePhones ?? [],
    loadingLabel: 'Carregando telefones fixos',
  },
};

/**
 * Aba "Celulares" / "Telefones fixos" do `ClientEditPage` (Issue #147).
 *
 * Substitui o placeholder herdado de #144. Carrega o cliente via
 * `GET /clients/{id}` (mesmo padrão do `ClientDataTab`/
 * `ClientExtraEmailsTab`) para popular `mobilePhones` ou `landlinePhones`
 * conforme `kind`, e oferece add/remove com mapeamento completo dos
 * erros do backend.
 *
 * Componente único parametrizado por `kind` — espelha o pattern de
 * extração antecipada de helpers (lição PR #128/#134/#135). Os dois
 * call sites (`ClientMobilePhonesTab` e `ClientLandlinePhonesTab`)
 * são wrappers finos de uma linha que injetam `kind`.
 *
 * **Estados visuais (critério "estados visuais completos"):**
 *
 * - `loading` (`InitialLoadingSpinner`) — primeiro fetch.
 * - `error` (`ErrorRetryBlock`) — falha de rede/parse/401/403.
 * - `loaded:empty` — empty state com ícone + dica de próximo passo.
 * - `loaded:list` — lista com até 3 linhas.
 * - `loaded:full` — botão "Adicionar" desabilitado (limite 3) +
 *   `Alert` informativo.
 * - `add-submitting` / `remove-submitting` — botões em loading.
 *
 * **Gating de permissão (critério "Visível com `Clients.Update`"):**
 *
 * Quando o usuário não tem `AUTH_V1_CLIENTS_UPDATE`, a aba vira
 * readonly: a lista continua visível (útil para auditoria) mas os
 * botões "Adicionar" e "Remover" ficam ocultos. O backend é a fonte
 * autoritativa (rejeitaria com 401/403 mesmo se a UI exibisse os
 * botões); o gating client-side é apenas UX.
 *
 * **Tratamento de erros:**
 *
 * Add (`addClient(Mobile|Landline)Phone`):
 * - 400 "Telefone inválido..." → inline (validação client-side já
 *   cobriu, defensivo).
 * - 400 "Limite de 3..." → inline + refetch (UI já desabilita o
 *   botão preventivamente; chegar aqui significa race com outra
 *   sessão).
 * - 409 "Contato já cadastrado para este cliente." → inline.
 * - 404 → toast vermelho + refetch (cliente removido).
 * - 401/403 → toast vermelho.
 *
 * Remove (`removeClient(Mobile|Landline)Phone`):
 * - 404 → toast vermelho + refetch (telefone já removido).
 * - 401/403 → toast vermelho.
 *
 * Reusa `MAX_CLIENT_PHONES_PER_TYPE` (3) para a regra do botão
 * desabilitado — fonte da verdade compartilhada com a função API.
 */
export const ClientPhonesTab: React.FC<ClientPhonesTabProps> = ({
  kind,
  client,
}) => {
  const { id } = useParams<{ id: string }>();
  const { show } = useToast();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(CLIENTS_UPDATE_PERMISSION);

  const config = PHONE_KIND_CONFIG[kind];
  const {
    heading,
    intro,
    counterLabel,
    addButtonLabel,
    addModalTitle,
    addModalDescription,
    inputLabel,
    removeModalTitle,
    removeDescriptionPrefix,
    emptyTitle,
    emptyHintEditable,
    emptyHintReadonly,
    addCopy,
    removeCopy,
    addSuccessToast,
    removeSuccessToast,
    limitAlertMessage,
    limitAlertHint,
    RowIcon,
    testIdPrefix,
    addFn,
    removeFn,
    selectCollection,
    loadingLabel,
  } = config;

  /**
   * Fetch inicial encapsulado em hook compartilhado — `useClientByIdFetch`
   * cuida de `useEffect` + `AbortController` + `reloadCounter` que
   * antes vivia inline em #146 e foi promovido em #147 para reuso
   * pelas duas abas (lição PR #128/#134/#135).
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
  const removeConfirm = useClientRemoveCollectionConfirm<ClientPhoneDto>();

  const handleRetry = useCallback(() => {
    triggerRefetch();
  }, [triggerRefetch]);

  const phones = useMemo<ReadonlyArray<ClientPhoneDto>>(
    () => (loadedClient !== null ? selectCollection(loadedClient) : []),
    [loadedClient, selectCollection],
  );
  const isLimitReached = phones.length >= MAX_CLIENT_PHONES_PER_TYPE;

  /* ─── Add modal handlers ──────────────────────────────── */

  const { handleOpen: handleOpenAddModal, handleSubmit: handleSubmitAdd } =
    addModal.buildHandlers({
      isLimitReached,
      isReady: loadedClient !== null,
      validate: validatePhoneInput,
    });

  /**
   * Effect que dispara a chamada HTTP quando o modal sinaliza
   * `isSubmitting=true`. Encapsulado em `useClientCollectionAddSubmit`
   * compartilhado com `ClientExtraEmailsTab` (#146) — lição PR
   * #128/#134/#135.
   */
  useClientCollectionAddSubmit({
    isSubmitting: addModal.state.isSubmitting,
    value: addModal.state.value,
    clientId: loadedClient?.id ?? null,
    client,
    addFn,
    classifyError: classifyAddPhoneError,
    copy: addCopy,
    successToast: addSuccessToast,
    modal: addModal,
    show,
    triggerRefetch,
  });

  /* ─── Remove confirm handlers ─────────────────────────── */

  const { submit: submitRemove } = useClientCollectionRemoveSubmit({
    client,
    removeFn,
    classifyError: classifyRemovePhoneError,
    copy: removeCopy,
    successToast: removeSuccessToast,
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
    await submitRemove(loadedClient.id, removeConfirm.state.target.id);
  }, [loadedClient, removeConfirm.state, submitRemove]);

  /* ─── Render ──────────────────────────────────────────── */

  if (fetchState === 'loading') {
    return (
      <InitialLoadingSpinner
        testId={`${testIdPrefix}-loading`}
        label={loadingLabel}
      />
    );
  }

  if (fetchState === 'error') {
    return (
      <ErrorRetryBlock
        message={FETCH_ERROR_MESSAGE}
        onRetry={handleRetry}
        retryTestId={`${testIdPrefix}-retry`}
      />
    );
  }

  return (
    <>
      <TabSection aria-labelledby={`${testIdPrefix}-heading`}>
        <TabHeading id={`${testIdPrefix}-heading`}>{heading}</TabHeading>
        <TabIntro>{intro}</TabIntro>

        <ListHeader>
          <Counter data-testid={`${testIdPrefix}-counter`}>
            {phones.length} de {MAX_CLIENT_PHONES_PER_TYPE} {counterLabel}
          </Counter>
          {canUpdate && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} strokeWidth={1.75} aria-hidden="true" />}
              onClick={handleOpenAddModal}
              disabled={isLimitReached}
              data-testid={`${testIdPrefix}-add`}
            >
              {addButtonLabel}
            </Button>
          )}
        </ListHeader>

        {isLimitReached && canUpdate && (
          <Alert variant="info">
            {limitAlertMessage} {limitAlertHint}
          </Alert>
        )}

        {phones.length === 0 ? (
          <EmptyShell data-testid={`${testIdPrefix}-empty`}>
            <Icon icon={RowIcon} size="lg" tone="muted" />
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyHint>
              {canUpdate ? emptyHintEditable : emptyHintReadonly}
            </EmptyHint>
          </EmptyShell>
        ) : (
          <ListContainer aria-label={`${heading} do cliente`}>
            {phones.map((phone) => (
              <ClientCollectionListRow
                key={phone.id}
                id={phone.id}
                value={phone.number}
                icon={RowIcon}
                mono
                canRemove={canUpdate}
                onRemove={() => removeConfirm.open(phone)}
                removeAriaLabel={`Remover ${phone.number}`}
                testIdPrefix={testIdPrefix}
              />
            ))}
          </ListContainer>
        )}
      </TabSection>

      <ClientCollectionAddInputModal
        open={addModal.state.open}
        onClose={addModal.close}
        title={addModalTitle}
        description={addModalDescription}
        inputLabel={inputLabel}
        placeholder="+5518981789845"
        inputType="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={PHONE_MAX_LENGTH}
        value={addModal.state.value}
        inputError={addModal.state.inputError}
        isSubmitting={addModal.state.isSubmitting}
        onChange={addModal.setValue}
        onSubmit={handleSubmitAdd}
        testIdPrefix={testIdPrefix}
      />

      <ClientCollectionRemoveConfirmModal
        title={removeModalTitle}
        prefix={removeDescriptionPrefix}
        target={removeConfirm.state.target?.number ?? null}
        isSubmitting={removeConfirm.state.isSubmitting}
        onClose={removeConfirm.close}
        onConfirm={handleConfirmRemove}
        testIdPrefix={testIdPrefix}
      />
    </>
  );
};
