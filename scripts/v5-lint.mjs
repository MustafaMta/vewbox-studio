// THE VIEWFINDER LINT (docs/DESIGN-SYSTEM-V5.md §1.3, §5.0, §5.6, §11.3 rule 2, §11.5 gate 2) — the v4 lint
// (scripts/v4-lint.mjs: blur, dialog, gradient, glow, shouting, raw-colour, physical, engine) plus what v5 refuses:
//
//   node scripts/v5-lint.mjs [path ...]        (default: src/components src/app src/lib)   exit 1 on a finding
//   node scripts/v5-lint.mjs --summary [path]  counts per rule and file, exit 0 (a baseline, not a gate)
//
// A line may opt out of one rule with a comment `v5-lint: allow <rule> — <reason>` (or v4's `v4-lint: allow …`);
// the reviewer reads the reason. The v5 rules:
//   violet    a violet colour value anywhere (tokens.css included), or a violet/iris token or utility outside the
//             token sheet's alias block: the colour of every AI tool of 2024–26 is not in the product (§1.3)
//   serif     the title voice on a control: a CSS rule for buttons, fields, labels, tabs, chips or segments that sets
//             --font-title / a serif, or a title class (.t-*, font-title, font-serif) on <button>, <input>,
//             <select>, <label> or an element with a control role (§1.2 principle 2, §3.2)
//   caps      small caps, capitalize, font-variant-caps (uppercase and tracking are v4's "shouting") (§3.5)
//   content   text in another script written into the markup without `dir="auto"` on its element: user-authored
//             content is rendered with class="content-text" dir="auto" (base.css), the one content rule
//   rtl       right-to-left styling or markup for the interface: [dir=rtl], :dir(rtl), Tailwind rtl:, dir="rtl"
//             (the interface is English-only and LTR since 2026-10-03; content takes its own direction by
//             dir="auto" and .content-text, base.css), and direction: rtl in a sheet
//   engine    v4's list plus Ollama, Whisper and FFmpeg, in user-facing strings
//   focus     `outline: none` (or 0, or outline-style: none) on anything, a :focus rule that draws with box-shadow,
//             and Tailwind outline-none / focus:ring-* utilities: focus is the one outline ring of base.css (§5.0)
//   strip     outside styles/base.css: `@layer base`, `!important`, a strip selector (.scrolls, [data-strip]), or a
//             scrollbar / mask setting — the strip affordance (QA F3) and the focus ring (QA F1) live in base.css
//             as important rules of the first layer, and no other sheet may compete with them; in components,
//             scrollbar-hiding and mask utilities
//   floor     text under 12 px: a CSS font size, or a Tailwind text-[Npx] with N < 12 (§3.2)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_NAMES, filesUnder, lintText as lintV4 } from './v4-lint.mjs';

export const V5_ENGINE_NAMES = [...ENGINE_NAMES, 'Ollama', 'Whisper', 'FFmpeg'];
const ENGINE_RE = new RegExp(`\\b(${V5_ENGINE_NAMES.join('|')})`, 'i');

const isCss = (f) => f.endsWith('.css');
const isDictionary = (f) => /[\\/]lib[\\/]i18n([\\/]|\.ts$)/.test(f);
const isTokens = (f) => /[\\/]styles[\\/]tokens\.css$/.test(f);
const isBase = (f) => /[\\/]styles[\\/]base\.css$/.test(f);

// ---- colour: is a value violet? (hue 245°–320°, saturated, neither near-black nor near-white) ------------------
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3 || h.length === 4) h = h.slice(0, 3).replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
export function isViolet(value) {
  const v = String(value).trim();
  let rgb = null;
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) rgb = hexToRgb(hex[1]);
  const fn = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (fn) rgb = [+fn[1], +fn[2], +fn[3]];
  if (!rgb) return false;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08 || l < 0.12 || l > 0.96) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.2) return false;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 245 && h <= 320;
}
const COLOUR_VALUES = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

// ---- helpers -------------------------------------------------------------------------------------------------
const TITLE_CLASS = /(?<![\w-])(t-(?:index|marquee|hero|hero-sm|page|card|card-lg|card-sm|quote|credit)|page-title|display-xl|font-title|font-serif)(?![\w-])/;
const CONTROL_SELECTOR = /(^|[\s,>+~(])(button|input|select|textarea|label|summary)\b|\.(btn|ibtn|chip|seg|tab|tabs|field|input|select|menu-item|mi|pick|search)\b|\[role=['"]?(tab|button|menuitem|option|radio|checkbox|switch)/;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** CSS rules (innermost `selector { body }`) with the line of their selector. Comments must already be blanked. */
function cssRules(css) {
  const out = [];
  const re = /([^{}]*)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim(); const start = m.index + m[1].length - m[1].trimStart().length;
    out.push({ sel, body: m[2], line: css.slice(0, Math.max(0, m.index + (m[1].length - m[1].trimStart().length))).split('\n').length, bodyLine: css.slice(0, m.index + m[1].length + 1).split('\n').length, start });
  }
  return out;
}
/** The text with comments replaced by spaces (newlines kept, so offsets keep their lines). */
function blankComments(text, css) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  if (!css) t = t.split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  return t;
}

/** v5 findings for one file's text: [{ rule, line, text }] (the v4 rules included). */
export function lintText(file, text) {
  const lines = text.split(/\r?\n/);
  const allowed = (rule, i) => new RegExp(`v[45]-lint:\\s*allow\\s+${rule}\\b`).test(lines[i] ?? '');
  const out = [];
  const add = (rule, i) => { if (!allowed(rule, i)) out.push({ rule, line: i + 1, text: (lines[i] ?? '').trim().slice(0, 160) }); };
  // v4's rules, honouring a v5 opt-out as well
  for (const f of lintV4(file, text)) if (!allowed(f.rule, f.line - 1)) out.push(f);

  const css = isCss(file); const dict = isDictionary(file);
  const clean = blankComments(text, css);
  const cleanLines = clean.split(/\r?\n/);

  if (dict) {
    cleanLines.forEach((l, i) => {
      const strings = [...l.matchAll(/'((?:[^'\\]|\\.)*)'(\s*:)?/g)].filter((m) => !m[2]).map((m) => m[1]).join(' ');
      if (ENGINE_RE.test(strings) && !new RegExp(`\\b(${ENGINE_NAMES.join('|')})`, 'i').test(strings)) add('engine', i);
    });
    return dedupe(out);
  }

  cleanLines.forEach((l, i) => {
    // violet: values everywhere; names and utilities outside the token sheet
    for (const m of l.match(COLOUR_VALUES) ?? []) if (isViolet(m)) { add('violet', i); break; }
    if (!isTokens(file) && /--(?:iris|violet)-\d|(?<![\w-])(?:[\w-]+:)?(?:text|bg|border|ring|outline|from|via|to|fill|stroke|decoration|shadow|accent|caret)-(?:iris|violet|purple|indigo|fuchsia)-\d/.test(l)) add('violet', i);
    // caps
    if (css ? /font-variant(?:-caps)?\s*:\s*[^;]*small-caps|text-transform\s*:\s*capitalize/.test(l) : /(?<![\w-])(?:[\w-]+:)?(small-caps|capitalize)(?![\w-])/.test(l)) add('caps', i);
    // rtl
    if (/\[dir=['"]?rtl['"]?\]|:dir\(rtl\)|direction\s*:\s*rtl|(?<![\w-])rtl:[\w[-]|\bdir=["'{`]?rtl\b|dir:\s*['"]rtl['"]/.test(l)) add('rtl', i);
    // floor
    // (a font shorthand's first px value is its size: `font: 500 11px/14px …`)
    if (css) { for (const m of l.matchAll(/(?:font-size\s*:\s*|(?:^|[\s;{])font\s*:[^;{}]*?(?<![\d.\/]))(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) < 12) { add('floor', i); break; } }
    else for (const m of l.matchAll(/(?<![\w-])(?:[\w-]+:)?text-\[(\d+(?:\.\d+)?)px\]/g)) if (Number(m[1]) < 12) { add('floor', i); break; }
    // focus
    if (css ? /(?:^|[\s;{])outline\s*:\s*(?:none|0)\b|outline-style\s*:\s*none/.test(l) : /(?<![\w-])(?:[\w-]+:)*(outline-none|outline-0|focus(?:-visible|-within)?:ring(?:-[\w[\]/.-]+)?)(?![\w-])/.test(l)) add('focus', i);
    // strip (components)
    if (!css && /\[(?:scrollbar-width|mask-image|-webkit-mask-image):|(?<![\w-])(scrollbar-none|no-scrollbar|scrollbar-hide|mask-\[)/.test(l)) add('strip', i);
    // engine in JSX text (v4 covers its own list; v5 adds names)
    if (!css) for (const m of l.matchAll(/>([^<>{}]+)</g)) if (ENGINE_RE.test(m[1])) { add('engine', i); break; }
    // content: text in another script needs its own direction (class="content-text" dir="auto")
    if (!css && /\.tsx$/.test(file)) {
      for (const m of l.matchAll(/>([^<>{}]+)</g)) if (ARABIC.test(m[1])) {
        const before = l.slice(0, m.index + 1); const tag = before.slice(before.lastIndexOf('<'));
        if (!/\bdir=["'{]?auto/.test(tag)) { add('content', i); break; }
      }
    }
  });

  if (css) {
    for (const r of cssRules(clean)) {
      const selLine = r.line - 1;
      // serif on a control
      if (CONTROL_SELECTOR.test(r.sel) && /font(?:-family)?\s*:[^;]*(--font-title|\bserif\b)/.test(r.body) && !/sans-serif/.test(r.body.match(/font(?:-family)?\s*:[^;]*/)?.[0] ?? '')) add('serif', selLine);
      // focus drawn with box-shadow
      if (/:focus(?:-visible|-within)?\b/.test(r.sel) && /box-shadow\s*:/.test(r.body) && !/box-shadow\s*:\s*none/.test(r.body) && !isBase(file)) add('focus', selLine);
      // the strip contract and base's important layer
      if (!isBase(file)) {
        if (/\.scrolls\b|\[data-strip\]/.test(r.sel)) add('strip', selLine);
        const bodyLines = r.body.split('\n');
        bodyLines.forEach((bl, k) => { if (/scrollbar-(?:width|color)\s*:|(?:-webkit-)?mask(?:-image)?\s*:|!important/.test(bl)) add('strip', r.bodyLine - 1 + k); });
      }
    }
    if (!isBase(file)) {
      cleanLines.forEach((l, i) => { if (/@layer\s+base\b|::-webkit-scrollbar/.test(l)) add('strip', i); });
    }
  } else {
    // serif on a control, in markup: a title class on a control element on the same line
    cleanLines.forEach((l, i) => {
      for (const m of l.matchAll(/<(button|input|select|label|summary|[A-Za-z]+(?=[^>]*\brole=["'](?:tab|button|menuitem|option|radio|checkbox)["']))\b[^>]*>/g)) {
        const cls = m[0].match(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
        if (cls && TITLE_CLASS.test(cls[1] ?? cls[2] ?? cls[3] ?? '')) { add('serif', i); break; }
      }
    });
  }
  return dedupe(out);
}
function dedupe(xs) { const seen = new Set(); return xs.filter((x) => { const k = `${x.rule}:${x.line}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line); }

export function lintPaths(paths) {
  return paths.flatMap(filesUnder).flatMap((f) => lintText(f, fs.readFileSync(f, 'utf8')).map((x) => ({ file: path.relative(process.cwd(), f).replace(/\\/g, '/'), ...x })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const summary = args.includes('--summary');
  const paths = args.filter((a) => !a.startsWith('--'));
  const found = lintPaths(paths.length ? paths : ['src/components', 'src/app', 'src/lib']);
  if (summary) {
    const by = {}; for (const f of found) { (by[f.rule] ??= {}); by[f.rule][f.file] = (by[f.rule][f.file] ?? 0) + 1; }
    for (const [rule, files] of Object.entries(by)) { console.log(`${rule}: ${Object.values(files).reduce((a, b) => a + b, 0)} in ${Object.keys(files).length} files`); for (const [f, n] of Object.entries(files)) console.log(`    ${n}  ${f}`); }
    console.log(found.length ? `${found.length} findings (baseline)` : 'clean');
  } else {
    for (const f of found) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.text}`);
    console.log(found.length ? `\n${found.length} finding(s) — docs/DESIGN-SYSTEM-V5.md §1.3, §5.0, §5.6, §11.5` : 'v5-lint: clean');
    process.exitCode = found.length ? 1 : 0;
  }
}
