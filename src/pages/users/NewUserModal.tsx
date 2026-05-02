import React, { useCallback } from 'react';

import { Modal, useToast } from '../../components/ui';
import { createUser } from '../../shared/api';
import { useCreateEntitySubmit } from '../../shared/forms';

import { UserFormBody } from './UserFormFields';
import {
  INITIAL_USER_FORM_STATE,
  type UserFieldErrors,
  type UserSubmitErrorCopy,
} from './userFormShared';
import { useUserForm, useUserFormFieldProps } from './useUserForm';

import type { ApiClient, CreateUserPayload } from '../../shared/api';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de criação.
 * Os literais aqui são os únicos pontos onde "criar"/"um usuário"
 * diferem do "atualizar"/"outro usuário" no futuro `EditUserModal` —
 * o resto da lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: UserSubmitErrorCopy = {
  conflictDefault: 'Já existe um usuário com este e-mail.',
  forbiddenTitle: 'Falha ao criar usuário',
  genericFallback: 'Não foi possível criar o usuário. Tente novamente.',
};

/**
 * Texto exibido inline no campo `email` quando o backend devolve 409.
 * Usamos uma copy dedicada (em vez de propagar a do backend, que é
 * "Já existe um usuário com este Email." com `Email` em PascalCase)
 * para coerência com a UX em pt-BR — o operador lê "e-mail" no
 * label do campo.
 */
const CONFLICT_INLINE_MESSAGE = 'Já existe um usuário com este e-mail.';

/**
 * Modal de criação de usuário (Issue #78 — primeiro fluxo de mutação
 * do recurso Users, espelhando o padrão do `NewSystemModal`/
 * `NewRouteModal` das EPICs anteriores).
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob controle desta
 *   camada: ao fechar, resetamos `formState`/`fieldErrors`/
 *   `submitError` para garantir que o usuário não veja resíduo de
 *   tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as regras
 *   do backend (`Required`/`MaxLength`/`EmailAddress`/`Identity`)
 *   para dar feedback imediato e evitar round-trip por erro trivial.
 *   As regras vivem em `userFormShared.ts` para serem reusadas pelo
 *   `EditUserModal` (sub-issue futura) sem duplicação.
 * - Mapeamento de erro do backend (delegado ao
 *   `useCreateEntitySubmit`):
 *   - 409 → mensagem inline no campo `email` ("Já existe um usuário
 *     com este e-mail.").
 *   - 400 → `details.errors[Field]` mapeado para `fieldErrors[field]`
 *     normalizando capitalização (backend manda `Name`/`Email`/
 *     `Password`/`Identity`/`ClientId`); 400 sem `details.errors`
 *     mapeáveis (caso `{ message: "ClientId informado não existe." }`)
 *     vai para `submitError` no Alert do topo.
 *   - 401/403 → toast vermelho com mensagem do backend.
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai),
 *   fecha o modal e dispara toast verde "Usuário criado.".
 *
 * **Sobre `clientId`:** o backend aceita ausência (`null`/omitido) e
 * gera automaticamente um cliente PF derivado via
 * `LegacyClientFactory.BuildPfClientForUser`. A UI orienta o operador
 * com helper text em vez de exigir o UUID — a issue dá flexibilidade
 * ("lookup por id ou input livre"), e input livre + helper text é o
 * caminho coerente com a listagem #77 (que ainda exibe `clientId` cru
 * quando não tem nome resolvido).
 */

interface NewUserModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createUser` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewUserModal: React.FC<NewUserModalProps> = ({
  open,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const userForm = useUserForm(INITIAL_USER_FORM_STATE);
  const {
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareSubmit,
    applyBadRequest,
  } = userForm;

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
    setFormState(INITIAL_USER_FORM_STATE);
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
   * comportamento esperado.
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_USER_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [setFormState, setFieldErrors, setSubmitError]);

  /**
   * `mutationFn` injetada no helper genérico. Tipa o payload via cast
   * para `CreateUserPayload` porque o helper aceita `unknown` (o cast
   * é seguro — o `prepareSubmit` do `useUserForm` só devolve
   * `CreateUserPayload | null`, e o helper já filtrou `null` antes
   * de chamar `mutationFn`).
   */
  const mutationFn = useCallback(
    (payload: unknown) => createUser(payload as CreateUserPayload, undefined, client),
    [client],
  );

  const handleSubmit = useCreateEntitySubmit<keyof UserFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
      resetForm,
    },
    copy: {
      successMessage: 'Usuário criado.',
      conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
      submitErrorCopy: SUBMIT_ERROR_COPY,
    },
    callbacks: {
      prepareSubmit,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField: 'email',
  });

  // Props compartilhadas com `EditUserModal` consolidadas num único
  // hook (`useUserFormFieldProps`) para evitar New Code Duplication
  // ≥10 linhas com o caminho de edição — JSCPD/Sonar tokenizam blocos
  // de props sequenciais como duplicação. Lição PR #134/#135 — o
  // call-site dos helpers compartilhados também precisa ficar
  // deduplicado, não só os helpers em si.
  const fieldProps = useUserFormFieldProps(userForm, handleSubmit, handleClose);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo usuário"
      description="Cadastre um novo usuário com acesso ao painel administrativo."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <UserFormBody {...fieldProps} idPrefix="new-user" submitLabel="Criar usuário" />
    </Modal>
  );
};
