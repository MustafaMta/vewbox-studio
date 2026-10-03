// THE CONTRAST TABLE (docs/DESIGN-SYSTEM-V4.md §2.6), measured from the token sheet itself.
//
//   node scripts/v4-contrast.mjs [--tokens src/app/styles/tokens.css] [--out docs/evidence/v4-contrast.json]
//
// Reads the :root tokens of the sheet (resolving var() chains), computes every pair of §2.6 with the WCAG 2.x
// relative-luminance formula — alpha compositing in sRGB for chips and scrims, OKLCH → 8-bit sRGB for the art wash
// and the placeholder, at their worst hue — and checks each against what it needs. Each row also carries the ratio
// §2.6 printed, so the run says whether it reproduces the document. Exit 1 when a row fails or a token is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- colour arithmetic --------------------------------------------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const enc = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** `fg` (with alpha) over an opaque `bg`, composited in sRGB as the browser does, to the 8 bits it displays. */
export const over = ([r, g, b, a = 1], [R, G, B]) => [r, g, b].map((c, i) => Math.round(a * c + (1 - a) * [R, G, B][i]));
/** OKLCH → 8-bit sRGB, as displayed: out-of-gamut channels clipped (as Chromium renders oklch()), then quantised. */
export function oklch(L, C, H) {
  const h = (H * Math.PI) / 180; const a = C * Math.cos(h); const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(enc);
}
export function parseColour(v) {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/i);
  if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
  return null;
}

// ---- the token sheet -----------------------------------------------------------------------------------------------
/** The first top-level `:root { … }` block's custom properties (media queries and room selectors are not read). */
export function readTokens(css) {
  const start = css.search(/(^|\n):root\s*\{/); if (start < 0) return {};
  let i = css.indexOf('{', start) + 1, depth = 1; const from = i;
  while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
  const body = css.slice(from, i - 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
export function resolver(tokens) {
  const get = (name, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`cycle at ${name}`);
    const v = tokens[name]; if (v === undefined) return undefined;
    const m = v.match(/^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/);
    if (m) return get(m[1], new Set([...seen, name])) ?? m[2];
    return v;
  };
  return get;
}

// ---- §2.6 ----------------------------------------------------------------------------------------------------------
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const WASH = { L: 0.2, ph: 0.24, Cmax: 0.045 }; // §2.4: --art = oklch(0.20 min(C,0.045) H), --art-ph = oklch(0.24 …)
const worstHue = (L, fg) => Math.min(...Array.from({ length: 360 }, (_, h) => contrast(fg, oklch(L, WASH.Cmax, h))));

export function table(get) {
  const missing = new Set();
  const c = (name) => { const v = get(name); const p = v && parseColour(v); if (!p) { missing.add(name); return [0, 0, 0, 1]; } return p; };
  const solid = (name) => { const p = c(name); return p.slice(0, 3); };
  const on = (fgName, bgName) => contrast(solid(fgName), solid(bgName));
  // the scrim: its colour and the coverage the hero text block must sit on (the second stop, 0.86)
  const scrim = (get('--scrim-bottom') ?? '').match(/rgba?\([^)]*\)/g)?.map(parseColour) ?? [];
  if (scrim.length < 2) missing.add('--scrim-bottom');
  const scrimAt = (a) => over([...(scrim[0] ?? [0, 0, 0]).slice(0, 3), a], WHITE);
  const chip = over(c('--chip-on-art'), WHITE);
  const rows = [
    { pair: '`--fg` on bg / surface / input / raised-2 / canvas', r: ['--bg', '--surface', '--input', '--raised-2', '--canvas'].map((b) => on('--fg', b)), needs: 4.5, doc: [16.92, 16.07, 15.21, 14.06, 17.04] },
    { pair: '`--fg-body` on bg / raised-2 / canvas', r: ['--bg', '--raised-2', '--canvas'].map((b) => on('--fg-body', b)), needs: 4.5, needsNote: '4.5 (HIG goal 7)', doc: [13.55, 11.25, 13.64], note: 'body ≥ 7 everywhere', goal: 7 },
    { pair: '`--fg-muted` on bg / raised-2', r: ['--bg', '--raised-2'].map((b) => on('--fg-muted', b)), needs: 4.5, doc: [8.01, 6.65] },
    { pair: '`--fg-nav` (new) on bg / raised-2', r: ['--bg', '--raised-2'].map((b) => on('--fg-nav', b)), needs: 4.5, doc: [7.11, 5.9], note: 'dimmer sidebar still AA' },
    { pair: '`--fg-faint` on bg / surface / input / raised-2', r: ['--bg', '--surface', '--input', '--raised-2'].map((b) => on('--fg-faint', b)), needs: 4.5, doc: [5.51, 5.23, 4.95, 4.58], note: 'never on anything lighter than `--raised-2`' },
    { pair: 'iris `--accent` on bg / raised-2 / canvas', r: ['--bg', '--raised-2', '--canvas'].map((b) => on('--accent', b)), needs: 4.5, needsNote: '3 (marks), 4.5 (text)', doc: [8.34, 6.93, 8.4] },
    { pair: '`--ok` / `--warn` / `--bad` on surface', r: ['--ok', '--warn', '--bad'].map((f) => on(f, '--surface')), needs: 4.5, doc: [9.11, 9.73, 7.06] },
    { pair: 'warn text on warn-soft over surface', r: [contrast(solid('--warn'), over(c('--warn-soft'), solid('--surface')))], needs: 4.5, doc: [7.84] },
    { pair: '`--on-primary` on ivory', r: [on('--on-primary', '--primary')], needs: 4.5, doc: [16.92] },
    { pair: '`--line-field` on bg / input / raised-2', r: ['--bg', '--input', '--raised-2'].map((b) => on('--line-field', b)), needs: 3, needsNote: '3 (1.4.11)', doc: [3.77, 3.39, 3.13] },
    { pair: 'Unplayed waveform `--ink-550` on bg / surface', r: ['--bg', '--surface'].map((b) => on('--ink-550', b)), needs: 3, doc: [3.77, 3.58], note: `v3's \`--ink-600\` measured **${on('--ink-600', '--bg').toFixed(2)}**: fails` },
    { pair: 'Played (`--fg`) vs unplayed (`--ink-550`)', r: [on('--fg', '--ink-550')], needs: 3, doc: [4.49] },
    { pair: 'Clip edge `--clip-edge` on canvas / vs clip fill', r: [on('--clip-edge', '--canvas'), on('--clip-edge', '--clip')], needs: 3, doc: [5.7, 4.16], why: '§2.6 was measured with a clip fill of #2a2a2a; §2.1 (and the token) is #262626 (--gray-850), which gives more contrast' },
    { pair: 'Selected outline ivory vs clip fill', r: [on('--select-precise', '--clip')], needs: 3, doc: [12.43], why: '§2.6 was measured with a clip fill of #2a2a2a; §2.1 (and the token) is #262626 (--gray-850), which gives more contrast' },
    { pair: 'Playhead ivory on canvas', r: [on('--primary', '--canvas')], needs: 3, doc: [17.04] },
    { pair: 'Two-colour ring: black outer vs white art / ivory inner vs black', r: [contrast(solid('--ring-art-outer'), WHITE), contrast(solid('--ring-art-inner'), BLACK)], needs: 3, needsNote: '3 (2.4.13)', doc: [21, 18.18], note: `One of the two rings always passes. Iris alone on white art is ${contrast(solid('--ring'), WHITE).toFixed(2)}, which fails.` },
    { pair: 'Chip `--chip-on-art` over pure white art: white text / ivory text', r: [contrast(WHITE, chip), contrast(solid('--fg'), chip)], needs: 4.5, doc: [10.78, 9.33], why: '§2.6 composited without rounding; this measures the 8-bit colour the screen shows', note: `the worst case is white art; over grey art it is ${contrast(WHITE, over(c('--chip-on-art'), [128, 128, 128])).toFixed(1)}` },
    { pair: 'Hero text over `--scrim-*` at 0.86 coverage on pure-white art: fg / body / muted', r: ['--fg', '--fg-body', '--fg-muted'].map((f) => contrast(solid(f), scrimAt(scrim[1]?.[3] ?? 0.86))), needs: 4.5, doc: [11.73, 9.39, 5.55], note: '**Rule:** the hero text block sits where the scrim is ≥ 0.86. On art, use `--fg`/`--fg-body`, never `--fg-faint`.' },
    { pair: 'Same at 0.72 coverage: muted', r: [contrast(solid('--fg-muted'), scrimAt(0.72))], needs: null, doc: [3.3], note: 'fails, so the scrim stops are fixed at 0.92/0.86' },
    { pair: 'Wash at L 0.20, C 0.045, worst hue: fg / body / muted / faint', r: ['--fg', '--fg-body', '--fg-muted', '--fg-faint'].map((f) => worstHue(WASH.L, solid(f))), needs: 4.5, doc: [15.49, 12.4, 7.33, 5.04], why: 'the worst hue (≈ 192°) is outside sRGB at C 0.045; it is clipped per channel, as Chromium renders oklch(), and quantised to 8 bits' },
    { pair: 'Placeholder L 0.24, worst hue: fg / faint', r: ['--fg', '--fg-faint'].map((f) => worstHue(WASH.ph, solid(f))), needs: 4.5, doc: [14.03, 4.57], why: 'as the wash row: the worst hue clipped to sRGB and quantised', note: 'title-card text uses `--fg-faint` or brighter' },
    { pair: 'More contrast: faint→muted on raised-2 / muted→body on raised-2 / field→ink-400 on input', r: [on('--ink-300', '--raised-2'), on('--ink-200', '--raised-2'), on('--ink-400', '--input')], needs: null, doc: [6.65, 11.25, 4.95] },
    { pair: 'Disabled text on raised-2', r: [on('--fg-disabled', '--raised-2')], needs: null, needsNote: 'exempt', doc: [2.49], note: 'Disabled controls always carry their reason as text beside them' },
  ];
  return { rows: rows.map((x) => {
    const pass = x.needs === null ? null : x.r.every((v) => v >= x.needs);
    const reproduces = x.r.length === x.doc.length && x.r.every((v, i) => Math.abs(Number(v.toFixed(2)) - x.doc[i]) <= 0.02);
    return { pair: x.pair, ratio: x.r.map((v) => (v >= 20.995 ? v.toFixed(1) : v.toFixed(2))).join(' / '), needs: x.needsNote ?? (x.needs === null ? '—' : String(x.needs)), note: x.note ?? '', pass, ...(x.goal ? { goal: x.goal, meetsGoal: x.r.every((v) => v >= x.goal) } : {}), doc: x.doc.join(' / '), reproducesDoc: reproduces, ...(!reproduces && x.why ? { why: x.why } : {}), values: x.r.map((v) => Number(v.toFixed(4))) };
  }), missing: [...missing] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
  const sheet = opt('tokens', 'src/app/styles/tokens.css');
  const outFile = opt('out', '');
  const { rows, missing } = table(resolver(readTokens(fs.readFileSync(sheet, 'utf8'))));
  for (const r of rows) console.log(`${r.pass === false ? '✗' : r.pass ? '✓' : '·'} ${r.reproducesDoc ? ' ' : '≠'} ${r.pair}\n      ${r.ratio}   needs ${r.needs}${r.reproducesDoc ? '' : `   (§2.6 printed ${r.doc})`}`);
  const failed = rows.filter((r) => r.pass === false).length;
  const differ = rows.filter((r) => !r.reproducesDoc).length;
  if (missing.length) console.log(`missing tokens: ${missing.join(', ')}`);
  console.log(`${rows.length} rows: ${failed} failing, ${differ} differing from §2.6`);
  if (outFile) fs.writeFileSync(outFile, `${JSON.stringify({ measured: new Date().toISOString().slice(0, 10), method: 'WCAG 2.x relative luminance; sRGB alpha compositing; OKLCH → 8-bit sRGB, worst of 360 hues', tokens: sheet.replace(/\\/g, '/'), columns: ['Pair', 'Ratio', 'Needs', 'Note'], rows, missingTokens: missing, summary: { rows: rows.length, failing: failed, differingFromDoc: differ } }, null, 2)}\n`);
  process.exitCode = failed || missing.length ? 1 : 0;
}
