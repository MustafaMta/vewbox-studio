'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/** FOCUS — the keyboard rules every kit control shares (docs/DESIGN-SYSTEM-V4.md §5.11, §5.17, §5.18):
 *  - a row of choices is one Tab stop; → and ← move along it (the interface is always left to right), Home and End jump to the ends, disabled items are skipped;
 *  - an overlay keeps Tab inside itself and gives focus back to whatever opened it.
 *  The pure parts (`rovingStep`, `rovingIndex`, `tabStops`) are unit-tested; the browser parts are driven by the
 *  Playwright specs in tests/e2e/v5 (kit.spec.ts, kit-keyboard.spec.ts) on /kit. */

export type RovingStep = 'next' | 'prev' | 'first' | 'last';

/** What a key means along a row (or a column) of choices; null when it means nothing there. */
export function rovingStep(key: string, opts: { orientation?: 'horizontal' | 'vertical' | 'both' } = {}): RovingStep | null {
  const o = opts.orientation ?? 'horizontal';
  const h = o !== 'vertical';
  const v = o !== 'horizontal';
  if (h && key === 'ArrowRight') return 'next';
  if (h && key === 'ArrowLeft') return 'prev';
  if (v && key === 'ArrowDown') return 'next';
  if (v && key === 'ArrowUp') return 'prev';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return null;
}

/** The index a move lands on among items (true = disabled, skipped). Wraps at the ends when `loop`; -1 when there is
 *  nowhere to go. */
export function rovingIndex(step: RovingStep, from: number, disabled: readonly boolean[], loop = true): number {
  const n = disabled.length;
  if (!n) return -1;
  if (step === 'first') return disabled.findIndex((d) => !d);
  if (step === 'last') { for (let i = n - 1; i >= 0; i--) if (!disabled[i]) return i; return -1; }
  const d = step === 'next' ? 1 : -1;
  let i = from;
  for (let k = 0; k < n; k++) {
    i += d;
    if (i >= n || i < 0) { if (!loop) return -1; i = (i + n) % n; }
    if (!disabled[i]) return i;
  }
  return -1;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]';

interface TabCandidate { tabIndex: number; disabled?: boolean; hidden?: boolean; radioName?: string; checked?: boolean }
/** Which candidates are Tab stops, in order: no negative tabindex, nothing hidden or disabled, and one radio per
 *  group (the checked one, else the first) — the browser's own rule. */
export function tabStops<T extends TabCandidate>(xs: readonly T[]): T[] {
  const groups = new Map<string, T>();
  for (const x of xs) {
    if (!x.radioName || x.disabled || x.hidden || x.tabIndex < 0) continue;
    const held = groups.get(x.radioName);
    if (!held || (x.checked && !held.checked)) groups.set(x.radioName, x);
  }
  return xs.filter((x) => x.tabIndex >= 0 && !x.disabled && !x.hidden && (!x.radioName || groups.get(x.radioName) === x));
}

/** The Tab stops inside an element, in document order. */
export function focusables(root: Element): HTMLElement[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  const rows = els.map((el) => ({
    el,
    tabIndex: el.tabIndex,
    disabled: (el as HTMLButtonElement).disabled === true,
    hidden: el.closest('[inert]') !== null || el.getClientRects().length === 0,
    radioName: el instanceof HTMLInputElement && el.type === 'radio' ? el.name || undefined : undefined,
    checked: el instanceof HTMLInputElement ? el.checked : undefined,
  }));
  return tabStops(rows).map((r) => r.el);
}

/** Keeps Tab inside `root`: from the last stop it goes to the first, and back. */
export function trapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: Element) {
  if (e.key !== 'Tab') return;
  const list = focusables(root);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus(); }
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** While `active`, remembers what had focus before; when it ends (or the component goes), gives focus back to it —
 *  or to `fallback` when that element is gone. */
export function useFocusReturn(active: boolean, fallback?: () => HTMLElement | null | undefined) {
  const before = useRef<HTMLElement | null>(null);
  const fb = useRef(fallback);
  fb.current = fallback;
  useIsoLayoutEffect(() => {
    if (!active) return;
    before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      let el = before.current?.isConnected ? before.current : fb.current?.() ?? null;
      // a menu item of a closed <details> menu is hidden by then: its summary is where the producer was
      if (el && el.getClientRects().length === 0) el = el.closest('details')?.querySelector<HTMLElement>('summary') ?? fb.current?.() ?? null;
      before.current = null;
      // after the overlay has gone, so the browser does not move focus again behind us
      if (el) requestAnimationFrame(() => el.focus({ preventScroll: true }));
    };
  }, [active]);
}
