import React, { useMemo } from 'react';
import styled from 'styled-components';

import { Alert, Input, Select, Textarea } from '../../components/ui';
import { FormFooter as SharedFormFooter } from '../../shared/forms';

import {
  CODE_MAX,
  DESCRIPTION_MAX,
  NAME_MAX,
  type RouteFieldErrors,
  type RouteFormState,
} from './routeFormShared';

import type { TokenTypeDto } from '../../shared/api';

/* ─── Styled primitives compartilhados pelos dois modals ─── */

/**
 * Wrapper do `<form>` dos modals de rota. Espelha `SystemFormShell` em
 * `systems/SystemFormFields.tsx` — extraído já no primeiro PR do
 * recurso para não disparar duplicação Sonar quando a issue de
 * edição (#64) chegar (lição PR #127/#128 — projetar shared
 * helpers desde o **primeiro PR do recurso**).
 */
const RouteFormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

// `RouteFormFooter`/`RouteFormHelperRow` migraram para
// `src/shared/forms/FormFooter.tsx` (lição PR #134/#135 — bloco
// idêntico entre `UserFormFields`, `RouteFormFields`,
// `ClientFormFields` e `NameCodeDescriptionForm` foi tokenizado
// pelo jscpd no PR #74). O helper genérico cuida do hint +
// Cancelar/Submit + suporte ao `submitDisabled` que rotas precisam.

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/**
 * Campos comuns dos formulários `NewRouteModal` e `EditRouteModal`.
 *
 * Cada modal pré-popula valores diferentes (vazio para criação, dados
 * atuais para edição), mas a estrutura visual (Name/Code/Description/
 * SystemTokenType) e a validação são idênticas. Antes de extrair, o
 * `EditRouteModal` espelharia ~100 linhas do `NewRouteModal` —
 * gatilho garantido de BLOCKER de duplicação Sonar (lição PR #128 —
 * 4ª recorrência).
 *
 * O componente é deliberadamente "burro": cada modal continua dono do
 * `formState`/`fieldErrors`/handlers e do submit. Aqui só renderizamos
 * os inputs e centralizamos `aria`, `maxLength`, helper text de
 * contagem e o `data-modal-initial-focus` no campo Name.
 *
 * Os `data-testid` recebem um `idPrefix` para que cada modal preserve
 * IDs estáveis (`new-route-name`, `edit-route-name`, etc.) — assim
 * refator do shared não invalida suítes existentes.
 */

interface RouteFormFieldsProps {
  /**
   * Prefixo dos `data-testid` de cada input. Default `route` cobre
   * ambientes ad-hoc; o caller deve passar `new-route`/`edit-route` em
   * produção para casar com os helpers de teste.
   */
  idPrefix?: string;
  /** Estado controlado dos campos. */
  values: RouteFormState;
  /** Erros inline por campo (vindos da validação client-side ou do backend). */
  errors: RouteFieldErrors;
  /**
   * Token types disponíveis para o `<Select>` da política JWT.
   * Carregados pelo modal pai via `listTokenTypes` e filtrados para
   * descartar os soft-deletados (não fazem sentido como alvo de uma
   * rota nova). A `RouteFormFields` é agnóstica de carregamento — só
   * renderiza as opções recebidas.
   */
  tokenTypes: ReadonlyArray<TokenTypeDto>;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeSystemTokenTypeId: (value: string) => void;
  /**
   * Quando `true`, todos os inputs ficam desabilitados (durante
   * submit). Default `false` mantém o comportamento padrão de form
   * interativo.
   */
  disabled?: boolean;
  /**
   * Quando `true`, o campo Name recebe `data-modal-initial-focus` para
   * que o `Modal` foque automaticamente nele ao abrir. Permite que o
   * `EditRouteModal` desligue o auto-foco se quiser focar outro campo
   * no futuro — hoje os dois modals usam `true`.
   */
  autoFocusName?: boolean;
  /**
   * Texto exibido como `helperText` do `<Select>` quando a lista de
   * token types está sendo carregada. Default `undefined` — o caller
   * passa "Carregando políticas JWT..." enquanto a request inicial está
   * em curso.
   */
  tokenTypesHelperText?: string;
}

const RouteFormFields: React.FC<RouteFormFieldsProps> = ({
  idPrefix = 'route',
  values,
  errors,
  tokenTypes,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  onChangeSystemTokenTypeId,
  disabled = false,
  autoFocusName = true,
  tokenTypesHelperText,
}) => {
  // `data-modal-initial-focus` no campo Name garante que o foco vá
  // para o primeiro input independente da ordem dos `querySelector`.
  // Útil em jsdom (testes) e em qualquer mudança futura de layout.
  // Memoizado para preservar referência do objeto passado como spread.
  const nameFocusAttr = useMemo(
    () => (autoFocusName ? ({ 'data-modal-initial-focus': true } as const) : ({} as const)),
    [autoFocusName],
  );

  const tokenTypeOptions = useMemo(
    () =>
      tokenTypes.map((tt) => ({
        // O label preferencialmente usa o `name` (legível) e cai no
        // `code` quando o `name` veio vazio do backend (caso raro mas
        // possível em token types criados via SQL ad-hoc). Mantemos a
        // mesma fonte de verdade que `renderTokenPolicy` na listagem.
        label: tt.name.trim().length > 0 ? tt.name : tt.code,
        value: tt.id,
      })),
    [tokenTypes],
  );

  return (
    <FieldStack>
      <Input
        label="Nome"
        placeholder="ex.: Listar sistemas"
        value={values.name}
        onChange={onChangeName}
        error={errors.name}
        maxLength={NAME_MAX}
        autoComplete="off"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-name`}
        {...nameFocusAttr}
      />
      <Input
        label="Código"
        placeholder="ex.: AUTH_V1_SYSTEMS_LIST"
        value={values.code}
        onChange={onChangeCode}
        error={errors.code}
        maxLength={CODE_MAX}
        autoComplete="off"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-code`}
      />
      <Textarea
        label="Descrição"
        placeholder="Descrição opcional da rota."
        value={values.description}
        onChange={onChangeDescription}
        error={errors.description}
        helperText={
          errors.description ? undefined : `${values.description.length}/${DESCRIPTION_MAX} caracteres`
        }
        maxLength={DESCRIPTION_MAX}
        rows={3}
        disabled={disabled}
        data-testid={`${idPrefix}-description`}
      />
      <Select
        label="Política JWT alvo"
        value={values.systemTokenTypeId}
        onChange={onChangeSystemTokenTypeId}
        error={errors.systemTokenTypeId}
        helperText={
          errors.systemTokenTypeId
            ? undefined
            : tokenTypesHelperText ?? 'Define qual token type será exigido para esta rota.'
        }
        // `disabled` cobre tanto o submit em curso quanto a ausência
        // de opções (carregando ou backend devolveu lista vazia) — sem
        // opção, o usuário não consegue submeter mesmo, então é melhor
        // travar o controle do que mostrar um `<Select>` interativo
        // sem alternativas.
        disabled={disabled || tokenTypeOptions.length === 0}
        required
        data-testid={`${idPrefix}-system-token-type-id`}
      >
        {/*
         * Opção placeholder vazia é desabilitada quando há opções —
         * impede que o usuário "deselecione" depois de escolher.
         * Quando a lista veio vazia (ex.: backend devolveu 0
         * token types ativos), o placeholder fica selecionado e o
         * `<Select>` está disabled.
         */}
        <option value="" disabled={tokenTypeOptions.length > 0}>
          {tokenTypeOptions.length > 0
            ? 'Selecione uma política JWT'
            : 'Nenhuma política JWT disponível'}
        </option>
        {tokenTypeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </FieldStack>
  );
};

/* ─── Form body completo ─────────────────────────────────── */

interface RouteFormBodyProps {
  /**
   * Prefixo dos `data-testid` do form e dos campos. Em produção,
   * `new-route` ou `edit-route`; usar prefixo curto para combinar com
   * os testIds estáveis das suítes existentes.
   */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. */
  values: RouteFormState;
  /** Erros inline por campo. */
  errors: RouteFieldErrors;
  /** Token types disponíveis para o `<Select>` da política JWT. */
  tokenTypes: ReadonlyArray<TokenTypeDto>;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeSystemTokenTypeId: (value: string) => void;
  /** Handler do submit do form. */
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar rota", "Salvar alterações"). */
  submitLabel: string;
  /**
   * Quando `true`, desabilita o botão de submit mesmo quando o form
   * está válido — usado quando a lista de token types ainda está
   * carregando (não há opção válida pra escolher) ou veio vazia. O
   * caller decide a copy de feedback no Alert do topo do form se
   * quiser explicar ao usuário.
   */
  submitDisabled?: boolean;
  /**
   * Texto exibido como `helperText` do `<Select>` quando a lista de
   * token types está sendo carregada. Repassado para `RouteFormFields`.
   */
  tokenTypesHelperText?: string;
  /**
   * Slot opcional renderizado **acima** dos campos padrão (Nome/Código/
   * Descrição/Política JWT) e **abaixo** do Alert de `submitError`.
   * Usado pelo modo "criar rota global" (Issue #187) para injetar o
   * `<Select>` de sistema sem expandir o `RouteFormState` compartilhado
   * com `EditRouteModal` — o caller controla `selectedSystemId` e o
   * erro inline localmente. No fluxo per-system (`RoutesPage` da
   * #63/#64), o slot é omitido e o body renderiza igual ao original.
   */
  headerSlot?: React.ReactNode;
}

/**
 * Body completo dos modals de criação/edição: shell `<form>` + Alert
 * do erro genérico + campos + linha de hint obrigatórios + footer
 * (Cancelar/Submit).
 *
 * Espelha `SystemFormBody` em `systems/SystemFormFields.tsx` — ambos
 * os modals (criação/edição) declarariam ~50 linhas de JSX com a mesma
 * estrutura, diferindo só em `data-testid`/labels — alvo certo do
 * Sonar para `New Code Duplication` (lição PR #127). Centralizando
 * aqui, cada modal importa um único componente e passa os pontos de
 * variação por prop.
 *
 * Os `data-testid` ficam estáveis porque cada modal passa `idPrefix`
 * diferente — preserva os testIds esperados pelas suítes
 * `RoutesPage.create.test.tsx` (#63) e a futura `RoutesPage.edit.test.tsx`
 * (#64).
 */
export const RouteFormBody: React.FC<RouteFormBodyProps> = ({
  idPrefix,
  submitError,
  values,
  errors,
  tokenTypes,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  onChangeSystemTokenTypeId,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  submitDisabled = false,
  tokenTypesHelperText,
  headerSlot,
}) => (
  <RouteFormShell onSubmit={onSubmit} noValidate data-testid={`${idPrefix}-form`}>
    {submitError && (
      <Alert variant="danger" data-testid={`${idPrefix}-submit-error`}>
        {submitError}
      </Alert>
    )}
    {headerSlot}
    <RouteFormFields
      idPrefix={idPrefix}
      values={values}
      errors={errors}
      tokenTypes={tokenTypes}
      onChangeName={onChangeName}
      onChangeCode={onChangeCode}
      onChangeDescription={onChangeDescription}
      onChangeSystemTokenTypeId={onChangeSystemTokenTypeId}
      disabled={isSubmitting}
      tokenTypesHelperText={tokenTypesHelperText}
    />
    <SharedFormFooter
      idPrefix={idPrefix}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      submitDisabled={submitDisabled}
    />
  </RouteFormShell>
);
