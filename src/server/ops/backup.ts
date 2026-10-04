import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { assertNotLiveDatabase, databaseName, isLiveDatabase, withDatabase } from '../test-guard';
import { scanLibrary } from '../media/gc';
import { thumbPathFor } from '../media/thumbs';

/** BACKUP AND RESTORE (docs/BACKEND-AUDIT-2026-10.md M6, step 16; the procedure: docs/OPERATIONS-BACKUP.md).
 *
 *  A backup is a directory: `db.dump` (pg_dump custom format), `library-manifest.json` (every library file a record
 *  refers to — path, sha256, bytes — plus the files nothing refers to and the referenced files that are missing) and
 *  `backup.json` (what was dumped, when, the dump's sha256, the row counts of every table). The dump and the manifest
 *  are ONE CONSISTENT READ: the backup opens a repeatable-read transaction, exports its snapshot, reads the asset rows
 *  and the row counts in it and runs pg_dump on the same snapshot (`--snapshot`), so the manifest lists exactly the
 *  files the dumped records name. Library files are write-once (every attempt writes its own name), so hashing them
 *  just after is hashing what the records point at.
 *
 *  A restore goes into a NEW database (never over an existing one, never the live name) and VERIFIES: the dump's
 *  checksum, the row counts against backup.json, every manifest file against the library (present, same size, same
 *  sha256) and every restored asset row against the manifest.
 *
 *  pg_dump / pg_restore come from PATH, or — PG_DOCKER_CONTAINER=<container> (this machine: vewbox-db-1) — from the
 *  database container through `docker exec`. */

export interface PgTools { kind: 'path' | 'docker'; container?: string }
export function pgTools(env: NodeJS.ProcessEnv = process.env): PgTools {
  if (env.PG_DOCKER_CONTAINER) return { kind: 'docker', container: env.PG_DOCKER_CONTAINER };
  return { kind: 'path' };
}

/** Run pg_dump / pg_restore / createdb-like commands against `url`, through docker when configured. stdin/stdout are
 *  files (the dump streams through the client, never through a shared volume). */
async function runPg(tool: 'pg_dump' | 'pg_restore', url: string, args: string[], io: { stdoutFile?: string; stdinFile?: string } = {}, tools = pgTools()): Promise<{ stderr: string }> {
  const u = new URL(url);
  const conn = tools.kind === 'docker'
    ? ['-h', 'localhost', '-p', '5432', '-U', decodeURIComponent(u.username)]
    : ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username)];
  const pw = decodeURIComponent(u.password);
  const [cmd, argv] = tools.kind === 'docker'
    ? ['docker', ['exec', '-i', '-e', `PGPASSWORD=${pw}`, tools.container!, tool, ...conn, ...args]]
    : [tool, [...conn, ...args]];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { env: tools.kind === 'docker' ? process.env : { ...process.env, PGPASSWORD: pw }, stdio: [io.stdinFile ? 'pipe' : 'ignore', io.stdoutFile ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr!.on('data', (d) => { stderr += String(d); });
    const out = io.stdoutFile ? fs.createWriteStream(io.stdoutFile) : undefined;
    if (out) child.stdout!.pipe(out);
    if (io.stdinFile) fs.createReadStream(io.stdinFile).pipe(child.stdin!);
    child.on('error', reject);
    child.on('close', (code) => {
      const done = () => (code === 0 ? resolve({ stderr }) : reject(new Error(`${tool} exited ${code}: ${stderr.trim().slice(0, 2000)}`)));
      if (out) out.close(() => done()); else done();
    });
  });
}

export const sha256File = async (file: string): Promise<string> => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

export interface ManifestEntry { path: string; sha256: string; bytes: number; assetIds: string[]; role: 'file' | 'thumbnail' }
export interface LibraryManifest { library: string; files: ManifestEntry[]; missing: Array<{ path: string; assetId: string }>; unreferenced: Array<{ path: string; bytes: number }> }
export interface BackupMeta { format: 1; database: string; takenAt: string; snapshot: string; studioVersion: number | null; intakePaused: boolean | null; dump: { file: 'db.dump'; bytes: number; sha256: string }; counts: Record<string, number>; library: { files: number; bytes: number; missing: number; unreferenced: number } }

/** The tables whose row counts the restore compares (every table of the public schema). */
async function tableCounts(q: postgres.Sql | postgres.ReservedSql | postgres.TransactionSql): Promise<Record<string, number>> {
  const tables = await q<{ t: string }[]>`select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`;
  const out: Record<string, number> = {};
  for (const { t } of tables) out[t] = Number((await q.unsafe(`select count(*)::bigint as n from "${t.replace(/"/g, '""')}"`))[0].n);
  return out;
}

/** Take a backup of `databaseUrl` (+ the manifest of `libraryRoot`) into `outDir` (created; must not exist). */
export async function takeBackup(opts: { databaseUrl: string; libraryRoot: string; outDir: string }): Promise<BackupMeta> {
  if (fs.existsSync(opts.outDir)) throw new Error(`backup: ${opts.outDir} already exists`);
  await fsp.mkdir(opts.outDir, { recursive: true });
  const sql = postgres(opts.databaseUrl, { max: 1, onnotice: () => {}, prepare: false });
  const conn = await sql.reserve();
  try {
    // ONE CONSISTENT READ: the snapshot pg_dump runs on is the one the manifest and the counts are read in
    await conn`begin isolation level repeatable read read only`;
    const [{ snapshot }] = await conn<{ snapshot: string }[]>`select pg_export_snapshot() as snapshot`;
    const assets = await conn<{ id: string; storage: string; path: string; thumb: { path?: string } | null }[]>`select id, storage, path, thumb from assets`;
    const meta = await conn<{ version: number; paused: boolean }[]>`select version, intake_paused_at is not null as paused from studio_meta where id = 'studio'`;
    const counts = await tableCounts(conn);
    const dumpFile = path.join(opts.outDir, 'db.dump');
    await runPg('pg_dump', opts.databaseUrl, ['-d', databaseName(opts.databaseUrl)!, '-Fc', '--no-owner', `--snapshot=${snapshot}`], { stdoutFile: dumpFile });
    await conn`commit`;
    // the library: every file a dumped record names, hashed; what nothing names; what is named but missing
    const root = path.resolve(opts.libraryRoot);
    const named = new Map<string, { assetIds: string[]; role: ManifestEntry['role'] }>();
    for (const a of assets) {
      if (a.storage !== 'LIBRARY' || !a.path) continue;
      const p = a.path.replace(/\\/g, '/');
      named.set(p, { assetIds: [...(named.get(p)?.assetIds ?? []), a.id], role: 'file' });
      for (const t of [a.thumb?.path, thumbPathFor(p)]) if (t && fs.existsSync(path.join(root, ...t.split('/')))) named.set(t.replace(/\\/g, '/'), { assetIds: [...(named.get(t)?.assetIds ?? []), a.id], role: 'thumbnail' });
    }
    const files: ManifestEntry[] = []; const missing: LibraryManifest['missing'] = [];
    for (const [p, info] of [...named].sort(([a], [b]) => a.localeCompare(b))) {
      const abs = path.join(root, ...p.split('/'));
      if (!fs.existsSync(abs)) { if (info.role === 'file') for (const id of info.assetIds) missing.push({ path: p, assetId: id }); continue; }
      files.push({ path: p, sha256: await sha256File(abs), bytes: (await fsp.stat(abs)).size, assetIds: info.assetIds, role: info.role });
    }
    const unreferenced = (await scanLibrary(root)).filter((f) => !named.has(f.path)).map((f) => ({ path: f.path, bytes: f.bytes }));
    const manifest: LibraryManifest = { library: root, files, missing, unreferenced };
    await fsp.writeFile(path.join(opts.outDir, 'library-manifest.json'), JSON.stringify(manifest, null, 1));
    const backup: BackupMeta = {
      format: 1, database: databaseName(opts.databaseUrl)!, takenAt: new Date().toISOString(), snapshot, studioVersion: meta[0]?.version ?? null, intakePaused: meta[0]?.paused ?? null,
      dump: { file: 'db.dump', bytes: (await fsp.stat(dumpFile)).size, sha256: await sha256File(dumpFile) }, counts,
      library: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), missing: missing.length, unreferenced: unreferenced.length },
    };
    await fsp.writeFile(path.join(opts.outDir, 'backup.json'), JSON.stringify(backup, null, 2));
    return backup;
  } catch (e) {
    await conn`rollback`.catch(() => undefined);
    throw e;
  } finally { conn.release(); await sql.end({ timeout: 5 }); }
}

export interface RestoreReport { ok: boolean; database: string; checks: Array<{ name: string; ok: boolean; detail?: string }> }

/** Restore `backupDir` into the NEW database `targetUrl` and verify it against `libraryRoot`. */
export async function restoreBackup(opts: { backupDir: string; targetUrl: string; libraryRoot: string }): Promise<RestoreReport> {
  const name = assertNotLiveDatabase(opts.targetUrl, 'restore');
  if (isLiveDatabase(opts.targetUrl)) throw new Error('restore: never into the live database');
  const meta = JSON.parse(await fsp.readFile(path.join(opts.backupDir, 'backup.json'), 'utf8')) as BackupMeta;
  const manifest = JSON.parse(await fsp.readFile(path.join(opts.backupDir, 'library-manifest.json'), 'utf8')) as LibraryManifest;
  const checks: RestoreReport['checks'] = [];
  const dumpFile = path.join(opts.backupDir, meta.dump.file);
  const dumpSha = await sha256File(dumpFile);
  checks.push({ name: 'dump-checksum', ok: dumpSha === meta.dump.sha256, detail: dumpSha === meta.dump.sha256 ? undefined : `sha256 ${dumpSha} ≠ ${meta.dump.sha256}` });
  if (dumpSha !== meta.dump.sha256) return { ok: false, database: name, checks };
  // a NEW database: refused when the name exists
  const admin = postgres(withDatabase(opts.targetUrl, 'postgres'), { max: 1, onnotice: () => {} });
  try {
    if ((await admin`select 1 from pg_database where datname = ${name}`).length) throw new Error(`restore: database "${name}" already exists; a restore goes into a new database`);
    await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
  } finally { await admin.end({ timeout: 5 }); }
  await runPg('pg_restore', opts.targetUrl, ['-d', name, '--no-owner', '--exit-on-error'], { stdinFile: dumpFile });
  const sql = postgres(opts.targetUrl, { max: 1, onnotice: () => {}, prepare: false });
  try {
    const counts = await tableCounts(sql);
    const diff = Object.keys({ ...meta.counts, ...counts }).filter((t) => meta.counts[t] !== counts[t]);
    checks.push({ name: 'row-counts', ok: diff.length === 0, detail: diff.length ? diff.map((t) => `${t}: ${meta.counts[t] ?? 'absent'} → ${counts[t] ?? 'absent'}`).join('; ') : `${Object.keys(counts).length} tables` });
    const root = path.resolve(opts.libraryRoot);
    const bad: string[] = [];
    for (const f of manifest.files) {
      const abs = path.join(root, ...f.path.split('/'));
      if (!fs.existsSync(abs)) { bad.push(`${f.path}: missing`); continue; }
      const st = await fsp.stat(abs);
      if (st.size !== f.bytes) { bad.push(`${f.path}: ${st.size} bytes, expected ${f.bytes}`); continue; }
      if ((await sha256File(abs)) !== f.sha256) bad.push(`${f.path}: content differs (sha256)`);
    }
    checks.push({ name: 'library-matches-manifest', ok: bad.length === 0, detail: bad.length ? bad.slice(0, 20).join('; ') : `${manifest.files.length} files` });
    const inManifest = new Set([...manifest.files.map((f) => f.path), ...manifest.missing.map((m) => m.path)]);
    const rows = await sql<{ id: string; path: string }[]>`select id, path from assets where storage = 'LIBRARY'`;
    const unlisted = rows.filter((r) => !inManifest.has(r.path.replace(/\\/g, '/')));
    checks.push({ name: 'every-asset-row-in-manifest', ok: unlisted.length === 0, detail: unlisted.length ? unlisted.slice(0, 20).map((r) => r.id).join(', ') : `${rows.length} library assets` });
    checks.push({ name: 'no-missing-files-at-backup', ok: manifest.missing.length === 0, detail: manifest.missing.length ? `${manifest.missing.length} file(s) were already missing when the backup was taken: ${manifest.missing.slice(0, 10).map((m) => m.path).join(', ')}` : undefined });
  } finally { await sql.end({ timeout: 5 }); }
  return { ok: checks.every((c) => c.ok), database: name, checks };
}
