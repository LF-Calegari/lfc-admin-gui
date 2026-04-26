import { isValidPermissionsCatalog } from './types';

import type { User } from './types';

/**
 * Catálogo persistido em IndexedDB.
 *
 * Espelha exatamente o payload de `GET /auth/permissions` projetado
 * para uso no frontend, mais um carimbo de tempo para validações
 * futuras (TTL, invalidação por staleness). O timestamp já é gravado
 * mesmo sem consumidor — adicioná-lo depois exigiria migração de
 * versão do store, e o custo de gravar agora é zero.
 */
export interface CachedPermissions {
  user: User;
  permissions: ReadonlyArray<string>;
  permissionCodes: ReadonlyArray<string>;
  routeCodes: ReadonlyArray<string>;
  /** Epoch (ms) no momento do `save()`. */
  cachedAt: number;
}

/**
 * Nome do banco IndexedDB usado para o catálogo de permissões.
 *
 * Prefixado com `lfc-admin-` para evitar colisão com outros apps que
 * eventualmente compartilhem origem em desenvolvimento (a sandbox
 * IndexedDB é por origem, igual `localStorage`).
 */
const DB_NAME = 'lfc-admin-auth';

/**
 * Versão do schema. Incrementar quando mudar o `objectStore` ou os
 * keys (qualquer migração disparará `onupgradeneeded`).
 */
const DB_VERSION = 1;

/**
 * Object store único — não precisamos de múltiplos por enquanto.
 */
const STORE_NAME = 'permissions';

/**
 * Chave fixa do registro. Como o cache é por usuário e a SPA é
 * mono-usuário (um JWT por vez), uma única chave estável basta.
 */
const RECORD_KEY = 'current';

/**
 * Type guard mínimo para o registro lido de IndexedDB.
 *
 * Reusa `isValidPermissionsCatalog` em `types.ts` (Issue #122 / FIX
 * PR #123) e adiciona apenas a validação de `cachedAt` — o subset
 * comum de shape vive em uma fonte única, sem duplicação de código.
 *
 * O store é gravável pelo usuário via DevTools, então a checagem
 * defensiva é necessária; confiar cegamente em `JSON.parse` poderia
 * crashar em acesso a `payload.user.id` se alguém substituísse o
 * conteúdo manualmente.
 */
function isValidCachedPermissions(value: unknown): value is CachedPermissions {
  if (!isValidPermissionsCatalog(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.cachedAt === 'number' && Number.isFinite(record.cachedAt)
  );
}

/**
 * Acessa `window.indexedDB` defensivamente.
 *
 * IndexedDB pode estar ausente em:
 * - SSR/jsdom sem polyfill;
 * - browsers exóticos com `indexedDB` desativado por política;
 * - modo privado do Safari iOS (legacy);
 * - extensões que removem a API.
 *
 * Retornar `null` aqui é o gatilho do fallback gracioso: todos os
 * métodos públicos checam e degradam para no-op.
 */
function getIndexedDB(): IDBFactory | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}

/**
 * Abre uma conexão com o banco, criando o store na primeira vez.
 *
 * Devolve uma Promise que rejeita com `Error` em qualquer falha
 * (bloqueio, schema corrompido, cota). O caller tem responsabilidade
 * única: capturar a rejeição e degradar para no-op.
 */
function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('IndexedDB open lançou.'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
    };
    request.onblocked = () => {
      reject(new Error('IndexedDB bloqueado por outra conexão.'));
    };
  });
}

/**
 * Executa uma operação contra o store, garantindo o `db.close()` no
 * fim. Centralizar isso evita vazar conexões e simplifica os métodos
 * públicos.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const factory = getIndexedDB();
  if (!factory) {
    throw new Error('IndexedDB indisponível.');
  }
  const db = await openDatabase(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE_NAME, mode);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('transaction lançou.'));
        return;
      }
      let request: IDBRequest<T>;
      try {
        request = fn(tx.objectStore(STORE_NAME));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('store fn lançou.'));
        return;
      }
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('IndexedDB request falhou.'));
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error('IndexedDB transaction abortada.'));
      };
    });
  } finally {
    db.close();
  }
}

/**
 * API encapsulada para persistir o catálogo de permissões em IndexedDB.
 *
 * Decisão de armazenamento (Issue #122):
 *
 * 1. **Token continua em `localStorage`** — IndexedDB **não traz ganho
 *    real anti-XSS**: um atacante com JS na origin lê tanto um quanto
 *    o outro. Defesa real é httpOnly cookie via BFF (issue futura).
 * 2. **Catálogo de permissões em IndexedDB** — o payload de
 *    `/auth/permissions` é maior que o que cabia confortavelmente em
 *    `localStorage` (síncrono e limitado a ~5MB), e o acesso assíncrono
 *    casa bem com o ciclo de hidratação do `AuthContext`.
 *
 * Tolerância a falha: ausência da API, cota cheia, schema corrompido
 * ou bloqueio de outra aba **nunca propagam exceção**. A SPA degrada
 * para "sem cache" — o `AuthContext` simplesmente refaz
 * `GET /auth/permissions` no próximo boot ou login, mantendo
 * funcionalidade equivalente.
 */
export const permissionsCache = {
  /**
   * Lê o catálogo persistido, validando shape antes de devolver.
   *
   * Retorna `null` quando:
   * - IndexedDB indisponível;
   * - registro inexistente;
   * - shape inválido (corrompido, esquema antigo, manipulação manual).
   *
   * Uso típico: chamado pelo Provider durante a hidratação inicial,
   * em paralelo à leitura do token. Se `null` mas há token, dispara
   * `GET /auth/permissions` para repopular.
   */
  async load(): Promise<CachedPermissions | null> {
    try {
      const raw = await withStore('readonly', store => store.get(RECORD_KEY));
      if (raw === undefined) {
        return null;
      }
      if (!isValidCachedPermissions(raw)) {
        return null;
      }
      return raw;
    } catch {
      // Inclui IndexedDB ausente, db corrompido, transaction abortada.
      return null;
    }
  },

  /**
   * Persiste o catálogo. Falhas (cota, bloqueio, ausência) são
   * silenciosas — o caller já tem o estado em memória.
   *
   * O `cachedAt` é injetado aqui para garantir uma única fonte de
   * verdade para o timestamp.
   */
  async save(value: Omit<CachedPermissions, 'cachedAt'>): Promise<void> {
    try {
      const record: CachedPermissions = {
        ...value,
        cachedAt: Date.now(),
      };
      await withStore('readwrite', store => store.put(record, RECORD_KEY));
    } catch {
      // Não propaga: a sessão segue funcional sem cache.
    }
  },

  /**
   * Remove o catálogo. Idempotente: ausente == limpo.
   *
   * Usado em três pontos do `AuthContext`:
   * 1. `logout` explícito;
   * 2. `onUnauthorized` (401);
   * 3. defensivamente quando o cache é detectado corrompido.
   */
  async clear(): Promise<void> {
    try {
      await withStore('readwrite', store => store.delete(RECORD_KEY));
    } catch {
      // Não propaga: estado em memória já foi limpo pelo caller.
    }
  },
};

/**
 * Exposto para testes que precisam asserir nos identificadores exatos
 * do banco/store. Não exportado pelo `index.ts` — uso interno de teste.
 */
export const PERMISSIONS_CACHE_KEYS = {
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
  storeName: STORE_NAME,
  recordKey: RECORD_KEY,
} as const;
