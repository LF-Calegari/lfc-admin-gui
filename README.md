# Admin GUI (lfc-admin-gui)

Interface administrativa **SPA em React.js** para o serviço [`lfc-authenticator`](https://github.com/LF-Calegari/lfc-authenticator). Centraliza a operação do catálogo de **sistemas**, **rotas**, **roles**, **permissões**, **clientes** e **usuários** do ecossistema, consumindo exclusivamente a API REST do auth-service (`/api/v1`) via **JWT**.

> Este projeto é puramente cliente: **não** possui backend próprio, banco ou camada de persistência. Toda lógica de autenticação, autorização e persistência permanece no `lfc-authenticator`.

---

## Índice

- [Visão geral](#visão-geral)
- [Mapa de serviços do ecossistema](#mapa-de-serviços-do-ecossistema)
- [Funcionalidades](#funcionalidades)
- [Requisitos](#requisitos)
- [Início rápido](#início-rápido)
- [Configuração e variáveis de ambiente](#configuração-e-variáveis-de-ambiente)
- [Arquitetura em alto nível](#arquitetura-em-alto-nível)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Integração com o lfc-authenticator](#integração-com-o-lfc-authenticator)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Scripts disponíveis](#scripts-disponíveis)
- [Docker](#docker)
- [Testes automatizados](#testes-automatizados)
- [Boas práticas e segurança](#boas-práticas-e-segurança)
- [Contribuindo e próximos passos](#contribuindo-e-próximos-passos)
- [Roadmap](#roadmap)

---

## Visão geral

### Contexto e objetivo

O `lfc-authenticator` concentra autenticação JWT, autorização baseada em permissões e o catálogo oficial de **sistemas, rotas, tipos de permissão, papéis e vínculos** para todo o ecossistema. Até hoje, qualquer manutenção nesse catálogo (cadastrar um novo sistema, criar uma rota nova, atribuir permissão a um usuário) exige chamadas diretas à API ou manipulação manual de banco.

O **Auth Admin GUI** é a camada de apresentação que resolve isso: um painel web para que administradores operem esse catálogo de forma visual, auditável e sem escrever `curl`.

### Escopo

- ✅ Interface **administrativa** do auth-service.
- ✅ Autenticação via JWT emitido pelo próprio auth-service.
- ✅ Consome apenas rotas públicas documentadas em `/api/v1`.
- ❌ **Não** gerencia recursos de outros serviços (ex.: URLs encurtadas do Kurtto). Cada serviço do ecossistema tem seu próprio admin-gui.
- ❌ **Não** armazena segredos, hashes, nem replica o modelo do auth-service.

---

## Mapa de serviços do ecossistema

```
                                  Usuários finais / administradores
                                                 │
                 ┌───────────────────────────────┼───────────────────────────────┐
                 │                               │                               │
                 ▼                               ▼                               ▼
   ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
   │  lfc-admin-gui           │   │  lfc-kurtto-admin-gui    │   │  (outros admin-guis      │
   │  (este repo)             │   │  (SPA React)             │   │   futuros)               │
   │  SPA React · JWT         │   │  JWT                     │   │                          │
   └────────────┬─────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
                │                              │                              │
                │ /api/v1 (JWT)                │ /api/v1 (JWT)                │
                │                              │                              │
                ▼                              ▼                              ▼
   ┌──────────────────────────┐   ┌──────────────────────────────────────────────────────┐
   │   lfc-authenticator      │◄──┤   lfc-kurtto  (Node.js · TS · PostgreSQL)            │
   │   ASP.NET Core 10 · JWT  │   │   API de encurtamento + middleware que valida        │
   │   PostgreSQL             │   │   JWT e permissões chamando o authenticator (REST)   │
   └──────────────────────────┘   └──────────────────────────────────────────────────────┘
             ▲
             │ valida token / resolve permissões
             │ (chamadas REST dos demais serviços)
             └──── demais serviços do ecossistema
```

**Fluxo de autenticação deste projeto:**

1. Usuário administrador acessa o SPA e informa credenciais.
2. SPA chama `POST /api/v1/auth/login` **diretamente** no `lfc-authenticator` e recebe o JWT.
3. Todas as operações subsequentes enviam `Authorization: Bearer <token>` para o auth-service.
4. O auth-service resolve as políticas `perm:<Recurso>.<Ação>` e responde 200/401/403 conforme o vínculo de permissões do usuário.
5. Em caso de `logout` ou alteração de permissões, o SPA revalida via `GET /api/v1/auth/verify-token` para manter a sessão coerente com o `tokenVersion` no banco.

> Diferente do `lfc-kurtto-admin-gui`, este projeto **não passa por um serviço intermediário**: fala direto com o auth-service, já que o próprio auth-service é o alvo da administração.

---

## Funcionalidades

| # | Funcionalidade | Descrição resumida | Políticas de permissão relacionadas (auth-service) |
|---|---|---|---|
| 1 | **Gerenciamento de Sistemas** | Cadastrar, listar, editar, desativar (*soft delete*) e restaurar sistemas do catálogo (ex.: `authenticator`, `kurtto`). | `perm:Systems.Create` · `Read` · `Update` · `Delete` · `Restore` |
| 2 | **Gerenciamento de Rotas por Sistema** | CRUD de rotas vinculadas a cada sistema, com código (`Routes.Code`), descrição e política JWT alvo. | `perm:Routes.*` <!-- TODO: confirmar nome final das políticas quando a issue for aberta --> |
| 3 | **Gerenciamento de Roles por Sistema** | Criação e manutenção de papéis (ex.: `root`, `admin`, `default`) por sistema, com associação a conjuntos de permissões. | `perm:Roles.*` <!-- TODO: confirmar --> |
| 4 | **Gerenciamento de Permissões** | Atribuição de permissões de duas formas: (a) individuais, diretamente ao usuário; (b) via roles. Interface para visualizar permissões **efetivas** (diretas ∪ herdadas de roles). | `perm:Permissions.*` <!-- TODO: confirmar --> |
| 5 | **Gerenciamento de Clientes e Usuários** | CRUD de clientes (PF/PJ) e dos usuários vinculados, incluindo ativação, reset de senha (via fluxo do auth-service) e invalidação de sessão (`logout` remoto / `tokenVersion`). | `perm:Clients.*` · `perm:Users.*` <!-- TODO: confirmar --> |

> As tabelas de políticas acima refletem a convenção `perm:<Recurso>.<Ação>` usada pelo auth-service. Cada tela do SPA deve ocultar/desabilitar ações para as quais o usuário logado não possui a permissão correspondente — a checagem **definitiva** é sempre do backend (401/403), o SPA apenas melhora UX.

<!-- TODO (issues futuras): adicionar aqui novas funcionalidades conforme forem implementadas. Sugestão de formato: uma linha na tabela + link para a issue + link para a tela/rota do SPA. -->

---

## Requisitos

| Item | Versão / notas |
|------|----------------|
| Node.js | <!-- TODO: fixar versão LTS (ex.: 20.x ou 22.x) quando o projeto for iniciado --> |
| Gerenciador de pacotes | <!-- TODO: npm, pnpm ou yarn — definir no primeiro commit --> |
| React | <!-- TODO: definir versão (ex.: 18.x) --> |
| Ferramenta de build | <!-- TODO: Vite / Next.js / CRA — definir --> |
| Auth Service acessível | **`lfc-authenticator`** rodando com rotas `/api/v1` expostas e reachable a partir do host onde o SPA é servido (CORS configurado adequadamente). |
| Docker (opcional) | Para build de imagem de produção e integração à rede `lfc_platform_network` do ecossistema. |

---

## Início rápido

<!-- TODO: preencher conforme a stack de build for escolhida. Abaixo fica um esqueleto para Vite, mas adapte quando a issue de bootstrap for resolvida. -->

### Opção A — Desenvolvimento local

```bash
# 1. Clonar
git clone git@github.com:LF-Calegari/lfc-admin-gui.git
cd lfc-admin-gui

# 2. Instalar dependências
# TODO: npm install | pnpm install | yarn

# 3. Copiar variáveis de ambiente
cp .env.example .env
# Ajustar VITE_AUTH_API_BASE_URL (ou equivalente) para apontar ao lfc-authenticator

# 4. Subir em modo dev
# TODO: npm run dev
```

### Opção B — Docker

<!-- TODO: detalhar Dockerfile multi-stage (build com Node + serve com Nginx) e docker-compose de desenvolvimento quando a issue de containerização for aberta. -->

### Pré-requisito: auth-service no ar

O SPA **não funciona isoladamente**. Antes de subir, garanta que o `lfc-authenticator` esteja acessível (ver [README do authenticator](https://github.com/LF-Calegari/lfc-authenticator)) e que o usuário `admin@email.com.br` (ou equivalente) tenha as permissões necessárias.

---

## Configuração e variáveis de ambiente

<!-- TODO: ajustar prefixo das variáveis conforme o bundler escolhido:
     - Vite:      VITE_*
     - Next.js:   NEXT_PUBLIC_*
     - CRA:       REACT_APP_*
-->

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `VITE_AUTH_API_BASE_URL` | URL base do `lfc-authenticator` (inclui `/api/v1` **ou** é concatenado no cliente HTTP — manter consistente). | `https://localhost:8080/api/v1` |
| `VITE_APP_NAME` | Nome exibido no header do SPA. | `Auth Admin` |
| `VITE_SESSION_IDLE_MINUTES` | Minutos de inatividade antes de forçar re-login (deve ser **≤** `Auth:Jwt:ExpirationMinutes` do auth-service). | `15` |
| <!-- TODO: adicionar variáveis conforme forem necessárias (telemetria, feature flags, etc.) --> | | |

> ⚠️ Por ser uma SPA, **qualquer variável exposta ao bundle é pública**. Nunca coloque segredos, chaves de API privadas ou connection strings aqui.

---

## Arquitetura em alto nível

```
lfc-admin-gui/
├── public/                     # Assets estáticos
├── src/
│   ├── app/                    # Bootstrap, providers, router
│   ├── features/               # Um diretório por funcionalidade da tabela acima
│   │   ├── systems/
│   │   ├── routes/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── clients/
│   │   └── users/
│   ├── shared/
│   │   ├── api/                # Cliente HTTP + interceptors de JWT
│   │   ├── auth/               # Contexto de sessão, guards, hooks
│   │   ├── components/         # Design system local (inputs, tabelas, modais)
│   │   └── utils/
│   └── main.tsx                # Entry point
├── .env.example
├── Dockerfile                  # TODO
└── package.json
```

<!-- TODO: atualizar esta árvore conforme o projeto ganhar forma. Manter organização por feature slice, não por tipo de arquivo. -->

**Princípios:**

- **Feature-first**: cada funcionalidade da [tabela de funcionalidades](#funcionalidades) vive em `src/features/<feature>/` contendo suas próprias telas, hooks, tipos e chamadas HTTP.
- **Cliente HTTP único** em `src/shared/api/`, com interceptor que injeta `Authorization: Bearer` e trata `401` (redireciona para login) e `403` (exibe feedback sem deslogar).
- **Checagens de permissão são dicas de UX**. A verdade está no backend.

---

## Autenticação e autorização

### Fluxo de login

1. Tela de login envia `POST /api/v1/auth/login` com e-mail e senha.
2. Resposta traz o JWT (e metadados de expiração).
3. Token é armazenado em <!-- TODO: definir estratégia — `sessionStorage`, `localStorage` ou cookie `httpOnly` proxy; recomenda-se avaliar riscos de XSS antes de escolher -->.
4. SPA chama `GET /api/v1/auth/verify-token` para hidratar o contexto com permissões efetivas do usuário.
5. Router aplica *guards* em cada rota baseada nas permissões do contexto.

### Logout / invalidação

- `POST /api/v1/auth/logout` incrementa `tokenVersion` no banco do auth-service e invalida tokens anteriores.
- SPA limpa o storage local e redireciona para `/login`.

### Troca de contexto após alterações

Sempre que o usuário logado alterar permissões/roles que afetam a **si mesmo** (edge case, mas possível em painel admin), o SPA deve chamar `verify-token` novamente para refletir o novo conjunto de permissões sem exigir re-login.

---

## Integração com o lfc-authenticator

Mapeamento provisório das telas do SPA ↔ endpoints do auth-service. A lista definitiva deve ser atualizada conforme cada issue de feature for sendo implementada.

| Tela / ação do SPA | Endpoint(s) do auth-service | Política |
|---|---|---|
| Login | `POST /api/v1/auth/login` | anônimo |
| Verificar sessão | `GET /api/v1/auth/verify-token` | autenticado |
| Logout | `POST /api/v1/auth/logout` | autenticado |
| Listar sistemas | `GET /api/v1/systems` | `perm:Systems.Read` |
| Criar sistema | `POST /api/v1/systems` | `perm:Systems.Create` |
| <!-- TODO: completar à medida que as telas forem sendo implementadas --> | | |

> Fonte de verdade do contrato: [`lfc-authenticator` · README — Referência de rotas](https://github.com/LF-Calegari/lfc-authenticator#referência-de-rotas) e o Swagger UI do próprio serviço.

---

## Estrutura de pastas

<!-- TODO: preencher com `tree -L 3` depois do scaffold inicial. Manter atualizado quando houver mudança estrutural relevante. -->

---

## Scripts disponíveis

<!-- TODO: preencher com a tabela de scripts do package.json após o scaffold. Exemplo esperado:

| Script | Descrição |
|--------|-----------|
| `dev` | Sobe o servidor de desenvolvimento com HMR |
| `build` | Build de produção |
| `preview` | Servir o build localmente para smoke test |
| `lint` | Rodar ESLint |
| `test` | Rodar suíte de testes |
-->

---

## Docker

<!-- TODO: detalhar quando a issue de containerização for aberta. Pontos mínimos a cobrir:

- Dockerfile multi-stage (node:XX-alpine para build → nginx:alpine para serve)
- Configuração de Nginx com fallback para SPA (`try_files $uri /index.html`)
- Injeção de variáveis de ambiente em runtime (padrão env-substituição no entrypoint)
- Rede `lfc_platform_network` externa, alinhada aos demais serviços do ecossistema
-->

---

## Testes automatizados

<!-- TODO: definir estratégia de testes ao longo das primeiras issues. Sugestão de pirâmide:

- **Unitários**: Vitest / Jest — utils, hooks, formatadores
- **Componentes**: React Testing Library — renderização, interação, acessibilidade
- **E2E**: Playwright ou Cypress — fluxos críticos (login, CRUD de sistemas, atribuição de permissões)
- **Mocks do auth-service**: MSW (Mock Service Worker) para isolar o SPA em CI
-->

---

## Boas práticas e segurança

- **Nunca** logue o JWT nem envie para telemetria de terceiros.
- Avalie **XSS** com rigor: qualquer `dangerouslySetInnerHTML` exige sanitização explícita.
- Valide no cliente **e** confie apenas no servidor — o SPA não é fronteira de segurança.
- CORS do auth-service deve permitir apenas as origens do(s) ambiente(s) previstos (dev, staging, produção). **Não** usar `*` em produção.
- HTTPS obrigatório em produção.
- Tokens em `localStorage` são vulneráveis a XSS; `httpOnly cookie` via proxy reverso é a opção mais resistente — decidir antes de ir para produção.
- Após alterar permissões/roles de usuários, orientar o usuário-alvo a refazer login ou chamar `/api/v1/auth/verify-token` (o auth-service também invalida via `tokenVersion` em eventos relevantes).

---

## Contribuindo e próximos passos

1. Criar branch no padrão do time: `feature/<issue>/<descricao-curta>`.
2. Implementar a feature acompanhada de testes (unitários e/ou de componente) e, quando aplicável, E2E.
3. Atualizar este README quando o contrato com o auth-service mudar ou quando a lista de funcionalidades evoluir — em especial a [tabela de funcionalidades](#funcionalidades) e o [mapeamento de endpoints](#integração-com-o-lfc-authenticator).
4. Rodar `lint` e `test` antes de abrir PR.
5. Descrever no PR qual issue do Project Board está sendo resolvida e qual endpoint do auth-service está sendo consumido (se houver novo).

---

## Roadmap

Itens que já estão no horizonte, em ordem sugerida:

1. Scaffold do projeto (stack definitiva, lint, formatter, CI básica).
2. Tela de login + contexto de sessão + guards de rota.
3. CRUD de **Sistemas** (primeira feature de ponta a ponta, serve de referência para as demais).
4. CRUD de **Rotas por Sistema**.
5. CRUD de **Roles por Sistema** + associação de permissões às roles.
6. Atribuição de **Permissões** (diretas e via role) a usuários, com visualização de permissões efetivas.
7. CRUD de **Clientes** e **Usuários** + ações administrativas (ativar/desativar, reset de senha, invalidar sessão).
8. Auditoria / log de ações administrativas (depende de evolução no auth-service).
9. Dockerização + publicação na rede `lfc_platform_network`.
10. E2E cobrindo fluxos críticos.

<!-- TODO (IA/dev): à medida que issues novas forem criadas no Project Board, anexar aqui uma linha com número e título, e mover para "Funcionalidades" quando concluída. -->
