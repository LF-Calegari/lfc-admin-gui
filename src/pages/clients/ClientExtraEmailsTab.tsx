import { Mail, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import {
  Alert,
  Button,
  Icon,
  Input,
  Modal,
  useToast,
} from '../../components/ui';
import {
  addClientExtraEmail,
  getClientById,
  MAX_CLIENT_EXTRA_EMAILS,
  removeClientExtraEmail,
} from '../../shared/api';
import { useAuth } from '../../shared/auth';
import { ErrorRetryBlock, InitialLoadingSpinner } from '../../shared/listing';

import {
  classifyAddExtraEmailError,
  classifyRemoveExtraEmailError,
  EXTRA_EMAIL_MAX,
  validateExtraEmailInput,
  type ExtraEmailErrorCopy,
} from './clientExtraEmailsHelpers';

import type { ApiClient, ClientDto, ClientEmailDto } from '../../shared/api';

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
 * Container externo do conteúdo da aba — preserva o ar e o
 * espaçamento das outras abas (`ClientDataTab`).
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
 * Cabeçalho do bloco que combina contagem corrente + botão de ação.
 * Em viewports estreitas, empilha o botão sob o contador para
 * preservar o toque (touch target de 44px+).
 */
const ListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
`;

const Counter = styled.div`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--fg3);
`;

/**
 * Lista visual dos emails extras. Cada `<EmailRow>` é uma linha com
 * o email à esquerda e o botão "Remover" à direita.
 */
const EmailList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const EmailRow = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);

  &:hover {
    border-color: var(--border-medium-forest);
  }
`;

const EmailLeft = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
`;

const EmailValue = styled.span`
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--fg1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/**
 * Bloco de empty state com tom suave — espelha o padrão visual de
 * `AssignmentMatrixShell.AssignmentEmptyShell` (centralizado, com
 * ícone informativo e dica de próximo passo). Mantém-se inline (em
 * vez de reutilizar o shell) porque o shell de matrizes carrega
 * estrutura adicional que não se encaixa aqui.
 */
const EmptyShell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  background: var(--bg-elevated);
  border: var(--border-thin) dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--fg3);
`;

const EmptyTitle = styled.span`
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--fg2);
`;

const EmptyHint = styled.span`
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--fg3);
  text-align: center;
  max-width: 40ch;
`;

/**
 * Form do modal de adicionar — `<form>` para que `Enter` no input
 * dispare o submit e que leitores de tela identifiquem o agrupamento
 * de campos.
 */
const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const ModalActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
`;

const ConfirmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

const ConfirmText = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg1);
  background: var(--bg-elevated);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
`;

interface ClientExtraEmailsTabProps {
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `getClientById`/`addClientExtraEmail`/`removeClientExtraEmail`
   * caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Estado do modal de adicionar email — mantém form controlado
 * (input value + erro inline) e flag `isSubmitting` independente
 * para que o spinner do botão não recicle a cada keystroke.
 */
interface AddModalState {
  open: boolean;
  email: string;
  inputError: string | null;
  isSubmitting: boolean;
}

const INITIAL_ADD_MODAL_STATE: AddModalState = {
  open: false,
  email: '',
  inputError: null,
  isSubmitting: false,
};

/**
 * Estado do modal de confirmação de remoção. `target` é `null`
 * quando o modal está fechado — caller controla `open` via
 * `target !== null`.
 */
interface RemoveConfirmState {
  target: ClientEmailDto | null;
  isSubmitting: boolean;
}

const INITIAL_REMOVE_CONFIRM_STATE: RemoveConfirmState = {
  target: null,
  isSubmitting: false,
};

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
   * Estados do fetch inicial. Espelha o padrão do `ClientDataTab` —
   * `loaded` guarda o cliente (para que o submit/remove leiam
   * `extraEmails` direto do estado em vez de prop), `error` cai no
   * `ErrorRetryBlock`.
   */
  const [fetchState, setFetchState] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [loadedClient, setLoadedClient] = useState<ClientDto | null>(null);

  /**
   * Reload key — incrementar dispara refetch do `useEffect`. Usado
   * pelo `ErrorRetryBlock` (botão "Tentar novamente"), por sucesso
   * de mutação (sincroniza lista) e por erros que indicam que o
   * estado do servidor divergiu (404, "Limite atingido").
   */
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  const [addModal, setAddModal] = useState<AddModalState>(
    INITIAL_ADD_MODAL_STATE,
  );
  const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState>(
    INITIAL_REMOVE_CONFIRM_STATE,
  );

  useEffect(() => {
    if (id === undefined || id.length === 0) {
      setFetchState('error');
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setFetchState('loading');

    getClientById(id, { signal: controller.signal }, client)
      .then((dto) => {
        if (isCancelled) return;
        setLoadedClient(dto);
        setFetchState('loaded');
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        // Cancelamento explícito (unmount/route change) não vira
        // erro de UI — silencia para que o próximo render comece
        // limpo.
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }
        setFetchState('error');
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [id, client, reloadCounter]);

  const triggerRefetch = useCallback(() => {
    setReloadCounter((prev) => prev + 1);
  }, []);

  const handleRetry = useCallback(() => {
    triggerRefetch();
  }, [triggerRefetch]);

  const extraEmails = useMemo<ReadonlyArray<ClientEmailDto>>(
    () => loadedClient?.extraEmails ?? [],
    [loadedClient],
  );
  const isLimitReached = extraEmails.length >= MAX_CLIENT_EXTRA_EMAILS;

  /* ─── Add modal handlers ──────────────────────────────── */

  const handleOpenAddModal = useCallback(() => {
    if (isLimitReached) return;
    setAddModal({
      open: true,
      email: '',
      inputError: null,
      isSubmitting: false,
    });
  }, [isLimitReached]);

  const handleCloseAddModal = useCallback(() => {
    setAddModal((prev) =>
      prev.isSubmitting ? prev : INITIAL_ADD_MODAL_STATE,
    );
  }, []);

  const handleEmailChange = useCallback((value: string) => {
    setAddModal((prev) => ({
      ...prev,
      email: value,
      // Limpa o erro no primeiro keystroke após erro — feedback
      // mais leve que "permanecer marcado vermelho até resubmit".
      inputError: null,
    }));
  }, []);

  const handleSubmitAdd = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setAddModal((prev) => {
        if (prev.isSubmitting || loadedClient === null) return prev;
        const trimmed = prev.email.trim();
        const inputError = validateExtraEmailInput(trimmed);
        if (inputError !== null) {
          return { ...prev, inputError };
        }
        return { ...prev, inputError: null, isSubmitting: true };
      });
    },
    [loadedClient],
  );

  /**
   * Effect que dispara a chamada HTTP quando `isSubmitting` vira
   * `true` no estado do modal. Separamos o gate (validação +
   * `setIsSubmitting`) do effect para que o `setState` não fique
   * preso a uma mesma referência de `prev.email` com closure stale
   * — o effect lê o valor mais recente via dependency em
   * `addModal.isSubmitting`.
   */
  useEffect(() => {
    if (!addModal.isSubmitting || loadedClient === null) return;
    let isCancelled = false;
    const controller = new AbortController();

    addClientExtraEmail(
      loadedClient.id,
      addModal.email.trim(),
      { signal: controller.signal },
      client,
    )
      .then(() => {
        if (isCancelled) return;
        show('Email extra adicionado.', { variant: 'success' });
        setAddModal(INITIAL_ADD_MODAL_STATE);
        triggerRefetch();
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }
        const action = classifyAddExtraEmailError(error, ADD_ERROR_COPY);
        switch (action.kind) {
          case 'inline':
            setAddModal((prev) => ({
              ...prev,
              inputError: action.message,
              isSubmitting: false,
            }));
            break;
          case 'limit-reached':
            setAddModal((prev) => ({
              ...prev,
              inputError: action.message,
              isSubmitting: false,
            }));
            triggerRefetch();
            break;
          case 'not-found':
            show(action.message, {
              variant: 'danger',
              title: action.title,
            });
            setAddModal(INITIAL_ADD_MODAL_STATE);
            triggerRefetch();
            break;
          case 'toast':
            show(action.message, {
              variant: 'danger',
              title: action.title,
            });
            setAddModal((prev) => ({ ...prev, isSubmitting: false }));
            break;
          case 'unhandled':
            show(action.message, {
              variant: 'danger',
              title: action.title,
            });
            setAddModal((prev) => ({ ...prev, isSubmitting: false }));
            break;
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
    // `addModal.email` capturado no instante em que `isSubmitting`
    // virou `true`; subsequentes keystrokes não disparam novo
    // submit (`isSubmitting=true` só vira `false` ao terminar).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addModal.isSubmitting, loadedClient, client, show, triggerRefetch]);

  /* ─── Remove confirm handlers ─────────────────────────── */

  const handleOpenRemoveConfirm = useCallback((emailDto: ClientEmailDto) => {
    setRemoveConfirm({ target: emailDto, isSubmitting: false });
  }, []);

  const handleCloseRemoveConfirm = useCallback(() => {
    setRemoveConfirm((prev) =>
      prev.isSubmitting ? prev : INITIAL_REMOVE_CONFIRM_STATE,
    );
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    if (
      removeConfirm.isSubmitting ||
      removeConfirm.target === null ||
      loadedClient === null
    ) {
      return;
    }
    const target = removeConfirm.target;
    setRemoveConfirm((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await removeClientExtraEmail(
        loadedClient.id,
        target.id,
        undefined,
        client,
      );
      show('Email extra removido.', { variant: 'success' });
      setRemoveConfirm(INITIAL_REMOVE_CONFIRM_STATE);
      triggerRefetch();
    } catch (error: unknown) {
      const action = classifyRemoveExtraEmailError(error, REMOVE_ERROR_COPY);
      switch (action.kind) {
        case 'username':
          show(action.message, {
            variant: 'danger',
            title: action.title,
          });
          setRemoveConfirm((prev) => ({ ...prev, isSubmitting: false }));
          break;
        case 'not-found':
          show(action.message, {
            variant: 'danger',
            title: action.title,
          });
          setRemoveConfirm(INITIAL_REMOVE_CONFIRM_STATE);
          triggerRefetch();
          break;
        case 'toast':
          show(action.message, {
            variant: 'danger',
            title: action.title,
          });
          setRemoveConfirm((prev) => ({ ...prev, isSubmitting: false }));
          break;
        case 'unhandled':
          show(action.message, {
            variant: 'danger',
            title: action.title,
          });
          setRemoveConfirm((prev) => ({ ...prev, isSubmitting: false }));
          break;
      }
    }
  }, [client, loadedClient, removeConfirm, show, triggerRefetch]);

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
          <EmailList aria-label="Emails extras do cliente">
            {extraEmails.map((emailDto) => (
              <EmailRow
                key={emailDto.id}
                data-testid={`client-extra-emails-row-${emailDto.id}`}
              >
                <EmailLeft>
                  <Icon icon={Mail} size="sm" tone="muted" />
                  <EmailValue title={emailDto.email}>{emailDto.email}</EmailValue>
                </EmailLeft>
                {canUpdate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />}
                    onClick={() => handleOpenRemoveConfirm(emailDto)}
                    aria-label={`Remover email ${emailDto.email}`}
                    data-testid={`client-extra-emails-remove-${emailDto.id}`}
                  >
                    Remover
                  </Button>
                )}
              </EmailRow>
            ))}
          </EmailList>
        )}
      </TabSection>

      <Modal
        open={addModal.open}
        onClose={handleCloseAddModal}
        title="Adicionar email extra"
        description="Informe o novo email a ser cadastrado para este cliente."
        closeOnEsc={!addModal.isSubmitting}
        closeOnBackdrop={!addModal.isSubmitting}
      >
        <ModalForm
          onSubmit={handleSubmitAdd}
          data-testid="client-extra-emails-add-form"
        >
          <Input
            id="client-extra-emails-add-input"
            label="Email"
            type="email"
            placeholder="ana@exemplo.com"
            value={addModal.email}
            onChange={handleEmailChange}
            error={addModal.inputError ?? undefined}
            disabled={addModal.isSubmitting}
            maxLength={EXTRA_EMAIL_MAX}
            autoComplete="email"
            data-testid="client-extra-emails-add-email"
          />
          <ModalActions>
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={handleCloseAddModal}
              disabled={addModal.isSubmitting}
              data-testid="client-extra-emails-add-cancel"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              loading={addModal.isSubmitting}
              data-testid="client-extra-emails-add-submit"
            >
              Adicionar
            </Button>
          </ModalActions>
        </ModalForm>
      </Modal>

      <Modal
        open={removeConfirm.target !== null}
        onClose={handleCloseRemoveConfirm}
        title="Remover email extra?"
        closeOnEsc={!removeConfirm.isSubmitting}
        closeOnBackdrop={!removeConfirm.isSubmitting}
      >
        {removeConfirm.target !== null && (
          <ConfirmBody>
            <ConfirmText data-testid="client-extra-emails-remove-description">
              O email <Mono>{removeConfirm.target.email}</Mono> será
              removido da lista de emails extras deste cliente. Essa
              ação é imediata.
            </ConfirmText>
            <ModalActions>
              <Button
                variant="ghost"
                size="md"
                type="button"
                onClick={handleCloseRemoveConfirm}
                disabled={removeConfirm.isSubmitting}
                data-testid="client-extra-emails-remove-cancel"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="md"
                type="button"
                onClick={handleConfirmRemove}
                loading={removeConfirm.isSubmitting}
                data-testid="client-extra-emails-remove-confirm"
              >
                Remover
              </Button>
            </ModalActions>
          </ConfirmBody>
        )}
      </Modal>
    </>
  );
};
