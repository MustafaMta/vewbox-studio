// `tsx --env-file=.env --env-file=.env.local scripts/backup.ts [--out <dir>] [--library <dir>] [--database-url <url>] [--require-paused]`
//
// THE BACKUP (docs/OPERATIONS-BACKUP.md, src/server/ops/backup.ts): pg_dump -Fc of the studio database and a manifest
// of the library (path, sha256, bytes of every file a record names; what nothing names; what is named but missing),
// taken in ONE consistent read (a repeatable-read snapshot exported to pg_dump). Default output:
// var/backups/backup-<timestamp>/ (db.dump, library-manifest.json, backup.json). The library files themselves are not
// copied (back up the library folder with the operating system's tools; the manifest is what the restore verifies
// it against). --require-paused refuses while job intake is open (scripts/studio-intake.ts pause "backup").
// pg_dump: from PATH, or PG_DOCKER_CONTAINER=vewbox-db-1 to run it in the database container.
import path from 'node:path';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const { takeBackup } = await import('../src/server/ops/backup');
const databaseUrl = arg('database-url') ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('backup: no DATABASE_URL');
const library = path.resolve(arg('library') ?? process.env.LIBRARY_ROOT ?? './var/library');
const out = path.resolve(arg('out') ?? path.join('var', 'backups', `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`));
const meta = await takeBackup({ databaseUrl, libraryRoot: library, outDir: out });
if (process.argv.includes('--require-paused') && meta.intakePaused === false) {
  console.error(`backup: job intake was OPEN while the backup was taken (${out}); pause it first or drop --require-paused.`);
  process.exit(2);
}
console.log(JSON.stringify({ out, ...meta, counts: undefined, tables: Object.keys(meta.counts).length }, null, 2));
