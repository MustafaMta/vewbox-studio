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
  // /shows (P1a): the lead is the empty hint
  'empty.shows.hint',
  // /shorts (P1b): the lead is the empty hint
  'empty.shorts.hint',
  // /music-videos (P1c): the lead is the empty hint
  'empty.musicVideos.hint',
  // /locations (P2): the lead is the empty hint
  'loc.libraryLead',
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

const KEY_CALL = /\bT(?:\.f|\.p|\.dyn)?\(\s*'([^']+)'/g;
const keysIn = (s: string) => [...s.matchAll(KEY_CALL)].map((m) => m[1]).filter((k) => (KEYS as string[]).includes(k)) as Key[];

/** Leads and hints used in one file. */
function scan(src: string): { leads: Key[]; hints: Key[]; all: Key[] } {
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
    if (close > 0) hints.push(...keysIn(src.slice(open.end, close)));
  }
  const all = keysIn(src);
  hints.push(...all.filter((k) => /^empty\..+\.hint$/.test(k)));
  return { leads: leads.filter((k) => (KEYS as string[]).includes(k)), hints, all };
}

const sameWords = (a: Key, b: Key) => T(a).trim() === T(b).trim();

/** The keys that repeat a lead, over every file given. */
function findDuplicates(files: ReadonlyArray<{ file: string; src: string }>): string[] {
  const scans = files.map((f) => ({ ...f, ...scan(f.src) }));
  const leads = new Set(scans.flatMap((s) => s.leads));
  const found = new Set<string>();
  // 1. a hint that says what a lead says
  for (const s of scans) for (const h of s.hints) for (const l of leads) if (sameWords(h, l)) found.add(h);
  // 2. a file that renders its lead's words twice
  for (const s of scans) for (const l of s.leads) if (s.all.filter((k) => sameWords(k, l)).length > 1) found.add(l);
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
    const old = `<PageHeader title={T('nav.shows')} subtitle={T('empty.shows.hint')} />{n === 0 && <Empty title={T('empty.shows')} hint={T('empty.shows.hint')} />}`;
    expect(findDuplicates([{ file: 'old.tsx', src: old }])).toEqual(['empty.shows.hint']);
    const twice = `<PageHeader title={T('nav.locations')} subtitle={T('loc.libraryLead')} action={x} /><p>{T('loc.libraryLead')}</p>`;
    expect(findDuplicates([{ file: 'twice.tsx', src: twice }])).toEqual(['loc.libraryLead']);
    const v4 = `<PageHeader title={T('kit.page.title')} subtitle={T('kit.spec.lead')} /><PageEmpty primary={p}>{T('kit.spec.empty.page')}</PageEmpty>`;
    expect(findDuplicates([{ file: 'v4.tsx', src: v4 }])).toEqual([]);
  });
});
