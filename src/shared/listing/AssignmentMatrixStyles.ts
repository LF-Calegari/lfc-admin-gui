import styled from 'styled-components';

/**
 * Styled-components compartilhados pelas três telas de
 * "atribuição via checkbox" (matriz de seleção agrupada por sistema):
 *
 * - `UserPermissionsShellPage` (Issue #70 — atribuição direta de
 *   permissões a um usuário).
 * - `UserRolesShellPage` (Issue #71 — atribuição via role a um
 *   usuário).
 * - `RolePermissionsShellPage` (Issue #69 — associação de permissões
 *   a uma role).
 *
 * **Por que vivem aqui:** os três componentes compartilhavam mais de
 * 200 linhas de styled-components idênticos (legenda, loading shell,
 * empty shell, group card, item row, badges). JSCPD tokeniza CSS-in-JS
 * como bloco de texto e marcaria a duplicação como BLOCKER (lições
 * PR #134/#135 — quando o **corpo** é idêntico entre recursos,
 * extrair em helper genérico em vez de manter cópias paralelas).
 *
 * Cada styled-component é exportado nominalmente — call-sites importam
 * apenas o que usam, mas a fonte única de verdade do CSS fica neste
 * módulo. Tokens (`--space-*`, `--radius-*`, `--border-*`, etc.) vêm
 * do design system local (`identity/`); nenhuma cor é hardcoded.
 */

/**
 * Contador de alterações pendentes exibido como badge dentro do botão
 * "Salvar alterações" — visível apenas quando há diff. Forma circular,
 * fundo `--clr-forest`, texto `--clr-lime` (alto contraste WCAG AA);
 * espelha visualmente o badge "alterações pendentes" usado em outras
 * telas de mutação em massa.
 */
export const SaveCounter = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--clr-forest);
  color: var(--clr-lime);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: var(--weight-semibold);
  line-height: 1;
`;

/**
 * Barra de legenda explicando os badges visuais usados na lista
 * (ex.: "Direta", "Herdada", "Vinculada", "Pendente"). Wrapper
 * flexível com fundo de superfície e borda sutil — fica logo abaixo
 * do `PageHeader` e antes da lista de grupos.
 */
export const LegendBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-5);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-5);
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
`;

/** Item da legenda: badge + descrição alinhados horizontalmente. */
export const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
`;

/** Texto descritivo do item da legenda — caption discreto. */
export const LegendCopy = styled.span`
  font-size: var(--text-xs);
  color: var(--fg2);
  line-height: var(--leading-base);
`;

/**
 * Wrapper do estado de loading inicial — spinner centralizado com
 * mensagem "Carregando…" abaixo. Usa `aria-live="polite"` no caller
 * para anunciar a mudança de estado para leitores de tela.
 */
export const LoadingShell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-12) 0;
  color: var(--text-muted);
`;

/** Texto que acompanha o spinner — caption mono discreto. */
export const LoadingCopy = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wider);
`;

/**
 * Wrapper do estado vazio — exibe ícone + título + dica quando o
 * catálogo está vazio. Fundo de superfície com borda tracejada para
 * sinalizar "estado intermediário, sem dados".
 */
export const EmptyShell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-10) var(--space-4);
  color: var(--text-muted);
  background: var(--bg-surface);
  border: var(--border-thin) dashed var(--border-base);
  border-radius: var(--radius-lg);
`;

/** Título do estado vazio — texto sm em fg2. */
export const EmptyTitle = styled.span`
  font-size: var(--text-sm);
  color: var(--fg2);
`;

/** Dica/sub-texto do estado vazio — caption centralizado, max 60ch. */
export const EmptyHint = styled.span`
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-align: center;
  max-width: 60ch;
`;

/** Container vertical de grupos (sistema → catálogo). */
export const GroupList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
`;

/**
 * Card que representa um grupo (sistema). Container outer com fundo
 * de superfície, borda sutil e cantos arredondados. `overflow: hidden`
 * preserva o raio quando o `GroupHeader` ou itens encostam na borda.
 */
export const GroupCard = styled.section`
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
`;

/**
 * Cabeçalho do grupo — exibe `systemCode` (mono pequeno),
 * `systemName` (heading sm) e contagem de itens (badge à direita).
 * Fundo levemente elevado para destacar do corpo da lista.
 */
export const GroupHeader = styled.header`
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-thin) solid var(--border-subtle);
  background: var(--bg-elevated);
`;

/** Code do sistema — mono pequeno, tracking aberto, cor de acento. */
export const GroupCode = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--accent-ink);
`;

/** Nome do sistema — heading semibold, tracking levemente fechado. */
export const GroupName = styled.h3`
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: -0.01em;
`;

/**
 * Contador de itens do grupo — pílula mono à direita do header.
 * Min-width fixo para alinhar entre cards mesmo com 1 dígito vs 3.
 */
export const GroupCount = styled.span`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--bg-base);
  border: var(--border-thin) solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg2);
`;

/** Lista de itens dentro de um grupo — sem marcadores nem padding. */
export const ItemList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

/**
 * Linha de item da lista — checkbox + detalhes alinhados. Hover
 * suaviza o fundo com `--bg-ghost-hover`; estado pendente
 * (`data-pending="true"`) destaca com `--warning` em transparência
 * para sinalizar mudança não-salva.
 */
export const ItemRow = styled.li`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-thin) solid var(--border-subtle);
  transition: background var(--duration-fast) var(--ease-default);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-ghost-hover);
  }

  &[data-pending='true'] {
    background: color-mix(in srgb, var(--warning) 6%, transparent);
  }
`;

/** Detalhes do item (título + meta + badges) — coluna flex. */
export const ItemDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
`;

/** Título do item — texto principal + chip mono inline. */
export const ItemTitleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
`;

/** Texto principal do item — sm medium em fg1. */
export const ItemPrimaryText = styled.span`
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--fg1);
`;

/**
 * Chip mono para "code" / discriminador secundário do item — fundo
 * `--bg-elevated` com borda sutil e padding mínimo.
 */
export const ItemCodeChip = styled.span`
  display: inline-flex;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: var(--border-thin) solid var(--border-subtle);
`;

/**
 * Linha de meta do item — caption muted com gap horizontal. Usado
 * para coisas como `routeCode`, descrição curta, identificador.
 */
export const ItemMetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
`;

/** Texto de descrição do item — caption fg2 com leading regular. */
export const ItemDescription = styled.span`
  font-size: var(--text-xs);
  color: var(--fg2);
  line-height: var(--leading-base);
`;

/**
 * Container de badges abaixo do título — gap horizontal pequeno,
 * margin-top para separar dos meta-textos.
 */
export const ItemBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
`;
