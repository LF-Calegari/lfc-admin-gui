import React, { useCallback, useEffect, useMemo } from "react";

import { Modal, useToast } from "../../components/ui";
import { updateRole } from "../../shared/api";
import {
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type EditSubmitActionCopy,
} from "../../shared/forms";

import { RoleFormBody } from "./RoleFormFields";
import {
  type RoleFieldErrors,
  type RoleFormState,
  type RoleSubmitErrorCopy,
} from "./rolesFormShared";
import { useRoleForm, useRoleFormFieldProps } from "./useRoleForm";

import type { ApiClient, RoleDto } from "../../shared/api";

/**
 * Copy injetada em `classifyRoleSubmitError` para o caminho de
 * edição. Os literais aqui são os únicos pontos onde "atualizar"/
 * "outra role" diferem do "criar"/"uma role" do futuro
 * `NewRoleModal` — o resto da lógica de classificação é
 * compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: RoleSubmitErrorCopy = {
  conflictDefault: "Já existe outra role com este código.",
  forbiddenTitle: "Falha ao atualizar role",
  genericFallback: "Não foi possível atualizar a role. Tente novamente.",
};

/** Texto exibido inline no campo `code` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE =
  "Já existe outra role com este código neste sistema.";

/** Texto exibido em toast quando a role some entre abertura e submit (404). */
const NOT_FOUND_MESSAGE =
  "Role não encontrada ou foi removida. Atualize a lista.";

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre `EditRoleModal` e os demais modals de
 * edição (`EditSystemModal`/`EditRouteModal`) sem duplicar o switch
 * de dispatch — lição PR #128/#134/#135 reforçada.
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

interface EditRoleModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Role sendo editada. Pré-popula o form e fornece o `id` usado no
   * `PUT /roles/{id}`. Quando `null`, o modal não renderiza —
   * caller é responsável por só passar `role` quando `open=true`.
   *
   * Os campos visíveis (`Name`/`Code`/`Description`) vêm do
   * `RoleResponse` enriquecido em `lfc-authenticator#163`/`#164`.
   * Para roles que ainda não receberam `Description` no backend
   * (cenário transitório), o valor `null`/`undefined` vira string
   * vazia no form (mesma estratégia do `EditSystemModal`/
   * `EditRouteModal`).
   */
  role: RoleDto | null;
  /**
   * UUID do sistema dono da role — vem da URL
   * `/systems/:systemId/roles`. Repassado ao
   * `prepareSubmit(systemId)` para construir o body do PUT
   * (`UpdateRoleRequest.SystemId` é `[Required]` no backend após
   * o enriquecimento; tentar omitir devolve 400). O backend rejeita
   * tentativas de mudar o `SystemId` (imutável após criação) com
   * 400 "SystemId é imutável após a criação do role." — daí a UI
   * **nunca** expõe o campo no form e sempre repassa o valor
   * imutável.
   */
  systemId: string;
  /** Fecha o modal sem persistir. Chamada também após sucesso ou 404. */
  onClose: () => void;
  /**
   * Callback disparado após atualização bem-sucedida ou após
   * detecção de 404 (role já removida) — em ambos casos a UI quer
   * refetch para sincronizar a tabela com o estado real do backend.
   */
  onUpdated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção,
   * omitido, `updateRole` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Constrói o estado inicial do form a partir de uma `RoleDto`.
 * `description: null` (do backend quando vazio) vira string vazia
 * para que o input controlado nunca receba `null`/`undefined` —
 * preserva paridade com o `INITIAL_ROLE_FORM_STATE` do create.
 */
function stateFromRole(role: RoleDto): RoleFormState {
  return {
    name: role.name,
    code: role.code,
    description: role.description ?? "",
  };
}

const EMPTY_INITIAL_STATE: RoleFormState = {
  name: "",
  code: "",
  description: "",
};

/* ─── Component ──────────────────────────────────────────── */

/**
 * Modal de edição de role (Issue #68).
 *
 * Espelha a forma de `EditSystemModal`/`EditRouteModal` (mesma
 * estrutura visual, validação, mapeamento de erros) com três
 * diferenças funcionais relevantes:
 *
 * 1. Pré-popula `formState` com `Name`/`Code`/`Description` da
 *    `role` recebida por prop (atende o critério de aceite
 *    "pré-popula campos"). `Description` veio do enriquecimento do
 *    backend em `lfc-authenticator#163`/`#164`.
 * 2. Submit chama `updateRole(id, payload)` com `systemId` injetado
 *    (vem da URL — `RoleRequestBase.SystemId` é `[Required]` no
 *    backend; tentar mudar devolve 400 "SystemId é imutável após
 *    a criação do role.").
 * 3. Trata 404 fechando o modal + toast vermelho + refetch (role
 *    removida concorrentemente entre abertura e submit). Os outros
 *    códigos (409/400/401/403/network) seguem o mesmo mapeamento
 *    da criação, com copy adaptado para "atualizada" e mensagem
 *    de conflito citando "outra role neste sistema".
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `rolesFormShared.ts`, os campos
 * vivem em `RoleFormFields`, o estado/handlers do form vêm de
 * `useRoleForm` e o ciclo de submit vem de `useEditEntitySubmit`
 * — evita duplicação ≥10 linhas com os outros modals de edição
 * (BLOCKER de duplicação Sonar, lição PR #134/#135).
 */
export const EditRoleModal: React.FC<EditRoleModalProps> = ({
  open,
  role,
  systemId,
  onClose,
  onUpdated,
  client,
}) => {
  const { show } = useToast();

  // Inicialização defensiva: quando `role` é `null` na primeira
  // render, usamos um estado vazio até o pai entregar a role. O
  // `useEffect` abaixo sincroniza sempre que `role` muda.
  const roleForm = useRoleForm(
    role ? stateFromRole(role) : EMPTY_INITIAL_STATE,
  );
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
   * Sincroniza o form sempre que: (a) o modal abre, ou (b) a `role`
   * selecionada muda. Limpa erros pendentes para evitar resíduo
   * entre aberturas (mesmo padrão do `EditSystemModal`/
   * `EditRouteModal`).
   */
  useEffect(() => {
    if (!open || !role) return;
    setFormState(stateFromRole(role));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, role, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reseta erros ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar
   * durante submissão é bloqueado para evitar request órfã. Não
   * resetamos o `formState` aqui (diferente de um modal de
   * criação) porque o efeito de sincronização re-popula a partir
   * da `role` quando o modal reabre.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que injeta o `systemId` (vem da
   * URL via prop) e reprova quando o gate de `isSubmitting`/`!role`
   * falhar — preserva o dedupe original ao mover a lógica para
   * dentro de `useEditEntitySubmit` (lição PR #135, 6ª recorrência
   * de Sonar).
   */
  const prepareSubmitSafe = useCallback((): object | null => {
    if (isSubmitting || !role) return null;
    return prepareSubmit(systemId);
  }, [isSubmitting, prepareSubmit, role, systemId]);

  /**
   * Closure sobre `role.id` + `client`. Quando `role` é `null` o
   * `prepareSubmitSafe` já reprova antes do `mutationFn` rodar — a
   * checagem inline aqui é defensiva (preserva o tipo sem `!`).
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> => {
      if (!role) {
        return Promise.reject(new Error("Role unavailable."));
      }
      return updateRole(
        role.id,
        payload as Parameters<typeof updateRole>[1],
        undefined,
        client,
      );
    },
    [client, role],
  );

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<EditEntitySubmitCopy>(
    () => ({
      successMessage: "Role atualizada.",
      submitErrorCopy: SUBMIT_ERROR_COPY,
      editSubmitActionCopy: EDIT_SUBMIT_ACTION_COPY,
    }),
    [],
  );

  /**
   * `handleSubmit` orquestrado pelo hook compartilhado — encapsula
   * o `try/catch/finally` + `classifyApiSubmitError` +
   * `applyEditSubmitAction` que vivia inline. O bloco extraído
   * tinha ~33 linhas idênticas com os demais modals de edição
   * (lição PR #134/#135).
   */
  const handleSubmit = useEditEntitySubmit<keyof RoleFieldErrors>({
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
    conflictField: "code",
  });

  // Props compartilhadas com `NewRoleModal` consolidadas num único
  // hook (`useRoleFormFieldProps`) para evitar New Code Duplication
  // ≥10 linhas com o caminho de criação — JSCPD/Sonar tokenizam
  // blocos de props sequenciais como duplicação. Lição PR #134/#135
  // reforçada — call-sites dos helpers compartilhados também
  // precisam ficar deduplicados, não só os helpers em si.
  const fieldProps = useRoleFormFieldProps(roleForm, handleSubmit, handleClose);

  // Não renderiza nada quando não houver `role` selecionada — o
  // pai controla `open` em conjunto com a `role`, mas cobrimos o
  // caso defensivo de `open=true && role=null` para não quebrar o
  // submit.
  if (!role) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar role"
      description="Atualize os dados da role selecionada."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <RoleFormBody
        {...fieldProps}
        idPrefix="edit-role"
        submitLabel="Salvar alterações"
      />
    </Modal>
  );
};
