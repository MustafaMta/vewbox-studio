'use client';

import { useCallback, useRef } from 'react';
import { singleKeysOn } from './prefs';

/** SHORTCUTS SCOPED TO ONE FOCUSED PLAYER OR STRIP (docs/DESIGN-SYSTEM-V4.md §5.12, §7.5; WCAG 2.1.4).
 *
 *  The handler goes on the scope element's `onKeyDown`, so a shortcut works only while focus is inside that player,
 *  strip or timeline — never page-wide. Keys typed into a text field are never taken. Character keys (letters, digits,
 *  `?`) obey the "Single-key shortcuts" preference (§4.9); Space, the arrows, Home and End always work, because they
 *  are how a keyboard drives media. A focused range input keeps its own arrows (the seek bar moves itself).
 *
 *  Key names: `Space`, `k`, `Shift+ArrowLeft`, `Mod+z` (Ctrl or ⌘), `Home`, `1`, `?`. `?` with no handler of its own
 *  asks the shell's shortcut sheet to open on this scope (`vewbox:shortcuts` on window; F4's ShortcutSheet listens). */

export type ShortcutHandler = (e: React.KeyboardEvent) => void;
export type ShortcutMap = Partial<Record<string, ShortcutHandler>>;

const CHARACTER = /^.$/u;

export function keyName(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): string {
  let k = e.key === ' ' ? 'Space' : e.key;
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Mod');
  if (e.altKey) mods.push('Alt');
  // a shifted character is already its own key ('?', 'K'); letters are named in lower case with Shift+
  if (e.shiftKey && (!CHARACTER.test(k) || /[a-z]/i.test(k))) mods.push('Shift');
  if (CHARACTER.test(k)) k = k.toLowerCase();
  return [...mods, k].join('+');
}

export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(t.type);
  return false;
}

const NATIVE_SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Shift+ArrowLeft', 'Shift+ArrowRight']);

export function useShortcutScope(map: ShortcutMap, { enabled = true, scope = 'player' }: { enabled?: boolean; scope?: string } = {}) {
  const ref = useRef(map); ref.current = map;
  return useCallback((e: React.KeyboardEvent) => {
    if (!enabled || e.defaultPrevented || isTextField(e.target)) return;
    const name = keyName(e.nativeEvent);
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === 'range' && NATIVE_SLIDER_KEYS.has(name)) return;
    // a focused control activates itself with Space and Enter
    if ((name === 'Space' || name === 'Enter') && t.closest('button, a[href], summary, select, [role=button], [role=menuitem], [role=option], [role=radio], [role=tab], [role=checkbox], [role=switch]') && t !== e.currentTarget) return;
    const bare = !name.includes('+') && CHARACTER.test(name);
    if (bare && !singleKeysOn()) return;
    const fn = ref.current[name];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(e); return; }
    if (name === '?' ) { e.preventDefault(); window.dispatchEvent(new CustomEvent('vewbox:shortcuts', { detail: { scope } })); }
  }, [enabled, scope]);
}
