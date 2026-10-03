'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';
import type { PaletteEntry } from './palette';

/** PAGE ENTRIES FOR THE COMMAND PALETTE — a page can offer its own commands while it is open, for example the cutting
 *  room's "Draw missing frames" (group `create`) or a Settings section (group `settings`):
 *
 *    usePaletteEntries([{ id: 'film:draw-missing', group: 'create', kind: T('…'), name: T('…'),
 *                         action: { type: 'run', run: drawMissing } }]);
 *
 *  They join the palette's groups for as long as the page is mounted. Ids must be unique and stable; a `run` action
 *  must never approve or delete without the page's own confirmation (§7.6: the palette opens decisions, it does not
 *  make them). Pass a memoised array: a new array on every render re-registers. */

const byOwner = new Map<string, PaletteEntry[]>();
let snapshot: PaletteEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => { snapshot = [...byOwner.values()].flat(); for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const EMPTY: PaletteEntry[] = [];

export function usePaletteEntries(entries: PaletteEntry[]): void {
  const owner = useId();
  useEffect(() => {
    byOwner.set(owner, entries); emit();
    return () => { byOwner.delete(owner); emit(); };
  }, [owner, entries]);
}

/** The entries pages have registered (the palette reads them). */
export function usePageEntries(): PaletteEntry[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
