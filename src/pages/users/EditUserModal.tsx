import React, { useCallback, useEffect, useMemo } from 'react';

import { Modal, useToast } from '../../components/ui';
import { updateUser } from '../../shared/api';
import {
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type EditSubmitActionCopy,
} from '../../shared/forms';

import { UserFormBody } from './UserFormFields';
import {
  type UserFieldErrors,
  type UserFormState,
  type UserSubmitErrorCopy,
} from './userFormShared';
import { useUserForm, useUserFormFieldProps } from './useUserForm';

import type { ApiClient, UpdateUserPayload, UserDto } from '../../shared/api';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de edição.
 * Os literais aqui são os únicos pontos onde "atualizar"/"outro
 * usuário" diferem do "criar"/"um usuário" do `NewUserModal` — toda
 * a lógica de classificação é compartilhada via `classifyApiSubmitError`
 * (lição PR #128 — projetar `<recurso>FormShared.ts` desde o
 * primeiro PR do recurso).
 */
const SUBMIT_ERROR_COPY: UserSubmitErrorCopy = {
  conflictDefault: 'Já existe outro usuário com este e-mail.',
  forbiddenTitle: 'Falha ao atualizar usuário',
  genericFallback: 'Não foi possível atualizar o usuário. Tente novamente.',
};

/** Texto exibido inline no campo `email` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE = 'Já existe outro usuário com este e-mail.';

/** Texto exibido em toast quando o usuário some entre abertura e submit (404). */
const NOT_FOUND_MESSAGE =
  'Usuário não encontrado ou foi removido. Atualize a lista.';

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre `EditUserModal` e os demais modals de
 * edição (`EditSystemModal`/`EditRoleModal`/`EditRouteModal`) sem
 * duplicar a árvore de switch (lição PR #128/#134/#135 reforçada).
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

interface EditUserModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Usuário sendo editado. Pré-popula o form e fornece o `id` usado
   * no `PUT /users/{id}`. Quando `null`, o modal não renderiza —
   * caller é responsável por só passar `user` quando `open=true`.
   *
   * Os campos visíveis (`Name`/`Email`/`Identity`/`ClientId`/`Active`)
   * vêm do `UserResponse` enriquecido em `lfc-authenticator#167`. O
   * campo `password` **não** é exibido — reset de senha é endpoint
   * separado (`PUT /users/{id}/password`, sub-issue futura).
   */
  user: UserDto | null;
  /** Fecha o modal sem persistir. Chamada também após sucesso ou 404. */
  onClose: () => void;
  /**
   * Callback disparado após atualização bem-sucedida ou após detecção
   * de 404 (usuário já removido) — em ambos casos a UI quer refetch
   * para sincronizar a tabela com o estado real do backend.
   */
  onUpdated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `updateUser` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Constrói o estado inicial do form a partir de uma `UserDto`.
 * `clientId: null` (do backend quando o usuário não tem cliente
 * vinculado) vira string vazia para que o input controlado nunca
 * receba `null`/`undefined`. O backend trata "ClientId omitido" no
 * PUT como "manter o ClientId atual" (`UsersController.UpdateById`
 * linha 507) — mais um motivo para preservar o valor lido do
 * `UserDto` no form e só enviar mudança quando o operador editar.
 *
 * `password` permanece string vazia — o campo nem é renderizado em
 * edit, mas o `UserFormState` continua exigindo a chave por
 * compatibilidade com o caminho de criação.
 */
function stateFromUser(user: UserDto): UserFormState {
  return {
    name: user.name,
    email: user.email,
    password: '',
    identity: String(user.identity),
    clientId: user.clientId ?? '',
    active: user.active,
  };
}

const EMPTY_INITIAL_STATE: UserFormState = {
  name: '',
  email: '',
  password: '',
  identity: '',
  clientId: '',
  active: true,
};

/* ─── Component ──────────────────────────────────────────── */

/**
 * Modal de edição de usuário (Issue #79).
 *
 * Espelha a forma do `NewUserModal` (mesma estrutura visual,
 * validação compartilhada via `userFormShared.ts`, mapeamento de erros
 * delegado a `useEditEntitySubmit`) com quatro diferenças funcionais:
 *
 * 1. Pré-popula `formState` com `Name`/`Email`/`Identity`/`ClientId`/
 *    `Active` do `user` recebido por prop — atende o critério de aceite
 *    "pré-popula campos". Os dados vêm do `UserResponse` completo
 *    (após enriquecimento em `lfc-authenticator#167`).
 * 2. Submit chama `updateUser(id, payload)` em vez de `createUser`.
 * 3. **Não exibe campo de senha** — reset de senha é endpoint separado
 *    (`PUT /users/{id}/password`), fora do escopo da #79.
 * 4. Trata 404 fechando o modal + toast vermelho + refetch (usuário
 *    foi soft-deletado por outra sessão entre a abertura e o submit).
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `userFormShared.ts`, os campos
 * vivem em `UserFormFields` (com `hidePassword` para esconder o
 * campo de senha), o estado/handlers do form vêm de `useUserForm`
 * (com `prepareUpdateSubmit` no lugar de `prepareSubmit`) e o ciclo
 * de submit vem de `useEditEntitySubmit` — evita duplicação ≥10
 * linhas com os outros modals de edição (BLOCKER de duplicação
 * Sonar, lição PR #134/#135).
 */
export const EditUserModal: React.FC<EditUserModalProps> = ({
  open,
  user,
  onClose,
  onUpdated,
  client,
}) => {
  const { show } = useToast();

  // Inicialização defensiva: quando `user` é `null` na primeira
  // render, usamos um estado vazio até o pai entregar o usuário. O
  // `useEffect` abaixo sincroniza sempre que `user` muda.
  const userForm = useUserForm(user ? stateFromUser(user) : EMPTY_INITIAL_STATE);
  const {
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    prepareUpdateSubmit,
    applyBadRequest,
  } = userForm;

  /**
   * Sincroniza o form sempre que: (a) o modal abre, ou (b) o `user`
   * selecionado muda. Limpa erros pendentes para evitar resíduo
   * entre aberturas (mesmo padrão do `EditSystemModal`/
   * `EditRoleModal`/`EditRouteModal`).
   */
  useEffect(() => {
    if (!open || !user) return;
    setFormState(stateFromUser(user));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, user, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reseta erros ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar
   * durante submissão é bloqueado para evitar request órfã. Não
   * resetamos o `formState` aqui (diferente de um modal de
   * criação) porque o efeito de sincronização re-popula a partir
   * do `user` quando o modal reabre.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareUpdateSubmit` que reprova quando o gate de
   * `isSubmitting`/`!user` falhar — preserva o dedupe original ao
   * mover a lógica para dentro de `useEditEntitySubmit` (lição PR
   * #135, 6ª recorrência de Sonar).
   */
  const prepareSubmitSafe = useCallback((): Record<string, unknown> | null => {
    if (isSubmitting || !user) return null;
    return prepareUpdateSubmit();
  }, [isSubmitting, prepareUpdateSubmit, user]);

  /**
   * Closure sobre `user.id` + `client`. Quando `user` é `null` o
   * `prepareSubmitSafe` já reprova antes do `mutationFn` rodar — a
   * checagem inline aqui é defensiva (preserva o tipo sem `!`).
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> => {
      if (!user) {
        return Promise.reject(new Error('User unavailable.'));
      }
      return updateUser(user.id, payload as UpdateUserPayload, undefined, client);
    },
    [client, user],
  );

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<EditEntitySubmitCopy>(
    () => ({
      successMessage: 'Usuário atualizado.',
      submitErrorCopy: SUBMIT_ERROR_COPY,
      editSubmitActionCopy: EDIT_SUBMIT_ACTION_COPY,
    }),
    [],
  );

  /**
   * `handleSubmit` orquestrado pelo hook compartilhado — encapsula
   * o `try/catch/finally` + `classifyApiSubmitError` +
   * `applyEditSubmitAction` que vivia inline em outros modals
   * antes da extração (lição PR #134/#135).
   */
  const handleSubmit = useEditEntitySubmit<keyof UserFieldErrors>({
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
    conflictField: 'email',
  });

  // Vide comentário em `NewUserModal.tsx`: encapsular props
  // compartilhadas no hook `useUserFormFieldProps` evita New Code
  // Duplication ≥10 linhas com o caminho de criação (lição PR
  // #134/#135). Hook chamado **antes** do early-return para respeitar
  // a regra "hooks always called in the same order".
  const fieldProps = useUserFormFieldProps(userForm, handleSubmit, handleClose);

  // Não renderiza nada quando não houver `user` selecionado — o pai
  // controla `open` em conjunto com o `user`, mas cobrimos o caso
  // defensivo de `open=true && user=null` para não quebrar o submit.
  if (!user) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar usuário"
      description="Atualize os dados do usuário selecionado."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <UserFormBody
        {...fieldProps}
        idPrefix="edit-user"
        submitLabel="Salvar alterações"
        hidePassword
      />
    </Modal>
  );
};
