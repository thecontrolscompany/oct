import type { LoadedArchive } from './archiveParser';

const DB_NAME = 'oct-archive-store';
const STORE_NAME = 'archives';
const BYTES_STORE_NAME = 'archiveBytes';
const CACHE_VERSION = 3;
const DB_VERSION = 2;

function cacheKey(key: string): string {
  return `v${CACHE_VERSION}:${key}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME);
      }
      if (oldVersion < 2) {
        db.createObjectStore(BYTES_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open archive store'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Archive store transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Archive store transaction aborted'));
  });
}

export async function saveStoredArchive(key: string, archive: LoadedArchive): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(archive, cacheKey(key));
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function loadStoredArchive(key: string): Promise<LoadedArchive | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(cacheKey(key));
    const value = await new Promise<LoadedArchive | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read archive store'));
    });
    await txDone(tx);
    return value;
  } finally {
    db.close();
  }
}

export async function clearStoredArchive(key: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(cacheKey(key));
    await txDone(tx);
  } finally {
    db.close();
  }
}

// ─── Raw bytes store — used to rebuild graphicResolver after page refresh ────

export async function saveStoredArchiveBytes(key: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(BYTES_STORE_NAME, 'readwrite');
    tx.objectStore(BYTES_STORE_NAME).put(bytes, cacheKey(key));
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function loadStoredArchiveBytes(key: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(BYTES_STORE_NAME, 'readonly');
    const request = tx.objectStore(BYTES_STORE_NAME).get(cacheKey(key));
    const value = await new Promise<ArrayBuffer | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read archive bytes store'));
    });
    await txDone(tx);
    return value;
  } finally {
    db.close();
  }
}
