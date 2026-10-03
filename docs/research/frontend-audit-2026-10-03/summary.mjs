// Summarise graph.json for src/components (+ studio/lib): routes reaching each file, importers, dead exports.
import fs from 'node:fs';
const g = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const short = (r) => r.replace(/^\/shows\/\[id\]\/seasons\/\[seasonId\]\/episodes\/\[productionId\]/, 'EP').replace(/^\/shows\/\[id\]\/seasons\/\[seasonId\]/, 'SEASON').replace(/\/shots\/\[shotId\]/, '/shot').replace(/\[id\]/, ':id');
const lines = [];
const dirs = ['src/components/', 'src/studio/', 'src/lib/', 'src/app/(app)/'];
const files = Object.entries(g.files).filter(([k]) => dirs.some((d) => k.startsWith(d))).sort();
lines.push('file | KB | routes (pages) | layouts | prod importers | test importers | otherEntries');
for (const [k, v] of files) {
  const routes = v.routes.length === 0 ? '-' : v.routes.length >= 25 ? `ALL(${v.routes.length})` : v.routes.map(short).join(' ');
  lines.push(`${k} | ${(v.bytes / 1024).toFixed(1)} | ${routes} | ${v.layouts.join(' ') || '-'} | ${v.importersProd.length}: ${v.importersProd.map((x) => x.replace(/^src\//, '')).join(', ')} | ${v.importersTest.length} | ${v.otherEntries.join(' ') || '-'}`);
}
lines.push('\n=== exports with zero production references outside their file (name@line [kind] testRefs selfRefs)');
for (const [f, exps] of Object.entries(g.exports).sort()) {
  const dead = exps.filter((e) => !e.reexport && e.prod.length === 0);
  if (dead.length) lines.push(`${f}: ${dead.map((e) => `${e.name}@${e.line}[${e.kind}] t${e.test.length} s${e.selfRefs}`).join('; ')}`);
}
lines.push('\n=== files only reached via /kit or /kit-media (specimens)');
for (const [k, v] of files) { if (v.routes.length && v.routes.every((r) => r === '/kit' || r === '/kit-media') && v.layouts.length === 0) lines.push(k); }
lines.push('\n=== files reached by no page/layout/process entry');
for (const [k, v] of files) { if (!v.routes.length && !v.layouts.length && !v.otherEntries.length) lines.push(`${k} (prod importers: ${v.importersProd.join(', ') || 'none'}; test importers: ${v.importersTest.length})`); }
lines.push('\n=== external packages by importer (src only)');
const ext = {};
for (const [k, v] of Object.entries(g.files)) for (const p of v.external) (ext[p] ??= []).push(k);
for (const [p, l] of Object.entries(ext).sort()) lines.push(`${p}: ${l.length} files — ${l.slice(0, 6).join(', ')}${l.length > 6 ? ' …' : ''}`);
lines.push('\n=== entries');
for (const [k, v] of Object.entries(g.entries)) lines.push(`${k} -> ${v.route} (${v.kind}) reach=${v.reach.length} components=${v.reach.filter((x) => x.startsWith('src/components/')).length}`);
fs.writeFileSync(process.argv[3], lines.join('\n'));
console.log('written', lines.length, 'lines');
