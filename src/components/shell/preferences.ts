'use client';

import { useSyncExternalStore } from 'react';

/** INTERFACE PREFERENCES (docs/DESIGN-SYSTEM-V4.md §4.9) — kept in this browser under the `vewbox.ui` key that the
 *  motion setting already used, and applied to <html> as attributes so CSS and any component can read them without
 *  parsing storage. src/app/boot.ts applies the same attributes before the first paint; this module keeps them current
 *  afterwards. Reduce motion stays a studio setting (the store); it is mirrored here only so the boot can apply it
 *  before the snapshot arrives.
 *
 *    <html data-contrast="more|standard">   absent = follow the system (tokens.css: prefers-contrast)
 *    <html data-cutting-density="comfortable">   absent = compact (the cutting room's default; <Room> applies it)
 *    <html data-previews="off">             hero previews off (read by F3's PreviewPlayer)
 *    <html data-keys="off">                 single-key shortcuts off (read by the shell and F3's shortcut scopes)
 *    <html data-sidebar="expanded|collapsed">   the sidebar's shape from the first paint (VISUAL-STANDARD-V5.1 §5.1, §6.5):
 *                                          the producer's choice (localStorage `vb.sidebar`), or by default expanded
 *                                          at ≥ 1280 and collapsed at 1024–1279 (and in the cutting room) */

export type Contrast = 'more' | 'standard';
export type SidebarShape = 'expanded' | 'collapsed';
export interface UiPrefs {
  motion?: boolean;
  contrast?: Contrast;
  density?: 'compact' | 'comfortable';
  previews?: boolean;
  keys?: boolean;
}

export const PREFS_KEY = 'vewbox.ui';

/** Parse the stored value; anything malformed is ignored, field by field. */
export function parsePrefs(raw: string | null | undefined): UiPrefs {
  let u: Record<string, unknown> = {};
  try { const v = JSON.parse(raw || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) u = v as Record<string, unknown>; } catch { /* fine */ }
  return {
    motion: typeof u.motion === 'boolean' ? u.motion : undefined,
    contrast: u.contrast === 'more' || u.contrast === 'standard' ? u.contrast : undefined,
    density: u.density === 'comfortable' || u.density === 'compact' ? u.density : undefined,
    previews: typeof u.previews === 'boolean' ? u.previews : undefined,
    keys: typeof u.keys === 'boolean' ? u.keys : undefined,
  };
}

/** The sidebar's stored shape (`vb.sidebar`), or null when the producer has not chosen. */
export const SIDEBAR_KEY = 'vb.sidebar';
export const parseSidebar = (raw: string | null | undefined): SidebarShape | null => (raw === 'expanded' || raw === 'collapsed' ? raw : null);
/** The shape to draw: the stored choice, else expanded at ≥ 1280 (`wide`) and collapsed below. */
export const sidebarShape = (stored: SidebarShape | null, wide: boolean): SidebarShape => stored ?? (wide ? 'expanded' : 'collapsed');

/** The attributes <html> carries for these preferences (null removes one). The boot script computes the same;
 *  `wide` is (min-width: 1280px). */
export function prefAttributes(p: UiPrefs, wide: boolean, sidebar: SidebarShape | null = null): Record<string, string | null> {
  return {
    'data-contrast': p.contrast ?? null,
    'data-cutting-density': p.density === 'comfortable' ? 'comfortable' : null,
    'data-previews': p.previews === false ? 'off' : null,
    'data-keys': p.keys === false ? 'off' : null,
    'data-sidebar': sidebarShape(sidebar, wide),
  };
}

let cache: UiPrefs | null = null;
const listeners = new Set<() => void>();

export function readPrefs(): UiPrefs {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};
  try { cache = parsePrefs(localStorage.getItem(PREFS_KEY)); } catch { cache = {}; }
  return cache;
}

function apply(p: UiPrefs) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  for (const [name, value] of Object.entries(prefAttributes(p, false))) { if (name === 'data-sidebar') continue; if (value === null) html.removeAttribute(name); else html.setAttribute(name, value); }
}

/** Change some preferences: stored, applied to <html>, and every reader re-renders. */
export function writePrefs(patch: Partial<UiPrefs>): void {
  const next: UiPrefs = { ...readPrefs(), ...patch };
  cache = next;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode: this page keeps them */ }
  apply(next);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  // another tab changed them
  const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY) { cache = null; apply(readPrefs()); l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}
const EMPTY: UiPrefs = {};

/** The interface preferences, kept current. On the server (and during hydration) they are empty. */
export function usePrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => EMPTY);
}

/** Whether single-key shortcuts are on (WCAG 2.1.4: they can be turned off). */
export const singleKeysOn = (p: UiPrefs): boolean => p.keys !== false;

// ---- the sidebar's shape (`vb.sidebar`) ---------------------------------------------------------------------------
const sidebarListeners = new Set<() => void>();
let sidebarCache: SidebarShape | null | undefined;
export function readSidebar(): SidebarShape | null {
  if (sidebarCache !== undefined) return sidebarCache;
  if (typeof window === 'undefined') return null;
  try { sidebarCache = parseSidebar(localStorage.getItem(SIDEBAR_KEY)); } catch { sidebarCache = null; }
  return sidebarCache;
}
/** Remember the producer's choice of shape. The shell applies it to <html data-sidebar>. */
export function writeSidebar(v: SidebarShape): void {
  sidebarCache = v;
  try { localStorage.setItem(SIDEBAR_KEY, v); } catch { /* private mode: this page keeps it */ }
  for (const l of sidebarListeners) l();
}
function subscribeSidebar(l: () => void) {
  sidebarListeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === SIDEBAR_KEY) { sidebarCache = undefined; l(); } };
  window.addEventListener('storage', onStorage);
  return () => { sidebarListeners.delete(l); window.removeEventListener('storage', onStorage); };
}
/** The stored choice, kept current (null on the server, during hydration, and when the producer has not chosen). */
export function useSidebarChoice(): SidebarShape | null {
  return useSyncExternalStore(subscribeSidebar, readSidebar, () => null);
}
