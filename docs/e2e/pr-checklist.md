# Checklist — Pull Request de specs E2E

Use este checklist em **toda PR** que adiciona ou altera testes Playwright no `lfc-admin-gui`.

---

## Antes de abrir a PR

- [ ] Branch no padrão `feature/<issue>/descricao-curta` (ex.: `feature/220/e2e-systems`)
- [ ] Card da issue filha em **In progress** no [LFC Command Center](https://github.com/orgs/LF-Calegari/projects/2)
- [ ] Spec executada localmente: `docker compose --env-file .env.e2e -f docker-compose.e2e.yml --profile e2e run --rm e2e` (ou comando documentado em #212/#213)
- [ ] Cada `test()` novo referencia `@matrix-id` existente em [traceability-matrix.md](./traceability-matrix.md)

---

## Matriz de rastreabilidade

- [ ] Todo fluxo coberto possui linha na matriz com id `E2E-<ÁREA>-<NNN>`
- [ ] Colunas P-SA / P-PT / P-DN / P-ANON preenchidas (sem `TBD`)
- [ ] Coluna *Status* atualizada de **Doc** → **Implementado** (ou issue fechada) para os ids desta PR
- [ ] Fluxo novo = nova linha na matriz **no mesmo PR** (nunca spec órfã)

---

## Seletores (`data-testid`)

- [ ] Preferir `data-testid` documentados na matriz (seção `data-testid` obrigatórios)
- [ ] Novos testids seguem kebab-case e prefixo do recurso (`systems-`, `users-`, …)
- [ ] Listagens expõem sufixos padrão (`-search`, `-loading`, `-retry`, `-create-open`, …)
- [ ] Se adicionou testid em componente de produção: documentou na matriz

---

## Personas e auth

- [ ] Usa `storageState` da persona correta (#216) — não repete login em cada spec
- [ ] Cenários negativos (403, item oculto na Sidebar) usam P-PT ou P-DN conforme matriz
- [ ] Não commitou credenciais reais — apenas contas seed E2E (#214)

---

## Qualidade

- [ ] Sem `test.only` / `describe.only` acidental
- [ ] Sem `waitForTimeout` fixo — usar `expect`, `locator.waitFor`, ou helpers do Playwright
- [ ] Artefatos (`test-results/`, `playwright-report/`) no `.gitignore`
- [ ] Lint/typecheck do pacote e2e verde no container (quando aplicável)

---

## Corpo da PR (template)

```markdown
## Summary
- <bullet: specs adicionadas e @matrix-id>

## Matriz
- Atualiza status: E2E-XXX-NNN → Implementado

## Test plan
- [ ] `docker compose ... e2e` local
- [ ] Personas: P-SA / P-PT / P-DN conforme escopo

Closes #<issue-filha>
```

---

## Reviewer

O reviewer deve reprovar se:

1. `@matrix-id` ausente ou não listado na matriz
2. Matriz com células `TBD` / `⬜` tocadas pelo diff
3. Testid inventado fora do padrão sem atualizar a matriz
4. Spec de persona errada (ex.: mutação com P-PT quando matriz marca ⛔403)
