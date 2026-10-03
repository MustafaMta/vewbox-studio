// Route first-load JS from the Next 16 (webpack) build: rootMainFiles (build-manifest.json) + every client chunk the
// route's page_client-reference-manifest.js references. Usage: node bundle2.mjs <repoRoot> <outJson>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const nextDir = path.join(root, '.next');
const buildMan = JSON.parse(fs.readFileSync(path.join(nextDir, 'build-manifest.json'), 'utf8'));
const rootMain = buildMan.rootMainFiles;
const cache = new Map();
const sizeOf = (f) => { if (!cache.has(f)) { const p = path.join(nextDir, f); if (!fs.existsSync(p)) cache.set(f, { raw: 0, gz: 0, missing: true }); else { const b = fs.readFileSync(p); cache.set(f, { raw: b.length, gz: zlib.gzipSync(b, { level: 6 }).length }); } } return cache.get(f); };
const sum = (fs_) => fs_.reduce((a, f) => ({ raw: a.raw + sizeOf(f).raw, gz: a.gz + sizeOf(f).gz }), { raw: 0, gz: 0 });
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
const manifests = walk(path.join(nextDir, 'server', 'app')).filter((f) => f.endsWith('page_client-reference-manifest.js'));
const routes = {};
const use = new Map();
for (const m of manifests) {
  const text = fs.readFileSync(m, 'utf8');
  const key = text.match(/__RSC_MANIFEST\["([^"]+)"\]/)[1];
  const route = key.replace(/\/page$/, '').replace(/\/\([^)]+\)/g, '') || '/';
  const js = [...new Set([...text.matchAll(/"(static\/chunks\/[^"\\]+\.js)"/g)].map((x) => x[1]))];
  const css = [...new Set([...text.matchAll(/"(static\/css\/[^"\\]+\.css)"/g)].map((x) => x[1]))];
  const boundary = js.filter((f) => /\/(error|loading|not-found|global-error)-[a-f0-9]+\.js$/.test(f));
  const page = js.filter((f) => !boundary.includes(f));
  const all = [...new Set([...rootMain, ...page])];
  for (const f of all) use.set(f, (use.get(f) ?? 0) + 1);
  routes[route] = { files: all.length, js: sum(all), jsWithBoundaries: sum([...new Set([...all, ...boundary])]), css: sum(css), boundary, chunks: all, cssFiles: css };
}
const framework = sum(rootMain);
const nRoutes = Object.keys(routes).length;
const shared = [...use.entries()].filter(([, n]) => n === nRoutes).map(([f]) => f);
const chunks = [...use.entries()].map(([f, n]) => ({ file: f, usedBy: n, ...sizeOf(f) })).sort((a, b) => b.raw - a.raw);
const staticFiles = walk(path.join(nextDir, 'static'));
const totals = { js: 0, css: 0, fonts: 0, other: 0, jsCount: 0 };
for (const f of staticFiles) { const s = fs.statSync(f).size; if (f.endsWith('.js')) { totals.js += s; totals.jsCount++; } else if (f.endsWith('.css')) totals.css += s; else if (/\.(woff2?|ttf)$/.test(f)) totals.fonts += s; else totals.other += s; }
const result = { buildId: fs.readFileSync(path.join(nextDir, 'BUILD_ID'), 'utf8').trim(), framework: { files: rootMain, ...framework }, sharedByEveryRoute: { files: shared, ...sum(shared) }, routes, chunks, totals };
fs.writeFileSync(out, JSON.stringify(result, null, 1));
const k = (b) => (b / 1024).toFixed(0);
console.log('BUILD_ID', result.buildId, '| framework', rootMain.length, 'files', k(framework.raw), 'KB raw /', k(framework.gz), 'KB gz | shared by all', nRoutes, 'routes:', shared.length, 'files', k(result.sharedByEveryRoute.raw), 'KB raw /', k(result.sharedByEveryRoute.gz), 'KB gz');
console.log('route | js files | first-load JS raw KB | gz KB | +boundaries raw | css raw KB | css gz KB');
for (const [r, v] of Object.entries(routes).sort((a, b) => b[1].js.raw - a[1].js.raw)) console.log(`${r} | ${v.files} | ${k(v.js.raw)} | ${k(v.js.gz)} | ${k(v.jsWithBoundaries.raw)} | ${k(v.css.raw)} | ${k(v.css.gz)}`);
console.log('--- chunks (file | routes using | raw KB | gz KB)');
for (const c of chunks) console.log(`${c.file} | ${c.usedBy} | ${k(c.raw)} | ${k(c.gz)}`);
console.log('--- static totals', JSON.stringify(totals));
