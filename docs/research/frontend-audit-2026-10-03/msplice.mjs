// Splice the <!-- T:name --> sections of a tables file into the document's markers. Usage: node msplice.mjs <doc> <tables> [<prodTables>]
import fs from 'node:fs';
const [doc, tables, prodTables] = process.argv.slice(2);
const parse = (file) => { const sections = {}; let cur = null; for (const line of fs.readFileSync(file, 'utf8').split('\n')) { const m = line.match(/^<!-- T:([\w-]+) -->$/); if (m) { cur = m[1]; sections[cur] = []; continue; } if (cur) sections[cur].push(line); } return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()])); };
let text = fs.readFileSync(doc, 'utf8');
const s = parse(tables);
for (const [k, v] of Object.entries(s)) text = text.split(`<!-- T:${k} -->`).join(v);
if (prodTables) { const p = parse(prodTables); text = text.split('<!-- T:prod -->').join(p.pages ?? ''); }
fs.writeFileSync(doc, text);
console.log('left:', (text.match(/<!-- T:[\w-]+ -->/g) || []).join(' ') || 'none');
