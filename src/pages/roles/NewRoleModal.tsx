import React, { useCallback } from "react";

import { Modal, useToast } from "../../components/ui";
import { createRole } from "../../shared/api";
import { useCreateEntitySubmit } from "../../shared/forms";

import { RoleFormBody } from "./RoleFormFields";
import {
  INITIAL_ROLE_FORM_STATE,
  type RoleFieldErrors,
  type RoleSubmitErrorCopy,
} from "./rolesFormShared";
import { useRoleForm, useRoleFormFieldProps } from "./useRoleForm";

import type { ApiClient, CreateRolePayload } from "../../shared/api";

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de criação
 * de role. Os literais aqui são os únicos pontos onde "criar"/"uma
 * role" diferem do "atualizar"/"outra role" no `EditRoleModal` — o
 * resto da lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: RoleSubmitErrorCopy = {
  conflictDefault: "Já existe uma role com este código.",
  forbiddenTitle: "Falha ao criar role",
  genericFallback: "Não foi possível criar a role. Tente novamente.",
};

/**
 * Texto exibido inline no campo `code` quando o backend devolve 409.
 * Usamos uma copy dedicada (em vez de propagar a do backend, que é
 * "Já existe outro role com este Code neste sistema." com `Code` em
 * PascalCase) para coerência com a UX em pt-BR — o operador lê
 * "código" no label do campo.
 */
const CONFLICT_INLINE_MESSAGE =
  "Já existe uma role com este código neste sistema.";

interface NewRoleModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * UUID do sistema dono da role — vem da URL
   * `/systems/:systemId/roles`. Repassado ao `prepareSubmit(systemId)`
   * para construir o body do POST (`CreateRoleRequest.SystemId` é
   * `[Required]` no backend após o enriquecimento do contrato em
   * `lfc-authenticator#163`/`#164`; tentar omitir devolve 400). A UI
   * **nunca** expõe o campo no form e sempre repassa o valor lido da
   * URL — espelha o desenho do `EditRoleModal` e do `NewRouteModal`.
   */
  systemId: string;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createRole` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de criação de role (Issue #67 — fluxo "criar role" da EPIC
 * #47).
 *
 * Espelha o desenho de `NewSystemModal`/`NewRouteModal`/`NewUserModal`
 * com três diferenças funcionais relevantes:
 *
 * 1. `systemId` chega como prop (lido da URL pela `RolesPage`) e é
 *    injetado no payload via `prepareSubmit(systemId)` — o backend
 *    `RolesController.Create` exige `SystemId` após o enriquecimento
 *    do contrato em `lfc-authenticator#163`/`#164`.
 * 2. 409 mapeia para mensagem inline custom no campo `code`
 *    citando "neste sistema" (unicidade `(SystemId, Code)` no
 *    backend; a copy do controller é "Já existe outro role com este
 *    Code neste sistema." mas a UI usa pt-BR consistente).
 * 3. Sucesso dispara toast verde "Role criada." e `onCreated` antes
 *    de `onClose` — pai responsável pelo refetch.
 *
 * Toda a lógica de validação client-side, parsing de
 * `ValidationProblemDetails`, classificação de erros e dispatch de
 * efeitos colaterais vem de helpers compartilhados:
 *
 * - `useRoleForm` — estado/handlers do form + `prepareSubmit`/
 *   `applyBadRequest`. Decora `useNameCodeDescriptionForm` injetando
 *   `systemId` no payload.
 * - `useCreateEntitySubmit` — orquestra `try/catch/finally` +
 *   `classifyApiSubmitError` + `applyCreateSubmitAction` (lição PR
 *   #135 — call-site também duplica entre modals de criação).
 * - `useRoleFormFieldProps` — consolida props sequenciais para
 *   `<RoleFormBody>`, evitando bloco repetido de ~10 linhas com
 *   `EditRoleModal` (lição PR #134/#135).
 * - `RoleFormBody` — wrapper fino do `NameCodeDescriptionFormBody`
 *   compartilhado entre roles e sistemas.
 */
export const NewRoleModal: React.FC<NewRoleModalProps> = ({
  open,
  systemId,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const roleForm = useRoleForm(INITIAL_ROLE_FORM_STATE);
  const {
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareSubmit,
    applyBadRequest,
  } = roleForm;

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar
   * durante submissão é bloqueado para evitar request órfã (sem
   * `AbortController` nessa primeira iteração — backend é rápido e
   * o usuário não consegue disparar duas vezes graças ao `disabled`
   * no botão).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_ROLE_FORM_STATE);
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
   * comportamento esperado. Espelha o padrão de `NewUserModal`.
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_ROLE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [setFormState, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que injeta o `systemId` (vem da URL
   * via prop) — preserva a assinatura `() => unknown | null` exigida
   * por `useCreateEntitySubmit.callbacks.prepareSubmit`. Idêntico em
   * espírito ao wrapper do `EditRoleModal` (que faz o mesmo + gate
   * de `role !== null`).
   */
  const prepareSubmitWithSystemId = useCallback(
    (): CreateRolePayload | null => prepareSubmit(systemId),
    [prepareSubmit, systemId],
  );

  /**
   * `mutationFn` injetada no helper genérico. Tipa o payload via cast
   * para `CreateRolePayload` porque o helper aceita `unknown` (o cast
   * é seguro — `prepareSubmit` só devolve `CreateRolePayload | null`,
   * e o helper já filtrou `null` antes de chamar `mutationFn`).
   */
  const mutationFn = useCallback(
    (payload: unknown) =>
      createRole(payload as CreateRolePayload, undefined, client),
    [client],
  );

  const handleSubmit = useCreateEntitySubmit<keyof RoleFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
      resetForm,
    },
    copy: {
      successMessage: "Role criada.",
      conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
      submitErrorCopy: SUBMIT_ERROR_COPY,
    },
    callbacks: {
      prepareSubmit: prepareSubmitWithSystemId,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField: "code",
  });

  // Props compartilhadas com `EditRoleModal` consolidadas num único
  // hook (`useRoleFormFieldProps`) para evitar New Code Duplication
  // ≥10 linhas com o caminho de edição — JSCPD/Sonar tokenizam
  // blocos de props sequenciais como duplicação. Lição PR #134/#135
  // reforçada.
  const fieldProps = useRoleFormFieldProps(roleForm, handleSubmit, handleClose);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova role"
      description="Cadastre uma role vinculada ao sistema selecionado."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <RoleFormBody
        {...fieldProps}
        idPrefix="new-role"
        submitLabel="Criar role"
      />
    </Modal>
  );
};
