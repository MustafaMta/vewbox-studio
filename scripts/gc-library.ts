// `tsx scripts/gc-library.ts [--library <dir>] [--grace-hours 24] [--apply] [--confirm-live-library <dir>] [--restore <run>]`
//
// THE ORPHAN-FILE COLLECTOR (src/server/media/gc.ts, docs/BACKEND-AUDIT-2026-10.md step 15). A DRY RUN by default: it
// lists the library files no record refers to (and why every other file is kept) and changes nothing. `--apply` MOVES
// the orphans to `<library>/.gc-trash/<run>/` with a manifest (never deletes); `--restore <run>` puts a run back.
// Moving files needs a library marked as a test library, or `--confirm-live-library <the library's full path>` — and,
// for the live library, a backup first (docs/OPERATIONS-BACKUP.md). Nothing schedules this script.
// The database is DATABASE_URL (the library's own: a test library with the live database is refused, and the reverse).
import path from 'node:path';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = (name: string) => process.argv.includes(`--${name}`);

const { env } = await import('../src/server/env');
const { collectGarbage, restoreGc } = await import('../src/server/media/gc');
const { closeDb } = await import('../src/server/db/client');
const library = path.resolve(arg('library') ?? env().LIBRARY_ROOT);
try {
  const run = arg('restore');
  if (run) console.log(JSON.stringify({ library, run, ...(await restoreGc(library, run)) }, null, 2));
  else {
    const graceHours = Number(arg('grace-hours') ?? 24);
    const r = await collectGarbage(library, { apply: has('apply'), graceMs: graceHours * 3600_000, confirmLiveLibrary: arg('confirm-live-library') && path.resolve(arg('confirm-live-library')!) });
    console.log(JSON.stringify({ mode: r.mode, library: r.root, run: r.run, scanned: r.plan.scanned, kept: r.plan.kept, unknown: r.plan.unknown, orphans: r.plan.candidates.map((c) => ({ path: c.path, bytes: c.bytes, mtime: new Date(c.mtimeMs).toISOString() })), bytes: r.plan.bytes, moved: r.moved, trash: r.trash, manifest: r.manifest }, null, 2));
  }
} finally { await closeDb(); }
