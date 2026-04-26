/**
 * Chaves usadas em `localStorage`.
 *
 * Prefixadas com `lfc-admin-` para evitar colisão com outras aplicações
 * servidas pelo mesmo domínio em desenvolvimento (storage é
 * compartilhado por origem). Mantidas como constantes locais para
 * permitir auditoria centralizada — qualquer mudança de namespace deve
 * vir acompanhada de migração.
 */
const TOKEN_KEY = 'lfc-admin-auth-token';

/**
 * Chave **legada** que armazenava `{ user, permissions }` antes da
 * Issue #122 mover o catálogo para IndexedDB. Mantida apenas para a
 * migração no boot — `clearLegacyKeys()` remove a entrada se ainda
 * existir, evitando dado morto em `localStorage`.
 */
const LEGACY_USER_KEY = 'lfc-admin-auth-user';

/**
 * Acessa `window.localStorage` de forma defensiva.
 *
 * Retorna `null` quando:
 * - SSR/jsdom raros sem `window` definido;
 * - Browsers que lançam ao acessar `localStorage` em modo privado
 *   (Safari iOS legacy, Firefox `dom.storage.enabled=false`).
 *
 * Centralizar o try/catch aqui mantém os métodos públicos curtos e
 * evita repetição de bloco defensivo em cada chamada.
 */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * API encapsulada para persistir o **token** em `localStorage`.
 *
 * A partir da Issue #122, o `localStorage` carrega apenas o JWT — o
 * catálogo de permissões mora em IndexedDB (`permissionsCache`).
 * Manter responsabilidades separadas:
 *
 * - **Token (`localStorage`)** sobrevive a reload e tem leitura síncrona,
 *   essencial para o cliente HTTP injetar `Authorization` na primeira
 *   requisição sem aguardar Promise.
 * - **Catálogo (IndexedDB)** é maior, assíncrono e tolera latência —
 *   só usado depois que o Provider terminou de hidratar.
 *
 * Decisão de armazenamento (registrada no PR #53, mantida no #122):
 *
 * 1. `sessionStorage` foi descartado — sessão morreria a cada
 *    fechamento de aba, UX inadequada para painel administrativo.
 * 2. Cookie `httpOnly` via BFF é o ideal anti-XSS, mas exigiria
 *    backend proxy próprio (esta SPA consome diretamente
 *    `lfc-authenticator`). Migração planejada como issue futura.
 * 3. `localStorage` foi escolhido pelo equilíbrio UX × complexidade.
 *    A vulnerabilidade XSS é mitigada pelas defesas em camada da app
 *    (sem `dangerouslySetInnerHTML`, validação/sanitização de input,
 *    deps auditadas, CSP planejado).
 *
 * Todas as operações são tolerantes a falha: ausência de
 * `localStorage` (modo privado), cota cheia ou exceções de runtime
 * nunca propagam — a SPA degrada graciosamente para o comportamento
 * "apenas em memória".
 */
export const tokenStorage = {
  /**
   * Lê o token persistido.
   *
   * Retorna `null` quando:
   * - storage indisponível;
   * - chave ausente;
   * - chave existe mas valor é vazio/whitespace (defensivo).
   *
   * Uso típico no Provider: chamado no `useState` lazy initializer e no
   * `useRef` para hidratar `tokenRef` em uma passagem síncrona, antes
   * do primeiro render — evita flash de tela de login quando o usuário
   * recarrega a página com sessão válida.
   */
  load(): string | null {
    const storage = getStorage();
    if (!storage) {
      return null;
    }
    try {
      const token = storage.getItem(TOKEN_KEY);
      if (!token || token.trim().length === 0) {
        return null;
      }
      return token;
    } catch {
      return null;
    }
  },

  /**
   * Persiste o token.
   *
   * Falhas (cota, modo privado) são silenciosas: o caller já tem o
   * token em memória e a app continua funcionando — apenas perde a
   * sobrevivência ao reload. Não propagamos exceção para evitar derrubar
   * o fluxo de login feliz por uma limitação de storage.
   *
   * O token nunca é logado em console.
   */
  save(token: string): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem(TOKEN_KEY, token);
    } catch {
      // setItem pode lançar em quota exceeded ou storage desabilitado.
    }
  },

  /**
   * Remove o token.
   *
   * Idempotente: chamar em estado já limpo é no-op. Usado em três
   * pontos do `AuthContext`:
   *
   * 1. `logout` explícito do usuário;
   * 2. `onUnauthorized` disparado pelo cliente HTTP em 401;
   * 3. defensivamente quando shape é inválido.
   */
  clear(): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(TOKEN_KEY);
    } catch {
      // removeItem raramente lança, mas mantemos o try/catch por simetria.
    }
  },

  /**
   * Remove chaves legadas que existiam antes da Issue #122.
   *
   * Antes do split em `tokenStorage` (token-only) + `permissionsCache`
   * (catálogo em IndexedDB), o `localStorage` carregava também
   * `{ user, permissions }` na chave `lfc-admin-auth-user`. Essa
   * informação agora vive em IndexedDB; deixar a chave antiga
   * pendurada ocupa espaço sem propósito e confunde quem inspeciona
   * o storage.
   *
   * Idempotente: se a chave não existir, no-op. Tolerante a falha:
   * `removeItem` quebrado não impede o boot.
   */
  clearLegacyKeys(): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(LEGACY_USER_KEY);
    } catch {
      // Tolerante a falha: migração best-effort.
    }
  },
};

/**
 * Exposto para testes que precisam asserir nas chaves exatas do
 * storage. Não exportado pelo `index.ts` — uso interno dos testes do
 * próprio módulo.
 */
export const STORAGE_KEYS = {
  token: TOKEN_KEY,
  /** Chave legada (Issue #122) — apenas para teste da migração. */
  legacyUser: LEGACY_USER_KEY,
} as const;
