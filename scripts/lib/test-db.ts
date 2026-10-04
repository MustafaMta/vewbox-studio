import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readEnvFiles } from './env-files';
import { assertNotLiveDatabase, databaseName, markTestLibrary, testDatabaseUrl, withDatabase } from '../../src/server/test-guard';

/** THE TEST DATABASE AND LIBRARY (docs/BACKEND-AUDIT-2026-10.md step 1), shared by the vitest worker/API setups and
 *  `pnpm test:server`. The database is TEST_DATABASE_URL, or DATABASE_URL (from the shell, .env, .env.local) with its
 *  name changed to `vewbox_test`; it is created when missing and migrated. The live `vewbox` is refused. */

export { readEnvFiles };

/** The test database URL for this checkout (files, then the shell). */
export function resolveTestDatabaseUrl(): string {
  return testDatabaseUrl({ ...readEnvFiles(), ...process.env });
}

/** Create the database when it does not exist (connecting to the server's `postgres` database). */
export async function ensureTestDatabase(url: string): Promise<'created' | 'exists'> {
  const name = assertNotLiveDatabase(url, 'ensureTestDatabase');
  const admin = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`;
    if (rows.length) return 'exists';
    await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
    return 'created';
  } finally { await admin.end({ timeout: 5 }); }
}

/** Apply every migration in ./drizzle to the test database. */
export async function migrateTestDatabase(url: string): Promise<void> {
  assertNotLiveDatabase(url, 'migrateTestDatabase');
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try { await migrate(drizzle(sql), { migrationsFolder: path.resolve(process.cwd(), 'drizzle') }); } finally { await sql.end({ timeout: 5 }); }
}

/** A marked scratch library (src/server/test-guard.ts): TEST_LIBRARY_ROOT, else a folder under the OS temp dir. */
export function testLibraryRoot(tag: string): string {
  return markTestLibrary(process.env.TEST_LIBRARY_ROOT || path.join(os.tmpdir(), `vewbox-test-library-${tag}`));
}

export const describeDb = (url: string) => databaseName(url) ?? '(unknown)';

// ------------------------------------------------------------------------------------- the browser suite (docs/TESTING.md)

/** The Playwright suite's own database: E2E_DATABASE_URL, else DATABASE_URL renamed to `vewbox_e2e`. Separate from the
 *  API/worker suites' `vewbox_test` so a `pnpm test:api` run and a `pnpm test:e2e` run never seed over each other.
 *  Never the live database (checked). */
export const E2E_DATABASE = 'vewbox_e2e';
export function resolveE2EDatabaseUrl(): string {
  const env = { ...readEnvFiles(), ...process.env };
  const explicit = env.E2E_DATABASE_URL?.trim();
  const url = explicit || (env.DATABASE_URL ? withDatabase(env.DATABASE_URL, E2E_DATABASE) : '');
  assertNotLiveDatabase(url, 'e2e database');
  return url;
}

/** The browser suite's scratch library: E2E_LIBRARY_ROOT, else `vewbox-e2e-library` under the OS temp dir (marked). */
export function e2eLibraryRoot(): string {
  return markTestLibrary(process.env.E2E_LIBRARY_ROOT || path.join(os.tmpdir(), 'vewbox-e2e-library'));
}

/** Where the producer's library is, READ-ONLY, so the e2e setup can copy the files its fixture names: E2E_SOURCE_LIBRARY,
 *  else LIBRARY_ROOT (.env/.env.local) resolved against this checkout, else against the main checkout of a git worktree
 *  (`.git` as a file pointing at the common dir). Undefined when nothing exists: the setup then makes stand-ins. */
export function liveLibraryRoot(): string | undefined {
  const env = { ...readEnvFiles(), ...process.env };
  if (env.E2E_SOURCE_LIBRARY) return fs.existsSync(env.E2E_SOURCE_LIBRARY) ? path.resolve(env.E2E_SOURCE_LIBRARY) : undefined;
  const rel = env.LIBRARY_ROOT || './var/library';
  if (path.isAbsolute(rel)) return fs.existsSync(rel) ? rel : undefined;
  const here = path.resolve(process.cwd(), rel);
  if (fs.existsSync(here)) return here;
  try {
    const dotGit = path.join(process.cwd(), '.git');
    const text = fs.statSync(dotGit).isFile() ? fs.readFileSync(dotGit, 'utf8') : '';
    const m = /^gitdir:\s*(.+)$/m.exec(text);
    if (m) {
      // <main>/.git/worktrees/<name> → <main>
      const main = path.resolve(path.dirname(m[1].trim()), '..', '..');
      const there = path.resolve(main, rel);
      if (fs.existsSync(there)) return there;
    }
  } catch { /* not a worktree */ }
  return undefined;
}
