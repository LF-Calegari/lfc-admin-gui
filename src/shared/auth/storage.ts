import type { User } from './types';

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
const USER_KEY = 'lfc-admin-auth-user';

/**
 * Sessão persistida em storage.
 *
 * Reflete o subset do `LoginResponse` necessário para hidratar o
 * `AuthContext` no mount sem refazer a requisição de login. A
 * revalidação via `verify-token` (Issue #54) substituirá a confiança
 * cega por verificação remota.
 */
export interface PersistedSession {
  token: string;
  user: User;
  permissions: ReadonlyArray<string>;
}

/**
 * Estrutura interna gravada na chave `USER_KEY`.
 *
 * Mantida separada do `PersistedSession` porque `token` mora em chave
 * própria — o JSON aqui é apenas `user` + `permissions`, exatamente o
 * que precisamos hidratar de uma vez para evitar duas chamadas a
 * `localStorage.getItem` lado a lado.
 */
interface StoredUserPayload {
  user: User;
  permissions: ReadonlyArray<string>;
}

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
 * Type guard para o payload do usuário gravado em storage.
 *
 * Validamos shape mínimo após `JSON.parse` porque o storage é uma
 * superfície gravável pelo usuário (DevTools, extensões) — confiar
 * cegamente no JSON abriria caminho para crashes ao acessar
 * `payload.user.id` se alguém manualmente substituísse o conteúdo.
 */
function isValidStoredUserPayload(value: unknown): value is StoredUserPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.permissions)) {
    return false;
  }
  if (!record.user || typeof record.user !== 'object') {
    return false;
  }
  const user = record.user as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string'
  );
}

/**
 * API encapsulada para persistir a sessão em `localStorage`.
 *
 * Decisão de armazenamento (registrada no PR #53):
 *
 * 1. `sessionStorage` foi descartado — a sessão morreria a cada
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
 * `localStorage` (modo privado), cota cheia ou JSON corrompido nunca
 * propagam exceção — a SPA degrada graciosamente para o
 * comportamento "apenas em memória".
 */
export const sessionStorage = {
  /**
   * Lê a sessão persistida, validando shape antes de devolver.
   *
   * Retorna `null` quando:
   * - storage indisponível;
   * - alguma chave ausente;
   * - JSON do usuário inválido;
   * - shape mínimo não bate (token vazio, user/permissions corrompidos).
   *
   * Uso típico no Provider: chamado no `useState` lazy initializer para
   * hidratar estado e `tokenRef` em uma única passagem síncrona, antes
   * do primeiro render — evita flash de tela de login quando o usuário
   * recarrega a página com sessão válida.
   */
  load(): PersistedSession | null {
    const storage = getStorage();
    if (!storage) {
      return null;
    }
    try {
      const token = storage.getItem(TOKEN_KEY);
      const userJson = storage.getItem(USER_KEY);
      if (!token || !userJson) {
        return null;
      }
      const parsed: unknown = JSON.parse(userJson);
      if (!isValidStoredUserPayload(parsed)) {
        return null;
      }
      return {
        token,
        user: parsed.user,
        permissions: parsed.permissions,
      };
    } catch {
      // JSON malformado ou storage lançou — degrada para "sem sessão".
      return null;
    }
  },

  /**
   * Persiste a sessão.
   *
   * Falhas (cota, modo privado) são silenciosas: o caller já tem o
   * estado em memória e a app continua funcionando — apenas perde a
   * sobrevivência ao reload. Não propagamos exceção para evitar derrubar
   * o fluxo de login feliz por uma limitação de storage.
   *
   * O token nunca é logado em console.
   */
  save(session: PersistedSession): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    try {
      const payload: StoredUserPayload = {
        user: session.user,
        permissions: session.permissions,
      };
      storage.setItem(TOKEN_KEY, session.token);
      storage.setItem(USER_KEY, JSON.stringify(payload));
    } catch {
      // setItem pode lançar em quota exceeded ou storage desabilitado.
    }
  },

  /**
   * Remove ambas as chaves.
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
      storage.removeItem(USER_KEY);
    } catch {
      // removeItem raramente lança, mas mantemos o try/catch por simetria.
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
  user: USER_KEY,
} as const;
