import fs from 'node:fs';
import path from 'node:path';

/** TEST SAFETY (docs/BACKEND-AUDIT-2026-10.md C3, step 1) — the guards that keep tests, resets and fixtures away from
 *  the producer's studio. Dependency-free on purpose: the vitest and Playwright configs import it as well as the
 *  server.
 *
 *  - The LIVE database is `vewbox` (plus any name in VEWBOX_LIVE_DATABASES, comma-separated). Nothing destructive runs
 *    against it: test configs refuse it, and the reset endpoint refuses it even with the flag.
 *  - A reset needs VEWBOX_ALLOW_RESET=1 in the server's environment AND a database that is not live.
 *  - Library files are removed by a reset only in a library folder marked as a test library (a `.vewbox-test-library`
 *    file at its root, written by the test setups). The live library is never marked, so its files are never
 *    deleted by a reset, whatever the database. */

export const LIVE_DATABASE_NAMES: readonly string[] = ['vewbox'];
export const TEST_LIBRARY_MARKER = '.vewbox-test-library';
/** The database the test configs use when no TEST_DATABASE_URL is given. */
export const DEFAULT_TEST_DATABASE = 'vewbox_test';
/** The port the test web server listens on (never the studio's 4200). */
export const TEST_PORT = 4210;

type Env = Record<string, string | undefined>;

const liveNames = (env: Env = process.env): string[] => [...LIVE_DATABASE_NAMES, ...(env.VEWBOX_LIVE_DATABASES ?? '').split(',').map((s) => s.trim()).filter(Boolean)].map((s) => s.toLowerCase());

/** The database name in a postgres URL, or undefined when the URL cannot be read. */
export function databaseName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
    return name || undefined;
  } catch { return undefined; }
}

/** True for the live database — and for a URL whose database cannot be read (unknown counts as live). */
export function isLiveDatabase(url: string | undefined, env: Env = process.env): boolean {
  const name = databaseName(url);
  return !name || liveNames(env).includes(name.toLowerCase());
}

/** Throw unless `url` names a database that is not live. `what` says who is asking (for the message). */
export function assertNotLiveDatabase(url: string | undefined, what: string, env: Env = process.env): string {
  const name = databaseName(url);
  if (!name) throw new Error(`${what}: refusing to run — the database URL is missing or unreadable. Set TEST_DATABASE_URL to a test database (e.g. …/${DEFAULT_TEST_DATABASE}).`);
  if (isLiveDatabase(url, env)) throw new Error(`${what}: refusing to run against the live database "${name}". Point TEST_DATABASE_URL at a test database (e.g. …/${DEFAULT_TEST_DATABASE}).`);
  return name;
}

/** The same server and credentials with another database name (how a test URL is derived from DATABASE_URL). */
export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(name)}`;
  return u.toString();
}

/** The database the test suites use: TEST_DATABASE_URL, else DATABASE_URL with its database renamed to
 *  `vewbox_test`. Never the live database: the result is checked. */
export function testDatabaseUrl(env: Env = process.env): string {
  const explicit = env.TEST_DATABASE_URL?.trim();
  const url = explicit || (env.DATABASE_URL ? withDatabase(env.DATABASE_URL, DEFAULT_TEST_DATABASE) : '');
  assertNotLiveDatabase(url, 'test database', env);
  return url;
}

/** Whether this server may reset (empty or reload) the studio: only with VEWBOX_ALLOW_RESET=1 on a database that is
 *  not live. Read per call, never cached. */
export function resetAllowed(env: Env = process.env): { ok: true; database: string } | { ok: false; reason: string } {
  if (env.VEWBOX_ALLOW_RESET !== '1') return { ok: false, reason: 'Resetting the studio is disabled. It is a test operation: it is enabled only on a test server (VEWBOX_ALLOW_RESET=1 on a test database).' };
  const name = databaseName(env.DATABASE_URL);
  if (!name || isLiveDatabase(env.DATABASE_URL, env)) return { ok: false, reason: `Resetting is refused on the live database${name ? ` "${name}"` : ''}, even with VEWBOX_ALLOW_RESET=1.` };
  return { ok: true, database: name };
}

/** A library folder the test setups made (it carries the marker). Only such a folder ever loses files to a reset. */
export function isTestLibrary(root: string): boolean {
  try { return fs.statSync(path.join(root, TEST_LIBRARY_MARKER)).isFile(); } catch { return false; }
}

/** Create (or reuse) a test library folder and mark it. */
export function markTestLibrary(root: string): string {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, TEST_LIBRARY_MARKER), `test library created ${new Date().toISOString()}\n`);
  return root;
}
