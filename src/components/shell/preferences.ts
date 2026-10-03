'use client';

import { useSyncExternalStore } from 'react';

/** INTERFACE PREFERENCES (docs/DESIGN-SYSTEM-V4.md §4.9) — kept in this browser under the `vewbox.ui` key that the
 *  language and motion settings already used, and applied to <html> as attributes so CSS and any component can read
 *  them without parsing storage. src/app/boot.ts applies the same attributes before the first paint; this module keeps
 *  them current afterwards. Language and Reduce motion stay studio settings (the store); they are mirrored here only
 *  so the boot can apply them before the snapshot arrives.
 *
 *    <html data-contrast="more|standard">   absent = follow the system (tokens.css: prefers-contrast)
 *    <html data-cutting-density="comfortable">   absent = compact (the cutting room's default; <Room> applies it)
 *    <html data-previews="off">             hero previews off (read by F3's PreviewPlayer)
 *    <html data-keys="off">                 single-key shortcuts off (read by the shell and F3's shortcut scopes)
 *    <html data-nav-boot="rail|sidebar">    the navigation's shape for the first paint (the shell takes over after) */

export type Contrast = 'more' | 'standard';
export type NavShape = 'rail' | 'sidebar';
export interface UiPrefs {
  locale?: 'en' | 'ar';
  motion?: boolean;
  contrast?: Contrast;
  density?: 'compact' | 'comfortable';
  previews?: boolean;
  keys?: boolean;
  /** an explicit choice of navigation shape (Ctrl/⌘ \), per room kind; absent = automatic (§4.1) */
  nav?: { lobby?: NavShape; cutting?: NavShape };
}

export const PREFS_KEY = 'vewbox.ui';

/** Parse the stored value; anything malformed is ignored, field by field. */
export function parsePrefs(raw: string | null | undefined): UiPrefs {
  let u: Record<string, unknown> = {};
  try { const v = JSON.parse(raw || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) u = v as Record<string, unknown>; } catch { /* fine */ }
  const shape = (x: unknown): NavShape | undefined => (x === 'rail' || x === 'sidebar' ? x : undefined);
  const nav = u.nav && typeof u.nav === 'object' ? (u.nav as Record<string, unknown>) : {};
  return {
    locale: u.locale === 'ar' ? 'ar' : u.locale === 'en' ? 'en' : undefined,
    motion: typeof u.motion === 'boolean' ? u.motion : undefined,
    contrast: u.contrast === 'more' || u.contrast === 'standard' ? u.contrast : undefined,
    density: u.density === 'comfortable' || u.density === 'compact' ? u.density : undefined,
    previews: typeof u.previews === 'boolean' ? u.previews : undefined,
    keys: typeof u.keys === 'boolean' ? u.keys : undefined,
    nav: { lobby: shape(nav.lobby), cutting: shape(nav.cutting) },
  };
}

/** The attributes <html> carries for these preferences (null removes one). The boot script computes the same. */
export function prefAttributes(p: UiPrefs, wide: boolean): Record<string, string | null> {
  return {
    'data-contrast': p.contrast ?? null,
    'data-cutting-density': p.density === 'comfortable' ? 'comfortable' : null,
    'data-previews': p.previews === false ? 'off' : null,
    'data-keys': p.keys === false ? 'off' : null,
    'data-nav-boot': p.nav?.lobby ?? (wide ? 'sidebar' : 'rail'),
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
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches;
  for (const [name, value] of Object.entries(prefAttributes(p, wide))) { if (value === null) html.removeAttribute(name); else html.setAttribute(name, value); }
}

/** Change some preferences: stored, applied to <html>, and every reader re-renders. */
export function writePrefs(patch: Partial<UiPrefs>): void {
  const next: UiPrefs = { ...readPrefs(), ...patch, nav: { ...readPrefs().nav, ...(patch.nav ?? {}) } };
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
