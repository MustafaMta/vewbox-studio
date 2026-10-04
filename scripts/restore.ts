// `tsx --env-file=.env --env-file=.env.local scripts/restore.ts --backup <dir> --database <new name> [--library <dir>] [--server-url <url>]`
//
// THE RESTORE (docs/OPERATIONS-BACKUP.md, src/server/ops/backup.ts): restores a backup into a NEW database (refused if
// the name exists, and never the live `vewbox`) on the server of DATABASE_URL (or --server-url), then VERIFIES: the
// dump's sha256, every table's row count against the backup, every manifest file in the library (present, same size,
// same sha256) and every restored asset row against the manifest. Prints the report; exits 1 when a check fails.
// Point the studio at the restored database only after the report is all green.
// pg_restore: from PATH, or PG_DOCKER_CONTAINER=vewbox-db-1 to run it in the database container.
import path from 'node:path';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const { restoreBackup } = await import('../src/server/ops/backup');
const { withDatabase } = await import('../src/server/test-guard');
const backup = arg('backup'); const name = arg('database');
if (!backup || !name) throw new Error('restore: --backup <dir> and --database <new name> are required');
const server = arg('server-url') ?? process.env.DATABASE_URL;
if (!server) throw new Error('restore: no server (DATABASE_URL or --server-url)');
const report = await restoreBackup({ backupDir: path.resolve(backup), targetUrl: withDatabase(server, name), libraryRoot: path.resolve(arg('library') ?? process.env.LIBRARY_ROOT ?? './var/library') });
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
