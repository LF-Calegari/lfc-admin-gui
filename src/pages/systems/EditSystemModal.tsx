import React, { useCallback, useEffect } from 'react';

import { Modal, useToast } from '../../components/ui';
import { isApiError, updateSystem } from '../../shared/api';

import { SystemFormBody } from './SystemFormFields';
import { type SystemFormState } from './systemFormShared';
import { useSystemForm } from './useSystemForm';

import type { ApiClient, ApiError, SystemDto } from '../../shared/api';

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
        if (isApiError(error)) {
          const apiError = error as ApiError;
          if (apiError.status === 409) {
            // Conflito de Code único — outro sistema já usa este code.
            // Backend devolve "Já existe outro sistema com este Code." —
            // preservamos a mensagem dele em vez de repetir literal.
            setFieldErrors({
              code: apiError.message ?? 'Já existe outro sistema com este Code.',
            });
            setSubmitError(null);
            return;
          }
          if (apiError.status === 400) {
            // `applyBadRequest` (do `useSystemForm`) distribui entre
            // erros por campo e Alert genérico no topo do form —
            // implementação idêntica entre create e edit (lição PR #127).
            applyBadRequest(apiError.details, apiError.message);
            return;
          }
          if (apiError.status === 404) {
            // Sistema removido (ou soft-deleted) entre abertura e submit.
            // Fechamos modal + toast + refetch para sincronizar a tabela.
            show('Sistema não encontrado ou foi removido. Atualize a lista.', {
              variant: 'danger',
              title: 'Falha ao atualizar sistema',
            });
            onUpdated();
            onClose();
            return;
          }
          if (apiError.status === 401 || apiError.status === 403) {
            // 401 já foi tratado pelo cliente HTTP; 403 = perda de
            // permissão entre abertura e submit. Toast vermelho com a
            // mensagem do backend.
            show(apiError.message ?? 'Você não tem permissão para esta ação.', {
              variant: 'danger',
              title: 'Falha ao atualizar sistema',
            });
            return;
          }
        }
        // Fallback genérico — rede/parse/5xx/erro arbitrário.
        show('Não foi possível atualizar o sistema. Tente novamente.', {
          variant: 'danger',
          title: 'Falha ao atualizar sistema',
        });
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
