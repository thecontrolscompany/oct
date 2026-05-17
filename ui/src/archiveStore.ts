import type { LoadedArchive } from './archiveParser';

const DB_NAME = 'oct-archive-store';
const STORE_NAME = 'archives';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
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
    tx.objectStore(STORE_NAME).put(archive, key);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function loadStoredArchive(key: string): Promise<LoadedArchive | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
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
    tx.objectStore(STORE_NAME).delete(key);
    await txDone(tx);
  } finally {
    db.close();
  }
}
