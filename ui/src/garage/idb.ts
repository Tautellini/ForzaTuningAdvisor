// Storage backend for the garage. IndexedDB (db "fta") with a localStorage
// fallback for environments where IDB is unavailable (e.g. some private modes).

import type { SavedSetup, Workspace } from "./model";

export interface GarageBackend {
  kind: "idb" | "local";
  loadAll(): Promise<{ workspaces: Workspace[]; setups: SavedSetup[] }>;
  putWorkspace(w: Workspace): Promise<void>;
  deleteWorkspace(ordinal: number): Promise<void>;
  putSetup(s: SavedSetup): Promise<void>;
  deleteSetup(id: string): Promise<void>;
}

const DB_NAME = "fta";
const DB_VERSION = 1;
const WS = "workspaces";
const SETUPS = "setups";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WS)) db.createObjectStore(WS, { keyPath: "ordinal" });
      if (!db.objectStoreNames.contains(SETUPS)) {
        const s = db.createObjectStore(SETUPS, { keyPath: "id" });
        s.createIndex("ordinal", "ordinal");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

class IdbBackend implements GarageBackend {
  kind = "idb" as const;
  constructor(private db: IDBDatabase) {}

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async loadAll() {
    const [workspaces, setups] = await Promise.all([
      reqAsPromise(this.store(WS, "readonly").getAll() as IDBRequest<Workspace[]>),
      reqAsPromise(this.store(SETUPS, "readonly").getAll() as IDBRequest<SavedSetup[]>),
    ]);
    return { workspaces, setups };
  }
  async putWorkspace(w: Workspace) {
    await reqAsPromise(this.store(WS, "readwrite").put(w));
  }
  async deleteWorkspace(ordinal: number) {
    await reqAsPromise(this.store(WS, "readwrite").delete(ordinal));
  }
  async putSetup(s: SavedSetup) {
    await reqAsPromise(this.store(SETUPS, "readwrite").put(s));
  }
  async deleteSetup(id: string) {
    await reqAsPromise(this.store(SETUPS, "readwrite").delete(id));
  }
}

// ---- localStorage fallback (tight 5MB budget, but everything still works) ----

const LS_WS = "fta.garage.workspaces";
const LS_SETUPS = "fta.garage.setups";

function lsRead<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

class LocalBackend implements GarageBackend {
  kind = "local" as const;

  async loadAll() {
    return { workspaces: lsRead<Workspace>(LS_WS), setups: lsRead<SavedSetup>(LS_SETUPS) };
  }
  async putWorkspace(w: Workspace) {
    const all = lsRead<Workspace>(LS_WS).filter((x) => x.ordinal !== w.ordinal);
    all.push(w);
    localStorage.setItem(LS_WS, JSON.stringify(all));
  }
  async deleteWorkspace(ordinal: number) {
    localStorage.setItem(LS_WS, JSON.stringify(lsRead<Workspace>(LS_WS).filter((x) => x.ordinal !== ordinal)));
  }
  async putSetup(s: SavedSetup) {
    const all = lsRead<SavedSetup>(LS_SETUPS).filter((x) => x.id !== s.id);
    all.push(s);
    localStorage.setItem(LS_SETUPS, JSON.stringify(all));
  }
  async deleteSetup(id: string) {
    localStorage.setItem(LS_SETUPS, JSON.stringify(lsRead<SavedSetup>(LS_SETUPS).filter((x) => x.id !== id)));
  }
}

export async function openBackend(): Promise<GarageBackend> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
    return new IdbBackend(await openIdb());
  } catch {
    return new LocalBackend();
  }
}
