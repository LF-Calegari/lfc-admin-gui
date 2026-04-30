import React, { useMemo } from 'react';
import styled from 'styled-components';

import { Alert, Button, Input, Textarea } from '../../components/ui';

import {
  CODE_MAX,
  DESCRIPTION_MAX,
  NAME_MAX,
  type SystemFieldErrors,
  type SystemFormState,
} from './systemFormShared';

/* ─── Styled primitives compartilhados pelos dois modals ─── */

/**
 * Wrapper do `<form>` dos modals de sistema. Extraído porque ambos
 * `NewSystemModal` e `EditSystemModal` declaravam a mesma `styled.form`
 * (~5 linhas idênticas) — somando aos demais styled wrappers, a
 * duplicação cumulativa atingia o threshold do Sonar (lição PR #127).
 */
const SystemFormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/** Footer com botões alinhados à direita, separados pelo gap padrão. */
const SystemFormFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
`;

/** Linha de hint "campos com * são obrigatórios" no rodapé do form. */
const SystemFormHelperRow = styled.div`
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-tight);
`;

/**
 * Campos comuns dos formulários `NewSystemModal` e `EditSystemModal`.
 *
 * Cada modal pré-popula valores diferentes (vazio para criação, dados
 * atuais para edição), mas a estrutura visual (Name/Code/Description) e
 * a validação são idênticas. Antes de extrair, o `EditSystemModal`
 * espelhava ~80 linhas do `NewSystemModal` — gatilho garantido de BLOCKER
 * de duplicação Sonar (lição PR #123/#127 — qualquer trecho de 10+
 * linhas em 2+ arquivos é `New Code Duplication` independente da
 * intenção).
 *
 * O componente é deliberadamente "burro": cada modal continua dono do
 * `formState`/`fieldErrors`/handlers e do submit. Aqui só renderizamos os
 * inputs e centralizamos `aria`, `maxLength`, helper text de contagem e
 * o `data-modal-initial-focus` no campo Name.
 *
 * Os `data-testid` recebem um `idPrefix` para que cada modal preserve os
 * IDs estáveis usados pelos seus testes (`new-system-name`,
 * `edit-system-name`, etc.) — assim refator do shared não invalida
 * suítes existentes.
 */

interface SystemFormFieldsProps {
  /**
   * Prefixo dos `data-testid` de cada input. Default `system` cobre
   * ambientes ad-hoc; o caller deve passar `new-system`/`edit-system` em
   * produção para casar com os helpers de teste.
   */
  idPrefix?: string;
  /** Estado controlado dos campos. */
  values: SystemFormState;
  /** Erros inline por campo (vindos da validação client-side ou do backend). */
  errors: SystemFieldErrors;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  /**
   * Quando `true`, todos os inputs ficam desabilitados (durante submit).
   * Default `false` mantém o comportamento padrão de form interativo.
   */
  disabled?: boolean;
  /**
   * Quando `true`, o campo Name recebe `data-modal-initial-focus` para
   * que o `Modal` foque automaticamente nele ao abrir. Permite que o
   * `EditSystemModal` desligue o auto-foco se quiser focar outro campo
   * no futuro — hoje os dois modals usam `true`.
   */
  autoFocusName?: boolean;
}

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const SystemFormFields: React.FC<SystemFormFieldsProps> = ({
  idPrefix = 'system',
  values,
  errors,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  disabled = false,
  autoFocusName = true,
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
        placeholder="ex.: lfc-authenticator"
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
        placeholder="ex.: AUTH"
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
        placeholder="Descrição opcional do sistema."
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
    </FieldStack>
  );
};

/* ─── Form body completo ─────────────────────────────────── */

interface SystemFormBodyProps {
  /**
   * Prefixo dos `data-testid` do form e dos campos. Em produção,
   * `new-system` ou `edit-system`; usar prefixo curto para combinar com
   * os testIds estáveis das suítes existentes.
   */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. */
  values: SystemFormState;
  /** Erros inline por campo. */
  errors: SystemFieldErrors;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  /** Handler do submit do form. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar sistema", "Salvar alterações"). */
  submitLabel: string;
}

/**
 * Body completo dos modals de criação/edição: shell `<form>` + Alert do
 * erro genérico + campos (Nome/Código/Descrição) + linha de hint
 * obrigatórios + footer (Cancelar/Submit).
 *
 * Antes de extrair, ambos os modals declaravam ~38 linhas de JSX com a
 * mesma estrutura, diferindo só em `data-testid`/labels — alvo certo do
 * Sonar para `New Code Duplication` (lição PR #127). Centralizando aqui,
 * cada modal importa um único componente e passa os pontos de variação
 * por prop.
 *
 * Os `data-testid` ficam estáveis porque cada modal passa `idPrefix`
 * diferente — preserva os testIds esperados pelas suítes
 * `SystemsPage.create.test.tsx` (#58/#127) e `SystemsPage.edit.test.tsx`
 * (#59).
 */
export const SystemFormBody: React.FC<SystemFormBodyProps> = ({
  idPrefix,
  submitError,
  values,
  errors,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}) => (
  <SystemFormShell onSubmit={onSubmit} noValidate data-testid={`${idPrefix}-form`}>
    {submitError && (
      <Alert variant="danger" data-testid={`${idPrefix}-submit-error`}>
        {submitError}
      </Alert>
    )}
    <SystemFormFields
      idPrefix={idPrefix}
      values={values}
      errors={errors}
      onChangeName={onChangeName}
      onChangeCode={onChangeCode}
      onChangeDescription={onChangeDescription}
      disabled={isSubmitting}
    />
    <SystemFormHelperRow>Campos com * são obrigatórios.</SystemFormHelperRow>
    <SystemFormFooter>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={isSubmitting}
        data-testid={`${idPrefix}-cancel`}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={isSubmitting}
        data-testid={`${idPrefix}-submit`}
      >
        {submitLabel}
      </Button>
    </SystemFormFooter>
  </SystemFormShell>
);
