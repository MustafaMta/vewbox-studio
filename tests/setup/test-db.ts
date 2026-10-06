import { assertNotLiveDatabase } from '../../src/server/test-guard';
import { describeDb, ensureTestDatabase, migrateTestDatabase } from '../../scripts/lib/test-db';

/** Global setup of the database suites: refuse the live database, create the test database when missing, migrate it.
 *  The config has already pointed DATABASE_URL at the test database (vitest.worker.config.ts). */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  assertNotLiveDatabase(url, 'worker tests');
  const made = await ensureTestDatabase(url!);
  await migrateTestDatabase(url!);
  // the test studio has accepted the terms of use (src/domain/terms.ts): the worker refuses every generating job of a
  // studio that has not; tests/worker/terms-claim.test.ts covers the refusal. Seeds keep the settings (replaceStudio).
  const { bootstrap } = await import('../../src/server/bootstrap');
  const { command } = await import('../../src/server/studio/engine');
  const { TERMS_VERSION } = await import('../../src/domain/terms');
  const { closeDb } = await import('../../src/server/db/client');
  await bootstrap();
  await command('updateSettings', [{ terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), by: 'test setup' } }], 'server');
  await closeDb();
  console.log(`[test-db] ${describeDb(url!)} ${made}, migrated; terms accepted; library ${process.env.LIBRARY_ROOT}`);
}
