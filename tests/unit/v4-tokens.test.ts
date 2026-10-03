import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTokens, resolver, table } from '../../scripts/v4-contrast.mjs';

/** docs/DESIGN-SYSTEM-V4.md §2 (package F1): the token sheet. Every v3 name keeps resolving (components and Tailwind
 *  utilities written against v3 keep working until Q1), the v4 roles exist, and every contrast pair of §2.6 passes
 *  what it needs when measured from the sheet itself (scripts/v4-contrast.mjs). */

const sheet = fs.readFileSync(path.join('src', 'app', 'styles', 'tokens.css'), 'utf8');
const tokens = readTokens(sheet);
const get = resolver(tokens);
const theme = (sheet.match(/@theme inline \{([\s\S]*?)\n\}/)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
const themeKeys = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// the :root names and @theme keys of the v3 sheet (src/app/globals.css before the v4 split)
const V3_ROOT = '--ink-1000 --ink-975 --ink-950 --ink-900 --ink-850 --ink-800 --ink-700 --ink-600 --ink-550 --ink-500 --ink-400 --ink-300 --ink-200 --ink-100 --iris-600 --iris-500 --iris-400 --iris-300 --violet-700 --violet-600 --violet-500 --violet-400 --violet-300 --bg --sunken --media --surface --raised --raised-2 --input --line-soft --line --line-strong --line-field --fg --fg-body --fg-muted --fg-faint --fg-disabled --fg-on-art --fg-on-art-muted --primary --primary-hover --primary-active --on-primary --ivory --ivory-hover --on-ivory --accent --accent-strong --accent-soft --accent-line --ring --ok --ok-soft --warn --warn-soft --bad --bad-soft --info --info-soft --gold --gold-soft --gold-line --gold-text --teal --teal-soft --teal-line --edge --edge-lit --edge-wait --edge-bad --overlay --shadow-1 --shadow-2 --shadow-3 --halo-violet --halo-gold --halo-teal --r-1 --r-2 --r-3 --r-4 --r-media --r-pill --t-fast --t --t-slow --t-media --t-travel --ease --ease-in --ease-inout --sticky-top --gutter --section'.split(' ');
const V3_THEME = '--color-ink-1000 --color-ink-975 --color-ink-950 --color-ink-900 --color-ink-850 --color-ink-800 --color-ink-700 --color-ink-600 --color-ink-550 --color-ink-500 --color-ink-400 --color-ink-300 --color-ink-200 --color-ink-100 --color-iris-600 --color-iris-500 --color-iris-400 --color-iris-300 --color-violet-700 --color-violet-600 --color-violet-500 --color-violet-400 --color-violet-300 --color-bg --color-surface --color-raised --color-raised-2 --color-input --color-elev --color-surface-2 --color-surface-3 --color-line --color-line-strong --color-line-field --color-fg --color-body --color-muted --color-faint --color-disabled --color-primary --color-on-primary --color-ivory --color-on-ivory --color-accent --color-accent-strong --color-accent-fg --color-accent-soft --color-accent-text --color-ok --color-ok-soft --color-warn --color-warn-soft --color-bad --color-bad-soft --color-info --color-info-soft --color-media --color-edge --color-gold --color-gold-soft --color-teal --color-teal-soft --color-line-soft --color-sunken --color-gold-text --color-on-art --color-on-art-muted --font-sans --font-display --radius-1 --radius-2 --radius-3 --radius-4 --radius-media --shadow-1 --shadow-2 --shadow-3 --text-sm --text-sm--line-height --text-xs --text-xs--line-height'.split(' ');

describe('the v4 token sheet', () => {
  it('keeps every v3 token resolving', () => {
    expect(V3_ROOT.filter((n) => get(n) === undefined)).toEqual([]);
  });

  it('keeps every v3 Tailwind theme key, so existing utilities keep working', () => {
    expect(V3_THEME.filter((k) => !themeKeys.has(k))).toEqual([]);
  });

  it('has the §2.2 additions and the v4 roles', () => {
    for (const k of ['--color-ink-350', '--color-gray-1000', '--color-gray-960', '--color-gray-850', '--color-gray-500', '--color-frame', '--color-canvas', '--color-surround', '--color-clip', '--color-clip-edge', '--color-nav', '--color-on-art', '--color-chip-on-art', '--color-art-ph', '--radius-precise', '--shadow-float', '--font-title', '--font-mono', '--breakpoint-3xl']) expect(themeKeys.has(k), k).toBe(true);
    for (const n of ['--page', '--frame', '--canvas', '--surround', '--clip', '--clip-edge', '--fg-nav', '--art', '--art-ph', '--art-edge', '--wash-end', '--chip-on-art', '--scrim-bottom', '--scrim-start', '--ring-art-inner', '--ring-art-outer', '--select-precise', '--shadow-float', '--r-precise', '--t-exit-fast', '--t-exit', '--t-exit-slow', '--t-lights', '--t-idle', '--ease-standard', '--font-ui', '--font-title', '--font-mono', '--title-weight', '--title-tracking', '--control-h', '--row-h', '--body-fs', '--z-toast']) expect(get(n), n).toBeDefined();
  });

  // DS-1 (docs/DESIGN-SYSTEM-V5.md §2.1): the v4 names now resolve to the v5 values (tests/unit/v5-tokens.test.ts)
  it('resolves the v4 names to the v5 values', () => {
    expect(get('--fg-nav')).toBe('#ADA9A1');
    expect(get('--ease-in')).toBe('cubic-bezier(0.3, 0, 0.8, 0.15)');
    expect(get('--clip-edge')).toBe('#8A8A8A');
    expect(get('--canvas')).toBe('#0B0B0B');
    expect(get('--font-title')).toContain('--font-newsreader');
  });

  it('declares the rooms, density, More contrast, scroll-padding and the art wash (§2.1, §2.3)', () => {
    for (const s of ["[data-room='lobby']", "[data-room='cutting']", "[data-room='theatre']", "[data-density='compact']", "html[data-contrast='more']", '@media (prefers-contrast: more)', 'scroll-padding-block-start', '@property --art', '.hero::before']) expect(sheet, s).toContain(s);
  });

  it('passes every contrast pair of §2.6 that has a threshold', () => {
    const { rows, missing } = table(get) as { rows: Array<{ pair: string; ratio: string; pass: boolean | null }>; missing: string[] };
    expect(missing).toEqual([]);
    expect(rows).toHaveLength(23);
    expect(rows.filter((r) => r.pass === false).map((r) => `${r.pair}: ${r.ratio}`)).toEqual([]);
  });
});

describe('reduced motion', () => {
  it('stops transitions and loops under the OS preference and the studio setting', () => {
    const base = fs.readFileSync(path.join('src', 'app', 'styles', 'base.css'), 'utf8');
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*transition-duration: 0\.01ms !important/);
    expect(base).toMatch(/html\[data-motion='reduce'\] \*[^{]*\{[^}]*animation-iteration-count: 1 !important/);
  });
});
