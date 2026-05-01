import React, { useCallback, useEffect } from 'react';

import { Modal, useToast } from '../../components/ui';
import { updateSystem } from '../../shared/api';
import { applyEditSubmitAction, type EditSubmitActionCopy } from '../../shared/forms';

import { SystemFormBody } from './SystemFormFields';
import {
  classifySubmitError,
  type SubmitErrorCopy,
  type SystemFieldErrors,
  type SystemFormState,
} from './systemFormShared';
import { useSystemForm } from './useSystemForm';

import type { ApiClient, SystemDto } from '../../shared/api';

/**
 * Copy injetada em `classifySubmitError` para o caminho de edição. Os
 * literais aqui são os únicos pontos onde "atualizar"/"outro sistema"
 * diferem do "criar"/"um sistema" no `NewSystemModal` — o resto da
 * lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: SubmitErrorCopy = {
  conflictDefault: 'Já existe outro sistema com este Code.',
  forbiddenTitle: 'Falha ao atualizar sistema',
  genericFallback: 'Não foi possível atualizar o sistema. Tente novamente.',
};

/** Texto exibido em toast quando o sistema some entre abertura e submit (404). */
const NOT_FOUND_MESSAGE = 'Sistema não encontrado ou foi removido. Atualize a lista.';

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre `EditSystemModal` e `EditRouteModal`
 * sem duplicar a árvore de switch (lição PR #128/#134).
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  // `conflictInlineMessage` ausente → o helper usa `action.message`
  // (mensagem do backend), preservando o comportamento histórico do
  // `EditSystemModal` ("Já existe outro sistema com este Code." vinha
  // direto do `RoutesController`).
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

/**
 * Modal de edição de sistema (Issue #59).
 *
 * Espelha a forma do `NewSystemModal` (mesma estrutura visual,
 * validação, mapeamento de erros) com três diferenças funcionais:
 *
 * 1. Pré-popula `formState` com os campos do `system` recebido por prop
 *    — atende o critério de aceite "pré-popula com dados atuais".
 * 2. Submit chama `updateSystem(id, payload)` em vez de `createSystem`.
 * 3. Trata 404 fechando o modal + toast vermelho + refetch (sistema foi
 *    removido por outra sessão entre a abertura e o submit). Os outros
 *    códigos (409/400/401/403/network) seguem o mesmo mapeamento da
 *    criação, com copy adaptado para "atualizado".
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `systemFormShared.ts`, os campos
 * vivem em `SystemFormFields`, e o estado/handlers do form vêm de
 * `useSystemForm` — evita duplicação ≥10 linhas com o `NewSystemModal`
 * (BLOCKER de duplicação Sonar, lição PR #123/#127).
 */

interface EditSystemModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Sistema sendo editado. Pré-popula o form e fornece o `id` usado no
   * `PUT /systems/{id}`. Quando `null`/`undefined`, o modal não
   * renderiza — caller é responsável por só passar `system` quando
   * `open` for `true`.
   */
  system: SystemDto | null;
  /** Fecha o modal sem persistir. Chamada também após sucesso ou 404. */
  onClose: () => void;
  /**
   * Callback disparado após atualização bem-sucedida ou após detecção
   * de 404 (item já removido) — em ambos casos a UI quer refetch para
   * sincronizar a tabela com o estado real do backend.
   */
  onUpdated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `updateSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Constrói o estado inicial do form a partir de um `SystemDto`.
 * `description: null` (do backend quando vazio) vira string vazia para
 * que o input controlado nunca receba `null`/`undefined` — preserva
 * paridade com o `INITIAL_SYSTEM_FORM_STATE` do create.
 */
function stateFromSystem(system: SystemDto): SystemFormState {
  return {
    name: system.name,
    code: system.code,
    description: system.description ?? '',
  };
}

const EMPTY_INITIAL_STATE: SystemFormState = { name: '', code: '', description: '' };

/* ─── Component ──────────────────────────────────────────── */

export const EditSystemModal: React.FC<EditSystemModalProps> = ({
  open,
  system,
  onClose,
  onUpdated,
  client,
}) => {
  const { show } = useToast();
  // Inicialização defensiva: quando `system` é `null` na primeira render,
  // usamos um estado vazio até o pai entregar o sistema. O `useEffect`
  // abaixo sincroniza sempre que `system` muda (típico fluxo: pai abre
  // modal trocando o `system` selecionado).
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
  } = useSystemForm(system ? stateFromSystem(system) : EMPTY_INITIAL_STATE);

  /**
   * Sincroniza o form sempre que: (a) o modal abre, ou (b) o `system`
   * selecionado muda. Limpa erros pendentes para evitar resíduo entre
   * aberturas (mesmo padrão do `NewSystemModal`, mas baseado em
   * `system.id` em vez de reset puro).
   */
  useEffect(() => {
    if (!open || !system) return;
    setFormState(stateFromSystem(system));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, system, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e botão
   * Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setSubmitError]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting || !system) return;

      // `prepareSubmit` valida + zera erros + marca submitting + devolve
      // payload trimado, ou `null` quando há erros client-side. Idêntico
      // ao usado no `NewSystemModal` — extrair eliminou ~14 linhas de
      // boilerplate duplicadas (lição PR #127).
      const payload = prepareSubmit();
      if (!payload) return;

      try {
        await updateSystem(system.id, payload, undefined, client);
        // Mensagem de sucesso fixa (não citamos o nome porque o usuário
        // acabou de editá-lo — a lista será atualizada).
        show('Sistema atualizado.', { variant: 'success' });
        // Ordem importa: refetch antes de fechar para o pai não ter que
        // coordenar dois ticks separados.
        setFieldErrors({});
        setSubmitError(null);
        onUpdated();
        onClose();
      } catch (error: unknown) {
        // `classifySubmitError` decide o `kind`; `applyEditSubmitAction`
        // despacha os efeitos colaterais (setState/toast/onClose) — o
        // switch de 33 linhas que vivia inline foi extraído em
        // `src/shared/forms/applyEditSubmitAction.ts` para ser
        // compartilhado com o `EditRouteModal` (lição PR #134, evita
        // 6ª recorrência de New Code Duplication no Sonar).
        const action = classifySubmitError(error, SUBMIT_ERROR_COPY);
        applyEditSubmitAction<keyof SystemFieldErrors>(
          action,
          {
            setFieldErrors,
            setSubmitError,
            applyBadRequest,
            showToast: show,
            onAfterNotFound: () => {
              onUpdated();
              onClose();
            },
          },
          EDIT_SUBMIT_ACTION_COPY,
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyBadRequest,
      client,
      isSubmitting,
      onClose,
      onUpdated,
      prepareSubmit,
      setFieldErrors,
      setIsSubmitting,
      setSubmitError,
      show,
      system,
    ],
  );

  // Não renderiza nada quando não houver `system` selecionado — o pai
  // controla `open` em conjunto com o `system`, mas cobrimos o caso
  // defensivo de `open=true && system=null` para não quebrar o submit.
  if (!system) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar sistema"
      description="Atualize os dados do sistema selecionado."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <SystemFormBody
        idPrefix="edit-system"
        submitError={submitError}
        values={formState}
        errors={fieldErrors}
        onChangeName={handleNameChange}
        onChangeCode={handleCodeChange}
        onChangeDescription={handleDescriptionChange}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        isSubmitting={isSubmitting}
        submitLabel="Salvar alterações"
      />
    </Modal>
  );
};
