import { runMigrations } from './db/migrate';
import { seedIfEmpty } from './studio/seed';
import { sql } from './db/client';
import { log } from './log';

/** START-UP — migrations, then the sample seed on an empty database. Idempotent; the web server and the worker
 *  both call it, serialised by an advisory lock so two processes starting together do not race. */

const g = globalThis as unknown as { __vewboxBooted?: Promise<void> };

export function bootstrap(): Promise<void> {
  if (g.__vewboxBooted) return g.__vewboxBooted;
  g.__vewboxBooted = (async () => {
    const s = sql();
    let attempt = 0;
    // the database may still be starting
    for (;;) {
      try { await s`select 1`; break; } catch (e) {
        attempt++;
        if (attempt > 60) throw e;
        log.warn({ attempt }, 'database not ready, waiting');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    await s.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('vewbox-bootstrap'))`;
      await runMigrations();
      const seeded = await seedIfEmpty();
      if (seeded) log.info('seeded the sample studio');
    });
  })();
  g.__vewboxBooted.catch((e) => { log.error({ err: e }, 'bootstrap failed'); g.__vewboxBooted = undefined; });
  return g.__vewboxBooted;
}
