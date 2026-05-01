/**
 * Fake leve de IndexedDB para o ambiente de testes (jsdom).
 *
 * jsdom não implementa IndexedDB. Em vez de adicionar `fake-indexeddb`
 * como dependência (audit + bundle), implementamos aqui um polyfill
 * mínimo cobrindo apenas o subset usado pelo `permissionsCache`:
 *
 * - `indexedDB.open(name, version)` → cria um store em memória.
 * - `db.transaction(store, mode)` → retorna um IDBTransaction simulado.
 * - `store.get(key)` / `put(value, key)` / `delete(key)`.
 *
 * Não suporta:
 * - Múltiplos stores por DB (sempre um único `permissions`).
 * - Index/cursors.
 * - Persistência entre testes (cada `installFakeIndexedDB()` zera).
 *
 * Esses limites são intencionais — o fake foca no contrato real do
 * `permissionsCache` e nada mais. Se um dia o cache evoluir (mais
 * stores, queries), troca-se por `fake-indexeddb` ou expande este
 * helper.
 */

interface MutableRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
  onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
}

interface MutableOpenRequest extends MutableRequest<IDBDatabase> {
  onupgradeneeded:
    | ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown)
    | null;
  onblocked: ((this: IDBOpenDBRequest, ev: Event) => unknown) | null;
}

interface FakeStoreState {
  data: Map<IDBValidKey, unknown>;
  name: string;
}

interface FakeDatabaseState {
  version: number;
  stores: Map<string, FakeStoreState>;
}

const databases = new Map<string, FakeDatabaseState>();

let originalIndexedDB: IDBFactory | undefined;
let installed = false;

/**
 * Cria um IDBRequest simulado que dispara `onsuccess` na microtask
 * seguinte, espelhando o comportamento assíncrono real do IndexedDB.
 *
 * Mantida em escopo de módulo (top-level) — não depende de nenhum
 * binding interno do `createFakeStore`, então não precisa estar
 * aninhada (Sonar S7721).
 */
function makeRequest<T>(result: T): IDBRequest<T> {
  const request: MutableRequest<T> = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    request.onsuccess?.call(request as unknown as IDBRequest<T>, new Event('success'));
  });
  return request as unknown as IDBRequest<T>;
}

/**
 * Cria um IDBObjectStore mínimo que opera sobre o `Map` interno do
 * banco.
 */
function createFakeStore(state: FakeStoreState): IDBObjectStore {
  return {
    get(key: IDBValidKey): IDBRequest<unknown> {
      return makeRequest(state.data.get(key));
    },
    put(value: unknown, key: IDBValidKey = 'current'): IDBRequest<IDBValidKey> {
      state.data.set(key, value);
      return makeRequest<IDBValidKey>(key);
    },
    delete(key: IDBValidKey): IDBRequest<undefined> {
      state.data.delete(key);
      return makeRequest<undefined>(undefined);
    },
    // Métodos não usados pelo `permissionsCache` — implementação
    // mínima evita any/cast.
    add() {
      throw new Error('FakeStore.add não implementado.');
    },
    clear() {
      state.data.clear();
      return makeRequest<undefined>(undefined);
    },
    count() {
      return makeRequest<number>(state.data.size);
    },
    getAll() {
      return makeRequest<unknown[]>(Array.from(state.data.values()));
    },
    getKey() {
      return makeRequest<IDBValidKey | undefined>(undefined);
    },
    getAllKeys() {
      return makeRequest<IDBValidKey[]>(Array.from(state.data.keys()));
    },
    index() {
      throw new Error('FakeStore.index não implementado.');
    },
    openCursor() {
      throw new Error('FakeStore.openCursor não implementado.');
    },
    openKeyCursor() {
      throw new Error('FakeStore.openKeyCursor não implementado.');
    },
    deleteIndex() {
      throw new Error('FakeStore.deleteIndex não implementado.');
    },
    createIndex() {
      throw new Error('FakeStore.createIndex não implementado.');
    },
    autoIncrement: false,
    indexNames: [] as unknown as DOMStringList,
    keyPath: null,
    name: state.name,
    transaction: null as unknown as IDBTransaction,
  } as unknown as IDBObjectStore;
}

function createFakeDatabase(name: string, state: FakeDatabaseState): IDBDatabase {
  return {
    close() {
      // no-op: fake mantém estado em `databases` global.
    },
    transaction(storeName: string | string[], _mode?: IDBTransactionMode): IDBTransaction {
      const targetName = Array.isArray(storeName) ? storeName[0] : storeName;
      const storeState = state.stores.get(targetName);
      if (!storeState) {
        throw new DOMException(`Store ${targetName} não existe`, 'NotFoundError');
      }
      return {
        objectStore: () => createFakeStore(storeState),
        abort: () => undefined,
        commit: () => undefined,
        db: createFakeDatabase(name, state),
        durability: 'default' as IDBTransactionDurability,
        error: null,
        mode: 'readwrite' as IDBTransactionMode,
        objectStoreNames: [targetName] as unknown as DOMStringList,
        onabort: null,
        oncomplete: null,
        onerror: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      } as unknown as IDBTransaction;
    },
    createObjectStore(storeName: string): IDBObjectStore {
      const newState: FakeStoreState = { data: new Map(), name: storeName };
      state.stores.set(storeName, newState);
      return createFakeStore(newState);
    },
    deleteObjectStore(storeName: string) {
      state.stores.delete(storeName);
    },
    name,
    objectStoreNames: {
      length: state.stores.size,
      contains: (s: string) => state.stores.has(s),
      item: () => null,
    } as unknown as DOMStringList,
    version: state.version,
    onabort: null,
    onclose: null,
    onerror: null,
    onversionchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as IDBDatabase;
}

function createFakeFactory(): IDBFactory {
  return {
    open(name: string, version?: number): IDBOpenDBRequest {
      const request: MutableOpenRequest = {
        result: null as unknown as IDBDatabase,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      let state = databases.get(name);
      const requestedVersion = version ?? 1;
      const needsUpgrade = !state || state.version < requestedVersion;
      if (!state) {
        state = { version: requestedVersion, stores: new Map() };
        databases.set(name, state);
      } else if (state.version < requestedVersion) {
        state.version = requestedVersion;
      }
      const db = createFakeDatabase(name, state);
      request.result = db;
      queueMicrotask(() => {
        if (needsUpgrade) {
          request.onupgradeneeded?.call(
            request as unknown as IDBOpenDBRequest,
            new Event('upgradeneeded') as IDBVersionChangeEvent,
          );
        }
        request.onsuccess?.call(
          request as unknown as IDBOpenDBRequest,
          new Event('success'),
        );
      });
      return request as unknown as IDBOpenDBRequest;
    },
    deleteDatabase(name: string): IDBOpenDBRequest {
      databases.delete(name);
      const request: MutableOpenRequest = {
        result: null as unknown as IDBDatabase,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        request.onsuccess?.call(
          request as unknown as IDBOpenDBRequest,
          new Event('success'),
        );
      });
      return request as unknown as IDBOpenDBRequest;
    },
    cmp() {
      return 0;
    },
    databases() {
      return Promise.resolve([]);
    },
  } as unknown as IDBFactory;
}

/**
 * Instala o fake `indexedDB` em `window`. Idempotente — chamar mais
 * de uma vez é seguro.
 *
 * Limpa todos os bancos previamente criados, garantindo isolamento
 * entre testes.
 */
export function installFakeIndexedDB(): void {
  databases.clear();
  if (installed) {
    return;
  }
  if (typeof globalThis.window === 'undefined') {
    return;
  }
  originalIndexedDB = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: createFakeFactory(),
  });
  installed = true;
}

/**
 * Restaura o `indexedDB` original. Chamar em `afterEach` para evitar
 * vazamento de estado entre suites.
 */
export function uninstallFakeIndexedDB(): void {
  databases.clear();
  if (!installed || typeof globalThis.window === 'undefined') {
    return;
  }
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: originalIndexedDB,
  });
  installed = false;
}

/**
 * Remove o `indexedDB` do contexto global para simular browser sem
 * suporte. Útil para testar o caminho de fallback gracioso do
 * `permissionsCache`.
 */
export function disableIndexedDB(): void {
  if (typeof globalThis.window === 'undefined') return;
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}
