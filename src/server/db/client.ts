import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { env } from '../env';

/** ONE CONNECTION POOL PER PROCESS — the web server and the worker each hold their own. `postgres.js` keeps the
 *  pool small and reconnects on its own; Drizzle gives typed queries over it. */

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __vewboxSql?: Sql; __vewboxDb?: Db };

export function sql(): Sql {
  if (!g.__vewboxSql) {
    g.__vewboxSql = postgres(env().DATABASE_URL, { max: 8, idle_timeout: 30, connect_timeout: 10, prepare: false, onnotice: () => {} });
  }
  return g.__vewboxSql;
}

export function db(): Db {
  if (!g.__vewboxDb) g.__vewboxDb = drizzle(sql(), { schema });
  return g.__vewboxDb;
}

export async function closeDb() {
  if (g.__vewboxSql) { await g.__vewboxSql.end({ timeout: 5 }); g.__vewboxSql = undefined; g.__vewboxDb = undefined; }
}

export { schema };
