import React from "react";

import {
  NameCodeDescriptionFormBody,
  type NameCodeDescriptionFormBodyProps,
  type NameCodeDescriptionFormCopy,
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
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** as props internas
 * (`RoleFormBodyProps`) duplicavam ~13 linhas com
 * `NameCodeDescriptionFormBodyProps`. Substituídas por
 * `Omit<NameCodeDescriptionFormBodyProps, 'copy'>` para deduplicar a
 * declaração — o `copy` é injetado pelo wrapper e não é prop pública.
 */

/* ─── Cópia textual (placeholders) específica de roles ─── */

const ROLE_FORM_COPY: NameCodeDescriptionFormCopy = {
  namePlaceholder: "ex.: Administrador",
  codePlaceholder: "ex.: admin",
  descriptionPlaceholder: "Descrição opcional da role.",
};

/* ─── Form body ──────────────────────────────────────────── */

/**
 * Props do `<RoleFormBody>` — alias estrutural das props do
 * `NameCodeDescriptionFormBody` excluindo `copy` (injetado
 * internamente). Centralizar via `Omit<...Props, 'copy'>` elimina a
 * duplicação que o JSCPD detectaria entre `RoleFormFields` e
 * `TokenTypeFormFields` (lição PR #134/#135).
 */
type RoleFormBodyProps = Omit<NameCodeDescriptionFormBodyProps, "copy">;

export const RoleFormBody: React.FC<RoleFormBodyProps> = (props) => (
  <NameCodeDescriptionFormBody {...props} copy={ROLE_FORM_COPY} />
);
