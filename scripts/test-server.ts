// `pnpm test:server` — the ISOLATED studio the API and browser tests run against (docs/BACKEND-AUDIT-2026-10.md C3).
//
//   - database: TEST_DATABASE_URL, else DATABASE_URL (.env/.env.local/shell) renamed to `vewbox_test`; created when
//     missing. The live `vewbox` is refused (src/server/test-guard.ts). The server migrates it on start.
//   - library: TEST_LIBRARY_ROOT, else a marked scratch folder under the OS temp dir (never LIBRARY_ROOT).
//   - address: http://127.0.0.1:4210 (TEST_PORT overrides the port), loopback only; its own build folder (.next-test)
//     so it runs beside a studio dev server on :4200 from the same checkout.
//   - VEWBOX_ALLOW_RESET=1 and STUDIO_SAMPLE_FIXTURE=1: the suites reset it to the sample fixture before every test.
//
// No worker is started: generation is not part of the default suites. Run one against the same database yourself
// when a journey needs it (and only then): `$env:DATABASE_URL=<test url>; pnpm worker`.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { TEST_PORT } from '../src/server/test-guard';
import { describeDb, ensureTestDatabase, resolveTestDatabaseUrl, testLibraryRoot } from './lib/test-db';

const require = createRequire(import.meta.url);
const port = Number(process.env.TEST_PORT || TEST_PORT);
const url = resolveTestDatabaseUrl();
const made = await ensureTestDatabase(url);
const library = testLibraryRoot('web');
console.log(`[test-server] database ${describeDb(url)} (${made}), library ${library}, http://127.0.0.1:${port}`);

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: url,
  LIBRARY_ROOT: library,
  VEWBOX_ALLOW_RESET: '1',
  STUDIO_SAMPLE_FIXTURE: '1',
  NEXT_DIST_DIR: '.next-test',
  // the QA journeys seed worker results (a canonical image, a take) through the API as fixtures: on their test
  // server only, system commands are accepted (src/app/api/commands/route.ts)
  ...(process.env.QA_JOURNEYS === '1' ? { STUDIO_LEGACY_COMMANDS: '1' } : {}),
};
// `next dev` with another build folder rewrites next-env.d.ts (and, if it wants another include, tsconfig.json) to
// point at it; the checkout keeps the committed versions — whatever Next writes is put back
const keep = ['next-env.d.ts', 'tsconfig.json'].map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
const restore = () => { for (const k of keep) { try { if (fs.readFileSync(k.f, 'utf8') !== k.text) fs.writeFileSync(k.f, k.text); } catch { /* gone: leave it */ } } };
const watcher = setInterval(restore, 500);
// a checkout whose node_modules is a junction (a git worktree) needs webpack: Turbopack refuses the junction — detected
// here, or forced with TEST_SERVER_WEBPACK=1
const linkedModules = (() => { try { return fs.lstatSync('node_modules').isSymbolicLink(); } catch { return false; } })();
const webpack = process.env.TEST_SERVER_WEBPACK === '1' || linkedModules ? ['--webpack'] : [];
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...webpack, '-p', String(port), '-H', '127.0.0.1'], { stdio: 'inherit', env });
child.on('exit', (code) => { clearInterval(watcher); restore(); process.exit(code ?? 0); });
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
