import React, { useCallback, useMemo } from 'react';

import { Modal, useToast } from '../../components/ui';
import { createTokenType } from '../../shared/api';
import {
  useCreateEntitySubmit,
  type CreateEntitySubmitCopy,
} from '../../shared/forms';

import { TokenTypeFormBody } from './TokenTypeFormFields';
import {
  INITIAL_TOKEN_TYPE_FORM_STATE,
  type TokenTypeFieldErrors,
  type TokenTypeSubmitErrorCopy,
} from './tokenTypesFormShared';
import { useTokenTypeForm, useTokenTypeFormFieldProps } from './useTokenTypeForm';

import type { ApiClient, CreateTokenTypePayload } from '../../shared/api';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de criação
 * de token type. Os literais aqui são os únicos pontos onde "criar"/
 * "um token type" diferem do "atualizar"/"outro token type" no
 * `EditTokenTypeModal` — o resto da lógica de classificação é
 * compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: TokenTypeSubmitErrorCopy = {
  conflictDefault: 'Já existe um tipo de token com este código.',
  forbiddenTitle: 'Falha ao criar tipo de token',
  genericFallback: 'Não foi possível criar o tipo de token. Tente novamente.',
};

/**
 * Texto exibido inline no campo `code` quando o backend devolve 409.
 * Usamos uma copy dedicada (em vez de propagar a do backend, que é
 * "Já existe um token type com este Code." com `Code` em PascalCase)
 * para coerência com a UX em pt-BR — o operador lê "código" no label
 * do campo. Espelha o desenho de `NewRoleModal` (#67).
 */
const CONFLICT_INLINE_MESSAGE = 'Já existe um tipo de token com este código.';

interface NewTokenTypeModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createTokenType` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de criação de tipo de token (Issue #175 — primeiro fluxo de
 * mutação do recurso `/tokens`, finalmente substituindo o
 * `<PlaceholderPage>` mockado).
 *
 * Decisões:
 *
 * - **Componente "controlado por aberto" pelo pai** (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob nosso controle: ao
 *   fechar, resetamos `formState`/`fieldErrors`/`submitError` para
 *   garantir que o usuário não veja resíduo de tentativa anterior.
 * - **Validação client-side antes de submeter** — replica as regras do
 *   backend (`Required` + `MaxLength`) para dar feedback imediato e
 *   evitar round-trip por erro trivial. As regras vivem em
 *   `tokenTypesFormShared.ts` para serem reusadas pelo
 *   `EditTokenTypeModal` — qualquer alteração no contrato pega os dois
 *   call sites sem duplicação (lição PR #123/#127).
 * - **Mapeamento de erro do backend:**
 *   - 409 → mensagem inline no campo `code` (`CONFLICT_INLINE_MESSAGE`).
 *   - 400 → mapeamos `details.errors[Field]` para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Name`/`Code`/`Description`,
 *     UI usa `name`/`code`/`description`).
 *   - 401/403 → toast vermelho com mensagem do backend.
 *   - Demais → toast vermelho com mensagem genérica.
 * - **Sucesso**: chama `onCreated` (refetch responsabilidade do pai),
 *   fecha o modal e dispara toast verde "Tipo de token criado.".
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `tokenTypesFormShared.ts`, os
 * campos vivem em `TokenTypeFormFields`, o estado/handlers do form
 * vêm de `useTokenTypeForm` e o ciclo de submit vem de
 * `useCreateEntitySubmit` — evita duplicação ≥10 linhas com os outros
 * modals de criação (BLOCKER de duplicação Sonar, lição PR
 * #128/#134/#135).
 */
export const NewTokenTypeModal: React.FC<NewTokenTypeModalProps> = ({
  open,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const tokenTypeForm = useTokenTypeForm(INITIAL_TOKEN_TYPE_FORM_STATE);
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
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã (sem
   * `AbortController` nessa primeira iteração — backend é rápido e o
   * usuário não consegue disparar duas vezes graças ao `disabled` no
   * botão).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_TOKEN_TYPE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reset disparado pelo helper `useCreateEntitySubmit` no caminho
   * feliz (antes de `onCreated`/`onClose`). Mantemos uma referência
   * dedicada (em vez de reusar `handleClose`) porque `handleClose` é
   * gateado por `isSubmitting` — o submit feliz roda exatamente
   * quando `isSubmitting === true`, então o gate inverteria o
   * comportamento esperado. Espelha o padrão de
   * `NewRoleModal`/`NewClientModal`.
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_TOKEN_TYPE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [setFormState, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que reprova quando o gate de
   * `isSubmitting` falhar — preserva o dedupe ao mover a lógica para
   * dentro de `useCreateEntitySubmit`. Token types não precisam injetar
   * `systemId` (diferente de roles/rotas), então o tipo retornado é
   * direto `CreateTokenTypePayload | null`.
   */
  const prepareSubmitSafe = useCallback((): CreateTokenTypePayload | null => {
    if (isSubmitting) return null;
    const trimmed = prepareSubmit();
    if (trimmed === null) return null;
    // `description` chega trimada; quando vazia, omitir do payload faz
    // o serializador descartar o campo e o backend converter para
    // `null` (espelha o desenho de `buildTokenTypeMutationBody` no
    // wrapper HTTP — o helper aplica trim defensivo simétrico).
    const payload: CreateTokenTypePayload = {
      name: trimmed.name,
      code: trimmed.code,
    };
    if (trimmed.description.length > 0) {
      payload.description = trimmed.description;
    }
    return payload;
  }, [isSubmitting, prepareSubmit]);

  /**
   * `mutationFn` injetada no helper genérico. Tipa o payload via cast
   * para `CreateTokenTypePayload` porque o helper aceita `unknown` (o
   * cast é seguro — `prepareSubmitSafe` só devolve
   * `CreateTokenTypePayload | null`, e o helper já filtrou `null`
   * antes de chamar `mutationFn`).
   */
  const mutationFn = useCallback(
    (payload: unknown) =>
      createTokenType(payload as CreateTokenTypePayload, undefined, client),
    [client],
  );

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<CreateEntitySubmitCopy>(
    () => ({
      successMessage: 'Tipo de token criado.',
      conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
      submitErrorCopy: SUBMIT_ERROR_COPY,
    }),
    [],
  );

  const handleSubmit = useCreateEntitySubmit<keyof TokenTypeFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
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
    conflictField: 'code',
  });

  // Props compartilhadas com `EditTokenTypeModal` consolidadas num
  // único hook (`useTokenTypeFormFieldProps`) para evitar New Code
  // Duplication ≥10 linhas com o caminho de edição — JSCPD/Sonar
  // tokenizam blocos de props sequenciais como duplicação. Lição PR
  // #134/#135 reforçada.
  const fieldProps = useTokenTypeFormFieldProps(
    tokenTypeForm,
    handleSubmit,
    handleClose,
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo tipo de token"
      description="Cadastre um novo tipo de token JWT no catálogo do auth-service."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <TokenTypeFormBody
        {...fieldProps}
        idPrefix="new-token-type"
        submitLabel="Criar tipo de token"
      />
    </Modal>
  );
};
