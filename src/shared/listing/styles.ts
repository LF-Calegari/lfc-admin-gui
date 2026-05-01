import { Link } from 'react-router-dom';
import styled from 'styled-components';

/**
 * Styled primitives compartilhados pelas páginas de listagem do
 * `lfc-admin-gui`.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * `SystemsPage` e `RoutesPage` declaravam ~30 styled components com
 * o mesmo CSS (Toolbar, SearchSlot, ToolbarActions, TableShell,
 * Overlay, InitialLoading, FootBar, PageInfo, PageNav, EmptyMessage,
 * Mono, etc.). Sonar tokeniza CSS-in-JS como blocos de texto e
 * marca como `New Code Duplication` quando os mesmos templates
 * literais aparecem em arquivos diferentes (Issue #66 chegaria a
 * ~200 linhas duplicadas se `RolesPage` apenas copy-pastear o
 * pattern).
 *
 * Centralizar aqui:
 *
 * - Cada página continua importando seus tokens, mas o **template
 *   literal** vive numa única cópia.
 * - Adicionar uma nova listagem (Permissões, Usuários, Clientes na
 *   EPIC #47+) só exige reusar os primitives — nenhum CSS novo.
 * - Variantes específicas de domínio (ex.: `RouteCard` com cores de
 *   token policy) continuam locais a cada página, mas `Card`,
 *   `CardHeader`, `CardCode`, `CardName`, `CardDescription`,
 *   `CardMeta` etc. — que não dependem de domínio — vivem aqui.
 *
 * Mantemos só primitives **visuais**. Comportamento (memoização de
 * coluna, gating de auth, copy de mensagem) fica nas páginas — esse
 * já é território das próprias issues. Lição PR #128/#134/#135 —
 * desde o primeiro PR de um novo recurso de listagem, projetar
 * shared helpers para evitar refatoração destrutiva no segundo PR.
 */

/**
 * Link "Voltar para Sistemas" exibido no topo de listagens escopadas
 * a um sistema (ex.: rotas, roles). Sempre aponta para `/systems`,
 * mas o caller injeta `to` para preservar a flexibilidade.
 */
export const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-decoration: none;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  margin-left: -4px;

  &:hover {
    color: var(--fg2);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }
`;

/**
 * Barra de ferramentas (busca + ações) acima da tabela. Em mobile
 * empilha vertical, em desktop alinha horizontal. Mesmo padrão
 * usado em SystemsPage/RoutesPage e nas próximas listagens.
 */
export const Toolbar = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
  }
`;

/** Slot do `<Input>` de busca — limita a 360px em desktop. */
export const SearchSlot = styled.div`
  width: 100%;

  @media (min-width: 48em) {
    max-width: 360px;
    flex: 1;
  }
`;

/** Slot das ações da Toolbar (toggle inativos + botão "Novo X"). */
export const ToolbarActions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-3);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    gap: var(--space-4);
  }
`;

/**
 * Wrapper relativo da tabela/cards. Permite o `Overlay` de refetch
 * ancorar absoluto sem deslocar o conteúdo.
 */
export const TableShell = styled.div`
  position: relative;
`;

/**
 * Visibilidade da `Table` desktop. Em mobile fica oculta para
 * favorecer leitura em coluna única via cards (critério de
 * responsividade das issues #58/#62/#66/etc). Switch em
 * `--bp-md` (48em ≈ 768px), espelhando o breakpoint do shell.
 */
export const TableForDesktop = styled.div`
  display: none;

  @media (min-width: 48em) {
    display: block;
  }
`;

/** Lista de cards usada apenas em mobile. */
export const CardListForMobile = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  @media (min-width: 48em) {
    display: none;
  }
`;

/**
 * Card individual de item em listagem mobile. Cada página pode
 * estender (`styled(EntityCard)`) para adicionar variantes
 * específicas — mas a estrutura visual base (borda, background,
 * hover, focus, padding) vive aqui.
 */
export const EntityCard = styled.article`
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: background var(--duration-fast) var(--ease-default);

  &:hover {
    background: var(--bg-ghost-hover);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }
`;

/** Cabeçalho do card (title + status badge). */
export const CardHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
`;

/** Code monoespaçado destacado no card. */
export const CardCode = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--fg1);
  font-weight: var(--weight-medium);
  word-break: break-word;
`;

/** Title do card (h3 com hierarquia tipográfica). */
export const CardName = styled.h3`
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: -0.01em;
`;

/** Parágrafo de descrição livre dentro do card. */
export const CardDescription = styled.p`
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-base);
`;

/** Lista descritiva (term/value) para metadados do card. */
export const CardMeta = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-xs);
`;

/** Termo (label monoespaçado) do CardMeta. */
export const CardMetaTerm = styled.dt`
  font-family: var(--font-mono);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
`;

/** Valor monoespaçado do CardMeta. */
export const CardMetaValue = styled.dd`
  margin: 0;
  font-family: var(--font-mono);
  color: var(--fg2);
  word-break: break-word;
`;

/**
 * Overlay leve aplicado em cima da listagem durante refetches
 * subsequentes (busca/paginação/toggle). Mantém os dados anteriores
 * visíveis para evitar flicker enquanto sinaliza atividade — o
 * spinner ancorado ao topo deixa claro que algo está em curso sem
 * mover a tabela.
 */
export const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--space-6);
  background: color-mix(in srgb, var(--bg-base) 55%, transparent);
  border-radius: var(--radius-lg);
  pointer-events: none;
  z-index: 1;
`;

/** Container do spinner de loading inicial (primeiro fetch). */
export const InitialLoading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) 0;
`;

/** Container do Alert de erro + botão "Tentar novamente". */
export const ErrorBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
`;

/** Footer com info de paginação e botões prev/next. */
export const FootBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: stretch;
  margin-top: var(--space-5);

  @media (min-width: 48em) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
`;

/** Indicador "Página X de Y · N resultado(s)". */
export const PageInfo = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wider);
`;

/** Wrapper dos botões prev/next. */
export const PageNav = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
`;

/**
 * Container da mensagem de estado vazio (com/sem busca). Centraliza
 * vertical+horizontal com gap entre título e CTA/dica.
 */
export const EmptyMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) 0;
`;

/** Title do estado vazio ("Nenhum X encontrado para Y", etc). */
export const EmptyTitle = styled.span`
  font-size: var(--text-sm);
  color: var(--fg2);
`;

/** Dica complementar ao estado vazio (ex.: ativar toggle inativos). */
export const EmptyHint = styled.span`
  font-size: var(--text-xs);
  color: var(--text-muted);
`;

/**
 * Texto monoespaçado pequeno para destaque inline (ex.: code de
 * busca, ID, contagem). Reusado em tabelas, cards e mensagens.
 */
export const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg2);
`;

/**
 * Célula com ellipsis para textos longos (descrições, paths). Usado
 * na coluna de descrição da tabela desktop — mantém o layout estável.
 */
export const DescriptionCell = styled.span`
  display: inline-block;
  max-width: 36ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg2);
`;

/**
 * Span itálico cinza usado quando um campo opcional está ausente
 * (ex.: descrição vazia, contagem indisponível). Convenção visual
 * "—" no projeto.
 */
export const Placeholder = styled.span`
  color: var(--text-muted);
  font-style: italic;
`;

/**
 * Wrapper das ações por linha (Editar/Desativar/Restaurar). Mantém
 * os botões alinhados à direita e suporta múltiplas ações sem
 * remontar o layout.
 */
export const RowActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-end;
`;

/**
 * Bloco do aviso "ID inválido" exibido quando o `:systemId` da URL
 * é vazio/whitespace. Espelha o layout do ErrorBlock mas com
 * semântica diferente (warning, não erro de fetch).
 */
export const InvalidIdNotice = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
`;
