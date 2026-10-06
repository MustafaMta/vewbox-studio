import { assertNotLiveDatabase } from '../../src/server/test-guard';
import { describeDb, ensureTestDatabase, lockTestDatabase, migrateTestDatabase } from '../../scripts/lib/test-db';

/** Global setup of the database suites: refuse the live database, create the test database when missing, migrate it,
 *  and hold the database for this run (one suite run per test database: a second run waits). The config has already
 *  pointed DATABASE_URL at the test database (vitest.worker.config.ts). */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  assertNotLiveDatabase(url, 'worker tests');
  const made = await ensureTestDatabase(url!);
  const release = await lockTestDatabase(url!, 'the worker suite');
  await migrateTestDatabase(url!);
  console.log(`[test-db] ${describeDb(url!)} ${made}, migrated, held for this run; library ${process.env.LIBRARY_ROOT}`);
  return async () => { await release(); };
}
