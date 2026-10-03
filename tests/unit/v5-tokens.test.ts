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

const V5 = {
  '--carbon-0': '#000000', '--carbon-1': '#060606', '--carbon-2': '#0A0A09', '--carbon-3': '#111110', '--carbon-4': '#181817',
  '--carbon-5': '#20201E', '--carbon-6': '#2A2A28', '--carbon-7': '#3A3936', '--carbon-8': '#72706A', '--carbon-9': '#8F8B84',
  '--carbon-10': '#ADA9A1', '--carbon-11': '#D8D4CC', '--paper': '#F3EFE8', '--paper-hi': '#FFFFFF',
  '--gray-canvas': '#0B0B0B', '--gray-clip': '#262626', '--gray-edge': '#8A8A8A',
  '--tungsten': '#E3AA5B', '--ok': '#7FCB9C', '--bad': '#F0826F', '--line-soft': '#1C1C1A', '--fg-disabled': '#7E7B75',
};

describe('the v5 token sheet (§2.1)', () => {
  it('has the exact values', () => {
    for (const [k, v] of Object.entries(V5)) expect(get(k), k).toBe(v);
    expect(get('--tungsten-soft')).toBe('rgb(227 170 91 / .14)');
    expect(get('--chip-on-art')).toBe('rgb(6 6 6 / .80)');
  });

  it('maps the roles', () => {
    const roles: Record<string, string> = { '--page': '--carbon-2', '--sunken': '--carbon-1', '--media': '--carbon-1', '--surface': '--carbon-3', '--field': '--carbon-4', '--raised': '--carbon-5', '--line': '--carbon-6', '--line-strong': '--carbon-7', '--line-field': '--carbon-8', '--fg': '--paper', '--fg-body': '--carbon-11', '--fg-muted': '--carbon-10', '--fg-faint': '--carbon-9', '--on-paper': '--carbon-2' };
    for (const [role, base] of Object.entries(roles)) expect(get(role), role).toBe(get(base));
  });

  it('has §4: space, radii, elevation, density and motion', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => get(`--s${i}`))).toEqual(['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px', '96px', '128px']);
    expect(['--r-0', '--r-xs', '--r-sm', '--r-media', '--r-md', '--r-lg', '--r-pill'].map((n) => get(n))).toEqual(['0', '2px', '2px', '2px', '8px', '12px', '999px']);
    expect(get('--shadow-overlay')).toContain('0 24px 64px -16px');
    expect(get('--shadow-float')).toContain('0 16px 40px -16px');
    expect([get('--control-h'), get('--control-h-sm'), get('--row-h'), get('--body-fs'), get('--body-lh')]).toEqual(['44px', '34px', '48px', '15px', '24px']);
    expect(sheet).toMatch(/\[data-density='compact'\] \{ --control-h: 34px;[^}]*--body-fs: 13\.5px; --body-lh: 20px;/);
    expect([get('--t-fast'), get('--t'), get('--t-slow'), get('--t-media')]).toEqual(['120ms', '200ms', '320ms', '480ms']);
    expect(get('--ease-std')).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('sets the three faces of §3.1, with system fallbacks for content in Arabic (the website is English-only)', () => {
    expect(get('--font-ui')).toMatch(/^var\(--font-plex-sans/);
    expect(get('--font-title')).toMatch(/^var\(--font-newsreader/);
    expect(get('--font-mono')).toMatch(/^var\(--font-plex-mono/);
    for (const n of ['--font-ui', '--font-title']) expect(get(n), n).toMatch(/'Segoe UI'|'Times New Roman'/);
    expect(get('--font-ui')).toContain('Geeza Pro');
    expect(get('--font-ui')).toContain('Noto Sans Arabic');
    expect(sheet).not.toMatch(/--font-inter|--font-plex-arabic|--font-markazi|font-ui-ar|font-title-ar|\[dir=.rtl/);
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

describe('contrast (§2.2), measured from the sheet', () => {
  const at = (n: number, need: number) => expect(n).toBeGreaterThanOrEqual(need);
  it('text on the grounds', () => {
    for (const bg of ['--page', '--surface', '--field', '--raised', '--gray-canvas', '--carbon-0']) at(ratio('--fg', bg), 4.5);
    for (const bg of ['--page', '--raised']) { at(ratio('--fg-body', bg), 7); at(ratio('--fg-muted', bg), 4.5); }
    for (const bg of ['--page', '--surface', '--field', '--raised']) at(ratio('--fg-faint', bg), 4.5);
    expect(ratio('--fg', '--page')).toBeCloseTo(17.28, 1);
    expect(ratio('--fg-faint', '--raised')).toBeCloseTo(4.81, 1);
  });
  it('boundaries, tungsten, status and the primary', () => {
    for (const bg of ['--page', '--field']) at(ratio('--line-field', bg), 3);
    for (const bg of ['--page', '--raised']) at(ratio('--tungsten', bg), 4.5);
    at(contrast(solid('--tungsten'), over(rgb('--tungsten-soft'), solid('--page'))), 4.5);
    at(ratio('--ok', '--page'), 4.5); at(ratio('--bad', '--page'), 4.5);
    at(ratio('--on-paper', '--paper'), 4.5);
    // disabled text is exempt, but kept ≥ 3 by rule (§2.2)
    at(ratio('--fg-disabled', '--page'), 3);
  });
  it('the focus ring: paper vs the ground, and the black band on art', () => {
    for (const bg of ['--page', '--surface', '--field', '--raised']) at(ratio('--paper', bg), 3);
    at(contrast(solid('--paper'), [0, 0, 0]), 3);
    at(contrast([0, 0, 0], [255, 255, 255]), 3);
  });
  it('text on the chip over pure white art', () => {
    at(contrast(solid('--fg'), over(rgb('--chip-on-art'), [255, 255, 255])), 4.5);
  });
});
