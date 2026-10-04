import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYS, T, type Key } from '@/lib/copy';

/** V4-01 (docs/DESIGN-SYSTEM-V4.md §0.1, §5.16): an empty page is a title card, one sentence and one primary — and
 *  that sentence is never the page's lead again. /shows, /shorts, /music-videos and /locations were the same page:
 *  a title, "No X yet.", then a hint that repeated the lead word for word.
 *
 *  The rule, over the source and the dictionary:
 *   1. no empty-state hint may say what a page lead says (in English or in Arabic). A hint is the `hint` of <Empty>,
 *      the sentence of <PageEmpty> or <SectionEmpty>, or any `empty.*.hint` key; a lead is the `subtitle` of
 *      <PageHeader> or a `.lead` paragraph;
 *   2. no file may render its lead's words twice.
 *  A finding is the key that repeats. BASELINE holds the four that exist today: the page package that fixes a page
 *  deletes its line (the test fails on a stale line, so the list only shrinks) — and any new duplicate fails. */

const BASELINE: string[] = [
];

const SOURCES = [path.join('src', 'app', '(app)'), path.join('src', 'components')];
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

/** The attributes of the JSX element that opens at `from` (up to its `>` or `/>` outside braces and strings). */
function openingTag(src: string, from: number): { attrs: string; end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { attrs: src.slice(from, i + 1), end: i + 1, selfClosing: src[i - 1] === '/' };
  }
  return { attrs: src.slice(from), end: src.length, selfClosing: true };
}

/** The words a key stands for: the studio's copy module, or (in the checker's own self-test) a sample dictionary,
 *  so the self-test does not depend on keys the pages have since stopped using. */
interface Dict { has: (k: string) => boolean; text: (k: string) => string }
const COPY_DICT: Dict = { has: (k) => (KEYS as string[]).includes(k), text: (k) => T(k as Key) };

const KEY_CALL = /\bT(?:\.f|\.p|\.dyn)?\(\s*'([^']+)'/g;
const keysIn = (s: string, dict: Dict = COPY_DICT) => [...s.matchAll(KEY_CALL)].map((m) => m[1]).filter((k) => dict.has(k)) as Key[];

/** Leads and hints used in one file. */

function scan(src: string, dict: Dict = COPY_DICT): { leads: Key[]; hints: Key[]; all: Key[] } {
  const leads: Key[] = [];
  const hints: Key[] = [];
  for (const m of src.matchAll(/<PageHeader\b/g)) {
    const { attrs } = openingTag(src, m.index!);
    const sub = attrs.match(/\bsubtitle=\{\s*T\(\s*'([^']+)'\s*\)\s*\}/);
    if (sub) leads.push(sub[1] as Key);
  }
  for (const m of src.matchAll(/className="[^"]*\blead\b[^"]*"[^>]*>\s*\{\s*T\(\s*'([^']+)'\s*\)\s*\}/g)) leads.push(m[1] as Key);
  for (const m of src.matchAll(/<Empty\b/g)) {
    const { attrs } = openingTag(src, m.index!);
    const h = attrs.match(/\bhint=\{\s*T\(\s*'([^']+)'\s*\)\s*\}/);
    if (h) hints.push(h[1] as Key);
  }
  for (const m of src.matchAll(/<(PageEmpty|SectionEmpty)\b/g)) {
    const open = openingTag(src, m.index!);
    if (open.selfClosing) continue;
    const close = src.indexOf(`</${m[1]}>`, open.end);
    if (close > 0) hints.push(...keysIn(src.slice(open.end, close), dict));
  }
  const all = keysIn(src, dict);
  hints.push(...all.filter((k) => /^empty\..+\.hint$/.test(k)));
  return { leads: leads.filter((k) => dict.has(k)), hints, all };
}

const sameWords = (a: string, b: string, dict: Dict = COPY_DICT) => dict.text(a).trim() === dict.text(b).trim();

/** The keys that repeat a lead, over every file given. */
function findDuplicates(files: ReadonlyArray<{ file: string; src: string }>, dict: Dict = COPY_DICT): string[] {
  const scans = files.map((f) => ({ ...f, ...scan(f.src, dict) }));
  const leads = new Set(scans.flatMap((s) => s.leads));
  const found = new Set<string>();
  // 1. a hint that says what a lead says
  for (const s of scans) for (const h of s.hints) for (const l of leads) if (sameWords(h, l, dict)) found.add(h);
  // 2. a file that renders its lead's words twice
  for (const s of scans) for (const l of s.leads) if (s.all.filter((k) => sameWords(k, l, dict)).length > 1) found.add(l);
  return [...found].sort();
}

describe('V4-01 — an empty state never repeats the page lead', () => {
  const files = SOURCES.flatMap(walk).map((file) => ({ file, src: fs.readFileSync(file, 'utf8') }));
  const found = findDuplicates(files);

  it('finds no duplicate outside the baseline', () => {
    expect(found.filter((k) => !BASELINE.includes(k)), 'a new empty hint repeats a page lead: write the empty state its own sentence (§5.16)').toEqual([]);
  });

  it('the baseline only shrinks: a fixed page deletes its line', () => {
    expect(BASELINE.filter((k) => !found.includes(k)), 'this duplicate is gone: delete its line from BASELINE in tests/unit/empty-hint.test.ts').toEqual([]);
  });

  it('catches both forms on a page written the old way, and passes one written the v4 way', () => {
    // a sample dictionary: the pages no longer use these keys, so the real copy module no longer has them
    const SAMPLE: Record<string, string> = { 'nav.shows': 'Shows', 'empty.shows': 'No shows yet', 'empty.shows.hint': 'Seasons and episodes that share one cast.', 'nav.shorts': 'Shorts', 'empty.shorts.hint': 'Single films, each from one line.', 'kit.page.title': 'Kit', 'kit.spec.lead': 'Every component.', 'kit.spec.empty.page': 'Nothing here yet.' };
    const dict: Dict = { has: (k) => k in SAMPLE, text: (k) => SAMPLE[k] ?? k };
    const old = `<PageHeader title={T('nav.shows')} subtitle={T('empty.shows.hint')} />{n === 0 && <Empty title={T('empty.shows')} hint={T('empty.shows.hint')} />}`;
    expect(findDuplicates([{ file: 'old.tsx', src: old }], dict)).toEqual(['empty.shows.hint']);
    const twice = `<PageHeader title={T('nav.shorts')} subtitle={T('empty.shorts.hint')} action={x} /><p>{T('empty.shorts.hint')}</p>`;
    expect(findDuplicates([{ file: 'twice.tsx', src: twice }], dict)).toEqual(['empty.shorts.hint']);
    const v4 = `<PageHeader title={T('kit.page.title')} subtitle={T('kit.spec.lead')} /><PageEmpty primary={p}>{T('kit.spec.empty.page')}</PageEmpty>`;
    expect(findDuplicates([{ file: 'v4.tsx', src: v4 }], dict)).toEqual([]);
  });
});
