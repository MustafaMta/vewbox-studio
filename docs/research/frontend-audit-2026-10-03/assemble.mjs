// Builds the component table, the dead-export list, the CSS and i18n lists for FRONTEND-INVENTORY (markers in the
// draft) and the removal plan JSON from the same verdict table. Usage: node assemble.mjs <scratch> <repoRoot>
import fs from 'node:fs';
import path from 'node:path';
const S = process.argv[2]; const R = process.argv[3];
const g = JSON.parse(fs.readFileSync(path.join(S, 'graph.json'), 'utf8'));
const css = JSON.parse(fs.readFileSync(path.join(S, 'css-dom.json'), 'utf8'));
const i18n = JSON.parse(fs.readFileSync(path.join(S, 'i18n.json'), 'utf8'));
const isSpec = (f) => /\/(specimen|specimens)\/|Specimens\.tsx$|\/kit-media\/|\/kit\/page\.tsx$/.test(f);

// ---- verdicts: [matcher, generation, verdict, after, survivor/replacement] -----------------------------------------
const V = [
  [/^src\/components\/ui\/kit\/specimen\//, 'v4-kit', 'keep (DS specimen `/kit`; restyle with the kit)', 'DS-2', ''],
  [/^src\/components\/ui\/kit\/legacy\.tsx$/, 'v3', 'delete: Card, Details, KV, ConfirmButton, ConfirmDelete, Modal, Thumb, PickGrid, AddTile', 'Q2', 'kit Dialog / ConfirmDialog / useConfirm, Frame, tiles, kit Section'],
  [/^src\/components\/ui\/kit\/CompactHeader\.tsx$/, 'v4-kit', 'delete: duplicate of media/CompactHeader (both unused by pages)', 'DS-2', 'media/CompactHeader.tsx'],
  [/^src\/components\/ui\/kit\//, 'v4-kit', 'keep behaviour, restyle (§11.1 F2)', 'DS-2', ''],
  [/^src\/components\/ui\/kit\.tsx$/, 'v4-kit', 'keep (barrel); drop the `legacy` re-export', 'Q2', ''],
  [/^src\/components\/ui\/icons/, 'v4-kit', 'keep (DS owns icons)', '', ''],
  [/^src\/components\/ui\/cinema\.tsx$/, 'v3', 'delete: Hero, Art, ArtRow, Empty, Block, Dots after every page package', 'Q2', 'media/hero/*, Frame + tiles, kit States, kit PageHeader Section, Slate'],
  [/^src\/components\/ui\/page\.tsx$/, 'v3 shim', 'delete (re-export shim; callers import `@/components/ui/kit`)', 'Q2', 'kit/PageHeader, kit/Status'],
  [/^src\/components\/ui\/nav\.tsx$/, 'v3 shim', 'delete (re-export shim + v3 Crumbs)', 'Q2', 'kit/Tabs Crumbs, shell/nav-model'],
  [/^src\/components\/ui\/preview\.tsx$/, 'v3', 'replace by the kit image-preview states (§5.12)', 'P-Cast', 'kit (DS-2 image previews)'],
  [/^src\/components\/ui\/jobs\.tsx$/, 'v3', 'keep behaviour (start/retry/sync errors), restyle; JobButton gives way to the status row', 'P-Work', 'edit/StatusRow, Attempts (DS-2)'],
  [/^src\/components\/ui\/progress\.tsx$/, 'v3→v4', 'keep (error copy, phase rows, recovery); restyle', 'DS-2', ''],
  [/^src\/components\/ui\/toast\.tsx$/, 'v4-kit', 'keep (kit Toast)', '', ''],
  [/^src\/components\/ui\/brand\.tsx$/, 'v3', 'replace: violet mark removed (§11.1); VewboxGlyph/VewboxLogo have no users', 'DS-1', 'DS brand (§1.4)'],
  [/^src\/components\/ui\/locale\.tsx$/, 'v3', 'keep', '', ''],
  [/^src\/components\/shell\/(Sidebar|MobileBar)\.tsx$/, 'shell', 'replace by TopBar + BottomBar + MoreSheet; delete after', 'DS-2', 'shell/TopBar, shell/BottomBar, shell/MoreSheet'],
  [/^src\/components\/shell\/brand-mark\.ts$/, 'shell', 'replace: violet favicon (producer sign-off pending)', 'DS-1', ''],
  [/^src\/components\/shell\/Room\.tsx$/, 'shell', 'keep, but wire it: no page renders <Room>, so `data-room` is always lobby', 'P-Work / P-Theatre', ''],
  [/^src\/components\/shell\/(url-state|useUrlState)\.ts$/, 'shell', 'keep only if the page packages adopt it (0 users today; unit-tested)', 'Q2', ''],
  [/^src\/components\/shell\/root-vars\.ts$/, 'shell shim', 'delete (re-export of kit/layout)', 'Q2', 'ui/kit/layout useRootVarContribution'],
  [/^src\/components\/shell\//, 'shell', 'keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar)', '', ''],
  [/^src\/components\/media\/CompactHeader\.tsx$/, 'v4-media', 'keep (survivor of the two CompactHeaders); restyle', 'DS-2', ''],
  [/^src\/components\/media\/index\.ts$/, 'v4-media', 'barrel with 0 importers: delete or make it the import path', 'Q2', ''],
  [/^src\/components\/media\/specimens\//, 'v4-media', 'keep (specimen sections of `/kit`)', 'DS-2', ''],
  [/^src\/components\/media\//, 'v4-media', 'keep anatomy, restyle; pages must adopt (0 product users today)', 'DS-2', ''],
  [/^src\/components\/players\/VideoPlayer\.tsx$/, 'v3 shim', 'delete: `VideoPlayer` = InlinePlayer; move VideoPlaceholder beside InlinePlayer', 'Q2', 'players/InlinePlayer'],
  [/^src\/components\/players\/rootVars\.ts$/, 'v4 shim', 'delete (re-export of kit/layout)', 'Q2', 'ui/kit/layout'],
  [/^src\/components\/players\/music\/index\.ts$/, 'v4-media', 'barrel with 0 importers: delete or make it the import path', 'Q2', ''],
  [/^src\/components\/players\//, 'v4-media', 'keep behaviour, restyle (§11.1 F3)', 'DS-2', ''],
  [/^src\/components\/edit\/useMediaQuery\.ts$/, 'v4-media', 'delete: third copy of useMediaQuery', 'DS-2', 'ui/kit/layout useMediaQuery'],
  [/^src\/components\/edit\/index\.ts$/, 'v4-media', 'barrel with 0 importers: delete or make it the import path', 'Q2', ''],
  [/^src\/components\/edit\//, 'v4-media', 'keep anatomy, restyle; P-Work adopts (0 product users today)', 'DS-2 / P-Work', ''],
  [/^src\/components\/library\/Cards\.tsx$/, 'v3 barrel', 'delete (0 importers)', 'Q2', ''],
  [/^src\/components\/library\/Library\.tsx$/, 'v3', 'delete: LibraryBar/NoMatches/useView; CatalogueBar is built and unused', 'Q2 (after P-Shows, P-Film, P-Music, P-Cast)', 'ui/kit/CatalogueBar'],
  [/^src\/components\/library\/ShowCard\.tsx$/, 'v3', 'replace by KeyArtTile; delete after', 'P-Shows', 'media/tiles KeyArtTile'],
  [/^src\/components\/library\/ShortCard\.tsx$/, 'v3', 'replace by PosterTile / frame poster; delete after', 'P-Film', 'media/tiles PosterTile, media/FramePoster'],
  [/^src\/components\/library\/MusicVideoCard\.tsx$/, 'v3', 'replace by SleeveTile; delete after', 'P-Music', 'media/tiles SleeveTile'],
  [/^src\/components\/library\/LocationCard\.tsx$/, 'v3', 'replace by PlateTile; delete after', 'P-Cast', 'media/tiles PlateTile'],
  [/^src\/components\/library\/StartCard\.tsx$/, 'v3', 'replace by Home "Start something new"; delete after', 'P-Home', 'home/*'],
  [/^src\/components\/library\/ProductionTile\.tsx$/, 'v3', 'replace: StageStatus → StateWord, ProductionMenu → tile menu with ConfirmDialog', 'Q2 (after P-Shows, P-Film, P-Music)', 'kit Status StateWord, kit Overlay'],
  [/^src\/components\/library\/CanonPicker\.tsx$/, 'v3', 'replace by reference chips (RefChips) and picks', 'P-Work', 'edit/RefChips, edit/Picks'],
  [/^src\/components\/character\/(contract|identity|look|sheetModel)\.ts$/, 'v3 logic', 'keep the logic (no JSX); move under src/studio or src/domain', 'P-Cast', ''],
  [/^src\/components\/character\/create\/preflight\.ts$/, 'v3 logic', 'keep the logic (no JSX)', 'P-Cast', ''],
  [/^src\/components\/character\//, 'v3', 'replace (character profile, creation, voice); delete after', 'P-Cast', 'components/character/** rebuilt on the kit'],
  [/^src\/components\/location\//, 'v3', 'replace; delete after', 'P-Cast', ''],
  [/^src\/components\/show\//, 'v3', 'replace (Show page; episode workspace moves to P-Work); delete after', 'P-Shows', ''],
  [/^src\/components\/workspace\//, 'v3', 'replace by the production map and the shot workspace; delete after', 'P-Work', ''],
  [/^src\/components\/wizard\//, 'v3', 'replace by New… on Home; delete after', 'P-Home', ''],
  [/^src\/components\/studio\//, 'v3', 'restyle / replace (Studio Company, control room); keep studio/company.ts logic', 'P-Studio', ''],
  [/^src\/app\/\(app\)\/kit-media\//, 'v4-media (TEMP)', 'delete now: marked TEMPORARY, `/kit` renders the same sections', 'DS-2', '/kit'],
  [/^src\/app\/\(app\)\/jobs\/page\.tsx$/, 'v3 route', 'turn into a plain redirect; Activity moves into the control room', 'P-Studio', 'production control room'],
  [/^src\/app\/\(app\)\/(library|projects)\/page\.tsx$/, 'v4 redirect', 'keep (old addresses)', '', ''],
  [/^src\/app\/\(app\)\/page\.tsx$/, 'v3 redirect', 'replace: `/` becomes Home (§7.2)', 'P-Home', ''],
  [/^src\/app\/\(app\)\/kit\//, 'v4-kit', 'keep (DS specimen)', 'DS-2', ''],
  [/^src\/app\//, 'v3 route', 'rebuilt by its page package', '', ''],
  [/^src\/studio\//, 'store', 'keep (per-page data later, §11.5-6)', '', ''],
  [/^src\/lib\//, 'lib', 'keep', '', ''],
];
const verdictOf = (f) => { for (const [re, gen, v, after, surv] of V) if (re.test(f)) return { gen, v, after, surv }; return { gen: '?', v: '?', after: '', surv: '' }; };
const short = (r) => r.replace(/^\/shows\/\[id\]\/seasons\/\[seasonId\]\/episodes\/\[productionId\]/, 'EP').replace(/^\/shows\/\[id\]\/seasons\/\[seasonId\]/, 'SEASON').replace(/\/shots\/\[shotId\]/, '/shot').replace(/\[id\]/g, ':id').replace(/\[kind\]/, ':kind');
const routesOf = (v) => {
  if (v.layouts.length) return v.layouts.some((l) => l.includes('(root)')) ? 'every route (root layout)' : 'every route (app shell)';
  if (!v.routes.length) return 'none';
  const specOnly = v.routes.every((r) => r === '/kit' || r === '/kit-media');
  if (specOnly) return 'specimens only (/kit, /kit-media)';
  const rs = v.routes.filter((r) => r !== '/kit' && r !== '/kit-media');
  return (rs.length >= 20 ? `${rs.length} routes` : rs.map(short).join(' ')) + (rs.length < v.routes.length ? ' + specimens' : '');
};

// ---- component table ----------------------------------------------------------------------------------------------
const comp = Object.entries(g.files).filter(([k]) => k.startsWith('src/components/')).sort();
const rows = ['| File | KB | Gen. | Used by routes | Product importers | Verdict (§11) | After |', '|---|---|---|---|---|---|---|'];
for (const [k, v] of comp) {
  const { gen, v: verdict, after } = verdictOf(k);
  const prodImps = v.importersProd.filter((x) => !isSpec(x));
  rows.push(`| \`${k.replace('src/components/', '')}\` | ${(v.bytes / 1024).toFixed(1)} | ${gen} | ${routesOf(v)} | ${prodImps.length}${v.importersTest.length ? ` (+${v.importersTest.length} test)` : ''} | ${verdict} | ${after || '—'} |`);
}
// per-directory summary
const dirs = {};
for (const [k, v] of comp) { const d = k.split('/').slice(0, 3).join('/'); dirs[d] ??= { files: 0, kb: 0, product: 0, specOnly: 0, none: 0 }; dirs[d].files++; dirs[d].kb += v.bytes / 1024; const r = routesOf(v); if (r === 'none') dirs[d].none++; else if (r.startsWith('specimens only')) dirs[d].specOnly++; else dirs[d].product++; }
const dirRows = ['| Directory | Files | KB | Reached by product routes | Specimens only | Unreachable |', '|---|---|---|---|---|---|', ...Object.entries(dirs).map(([d, s]) => `| \`${d}\` | ${s.files} | ${s.kb.toFixed(0)} | ${s.product} | ${s.specOnly} | ${s.none} |`)];

// ---- dead exports --------------------------------------------------------------------------------------------------
const dead = [];
for (const [f, exps] of Object.entries(g.exports)) {
  if (!/^src\/(components|studio|lib)\//.test(f) || isSpec(f)) continue;
  for (const e of exps) {
    if (e.reexport || e.prod.length) continue;
    const prodNonSpec = e.prod.filter((x) => !isSpec(x));
    if (prodNonSpec.length) continue;
    dead.push({ file: f, name: e.name, line: e.line, kind: e.kind, tests: e.test.length, selfRefs: e.selfRefs });
  }
}
const deadRows = ['| File | Export | Kind | Tests | Used inside its file | Action |', '|---|---|---|---|---|---|', ...dead.map((d) => `| \`${d.file.replace('src/', '')}\` | \`${d.name}\`@${d.line} | ${d.kind} | ${d.tests || '—'} | ${d.selfRefs ? 'yes' : 'no'} | ${d.selfRefs ? 'drop `export`' : d.tests ? 'delete with its test' : 'delete'} |`)];

// ---- CSS -----------------------------------------------------------------------------------------------------------
const cssRows = ['| Class | Defined at | Note |', '|---|---|---|', ...css.unused.map((c) => `| \`.${c.cls}\` | ${c.defined.join(', ')} | not in source, not in any rendered page |`)];
const tplRows = ['| Class | Template prefix seen in source | Rendered in a page |', '|---|---|---|', ...css.templateOnly.map((c) => `| \`.${c.cls}\` | \`${c.viaTemplate}\` | ${c.inDom ? 'yes' : 'no'} |`)];
const aliasRows = ['| Token | Defined | `var()` uses | Files |', '|---|---|---|---|', ...css.aliases.map((a) => `| \`${a.token}\` | ${a.defined.join(', ')} | ${a.uses} | ${a.files.map((f) => f.replace('src/', '')).join(', ')} |`)];
const conflictMap = {};
for (const c of css.conflicts) { const [sel] = c.selectorProp.split('|'); conflictMap[sel] ??= new Set(); c.at.forEach((a) => conflictMap[sel].add(a.split(' [')[0])); }
const conflictRows = ['| Selector | Declared in | Properties in conflict |', '|---|---|---|', ...Object.entries(conflictMap).map(([sel, at]) => `| \`${sel}\` | ${[...at].join(' and ')} | ${css.conflicts.filter((c) => c.selectorProp.startsWith(sel + '|')).map((c) => c.selectorProp.split('|')[1]).join(', ')} |`)];
const undefRows = ['| Token | Uses | Where |', '|---|---|---|', ...css.undefinedTokens.map((t) => `| \`${t.token}\` | ${t.uses} | ${t.files.map((f) => f.replace('src/', '')).join(', ')} |`)];

// ---- i18n ----------------------------------------------------------------------------------------------------------
const i18nRows = ['| Family | Keys (file:line) |', '|---|---|', ...Object.entries(i18n.byFamily).map(([fam, l]) => `| ${fam} | ${l.map((x) => `\`${x}\``).join(', ')} |`)];
const specRows = ['| Prefix | Keys used only by the specimen pages |', '|---|---|', ...Object.entries(i18n.specimenOnlyByPrefix).sort((a, b) => b[1] - a[1]).map(([p, n]) => `| \`${p}.*\` | ${n} |`)];

// ---- removal plan --------------------------------------------------------------------------------------------------
const plan = [];
const push = (file, symbol, reason, after, kind, replacement) => plan.push({ file, symbol, kind, reason, after, replacement: replacement || null });
for (const [k] of comp) {
  const { v, after, surv } = verdictOf(k);
  if (/^delete/.test(v) || /; delete after$/.test(v) || /delete after/.test(v) || /^replace/.test(v) || /barrel with 0 importers/.test(v)) push(k, '*', v, after || 'Q2', 'file', surv);
}
push('src/app/(app)/kit-media/page.tsx', '*', 'TEMPORARY route (its own comment); /kit renders the same sections; a production build compiles it', 'DS-2', 'file', '/kit');
push('src/app/(app)/kit-media/KitMediaPage.tsx', '*', 'see kit-media/page.tsx', 'DS-2', 'file', '/kit');
push('src/app/(app)/jobs/page.tsx', 'Activity', 'the Activity list rendered inside /production; /jobs becomes a plain redirect (redirects.ts jobsTarget)', 'P-Studio', 'symbol', 'production control room');
for (const d of dead) push(d.file, d.name, d.selfRefs ? 'exported but used only inside its file: drop `export`' : `no references outside its file (LanguageService findReferences)${d.tests ? `; ${d.tests} test file(s) reference it` : ''}`, 'Q2', d.selfRefs ? 'export-keyword' : 'symbol', null);
for (const c of css.unused) push(c.defined[0].split(':')[0], `.${c.cls}`, 'CSS class with no literal, template or rendered use', 'Q2', 'css', null);
for (const a of css.aliases) if (/^--(ink|iris|violet)/.test(a.token) || a.token === '--accent-line') push('src/app/styles/tokens.css', a.token, `token alias (${a.uses} var() uses in ${a.files.length} file(s)); v5 names replace it`, a.token.startsWith('--violet') || a.token.startsWith('--iris') ? 'DS-1' : 'Q2', 'css-token', null);
for (const [sel] of Object.entries(conflictMap)) push('src/app/styles/kit.css', sel, `declared in two sheets with the same properties (${[...conflictMap[sel]].join(' and ')}); keep one`, 'DS-2', 'css-conflict', null);
for (const [fam, l] of Object.entries(i18n.byFamily)) for (const x of l) { const m = x.match(/^(\S+) \((\S+):(\d+)\)$/); push(`src/lib/i18n/v4/${m[2]}`, m[1], 'dictionary key with no literal, dynamic or test use', 'Q2', 'i18n-key', null); }
push('src/lib/i18n/v4/shell.ts', 'app.saved, app.saving, app.unsaved', 'used only by tests (SaveState reads shell.save.*)', 'Q2', 'i18n-key', null);
const confirmSites = [['src/app/(app)/characters/page.tsx', 47, 'P-Cast'], ['src/app/(app)/shows/page.tsx', 45, 'P-Shows'], ['src/components/workspace/tabs/StoryTab.tsx', 113, 'P-Work'], ['src/components/workspace/tabs/StoryboardTab.tsx', 105, 'P-Work'], ['src/components/workspace/ShotEditor.tsx', 79, 'P-Work'], ['src/components/workspace/ShotEditor.tsx', 109, 'P-Work'], ['src/components/workspace/ShotEditor.tsx', 110, 'P-Work'], ['src/components/show/ShowWorkspace.tsx', 199, 'P-Shows']];
for (const [f, line, pkg] of confirmSites) push(f, `window.${line === 109 ? 'prompt' : 'confirm'} @${line}`, 'browser dialog (§11.3 rule 7)', pkg, 'browser-dialog', 'useConfirm / useAsk (kit Overlay)');
const out = { generatedAt: new Date().toISOString(), method: 'docs/research/FRONTEND-INVENTORY-2026-10-03.md', entries: plan };
fs.writeFileSync(path.join(R, 'docs/research/frontend-removal-plan.json'), JSON.stringify(out, null, 1) + '\n');

// ---- splice into the draft ------------------------------------------------------------------------------------------
const docPath = path.join(R, 'docs/research/FRONTEND-INVENTORY-2026-10-03.md');
let doc = fs.readFileSync(docPath, 'utf8');
const fill = (marker, text) => { if (!doc.includes(marker)) return; doc = doc.replace(marker, text); };
fill('<!-- TABLE:dirs -->', dirRows.join('\n'));
fill('<!-- TABLE:components -->', rows.join('\n'));
fill('<!-- TABLE:dead-exports -->', deadRows.join('\n'));
fill('<!-- TABLE:css-unused -->', cssRows.join('\n'));
fill('<!-- TABLE:css-template -->', tplRows.join('\n'));
fill('<!-- TABLE:css-aliases -->', aliasRows.join('\n'));
fill('<!-- TABLE:css-conflicts -->', conflictRows.join('\n'));
fill('<!-- TABLE:css-undefined -->', undefRows.join('\n'));
fill('<!-- TABLE:i18n-unused -->', i18nRows.join('\n'));
fill('<!-- TABLE:i18n-specimen -->', specRows.join('\n'));
const N = { dead: dead.length, plan: plan.length, 'css-classes': css.classCount, 'css-unused': css.unused.length, 'i18n-total': i18n.total, 'i18n-unused': i18n.unused, 'i18n-spec': i18n.specimenOnly.length, components: comp.length };
for (const [k, v] of Object.entries(N)) doc = doc.split(`<!-- N:${k} -->`).join(String(v));
fs.writeFileSync(docPath, doc);
console.log('components', comp.length, 'dead exports', dead.length, 'plan entries', plan.length, 'css unused', css.unused.length);
