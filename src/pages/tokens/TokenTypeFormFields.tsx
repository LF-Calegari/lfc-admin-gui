import React from 'react';

import {
  NameCodeDescriptionFormBody,
  type NameCodeDescriptionFormBodyProps,
  type NameCodeDescriptionFormCopy,
} from '../../shared/forms';

/**
 * Wrapper fino do `NameCodeDescriptionFormBody` parametrizado com
 * placeholders/copy do recurso "token types" (Issue #175).
 *
 * Espelha o desenho de `RoleFormFields`/`SystemFormFields` —
 * centralizamos no helper genérico
 * `src/shared/forms/NameCodeDescriptionForm.tsx` e cada recurso
 * mantém apenas as cópias textuais e tipos locais.
 *
 * **Por que manter o wrapper?** Para preservar a API local
 * (`TokenTypeFormBody` continua sendo importado de
 * `./TokenTypeFormFields`) e facilitar refatorações futuras se o
 * recurso ganhar campos exclusivos — `EditTokenTypeModal` e
 * `NewTokenTypeModal` consomem o tipo do recurso, não o tipo
 * genérico. Internamente, as props são `Omit<...Props, 'copy'>` para
 * deduplicar a interface (lição PR #134/#135 — JSCPD tokenizou ~11
 * linhas idênticas entre `TokenTypeFormFields` e
 * `NameCodeDescriptionForm`).
 */

/* ─── Cópia textual (placeholders) específica de token types ─── */

const TOKEN_TYPE_FORM_COPY: NameCodeDescriptionFormCopy = {
  namePlaceholder: 'ex.: Acesso padrão',
  codePlaceholder: 'ex.: default',
  descriptionPlaceholder: 'Descrição opcional do tipo de token.',
};

/* ─── Form body ──────────────────────────────────────────── */

/**
 * Props do `<TokenTypeFormBody>` — alias estrutural das props do
 * `NameCodeDescriptionFormBody` excluindo `copy` (que injetamos
 * internamente). Centralizar via `Omit<...Props, 'copy'>` elimina a
 * duplicação que o JSCPD detectou entre `TokenTypeFormFields` e
 * `NameCodeDescriptionForm` no Issue #175.
 */
type TokenTypeFormBodyProps = Omit<NameCodeDescriptionFormBodyProps, 'copy'>;

export const TokenTypeFormBody: React.FC<TokenTypeFormBodyProps> = (props) => (
  <NameCodeDescriptionFormBody {...props} copy={TOKEN_TYPE_FORM_COPY} />
);
