import React, { useCallback, useEffect, useMemo } from 'react';

import { Modal, useToast } from '../../components/ui';
import { updateTokenType } from '../../shared/api';
import {
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type EditSubmitActionCopy,
} from '../../shared/forms';

import { TokenTypeFormBody } from './TokenTypeFormFields';
import {
  type TokenTypeFieldErrors,
  type TokenTypeFormState,
  type TokenTypeSubmitErrorCopy,
} from './tokenTypesFormShared';
import { useTokenTypeForm, useTokenTypeFormFieldProps } from './useTokenTypeForm';

import type { ApiClient, TokenTypeDto, UpdateTokenTypePayload } from '../../shared/api';

/**
 * Copy injetada em `classifyTokenTypeSubmitError` para o caminho de
 * edição. Os literais aqui são os únicos pontos onde "atualizar"/
 * "outro tipo de token" diferem do "criar"/"um tipo de token" no
 * `NewTokenTypeModal` — o resto da lógica de classificação é
 * compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: TokenTypeSubmitErrorCopy = {
  conflictDefault: 'Já existe outro tipo de token com este código.',
  forbiddenTitle: 'Falha ao atualizar tipo de token',
  genericFallback:
    'Não foi possível atualizar o tipo de token. Tente novamente.',
};

/** Texto exibido inline no campo `code` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE = 'Já existe outro tipo de token com este código.';

/** Texto exibido em toast quando o token type some entre abertura e submit (404). */
const NOT_FOUND_MESSAGE =
  'Tipo de token não encontrado ou foi removido. Atualize a lista.';

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre `EditTokenTypeModal` e os demais modals
 * de edição (`EditSystemModal`/`EditRoleModal`) sem duplicar o switch
 * de dispatch — lição PR #128/#134/#135 reforçada.
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

interface EditTokenTypeModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Tipo de token sendo editado. Pré-popula o form e fornece o `id`
   * usado no `PUT /tokens/types/{id}`. Quando `null`, o modal não
   * renderiza — caller é responsável por só passar `tokenType` quando
   * `open=true`.
   */
  tokenType: TokenTypeDto | null;
  /** Fecha o modal sem persistir. Chamada também após sucesso ou 404. */
  onClose: () => void;
  /**
   * Callback disparado após atualização bem-sucedida ou após detecção
   * de 404 (token type já removido) — em ambos casos a UI quer refetch
   * para sincronizar a tabela com o estado real do backend.
   */
  onUpdated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `updateTokenType` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Constrói o estado inicial do form a partir de uma `TokenTypeDto`.
 * `description: null` (do backend quando vazio) vira string vazia para
 * que o input controlado nunca receba `null`/`undefined` — preserva
 * paridade com o `INITIAL_TOKEN_TYPE_FORM_STATE` do create.
 */
function stateFromTokenType(tokenType: TokenTypeDto): TokenTypeFormState {
  return {
    name: tokenType.name,
    code: tokenType.code,
    description: tokenType.description ?? '',
  };
}

const EMPTY_INITIAL_STATE: TokenTypeFormState = {
  name: '',
  code: '',
  description: '',
};

/* ─── Component ──────────────────────────────────────────── */

/**
 * Modal de edição de tipo de token (Issue #175).
 *
 * Espelha a forma de `EditSystemModal`/`EditRoleModal` (mesma
 * estrutura visual, validação, mapeamento de erros) com três
 * diferenças funcionais relevantes:
 *
 * 1. Pré-popula `formState` com `Name`/`Code`/`Description` do
 *    `tokenType` recebido por prop (atende o critério de aceite
 *    "pré-popula campos").
 * 2. Submit chama `updateTokenType(id, payload)` em vez de
 *    `updateSystem`/`updateRole`.
 * 3. Trata 404 fechando o modal + toast vermelho + refetch (token type
 *    removido concorrentemente entre abertura e submit). Os outros
 *    códigos (409/400/401/403/network) seguem o mesmo mapeamento da
 *    criação, com copy adaptado para "atualizado" e mensagem de
 *    conflito citando "outro tipo de token".
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `tokenTypesFormShared.ts`, os
 * campos vivem em `TokenTypeFormFields`, o estado/handlers do form
 * vêm de `useTokenTypeForm` e o ciclo de submit vem de
 * `useEditEntitySubmit` — evita duplicação ≥10 linhas com os outros
 * modals de edição (BLOCKER de duplicação Sonar, lição PR #134/#135).
 */
export const EditTokenTypeModal: React.FC<EditTokenTypeModalProps> = ({
  open,
  tokenType,
  onClose,
  onUpdated,
  client,
}) => {
  const { show } = useToast();

  // Inicialização defensiva: quando `tokenType` é `null` na primeira
  // render, usamos um estado vazio até o pai entregar o token type. O
  // `useEffect` abaixo sincroniza sempre que `tokenType` muda.
  const tokenTypeForm = useTokenTypeForm(
    tokenType ? stateFromTokenType(tokenType) : EMPTY_INITIAL_STATE,
  );
  const {
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareSubmit,
    applyBadRequest,
  } = tokenTypeForm;

  /**
   * Sincroniza o form sempre que: (a) o modal abre, ou (b) o
   * `tokenType` selecionado muda. Limpa erros pendentes para evitar
   * resíduo entre aberturas (mesmo padrão do `EditSystemModal`/
   * `EditRoleModal`).
   */
  useEffect(() => {
    if (!open || !tokenType) return;
    setFormState(stateFromTokenType(tokenType));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, tokenType, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reseta erros ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã. Não resetamos o
   * `formState` aqui (diferente de um modal de criação) porque o
   * efeito de sincronização re-popula a partir do `tokenType` quando o
   * modal reabre.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que reprova quando o gate de
   * `isSubmitting`/`!tokenType` falhar — preserva o dedupe original
   * ao mover a lógica para dentro de `useEditEntitySubmit` (lição PR
   * #135, 6ª recorrência de Sonar).
   *
   * Reaproveita a mesma lógica de montagem do payload do
   * `NewTokenTypeModal`: trim + omitir `description` quando vazia.
   */
  const prepareSubmitSafe = useCallback((): UpdateTokenTypePayload | null => {
    if (isSubmitting || !tokenType) return null;
    const trimmed = prepareSubmit();
    if (trimmed === null) return null;
    const payload: UpdateTokenTypePayload = {
      name: trimmed.name,
      code: trimmed.code,
    };
    if (trimmed.description.length > 0) {
      payload.description = trimmed.description;
    }
    return payload;
  }, [isSubmitting, prepareSubmit, tokenType]);

  /**
   * Closure sobre `tokenType.id` + `client`. Quando `tokenType` é
   * `null` o `prepareSubmitSafe` já reprova antes do `mutationFn`
   * rodar — a checagem inline aqui é defensiva (preserva o tipo sem
   * `!`).
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> => {
      if (!tokenType) {
        return Promise.reject(new Error('TokenType unavailable.'));
      }
      return updateTokenType(
        tokenType.id,
        payload as UpdateTokenTypePayload,
        undefined,
        client,
      );
    },
    [client, tokenType],
  );

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<EditEntitySubmitCopy>(
    () => ({
      successMessage: 'Tipo de token atualizado.',
      submitErrorCopy: SUBMIT_ERROR_COPY,
      editSubmitActionCopy: EDIT_SUBMIT_ACTION_COPY,
    }),
    [],
  );

  /**
   * `handleSubmit` orquestrado pelo hook compartilhado — encapsula o
   * `try/catch/finally` + `classifyApiSubmitError` +
   * `applyEditSubmitAction` que vivia inline. O bloco extraído tinha
   * ~33 linhas idênticas com os demais modals de edição (lição PR
   * #134/#135).
   */
  const handleSubmit = useEditEntitySubmit<keyof TokenTypeFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
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
    conflictField: 'code',
  });

  // Props compartilhadas com `NewTokenTypeModal` consolidadas num único
  // hook (`useTokenTypeFormFieldProps`) para evitar New Code
  // Duplication ≥10 linhas com o caminho de criação — JSCPD/Sonar
  // tokenizam blocos de props sequenciais como duplicação. Lição PR
  // #134/#135 reforçada.
  const fieldProps = useTokenTypeFormFieldProps(
    tokenTypeForm,
    handleSubmit,
    handleClose,
  );

  // Não renderiza nada quando não houver `tokenType` selecionado — o
  // pai controla `open` em conjunto com `tokenType`, mas cobrimos o
  // caso defensivo de `open=true && tokenType=null` para não quebrar
  // o submit.
  if (!tokenType) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar tipo de token"
      description="Atualize os dados do tipo de token JWT selecionado."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <TokenTypeFormBody
        {...fieldProps}
        idPrefix="edit-token-type"
        submitLabel="Salvar alterações"
      />
    </Modal>
  );
};
