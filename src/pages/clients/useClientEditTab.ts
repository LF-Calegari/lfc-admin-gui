import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Identificadores das abas do `ClientEditPage` (Issue #144).
 *
 * Cada `id` aparece como valor da query string `?aba=<id>`. Os ids são
 * estáveis (parte do contrato de URL exposto ao usuário) — renomeá-los
 * quebra deep-links existentes, então mantemos os 4 nomes em pt-BR:
 *
 * - `dados` → corpo de #75 (CPF/CNPJ, nome/razão social, tipo).
 * - `emails` → corpo de #146 (emails extras).
 * - `celulares` → corpo de #147 (parte 1).
 * - `telefones` → corpo de #147 (parte 2).
 *
 * O union literal é exportado para o `ClientEditPage` tipar a tabela
 * de descritores das abas — não usamos string solta para evitar typo
 * na sincronização entre `tablist`/`tabpanel` e o handler de URL.
 */
export type ClientEditTabId = 'dados' | 'emails' | 'celulares' | 'telefones';

/**
 * Lista canônica das abas, na ordem em que aparecem no `tablist`.
 *
 * Centralizar a ordem aqui:
 *
 * 1. Garante consistência entre o select mobile (dropdown) e o
 *    `tablist` desktop — ambos consomem a mesma fonte.
 * 2. Permite navegação por teclado (`ArrowLeft`/`ArrowRight`)
 *    consultar o índice canônico sem dependência circular.
 * 3. Funciona como guard de runtime: qualquer valor de `?aba=` que
 *    não esteja aqui cai no default (`dados`).
 */
export const CLIENT_EDIT_TAB_IDS: ReadonlyArray<ClientEditTabId> = [
  'dados',
  'emails',
  'celulares',
  'telefones',
];

/**
 * Aba carregada quando a URL não traz `?aba=` ou traz valor inválido.
 *
 * Decisão: cair em `dados` (a aba "principal" — corpo de #75) em vez
 * de redirecionar/limpar a URL. Manter a URL intacta evita um redirect
 * extra no histórico que confundiria o back/forward do navegador.
 */
const DEFAULT_TAB: ClientEditTabId = 'dados';

/**
 * Nome do parâmetro de query string que carrega o id da aba ativa.
 *
 * `aba` (pt-BR) alinha com a convenção de URLs em pt-BR estabelecida
 * pela Issue #145 para as seções introduzidas pelas EPICs #48/#49
 * (`/clientes`, `/usuarios`, `/permissoes`). Manter o parâmetro em
 * pt-BR mantém a coerência com o path.
 */
const TAB_QUERY_PARAM = 'aba';

/**
 * Type guard para validar valores vindos da URL antes de usá-los como
 * `ClientEditTabId`. Mantém o restante do código fortemente tipado e
 * evita `as ClientEditTabId` em call-sites.
 */
function isClientEditTabId(value: string | null): value is ClientEditTabId {
  if (value === null) return false;
  return (CLIENT_EDIT_TAB_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * Hook que sincroniza a aba ativa do `ClientEditPage` com a query
 * string da URL atual.
 *
 * **Por que query string e não path segment** (decisão #144):
 *
 * - A rota `/clientes/:id` já está cadastrada no
 *   `routeCodes.ts` mapeando para `AUTH_V1_CLIENTS_GET_BY_ID`. Adicionar
 *   sub-rotas (`/clientes/:id/dados`, `/clientes/:id/emails`, etc.)
 *   exigiria 4 entradas extras no mapa de routeCodes ou ordenação
 *   delicada para o `matchPath` casar corretamente — sem ganho real.
 * - A query string preserva o histórico do navegador naturalmente:
 *   cada troca de aba via `setSearchParams` adiciona uma entrada ao
 *   `history.state`, e back/forward navegam entre abas como o usuário
 *   espera.
 * - Não há custo de roteamento (single `<Route>`).
 *
 * **Como funciona o estado das abas:**
 *
 * O hook devolve `activeTab` (sempre um `ClientEditTabId` válido) e
 * `setActiveTab` (callback que escreve `?aba=<id>` na URL). Cada aba é
 * renderizada por um `tabpanel` distinto — manter as 4 árvores
 * montadas simultaneamente (apenas uma visível via `hidden`/`aria-hidden`)
 * preserva o estado interno (scroll, inputs, contagens) ao trocar de
 * aba, sem precisar de Context global.
 *
 * **Fallback robusto:**
 *
 * Quando a URL traz `?aba=blabla` (valor inexistente), o hook devolve
 * `dados` (default) sem alterar a URL. Se o usuário trocar manualmente
 * o parâmetro para um valor válido, a aba muda; se trocar para
 * inválido, a UI pinta a default mas preserva o que o usuário digitou.
 * Esse comportamento evita "loops de redirect" e respeita o princípio
 * "URL é parte do contrato — não reescrevemos o que o usuário digita".
 */
export interface UseClientEditTabResult {
  /** Aba ativa derivada da URL (com fallback para `dados`). */
  activeTab: ClientEditTabId;
  /**
   * Atualiza a aba ativa, propagando para `?aba=<id>` na URL.
   *
   * Usa `setSearchParams` com `replace: false` por padrão — cada
   * troca de aba vira uma entrada no histórico, então back/forward
   * navegam entre abas. O caller pode passar `{ replace: true }`
   * em situações onde a navegação não deve poluir o histórico
   * (ex.: redirect inicial), mas a UI atual não usa essa opção.
   */
  setActiveTab: (tab: ClientEditTabId, options?: { replace?: boolean }) => void;
}

export function useClientEditTab(): UseClientEditTabResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get(TAB_QUERY_PARAM);
  const activeTab: ClientEditTabId = useMemo(
    () => (isClientEditTabId(rawTab) ? rawTab : DEFAULT_TAB),
    [rawTab],
  );

  const setActiveTab = useCallback(
    (tab: ClientEditTabId, options?: { replace?: boolean }) => {
      // `setSearchParams` aceita callback recebendo o `URLSearchParams`
      // atual — usamos a forma de update funcional para preservar
      // outros parâmetros eventualmente presentes na URL (ex.: query
      // strings de filtro se vierem a ser introduzidas em sub-abas).
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(TAB_QUERY_PARAM, tab);
          return next;
        },
        { replace: options?.replace === true },
      );
    },
    [setSearchParams],
  );

  return { activeTab, setActiveTab };
}
