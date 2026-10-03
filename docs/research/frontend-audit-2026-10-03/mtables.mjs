// Markdown tables for FRONTEND-MEASUREMENTS from measure2/pages.json, measure2/extra.json and bundle.json.
// Usage: node mtables.mjs <scratch> <outTxt>
import fs from 'node:fs';
import path from 'node:path';
const S = process.argv[2];
const pages = JSON.parse(fs.readFileSync(path.join(S, 'measure2/pages.json'), 'utf8')).filter((p) => !p.error);
const extra = JSON.parse(fs.readFileSync(path.join(S, 'measure2/extra.json'), 'utf8'));
const bundle = JSON.parse(fs.readFileSync(path.join(S, 'bundle.json'), 'utf8'));
const KB = (b) => (b / 1024).toFixed(0);
const MB = (b) => (b / 1024 / 1024).toFixed(1);
const ms = (x) => (x == null ? '—' : Math.round(x));
const out = [];
const kindSum = (p, pre) => Object.entries(p.byKind).filter(([k]) => k.startsWith(pre)).reduce((a, [, v]) => ({ n: a.n + v.n, b: a.b + v.decoded }), { n: 0, b: 0 });

out.push('<!-- T:pages -->');
for (const vp of ['1440', '390']) {
  out.push(`\n**${vp} px** (${vp === '390' ? 'DPR 2, mobile emulation' : 'DPR 1'})\n`);
  out.push('| Page | Requests | Total KB | JS KB | CSS KB | Fonts KB | `/api/studio` | `/api/jobs` | Org API KB | Media files / MB | Images | Ready ms | FCP ms | LCP ms | LCP element | CLS | Console |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pages.filter((x) => x.viewport === vp)) {
    const media = kindSum(p, 'media');
    const org = p.org.reduce((a, o) => a + o.bytes, 0);
    const imgs = p.imgRows.length;
    out.push(`| ${p.name} \`${p.urlPath}\` | ${p.total.n} | ${KB(p.total.decoded)} | ${KB(p.byKind.js?.decoded ?? 0)} | ${KB(p.byKind.css?.decoded ?? 0)} | ${KB(p.byKind.font?.decoded ?? 0)} | ${p.studio.count} × ${KB(p.studio.bytes[0] ?? 0)} KB | ${p.jobs.count} × ${KB(p.jobs.bytes[0] ?? 0)} KB | ${KB(org)} (${p.org.length}) | ${media.n} / ${MB(media.b)} | ${imgs} | ${p.readyAt} | ${ms(p.vitals.fcp)} | ${ms(p.vitals.lcp)} | ${p.vitals.lcpEl ? p.vitals.lcpEl.replace(/\|/g, '/').slice(0, 48) : '—'} | ${p.vitals.cls.toFixed(3)} | ${p.consoleErrorCount} |`);
  }
}

out.push('\n<!-- T:images -->');
out.push('| Page @ vp | Image (asset) | Natural px | Displayed CSS px | Bytes | Natural / displayed device px |');
out.push('|---|---|---|---|---|---|');
const seen = new Set();
const imgRows = [];
for (const p of pages) for (const i of p.imgRows) { if (!i.bytes || !i.nw) continue; imgRows.push({ page: `${p.name}@${p.viewport}`, ...i }); }
imgRows.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
for (const i of imgRows) { const key = `${i.page}|${i.src}|${i.cw}`; if (seen.has(key)) continue; seen.add(key); if (seen.size > 40) break; out.push(`| ${i.page} | \`${i.src.replace(/^.*\/api\/media\//, '').slice(0, 40)}\` | ${i.nw}×${i.nh} | ${i.cw}×${i.ch}${i.inView ? '' : ' (off-screen)'} | ${KB(i.bytes)} KB | ${i.oversize}× |`); }
// per page image totals
out.push('\n<!-- T:image-totals -->');
out.push('| Page @ vp | `<img>` with media | Image bytes KB | Displayed px (sum) | Natural px (sum) | Pixels fetched / pixels shown | Largest factor |');
out.push('|---|---|---|---|---|---|---|');
for (const p of pages) {
  const rows = p.imgRows.filter((i) => i.bytes && i.nw);
  if (!rows.length) continue;
  const bytes = rows.reduce((a, i) => a + i.bytes, 0);
  const shown = rows.reduce((a, i) => a + i.cw * i.ch * (p.viewport === '390' ? 4 : 1), 0);
  const nat = rows.reduce((a, i) => a + i.nw * i.nh, 0);
  out.push(`| ${p.name}@${p.viewport} | ${rows.length} | ${KB(bytes)} | ${(shown / 1e6).toFixed(2)} MP | ${(nat / 1e6).toFixed(1)} MP | ${(nat / Math.max(1, shown)).toFixed(0)}× | ${Math.max(...rows.map((i) => i.oversize ?? 0))}× |`);
}
out.push('\n<!-- T:videos -->');
out.push('| Page @ vp | `<video>` | preload | readyState | Displayed | Source |');
out.push('|---|---|---|---|---|---|');
for (const p of pages) for (const v of p.videos) out.push(`| ${p.name}@${p.viewport} | ${v.autoplay ? 'autoplay' : ''} | ${v.preload || 'auto'} | ${v.readyState} | ${v.cw}×${v.ch} | \`${(v.src || '').replace(/^.*\/api\/media\//, '').slice(0, 40)}\`${v.poster ? ' + poster' : ''} |`);
out.push('\n<!-- T:slow -->');
out.push('| Page @ vp | Slowest requests (> 1 s) |');
out.push('|---|---|');
for (const p of pages) if (p.slow.length) out.push(`| ${p.name}@${p.viewport} | ${p.slow.map((s) => `\`${s.url}\` ${s.ms} ms`).join('; ')} |`);
out.push('\n<!-- T:shifts -->');
out.push('| Page @ vp | CLS | Shifts > 0.005 (t ms: value, source) |');
out.push('|---|---|---|');
for (const p of pages) if (p.vitals.cls > 0.005) out.push(`| ${p.name}@${p.viewport} | ${p.vitals.cls.toFixed(3)} | ${p.vitals.shifts.map((s) => `${s.t}: ${s.v} ${s.src.join('+')}`).join('; ')} |`);
out.push('\n<!-- T:console -->');
const cons = {};
for (const p of pages) for (const c of p.consoleErrors) { const k = c.slice(0, 120); cons[k] ??= new Set(); cons[k].add(`${p.name}@${p.viewport}`); }
out.push('| Message | Pages |'); out.push('|---|---|');
for (const [k, v] of Object.entries(cons)) out.push(`| \`${k.replace(/\|/g, '/')}\` | ${v.size} (${[...v].slice(0, 4).join(', ')}${v.size > 4 ? ', …' : ''}) |`);
out.push('\n<!-- T:failed -->');
for (const p of pages) if (p.failed.length) out.push(`- ${p.name}@${p.viewport}: ${p.failed.map((f) => `\`${f.url}\` ${f.status ?? f.failed}`).join('; ')}`);
out.push('\n<!-- T:idle -->');
out.push(`- \`/shows\`, 65 s idle after load: ${extra.idleShows.length} API requests — ${extra.idleShows.map((h) => `${h.url} @${h.t}s`).join(', ') || 'none'}`);
out.push(`- \`/production\`, 65 s idle after load: ${extra.idleProd.length} API requests — ${extra.idleProd.map((h) => `${h.url} @${h.t}s`).join(', ') || 'none'}`);
out.push('\n<!-- T:nav -->');
out.push('| From → to (sidebar click) | ms to network idle | Requests | KB | By kind |');
out.push('|---|---|---|---|---|');
for (const r of extra.navRows) out.push(r.error ? `| ${r.label} | — | — | — | ${r.error} |` : `| → \`${r.href}\` | ${r.ms} | ${r.requests} | ${KB(r.bytes)} | ${Object.entries(r.by).map(([k, v]) => `${k} ${v.n}/${KB(v.decoded)} KB`).join(', ')} |`);
out.push('\n<!-- T:routes -->');
out.push('| Route | JS files | First-load JS raw KB | gzip KB | CSS raw / gzip KB |');
out.push('|---|---|---|---|---|');
for (const [r, v] of Object.entries(bundle.routes).sort((a, b) => b[1].js.raw - a[1].js.raw)) out.push(`| \`${r}\` | ${v.files} | ${KB(v.js.raw)} | ${KB(v.js.gz)} | ${KB(v.css.raw)} / ${KB(v.css.gz)} |`);
out.push('\n<!-- T:chunks -->');
out.push('| Chunk | Routes using it | raw KB | gzip KB | Contents (string probe) |');
out.push('|---|---|---|---|---|');
const probe = { '3525': 'EN+AR dictionary, store, domain reducers/commands, preferences', '6074': 'React DOM (framework, root)', '80ab6b4e': 'Next app router runtime (root)', '1545': 'zod', '4065': 'specimen pages (/kit, /kit-media)', '9327': 'workspace tabs (7 routes)', '3036': 'character/create (8 routes)', '8641': 'shell + kit (every route)', '3980': 'wizard (3 routes)', 'framework': 'React', 'main': 'Next main', 'polyfills': 'polyfills (nomodule)' };
for (const c of bundle.chunks.filter((c) => c.raw > 20 * 1024)) { const key = Object.keys(probe).find((k) => c.file.includes(`/${k}-`) || c.file.includes(`/${k}.`)); out.push(`| \`${c.file.replace('static/chunks/', '')}\` | ${c.usedBy} | ${KB(c.raw)} | ${KB(c.gz)} | ${key ? probe[key] : ''} |`); }
out.push(`\nframework (rootMainFiles): ${bundle.framework.files.length} files, ${KB(bundle.framework.raw)} KB raw / ${KB(bundle.framework.gz)} KB gzip; shared by every route: ${bundle.sharedByEveryRoute.files.length} files, ${KB(bundle.sharedByEveryRoute.raw)} KB raw / ${KB(bundle.sharedByEveryRoute.gz)} KB gzip; static output: ${bundle.totals.jsCount} JS files ${KB(bundle.totals.js)} KB, CSS ${KB(bundle.totals.css)} KB, fonts ${KB(bundle.totals.fonts)} KB.`);
fs.writeFileSync(process.argv[3], out.join('\n'));
console.log('ok', pages.length, 'pages');
