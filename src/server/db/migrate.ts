import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './client';
import { log } from '../log';

/** Apply every pending migration from ./drizzle. Safe to run on every start: Drizzle records what it applied. */
export async function runMigrations() {
  const folder = path.resolve(process.cwd(), 'drizzle');
  const t0 = Date.now();
  await migrate(db(), { migrationsFolder: folder });
  log.info({ ms: Date.now() - t0, folder }, 'migrations applied');
}
