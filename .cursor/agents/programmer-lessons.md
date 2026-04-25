# Lições Aprendidas — Programmer

Erros que geraram BLOCKER em reviews anteriores. Nunca repita esses padrões.

> Este arquivo é atualizado automaticamente pelo programmer ao receber um BLOCKER do reviewer.
> Formato: `- [PR #XX] Descrição concisa do erro e como evitar`

---

<!-- Novas lições devem ser adicionadas abaixo desta linha -->

- [Template] Inicialize este histórico no primeiro BLOCKER real deste projeto.
- [PR #8] Ao reescrever App.tsx, atualizar App.test.tsx simultaneamente — teste buscando texto do template CRA quebra imediatamente.
- [PR #8] Configurar alias @/ em vite.config.ts e tsconfig.json é critério da issue — nunca entregar sem ambos.
- [PR #8] Todo projeto deve ter .github/workflows/ci.yml com npm ci, typecheck, lint e build desde o início.
- [PR #8] Hardcode de cor em componente visual é BLOCKER — sempre usar var(--token) do design system, inclusive em hover/active states.
- [PR #8] Botões de ícone (IconButton, IconBtn) sem :focus-visible são BLOCKER de acessibilidade — sempre incluir outline: 2px solid var(--accent) com outline-offset: 2px.
- [PR #8] Variantes secondary e ghost do Button sem :focus-visible são BLOCKER — todo variante que remove outline no base precisa de substituto (box-shadow ring) nos blocos :focus-visible de cada variante.
- [PR #8] Campo de busca (SearchInput) com outline: none sem :focus-within no container é BLOCKER de acessibilidade — sempre adicionar :focus-within com border-color e box-shadow ring no wrapper SearchBox.
- [PR #8] tokens.css órfão causa confusão sobre fonte de verdade — tokens de z-index devem estar em design.css junto com os demais tokens; nunca criar arquivo de tokens paralelo sem importá-lo em lugar algum.
- [PR #12] Border-width literal em componente base é BLOCKER — sempre que existir valor numérico de borda (1px, 1.5px, 2px, 2.5px), criar token semântico em tokens.css (`--border-thin/medium/thick/thicker`) e referenciar via `var(--…)`; ausência do token na fonte não é justificativa para aceitar literal, é sinal de que o token precisa ser adicionado.
- [PR #12] Magic numbers em estados interativos (`translateY(1px)` no `:active`) são BLOCKER — criar token dedicado (`--press-offset`) em vez de valor literal; qualquer literal numérico em CSS de componente base deve ter token correspondente.
- [PR #42] Ao introduzir tema dark, auditar TODOS os assets binários (SVG/PNG) usados em componentes globais (Sidebar, Topbar, layouts) — assets com fill fixo escuro/claro precisam de variante oposta selecionada via `useTheme().resolvedTheme`; deixar como "fora de escopo" é BLOCKER quando a issue inclui critério "componentes existentes renderizam corretamente em ambos os temas". Verifique contraste WCAG AA (≥3:1 para UI graphics non-text) de cada asset com `--bg-surface` de cada tema antes de abrir PR.
- [Sonar] Qualquer issue nova (Bug, Vulnerability, Security Hotspot ou Code Smell) introduzida pelo PR no SonarCloud em arquivo tocado pelo diff é BLOCKER, independentemente da severidade — antes de abrir PR, aguardar o check `SonarCloud Code Analysis` ou rodar análise local e zerar todas as issues novas; issues pré-existentes em `development` não contam, mas qualquer regressão no diff atual é veto automático do reviewer.
