import React from "react";

import {
  NameCodeDescriptionFormBody,
  type NameCodeDescriptionFieldErrors,
  type NameCodeDescriptionFormCopy,
  type NameCodeDescriptionFormState,
} from "../../shared/forms";

/**
 * Wrapper fino do `NameCodeDescriptionFormBody` parametrizado com
 * placeholders/copy do recurso "roles".
 *
 * Antes da Issue #68 cada recurso (sistemas, roles) declarava seu
 * próprio `<Recurso>FormFields.tsx` com 100+ linhas de campos +
 * shell + footer — gatilho garantido de BLOCKER de duplicação Sonar
 * (lição PR #128/#134/#135 — Sonar tokenizou >100 linhas
 * idênticas). Centralizamos no helper genérico
 * `src/shared/forms/NameCodeDescriptionForm.tsx`; cada recurso
 * mantém apenas as cópias textuais e tipos locais.
 *
 * **Por que manter o wrapper?** Para preservar a API local
 * (`RoleFormBody` continua sendo importado de `./RoleFormFields`)
 * e os tipos específicos do recurso (`RoleFieldErrors` /
 * `RoleFormState`) ficarem acoplados ao módulo `rolesFormShared.ts`
 * em vez de vazar o nome genérico no callsite — o `EditRoleModal`
 * (e o futuro `NewRoleModal`) consomem o tipo do recurso, não o
 * tipo genérico.
 */

/* ─── Cópia textual (placeholders) específica de roles ─── */

const ROLE_FORM_COPY: NameCodeDescriptionFormCopy = {
  namePlaceholder: "ex.: Administrador",
  codePlaceholder: "ex.: admin",
  descriptionPlaceholder: "Descrição opcional da role.",
};

/* ─── Form body ──────────────────────────────────────────── */

interface RoleFormBodyProps {
  /**
   * Prefixo dos `data-testid` do form e dos campos. Em produção,
   * `new-role` ou `edit-role`; preserva os testIds estáveis das
   * suítes (`RolesPage.edit.test.tsx`, futura `.create.test.tsx`).
   */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. Tipos vêm do `rolesFormShared.ts`. */
  values: NameCodeDescriptionFormState;
  /** Erros inline por campo. */
  errors: NameCodeDescriptionFieldErrors;
  onChangeName: (value: string) => void;
  onChangeCode: (value: string) => void;
  onChangeDescription: (value: string) => void;
  /** Handler do submit do form. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar role", "Salvar alterações"). */
  submitLabel: string;
}

export const RoleFormBody: React.FC<RoleFormBodyProps> = (props) => (
  <NameCodeDescriptionFormBody {...props} copy={ROLE_FORM_COPY} />
);
