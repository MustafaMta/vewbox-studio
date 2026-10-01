import type { Asset } from '@/domain/types';

/** FILES THE PRODUCER ADDS — kept in this browser, in IndexedDB, as blobs keyed by asset id. The asset record (in
 *  the store, in localStorage) says a file exists; the blob here is the file. On load, every local asset's blob is
 *  read back and given a fresh object URL for this session. A record whose blob is gone (site data cleared, another
 *  browser, storage refused the write) is shown as unavailable rather than as a broken picture.
 *
 *  Browser storage is local to this browser and profile and can be cleared by the user or the browser; nothing is
 *  uploaded anywhere. That is the honest limit of a no-server prototype, and the interface says so. */

const DB = 'vewbox-media';
const STORE = 'blobs';

export function mediaStorageAvailable(): boolean { return typeof indexedDB !== 'undefined'; }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!mediaStorageAvailable()) { reject(new Error('IndexedDB is not available in this browser')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open media storage'));
    req.onblocked = () => reject(new Error('Media storage is blocked by another tab'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Media storage request failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Media storage write was refused (storage may be full)'));
    });
  } finally { db.close(); }
}

export const putBlob = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id));
export const getBlob = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id));
export const deleteBlob = (id: string) => run('readwrite', (s) => s.delete(id));
export const clearBlobs = () => run('readwrite', (s) => s.clear());

// this session's object URLs, and the records whose file could not be found
const urls = new Map<string, string>();
const missing = new Set<string>();

export function localUrl(id: string): string | undefined { return urls.get(id); }
export function isMissing(id: string): boolean { return missing.has(id); }

/** Give a freshly stored blob a URL right away, so the picture appears without a round trip. */
export function remember(id: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urls.set(id, url); missing.delete(id);
  return url;
}

export function forget(id: string) {
  const u = urls.get(id); if (u) URL.revokeObjectURL(u);
  urls.delete(id); missing.delete(id);
}

export function forgetAll() { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); missing.clear(); }

/** Read back every local asset's blob that this session has not resolved yet. Returns how many changed. */
export async function hydrate(assets: Asset[]): Promise<number> {
  const todo = assets.filter((a) => a.local && !urls.has(a.id) && !missing.has(a.id));
  if (todo.length === 0) return 0;
  let changed = 0;
  for (const a of todo) {
    try {
      const blob = await getBlob(a.id);
      if (blob) urls.set(a.id, URL.createObjectURL(blob)); else missing.add(a.id);
    } catch { missing.add(a.id); }
    changed++;
  }
  return changed;
}

/** A readable reason when a write fails, for the toast. */
export function storageErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'QuotaExceededError') return 'This browser’s storage is full. Remove some files from the Asset Library or free space in the browser.';
  if (!mediaStorageAvailable()) return 'This browser does not allow storing files (private window or storage blocked). The file was not kept.';
  return (e as Error)?.message || 'The file could not be stored in this browser.';
}
