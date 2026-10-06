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
  // the test studio has accepted the terms of use (src/domain/terms.ts): the worker refuses every generating job of a
  // studio that has not (tests/worker/failure-recovery.test.ts covers the refusal). Seeds keep the settings.
  const { bootstrap } = await import('../../src/server/bootstrap');
  const { command } = await import('../../src/server/studio/engine');
  const { TERMS_VERSION } = await import('../../src/domain/terms');
  const { closeDb } = await import('../../src/server/db/client');
  await bootstrap();
  await command('updateSettings', [{ terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), by: 'test setup' } }], 'server');
  await closeDb();
  console.log(`[test-db] ${describeDb(url!)} ${made}, migrated, held for this run, terms accepted; library ${process.env.LIBRARY_ROOT}`);
  return async () => { await release(); };
}
