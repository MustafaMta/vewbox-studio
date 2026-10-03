import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYS, T } from '@/lib/copy';

/** The website is English-only (docs/DESIGN-SYSTEM-V5.md §9). src/lib/copy.ts is the temporary English copy module
 *  left of the v4 dictionaries: no locale, no second language, no keys nobody uses. Page packages write new copy
 *  inline and delete the keys of the code they rewrite; this test fails on a key nothing uses, so they cannot forget. */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, '/');
const FILES = walk('src').filter((f) => rel(f) !== 'src/lib/copy.ts');
const CODE = FILES.filter((f) => !f.endsWith('.css'));
const SOURCE = CODE.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Prefixes of keys built at runtime: `` T.dyn(`stage.${x}`) ``, `` T(`cast.start.${s}`) ``, `'kind.' + k`. */
const DYNAMIC = [...new Set([
  ...[...SOURCE.matchAll(/`([\w.]+\.)\$\{/g)].map((m) => m[1]),
  ...[...SOURCE.matchAll(/['"]([\w.]+\.)['"]\s*\+/g)].map((m) => m[1]),
])];
const KEYSET = new Set<string>(KEYS);

describe('the English copy module', () => {
  it('has no key nothing uses (a page package deletes the keys of the code it rewrites)', () => {
    const unused = KEYS.filter((k) => !new RegExp(`['"\`]${esc(k)}['"\`]`).test(SOURCE) && !DYNAMIC.some((p) => k.startsWith(p)));
    expect(unused).toEqual([]);
  });

  it('has every key the source looks up', () => {
    const used = new Set<string>();
    for (const m of SOURCE.matchAll(/\bT(?:\.f|\.p)?\(\s*'(\w[\w ]*(?:\.[\w ]+)+)'/g)) used.add(m[1]);
    const missing = [...used].filter((k) => !KEYSET.has(k));
    expect(missing).toEqual([]);
    // a runtime prefix that names no key at all is a typo
    const T_DYN = [...SOURCE.matchAll(/\bT(?:\.dyn)?\(\s*`([\w.]+\.)\$\{/g)].map((m) => m[1]);
    expect([...new Set(T_DYN)].filter((p) => !KEYS.some((k) => k.startsWith(p)))).toEqual([]);
  });

  it('is English: no letter of another script in any string (Arabic film content is data, not interface copy)', () => {
    const foreign = KEYS.filter((k) => /[^\p{Script=Latin}\P{L}]/u.test(T(k)));
    expect(foreign).toEqual([]);
    expect(KEYS.filter((k) => !T(k).trim())).toEqual([]);
  });

  it('has no locale: one string per key, a plain function, counted phrases in English', () => {
    expect(Object.keys(T).sort()).toEqual(['dyn', 'f', 'p']);
    expect(T.p('shell.palette.count', 1)).toBe('1 result');
    expect(T.p('shell.palette.count', 3)).toBe('3 results');
    expect(T.dyn('stage.NOT_A_STAGE')).toBe('Not a stage');
  });
});

describe('no interface-language machinery is left in the website', () => {
  // DS-1 owns these and removes their remaining language rules in the same change set (docs/REDESIGN-2026-10-03.md);
  // the two TEMPORARY shims exist only for DS-1's layout.tsx and format.ts and go when DS-1's versions are merged
  const DS1 = new Set(['src/app/styles/tokens.css', 'src/app/styles/base.css', 'src/app/styles/type.css', 'src/app/fonts.ts', 'src/app/layout.tsx', 'src/lib/format.ts', 'src/components/ui/locale.tsx', 'src/lib/i18n.ts']);
  const files = FILES.filter((f) => !DS1.has(rel(f)));
  const hits = (re: RegExp) => files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => [rel(f), i + 1, l] as const).filter(([, , l]) => re.test(l)).map(([f, i, l]) => `${f}:${i} ${l.trim().slice(0, 120)}`));

  it('no language setting, locale state or locale branch', () => {
    expect(hits(/\buiLanguage\b|\bT\.locale\b|\buseLocale\b|\bLocaleProvider\b|['"]ar-IQ|documentElement\.(?:dir|lang)\s*=|\bhtml\.(?:dir|lang)\s*=/)).toEqual([]);
  });

  it('no RTL-only interface rules (Tailwind rtl: variants, [dir=rtl] / :dir(rtl) selectors, [lang=ar] interface styling)', () => {
    expect(hits(/(?<![\w-])rtl:[\w[]|\[dir=['"]?rtl|:dir\(rtl\)|\[lang[|^]?=['"]?ar/)).toEqual([]);
  });

  it('only the temporary shims still name the old modules', () => {
    const importers = CODE.filter((f) => /from '@\/lib\/i18n'|from '@\/components\/ui\/locale'/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    // src/lib/format.ts (DS-1) and src/app/layout.tsx (DS-1) until their rewrite lands, and the shims; nothing else
    expect(importers.filter((f) => !DS1.has(f))).toEqual([]);
  });
});
