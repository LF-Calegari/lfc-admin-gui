import React, { useCallback, useMemo } from 'react';

import { Modal, useToast } from '../../components/ui';
import { createClient } from '../../shared/api';
import {
  useCreateEntitySubmit,
  type CreateEntitySubmitCopy,
} from '../../shared/forms';

import { ClientFormBody } from './ClientFormFields';
import {
  INITIAL_CLIENT_FORM_STATE,
  type ClientFieldErrors,
  type ClientSubmitErrorCopy,
} from './clientsFormShared';
import { useClientForm, useClientFormFieldProps } from './useClientForm';

import type { ApiClient } from '../../shared/api';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de
 * criação. Os literais aqui são os únicos pontos onde "criar"/
 * "um cliente" diferem do "atualizar"/"outro cliente" no futuro
 * `EditClientModal` — o resto da lógica de classificação é
 * compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: ClientSubmitErrorCopy = {
  conflictDefault: 'Já existe um cliente com este documento.',
  forbiddenTitle: 'Falha ao criar cliente',
  genericFallback: 'Não foi possível criar o cliente. Tente novamente.',
};

/**
 * Modal de criação de cliente (Issue #74 — primeira mutação no
 * recurso Clientes da EPIC #49, espelhando o padrão dos modals de
 * sistemas/rotas/roles).
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob controle desta
 *   camada: ao fechar, resetamos `formState`/`fieldErrors`/
 *   `submitError` para garantir que o usuário não veja resíduo de
 *   tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as
 *   regras do backend (`Required`/`MaxLength`/`IsValidCpf`/
 *   `IsValidCnpj`) para dar feedback imediato e evitar round-trip
 *   por erro trivial. As regras vivem em `clientsFormShared.ts`
 *   para serem reusadas pelo `EditClientModal` (Issue #75) sem
 *   duplicação (lição PR #127/#128).
 * - Mapeamento de erro do backend:
 *   - 409 → mensagem inline no campo de unicidade correspondente
 *     ao tipo (`cpf` para PF, `cnpj` para PJ). A mensagem do
 *     backend ("Já existe cliente com este CPF." / "Já existe
 *     cliente com este CNPJ.") já é clara — propagamos sem
 *     reescrever.
 *   - 400 → `details.errors[Field]` mapeado para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Type`/`Cpf`/
 *     `FullName`/`Cnpj`/`CorporateName`).
 *   - 401/403 → toast vermelho com mensagem do backend.
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai),
 *   fecha o modal e dispara toast verde "Cliente criado.".
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `clientsFormShared.ts`, os
 * campos vivem em `ClientFormFields`, o estado/handlers do form
 * vêm de `useClientForm` e o ciclo de submit vem de
 * `useCreateEntitySubmit` — evita duplicação ≥10 linhas com os
 * outros modals de criação (BLOCKER de duplicação Sonar, lição
 * PR #128/#134/#135).
 */

interface NewClientModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção,
   * omitido, `createClient` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewClientModal: React.FC<NewClientModalProps> = ({
  open,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const clientForm = useClientForm(INITIAL_CLIENT_FORM_STATE);
  const {
    formState,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareSubmit,
    applyBadRequest,
  } = clientForm;

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X
   * e botão Cancelar; previne resíduo entre aberturas. Cancelar
   * durante submissão é bloqueado para evitar request órfã.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_CLIENT_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que reprova quando o gate de
   * `isSubmitting` falhar — preserva o dedupe ao mover a lógica
   * para dentro de `useCreateEntitySubmit`.
   */
  const prepareSubmitSafe = useCallback((): Record<string, unknown> | null => {
    if (isSubmitting) return null;
    return prepareSubmit();
  }, [isSubmitting, prepareSubmit]);

  /**
   * Closure sobre `client`. `payload` é o `CreateClientPayload`
   * já validado/normalizado pelo `prepareSubmit`.
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> =>
      createClient(payload as Parameters<typeof createClient>[0], undefined, client),
    [client],
  );

  /**
   * Reset memoizado consumido pelo `useCreateEntitySubmit` no caminho
   * feliz — limpa `formState`/`fieldErrors`/`submitError` antes de
   * `onCreated`/`onClose` para que uma reabertura imediata do modal
   * não veja resíduo. Espelha o padrão do `NewUserModal`/`NewSystemModal`.
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_CLIENT_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [setFormState, setFieldErrors, setSubmitError]);

  /**
   * Copy estável (não muda entre renders) — memoizada para fechar
   * a deps array do hook sem recriar referência a cada tick.
   *
   * `conflictInlineMessage` deixado `undefined` — propagamos a
   * mensagem do backend que já discrimina CPF vs CNPJ ("Já existe
   * cliente com este CPF." / "Já existe cliente com este CNPJ.").
   */
  const submitCopy = useMemo<CreateEntitySubmitCopy>(
    () => ({
      successMessage: 'Cliente criado.',
      submitErrorCopy: SUBMIT_ERROR_COPY,
    }),
    [],
  );

  /**
   * O `conflictField` muda em runtime conforme o tipo (`cpf` para
   * PF, `cnpj` para PJ). O backend valida unicidade global do
   * documento — quando a UI cria um PF, o conflito só pode ser de
   * `cpf`; quando cria PJ, só de `cnpj`. Repassar o tipo correto
   * aqui garante que o `setFieldErrors` projete a mensagem no
   * campo certo.
   */
  const conflictField: keyof ClientFieldErrors = formState.type === 'PF' ? 'cpf' : 'cnpj';

  /**
   * `handleSubmit` orquestrado pelo hook compartilhado — encapsula
   * o `try/catch/finally` + `classifyApiSubmitError` +
   * `applyCreateSubmitAction` que vivia inline. Helper extraído em
   * PR #155 (#78 - users) para eliminar duplicação Sonar entre
   * NewSystemModal/NewRouteModal/NewUserModal — reusamos aqui sem
   * adicionar 4ª cópia (lição PR #128/#134/#135).
   */
  const handleSubmit = useCreateEntitySubmit<keyof ClientFieldErrors>({
    dispatchers: {
      setFieldErrors: clientForm.setFieldErrors,
      setSubmitError: clientForm.setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
      resetForm,
    },
    copy: submitCopy,
    callbacks: {
      prepareSubmit: prepareSubmitSafe,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField,
  });

  // `useClientFormFieldProps` encapsula as ~12 linhas de spread de
  // handlers (`onChangeType/Cpf/FullName/...`) que JSCPD/Sonar
  // tokenizaria como duplicação entre `NewClientModal` e
  // `ClientDataTab` — lição PR #134/#135 aplicada antecipadamente
  // (call-sites duplicados também precisam virar hook compartilhado,
  // não só os helpers internos).
  const fieldProps = useClientFormFieldProps(clientForm, handleSubmit, handleClose);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo cliente"
      description="Cadastre um novo cliente (pessoa física ou jurídica) no ecossistema."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <ClientFormBody
        {...fieldProps}
        idPrefix="new-client"
        submitLabel="Criar cliente"
      />
    </Modal>
  );
};
