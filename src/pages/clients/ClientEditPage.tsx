import { ArrowLeft } from 'lucide-react';
import React, { useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../../components/layout/PageHeader';
import { Badge, Button } from '../../components/ui';

import { ClientDataTab } from './ClientDataTab';
import { ClientExtraEmailsTab } from './ClientExtraEmailsTab';
import { ClientLandlinePhonesTab } from './ClientLandlinePhonesTab';
import { ClientMobilePhonesTab } from './ClientMobilePhonesTab';
import {
  CLIENT_EDIT_TAB_IDS,
  useClientEditTab,
  type ClientEditTabId,
} from './useClientEditTab';

/**
 * Descritor estático de cada aba: id (sincronizado com a URL), label
 * exibida e o componente React do panel. Centralizado em uma constante
 * ao nível do módulo para que a tabela seja referência única tanto
 * para o `tablist` desktop quanto para o `<select>` do dropdown
 * mobile — evita duas listas paralelas que poderiam dessincronizar.
 *
 * Quando uma aba ganhar conteúdo real (#75/#146/#147), apenas a
 * importação do componente muda; a estrutura desta tabela permanece.
 */
interface TabDescriptor {
  id: ClientEditTabId;
  label: string;
  Panel: React.ComponentType;
}

const TABS: ReadonlyArray<TabDescriptor> = [
  { id: 'dados', label: 'Dados', Panel: ClientDataTab },
  { id: 'emails', label: 'Emails extras', Panel: ClientExtraEmailsTab },
  { id: 'celulares', label: 'Celulares', Panel: ClientMobilePhonesTab },
  { id: 'telefones', label: 'Telefones fixos', Panel: ClientLandlinePhonesTab },
];

/**
 * Container externo da página. Não estilizamos margem nem largura aqui —
 * o `<AppLayout>` já provê o `<main>` com `padding`/`max-width`
 * apropriados.
 */
const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const BackLink = styled(Link)`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--fg3);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-default);

  &:hover {
    color: var(--fg1);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-border);
  }
`;

/**
 * Tablist desktop (visível em viewports ≥ `--bp-md`). Em telas
 * pequenas, este wrapper esconde-se e o `<MobileTabSelector>` ocupa o
 * espaço — abas viram dropdown nativo (acessível por leitor de tela e
 * por teclado sem custo extra de implementação).
 */
const TabListDesktop = styled.div`
  display: none;
  border-bottom: var(--border-thin) solid var(--border-subtle);
  gap: var(--space-1);

  @media (min-width: 48em) {
    display: flex;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  appearance: none;
  background: transparent;
  border: none;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: ${({ $active }) => ($active ? 'var(--fg1)' : 'var(--fg3)')};
  cursor: pointer;
  position: relative;
  transition:
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;

  &::after {
    content: '';
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    bottom: -1px;
    height: var(--border-thick);
    background: ${({ $active }) => ($active ? 'var(--accent)' : 'transparent')};
    transition: background var(--duration-fast) var(--ease-default);
  }

  &:hover:not(:disabled) {
    color: var(--fg1);
    background: var(--bg-ghost-hover);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-border);
    z-index: 1;
  }
`;

/**
 * Wrapper do dropdown mobile. Visível apenas em viewports `<` `--bp-md`.
 * Usar `<select>` nativo é a escolha mobile-first com melhor relação
 * custo/benefício de acessibilidade: leitor de tela e teclado virtual
 * recebem suporte sem nenhum código extra. Quando aparecer um caso de
 * UX que exige dropdown custom (raro), aí sim trocaremos.
 */
const MobileTabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  @media (min-width: 48em) {
    display: none;
  }
`;

const MobileTabLabel = styled.label`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--fg3);
`;

const MobileTabSelect = styled.select`
  appearance: none;
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-base);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--fg1);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);

  &:hover {
    border-color: var(--border-medium-forest);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring-border);
  }
`;

const TabPanelsWrapper = styled.div`
  margin-top: var(--space-4);
`;

/**
 * Cada `tabpanel` é renderizado dentro de um wrapper com `hidden`
 * controlado por `aria-hidden`. Mantemos as 4 árvores montadas
 * simultaneamente (apenas a ativa visível) para preservar estado
 * interno entre trocas de aba (scroll, inputs, contagens) — o
 * critério de aceite "trocar de aba não perde scroll/estado de outras
 * abas" depende disso.
 *
 * `display: none` (via `hidden`) remove o painel do fluxo visual e do
 * tab-order do teclado, mas o React preserva o estado dos componentes
 * filhos. Quando uma aba real (com formulário) substituir o
 * placeholder, estado de input/scroll continuará após uma viagem
 * `dados → emails → dados`.
 */
const TabPanel = styled.div`
  &[hidden] {
    display: none;
  }
`;

/**
 * Página de edição de cliente em abas (`/clientes/:id`) — Issue #144.
 *
 * Substitui o `ClientDetailShellPage` (placeholder herdado de #145).
 * Mantém-se em `pages/clients/` e **não** generaliza para
 * `src/shared/layouts/` ainda — segue a lição PR #128: "generalizar
 * quando o segundo consumidor real aparecer". Usuário (#79) é
 * candidato natural a virar tab page também; quando isso acontecer,
 * extrai-se um `<TabbedEditPage>` genérico.
 *
 * **Acessibilidade (critério da issue):**
 *
 * - `role="tablist"` no container das abas desktop.
 * - `role="tab"` em cada `<TabButton>` com `aria-selected`,
 *   `aria-controls` apontando para o panel correspondente, e `id`
 *   estável para ligação reversa via `aria-labelledby` no panel.
 * - `role="tabpanel"` em cada panel com `aria-labelledby` apontando
 *   para o `tab` correspondente, `id` estável e `tabIndex={0}` para
 *   permitir foco programático.
 * - Navegação por teclado: `ArrowLeft`/`ArrowRight` percorre os tabs
 *   (com wrap-around), `Home`/`End` saltam para extremos. O foco
 *   move-se programaticamente — automatic activation pattern (W3C
 *   APG): selecionar com setas troca de aba imediatamente.
 *
 * **Mobile-first (critério da issue):**
 *
 * Em viewports `< --bp-md` (48em ≈ 768px), o `tablist` desktop é
 * escondido e um `<select>` nativo cumpre o papel — leitor de tela e
 * teclado virtual ganham suporte gratuito do navegador. Não há
 * scroll horizontal no desktop (≥ `--bp-md` cabe sem aperto), e o
 * dropdown nativo no mobile é a opção mais simples/acessível.
 *
 * **Sincronização com URL (critério da issue):**
 *
 * Aba ativa fica em `?aba=<id>` (ver `useClientEditTab.ts` para a
 * decisão entre query string e path segment). Back/forward do
 * navegador funcionam naturalmente — cada troca de aba é uma entrada
 * no histórico.
 *
 * **Header e ações globais (critério da issue):**
 *
 * O header exibe nome do cliente (placeholder até #75 trazer dados
 * reais), badge de status (placeholder visual também — fica neutro
 * enquanto não há dados) e ações globais (desativar/restaurar). As
 * ações são renderizadas como botões disabled hoje porque dependem
 * dos dados de status que virão em #75 — manter o slot reserva o
 * layout e o leitor de tela já vê os botões (com `aria-disabled`).
 */
export const ClientEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { activeTab, setActiveTab } = useClientEditTab();

  /**
   * Refs dos botões `<TabButton>` para mover foco programático na
   * navegação por teclado. Usar um `useRef` que devolve um array
   * indexado por `id` mantém a API simples — `tabRefs.current[id]`.
   */
  const tabRefs = useRef<Record<ClientEditTabId, HTMLButtonElement | null>>({
    dados: null,
    emails: null,
    celulares: null,
    telefones: null,
  });

  const focusTab = useCallback((tabId: ClientEditTabId) => {
    const node = tabRefs.current[tabId];
    if (node !== null) {
      node.focus();
    }
  }, []);

  /**
   * Handler de teclas no `tablist` (W3C APG — automatic activation).
   *
   * - `ArrowRight`/`ArrowLeft`: move para o próximo/anterior com
   *   wrap-around. Selecionar muda a aba imediatamente (não é
   *   manual activation).
   * - `Home`: vai para a primeira aba.
   * - `End`: vai para a última aba.
   *
   * Outras teclas seguem o comportamento default do botão (Enter/Space
   * já clicam no `<button>`).
   */
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentId: ClientEditTabId) => {
      const currentIndex = CLIENT_EDIT_TAB_IDS.indexOf(currentId);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % CLIENT_EDIT_TAB_IDS.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex =
          (currentIndex - 1 + CLIENT_EDIT_TAB_IDS.length) % CLIENT_EDIT_TAB_IDS.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = CLIENT_EDIT_TAB_IDS.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      const nextId = CLIENT_EDIT_TAB_IDS[nextIndex];
      setActiveTab(nextId);
      focusTab(nextId);
    },
    [focusTab, setActiveTab],
  );

  const handleTabClick = useCallback(
    (tabId: ClientEditTabId) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  /**
   * Handler do `<select>` mobile. O `<option value>` é o id da aba —
   * cast seguro porque os ids são fixados na constante `TABS`.
   */
  const handleMobileChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if ((CLIENT_EDIT_TAB_IDS as ReadonlyArray<string>).includes(value)) {
        setActiveTab(value as ClientEditTabId);
      }
    },
    [setActiveTab],
  );

  // Decisão deliberada: NÃO movemos foco programático quando a URL
  // muda externamente (back/forward, deep-link, edição manual de
  // `?aba=`). Mover foco em navegação de histórico atrapalha leitor de
  // tela. O foco programático só dispara em interação direta com o
  // `tablist` (setas) — ver `handleTabKeyDown`.

  return (
    <Page>
      <BackLink to="/clientes" data-testid="client-edit-back">
        <ArrowLeft size={12} strokeWidth={1.75} aria-hidden="true" />
        Voltar para Clientes
      </BackLink>

      <PageHeader
        eyebrow="05 Clientes · Detalhe"
        title="Detalhe do cliente"
        desc={
          id !== undefined && id.length > 0
            ? `Edição em abas do cliente #${id}. Os dados completos serão habilitados pela Issue #75.`
            : 'Selecione um cliente na listagem para iniciar a edição em abas.'
        }
        actions={
          <>
            <Badge variant="neutral" dot>
              Status indisponível
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              disabled
              aria-label="Desativar cliente (indisponível enquanto a Issue #75 não habilitar os dados)"
              data-testid="client-edit-deactivate"
            >
              Desativar
            </Button>
          </>
        }
      />

      <MobileTabWrapper>
        <MobileTabLabel htmlFor="client-edit-tab-select">Aba</MobileTabLabel>
        <MobileTabSelect
          id="client-edit-tab-select"
          data-testid="client-edit-tab-select"
          value={activeTab}
          onChange={handleMobileChange}
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </MobileTabSelect>
      </MobileTabWrapper>

      <TabListDesktop
        role="tablist"
        aria-label="Abas de edição do cliente"
        data-testid="client-edit-tablist"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <TabButton
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`client-edit-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`client-edit-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              $active={isActive}
              data-testid={`client-edit-tab-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </TabButton>
          );
        })}
      </TabListDesktop>

      <TabPanelsWrapper>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const { Panel } = tab;
          return (
            <TabPanel
              key={tab.id}
              role="tabpanel"
              id={`client-edit-panel-${tab.id}`}
              aria-labelledby={`client-edit-tab-${tab.id}`}
              tabIndex={0}
              hidden={!isActive}
              data-testid={`client-edit-panel-${tab.id}`}
            >
              <Panel />
            </TabPanel>
          );
        })}
      </TabPanelsWrapper>
    </Page>
  );
};
