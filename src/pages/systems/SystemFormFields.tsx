import React from "react";

import {
  NameCodeDescriptionFormBody,
  type NameCodeDescriptionFormBodyProps,
  type NameCodeDescriptionFormCopy,
} from "../../shared/forms";

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
 *
 * **Lição PR #134/#135 reforçada (Issue #175):** as props internas
 * (`SystemFormBodyProps`) duplicavam ~15 linhas com
 * `NameCodeDescriptionFormBodyProps` (visíveis no exported type após
 * o Issue #175). Substituídas por
 * `Omit<NameCodeDescriptionFormBodyProps, 'copy'>` — `copy` é
 * injetado pelo wrapper e não é prop pública.
 */

/* ─── Cópia textual (placeholders) específica de sistemas ─── */

const SYSTEM_FORM_COPY: NameCodeDescriptionFormCopy = {
  namePlaceholder: "ex.: lfc-authenticator",
  codePlaceholder: "ex.: AUTH",
  descriptionPlaceholder: "Descrição opcional do sistema.",
};

/* ─── Form body ──────────────────────────────────────────── */

/**
 * Props do `<SystemFormBody>` — alias estrutural das props do
 * `NameCodeDescriptionFormBody` excluindo `copy` (injetado
 * internamente). Centralizar via `Omit<...Props, 'copy'>` elimina
 * duplicação cross-recurso (lição PR #134/#135).
 */
type SystemFormBodyProps = Omit<NameCodeDescriptionFormBodyProps, "copy">;

export const SystemFormBody: React.FC<SystemFormBodyProps> = (props) => (
  <NameCodeDescriptionFormBody {...props} copy={SYSTEM_FORM_COPY} />
);
