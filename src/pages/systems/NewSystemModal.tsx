import React, { useCallback } from 'react';

import { Modal, useToast } from '../../components/ui';
import { createSystem } from '../../shared/api';

import { SystemFormBody } from './SystemFormFields';
import {
  INITIAL_SYSTEM_FORM_STATE,
  classifySubmitError,
  type SubmitErrorCopy,
} from './systemFormShared';
import { useSystemForm } from './useSystemForm';

import type { ApiClient } from '../../shared/api';

/**
 * Copy injetada em `classifySubmitError` para o caminho de criação. Os
 * literais aqui são os únicos pontos onde "criar"/"um sistema" diferem
 * do "atualizar"/"outro sistema" no `EditSystemModal` — o resto da
 * lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: SubmitErrorCopy = {
  conflictDefault: 'Já existe um sistema com este Code.',
  forbiddenTitle: 'Falha ao criar sistema',
  genericFallback: 'Não foi possível criar o sistema. Tente novamente.',
};

/**
 * Modal de criação de sistema (Issue #58 — primeiro fluxo de mutação da
 * `SystemsPage`).
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob nosso controle: ao
 *   fechar, resetamos `formState`/`fieldErrors`/`submitError` na próxima
 *   reabertura para garantir que o usuário não veja resíduo de
 *   tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as regras do
 *   backend (`Required` + `MaxLength`) para dar feedback imediato e
 *   evitar round-trip por erro trivial. As regras vivem em
 *   `systemFormShared.ts` para serem reusadas por `EditSystemModal`
 *   (Issue #59) — qualquer alteração no contrato pega os dois call sites
 *   sem duplicação (lição PR #123/#127). O state do form +
 *   change-handlers vivem em `useSystemForm`.
 * - Mapeamento de erro do backend:
 *   - 409 → mensagem inline no campo `code` ("Já existe um sistema com
 *     este Code." — texto exato do backend).
 *   - 400 → mapeamos `details.errors[Field]` para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Name`/`Code`/`Description`,
 *     UI usa `name`/`code`/`description`).
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai), fecha
 *   o modal e dispara toast verde.
 *
 * Sem dependência nova: tudo reusa Input/Textarea/Button/Modal/Alert/
 * useToast já presentes no design system local.
 */

interface NewSystemModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewSystemModal: React.FC<NewSystemModalProps> = ({
  open,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    handleNameChange,
    handleCodeChange,
    handleDescriptionChange,
    prepareSubmit,
    applyBadRequest,
  } = useSystemForm(INITIAL_SYSTEM_FORM_STATE);

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e botão
   * Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã (sem `AbortController`
   * nessa primeira iteração — o backend é rápido e o usuário não consegue
   * disparar duas vezes graças ao `disabled` no botão).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_SYSTEM_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFormState, setFieldErrors, setSubmitError]);

  const handleSubmit = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      // `prepareSubmit` valida + zera erros + marca submitting + devolve
      // payload trimado, ou `null` quando há erros client-side. Mesma
      // rotina é usada pelo `EditSystemModal` (lição PR #127 — duplicação
      // ≥10 linhas em 2+ arquivos é BLOCKER do Sonar).
      const payload = prepareSubmit();
      if (!payload) return;

      try {
        await createSystem(payload, undefined, client);
        // Mensagem de sucesso fixa (não precisa do nome — o usuário
        // acabou de digitar e a lista será atualizada).
        show('Sistema criado.', { variant: 'success' });
        // Reset local antes de delegar para o pai. Ordem importa:
        // chamamos `onCreated` (refetch) antes de `onClose` para que o
        // pai não tenha que coordenar dois ticks separados.
        setFormState(INITIAL_SYSTEM_FORM_STATE);
        setFieldErrors({});
        setSubmitError(null);
        onCreated();
        onClose();
      } catch (error: unknown) {
        // `classifySubmitError` separa a decisão (puro) do efeito (com
        // setState/show). Tabela única + switch curto evitam a cascata
        // `if (status === 409) { ... } if (... === 400) { ... }` que
        // duplicava ~25 linhas com o `EditSystemModal` (lição PR #128).
        const action = classifySubmitError(error, SUBMIT_ERROR_COPY);
        switch (action.kind) {
          case 'conflict':
            setFieldErrors({ [action.field]: action.message });
            setSubmitError(null);
            break;
          case 'bad-request':
            applyBadRequest(action.details, action.fallbackMessage);
            break;
          case 'toast':
            show(action.message, { variant: 'danger', title: action.title });
            break;
          // `not-found` (404) não chega no fluxo de create — backend nunca
          // devolve 404 nesse path. Tratamos como `unhandled` por
          // segurança (mostra toast genérico).
          case 'not-found':
          case 'unhandled':
            show(action.kind === 'unhandled' ? action.fallback : SUBMIT_ERROR_COPY.genericFallback, {
              variant: 'danger',
              title: action.kind === 'unhandled' ? action.title : SUBMIT_ERROR_COPY.forbiddenTitle,
            });
            break;
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyBadRequest,
      client,
      isSubmitting,
      onClose,
      onCreated,
      prepareSubmit,
      setFieldErrors,
      setFormState,
      setIsSubmitting,
      setSubmitError,
      show,
    ],
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo sistema"
      description="Cadastre um novo sistema no catálogo do auth-service."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <SystemFormBody
        idPrefix="new-system"
        submitError={submitError}
        values={formState}
        errors={fieldErrors}
        onChangeName={handleNameChange}
        onChangeCode={handleCodeChange}
        onChangeDescription={handleDescriptionChange}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        isSubmitting={isSubmitting}
        submitLabel="Criar sistema"
      />
    </Modal>
  );
};
