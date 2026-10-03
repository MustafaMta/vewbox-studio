import { assertNotLiveDatabase } from '../../src/server/test-guard';
import { describeDb, ensureTestDatabase, migrateTestDatabase } from '../../scripts/lib/test-db';

/** Global setup of the database suites: refuse the live database, create the test database when missing, migrate it.
 *  The config has already pointed DATABASE_URL at the test database (vitest.worker.config.ts). */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  assertNotLiveDatabase(url, 'worker tests');
  const made = await ensureTestDatabase(url!);
  await migrateTestDatabase(url!);
  console.log(`[test-db] ${describeDb(url!)} ${made}, migrated; library ${process.env.LIBRARY_ROOT}`);
}
