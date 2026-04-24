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
- [PR #10] Em qualquer `color-mix` de componente visual, nunca usar literais (`white/black`) — sempre usar variáveis de token (`var(--clr-white)`, `var(--clr-black)` ou token semântico dedicado).
- [PR #10] `input` interativo sem estado `:hover` explícito é BLOCKER de UX — sempre definir hover consistente com borda/superfície e preservar prioridade de erro/foco.
- [PR #10] Campo de busca no topo deve declarar estado de hover explícito no container ou alternativa equivalente documentada — ausência de feedback de interação vira BLOCKER.
- [PR #10] PR com mudanças visuais deve trazer checklist objetivo por estado (`default/hover/focus/active/disabled/loading/error/empty`) e observação de reexecução dos checks quando CI remoto ficar pendente.
