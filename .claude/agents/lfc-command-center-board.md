# LFC Command Center — board operacional

Referência única para **mover cards** no GitHub Projects. Usada por `maestro`, `programmer`, `reviewer` e `po`.

## Regra zero (gate — sem exceção)

| Agente | Proibido **antes** de mover o card |
|--------|-------------------------------------|
| **programmer** | branch, leitura de código de produção, edição de arquivo, `dotnet`/Docker, migrations, testes, commit, push, PR |
| **reviewer** | SonarCloud, Snyk, leitura de diff para veredito, comentários de review, aprovação/reprovação |

**Ordem obrigatória:** mover o card → confirmar status via `gh` → só então iniciar implementação ou review.

Violar esta ordem = erro operacional bloqueante (maestro deve reenviar o subagent).

- Projeto: [LFC Command Center](https://github.com/orgs/LF-Calegari/projects/2) (org `LF-Calegari`, número `2`)
- `PROJECT_ID`: `PVT_kwDODRCkcM4BW6hJ`
- Campo **Status** (`STATUS_FIELD_ID`): `PVTSSF_lADODRCkcM4BW6hJzhSLFLc`

## Trilhas (Status) — nomes exatos

| Trilha | Option ID | Quem move | Quando |
|--------|-----------|-----------|--------|
| Backlog | `f75ad846` | PO | issue nova / repriorização |
| Ready | `61e4505c` | PO | dependências atendidas, pronta para dev |
| **In progress** | `47fc9ee4` | **programmer** | **primeira ação ao assumir a issue** |
| **In review** | `df73e18b` | **reviewer** | **primeira ação ao iniciar review da PR** |
| Done | `98236657` | reviewer (pós-merge) | issue fechada / entrega concluída |

Não inventar outros nomes (`Doing`, `Em desenvolvimento`, etc.) — usar **somente** os nomes da tabela.

## Pré-requisito

`gh` autenticado com escopo `project` (e `read:org` para projetos da org).

## 1) Localizar o item do projeto pela issue

Substitua `ISSUE_NUMBER` e, se necessário, filtre pelo repositório (`lfc-authenticator`, `lfc-admin-gui`, etc.):

```bash
ISSUE_NUMBER=186
REPO_FILTER="lfc-authenticator"   # opcional; omita para qualquer repo no board

gh api graphql -f query='
query($org: String!, $project: Int!) {
  organization(login: $org) {
    projectV2(number: $project) {
      items(first: 100) {
        nodes {
          id
          content {
            ... on Issue {
              number
              repository { nameWithOwner }
            }
          }
        }
      }
    }
  }
}' -f org=LF-Calegari -F project=2 \
  --jq ".data.organization.projectV2.items.nodes[]
    | select(.content.number == ${ISSUE_NUMBER})
    | select(if \"${REPO_FILTER}\" != \"\" then .content.repository.nameWithOwner | endswith(\"/${REPO_FILTER}\") else true end)
    | {itemId: .id, repo: .content.repository.nameWithOwner, number: .content.number}"
```

Guarde `itemId` (ex.: `PVTI_lADODRCkcM4BW6hJzgsrye8`).

## 2) Mover o card

```bash
PROJECT_ID="PVT_kwDODRCkcM4BW6hJ"
STATUS_FIELD_ID="PVTSSF_lADODRCkcM4BW6hJzhSLFLc"
ITEM_ID="<itemId da etapa 1>"
STATUS_OPTION_ID="<option id da tabela>"

gh project item-edit \
  --project-id "$PROJECT_ID" \
  --id "$ITEM_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$STATUS_OPTION_ID"
```

## 3) Confirmar status

```bash
gh api graphql -f query='
query($org: String!, $project: Int!, $num: Int!) {
  organization(login: $org) {
    projectV2(number: $project) {
      items(first: 100) {
        nodes {
          content { ... on Issue { number repository { nameWithOwner } } }
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}' -f org=LF-Calegari -F project=2 \
  --jq ".data.organization.projectV2.items.nodes[]
    | select(.content.number == ${ISSUE_NUMBER})
    | {number: .content.number, repo: .content.repository.nameWithOwner, status: .status.name}"
```

## Fluxo maestro → programmer → reviewer

1. **PO** coloca issue em `Ready` quando desbloqueada.
2. **programmer** — **antes de qualquer código** — move para `In progress` (`47fc9ee4`).
3. **reviewer** — **antes do review técnico** — move para `In review` (`df73e18b`).
4. **reviewer** após merge + fechar issue — move para `Done` (`98236657`).

Se o card não existir no projeto: adicionar a issue ao projeto 2 (`gh project item-add`) e então mover. Se falhar por permissão, registrar em **Riscos / Pendências** — para fluxo normal isso é **bloqueante**.
