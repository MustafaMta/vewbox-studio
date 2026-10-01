'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Asset, StudioState } from '@/domain/types';
import { STATE_VERSION, seed } from './fixtures';
import { addLocalAsset, deleteAsset, emptyStudio } from './actions';
import { protectedAssetOwner } from './rules';
import { clearBlobs, deleteBlob, forget, forgetAll, hydrate, putBlob, remember, storageErrorMessage } from './media';

/** THE STORE — the whole studio as one object in React state, mirrored to the browser's localStorage; files the
 *  producer adds go to IndexedDB (see media.ts).
 *
 *  It starts from the sample fixtures. On the first render in the browser it reads what was saved before, if
 *  anything; from then on every change is written back (debounced, flushed on unload). Settings offers two ways out:
 *  "Reset sample data" returns to the fixtures; "Start with an empty studio" clears everything but your settings.
 *  Nothing leaves the browser: there is no server to send it to. */

export const STORAGE_KEY = 'vewbox.studio.v1';

export type AddFileResult = { ok: true; asset: Asset } | { ok: false; error: string };

interface Api {
  state: StudioState;
  /** True once the browser copy has been read. Pages render a skeleton until then, so nothing flashes. */
  ready: boolean;
  /** True when the state differs from the untouched fixtures — i.e. the producer has changed something. */
  modified: boolean;
  /** Changes whenever a stored file's URL becomes available or goes away; consumers re-render through the context. */
  mediaTick: number;
  update: (fn: (s: StudioState) => StudioState) => void;
  /** Keep a file in this browser and record it as an asset. Fails with a readable reason when storage refuses. */
  addFile: (file: File, meta: { label?: string; tags?: string[] }) => Promise<AddFileResult>;
  /** Remove an asset record and, for a local file, its stored blob. Refused for a picture a used character's
   *  appearance rests on; the result names the character. */
  removeAsset: (id: string) => Promise<{ ok: true } | { ok: false; protectedBy: string }>;
  reset: () => Promise<void>;
  startEmpty: () => Promise<void>;
}

const Ctx = createContext<Api | null>(null);

function load(): StudioState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioState;
    if (!parsed || parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch { return null; }
}

function save(state: StudioState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked: the session still works */ }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudioState>(seed);
  const [ready, setReady] = useState(false);
  const [modified, setModified] = useState(false);
  const [mediaTick, setMediaTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state); latest.current = state;

  useEffect(() => {
    const saved = load();
    if (saved) { setState(saved); setModified(true); }
    setReady(true);
    void hydrate((saved ?? latest.current).assets).then((n) => { if (n) setMediaTick((t) => t + 1); });
  }, []);

  const update = useCallback((fn: (s: StudioState) => StudioState) => {
    setState((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      setModified(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(next), 150);
      return next;
    });
  }, []);

  const addFile = useCallback(async (file: File, meta: { label?: string; tags?: string[] }): Promise<AddFileResult> => {
    const kind: Asset['kind'] = file.type.startsWith('video') ? 'VIDEO' : file.type.startsWith('audio') ? 'AUDIO' : 'IMAGE';
    let asset: Asset | null = null;
    // the record first, so the id exists; the blob is stored under it
    const draft = addLocalAsset(latest.current, { kind, src: '', label: meta.label ?? file.name, tags: meta.tags ?? ['added'], mimeType: file.type, bytes: file.size });
    asset = draft.asset;
    try { await putBlob(asset.id, file); } catch (e) { return { ok: false, error: storageErrorMessage(e) }; }
    remember(asset.id, file);
    update((s) => ({ ...s, assets: [...s.assets, asset!] }));
    setMediaTick((t) => t + 1);
    return { ok: true, asset };
  }, [update]);

  const removeAsset = useCallback(async (id: string): Promise<{ ok: true } | { ok: false; protectedBy: string }> => {
    const owner = protectedAssetOwner(latest.current, id);
    if (owner) return { ok: false, protectedBy: owner.name };
    const a = latest.current.assets.find((x) => x.id === id);
    update((s) => deleteAsset(s, id));
    if (a?.local) { forget(id); try { await deleteBlob(id); } catch { /* nothing to delete */ } setMediaTick((t) => t + 1); }
    return { ok: true };
  }, [update]);

  const wipe = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to remove */ }
    forgetAll();
    try { await clearBlobs(); } catch { /* storage unavailable: nothing was kept there */ }
  }, []);

  const reset = useCallback(async () => { await wipe(); setState(seed()); setModified(false); setMediaTick((t) => t + 1); }, [wipe]);
  const startEmpty = useCallback(async () => { await wipe(); const next = emptyStudio(latest.current.settings); setState(next); save(next); setModified(true); setMediaTick((t) => t + 1); }, [wipe]);

  // flush a pending write when the tab closes or reloads
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; save(latest.current); } };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const api = useMemo<Api>(() => ({ state, ready, modified, mediaTick, update, addFile, removeAsset, reset, startEmpty }), [state, ready, modified, mediaTick, update, addFile, removeAsset, reset, startEmpty]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStudio(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useStudio outside StudioProvider');
  return api;
}
