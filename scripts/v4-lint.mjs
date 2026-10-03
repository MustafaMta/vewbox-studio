// THE LIGHTS DOWN LINT (docs/DESIGN-SYSTEM-V4.md §1.5, §8.2 rule 2, §8.4 gate 2) — what the design refuses, as rules
// a package's files must pass before review:
//
//   node scripts/v4-lint.mjs [path ...]        (default: src/components src/app src/lib)   exit 1 on a finding
//   node scripts/v4-lint.mjs --summary [path]  counts per rule and file, exit 0 (a baseline, not a gate)
//
// Rules (a line may opt out of one with a comment `v4-lint: allow <rule> — <reason>`; the reviewer reads the reason):
//   blur          backdrop-filter / backdrop-blur anywhere but players/TheatrePlayer (the one allowed blur, §5.12)
//   dialog        window.confirm / window.prompt (use the kit's useConfirm and the inline note)
//   gradient      bg-gradient-* and radial-gradient (the scrim and the art wash are tokens, §2.1)
//   glow          drop-shadow (light effects, §1.5)
//   shouting      uppercase, tracking-[…] / tracking-wide*, positive letter-spacing
//   raw-colour    a hex or rgb()/rgba()/hsl() colour in a component or a sheet other than styles/tokens.css
//   physical      physical left/right in components and sheets: left-/right-/ml-/mr-/pl-/pr-/text-left/right/
//                 border-l/r/rounded-l/r utilities; left/right/margin-left/…/text-align: left|right in CSS and in
//                 inline style objects (logical properties only)
//   engine        an engine or model name in a user-facing string (the dictionaries and JSX text): ComfyUI, Qwen,
//                 VoxCPM, MiniMax, IndexTTS, Habibi, safetensors, CUDA
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_NAMES = ['ComfyUI', 'Qwen', 'VoxCPM', 'MiniMax', 'IndexTTS', 'Habibi', 'safetensors', 'cuda'];
const ENGINE_RE = new RegExp(`\\b(${ENGINE_NAMES.join('|')})`, 'i');

const isCss = (f) => f.endsWith('.css');
const isDictionary = (f) => /[\\/]lib[\\/]i18n([\\/]|\.ts$)/.test(f);
const isTokens = (f) => /[\\/]styles[\\/]tokens\.css$/.test(f);
const isTheatre = (f) => /[\\/]players[\\/]TheatrePlayer/.test(f);

// a class token, with any variant prefixes (sm:, hover:, rtl:, [&>svg]:, …)
const CLS = (body) => new RegExp(`(?<=^|[\\s'"\`{(])(?:[\\w\\-\\[\\]&>:*.=/%]+:)?!?(${body})(?=$|[\\s'"\`)}])`);
const PHYSICAL_CLASS = CLS('-?(?:left|right)-[\\w\\[\\].%/-]+|-?m[lr]-[\\w\\[\\].%/-]+|p[lr]-[\\w\\[\\].%/-]+|text-(?:left|right)|border-[lr](?:-[\\w\\[\\]#.%/-]+)?|rounded-[lr](?:-[\\w\\[\\].%/-]+)?|rounded-[tb][lr](?:-[\\w\\[\\].%/-]+)?|float-(?:left|right)');
const PHYSICAL_CSS = /(?:^|[\s;{])(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left(?:-[a-z]+)?|border-right(?:-[a-z]+)?)\s*:|text-align\s*:\s*(?:left|right)\b|float\s*:\s*(?:left|right)\b/;
const PHYSICAL_STYLE = /\b(?:left|right|marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*)\s*:|textAlign\s*:\s*['"](?:left|right)['"]/;
const RAW_COLOUR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])|\b(?:rgba?|hsla?)\(\s*[\d.$]/;
const HREF = /\b(?:href|id|to)=\s*(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g;

/** Findings for one file's text: [{ rule, line, text }]. */
export function lintText(file, text) {
  const out = [];
  const css = isCss(file); const dict = isDictionary(file);
  const lines = text.split(/\r?\n/);
  let inComment = false;
  lines.forEach((raw, i) => {
    const allow = (rule) => new RegExp(`v4-lint:\\s*allow\\s+${rule}\\b`).test(raw);
    const add = (rule) => { if (!allow(rule)) out.push({ rule, line: i + 1, text: raw.trim().slice(0, 160) }); };
    // comments say what is refused; they are not code
    let l = raw;
    if (inComment) { const e = l.indexOf('*/'); if (e === -1) return; l = l.slice(e + 2); inComment = false; }
    l = l.replace(/\/\*.*?\*\//g, '');
    const s = l.indexOf('/*'); if (s !== -1) { l = l.slice(0, s); inComment = true; }
    if (!css) l = l.replace(/(^|[^:'"`])\/\/.*$/, '$1');
    if (dict) {
      // a dictionary: only the strings are user-facing (not the keys)
      const strings = [...l.matchAll(/'((?:[^'\\]|\\.)*)'(\s*:)?/g)].filter((m) => !m[2]).map((m) => m[1]).join(' ');
      if (ENGINE_RE.test(strings)) add('engine');
      return;
    }
    if (/backdrop-filter|backdrop-blur/.test(l) && !isTheatre(file)) add('blur');
    if (/window\.(confirm|prompt)\s*\(/.test(l)) add('dialog');
    if (/\bbg-gradient-|radial-gradient\(/.test(l)) add('gradient');
    if (/drop-shadow/.test(l)) add('glow');
    if (css ? /text-transform\s*:\s*uppercase|letter-spacing\s*:\s*(?:0*[1-9]|0?\.\d*[1-9])/.test(l) : CLS('uppercase|tracking-\\[[^\\]]*\\]|tracking-(?:wide|wider|widest)').test(l)) add('shouting');
    if (!isTokens(file) && RAW_COLOUR.test(css ? l : l.replace(HREF, ''))) add('raw-colour');
    if (css ? PHYSICAL_CSS.test(l) : (PHYSICAL_CLASS.test(l) || (/style=|CSSProperties/.test(l) && PHYSICAL_STYLE.test(l)))) add('physical');
    if (!css) { for (const m of l.matchAll(/>([^<>{}]+)</g)) if (ENGINE_RE.test(m[1])) { add('engine'); break; } }
  });
  return out;
}

const SOURCE = /\.(tsx?|css)$/;
export function filesUnder(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return SOURCE.test(p) ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => filesUnder(path.join(p, e.name)));
}
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
    console.log(found.length ? `\n${found.length} finding(s) — docs/DESIGN-SYSTEM-V4.md §1.5, §8.4` : 'v4-lint: clean');
    process.exitCode = found.length ? 1 : 0;
  }
}
