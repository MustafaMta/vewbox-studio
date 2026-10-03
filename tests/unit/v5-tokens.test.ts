import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, over, parseColour, readTokens, resolver } from '../../scripts/v4-contrast.mjs';
import { isViolet } from '../../scripts/v5-lint.mjs';

/** docs/DESIGN-SYSTEM-V5.md §2.1 (exact values), §2.2 (contrast, measured from the sheet), §4.3–4.7 and §11.2 DS-1:
 *  the v4 names resolve to v5 values and nothing resolves to violet. */

const sheet = fs.readFileSync(path.join('src', 'app', 'styles', 'tokens.css'), 'utf8');
const tokens = readTokens(sheet);
const get = resolver(tokens) as (n: string) => string | undefined;
const rgb = (n: string) => { const v = get(n); const p = v && parseColour(v); if (!p) throw new Error(`${n} is not a colour: ${v}`); return p as [number, number, number, number?]; };
const solid = (n: string) => rgb(n).slice(0, 3) as [number, number, number];
const ratio = (fg: string, bg: string) => contrast(solid(fg), solid(bg));

/** docs/design/VISUAL-STANDARD-V5.1.md §3 (binding over v5 §2): the exact values, the legacy aliases, and contrast
 *  measured from the sheet. */
const V51 = {
  '--bg-nav': '#050505', '--bg-page': '#101010', '--surface-1': '#1F1F1F', '--surface-2': '#292929', '--surface-3': '#333333', '--black': '#000000',
  '--line': '#222222', '--line-strong': '#3A3A3A', '--line-control': '#787876',
  '--text-1': '#F5F5F4', '--text-2': '#A8A8A5', '--text-3': '#999996', '--text-disabled': '#5A5A58',
  '--primary': '#F5F5F4', '--primary-hover': '#FFFFFF', '--primary-active': '#E2E2E0', '--on-primary': '#0A0A0A',
  '--wait': '#E3AA5B', '--ok': '#7FCB9C', '--bad': '#F0826F',
  '--gray-canvas': '#0B0B0B', '--gray-clip': '#262626', '--gray-edge': '#8A8A8A',
};

describe('the v5.1 token sheet (§3)', () => {
  it('has the exact values', () => {
    for (const [k, v] of Object.entries(V51)) expect(get(k), k).toBe(v);
    expect(get('--wait-soft')).toBe('rgb(227 170 91 / .16)');
    expect(get('--chip-on-art')).toBe('rgb(0 0 0 / .72)');
    expect(get('--overlay')).toBe('rgb(0 0 0 / .64)');
  });

  it('maps the legacy names (§3.1)', () => {
    const roles: Record<string, string> = { '--page': '--bg-page', '--surface': '--surface-1', '--field': '--surface-1', '--raised': '--surface-2', '--fg': '--text-1', '--fg-body': '--text-1', '--fg-muted': '--text-2', '--fg-faint': '--text-3', '--fg-disabled': '--text-disabled', '--paper': '--primary', '--tungsten': '--wait', '--carbon-2': '--bg-page', '--carbon-9': '--text-3', '--on-paper': '--on-primary' };
    for (const [role, base] of Object.entries(roles)) expect(get(role), role).toBe(get(base));
  });

  it('has §3.2–§3.6: radii, elevation, spacing, layout and motion', () => {
    expect(['--r-0', '--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill'].map((n) => get(n))).toEqual(['0', '6px', '10px', '14px', '20px', '999px']);
    expect(get('--r-media')).toBe('14px');
    expect(get('--shadow-overlay')).toContain('0 12px 32px rgb(0 0 0 / .5)');
    expect(get('--shadow-modal')).toContain('0 24px 64px rgb(0 0 0 / .6)');
    expect([4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80].map((i) => get(`--s-${i}`))).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80].map((i) => `${i}px`));
    expect([get('--sidebar-w'), get('--sidebar-w-collapsed'), get('--content-max'), get('--topbar-h'), get('--tabbar-h')]).toEqual(['240px', '64px', '1360px', '56px', '64px']);
    expect([get('--control-h'), get('--control-h-sm'), get('--control-h-lg')]).toEqual(['40px', '32px', '48px']);
    expect([get('--dur-1'), get('--dur-2'), get('--dur-3'), get('--dur-4')]).toEqual(['120ms', '180ms', '240ms', '360ms']);
    expect(get('--ease-out')).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(get('--ease-enter')).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(get('--ease-exit')).toBe('cubic-bezier(0.4, 0, 1, 1)');
  });

  it('sets Geist and Geist Mono (§4.1), with system fallbacks for content in Arabic', () => {
    expect(get('--font-ui')).toMatch(/^var\(--font-geist,/);
    expect(get('--font-mono')).toMatch(/^var\(--font-geist-mono/);
    expect(get('--font-title')).toBe(get('--font-ui'));
    expect(get('--font-ui')).toContain('Geeza Pro');
    expect(get('--font-ui')).toContain('Noto Sans Arabic');
    expect(sheet).not.toMatch(/--font-newsreader|--font-plex|\[dir=.rtl/);
  });
});
describe('violet is retired (§1.3, §2.1)', () => {
  it('every --accent*, --iris-*, --violet-*, --ring* and --teal* resolves to paper or a muted neutral', () => {
    const names = Object.keys(tokens).filter((n) => /^--(accent|iris|violet|ring|teal|info|edge-lit|select)/.test(n));
    expect(names.length).toBeGreaterThan(15);
    for (const n of names) {
      const v = get(n)!;
      const c = parseColour(v);
      expect(c, `${n} = ${v}`).not.toBeNull();
      expect(isViolet(v), `${n} = ${v}`).toBe(false);
      const [r, g, b] = c as number[];
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${n} is a neutral`).toBeLessThanOrEqual(12);
    }
  });

  it('no value anywhere in the sheet is violet', () => {
    const found = [...sheet.matchAll(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g)].map((m) => m[0]).filter((v) => isViolet(v));
    expect(found).toEqual([]);
  });
});

describe('contrast (§3.1), measured from the sheet', () => {
  const at = (n: number, need: number) => expect(n).toBeGreaterThanOrEqual(need);
  it('text on the grounds', () => {
    for (const bg of ['--bg-nav', '--bg-page', '--surface-1', '--surface-2', '--surface-3', '--black']) at(ratio('--text-1', bg), 4.5);
    for (const bg of ['--bg-page', '--surface-1', '--surface-2']) { at(ratio('--text-2', bg), 4.5); at(ratio('--text-3', bg), 4.5); }
    expect(ratio('--text-1', '--bg-page')).toBeCloseTo(17.4, 0);
  });
  it('boundaries, tungsten, status and the primary', () => {
    for (const bg of ['--bg-page', '--surface-1']) at(ratio('--line-control', bg), 3);
    for (const bg of ['--bg-page', '--surface-1']) at(ratio('--wait', bg), 4.5);
    at(contrast(solid('--wait'), over(rgb('--wait-soft'), solid('--bg-page'))), 4.5);
    at(ratio('--ok', '--bg-page'), 4.5); at(ratio('--bad', '--bg-page'), 4.5);
    at(ratio('--on-primary', '--primary'), 4.5);
    at(ratio('--on-primary', '--bad'), 4.5);
  });
  it('the focus ring: text-1 vs the grounds, and the black band on art', () => {
    for (const bg of ['--bg-page', '--surface-1', '--surface-2']) at(ratio('--text-1', bg), 3);
    at(contrast(solid('--text-1'), [0, 0, 0]), 3);
  });
  it('text on the chip over pure white art', () => {
    at(contrast(solid('--text-1'), over(rgb('--chip-on-art'), [255, 255, 255])), 4.5);
  });
});