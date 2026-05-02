import React, { useMemo } from "react";
import styled from "styled-components";

import { Alert, Input, Textarea } from "../../components/ui";

import { FormFooter as SharedFormFooter } from "./FormFooter";

/**
 * Form body genérico para entidades cujo CRUD expõe exatamente os
 * mesmos 3 campos: `Name` (obrigatório, máx. 80), `Code` (obrigatório,
 * máx. 50), `Description` (opcional, máx. 500). Hoje aplica-se a
 * `systems` (#58/#59) e `roles` (#67/#68) — duas entidades cuja UI de
 * mutação coincide totalmente em estrutura, mudando apenas placeholders
 * e copy do submitLabel/título.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * Antes da Issue #68 cada recurso (sistemas/roles) tinha seu próprio
 * `<Recurso>FormFields.tsx` com ~30 linhas de campos + `<Recurso>FormBody`
 * com ~50 linhas de shell/footer/Alert. Sonar tokenizou ~102 linhas
 * idênticas entre `SystemFormFields.tsx` e `RoleFormFields.tsx`,
 * dispararia BLOCKER de duplicação (>3% de New Code Duplication —
 * 7ª recorrência seguindo o mesmo padrão das PRs #119/#123/#127/#128/
 * #134/#135).
 *
 * Centralizando aqui:
 *
 * - Cada `<recurso>` consome `NameCodeDescriptionFormBody` direto e
 *   passa só o que diverge (placeholders, copy de submit/cancel,
 *   `idPrefix`, callbacks de mudança).
 * - `systems` e `roles` mantêm seus próprios `<Recurso>FormFields.tsx`
 *   apenas como wrapper fino quando precisam de controle adicional;
 *   por padrão consomem o helper diretamente.
 * - Adicionar um recurso futuro com mesmo shape (3 campos
 *   Name/Code/Description) só exige importar este módulo — nenhum
 *   código novo de campos.
 *
 * **Por que não unificar com `RouteFormFields`?** Rotas têm 4 campos
 * (extra `systemTokenTypeId` num `<Select>` com regras próprias —
 * carregamento async, opção sintética para token type inativo, etc.).
 * Forçar abstração que cubra ambos exigiria parametrização excessiva
 * do tipo de campo (Input/Textarea/Select) — o custo cognitivo
 * supera o benefício. Mantemos `RouteFormFields` separado e este
 * módulo focado no shape compartilhado de 2 recursos.
 */

/* ─── Styled primitives ──────────────────────────────────── */

const FormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/* ─── Tipos públicos ─────────────────────────────────────── */

/** Estado controlado dos 3 campos. Usado por todos os recursos com este shape. */
export interface NameCodeDescriptionFormState {
  name: string;
  code: string;
  description: string;
}

/** Erros inline por campo. Cada chave é opcional (undefined = válido). */
export interface NameCodeDescriptionFieldErrors {
  name?: string;
  code?: string;
  description?: string;
}

/**
 * Cópia textual injetada por cada recurso para diferenciar
 * placeholders e helper text sem duplicar JSX. Cada slot existe
 * porque divergiu em pelo menos um recurso real (sistemas vs roles).
 */
export interface NameCodeDescriptionFormCopy {
  /** Placeholder do campo Nome (ex.: "ex.: lfc-authenticator", "ex.: Administrador"). */
  namePlaceholder: string;
  /** Placeholder do campo Código (ex.: "ex.: AUTH", "ex.: admin"). */
  codePlaceholder: string;
  /** Placeholder do Textarea de Descrição. */
  descriptionPlaceholder: string;
}

/* ─── Constantes do contrato (espelham o backend) ────────── */

/** Tamanho máximo do campo `Name` — espelha `MaxLength(80)` no backend. */
export const NAME_CODE_DESCRIPTION_NAME_MAX = 80;
/** Tamanho máximo do campo `Code` — espelha `MaxLength(50)` no backend. */
export const NAME_CODE_DESCRIPTION_CODE_MAX = 50;
/** Tamanho máximo do campo `Description` — espelha `MaxLength(500)` no backend. */
export const NAME_CODE_DESCRIPTION_DESCRIPTION_MAX = 500;

/* ─── Componente: campos (Input/Input/Textarea) ──────────── */

interface NameCodeDescriptionFieldsProps {
  /**
   * Prefixo dos `data-testid` de cada input. Cada recurso usa o seu
   * (`new-system`, `edit-role`, etc.) para preservar IDs estáveis nos
   * testes existentes.
   */
  idPrefix: string;
  /** Estado controlado dos campos. */
  values: NameCodeDescriptionFormState;
  /** Erros inline por campo. */
  errors: NameCodeDescriptionFieldErrors;
  /** Cópia textual (placeholders) específica do recurso. */
  copy: NameCodeDescriptionFormCopy;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  /**
   * Quando `true`, todos os inputs ficam desabilitados (durante
   * submit). Default `false`.
   */
  disabled?: boolean;
  /**
   * Quando `true`, o campo Name recebe `data-modal-initial-focus`
   * para o `Modal` focar nele ao abrir. Default `true` — o caller
   * desliga apenas em fluxos atípicos.
   */
  autoFocusName?: boolean;
}

const NameCodeDescriptionFields: React.FC<NameCodeDescriptionFieldsProps> = ({
  idPrefix,
  values,
  errors,
  copy,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  disabled = false,
  autoFocusName = true,
}) => {
  // `data-modal-initial-focus` no campo Name garante que o foco vá
  // para o primeiro input independente da ordem do `querySelector`
  // do `Modal`. Memoizado para preservar referência do objeto
  // passado como spread.
  const nameFocusAttr = useMemo(
    () =>
      autoFocusName
        ? ({ "data-modal-initial-focus": true } as const)
        : ({} as const),
    [autoFocusName],
  );

  return (
    <FieldStack>
      <Input
        label="Nome"
        placeholder={copy.namePlaceholder}
        value={values.name}
        onChange={onChangeName}
        error={errors.name}
        maxLength={NAME_CODE_DESCRIPTION_NAME_MAX}
        autoComplete="off"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-name`}
        {...nameFocusAttr}
      />
      <Input
        label="Código"
        placeholder={copy.codePlaceholder}
        value={values.code}
        onChange={onChangeCode}
        error={errors.code}
        maxLength={NAME_CODE_DESCRIPTION_CODE_MAX}
        autoComplete="off"
        required
        disabled={disabled}
        data-testid={`${idPrefix}-code`}
      />
      <Textarea
        label="Descrição"
        placeholder={copy.descriptionPlaceholder}
        value={values.description}
        onChange={onChangeDescription}
        error={errors.description}
        helperText={
          errors.description
            ? undefined
            : `${values.description.length}/${NAME_CODE_DESCRIPTION_DESCRIPTION_MAX} caracteres`
        }
        maxLength={NAME_CODE_DESCRIPTION_DESCRIPTION_MAX}
        rows={3}
        disabled={disabled}
        data-testid={`${idPrefix}-description`}
      />
    </FieldStack>
  );
};

/* ─── Componente: form body completo (shell + Alert + footer) ─── */

export interface NameCodeDescriptionFormBodyProps {
  /** Prefixo dos `data-testid` do form e dos campos. */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. */
  values: NameCodeDescriptionFormState;
  /** Erros inline por campo. */
  errors: NameCodeDescriptionFieldErrors;
  /** Cópia textual (placeholders) específica do recurso. */
  copy: NameCodeDescriptionFormCopy;
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
 * Form body completo para entidades com shape Name/Code/Description:
 * shell `<form>` + Alert do erro genérico + campos + linha de hint
 * obrigatórios + footer (Cancelar/Submit).
 *
 * Cada recurso (`systems`, `roles`) passa `idPrefix` próprio para
 * preservar os testIds estáveis das suítes existentes
 * (`new-system-form`, `edit-role-form`, etc.).
 */
export const NameCodeDescriptionFormBody: React.FC<
  NameCodeDescriptionFormBodyProps
> = ({
  idPrefix,
  submitError,
  values,
  errors,
  copy,
  onChangeName,
  onChangeCode,
  onChangeDescription,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}) => (
  <FormShell onSubmit={onSubmit} noValidate data-testid={`${idPrefix}-form`}>
    {submitError && (
      <Alert variant="danger" data-testid={`${idPrefix}-submit-error`}>
        {submitError}
      </Alert>
    )}
    <NameCodeDescriptionFields
      idPrefix={idPrefix}
      values={values}
      errors={errors}
      copy={copy}
      onChangeName={onChangeName}
      onChangeCode={onChangeCode}
      onChangeDescription={onChangeDescription}
      disabled={isSubmitting}
    />
    <SharedFormFooter
      idPrefix={idPrefix}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
    />
  </FormShell>
);

/* ─── Helpers de validação client-side ───────────────────── */

/**
 * Valida o estado do form genérico contra as mesmas regras do
 * backend (`Required`/`MaxLength` em `Name`/`Code`/`Description`).
 * Retorna `null` quando válido, ou um objeto com mensagens por campo.
 *
 * Cada recurso pode usar diretamente ou compor com regras adicionais
 * (nenhum dos consumidores atuais — `systems`/`roles` — precisa
 * estender, então a função é exportada como única fonte de verdade).
 *
 * Centralizar aqui evita ~30 linhas duplicadas entre
 * `validateSystemForm` e `validateRoleForm` (lição PR #128 —
 * mensagens diferem só em literais; lógica é idêntica).
 */
export function validateNameCodeDescriptionForm(
  state: NameCodeDescriptionFormState,
): NameCodeDescriptionFieldErrors | null {
  const errors: NameCodeDescriptionFieldErrors = {};
  const name = state.name.trim();
  const code = state.code.trim();
  const description = state.description.trim();

  if (name.length === 0) {
    errors.name = "Nome é obrigatório.";
  } else if (name.length > NAME_CODE_DESCRIPTION_NAME_MAX) {
    errors.name = `Nome deve ter no máximo ${NAME_CODE_DESCRIPTION_NAME_MAX} caracteres.`;
  }

  if (code.length === 0) {
    errors.code = "Código é obrigatório.";
  } else if (code.length > NAME_CODE_DESCRIPTION_CODE_MAX) {
    errors.code = `Código deve ter no máximo ${NAME_CODE_DESCRIPTION_CODE_MAX} caracteres.`;
  }

  if (description.length > NAME_CODE_DESCRIPTION_DESCRIPTION_MAX) {
    errors.description = `Descrição deve ter no máximo ${NAME_CODE_DESCRIPTION_DESCRIPTION_MAX} caracteres.`;
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Normaliza o nome de campo do backend (PascalCase) para o nome
 * usado no estado do form (camelCase). Lista fechada nos 3 campos
 * compartilhados — qualquer outra chave (ex.: `SystemId` em roles)
 * é ignorada para que o caller não exiba inline um erro que o
 * usuário não controla; tais erros caem no fallback genérico
 * (`submitError`).
 */
function normalizeNameCodeDescriptionFieldName(
  serverField: string,
): keyof NameCodeDescriptionFieldErrors | null {
  const lower = serverField.toLowerCase();
  if (lower === "name") return "name";
  if (lower === "code") return "code";
  if (lower === "description") return "description";
  return null;
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails`
 * do ASP.NET (`{ errors: { Name: ['msg'], ... } }`). Tolerante: se
 * o payload não bate com o shape esperado, devolve `null` para que
 * o caller caia no fallback genérico.
 *
 * Centralizar aqui evita ~20 linhas duplicadas entre
 * `extractSystemValidationErrors` e `extractRoleValidationErrors`
 * — apenas a lista de campos aceitos diferia (ambos têm Name/
 * Code/Description; `route` adicionaria SystemTokenTypeId, daí
 * por que `routeFormShared.ts` não consome este helper).
 */
export function extractNameCodeDescriptionValidationErrors(
  details: unknown,
): NameCodeDescriptionFieldErrors | null {
  if (!details || typeof details !== "object") {
    return null;
  }
  const errors = (details as Record<string, unknown>).errors;
  if (!errors || typeof errors !== "object") {
    return null;
  }
  const result: NameCodeDescriptionFieldErrors = {};
  for (const [serverField, raw] of Object.entries(errors)) {
    const field = normalizeNameCodeDescriptionFieldName(serverField);
    if (!field) continue;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
      result[field] = raw[0];
    } else if (typeof raw === "string") {
      result[field] = raw;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resultado do mapeamento de uma `ApiError` 400 do backend para
 * forms NameCodeDescription. O caller usa essa decisão para chamar
 * `setFieldErrors` (campos mapeados) ou `setSubmitError` (mensagem
 * genérica).
 */
export type NameCodeDescriptionSubmitDecision =
  | { kind: "field-errors"; errors: NameCodeDescriptionFieldErrors }
  | { kind: "submit-error"; message: string };

/**
 * Decide o tratamento de uma resposta 400 do backend:
 *
 * - Se o payload bate com `ValidationProblemDetails` e o backend
 *   identificou ao menos um campo, devolve `field-errors` com as
 *   mensagens mapeadas.
 * - Caso contrário, devolve `submit-error` com a mensagem do
 *   backend (caller exibe `Alert` no topo do form).
 *
 * Centralizar aqui evita ~10 linhas duplicadas entre
 * `decideBadRequestHandling` (sistemas) e
 * `decideRoleBadRequestHandling` (roles).
 */
export function decideNameCodeDescriptionBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): NameCodeDescriptionSubmitDecision {
  const validation = extractNameCodeDescriptionValidationErrors(details);
  if (validation) {
    return { kind: "field-errors", errors: validation };
  }
  return { kind: "submit-error", message: fallbackMessage };
}
