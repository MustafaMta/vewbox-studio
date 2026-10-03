// CSS classes defined in src/app/styles/* vs. source use and (optionally) rendered DOM classes.
// Usage: node css.mjs <repoRoot> <outJson> [domClasses.json]
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const stylesDir = path.join(root, 'src/app/styles');
const walk = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
const cssFiles = walk(stylesDir).filter((f) => f.endsWith('.css'));
const defs = new Map(); // class -> Set(file:line)
const tokens = new Map(); // --token -> {defined: [file:line], used: n}
const rules = []; // {file, line, selector, decls}
for (const f of cssFiles) {
  const raw = fs.readFileSync(f, 'utf8');
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const relf = path.relative(root, f).split(path.sep).join('/');
  let buf = ''; let depth = 0; let line = 1; let startLine = 1; const stack = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      const prelude = buf.trim(); buf = '';
      stack.push({ prelude, line: startLine, decls: '' });
      if (!prelude.startsWith('@')) for (const m of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) { const c = m[1].replace(/\\/g, ''); if (!defs.has(c)) defs.set(c, new Set()); defs.get(c).add(`${relf}:${startLine}`); }
      depth++; startLine = line;
    } else if (ch === '}') {
      const top = stack.pop(); if (top) { top.decls += buf; rules.push({ file: relf, line: top.line, selector: top.prelude, decls: top.decls.trim(), depth: stack.map((s) => s.prelude).filter((p) => p.startsWith('@')).join(' > ') }); }
      buf = ''; depth--; startLine = line;
    } else if (ch === ';' && depth > 0) { buf += ch; if (stack.length) { stack[stack.length - 1].decls += buf; } buf = ''; startLine = line; }
    else buf += ch;
  }
  for (const m of text.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) { const t = m[1]; const ln = text.slice(0, m.index).split('\n').length; if (!tokens.has(t)) tokens.set(t, { defined: [], uses: 0, useFiles: new Set() }); tokens.get(t).defined.push(`${relf}:${ln}`); }
}
// token uses: var(--x) in css and in src
const srcFiles = walk(path.join(root, 'src')).filter((f) => /\.(tsx?|css)$/.test(f));
const srcText = srcFiles.map((f) => [path.relative(root, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')]);
for (const [relf, t] of srcText) for (const m of t.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) { const tok = m[1]; if (!tokens.has(tok)) tokens.set(tok, { defined: [], uses: 0, useFiles: new Set() }); tokens.get(tok).uses++; tokens.get(tok).useFiles.add(relf); }
// class use in source (tsx/ts only, not css)
const codeText = srcText.filter(([f]) => !f.endsWith('.css'));
const allCode = codeText.map(([, t]) => t).join('\n');
const templatePrefixes = new Set();
for (const m of allCode.matchAll(/`[^`]*?([a-zA-Z][\w-]*[-_])\$\{/g)) templatePrefixes.add(m[1]);
for (const m of allCode.matchAll(/'([a-zA-Z][\w-]*[-_])'\s*\+/g)) templatePrefixes.add(m[1]);
const dom = process.argv[4] && fs.existsSync(process.argv[4]) ? new Set(JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))) : null;
const classes = [];
for (const [c, where] of defs) {
  const re = new RegExp(`(?<![\\w-])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  const inCode = codeText.filter(([, t]) => re.test(t)).map(([f]) => f);
  const viaTemplate = [...templatePrefixes].find((p) => c.startsWith(p) && c.length > p.length);
  const inDom = dom ? dom.has(c) : null;
  classes.push({ cls: c, defined: [...where], inCode: inCode.length, codeFiles: inCode.slice(0, 3), viaTemplate: viaTemplate ?? null, inDom });
}
const unused = classes.filter((c) => c.inCode === 0 && !c.viaTemplate && (dom ? !c.inDom : true));
const templateOnly = classes.filter((c) => c.inCode === 0 && c.viaTemplate && (dom ? !c.inDom : true));
// per file counts
const perFile = {};
for (const c of classes) for (const d of c.defined) { const f = d.split(':')[0]; perFile[f] ??= { defined: 0, unused: 0 }; perFile[f].defined++; if (unused.includes(c)) perFile[f].unused++; }
// alias tokens
const aliasRe = /^--(ink|iris|violet|accent)/;
const aliases = [...tokens.entries()].filter(([t]) => aliasRe.test(t)).map(([t, v]) => ({ token: t, defined: v.defined, uses: v.uses, files: [...v.useFiles] }));
const undefinedTokens = [...tokens.entries()].filter(([, v]) => v.defined.length === 0 && v.uses > 0).map(([t, v]) => ({ token: t, uses: v.uses, files: [...v.useFiles].slice(0, 4) }));
const unusedTokens = [...tokens.entries()].filter(([, v]) => v.defined.length > 0 && v.uses === 0).map(([t, v]) => ({ token: t, defined: v.defined }));
// conflicts: same simple class selector declared with the same property in two files
const byProp = new Map();
for (const r of rules) {
  if (r.depth && !/^@layer|^@media|^@supports|^@container/.test(r.depth)) continue;
  const sel = r.selector.replace(/\s+/g, ' ');
  if (!/^\.[\w-]+$/.test(sel)) continue;
  for (const d of r.decls.split(';')) { const [p] = d.split(':').map((x) => x.trim()); if (!p || p.startsWith('--')) continue; const key = `${sel}|${p}`; if (!byProp.has(key)) byProp.set(key, []); byProp.get(key).push(`${r.file}:${r.line}${r.depth ? ' [' + r.depth + ']' : ''}`); }
}
const conflicts = [...byProp.entries()].filter(([, l]) => new Set(l.map((x) => x.split(':')[0])).size > 1).map(([k, l]) => ({ selectorProp: k, at: l }));
fs.writeFileSync(process.argv[3], JSON.stringify({ files: cssFiles.map((f) => path.relative(root, f).split(path.sep).join('/')), classCount: classes.length, unused, templateOnly, perFile, aliases, undefinedTokens, unusedTokens, conflicts, templatePrefixes: [...templatePrefixes], ruleCount: rules.length }, null, 1));
console.log('classes', classes.length, 'unused(code' + (dom ? '+dom' : '') + ')', unused.length, 'templateOnly', templateOnly.length, 'tokens', tokens.size, 'aliasTokens', aliases.length, 'undefinedTokens', undefinedTokens.length, 'unusedTokens', unusedTokens.length, 'conflicts', conflicts.length);
console.log(JSON.stringify(perFile));
