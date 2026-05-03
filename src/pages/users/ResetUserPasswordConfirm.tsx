import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Alert, Input, Modal, useToast } from '../../components/ui';
import { resetUserPassword } from '../../shared/api';
import {
  FormFooter as SharedFormFooter,
  useEditEntitySubmit,
  type EditEntitySubmitCopy,
  type EditSubmitActionCopy,
} from '../../shared/forms';

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  type UserSubmitErrorCopy,
} from './userFormShared';

import type { ApiClient, UserDto } from '../../shared/api';

/**
 * Field key do form de reset de senha — usada pelo helper genérico
 * `useEditEntitySubmit<TField>` para tipar `setFieldErrors`. O único
 * campo do contrato `UpdatePasswordRequest` é `Password`.
 */
type ResetPasswordField = 'password';

/* ─── Copy ────────────────────────────────────────────────── */

/**
 * Copy injetada em `classifyApiSubmitError` para o reset de senha
 * (Issue #81). Espelha o padrão de `EditUserModal`/`NewUserModal` mas
 * com vocabulário "redefinir" — `conflictDefault` fica vazio porque o
 * backend nunca devolve 409 em `PUT /users/{id}/password` (não há
 * unicidade de senha entre usuários).
 *
 * O `forbiddenTitle` aparece em toasts vermelhos (401/403) e no
 * fallback genérico de 404; coerente com a ação que o operador
 * acabou de tentar ("Falha ao redefinir senha").
 */
const SUBMIT_ERROR_COPY: UserSubmitErrorCopy = {
  conflictDefault: '',
  forbiddenTitle: 'Falha ao redefinir senha',
  genericFallback:
    'Não foi possível redefinir a senha. Tente novamente.',
};

/**
 * Copy injetada em `applyEditSubmitAction`. O backend nunca devolve 409
 * neste endpoint (não há unicidade), então `conflictInlineMessage` fica
 * `undefined` — o switch do helper passa pelo branch `conflict` apenas
 * defensivamente caso o contrato evolua, e ainda assim a copy do
 * próprio backend (`action.message`) seria exibida sem que o frontend
 * regrida.
 *
 * `notFoundMessage` cobre o cenário "operador abriu o modal e o
 * usuário-alvo foi soft-deletado por outra sessão antes do submit" —
 * UX paritária com `EditUserModal` (modal fecha + toast + refetch).
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  notFoundMessage:
    'Usuário não encontrado ou foi removido. Atualize a lista.',
  forbiddenTitle: SUBMIT_ERROR_COPY.forbiddenTitle,
};

/**
 * Mensagem do toast verde após sucesso. Não interpolamos o nome
 * porque a tabela ainda não muda visualmente após o reset (apenas
 * `updatedAt` é atualizado no backend, não exibido na UI) — manter
 * a copy curta e direta.
 */
const SUCCESS_MESSAGE = 'Senha redefinida.';

/* ─── Validação client-side ───────────────────────────────── */

/**
 * Replica as regras do backend (`UpdatePasswordRequest`):
 *
 * - `password` é obrigatório (`Required`) e não pode ser apenas
 *   espaços (validado server-side via `IsNullOrWhiteSpace` após trim).
 * - Tamanho máximo 60 chars (`MaxLength(60)`).
 *
 * Mantemos o **mesmo mínimo client-side** dos demais forms de
 * usuário (`PASSWORD_MIN = 8`) — UX defensiva para senhas iniciais
 * administrativas, espelha `userFormShared.validateUserForm`. O
 * backend não exige mínimo, mas reset implica nova senha que o
 * usuário-alvo vai usar imediatamente; aplicar o mesmo guard
 * preserva consistência entre o caminho de criação (#78) e o de
 * reset (#81).
 *
 * Validação client-side **não trima** — espaços laterais podem ser
 * intencionais para senhas geradas em gerenciadores. O backend
 * trima com `request.Password.Trim()` e refaz o
 * `IsNullOrWhiteSpace` depois (rejeita senha de só espaços).
 *
 * Devolve `null` quando válido, ou string com a mensagem do erro.
 */
function validateResetPassword(password: string): string | null {
  if (password.length === 0) {
    return 'Nova senha é obrigatória.';
  }
  // O backend rejeita senhas formadas apenas por espaços — espelhar
  // client-side evita round-trip por digitação acidental do operador
  // (ex.: copy/paste de uma string em branco).
  if (password.trim().length === 0) {
    return 'Nova senha não pode ser apenas espaços.';
  }
  if (password.length < PASSWORD_MIN) {
    return `Nova senha deve ter ao menos ${PASSWORD_MIN} caracteres.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Nova senha deve ter no máximo ${PASSWORD_MAX} caracteres.`;
  }
  return null;
}

/* ─── Styled primitives ───────────────────────────────────── */

/**
 * Wrapper do `<form>` do reset. Espelha `UserFormShell` em
 * `UserFormFields.tsx` — mesmo `display: flex` com `gap:
 * var(--space-4)` para coerência visual entre os modals do user
 * (criar/editar/desativar/reset).
 */
const ResetFormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/**
 * Bloco "contexto" — quem está prestes a ter a senha redefinida.
 * Espelha o padrão visual de `MutationConfirmModal` (descrição com
 * `<strong>name</strong> (<Mono>email</Mono>)`) sem reusar o shell
 * porque aqui temos campo de form. Mantemos a hierarquia visual
 * coerente.
 */
const ContextBlock = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg1);
  background: var(--bg-elevated);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
`;

/* ─── Component ───────────────────────────────────────────── */

interface ResetUserPasswordConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Usuário selecionado para o reset. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `user`.
   * Mantemos o objeto completo (não só `id`) para que a copy do
   * diálogo exiba `name`/`email` sem precisar de re-fetch.
   */
  user: UserDto | null;
  /** Fecha o modal sem persistir. Chamada também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após reset bem-sucedido ou após detecção de
   * 404 (usuário já removido entre abertura e submit) — em ambos os
   * casos a UI quer refetch para sincronizar a tabela com o backend
   * (paridade com `EditUserModal`).
   */
  onResetCompleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `resetUserPassword` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação para reset de senha de usuário (Issue #81).
 *
 * Diferenças vs `EditUserModal`/`NewUserModal`:
 *
 * - Mostra apenas **um** campo (nova senha) em vez do form completo
 *   — o backend tem endpoint dedicado (`PUT /users/{id}/password`)
 *   que aceita só `Password`.
 * - Copy "Redefinir senha" e contexto destacando `name` + `email`
 *   do usuário-alvo (paridade visual com `MutationConfirmModal`
 *   usado pelo toggle ativo).
 * - **Sem 409** — não há unicidade de senha entre usuários.
 * - **Sem reset de form pós-sucesso** — caller já vai fechar o modal
 *   imediatamente após o sucesso; a próxima abertura zera o estado
 *   via `useEffect` do `open` (mesma estratégia do `EditUserModal`).
 *
 * Diferenças vs `ToggleUserActiveConfirm`/`MutationConfirmModal`:
 *
 * - Tem campo de input — `MutationConfirmModal` é estritamente sem
 *   form, então não cabe reusar como wrapper aqui. Usamos `Modal` +
 *   `<form>` + `Alert` + `FormFooter` (mesma combinação dos demais
 *   form modals do recurso) para preservar consistência visual.
 * - Submit usa `useEditEntitySubmit<'password'>` — o helper genérico
 *   já encapsula `try/catch/finally` + `classifyApiSubmitError` +
 *   `applyEditSubmitAction` (lição PR #135). Usar aqui evita
 *   duplicação ≥10 linhas com `EditUserModal` na mesma pasta.
 *
 * **Visibilidade:** o caller (`UsersListShellPage`) só renderiza este
 * modal quando o operador tem `Users.Update` (mesma policy do edit/
 * toggle, alinhada com o backend
 * `[Authorize(Policy = PermissionPolicies.UsersUpdate)]`).
 */
export const ResetUserPasswordConfirm: React.FC<
  ResetUserPasswordConfirmProps
> = ({ open, user, onClose, onResetCompleted, client }) => {
  const { show } = useToast();

  // Estado controlado do campo "Nova senha". Mantemos string vazia
  // como inicial — `useEffect` do `open` zera entre aberturas.
  const [password, setPassword] = useState<string>('');
  // Erro inline do campo "Nova senha" — alimentado pela validação
  // client-side e pelo parsing de `ValidationProblemDetails` (via
  // `applyBadRequest`).
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  // Erro genérico exibido em `<Alert>` no topo do form quando o
  // backend devolve 400 sem `details.errors` mapeáveis.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Flag de submissão. Bloqueia Esc/backdrop/cancelar e desabilita
  // os controles enquanto a request está em voo.
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /**
   * Reseta o estado entre aberturas (ou quando o `user` selecionado
   * muda). Espelha o `useEffect` do `EditUserModal` — preferimos
   * limpar no `open=true` em vez de no `onClose` para evitar
   * "flicker" de erro residual quando o operador reabre o modal
   * imediatamente após uma falha.
   */
  useEffect(() => {
    if (!open || !user) return;
    setPassword('');
    setFieldError(undefined);
    setSubmitError(null);
  }, [open, user]);

  /**
   * Handler de mudança do campo "Nova senha". Limpa o erro inline
   * em qualquer alteração para que o operador veja feedback
   * imediato — espelha `useFieldChangeHandlers` do form completo
   * mas inline aqui porque é apenas um campo (factory genérica
   * não compensa em LOC).
   */
  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    setFieldError(undefined);
  }, []);

  /**
   * Fecha o modal sem persistir. Bloqueado durante submit para
   * evitar request órfã. Único handler para Esc/backdrop/X/Cancelar
   * (mesmo padrão dos demais modals do recurso).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  /**
   * Roda a validação client-side e, se passar, marca submitting +
   * limpa erros + devolve a senha pronta para envio. Devolve `null`
   * quando há erro client-side (já tendo populado `fieldError`).
   *
   * Tipado como `() => object | null` para casar com o contrato do
   * `useEditEntitySubmit` (que aceita qualquer payload-shape). O hook
   * filtra `null` antes de chamar `mutationFn`. Embaçamos a senha em
   * `{ password }` para que o tipo de retorno seja um objeto (em vez
   * de string crua) — `mutationFn` desestrutura e envia para o
   * backend.
   */
  const prepareSubmit = useCallback((): { password: string } | null => {
    if (isSubmitting || !user) return null;
    const error = validateResetPassword(password);
    if (error) {
      setFieldError(error);
      setSubmitError(null);
      return null;
    }
    setFieldError(undefined);
    setSubmitError(null);
    setIsSubmitting(true);
    return { password };
  }, [isSubmitting, password, user]);

  /**
   * Aplica decisão de 400 do backend: se o `ValidationProblemDetails`
   * tem `errors.Password`, exibe inline; caso contrário, mostra a
   * mensagem do backend no `<Alert>` no topo (caso defensivo — o
   * backend só devolve `errors.Password` neste endpoint).
   *
   * Mantemos inline aqui (em vez de reusar `applyUserBadRequest`)
   * porque o shape de erro é específico — só uma chave (`Password`).
   */
  const applyBadRequest = useCallback(
    (details: unknown, fallbackMessage: string) => {
      if (!details || typeof details !== 'object') {
        setSubmitError(fallbackMessage);
        return;
      }
      const errors = (details as Record<string, unknown>).errors;
      if (!errors || typeof errors !== 'object') {
        setSubmitError(fallbackMessage);
        return;
      }
      // O backend manda `Password` em PascalCase; checamos
      // case-insensitive para preservar resiliência contra mudanças
      // mecânicas no contrato.
      for (const [serverField, raw] of Object.entries(errors)) {
        if (serverField.toLowerCase() !== 'password') continue;
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
          setFieldError(raw[0]);
          setSubmitError(null);
          return;
        }
        if (typeof raw === 'string') {
          setFieldError(raw);
          setSubmitError(null);
          return;
        }
      }
      // Não havia chave `Password` mapeável — fallback no Alert.
      setSubmitError(fallbackMessage);
    },
    [],
  );

  /**
   * Adapter `setFieldErrors` para o helper genérico — recebe um
   * `Partial<Record<'password', string>>` e despacha para o setter
   * local. Centralizar na assinatura do helper preserva a
   * generalização (`useEditEntitySubmit<TField>`).
   */
  const setFieldErrorsAdapter = useCallback(
    (errors: Partial<Record<ResetPasswordField, string>>) => {
      setFieldError(errors.password ?? undefined);
    },
    [],
  );

  /**
   * Closure sobre `user.id` + `client`. Quando `user` é `null` o
   * `prepareSubmit` já reprova antes do `mutationFn` rodar — a
   * checagem inline aqui é defensiva (preserva o tipo sem `!`).
   */
  const mutationFn = useCallback(
    (payload: unknown): Promise<unknown> => {
      if (!user) {
        return Promise.reject(new Error('User unavailable.'));
      }
      const { password: nextPassword } = payload as { password: string };
      return resetUserPassword(user.id, nextPassword, undefined, client);
    },
    [client, user],
  );

  /**
   * Copy estável (não muda entre renders) — memoizada pra fechar a
   * deps array do hook sem recriar referência a cada tick.
   */
  const submitCopy = useMemo<EditEntitySubmitCopy>(
    () => ({
      successMessage: SUCCESS_MESSAGE,
      submitErrorCopy: SUBMIT_ERROR_COPY,
      editSubmitActionCopy: EDIT_SUBMIT_ACTION_COPY,
    }),
    [],
  );

  /**
   * `handleSubmit` orquestrado pelo hook compartilhado — encapsula
   * o `try/catch/finally` + `classifyApiSubmitError` +
   * `applyEditSubmitAction` que vivia inline em outros modals
   * antes da extração (lição PR #134/#135). Reusar aqui mantém a
   * dedupe de blocos ≥10 linhas com `EditUserModal`.
   *
   * `conflictField: 'password'` é simbólico — backend nunca devolve
   * 409 neste endpoint, mas o tipo do helper exige um `TField` para
   * o caso `conflict` do switch. Se o contrato evoluir, a copy do
   * backend é exibida inline no campo (degradação aceitável).
   */
  const handleSubmit = useEditEntitySubmit<ResetPasswordField>({
    dispatchers: {
      setFieldErrors: setFieldErrorsAdapter,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
    },
    copy: submitCopy,
    callbacks: {
      prepareSubmit,
      mutationFn,
      onUpdated: onResetCompleted,
      onClose,
    },
    conflictField: 'password',
  });

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
      title="Redefinir senha"
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <ResetFormShell
        onSubmit={handleSubmit}
        noValidate
        data-testid="reset-user-password-form"
      >
        <ContextBlock data-testid="reset-user-password-description">
          Defina uma nova senha para o usuário{' '}
          <strong>{user.name}</strong> (<Mono>{user.email}</Mono>). O
          usuário precisará usá-la no próximo login.
        </ContextBlock>
        {submitError && (
          <Alert variant="danger" data-testid="reset-user-password-submit-error">
            {submitError}
          </Alert>
        )}
        <Input
          label="Nova senha"
          type="password"
          placeholder="Nova senha — o usuário poderá alterar depois."
          value={password}
          onChange={handlePasswordChange}
          error={fieldError}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          data-testid="reset-user-password-input"
          data-modal-initial-focus
        />
        <SharedFormFooter
          idPrefix="reset-user-password"
          onCancel={handleClose}
          isSubmitting={isSubmitting}
          submitLabel="Redefinir senha"
        />
      </ResetFormShell>
    </Modal>
  );
};
