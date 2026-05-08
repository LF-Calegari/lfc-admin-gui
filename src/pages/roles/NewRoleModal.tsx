import React, { useCallback, useEffect, useState } from "react";

import { Modal, Select, useToast } from "../../components/ui";
import { createRole } from "../../shared/api";
import {
  useCreateEntitySubmit,
  type CreateEntitySubmitSuccessContext,
} from "../../shared/forms";

import { RoleFormBody } from "./RoleFormFields";
import {
  INITIAL_ROLE_FORM_STATE,
  type RoleFieldErrors,
  type RoleSubmitErrorCopy,
} from "./rolesFormShared";
import { useRoleForm, useRoleFormFieldProps } from "./useRoleForm";

import type {
  ApiClient,
  CreateRolePayload,
  SystemDto,
} from "../../shared/api";

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

const EMPTY_SYSTEMS: ReadonlyArray<SystemDto> = [];

export type NewRoleModalProps = {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /**
   * Callback após criação bem-sucedida (refetch no pai). Recebe o
   * payload enviado ao POST quando útil (Issue #193 — filtro na lista
   * global).
   */
  onCreated: (context?: CreateEntitySubmitSuccessContext) => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createRole` cai no singleton `apiClient`.
   */
  client?: ApiClient;
} & (
  | {
      /**
       * `systemId` fixo vindo da URL `/systems/:systemId/roles`
       * (`RolesPage`).
       */
      variant: "scoped";
      systemId: string;
    }
  | {
      /**
       * Catálogo carregado pelo pai (`listSystems`) — operador escolhe
       * o sistema dono antes de nome/código (Issue #193).
       */
      variant: "global";
      systems: ReadonlyArray<SystemDto>;
    }
);

/**
 * Modal de criação de role (Issue #67 — fluxo "criar role" da EPIC
 * #47; Issue #193 — variante global com `<Select>` de sistema).
 *
 * Espelha o desenho de `NewSystemModal`/`NewRouteModal`/`NewUserModal`
 * com três diferenças funcionais relevantes:
 *
 * 1. `systemId` chega como prop na variante `scoped` (URL da
 *    `RolesPage`) ou via estado local + catálogo na variante `global`.
 *    O backend `RolesController.Create` exige `SystemId`.
 * 2. 409 mapeia para mensagem inline custom no campo `code`
 *    citando "neste sistema".
 * 3. Sucesso dispara toast verde "Role criada." e `onCreated` antes
 *    de `onClose` — pai responsável pelo refetch (com contexto do
 *    payload quando o hook repassa).
 */
export const NewRoleModal: React.FC<NewRoleModalProps> = (props) => {
  const { open, variant, onClose, onCreated, client } = props;
  const scopedSystemId = variant === "scoped" ? props.systemId : "";
  const systems = variant === "global" ? props.systems : EMPTY_SYSTEMS;

  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  const [systemPickerError, setSystemPickerError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!open || variant !== "global") return;
    setSystemPickerError(null);
    setSelectedSystemId("");
  }, [open, variant]);

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

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_ROLE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    if (variant === "global") {
      setSystemPickerError(null);
      setSelectedSystemId("");
    }
    onClose();
  }, [
    isSubmitting,
    onClose,
    setFieldErrors,
    setFormState,
    setSubmitError,
    variant,
  ]);

  const resetForm = useCallback(() => {
    setFormState(INITIAL_ROLE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    if (variant === "global") {
      setSystemPickerError(null);
      setSelectedSystemId("");
    }
  }, [setFieldErrors, setFormState, setSubmitError, variant]);

  const prepareSubmitWithSystemId = useCallback((): CreateRolePayload | null => {
    const ownerId =
      variant === "scoped" ? scopedSystemId : selectedSystemId.trim();
    if (variant === "global") {
      if (systems.length === 0) {
        setSystemPickerError(
          "Nenhum sistema disponível. Cadastre um sistema antes.",
        );
        return null;
      }
      if (!ownerId) {
        setSystemPickerError("Selecione um sistema.");
        return null;
      }
      setSystemPickerError(null);
    }
    return prepareSubmit(ownerId);
  }, [
    prepareSubmit,
    scopedSystemId,
    selectedSystemId,
    systems.length,
    variant,
  ]);

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

  const fieldProps = useRoleFormFieldProps(roleForm, handleSubmit, handleClose);

  const modalDescription =
    variant === "scoped"
      ? "Cadastre uma role vinculada ao sistema selecionado."
      : "Escolha o sistema dono da role e preencha nome, código e descrição.";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova role"
      description={modalDescription}
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      {variant === "global" && (
        <Select
          label="Sistema"
          size="md"
          value={selectedSystemId}
          onChange={(value) => {
            setSelectedSystemId(value);
            setSystemPickerError(null);
          }}
          disabled={isSubmitting || systems.length === 0}
          error={systemPickerError ?? undefined}
          data-testid="new-role-system"
          aria-label="Sistema dono da role"
        >
          {systems.length === 0 ? (
            <option value="">Nenhum sistema cadastrado</option>
          ) : (
            <>
              <option value="">Selecione um sistema</option>
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name}
                </option>
              ))}
            </>
          )}
        </Select>
      )}
      <RoleFormBody
        {...fieldProps}
        idPrefix="new-role"
        submitLabel="Criar role"
      />
    </Modal>
  );
};
