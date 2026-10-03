import type { Key } from '@/lib/copy';

/** KEYBOARD SHORTCUTS (docs/DESIGN-SYSTEM-V4.md §7.5, §5.12, §5.14, §6.6) — which key does what, and when the global
 *  layer must stay out of the way. Pure: tests/unit/f4-shortcuts.test.ts.
 *
 *  Rules:
 *  - No global shortcut fires while focus is in a text field (§7.5).
 *  - Single-character shortcuts (`?`, `F`) can be turned off (Settings › Interface, WCAG 2.1.4), and the global layer
 *    leaves them to an element that owns its own keys: anything inside `[data-shortcut-scope]` (a player, a strip,
 *    a timeline; F3's useShortcutScope marks its root) or today's `.vplayer`.
 *  - Keys are matched by their physical position too (`KeyboardEvent.code`), so Ctrl+K works on an Arabic layout. */

export type ShortcutCommand = 'palette' | 'sheet' | 'collapse' | 'focus';

interface KeyLike { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; target?: unknown; defaultPrevented?: boolean; repeat?: boolean }
interface ElementLike { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null; closest?: (s: string) => unknown }

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'week', 'time', '']);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/** Is this element one where typing types (an input, a textarea, a select, an editable region)? */
export function isTextField(el: unknown): boolean {
  const e = el as ElementLike | null;
  if (!e || typeof e !== 'object') return false;
  const tag = (e.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return TEXT_INPUTS.has(String(e.type ?? '').toLowerCase());
  if (e.isContentEditable) return true;
  const role = e.getAttribute?.('role');
  return role ? TEXT_ROLES.has(role) : false;
}

/** Is the element inside something that handles its own single keys? */
export function inShortcutScope(el: unknown): boolean {
  const e = el as ElementLike | null;
  return Boolean(e?.closest?.('[data-shortcut-scope], .vplayer'));
}

/** The global command a key press asks for, or null. `singleKeys` is the preference (on by default). */
export function shortcutFor(e: KeyLike, singleKeys: boolean): ShortcutCommand | null {
  if (e.defaultPrevented || isTextField(e.target)) return null;
  const mod = Boolean(e.ctrlKey || e.metaKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // the letter on a Latin layout; the physical key on another script's layout (Arabic: Ctrl+ن is Ctrl+K)
  const is = (letter: string) => k === letter || (e.code === `Key${letter.toUpperCase()}` && !/^[a-z]$/.test(k));
  if (mod && !e.altKey && !e.shiftKey && is('k')) return 'palette';
  if (mod && !e.altKey && (e.key === '\\' || e.code === 'Backslash')) return 'collapse';
  if (mod || e.altKey || !singleKeys || e.repeat) return null;
  if (e.key === '?' || e.key === '؟') return 'sheet';
  if (!e.shiftKey && is('f') && !inShortcutScope(e.target)) return 'focus';
  return null;
}

/** Is this a Mac (⌘ instead of Ctrl in the labels)? */
export const isMac = (platform: string | undefined): boolean => /Mac|iPhone|iPad|iPod/i.test(platform ?? '');

/* ---- the sheet's content: by scope, as §7.5 and the players' and editors' specs define them ------------------------ */

/** A key in a combination: `Mod` is Ctrl, or ⌘ on a Mac. A row's `keys` are alternatives ("Space / K"). */
export type KeyName = 'Mod' | 'Shift' | 'Alt' | 'Esc' | 'Space' | 'Enter' | 'Home' | 'End' | '←' | '→' | '↑' | '↓' | 'Click' | 'Scroll' | string;
export interface ShortcutRow { keys: KeyName[][]; label: Key; /** media time: shown left to right in both languages */ ltr?: boolean }
export interface ShortcutScope { id: 'global' | 'player' | 'storyboard' | 'timeline'; label: Key; hint: Key; rows: ShortcutRow[] }

export const SHORTCUT_SCOPES: ShortcutScope[] = [
  { id: 'global', label: 'shell.keys.global', hint: 'shell.keys.global.hint', rows: [
    { keys: [['Mod', 'K']], label: 'shell.keys.palette' },
    { keys: [['?']], label: 'shell.keys.sheet' },
    { keys: [['Mod', '\\']], label: 'shell.keys.collapse' },
    { keys: [['F']], label: 'shell.keys.focus' },
    { keys: [['Esc']], label: 'shell.keys.esc' },
  ] },
  { id: 'player', label: 'shell.keys.player', hint: 'shell.keys.player.hint', rows: [
    { keys: [['Space'], ['K']], label: 'shell.keys.play' },
    { keys: [['J'], ['L']], label: 'shell.keys.jump', ltr: true },
    { keys: [['←'], ['→']], label: 'shell.keys.frame', ltr: true },
    { keys: [['Shift', '←'], ['Shift', '→']], label: 'shell.keys.second', ltr: true },
    { keys: [['Home'], ['End']], label: 'shell.keys.ends', ltr: true },
    { keys: [['M']], label: 'shell.keys.mute' },
    { keys: [['C']], label: 'shell.keys.captions' },
    { keys: [['F']], label: 'shell.keys.fullscreen' },
    { keys: [['I'], ['O']], label: 'shell.keys.marks' },
    { keys: [['1'], ['2']], label: 'shell.keys.compare' },
  ] },
  { id: 'storyboard', label: 'shell.keys.storyboard', hint: 'shell.keys.storyboard.hint', rows: [
    { keys: [['←'], ['→']], label: 'shell.keys.frames', ltr: true },
    { keys: [['Alt', '←'], ['Alt', '→']], label: 'shell.keys.reorder', ltr: true },
  ] },
  { id: 'timeline', label: 'shell.keys.timeline', hint: 'shell.keys.timeline.hint', rows: [
    { keys: [['Shift', 'Click']], label: 'shell.keys.range' },
    { keys: [['Mod', 'Click']], label: 'shell.keys.toggleClip' },
    { keys: [['Mod', 'Scroll']], label: 'shell.keys.zoom' },
  ] },
];
