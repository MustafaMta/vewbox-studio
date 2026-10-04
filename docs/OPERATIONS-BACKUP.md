# Backup and restore — procedure and drill

Step 16 of docs/BACKEND-AUDIT-2026-10.md (finding M6). Code: `src/server/ops/backup.ts`, `scripts/backup.ts`,
`scripts/restore.ts`. Test: `tests/worker/backup-drill.test.ts`.

## What a backup is

A directory (default `var/backups/backup-<timestamp>/`) with three files:

| File | Content |
|---|---|
| `db.dump` | `pg_dump -Fc --no-owner` of the studio database |
| `library-manifest.json` | every library file a record names (path, sha256, bytes, asset ids, `file` or `thumbnail`); the files nothing names (`unreferenced`); files a record names that were already missing (`missing`) |
| `backup.json` | database name, time, the exported snapshot id, studio version, whether job intake was paused, the dump's size and sha256, the row count of every table |

**One consistent read.** The script opens a repeatable-read transaction, exports its snapshot
(`pg_export_snapshot()`), reads the asset rows and every table's row count in it, and runs `pg_dump --snapshot=…` on
that same snapshot. The manifest therefore lists exactly the files the dumped records name, and the counts are the
dump's. Library files are write-once (every job attempt writes its own file name), so hashing them right after the
read hashes what the records point at.

The manifest does **not** copy the library. Copy the library folder (`LIBRARY_ROOT`, by default `var/library`) with
the operating system's tools at the same time; the manifest is what a restore verifies that copy against.

## Taking a backup

1. Pause job intake so nothing new is generated while the library is copied:
   `pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts pause "backup"`.
2. `pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backup.ts --require-paused`
   (`--out <dir>`, `--library <dir>`, `--database-url <url>` override the defaults). `pg_dump` comes from `PATH`; on
   this machine it lives in the database container, so set `PG_DOCKER_CONTAINER=vewbox-db-1` (the script then runs
   `docker exec -i vewbox-db-1 pg_dump …` and streams the dump back).
3. Copy the library folder next to the backup (for example `robocopy var\library <backup>\library /E`).
4. Resume intake: `scripts/studio-intake.ts resume`.
5. Keep at least the last seven backups; take one before every migration.

## Restoring

`pnpm exec tsx --env-file=.env --env-file=.env.local scripts/restore.ts --backup <dir> --database <new name> --library <library copy>`

- The restore goes into a **new** database on the server of `DATABASE_URL` (or `--server-url`). It is refused when the
  name exists and for the live name `vewbox`. It never overwrites anything.
- It then verifies, and prints a report (exit code 1 when any check fails):
  - `dump-checksum` — the dump is the one the backup wrote;
  - `row-counts` — every table has the row count recorded at backup time;
  - `library-matches-manifest` — every manifest file is in the library, same size, same sha256;
  - `every-asset-row-in-manifest` — every restored library asset is in the manifest;
  - `no-missing-files-at-backup` — the backup itself did not already lack files.
- Only when every check is green: stop the web server and the worker, point `DATABASE_URL` (and `LIBRARY_ROOT`) at the
  restored database and library, start them (they migrate on boot).

## The drill (2026-10-04)

Run on the isolated test database `vewbox_test_backend` and scratch libraries only — never the live database or the
live library.

1. Test studio: the sample fixture plus three library assets with real files (video 64 KB, picture 2 KB with its
   thumbnail, audio 8 KB) in a scratch, test-marked library.
2. `scripts/backup.ts --library <scratch>/library --out <scratch>/backup`: 43 tables, dump 223 539 bytes
   (sha256 `49abe088…`), manifest 4 files / 75 781 bytes, 0 missing, 0 unreferenced, studio version 4205.
3. The library copied to `<scratch>/library-copy`.
4. `scripts/restore.ts --backup <scratch>/backup --database vewbox_restore_drill_cli --library <scratch>/library-copy`:
   exit 0 — dump checksum, row counts (43 tables), library (4 files), asset rows (3) and no-missing all green.
5. The drill database was dropped afterwards.

`tests/worker/backup-drill.test.ts` repeats the drill on every worker-suite run (when `pg_dump` is available) and adds
the refusals: restoring into an existing name, into `vewbox`, and a library copy with one changed file
(`library-matches-manifest` fails with "content differs").

## Related tools

- `scripts/gc-library.ts` — the orphan-file collector (step 15). A dry run lists library files no record refers to;
  `--apply` moves them to `<library>/.gc-trash/<run>/` with a manifest, `--restore <run>` puts them back. On the live
  library it needs `--confirm-live-library <full path>` and a backup first. Nothing runs it on a schedule.
