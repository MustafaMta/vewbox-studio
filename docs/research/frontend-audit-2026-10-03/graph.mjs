// Frontend inventory: static import graph from every Next entry + LanguageService references for exports.
// Usage: node graph.mjs <repoRoot> <outJson>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (/\.(ts|tsx|mts|mjs|js|cjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
};
const srcFiles = walk(path.join(root, 'src'));
const testFiles = [...walk(path.join(root, 'tests')), ...walk(path.join(root, 'scripts')), ...walk(path.join(root, 'tools'))];
const configFiles = ['next.config.ts', 'playwright.config.ts', 'vitest.config.ts', 'vitest.api.config.ts', 'vitest.worker.config.ts', 'vitest.evidence.config.ts', 'drizzle.config.ts', 'postcss.config.mjs'].map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
const allFiles = [...srcFiles, ...testFiles, ...configFiles];

const cfgPath = path.join(root, 'tsconfig.json');
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
const options = parsed.options;

// ---- import edges --------------------------------------------------------------------------------------------
const edges = new Map(); // file -> Set(file)
const specs = new Map(); // file -> [{spec, resolved, dynamic}]
const external = new Map(); // file -> Set(packageName)
const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
for (const f of allFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(n) ? Boolean(n.importClause?.isTypeOnly) : Boolean(n.isTypeOnly);
      found.push({ spec: n.moduleSpecifier.text, dynamic: false, typeOnly });
    } else if (ts.isCallExpression(n)) {
      const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require';
      if ((isImport || isRequire) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) found.push({ spec: n.arguments[0].text, dynamic: true, typeOnly: false });
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      found.push({ spec: n.argument.literal.text, dynamic: false, typeOnly: true });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const set = new Set(); const ext = new Set(); const list = [];
  for (const it of found) {
    const r = ts.resolveModuleName(it.spec, f, options, ts.sys);
    const resolved = r.resolvedModule?.resolvedFileName;
    if (resolved && !r.resolvedModule.isExternalLibraryImport && !resolved.includes('node_modules')) { set.add(path.normalize(resolved)); list.push({ ...it, resolved: rel(resolved) }); }
    else { if (!it.spec.startsWith('.') && !it.spec.startsWith('@/') && !it.spec.startsWith('node:') && !['fs','path','os','crypto','url','child_process','stream','util','events','http','https','net','zlib','buffer','readline','worker_threads','assert','timers','dns','tls','perf_hooks','process'].includes(it.spec)) ext.add(pkgName(it.spec)); list.push({ ...it, resolved: null }); }
  }
  edges.set(path.normalize(f), set); specs.set(path.normalize(f), list); external.set(path.normalize(f), ext);
}
// importers of each file
const importers = new Map();
for (const [f, set] of edges) for (const t of set) { if (!importers.has(t)) importers.set(t, new Set()); importers.get(t).add(f); }

// ---- entries ---------------------------------------------------------------------------------------------------
const appDir = path.join(root, 'src', 'app');
const entryKinds = /^(page|layout|template|error|loading|not-found|global-error|route|default)\.(tsx|ts)$/;
const entries = srcFiles.filter((f) => f.startsWith(appDir) && entryKinds.test(path.basename(f))).map(path.normalize);
const routeOf = (f) => {
  const r = rel(f).replace(/^src\/app/, '').replace(/\/(page|layout|template|error|loading|not-found|global-error|route|default)\.(tsx|ts)$/, '');
  return (r.replace(/\/\([^)]+\)/g, '') || '/');
};
const reach = (start) => { const seen = new Set([start]); const q = [start]; while (q.length) { const f = q.pop(); for (const t of edges.get(f) ?? []) if (!seen.has(t)) { seen.add(t); q.push(t); } } return seen; };

const byEntry = {};
for (const e of entries) byEntry[rel(e)] = { route: routeOf(e), kind: path.basename(e).split('.')[0], reach: [...reach(e)].map(rel) };
// other roots
const otherRoots = ['src/proxy.ts', 'src/middleware.ts', 'src/instrumentation.ts', 'src/worker/index.ts', 'src/server/db/cli.ts'].map((p) => path.join(root, p)).filter((f) => fs.existsSync(f)).map(path.normalize);
for (const e of otherRoots) byEntry[rel(e)] = { route: null, kind: 'process', reach: [...reach(e)].map(rel) };

// per file: which page routes reach it (pages only; layouts count as "all routes under them")
const pages = Object.entries(byEntry).filter(([, v]) => v.kind === 'page');
const layouts = Object.entries(byEntry).filter(([, v]) => v.kind === 'layout');
const fileInfo = {};
for (const f of srcFiles) {
  const r = rel(f);
  const viaPages = pages.filter(([, v]) => v.reach.includes(r)).map(([, v]) => v.route);
  const viaLayouts = layouts.filter(([, v]) => v.reach.includes(r)).map(([k, v]) => v.route + (k.includes('(app)') ? ' (app)' : ' (root)'));
  const viaOther = Object.entries(byEntry).filter(([, v]) => !['page', 'layout'].includes(v.kind) && v.reach.includes(r)).map(([k]) => k);
  const imps = [...(importers.get(path.normalize(f)) ?? [])].map(rel);
  fileInfo[r] = { bytes: fs.statSync(f).size, routes: viaPages, layouts: viaLayouts, otherEntries: viaOther, importers: imps, importersProd: imps.filter((i) => i.startsWith('src/')), importersTest: imps.filter((i) => !i.startsWith('src/')), external: [...external.get(path.normalize(f)) ?? []] };
}

// ---- LanguageService: references for every export under src/components, src/studio, src/lib, src/app -----------
const lsFiles = allFiles.map(path.normalize);
const versions = new Map(lsFiles.map((f) => [f, '1']));
const host = {
  getScriptFileNames: () => lsFiles,
  getScriptVersion: (f) => versions.get(path.normalize(f)) ?? '1',
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined),
  getCurrentDirectory: () => root,
  getCompilationSettings: () => options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory, directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = ls.getProgram();
const checker = program.getTypeChecker();
const exportsInfo = {};
const scopeDirs = ['src/components', 'src/studio', 'src/lib', 'src/app', 'src/domain'];
for (const f of srcFiles) {
  const r = rel(f);
  if (!scopeDirs.some((d) => r.startsWith(d + '/'))) continue;
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  const sym = checker.getSymbolAtLocation(sf);
  if (!sym) continue;
  const exps = checker.getExportsOfModule(sym);
  const list = [];
  for (const ex of exps) {
    let decl = ex.declarations?.[0];
    if (!decl) continue;
    // re-exports: find the name node in this file
    let nameNode = null;
    if (decl.getSourceFile().fileName !== sf.fileName) { nameNode = null; }
    const name = ex.name;
    let pos = null;
    if (decl.getSourceFile().fileName === sf.fileName) {
      const n = decl.name ?? (ts.isExportSpecifier(decl) ? decl.name : null) ?? (ts.isExportAssignment(decl) ? decl.expression : null);
      if (n) pos = n.getStart();
      else if (ts.isVariableDeclaration(decl) || ts.isFunctionDeclaration(decl) || ts.isClassDeclaration(decl)) pos = decl.getStart();
    } else { // re-export via export * or export { x } from
      const specList = specs.get(path.normalize(f)) ?? [];
      list.push({ name, line: null, reexport: true, prod: null, test: null, kind: 'reexport' });
      continue;
    }
    if (pos == null) continue;
    const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
    let refs = [];
    try { refs = ls.findReferences(f, pos) ?? []; } catch { refs = []; }
    const locs = refs.flatMap((g) => g.references).filter((x) => !x.isDefinition);
    const files = new Set(locs.map((x) => rel(x.fileName)));
    const otherFiles = [...files].filter((x) => x !== r);
    const prodFiles = otherFiles.filter((x) => x.startsWith('src/'));
    const testFilesR = otherFiles.filter((x) => !x.startsWith('src/'));
    const selfRefs = locs.filter((x) => rel(x.fileName) === r).length;
    const kind = ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl) ? 'type' : ts.isFunctionDeclaration(decl) ? 'function' : ts.isClassDeclaration(decl) ? 'class' : 'value';
    list.push({ name, line, kind, prod: prodFiles, test: testFilesR, selfRefs, prodRouteCount: prodFiles.length });
  }
  exportsInfo[r] = list;
}

fs.writeFileSync(out, JSON.stringify({ root: rel(root), entries: byEntry, files: fileInfo, exports: exportsInfo, specs: Object.fromEntries([...specs].map(([k, v]) => [rel(k), v])) }, null, 1));
console.log('entries', Object.keys(byEntry).length, 'files', Object.keys(fileInfo).length, 'exportFiles', Object.keys(exportsInfo).length);
