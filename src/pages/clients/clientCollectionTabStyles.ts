import styled from 'styled-components';

/**
 * Styled components compartilhados pelas abas que listam coleções de
 * subentidades de cliente (`ClientExtraEmailsTab` — Issue #146;
 * `ClientPhonesTab` — Issue #147).
 *
 * Concentrar aqui evita duplicação visual (Sonar/JSCPD tokenizam
 * declarações idênticas como blocos duplicados quando aparecem em
 * dois arquivos) e garante paridade visual entre as abas — qualquer
 * ajuste de espaçamento/cor/raio acontece num único arquivo. Lição
 * PR #128/#134/#135 — extrair quando o segundo consumidor real
 * aparece.
 *
 * **Por que módulo dedicado e não em `src/components/ui/`?** Estes
 * componentes são opinionados ao layout das abas de cliente
 * (`var(--bg-surface)` + padding `--space-6` + gap `--space-4` etc.),
 * que não generaliza para outras telas hoje. Quando aparecer um
 * terceiro consumidor (ex.: futuras coleções de Usuário), aí sim faz
 * sentido promover para `src/shared/components/`.
 */

/**
 * Container externo da seção da aba — preserva o ar e o
 * espaçamento entre as outras abas do `ClientEditPage`.
 */
export const TabSection = styled.section`
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

export const TabHeading = styled.h3`
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  margin: 0;
  letter-spacing: var(--tracking-tight);
`;

export const TabIntro = styled.p`
  margin: 0;
  color: var(--fg2);
  font-size: var(--text-sm);
  line-height: var(--leading-base);
  max-width: 60ch;
`;

/**
 * Cabeçalho do bloco que combina contagem corrente + botão de ação.
 * Em viewports estreitas, empilha o botão sob o contador para
 * preservar o toque (touch target de 44px+).
 */
export const ListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
`;

export const Counter = styled.div`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--fg3);
`;

/**
 * Bloco de empty state com tom suave — espelha o padrão visual das
 * abas (centralizado, com ícone informativo e dica de próximo passo).
 */
export const EmptyShell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  background: var(--bg-elevated);
  border: var(--border-thin) dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--fg3);
`;

export const EmptyTitle = styled.span`
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--fg2);
`;

export const EmptyHint = styled.span`
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--fg3);
  text-align: center;
  max-width: 40ch;
`;

/**
 * Form do modal de adicionar — `<form>` para que `Enter` no input
 * dispare o submit e que leitores de tela identifiquem o agrupamento
 * de campos.
 */
export const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

export const ModalActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
`;

export const ConfirmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

export const ConfirmText = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
`;

export const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg1);
  background: var(--bg-elevated);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
`;

/**
 * Linha visual de uma sub-entidade (email/telefone/etc.) — flex com
 * conteúdo à esquerda e ação "Remover" à direita.
 */
export const ListRow = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);

  &:hover {
    border-color: var(--border-medium-forest);
  }
`;

export const ListContainer = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

/**
 * Wrapper do conteúdo principal da linha (ícone + label).
 */
export const ListRowLeft = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
`;

/**
 * Valor textual da linha — ellipsis quando longo. Cada consumidor
 * passa a `font-family` desejada (sans para email, mono para
 * telefone) via `$mono` para preservar a hierarquia tipográfica
 * intencional sem precisar duplicar o styled component inteiro.
 */
export const ListRowValue = styled.span<{ $mono?: boolean }>`
  font-family: ${({ $mono }) => ($mono ? 'var(--font-mono)' : 'var(--font-sans)')};
  font-size: var(--text-sm);
  color: var(--fg1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
