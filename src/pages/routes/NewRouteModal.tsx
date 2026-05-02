import React, { useCallback } from 'react';

import { Modal, useToast } from '../../components/ui';
import { createRoute } from '../../shared/api';

import { RouteFormBody } from './RouteFormFields';
import {
  INITIAL_ROUTE_FORM_STATE,
  classifyRouteSubmitError,
  type RouteSubmitErrorCopy,
} from './routeFormShared';
import { useRouteForm } from './useRouteForm';
import { useRouteTokenTypes } from './useRouteTokenTypes';

import type { ApiClient } from '../../shared/api';

/**
 * Copy injetada em `classifyRouteSubmitError` para o caminho de
 * criação. Os literais aqui são os únicos pontos onde "criar"/"uma
 * rota" diferem do "atualizar"/"outra rota" no `EditRouteModal` —
 * o resto da lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: RouteSubmitErrorCopy = {
  conflictDefault: 'Já existe uma rota com este código.',
  forbiddenTitle: 'Falha ao criar rota',
  genericFallback: 'Não foi possível criar a rota. Tente novamente.',
};

/** Texto exibido inline no campo `code` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE = 'Já existe uma rota com este código neste sistema.';

/**
 * Modal de criação de rota (Issue #63 — primeira mutação no recurso
 * Rotas, espelhando o padrão do `NewSystemModal` da EPIC #45).
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob controle desta camada:
 *   ao fechar, resetamos `formState`/`fieldErrors`/`submitError` para
 *   garantir que o usuário não veja resíduo de tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as regras
 *   do backend (`Required`/`MaxLength`/`SystemTokenTypeId`) para dar
 *   feedback imediato e evitar round-trip por erro trivial. As regras
 *   vivem em `routeFormShared.ts` para serem reusadas pelo
 *   `EditRouteModal` (#64) sem duplicação (lição PR #127/#128).
 * - Mapeamento de erro do backend:
 *   - 409 → mensagem inline no campo `code` ("Já existe uma rota com
 *     este código neste sistema.").
 *   - 400 → `details.errors[Field]` mapeado para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Name`/`Code`/
 *     `Description`/`SystemTokenTypeId`).
 *   - 401/403 → toast vermelho com mensagem do backend.
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai),
 *   fecha o modal e dispara toast verde "Rota criada.".
 *
 * **Token types** (política JWT alvo):
 *
 * O ciclo de carregamento da lista vive em `useRouteTokenTypes`
 * (compartilhado com o `EditRouteModal` da #64). Esse hook lida com
 * `AbortController`, filtragem de soft-deletados e derivação de
 * `submitDisabled`/`tokenTypesHelperText` — extraído desde a #64 para
 * evitar a 6ª recorrência de duplicação Sonar (lição PR #134 — bloco
 * idêntico entre modals paralelos é gatilho garantido).
 */

interface NewRouteModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** UUID do sistema dono da rota — vem da URL `/systems/:systemId/routes`. */
  systemId: string;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createRoute`/`listTokenTypes` caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewRouteModal: React.FC<NewRouteModalProps> = ({
  open,
  systemId,
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
    handleSystemTokenTypeIdChange,
    prepareSubmit,
    applyBadRequest,
  } = useRouteForm(INITIAL_ROUTE_FORM_STATE);

  const {
    tokenTypes,
    tokenTypesHelperText,
    submitDisabled,
    resolveEffectiveSubmitError,
  } = useRouteTokenTypes(open, client);

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_ROUTE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFormState, setFieldErrors, setSubmitError]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      // `prepareSubmit` valida + zera erros + marca submitting +
      // devolve payload trimado, ou `null` quando há erros client-
      // side. Mesma rotina será usada pelo `EditRouteModal` (lição
      // PR #128).
      const payload = prepareSubmit(systemId);
      if (!payload) return;

      try {
        await createRoute(payload, undefined, client);
        // Mensagem de sucesso fixa (não precisa do nome — o usuário
        // acabou de digitar e a lista será atualizada).
        show('Rota criada.', { variant: 'success' });
        // Reset local antes de delegar para o pai. Ordem importa:
        // chamamos `onCreated` (refetch) antes de `onClose` para que
        // o pai não tenha que coordenar dois ticks separados.
        setFormState(INITIAL_ROUTE_FORM_STATE);
        setFieldErrors({});
        setSubmitError(null);
        onCreated();
        onClose();
      } catch (error: unknown) {
        // `classifyRouteSubmitError` separa a decisão (puro) do efeito
        // (com setState/show). Tabela única + switch curto evitam a
        // cascata `if (status === 409) { ... } if (... === 400) { ... }`
        // que duplicaria ~25 linhas com o `EditRouteModal` quando a
        // #64 chegar (lição PR #128 — 4ª recorrência de duplicação
        // Sonar foi exatamente esse padrão em `systemFormShared.ts`).
        const action = classifyRouteSubmitError(error, SUBMIT_ERROR_COPY);
        switch (action.kind) {
          case 'conflict':
            // Mensagem inline customizada (citando "neste sistema") em
            // vez de propagar a do backend ("Já existe uma route com
            // este Code.") — mais clara para o operador.
            setFieldErrors({ [action.field]: CONFLICT_INLINE_MESSAGE });
            setSubmitError(null);
            break;
          case 'bad-request':
            applyBadRequest(action.details, action.fallbackMessage);
            break;
          case 'toast':
            show(action.message, { variant: 'danger', title: action.title });
            break;
          // `not-found` (404) não chega no fluxo de create — backend
          // nunca devolve 404 nesse path. Tratamos como `unhandled`
          // por segurança (mostra toast genérico).
          case 'not-found':
          case 'unhandled':
            show(
              action.kind === 'unhandled' ? action.fallback : SUBMIT_ERROR_COPY.genericFallback,
              {
                variant: 'danger',
                title:
                  action.kind === 'unhandled' ? action.title : SUBMIT_ERROR_COPY.forbiddenTitle,
              },
            );
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
      systemId,
    ],
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova rota"
      description="Cadastre uma rota vinculada ao sistema selecionado."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <RouteFormBody
        idPrefix="new-route"
        submitError={resolveEffectiveSubmitError(submitError)}
        values={formState}
        errors={fieldErrors}
        tokenTypes={tokenTypes}
        onChangeName={handleNameChange}
        onChangeCode={handleCodeChange}
        onChangeDescription={handleDescriptionChange}
        onChangeSystemTokenTypeId={handleSystemTokenTypeIdChange}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        isSubmitting={isSubmitting}
        submitLabel="Criar rota"
        submitDisabled={submitDisabled}
        tokenTypesHelperText={tokenTypesHelperText}
      />
    </Modal>
  );
};
