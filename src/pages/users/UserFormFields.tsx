import React, { useMemo } from 'react';
import styled from 'styled-components';

import { Alert, Input, Switch } from '../../components/ui';
import { FormFooter as SharedFormFooter } from '../../shared/forms';

import {
  EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MAX,
  type UserFieldErrors,
  type UserFormState,
} from './userFormShared';

/* ─── Styled primitives compartilhados pelo modal ─── */

/**
 * Wrapper do `<form>` do modal de user. Espelha
 * `SystemFormShell`/`RouteFormShell` — mesmo `display: flex` com
 * `gap: var(--space-4)` para coerência visual entre os modals do
 * admin-gui.
 *
 * Quando o `EditUserModal` chegar (sub-issue futura), ambos os modals
 * vão consumir este shell — extrair desde já evita duplicação Sonar
 * (lição PR #127/#128 — projetar o módulo `<recurso>FormShared.ts`
 * desde o **primeiro PR do recurso**).
 */
const UserFormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

// `UserFormFooter`/`UserFormHelperRow` migraram para
// `src/shared/forms/FormFooter.tsx` (lição PR #134/#135 — bloco
// idêntico entre `UserFormFields`, `RouteFormFields`,
// `ClientFormFields` e `NameCodeDescriptionForm`). O helper genérico
// agora cuida do hint + Cancelar/Submit por trás de uma API uniforme.

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/**
 * Linha do toggle "Ativo" — alinha o `<Switch>` à esquerda com o
 * label inline. Mantemos um wrapper dedicado para que o spacing fique
 * coerente com os campos de texto acima (sem o `<Switch>` ter um
 * label próprio que duplica o label do field stack).
 */
const ActiveRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
`;

const ActiveLabel = styled.span`
  font-size: var(--text-sm);
  color: var(--fg2);
  letter-spacing: var(--tracking-tight);
`;

const ActiveHelper = styled.span`
  font-size: var(--text-xs);
  color: var(--text-muted);
`;

/**
 * Campos do formulário `NewUserModal` (Issue #78).
 *
 * Já projetado para ser reusado pelo `EditUserModal` na sub-issue
 * seguinte — cada modal pré-popula valores diferentes (vazio para
 * criação, dados atuais para edição), mas a estrutura visual e a
 * validação são compartilhadas. Antes de extrair, o segundo modal
 * espelharia ~140 linhas do primeiro — gatilho garantido de BLOCKER
 * de duplicação Sonar (lição PR #123/#127/#128 — qualquer trecho de
 * 10+ linhas em 2+ arquivos é `New Code Duplication` independente da
 * intenção).
 *
 * O componente é deliberadamente "burro": cada modal continua dono
 * do `formState`/`fieldErrors`/handlers e do submit. Aqui só
 * renderizamos os inputs e centralizamos `aria`, `maxLength`, helper
 * text e o `data-modal-initial-focus` no campo Name.
 *
 * Os `data-testid` recebem um `idPrefix` para que cada modal preserve
 * IDs estáveis usados pelos seus testes (`new-user-name`, futuro
 * `edit-user-name`, etc.) — assim refator do shared não invalida
 * suítes existentes.
 *
 * **Decisões específicas do user form:**
 *
 * - `Email` usa `<Input type="email">` para que o teclado mobile traga
 *   layout `@` + `.com` e o navegador valide formato no submit nativo
 *   antes do client-side. `autoComplete="email"` ajuda gerenciadores de
 *   senha (mas o admin não armazena email do operador — é o operador
 *   cadastrando outro usuário).
 * - `Password` usa `<Input type="password">` para mascarar a entrada.
 *   `autoComplete="new-password"` informa ao navegador que é uma senha
 *   nova (não para preencher com salvas) — coerente com fluxo de
 *   "operador cria senha inicial para outro usuário".
 * - `Identity` usa `<Input type="number">` mas com `inputMode="numeric"`
 *   reforçando teclado numérico em mobile. O React reporta string
 *   pelo `onChange` (`Input` aqui já entrega `value: string`), e o
 *   parse para `int` fica no `prepareSubmit` do hook.
 * - `ClientId` é texto livre porque o backend aceita UUID — UX de
 *   lookup com autocomplete pode chegar em sub-issue futura, mas exigir
 *   isso na #78 expandiria escopo (issue diz "selector de cliente"
 *   pode ser lookup ou input livre — input livre é coerente com a
 *   listagem #77 que ainda exibe `clientId` cru quando não tem nome).
 *   Mensagem de helper text orienta o operador a deixar vazio para
 *   gerar cliente PF derivado automaticamente.
 * - `Active` é `<Switch>` (não `<Checkbox>`) porque é uma única
 *   chave booleana de "ativar/desativar conta" — convenção visual
 *   reforça "estado", não "marcação opcional".
 */

interface UserFormFieldsProps {
  /**
   * Prefixo dos `data-testid` de cada input. Default `user` cobre
   * ambientes ad-hoc; o caller deve passar `new-user`/`edit-user` em
   * produção para casar com os helpers de teste.
   */
  idPrefix?: string;
  /** Estado controlado dos campos. */
  values: UserFormState;
  /** Erros inline por campo (vindos da validação client-side ou do backend). */
  errors: UserFieldErrors;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  /**
   * Handler do campo de senha — só é consumido quando `hidePassword`
   * é `false` (criação). No fluxo de edição (Issue #79), o campo não
   * é renderizado; reset de senha é endpoint separado
   * (`PUT /users/{id}/password`, fora do escopo da #79).
   */
  onChangePassword: (value: string) => void;
  onChangeIdentity: (value: string) => void;
  onChangeClientId: (value: string) => void;
  onChangeActive: (value: boolean) => void;
  /**
   * Quando `true`, todos os inputs ficam desabilitados (durante submit).
   * Default `false` mantém o comportamento padrão de form interativo.
   */
  disabled?: boolean;
  /**
   * Quando `true`, o campo Name recebe `data-modal-initial-focus` para
   * que o `Modal` foque automaticamente nele ao abrir. Permite que o
   * `EditUserModal` desligue o auto-foco se quiser focar outro campo
   * no futuro — hoje os dois modals usam `true`.
   */
  autoFocusName?: boolean;
  /**
   * Quando `true`, o campo "Senha inicial" não é renderizado. Usado
   * pelo `EditUserModal` (Issue #79) — o `PUT /users/{id}` do backend
   * não aceita `Password` no contrato, e o reset de senha é endpoint
   * separado (`PUT /users/{id}/password`, sub-issue futura).
   *
   * Default `false` preserva o comportamento original (form de criação
   * mostra o campo, espelhando o contrato de `POST /users`).
   */
  hidePassword?: boolean;
}

const UserFormFields: React.FC<UserFormFieldsProps> = ({
  idPrefix = 'user',
  values,
  errors,
  onChangeName,
  onChangeEmail,
  onChangePassword,
  onChangeIdentity,
  onChangeClientId,
  onChangeActive,
  disabled = false,
  autoFocusName = true,
  hidePassword = false,
}) => {
  // `data-modal-initial-focus` no campo Name garante que o foco vá para
  // o primeiro input independente da ordem dos `querySelector`. Útil em
  // jsdom (testes) e em qualquer mudança futura de layout. Memoizado
  // para preservar referência do objeto passado como spread.
  const nameFocusAttr = useMemo(
    () => (autoFocusName ? ({ 'data-modal-initial-focus': true } as const) : ({} as const)),
    [autoFocusName],
  );

  return (
    <FieldStack>
      <Input
        label="Nome"
        placeholder="ex.: Alice Admin"
        value={values.name}
        onChange={onChangeName}
        error={errors.name}
        maxLength={NAME_MAX}
        autoComplete="name"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-name`}
        {...nameFocusAttr}
      />
      <Input
        label="E-mail"
        type="email"
        placeholder="ex.: alice@empresa.com"
        value={values.email}
        onChange={onChangeEmail}
        error={errors.email}
        maxLength={EMAIL_MAX}
        autoComplete="email"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-email`}
      />
      {!hidePassword && (
        <Input
          label="Senha inicial"
          type="password"
          placeholder="Senha temporária — o usuário poderá alterar depois."
          value={values.password}
          onChange={onChangePassword}
          error={errors.password}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          required
          disabled={disabled}
          data-testid={`${idPrefix}-password`}
        />
      )}
      <Input
        label="Identity"
        type="number"
        inputMode="numeric"
        placeholder="ex.: 1"
        value={values.identity}
        onChange={onChangeIdentity}
        error={errors.identity}
        autoComplete="off"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-identity`}
      />
      <Input
        label="ClientId (opcional)"
        placeholder="UUID do cliente vinculado — vazio gera cliente PF automático"
        value={values.clientId}
        onChange={onChangeClientId}
        error={errors.clientId}
        autoComplete="off"
        disabled={disabled}
        data-testid={`${idPrefix}-client-id`}
      />
      <ActiveRow>
        <Switch
          checked={values.active}
          onChange={onChangeActive}
          disabled={disabled}
          data-testid={`${idPrefix}-active`}
          aria-label="Usuário ativo"
        />
        <ActiveLabel>Ativo</ActiveLabel>
        <ActiveHelper>Usuários inativos não conseguem efetuar login.</ActiveHelper>
      </ActiveRow>
    </FieldStack>
  );
};

/* ─── Form body completo ─────────────────────────────────── */

interface UserFormBodyProps {
  /**
   * Prefixo dos `data-testid` do form e dos campos. Em produção,
   * `new-user` ou `edit-user`; usar prefixo curto para combinar com
   * os testIds estáveis das suítes existentes.
   */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. */
  values: UserFormState;
  /** Erros inline por campo. */
  errors: UserFieldErrors;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeIdentity: (value: string) => void;
  onChangeClientId: (value: string) => void;
  onChangeActive: (value: boolean) => void;
  /** Handler do submit do form. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar usuário", "Salvar alterações"). */
  submitLabel: string;
  /**
   * Repassa para `UserFormFields` — quando `true`, o campo "Senha
   * inicial" não é renderizado (Issue #79, edição). Default `false`.
   */
  hidePassword?: boolean;
}

/**
 * Body completo do modal de criação (e do futuro edit): shell `<form>`
 * + Alert do erro genérico + campos (Nome/E-mail/Senha/Identity/
 * ClientId/Ativo) + linha de hint obrigatórios + footer (Cancelar/
 * Submit).
 *
 * Centralizar aqui (em vez de inline no `NewUserModal`) garante que
 * o `EditUserModal` futuro consuma a mesma estrutura — diferindo só
 * em `idPrefix`/labels/submitLabel — sem duplicação Sonar (lição
 * PR #127/#128).
 */
export const UserFormBody: React.FC<UserFormBodyProps> = ({
  idPrefix,
  submitError,
  values,
  errors,
  onChangeName,
  onChangeEmail,
  onChangePassword,
  onChangeIdentity,
  onChangeClientId,
  onChangeActive,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  hidePassword = false,
}) => (
  <UserFormShell onSubmit={onSubmit} noValidate data-testid={`${idPrefix}-form`}>
    {submitError && (
      // `<Alert>` do design system não propaga `data-testid` em
      // produção (silently dropped pelo componente), então os
      // testes buscam pelo texto da mensagem em vez de testId.
      // Mantemos o `data-testid` aqui só por simetria com
      // `SystemFormBody`/`RouteFormBody` — quando o `<Alert>` for
      // evoluído para spread props, o atributo já chegará no DOM.
      <Alert variant="danger" data-testid={`${idPrefix}-submit-error`}>
        {submitError}
      </Alert>
    )}
    <UserFormFields
      idPrefix={idPrefix}
      values={values}
      errors={errors}
      onChangeName={onChangeName}
      onChangeEmail={onChangeEmail}
      onChangePassword={onChangePassword}
      onChangeIdentity={onChangeIdentity}
      onChangeClientId={onChangeClientId}
      onChangeActive={onChangeActive}
      disabled={isSubmitting}
      hidePassword={hidePassword}
    />
    <SharedFormFooter
      idPrefix={idPrefix}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
    />
  </UserFormShell>
);
