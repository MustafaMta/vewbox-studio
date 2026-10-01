import { runMigrations } from './migrate';
import { closeDb } from './client';
import { seedIfEmpty } from '../studio/seed';

/** `pnpm db:migrate` — apply migrations (and seed an empty database) from the command line. */
const cmd = process.argv[2] ?? 'migrate';
(async () => {
  if (cmd === 'migrate') { await runMigrations(); const seeded = await seedIfEmpty(); console.log(seeded ? 'migrated and seeded' : 'migrated'); }
  else { console.error(`unknown command ${cmd}`); process.exitCode = 1; }
  await closeDb();
})().catch((e) => { console.error(e); process.exit(1); });
