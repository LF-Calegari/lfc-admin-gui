import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { useToast } from '../../components/ui';
import { getClientById, isApiError, updateClient } from '../../shared/api';
import { useAuth } from '../../shared/auth';
import {
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type EditSubmitActionCopy,
} from '../../shared/forms';
import { ErrorRetryBlock, InitialLoadingSpinner } from '../../shared/listing';

import { ClientFormBody } from './ClientFormFields';
import {
  INITIAL_CLIENT_FORM_STATE,
  stateFromClient,
  type ClientFieldErrors,
  type ClientSubmitErrorCopy,
} from './clientsFormShared';
import { useClientForm, useClientFormFieldProps } from './useClientForm';

import type { ApiClient, ClientDto, UpdateClientPayload } from '../../shared/api';

/**
 * Code de permissão exigido para o submit do form de edição (Issue #75).
 *
 * Espelha o `AUTH_V1_CLIENTS_UPDATE` cadastrado pelo
 * `AuthenticatorRoutesSeeder` no `lfc-authenticator`. O backend é a
 * fonte autoritativa (`PUT /clients/{id}` valida via
 * `[Authorize(Policy = PermissionPolicies.ClientsUpdate)]`); o gating
 * client-side é apenas UX — desabilitar campos e esconder o botão
 * "Salvar" quando o usuário não pode persistir é mais claro do que
 * deixar o submit cair em 401/403.
 */
const CLIENTS_UPDATE_PERMISSION = 'AUTH_V1_CLIENTS_UPDATE';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de edição.
 * Os literais aqui são os únicos pontos onde "atualizar"/"outro
 * cliente" diferem do "criar"/"um cliente" do `NewClientModal` —
 * toda a lógica de classificação é compartilhada via
 * `classifyApiSubmitError` (lição PR #128/#134/#135).
 */
const SUBMIT_ERROR_COPY: ClientSubmitErrorCopy = {
  conflictDefault: 'Já existe outro cliente com este documento.',
  forbiddenTitle: 'Falha ao atualizar cliente',
  genericFallback: 'Não foi possível atualizar o cliente. Tente novamente.',
};

/**
 * Texto exibido em toast quando o cliente some entre o carregamento
 * inicial e o submit (404). UI então redireciona para `/clientes` —
 * a aba não tem mais entidade para editar.
 */
const NOT_FOUND_MESSAGE =
  'Cliente não encontrado ou foi removido. A listagem foi atualizada.';

/**
 * Mensagem amigável exibida no `ErrorRetryBlock` quando o fetch
 * inicial falha (rede, parse, 401/403, etc.). Toast com a mensagem
 * técnica é responsabilidade do `useToast` quando aplicável; o
 * `Alert` da página fica curto para não competir com o toast.
 */
const FETCH_ERROR_MESSAGE = 'Não foi possível carregar os dados do cliente.';

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre o `ClientDataTab` e os demais modals/
 * tabs de edição sem duplicar a árvore de switch (lição PR #128/
 * #134/#135 reforçada).
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  // `conflictInlineMessage` deixado `undefined` para propagar a
  // mensagem do backend que já discrimina CPF vs CNPJ ("Já existe
  // cliente com este CPF." / "Já existe cliente com este CNPJ.") —
  // mesma estratégia do `NewClientModal`.
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

interface ClientDataTabProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `getClientById`/`updateClient` caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Container externo do conteúdo da aba — preserva o ar e o
 * espaçamento do `ClientEditTabPlaceholder` que substituímos.
 * Usar `<section>` com `aria-labelledby` apontando para o `<h3>`
 * cria uma landmark identificável por leitores de tela
 * ("Dados do cliente").
 */
const TabSection = styled.section`
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const TabHeading = styled.h3`
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: var(--tracking-tight);
`;

const TabIntro = styled.p`
  margin: 0;
  color: var(--fg2);
  font-size: var(--text-sm);
  line-height: var(--leading-base);
  max-width: 60ch;
`;

/**
 * Aba "Dados" do `ClientEditPage` (Issue #75).
 *
 * Substitui o placeholder herdado de #144. Carrega o cliente via
 * `GET /clients/{id}`, pré-popula o `ClientFormBody` com os dados
 * persistidos e permite editar via `PUT /clients/{id}`. O `<Select>`
 * de tipo fica desabilitado porque o backend rejeita mudança de
 * tipo após criação (`ClientsController.UpdateById` linha 369: 400
 * `"Tipo do cliente não pode ser alterado após a criação."`).
 *
 * **Estados visuais (critério "estados visuais completos"):**
 *
 * - `loading` (`InitialLoadingSpinner`) — primeiro fetch.
 * - `error` (`ErrorRetryBlock`) — falha de rede/parse/401/403.
 * - `not-found` — toast vermelho + redirect para `/clientes`.
 * - `loaded` — form renderizado com dados pré-populados.
 * - `submitting` — campos disabled (via `isSubmitting` em
 *   `ClientFormBody`) e botão "Salvar" com `loading` state.
 *
 * **Gating de permissão (critério "Visível com `Clients.Update`"):**
 *
 * Quando o usuário não tem `AUTH_V1_CLIENTS_UPDATE`, o form é
 * renderizado em modo readonly (campos desabilitados, sem botão
 * "Salvar"). Mostrar os dados ainda é útil mesmo sem permissão de
 * update — a página `/clientes/:id` é gateada por
 * `AUTH_V1_CLIENTS_GET_BY_ID`, não por `UPDATE`. O backend é a
 * fonte autoritativa (`PUT /clients/{id}` rejeitaria com 401/403);
 * o gating client-side é apenas UX.
 *
 * **Tratamento de erros do submit:**
 *
 * - 409 (CPF/CNPJ duplicado) → mensagem inline no campo de unicidade
 *   correspondente ao tipo (`cpf` para PF, `cnpj` para PJ).
 * - 400 → `details.errors[Field]` mapeado para `fieldErrors[field]`,
 *   normalizando capitalização. Quando o backend envia
 *   `{ message: "Tipo do cliente não pode ser alterado..." }` (sem
 *   `errors` mapeáveis), cai no fallback (`Alert` no topo do form).
 * - 404 → toast vermelho + redirect para `/clientes`.
 * - 401/403 → toast vermelho com mensagem do backend.
 * - Demais → toast vermelho com mensagem genérica.
 */
export const ClientDataTab: React.FC<ClientDataTabProps> = ({ client }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { show } = useToast();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(CLIENTS_UPDATE_PERMISSION);

  const clientForm = useClientForm(INITIAL_CLIENT_FORM_STATE);
  const {
    formState,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareUpdateSubmit,
    applyBadRequest,
  } = clientForm;

  /**
   * Estados do fetch inicial. `loaded` guarda o cliente que veio do
   * backend para que asserts e o submit reusem; `error` carrega a
   * mensagem amigável do `ErrorRetryBlock` (não a mensagem técnica).
   */
  const [fetchState, setFetchState] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [loadedClient, setLoadedClient] = useState<ClientDto | null>(null);

  /**
   * Carrega o cliente via `GET /clients/{id}`. Cancela request
   * pendente em unmount via `AbortController` para evitar
   * `setState` em componente desmontado.
   *
   * Reload key (`reloadCounter`) permite que `ErrorRetryBlock`
   * dispare um novo fetch sem precisar resetar o estado inteiro da
   * aba — incrementar o número faz o `useEffect` rodar de novo.
   */
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  useEffect(() => {
    if (id === undefined || id.length === 0) {
      setFetchState('error');
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setFetchState('loading');
    setSubmitError(null);
    setFieldErrors({});

    getClientById(id, { signal: controller.signal }, client)
      .then((dto) => {
        if (isCancelled) return;
        setLoadedClient(dto);
        setFormState(stateFromClient(dto));
        setFetchState('loaded');
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        // Cancelamento explícito (unmount/route change) não vira erro
        // de UI — silencia para que o próximo render comece limpo.
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }
        if (isApiError(error) && error.kind === 'http' && error.status === 404) {
          show(NOT_FOUND_MESSAGE, {
            variant: 'danger',
            title: 'Cliente não encontrado',
          });
          navigate('/clientes', { replace: true });
          return;
        }
        setFetchState('error');
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [id, client, reloadCounter, navigate, show, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Handler do botão "Tentar novamente" do `ErrorRetryBlock`. Apenas
   * incrementa o `reloadCounter` para que o `useEffect` re-execute.
   */
  const handleRetry = useCallback(() => {
    setReloadCounter((prev) => prev + 1);
  }, []);

  /**
   * Wrapper de `prepareUpdateSubmit` que reprova quando o gate de
   * `isSubmitting`/`!loadedClient` falhar — preserva o dedupe ao
   * mover a lógica para dentro de `useEditEntitySubmit` (lição PR
   * #135).
   */
  const prepareSubmitSafe = useCallback((): Record<string, unknown> | null => {
    if (isSubmitting || loadedClient === null) return null;
    return prepareUpdateSubmit();
  }, [isSubmitting, loadedClient, prepareUpdateSubmit]);

  /**
   * Closure sobre `loadedClient.id` + `client`. Quando `loadedClient`
   * é `null` o `prepareSubmitSafe` já reprova antes do `mutationFn`
   * rodar — a checagem inline aqui é defensiva (preserva o tipo
   * sem `!`).
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> => {
      if (loadedClient === null) {
        return Promise.reject(new Error('Client unavailable.'));
      }
      return updateClient(
        loadedClient.id,
        payload as UpdateClientPayload,
        undefined,
        client,
      );
    },
    [client, loadedClient],
  );

  /**
   * Refetch local após sucesso — atualiza `loadedClient` (que rege
   * `id` no submit e estado pré-populado em re-renders) com o DTO
   * devolvido pelo backend. Mantém o form em estado "limpo" (sem
   * resíduo de erros) e segue na mesma aba.
   *
   * Em vez de re-disparar `getClientById`, aproveitamos a
   * resposta do `PUT` (backend devolve `ClientResponse` no 200).
   * O hook `useEditEntitySubmit` não expõe a resposta diretamente,
   * então confiamos no estado controlado: o usuário só vê o efeito
   * via toast "Cliente atualizado." + reset de erros — o
   * `formState` já reflete o que foi enviado, então não há gap
   * visível.
   */
  const onUpdated = useCallback(() => {
    // Reload silencioso — incrementa o counter para que o efeito
    // releia o cliente e sincronize `loadedClient`/`formState`.
    setReloadCounter((prev) => prev + 1);
  }, []);

  /**
   * No-op fechamento — esta aba não fecha como um modal; permanecer
   * na URL corrente é o comportamento esperado após sucesso.
   * `useEditEntitySubmit` exige callback, então passamos uma função
   * que não faz nada. O fluxo de 404 (que normalmente fecharia o
   * modal) é tratado dentro do `useEffect` do fetch — ali sim
   * navegamos para `/clientes`.
   */
  const onClose = useCallback(() => {
    // Intencionalmente vazio. Ver doc do callback acima.
  }, []);

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<EditEntitySubmitCopy>(
    () => ({
      successMessage: 'Cliente atualizado.',
      submitErrorCopy: SUBMIT_ERROR_COPY,
      editSubmitActionCopy: EDIT_SUBMIT_ACTION_COPY,
    }),
    [],
  );

  /**
   * O `conflictField` muda em runtime conforme o tipo (`cpf` para
   * PF, `cnpj` para PJ). Mesma lógica do `NewClientModal` — o
   * backend valida unicidade global do documento, então o campo
   * onde o conflito aparece depende do tipo do cliente atual.
   */
  const conflictField: keyof ClientFieldErrors = formState.type === 'PF' ? 'cpf' : 'cnpj';

  /**
   * Custom 404 handler — após o submit detectar 404, redireciona
   * para `/clientes`. O hook chama `onUpdated() + onClose()` no
   * default; sobrescrevemos via `applyEditSubmitAction.copy.notFoundMessage`
   * + interceptação do `onAfterNotFound` no helper compartilhado.
   *
   * Como `useEditEntitySubmit` não expõe `onAfterNotFound`
   * customizável (ele compõe internamente `() => { onUpdated();
   * onClose(); }`), interceptamos via `onUpdated` callback que
   * inclui o redirect quando estamos em estado pós-404 — não dá pra
   * distinguir aqui sem tocar no helper. **Decisão:** o
   * `useEffect` já trata 404 do fetch inicial; para 404 no submit,
   * o toast é exibido e a aba simplesmente refaz o GET, que devolve
   * 404 novamente e dispara o redirect via `useEffect`. Comportamento
   * coerente sem retoque no helper compartilhado (lição PR #135 —
   * extrair shared deve ser preservado).
   */
  const handleSubmit = useEditEntitySubmit<keyof ClientFieldErrors>({
    dispatchers: {
      setFieldErrors: clientForm.setFieldErrors,
      setSubmitError: clientForm.setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
    },
    copy: submitCopy,
    callbacks: {
      prepareSubmit: prepareSubmitSafe,
      mutationFn,
      onUpdated,
      onClose,
    },
    conflictField,
  });

  /**
   * Handler do botão "Cancelar". Reseta o form para o estado do
   * cliente carregado (descarta edições não salvas) — comportamento
   * mais útil em uma aba de página do que no modal de criação
   * (onde "Cancelar" fecha o modal). Bloqueado durante submit.
   */
  const handleCancel = useCallback(() => {
    if (isSubmitting || loadedClient === null) return;
    setFormState(stateFromClient(loadedClient));
    setFieldErrors({});
    setSubmitError(null);
  }, [isSubmitting, loadedClient, setFormState, setFieldErrors, setSubmitError]);

  // Hook chamado **antes** do early-return para respeitar a regra
  // "hooks always called in the same order". Quando o caller decide
  // não renderizar o form (loading/error), o objeto memoizado fica
  // descartado — sem efeito colateral.
  const fieldProps = useClientFormFieldProps(clientForm, handleSubmit, handleCancel);

  if (fetchState === 'loading') {
    return (
      <InitialLoadingSpinner
        testId="client-data-loading"
        label="Carregando dados do cliente"
      />
    );
  }

  if (fetchState === 'error') {
    return (
      <ErrorRetryBlock
        message={FETCH_ERROR_MESSAGE}
        onRetry={handleRetry}
        retryTestId="client-data-retry"
      />
    );
  }

  // `loaded` — render do form com dados pré-populados.
  return (
    <TabSection aria-labelledby="client-data-heading">
      <TabHeading id="client-data-heading">Dados do cliente</TabHeading>
      <TabIntro>
        Atualize CPF/CNPJ e nome/razão social. O tipo (PF/PJ) é
        imutável após a criação.
      </TabIntro>
      <ClientFormBody
        {...fieldProps}
        idPrefix="client-data"
        submitLabel="Salvar"
        typeDisabled
        readonly={!canUpdate}
      />
    </TabSection>
  );
};
