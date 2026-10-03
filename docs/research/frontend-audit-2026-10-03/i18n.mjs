// Unused i18n keys (method of docs/AUDIT-CODEBASE.md G1): a key is used when it appears as a string literal in src/
// (outside the dictionary files), or matches a dynamic family `prefix.${…}`, 'prefix.' + x, `prefix.${…}.tail`.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const dictDir = path.join(root, 'src/lib/i18n/v4');
const walk = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) acc.push(p); } return acc; };
const keys = new Map(); // key -> {file, line, en, ar}
for (const f of fs.readdirSync(dictDir)) {
  const text = fs.readFileSync(path.join(dictDir, f), 'utf8').split('\n');
  text.forEach((ln, i) => { const m = ln.match(/^\s*'([^']+)':\s*\[/); if (m) keys.set(m[1], { file: `src/lib/i18n/v4/${f}`, line: i + 1, dup: keys.has(m[1]) }); });
}
const srcFiles = walk(path.join(root, 'src')).filter((f) => !f.startsWith(dictDir) && !f.endsWith(path.join('lib', 'i18n.ts')));
const testFiles = [...walk(path.join(root, 'tests')), ...walk(path.join(root, 'scripts'))];
const srcText = srcFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]);
const testText = testFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]);
const allSrc = srcText.map(([, t]) => t).join('\n');
const allTest = testText.map(([, t]) => t).join('\n');
// dynamic families
const fams = new Set();
for (const m of allSrc.matchAll(/`([a-zA-Z][\w.]*\.)\$\{[^}]*\}(\.[\w.]+)?`/g)) fams.add({ prefix: m[1], tail: m[2] ?? '' });
for (const m of allSrc.matchAll(/'([a-zA-Z][\w.]*\.)'\s*\+/g)) fams.add({ prefix: m[1], tail: '' });
for (const m of allSrc.matchAll(/T\.dyn\(\s*`([^`$]*)\$\{/g)) fams.add({ prefix: m[1], tail: '' });
const famList = [...fams];
const literal = (k, text) => text.includes(`'${k}'`) || text.includes(`"${k}"`) || text.includes('`' + k + '`');
const unused = []; const dynamicOnly = []; const testOnly = []; const specimenOnly = [];
const isSpecimen = (f) => /[\\/](specimen|specimens)[\\/]|Specimens\.tsx$|[\\/]kit-media[\\/]|[\\/]kit[\\/]page\.tsx$/.test(f);
const prodText = srcText.filter(([f]) => !isSpecimen(f)).map(([, t]) => t).join('\n');
for (const [k, info] of keys) {
  if (literal(k, allSrc)) { if (!literal(k, prodText)) specimenOnly.push(k); continue; }
  const fam = famList.find((f) => k.startsWith(f.prefix) && (f.tail ? k.endsWith(f.tail) : true));
  if (fam) { dynamicOnly.push([k, fam.prefix + '${}' + fam.tail]); continue; }
  if (literal(k, allTest)) { testOnly.push(k); continue; }
  unused.push([k, info]);
}
const byFamily = {};
for (const [k, info] of unused) { const fam = k.split('.').slice(0, k.startsWith('kit.') || k.startsWith('media.') || k.startsWith('shell.') ? 2 : 1).join('.'); (byFamily[fam] ??= []).push(`${k} (${info.file.replace('src/lib/i18n/v4/', '')}:${info.line})`); }
const result = { total: keys.size, unused: unused.length, dynamicOnly: dynamicOnly.length, testOnly, specimenOnly, specimenOnlyByPrefix: specimenOnly.reduce((a, k) => { const p = k.split('.').slice(0, 2).join('.'); a[p] = (a[p] ?? 0) + 1; return a; }, {}), families: famList.map((f) => f.prefix + '${}' + f.tail), byFamily, byFile: Object.fromEntries(Object.entries(unused.reduce((a, [, i]) => { a[i.file] = (a[i.file] ?? 0) + 1; return a; }, {}))), perFileTotal: Object.fromEntries([...keys.values()].reduce((a, i) => a.set(i.file, (a.get(i.file) ?? 0) + 1), new Map())) };
fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 1));
console.log(`keys ${keys.size}; unused ${unused.length} (${(100 * unused.length / keys.size).toFixed(1)}%); dynamic-only ${dynamicOnly.length}; test-only ${testOnly.length}`);
for (const [fam, l] of Object.entries(byFamily).sort((a, b) => b[1].length - a[1].length)) console.log(`${fam} (${l.length})`);
console.log('per file total/unused', JSON.stringify(result.perFileTotal), JSON.stringify(result.byFile));
