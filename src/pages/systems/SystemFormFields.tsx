import React from "react";

import {
  NameCodeDescriptionFormBody,
  type NameCodeDescriptionFormCopy,
} from "../../shared/forms";

import {
  type SystemFieldErrors,
  type SystemFormState,
} from "./systemFormShared";

/**
 * Wrapper fino do `NameCodeDescriptionFormBody` parametrizado com
 * placeholders/copy do recurso "systems".
 *
 * Antes da Issue #68 este arquivo carregava ~250 linhas de campos +
 * shell + footer + helpers — duplicadas integralmente pelo `roles`
 * (#68) e quase integralmente pelo `routes` (sem o `<Select>` de
 * token type). Sonar tokenizou >100 linhas idênticas entre
 * `SystemFormFields.tsx` e `RoleFormFields.tsx` (lição PR
 * #128/#134/#135 — 7ª recorrência potencial de New Code
 * Duplication).
 *
 * Centralizamos em `src/shared/forms/NameCodeDescriptionForm.tsx`;
 * este arquivo agora é só um wrapper que injeta as cópias
 * específicas de "sistema". Preserva a API local
 * (`SystemFormBody` continua sendo importado de
 * `./SystemFormFields`) para que `NewSystemModal`/`EditSystemModal`
 * não precisem mudar.
 */

/* ─── Cópia textual (placeholders) específica de sistemas ─── */

const SYSTEM_FORM_COPY: NameCodeDescriptionFormCopy = {
  namePlaceholder: "ex.: lfc-authenticator",
  codePlaceholder: "ex.: AUTH",
  descriptionPlaceholder: "Descrição opcional do sistema.",
};

/* ─── Form body ──────────────────────────────────────────── */

interface SystemFormBodyProps {
  /**
   * Prefixo dos `data-testid` do form e dos campos. Em produção,
   * `new-system` ou `edit-system` — preserva os testIds estáveis
   * das suítes `SystemsPage.create.test.tsx` (#58/#127) e
   * `SystemsPage.edit.test.tsx` (#59).
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

export const SystemFormBody: React.FC<SystemFormBodyProps> = (props) => (
  <NameCodeDescriptionFormBody {...props} copy={SYSTEM_FORM_COPY} />
);
