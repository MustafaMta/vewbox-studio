import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { assertNotLiveDatabase, databaseName, markTestLibrary, testDatabaseUrl, withDatabase } from '../../src/server/test-guard';

/** THE TEST DATABASE AND LIBRARY (docs/BACKEND-AUDIT-2026-10.md step 1), shared by the vitest worker/API setups and
 *  `pnpm test:server`. The database is TEST_DATABASE_URL, or DATABASE_URL (from the shell, .env, .env.local) with its
 *  name changed to `vewbox_test`; it is created when missing and migrated. The live `vewbox` is refused. */

/** .env then .env.local (later files win), WITHOUT touching process.env: a live DATABASE_URL in a file is only ever
 *  used to derive the test URL from. */
export function readEnvFiles(dir = process.cwd()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    } catch { /* optional */ }
  }
  return out;
}

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
