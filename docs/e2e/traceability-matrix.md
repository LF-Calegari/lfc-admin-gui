# Matriz de rastreabilidade E2E — lfc-admin-gui

Documento de referência do épico [#211](https://github.com/LF-Calegari/lfc-admin-gui/issues/211). Cobre **rota × fluxo × persona RBAC** de todas as funcionalidades do painel administrativo.

| Metadado | Valor |
|----------|-------|
| Issue | [#215](https://github.com/LF-Calegari/lfc-admin-gui/issues/215) |
| Repositório | `LF-Calegari/lfc-admin-gui` |
| Base de rotas | `src/routes/index.tsx`, `src/components/layout/Sidebar.tsx` |
| Personas (seed) | [#214](https://github.com/LF-Calegari/lfc-admin-gui/issues/214) |
| Playwright bootstrap | [#212](https://github.com/LF-Calegari/lfc-admin-gui/issues/212) (fora do escopo desta issue) |
| Última revisão | 2026-05-16 |

---

## Legenda

### Personas

| Sigla | Conta seed (#214) | Catálogo `routes` (resumo) |
|-------|-------------------|----------------------------|
| **P-SA** | `e2e-superadmin` | Todas as permissões `AUTH_V1_*` necessárias ao painel (list + create + update + delete + restore + assign conforme módulo) |
| **P-PT** | `e2e-partial` | `AUTH_V1_SYSTEMS_LIST`, `AUTH_V1_USERS_LIST`, `AUTH_V1_USERS_GET_BY_ID`, `AUTH_V1_CLIENTS_LIST`, `AUTH_V1_CLIENTS_GET_BY_ID` — **sem** create/update/delete/restore/assign |
| **P-DN** | `e2e-denied` | Sessão válida, catálogo vazio (nenhum `AUTH_V1_*` de módulo) |
| **P-ANON** | — | Sem token / sem sessão |

### Colunas de resultado por persona

| Símbolo | Significado |
|---------|-------------|
| ✅ | Fluxo permitido; UI e API alinhadas à permissão |
| 👁️ | Somente leitura: rota/página acessível; ações mutáveis ocultas ou desabilitadas |
| ⛔403 | `RequirePermission` ou API → redireciona para `/error/403` (ou página 403) |
| 🔒 | Redireciona para `/login` (rota protegida sem sessão) |
| — | Não aplicável ao fluxo |

### Status da spec Playwright

| Status | Significado |
|--------|-------------|
| **Doc** | Coberto por esta matriz (#215); spec ainda não implementada |
| **#NNN** | Issue filha responsável pela spec (ver coluna *Spec*) |

> **DoD épico #211:** nenhuma célula da coluna *Status* pode permanecer vazia, `TBD` ou `⬜`. Enquanto Playwright não existir, use **Doc** + issue filha na coluna *Spec*.

---

## Convenção `@matrix-id`

Cada linha funcional recebe um identificador estável **`E2E-<ÁREA>-<NNN>`** (três dígitos, zero-padded).

### Áreas (`<ÁREA>`)

| Código | Domínio |
|--------|---------|
| `SHL` | App shell (layout, sidebar, topbar, tema, mobile) |
| `AUT` | Autenticação e sessão |
| `ERR` | Páginas de erro HTTP-like |
| `SYS` | Sistemas |
| `RTE` | Rotas (escopadas e globais) |
| `ROL` | Roles (escopadas e globais) |
| `RPR` | Permissões da role (scoped) |
| `PRM` | Catálogo de permissões |
| `CLI` | Clientes |
| `USR` | Usuários (listagem, detalhe, sub-rotas) |
| `TKN` | Tipos de token JWT |
| `SET` | Configurações pessoais |
| `SHW` | Showcase UI (DEV) |

### Uso em specs Playwright

Referencie o id no comentário imediatamente acima do `test` / `describe`:

```typescript
// @matrix-id E2E-SYS-003
test('superadmin cria sistema com sucesso', async ({ page }) => {
  // ...
});
```

Regras:

1. **Um** `@matrix-id` por teste que valida o fluxo; testes auxiliares (fixtures) não precisam.
2. O id da spec deve existir nesta matriz antes do merge da PR de E2E.
3. PRs que adicionam fluxo novo: atualizar esta matriz **no mesmo PR** (ver [pr-checklist.md](./pr-checklist.md)).

### Busca

```bash
rg '@matrix-id E2E-SYS' e2e/
rg 'E2E-SYS-003' docs/e2e/traceability-matrix.md
```

---

## `data-testid` obrigatórios

Seletores estáveis para Playwright. Padrão: **kebab-case**, prefixo do recurso, sufixo dinâmico com `{id}` quando linha/card.

### Globais (shell + auth + UI)

| Componente | `data-testid` | Obrigatório |
|------------|---------------|-------------|
| Splash de sessão | `auth-splash` | Sim |
| Login — submit | `login-submit` | Sim |
| Login — esqueci senha | `login-forgot` | Sim |
| Sidebar — logo | `sidebar-logo` | Sim |
| Sidebar — backdrop mobile | `sidebar-backdrop` | Sim |
| Topbar — menu hamburger | `topbar-menu-button` | Sim |
| Tema claro/escuro | `theme-toggle` | Sim |
| Modal — backdrop | `modal-backdrop` | Sim |
| Input senha — toggle | `input-password-toggle` | Sim |

### Padrão de listagens (`testIdPrefix`)

Toda listagem paginada deve expor (via `ListingToolbar` + `ListingResultArea`):

| Sufixo | Exemplo (`systems`) |
|--------|---------------------|
| `{prefix}-search` | `systems-search` |
| `{prefix}-include-deleted` | `systems-include-deleted` |
| `{prefix}-loading` | `systems-loading` |
| `{prefix}-overlay` | `systems-overlay` |
| `{prefix}-retry` | `systems-retry` |
| `{prefix}-empty-clear` | `systems-empty-clear` |
| `{prefix}-live` | `systems-live` |
| `{prefix}-pagination-info` | `systems-pagination-info` |
| `{prefix}-pagination-prev` | `systems-pagination-prev` |
| `{prefix}-pagination-next` | `systems-pagination-next` |
| `{prefix}-create-open` | `systems-create-open` |
| `{prefix}-card-list` | `systems-card-list` (viewport mobile) |
| `{prefix}-card-{id}` | `systems-card-{uuid}` |

### Padrão de formulários (`idPrefix`)

| Sufixo | Exemplo |
|--------|---------|
| `{prefix}-form` | `new-system-form` |
| `{prefix}-name` | `new-system-name` |
| `{prefix}-code` | `new-system-code` |
| `{prefix}-description` | `new-system-description` |
| `{prefix}-submit-error` | `new-system-submit-error` |

### Padrão de atribuição (matriz permissões/roles)

| Sufixo | Exemplo |
|--------|---------|
| `{prefix}-back` | `user-permissions-back` |
| `{prefix}-save` | `user-permissions-save` |
| `{prefix}-reset` | `user-permissions-reset` |
| `{prefix}-loading` | `user-permissions-loading` |
| `{prefix}-empty` | `user-permissions-empty` |
| `{prefix}-checkbox-{id}` | `user-permissions-checkbox-{uuid}` |

### Gaps conhecidos (adicionar ao implementar E2E)

| Área | Gap | Ação na spec #218–#231 |
|------|-----|------------------------|
| Páginas de erro | Sem `data-testid` em `UnauthorizedPage`, `ForbiddenPage`, `NotFoundPage`, `InternalErrorPage` | Preferir `getByRole`; ou adicionar `error-{code}-title` / `error-{code}-action` |
| Login | Campos e-mail/senha sem testid | Usar `getByLabelText` ou adicionar `login-email`, `login-password` |
| Topbar | Logout / avatar sem testid | `getByRole('button', { name })` ou `topbar-logout` |
| Settings / Showcase | Sem testids | `getByRole` + headings até vitrine E2E |

---

## 1. Autenticação e sessão (`AUT`)

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-AUT-001 | `/login` | Renderizar formulário (não autenticado) | Público | — | — | — | ✅ | `login-submit`, `login-forgot`, `login-eyebrow` | #218 | Doc |
| E2E-AUT-002 | `/login` | Login válido → redirect `/systems` (ou `state.from`) | Público | ✅ | ✅ | ✅ | — | `login-submit` | #218 | Doc |
| E2E-AUT-003 | `/login` | Credenciais inválidas → mensagem de erro | Público | — | — | — | ✅ | `login-submit` | #218 | Doc |
| E2E-AUT-004 | `/login` | "Esqueci a senha" → toast informativo | Público | — | — | — | ✅ | `login-forgot` | #218 | Doc |
| E2E-AUT-005 | `/login` | Usuário já autenticado → redirect área logada | Sessão | ✅ | ✅ | ✅ | — | — | #218 | Doc |
| E2E-AUT-006 | `/*` autenticado | Splash `verify-token` no boot | `RequireAuth` | ✅ | ✅ | ✅ | 🔒 | `auth-splash` | #218 | Doc |
| E2E-AUT-007 | `/*` autenticado | Logout via Topbar → `/login` + storage limpo | Sessão | ✅ | ✅ | ✅ | — | — (Topbar: role/name) | #218 | Doc |
| E2E-AUT-008 | `/systems` | Acesso sem token → redirect `/login` | `RequireAuth` | — | — | — | 🔒 | — | #218 | Doc |
| E2E-AUT-009 | `/*` | Sessão expirada / 401 API → tratamento global | Sessão | ✅ | ✅ | ✅ | 🔒 | — | #218 | Doc |

---

## 2. Páginas de erro HTTP-like (`ERR`)

Rotas: `/error/:code` (públicas) e wildcard `*` → `NotFoundPage`.

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-ERR-001 | `/error/401` | Exibir 401 + CTA login | Público | ✅ | ✅ | ✅ | ✅ | — (role heading) | #218 | Doc |
| E2E-ERR-002 | `/error/403` | Exibir 403 + CTA voltar | Público | ✅ | ✅ | ✅ | ✅ | — | #218 | Doc |
| E2E-ERR-003 | `/error/404` | Exibir 404 + CTA início | Público | ✅ | ✅ | ✅ | ✅ | — | #218 | Doc |
| E2E-ERR-004 | `/error/500` | Exibir 500 + CTA retry/início | Público | ✅ | ✅ | ✅ | ✅ | — | #218 | Doc |
| E2E-ERR-005 | `/error/999` | Código desconhecido → fallback 404 | Público | ✅ | ✅ | ✅ | ✅ | — | #218 | Doc |
| E2E-ERR-006 | `/rota-inexistente` | Wildcard 404 (URL preservada) | Público | ✅ | ✅ | ✅ | ✅ | — | #218 | Doc |
| E2E-ERR-007 | `/systems` | Sem `AUTH_V1_SYSTEMS_LIST` → `/error/403` | `RequirePermission` | ✅ | — | ⛔403 | 🔒 | — | #218 | Doc |
| E2E-ERR-008 | `/permissoes` | Sem `AUTH_V1_PERMISSIONS_LIST` → 403 | `RequirePermission` | ✅ | ⛔403 | ⛔403 | 🔒 | — | #218 | Doc |

---

## 3. App shell (`SHL`)

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-SHL-001 | `/` | Index redirect → `/systems` | Autenticado | ✅ | ✅ | ⛔403 | 🔒 | — | #219 | Doc |
| E2E-SHL-002 | `/*` | Sidebar: itens conforme permissões | RBAC visual | ✅ | 👁️ parcial | 👁️ só Settings | — | `sidebar-logo` | #219 | Doc |
| E2E-SHL-003 | `/*` | Sidebar: link ativo na rota atual | Autenticado | ✅ | ✅ | ✅ | — | NavLink `href` | #219 | Doc |
| E2E-SHL-004 | `/*` | Topbar: título dinâmico por rota | Autenticado | ✅ | ✅ | ✅ | — | — | #219 | Doc |
| E2E-SHL-005 | `/*` | Topbar: e-mail do usuário logado | Autenticado | ✅ | ✅ | ✅ | — | — | #219 | Doc |
| E2E-SHL-006 | `/*` | Alternar tema claro/escuro | Autenticado | ✅ | ✅ | ✅ | — | `theme-toggle` | #219 | Doc |
| E2E-SHL-007 | mobile | Hamburger abre drawer + backdrop | `<48em` | ✅ | ✅ | ✅ | — | `topbar-menu-button`, `sidebar-backdrop` | #219 | Doc |
| E2E-SHL-008 | mobile | ESC / backdrop / link fecha drawer | `<48em` | ✅ | ✅ | ✅ | — | `sidebar-backdrop` | #219 | Doc |
| E2E-SHL-009 | `/*` | P-PT não vê item Sidebar sem permissão | RBAC | — | 👁️ | — | — | — | #219 | Doc |
| E2E-SHL-010 | `/*` | P-DN vê apenas Configurações (+ Showcase DEV) | RBAC | — | — | 👁️ | — | — | #219 | Doc |

---

## 4. Sistemas (`SYS`) — `/systems`

Gate rota: `AUTH_V1_SYSTEMS_LIST`. Mutações: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`.

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-SYS-001 | `/systems` | Listagem inicial + stats | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-loading`, `systems-live` | #220 | Doc |
| E2E-SYS-002 | `/systems` | Busca debounced | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-search` | #220 | Doc |
| E2E-SYS-003 | `/systems` | Toggle incluir desativados | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-include-deleted` | #220 | Doc |
| E2E-SYS-004 | `/systems` | Paginação prev/next | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-pagination-*` | #220 | Doc |
| E2E-SYS-005 | `/systems` | Estado vazio + limpar busca | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-empty-clear` | #220 | Doc |
| E2E-SYS-006 | `/systems` | Erro de rede + retry | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-retry` | #220 | Doc |
| E2E-SYS-007 | `/systems` | Abrir modal criar sistema | CREATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `systems-create-open`, `new-system-*` | #220 | Doc |
| E2E-SYS-008 | `/systems` | Criar sistema sucesso | CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `new-system-form` | #220 | Doc |
| E2E-SYS-009 | `/systems` | Editar sistema (modal) | UPDATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `systems-edit-{id}` | #220 | Doc |
| E2E-SYS-010 | `/systems` | Desativar (soft delete) | DELETE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `systems-delete-{id}`, `delete-system-*` | #220 | Doc |
| E2E-SYS-011 | `/systems` | Restaurar sistema | RESTORE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `systems-restore-{id}`, `restore-system-*` | #220 | Doc |
| E2E-SYS-012 | `/systems` | Cards mobile (breakpoint) | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `systems-card-list`, `systems-card-{id}` | #220 | Doc |
| E2E-SYS-013 | `/systems/:id/routes` | Navegação para rotas do sistema | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-back` | #221 | Doc |
| E2E-SYS-014 | `/systems/:id/roles` | Navegação para roles do sistema | ROLES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-back` | #222 | Doc |

---

## 5. Rotas (`RTE`)

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-RTE-001 | `/systems/:systemId/routes` | Listagem escopada | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-search`, `routes-loading` | #221 | Doc |
| E2E-RTE-002 | `/systems/:systemId/routes` | ID inválido → aviso | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-invalid-id` | #221 | Doc |
| E2E-RTE-003 | `/systems/:systemId/routes` | Criar rota | ROUTES_CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-create-open`, `new-route-*` | #221 | Doc |
| E2E-RTE-004 | `/systems/:systemId/routes` | Editar / excluir rota | UPDATE/DELETE | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-edit-{id}`, `routes-delete-{id}` | #221 | Doc |
| E2E-RTE-005 | `/routes` | Listagem global + filtro sistema | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-global-system-filter` | #221 | Doc |
| E2E-RTE-006 | `/routes` | Link para sistema na linha | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-global-system-link-{id}` | #221 | Doc |
| E2E-RTE-007 | `/routes` | Cards mobile | ROUTES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `routes-global-card-list` | #221 | Doc |

---

## 6. Roles (`ROL`)

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-ROL-001 | `/systems/:systemId/roles` | Listagem escopada | ROLES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-search`, `roles-back` | #222 | Doc |
| E2E-ROL-002 | `/systems/:systemId/roles` | Criar role | ROLES_CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-create-open`, `new-role-*` | #222 | Doc |
| E2E-ROL-003 | `/systems/:systemId/roles` | Editar role | ROLES_UPDATE | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-edit-{id}` | #222 | Doc |
| E2E-ROL-004 | `/systems/:systemId/roles` | Atalho permissões da role | ROLES_UPDATE + PERM_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-permissions-{id}` | #223 | Doc |
| E2E-ROL-005 | `/roles` | Listagem global + filtro | ROLES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-global-system-filter` | #222 | Doc |
| E2E-ROL-006 | `/roles` | Abrir role no sistema | ROLES_LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-global-open-{id}` | #222 | Doc |
| E2E-ROL-007 | `/roles` | Criar role global | ROLES_CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `roles-global-create-open` | #222 | Doc |

---

## 7. Permissões da role (`RPR`) — `/systems/:systemId/roles/:roleId/permissoes`

Gate rota: `AUTH_V1_PERMISSIONS_LIST` + `AUTH_V1_ROLES_UPDATE`.

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-RPR-001 | `.../permissoes` | Carregar matriz agrupada | Ambos | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-loading` | #223 | Doc |
| E2E-RPR-002 | `.../permissoes` | Toggle permissão + diff | ROLES_UPDATE | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-checkbox-{id}` | #223 | Doc |
| E2E-RPR-003 | `.../permissoes` | Salvar / resetar alterações | ROLES_UPDATE | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-save`, `role-permissions-reset` | #223 | Doc |
| E2E-RPR-004 | `.../permissoes` | Estado vazio catálogo | Ambos | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-empty` | #223 | Doc |
| E2E-RPR-005 | `.../permissoes` | roleId inválido | Ambos | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-invalid-id` | #223 | Doc |
| E2E-RPR-006 | `.../permissoes` | Voltar para lista de roles | Ambos | ✅ | ⛔403 | ⛔403 | 🔒 | `role-permissions-back` | #223 | Doc |

---

## 8. Catálogo de permissões (`PRM`) — `/permissoes`

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-PRM-001 | `/permissoes` | Listagem + filtros sistema/tipo | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `permissions-system-filter`, `permissions-type-filter` | #224 | Doc |
| E2E-PRM-002 | `/permissoes` | Busca e paginação | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `permissions-search`, `permissions-pagination-*` | #224 | Doc |
| E2E-PRM-003 | `/permissoes` | Cards mobile | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `permissions-card-list`, `permissions-card-{id}` | #224 | Doc |
| E2E-PRM-004 | `/permissoes` | Criar permissão (modal) | CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `permissions-create-open`, `new-permission-*` | #224 | Doc |
| E2E-PRM-005 | `/permissoes` | Erro / empty / retry | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `permissions-empty-clear`, `permissions-retry` | #224 | Doc |

---

## 9. Clientes (`CLI`)

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-CLI-001 | `/clientes` | Listagem + filtro tipo | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `clients-type-filter`, `clients-search` | #225 | Doc |
| E2E-CLI-002 | `/clientes` | Criar cliente (modal) | CREATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `clients-create-open`, `new-client-*` | #225 | Doc |
| E2E-CLI-003 | `/clientes` | Soft delete / restore | DELETE/RESTORE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `clients-delete-{id}`, `clients-restore-{id}` | #225 | Doc |
| E2E-CLI-004 | `/clientes/:id` | Detalhe + abas (dados, e-mails, telefones) | GET_BY_ID | ✅ | 👁️ | ⛔403 | 🔒 | `client-edit-tab-*`, `client-edit-panel-*` | #225 | Doc |
| E2E-CLI-005 | `/clientes/:id` | Salvar dados (PF/PJ) | UPDATE | ✅ | 👁️ readonly | ⛔403 | 🔒 | `client-edit-form`, `client-edit-cpf` | #225 | Doc |
| E2E-CLI-006 | `/clientes/:id` | E-mails extras CRUD | UPDATE | ✅ | 👁️ readonly | ⛔403 | 🔒 | `client-extra-emails-add`, `client-extra-emails-row-{id}` | #225 | Doc |
| E2E-CLI-007 | `/clientes/:id` | Telefones mobile/fixo CRUD | UPDATE | ✅ | 👁️ readonly | ⛔403 | 🔒 | `client-mobile-phones-add`, `client-landline-phones-*` | #225 | Doc |
| E2E-CLI-008 | `/clientes/:id` | Desativar cliente | UPDATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `client-edit-deactivate` | #225 | Doc |

---

## 10. Usuários (`USR`)

### 10.1 Listagem — `/usuarios`

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-USR-001 | `/usuarios` | Listagem + busca | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `users-search`, `users-loading` | #226 | Doc |
| E2E-USR-002 | `/usuarios` | Criar usuário | CREATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `users-create-open`, `new-user-*` | #226 | Doc |
| E2E-USR-003 | `/usuarios` | Editar / reset senha / force logout / toggle ativo | UPDATE | ✅ | 👁️ oculto | ⛔403 | 🔒 | `users-edit-{id}`, `users-reset-password-{id}` | #226 | Doc |
| E2E-USR-004 | `/usuarios` | Cards mobile | LIST | ✅ | 👁️ | ⛔403 | 🔒 | `users-card-list`, `users-card-{id}` | #226 | Doc |

### 10.2 Detalhe — `/usuarios/:id`

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-USR-005 | `/usuarios/:id` | Resumo + links rápidos | GET_BY_ID | ✅ | 👁️ | ⛔403 | 🔒 | `user-detail-summary`, `user-detail-link-roles` | #227 | Doc |
| E2E-USR-006 | `/usuarios/:id` | Painel roles embutido (read) | ROLES_LIST | ✅ | 👁️ | ⛔403 | 🔒 | `user-detail-roles-locked` (sem assign) | #227 | Doc |
| E2E-USR-007 | `/usuarios/:id` | Permissões diretas embutidas (read) | PERM_LIST | ✅ | 👁️ | ⛔403 | 🔒 | `user-detail-direct-permissions-locked` | #227 | Doc |

### 10.3 Sub-rotas de atribuição

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-USR-008 | `/usuarios/:id/permissoes` | Matriz permissões diretas | PERM_LIST + ASSIGN | ✅ | ⛔403 | ⛔403 | 🔒 | `user-permissions-save`, `user-permissions-checkbox-{id}` | #228 | Doc |
| E2E-USR-009 | `/usuarios/:id/roles` | Atribuição de roles | ROLES_LIST + ASSIGN | ✅ | ⛔403 | ⛔403 | 🔒 | `user-roles-save`, `user-roles-checkbox-{id}` | #228 | Doc |
| E2E-USR-010 | `/usuarios/:id/permissoes-efetivas` | Painel read-only efetivas | PERM_LIST + GET_BY_ID | ✅ | ⛔403 | ⛔403 | 🔒 | `user-effective-permissions-system-select` | #228 | Doc |
| E2E-USR-011 | `/usuarios/:id/*` | userId inválido em sub-rotas | GET_BY_ID | ✅ | 👁️ | ⛔403 | 🔒 | `user-permissions-invalid-id` | #228 | Doc |

---

## 11. Tipos de token JWT (`TKN`) — `/tokens`

| @matrix-id | Rota | Fluxo | Gate mutação | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|--------------|------|------|------|--------|-------------|------|--------|
| E2E-TKN-001 | `/tokens` | Listagem | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `token-types-search`, `token-types-loading` | #229 | Doc |
| E2E-TKN-002 | `/tokens` | Criar tipo de token | CREATE | ✅ | ⛔403 | ⛔403 | 🔒 | `token-types-create-open` | #229 | Doc |
| E2E-TKN-003 | `/tokens` | Editar tipo | UPDATE | ✅ | ⛔403 | ⛔403 | 🔒 | `token-types-edit-{id}` | #229 | Doc |
| E2E-TKN-004 | `/tokens` | Desativar / restaurar | DELETE/RESTORE | ✅ | ⛔403 | ⛔403 | 🔒 | `token-types-delete-{id}` (via shared soft-delete) | #229 | Doc |
| E2E-TKN-005 | `/tokens` | Cards mobile | LIST | ✅ | ⛔403 | ⛔403 | 🔒 | `token-types-card-list` | #229 | Doc |

---

## 12. Configurações (`SET`) — `/settings`

Sem `RequirePermission` — qualquer usuário autenticado.

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-SET-001 | `/settings` | Renderizar card sessão (read-only UI) | Autenticado | ✅ | ✅ | ✅ | 🔒 | — (heading) | #230 | Doc |
| E2E-SET-002 | `/settings` | Item sempre visível na Sidebar | Autenticado | ✅ | ✅ | ✅ | 🔒 | NavLink Configurações | #230 | Doc |

---

## 13. Showcase UI (`SHW`) — `/showcase`

Somente `import.meta.env.DEV` — rota e item Sidebar ausentes em produção.

| @matrix-id | Rota | Fluxo | Gate | P-SA | P-PT | P-DN | P-ANON | data-testid | Spec | Status |
|------------|------|-------|------|------|------|------|--------|-------------|------|--------|
| E2E-SHW-001 | `/showcase` | Renderizar vitrine de componentes | DEV + Auth | ✅ | ✅ | ✅ | 🔒 | — | #231 | Doc |
| E2E-SHW-002 | build prod | Rota `/showcase` inacessível (404) | Produção | — | — | — | — | — | #231 | Doc |
| E2E-SHW-003 | DEV | Item "Showcase UI" na Sidebar | DEV | ✅ | ✅ | ✅ | 🔒 | NavLink Showcase | #231 | Doc |

---

## Mapa rota → permissão de listagem

Referência rápida alinhada a `Sidebar.tsx` e `routes/index.tsx`.

| Rota | `requiredCode` / gate |
|------|------------------------|
| `/systems` | `AUTH_V1_SYSTEMS_LIST` |
| `/systems/:systemId/routes` | `AUTH_V1_SYSTEMS_ROUTES_LIST` |
| `/systems/:systemId/roles` | `AUTH_V1_ROLES_LIST` |
| `/systems/:systemId/roles/:roleId/permissoes` | `AUTH_V1_PERMISSIONS_LIST` + `AUTH_V1_ROLES_UPDATE` |
| `/routes` | `AUTH_V1_SYSTEMS_ROUTES_LIST` |
| `/roles` | `AUTH_V1_ROLES_LIST` |
| `/permissoes` | `AUTH_V1_PERMISSIONS_LIST` |
| `/clientes` | `AUTH_V1_CLIENTS_LIST` |
| `/clientes/:id` | `AUTH_V1_CLIENTS_GET_BY_ID` |
| `/usuarios` | `AUTH_V1_USERS_LIST` |
| `/usuarios/:id` | `AUTH_V1_USERS_GET_BY_ID` |
| `/usuarios/:id/permissoes` | `AUTH_V1_PERMISSIONS_LIST` + `AUTH_V1_USERS_PERMISSIONS_ASSIGN` |
| `/usuarios/:id/roles` | `AUTH_V1_ROLES_LIST` + `AUTH_V1_USERS_ROLES_ASSIGN` |
| `/usuarios/:id/permissoes-efetivas` | `AUTH_V1_PERMISSIONS_LIST` + `AUTH_V1_USERS_GET_BY_ID` |
| `/tokens` | `AUTH_V1_TOKEN_TYPES_LIST` |
| `/settings` | — (autenticado) |
| `/showcase` | — (DEV, autenticado) |
| `/login` | Público |
| `/error/:code` | Público |

---

## Contagem e completude

| Área | Linhas | Células persona preenchidas |
|------|--------|----------------------------|
| AUT | 9 | 36/36 |
| ERR | 8 | 32/32 |
| SHL | 10 | 30/30 |
| SYS | 14 | 56/56 |
| RTE | 7 | 28/28 |
| ROL | 7 | 28/28 |
| RPR | 6 | 24/24 |
| PRM | 5 | 20/20 |
| CLI | 8 | 32/32 |
| USR | 11 | 44/44 |
| TKN | 5 | 20/20 |
| SET | 2 | 8/8 |
| SHW | 3 | 9/9 |
| **Total** | **95** | **380/380** |

Nenhuma célula `TBD`, `⬜` ou pendente — critério de done da matriz (#215 / épico #211) atendido na documentação.

---

## Referências

- [pr-checklist.md](./pr-checklist.md) — checklist obrigatório para PRs de specs E2E
- Épico [#211](https://github.com/LF-Calegari/lfc-admin-gui/issues/211)
- Personas [#214](https://github.com/LF-Calegari/lfc-admin-gui/issues/214)
