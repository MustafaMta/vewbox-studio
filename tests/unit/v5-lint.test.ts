import { describe, expect, it } from 'vitest';
import { isViolet, lintPaths, lintText } from '../../scripts/v5-lint.mjs';

/** docs/DESIGN-SYSTEM-V5.md §11.5 gate 2: scripts/v5-lint.mjs is v4's lint plus the v5 refusals. */
type Finding = { rule: string; line: number };
const rules = (file: string, text: string) => (lintText(file, text) as Finding[]).map((f) => f.rule);
const C = 'src/app/styles/pages/film.css';
const X = 'src/components/x/Thing.tsx';

describe('v5-lint refuses', () => {
  it.each([
    ['violet', C, '.x { color: #8b7ff0; }'],
    ['violet', C, '.x { background: rgb(108 95 224 / .4); }'],
    ['violet', X, '<span className="text-violet-300" />'],
    ['violet', C, '.x { color: var(--iris-400); }'],
    ['violet', 'src/app/styles/tokens.css', ':root { --accent: #a99ff5; }'],
    ['serif', C, '.btn-hero { font-family: var(--font-title); }'],
    ['serif', C, '[role="tab"] { font: 500 18px/1 var(--font-title); }'],
    ['serif', X, '<button className="t-card px-3">Open</button>'],
    ['serif', X, '<label className="font-title">Name</label>'],
    ['caps', C, '.k { font-variant: small-caps; }'],
    ['caps', X, '<span className="capitalize" />'],
    ['shouting', X, '<span className="uppercase" />'],
    ['content', X, '<p className="lead">أبو سلام</p>'],
    ['content', X, '<b lang="ar">أبو سلام</b>'],
    ['rtl', C, "html[dir='rtl'] .x { text-align: right; }"],
    ['rtl', X, '<div className="rtl:space-x-reverse" />'],
    ['rtl', X, '<div dir="rtl" />'],
    ['engine', X, '<p>Transcribed by Whisper</p>'],
    ['focus', C, '.x:focus-visible { outline: none; }'],
    ['focus', C, '.x:focus-visible { box-shadow: 0 0 0 2px var(--paper); }'],
    ['focus', X, '<a className="outline-none" />'],
    ['focus', X, '<button className="focus-visible:ring-2" />'],
    ['strip', C, '.shelf { scrollbar-width: none; }'],
    ['strip', C, '.scrolls { mask-image: none; }'],
    ['strip', C, '.x { color: red !important; }'],
    ['strip', C, '@layer base { .x { color: var(--fg); } }'],
    ['strip', X, '<div className="flex [scrollbar-width:none]" />'],
    ['floor', C, '.x { font-size: 11px; }'],
    ['floor', C, '.x { font: 500 10px/14px var(--font-ui); }'],
    ['floor', X, '<span className="text-[11px]" />'],
  ])('%s in %s: %s', (rule, file, text) => {
    expect(rules(file, text)).toContain(rule);
  });
});

describe('v5-lint accepts', () => {
  it.each([
    [C, '.x { color: var(--paper); font-size: 12px; line-height: 16px; }'],
    [C, '.title { font-family: var(--font-title); }'],
    [C, '.btn { font: 500 14px/1 var(--font-ui); }'],
    [X, '<p className="content-text" dir="auto">أبو سلام</p>'],
    [X, '<span className="content-text t-card" dir="auto">أبو سلام</span>'],
    [X, '<h1 className="t-page">Characters</h1>'],
    [X, '<span className="text-[12.5px] text-faint" />'],
    [C, '.x:focus-visible { outline-offset: 4px; }'],
    [C, '.x { outline: none; } /* v5-lint: allow focus — the field row draws the ring (base.css) */'],
    ['src/app/styles/base.css', '@layer base { .scrolls { scrollbar-width: thin !important; } }'],
    ['src/app/styles/tokens.css', ':root { --accent: var(--paper); --iris-400: var(--paper); }'],
  ])('%s: %s', (file, text) => {
    expect(rules(file, text)).toEqual([]);
  });
});

describe('isViolet', () => {
  it('knows violet from paper, tungsten and the carbon ladder', () => {
    for (const v of ['#6c5fe0', '#8B7BF8', '#4A3AD0', 'rgb(169 159 245 / 0.12)', '#a99ff5']) expect(isViolet(v), v).toBe(true);
    for (const v of ['#F3EFE8', '#E3AA5B', '#0A0A09', '#72706A', '#7FCB9C', '#F0826F', '#000', '#FFFFFF', '#FF6FAE']) expect(isViolet(v), v).toBe(false);
  });
});

describe('the files DS-1 owns', () => {
  it('pass the v5 lint', () => {
    const found = lintPaths(['src/app/styles/tokens.css', 'src/app/styles/base.css', 'src/app/styles/type.css', 'src/app/fonts.ts', 'src/app/layout.tsx', 'src/lib/format.ts']) as Array<Finding & { file: string; text: string }>;
    expect(found.map((f) => `${f.file}:${f.line} ${f.rule} ${f.text}`)).toEqual([]);
  });
});
