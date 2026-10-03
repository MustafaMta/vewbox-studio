import { describe, expect, it } from 'vitest';
import { SHORTCUT_SCOPES, isTextField, shortcutFor } from '@/components/shell/shortcuts';
import { t } from '@/lib/i18n';

/** docs/DESIGN-SYSTEM-V4.md §7.5: the global shortcuts never fire while typing; single keys can be turned off
 *  (WCAG 2.1.4) and leave players and strips their own keys. Package F4. */

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: (n: string) => (extra[`@${n}`] as string) ?? null, closest: (s: string) => (extra.inScope && s.includes('data-shortcut-scope') ? {} : null), ...extra });
const key = (k: string, more: Record<string, unknown> = {}) => ({ key: k, code: '', target: el('BODY'), ...more });

describe('isTextField', () => {
  it('knows where typing types', () => {
    expect(isTextField(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTextField(el('INPUT', { type: 'search' }))).toBe(true);
    expect(isTextField(el('TEXTAREA'))).toBe(true);
    expect(isTextField(el('SELECT'))).toBe(true);
    expect(isTextField(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTextField(el('DIV', { '@role': 'combobox' }))).toBe(true);
  });
  it('and where it does not', () => {
    expect(isTextField(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTextField(el('BUTTON'))).toBe(false);
    expect(isTextField(el('A'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('shortcutFor', () => {
  it('Ctrl/⌘K opens the palette, on any layout', () => {
    expect(shortcutFor(key('k', { ctrlKey: true }), true)).toBe('palette');
    expect(shortcutFor(key('K', { metaKey: true }), true)).toBe('palette');
    expect(shortcutFor(key('ن', { ctrlKey: true, code: 'KeyK' }), true)).toBe('palette'); // Arabic layout
    expect(shortcutFor(key('k', { ctrlKey: true, altKey: true }), true)).toBeNull();
  });
  it('Ctrl/⌘ \\ collapses the navigation', () => {
    expect(shortcutFor(key('\\', { ctrlKey: true }), true)).toBe('collapse');
    expect(shortcutFor(key('ذ', { metaKey: true, code: 'Backslash' }), true)).toBe('collapse');
  });
  it('? opens the sheet (also ؟ on an Arabic keyboard), only while single keys are on', () => {
    expect(shortcutFor(key('?', { shiftKey: true }), true)).toBe('sheet');
    expect(shortcutFor(key('؟', { shiftKey: true }), true)).toBe('sheet');
    expect(shortcutFor(key('?', { shiftKey: true }), false)).toBeNull();
  });
  it('F asks for focus mode, unless a player or strip owns the key', () => {
    expect(shortcutFor(key('f'), true)).toBe('focus');
    expect(shortcutFor(key('ب', { code: 'KeyF' }), true)).toBe('focus');
    expect(shortcutFor(key('f', { target: el('DIV', { inScope: true }) }), true)).toBeNull();
    expect(shortcutFor(key('f'), false)).toBeNull();
    expect(shortcutFor(key('F', { shiftKey: true }), true)).toBeNull();
  });
  it('never fires while focus is in a text field — not even Ctrl/⌘K', () => {
    for (const target of [el('INPUT', { type: 'text' }), el('TEXTAREA'), el('DIV', { isContentEditable: true })]) {
      expect(shortcutFor(key('k', { ctrlKey: true, target }), true)).toBeNull();
      expect(shortcutFor(key('?', { target }), true)).toBeNull();
      expect(shortcutFor(key('f', { target }), true)).toBeNull();
    }
  });
  it('leaves a key another handler already took, and repeats', () => {
    expect(shortcutFor(key('k', { ctrlKey: true, defaultPrevented: true }), true)).toBeNull();
    expect(shortcutFor(key('?', { repeat: true }), true)).toBeNull();
  });
});

describe('the shortcut sheet’s content (§5.17)', () => {
  it('has the four scopes, every label in both languages', () => {
    expect(SHORTCUT_SCOPES.map((s) => s.id)).toEqual(['global', 'player', 'storyboard', 'timeline']);
    for (const s of SHORTCUT_SCOPES) for (const k of [s.label, s.hint, ...s.rows.map((r) => r.label)]) { expect(t('en', k)).toBeTruthy(); expect(t('ar', k)).toMatch(/[؀-ۿ]/); }
  });
  it('lists the global shortcuts of §7.5', () => {
    expect(SHORTCUT_SCOPES[0].rows.map((r) => r.keys.map((c) => c.join('+')).join(' / '))).toEqual(['Mod+K', '?', 'Mod+\\', 'F', 'Esc']);
  });
  it('offers no note key while there is nowhere to keep notes (B2)', () => {
    expect(SHORTCUT_SCOPES.flatMap((s) => s.rows).some((r) => r.keys.some((c) => c.includes('N')))).toBe(false);
  });
});
