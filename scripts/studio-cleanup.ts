/** STUDIO CLEANUP — removes old generated and demo content in two explicit steps (phased-rebuild directive, Phase 0).
 *
 *    plan:     pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-cleanup.ts plan  <backupDir>
 *    execute:  pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-cleanup.ts execute <backupDir>
 *
 *  `plan` writes <backupDir>/manifest.json: every table with its row count and what happens to it, every asset row,
 *  every library file, the ComfyUI staging/output volume listings and the stray logs. Nothing is changed.
 *  `execute` refuses unless the manifest exists, job intake is paused and nothing is running. It then dumps the whole
 *  database (pg_dump custom format) into the backup directory, MOVES the library and the logs there, archives and
 *  empties the two ComfyUI scratch volumes, replaces the studio with an empty one (settings kept), clears the
 *  operational history, and writes result.json. Nothing outside the manifest is touched: model weights, the LLM
 *  volume, the database volume itself, credentials, the organisation registry, the model/workflow registry, earlier
 *  backups and every other Docker volume stay as they are. Everything removed can be restored from the backup. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql as dsql } from 'drizzle-orm';
import { db, sql } from '@/server/db/client';
import { intakeState } from '@/server/jobs/intake';
import { replaceStudio } from '@/server/studio/seed';

const run = promisify(execFile);
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'vewbox-db-1';
const DB_USER = process.env.POSTGRES_USER ?? 'vewbox';
const DB_NAME = process.env.POSTGRES_DB ?? 'vewbox';
const LIBRARY = path.resolve(process.env.LIBRARY_ROOT ?? process.env.LIBRARY_DIR ?? './var/library');
const VAR = path.resolve('./var');
const SCRATCH_VOLUMES = ['vewbox_comfyin', 'vewbox_comfyout'];

/** Studio content (removed by the empty-studio replacement; children cascade). */
const CONTENT = ['shows', 'seasons', 'productions', 'scenes', 'shots', 'takes', 'characters', 'character_usage', 'locations', 'assets'];
/** Operational history of the old work (deleted). */
const HISTORY = ['jobs', 'job_events', 'agent_runs', 'studio_events', 'handoffs', 'qa_reports', 'approvals', 'reliability_events', 'metrics', 'proposals'];
/** Kept: the organisation and model registries (synced from code), settings, the studio row, migrations. */
const RETAIN = ['departments', 'agents', 'tools', 'skills', 'models', 'workflows', 'settings', 'studio_meta'];

async function count(table: string): Promise<number> {
  const r = await db().execute(dsql.raw(`select count(*)::int as n from "${table}"`));
  return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
}

async function walk(dir: string): Promise<Array<{ path: string; bytes: number }>> {
  if (!fs.existsSync(dir)) return [];
  const out: Array<{ path: string; bytes: number }> = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push({ path: path.relative(process.cwd(), p), bytes: (await fsp.stat(p)).size });
  }
  return out;
}

async function volumeListing(volume: string): Promise<{ volume: string; files: string[] }> {
  try { const { stdout } = await run('docker', ['run', '--rm', '-v', `${volume}:/v:ro`, 'alpine', 'sh', '-c', 'cd /v && find . -type f -exec ls -l {} \\;'], { maxBuffer: 32 * 1024 * 1024 }); return { volume, files: stdout.split('\n').filter(Boolean) }; }
  catch (e) { return { volume, files: [`(could not list: ${(e as Error).message.split('\n')[0]})`] }; }
}

async function plan(backupDir: string) {
  await fsp.mkdir(backupDir, { recursive: true });
  const tables: Record<string, { rows: number; action: string }> = {};
  for (const t of CONTENT) tables[t] = { rows: await count(t), action: 'remove (empty studio)' };
  for (const t of HISTORY) tables[t] = { rows: await count(t), action: 'remove (operational history of the old work)' };
  for (const t of RETAIN) tables[t] = { rows: await count(t), action: 'retain' };
  const assets = await db().execute(dsql`select id, kind, origin, sample, label, path, bytes from assets order by origin, kind, id`);
  const library = await walk(LIBRARY);
  const logs = (await fsp.readdir(VAR, { withFileTypes: true })).filter((e) => e.isFile() && e.name.endsWith('.log')).map((e) => path.join('var', e.name));
  const volumes = await Promise.all(SCRATCH_VOLUMES.map(volumeListing));
  const manifest = {
    createdAt: new Date().toISOString(),
    purpose: 'Phase 0 — remove old demonstration projects, generated media, temporary outputs, obsolete jobs and demo records',
    backupDir,
    tables,
    assets,
    files: { library: { root: path.relative(process.cwd(), LIBRARY), count: library.length, bytes: library.reduce((a, f) => a + f.bytes, 0), entries: library }, logs },
    scratchVolumes: volumes,
    retained: {
      docker: ['vewbox_models_store / vewbox_ollama_store (the model store, D:\\models\\vewbox-models.vhdx: every weight; never touched)','vewbox_pgdata (the database; rows cleaned, volume kept)', 'vewbox_nvjit (compiler cache)', 'vewbox_workertmp (empty)', 'volexar-studio_models (not this compose project — untouched)'],
      host: ['the repository and its Git history (docs/evidence included)', '.env / .env.local (credentials)', 'var/backups (earlier backups)', 'tests/fixtures', 'the sample-studio code and its bundled media (no longer seeded on first start)'],
    },
  };
  await fsp.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function execute(backupDir: string) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`No manifest at ${manifestPath}: run "plan" first and read it.`);
  const intake = await intakeState();
  if (!intake.paused) throw new Error('Job intake is open: pause it first (scripts/studio-intake.ts pause "…").');
  const active = await db().execute(dsql`select count(*)::int as n from jobs where status in ('PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')`);
  if (Number((active as unknown as Array<{ n: number }>)[0]?.n) > 0) throw new Error('Jobs are still running: stop or cancel them first.');
  const result: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // 1. the whole database, restorable with pg_restore
  const dumpPath = path.join(backupDir, 'database.dump');
  const { stdout } = await run('docker', ['exec', DB_CONTAINER, 'pg_dump', '-U', DB_USER, '-d', DB_NAME, '-Fc'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 * 1024 });
  await fsp.writeFile(dumpPath, stdout);
  result.databaseDump = { path: dumpPath, bytes: stdout.length };

  // 2. files: moved, not deleted
  // the library folder itself is a bind-mount point of the containers: its CONTENTS move, the folder stays
  const libBackup = path.join(backupDir, 'library');
  await fsp.mkdir(libBackup, { recursive: true });
  // file by file: on Windows a directory with an open handle (a watcher, a container share) cannot be renamed, its
  // files can; empty folders left behind are removed when possible
  const movedFiles: string[] = [];
  for (const f of await walk(LIBRARY)) {
    const rel = path.relative(LIBRARY, path.resolve(f.path));
    await fsp.mkdir(path.dirname(path.join(libBackup, rel)), { recursive: true });
    await fsp.rename(path.resolve(f.path), path.join(libBackup, rel));
    movedFiles.push(rel);
  }
  for (const e of fs.existsSync(LIBRARY) ? await fsp.readdir(LIBRARY) : []) await fsp.rm(path.join(LIBRARY, e), { recursive: true }).catch(() => { /* an empty folder still held open: harmless */ });
  result.libraryFilesMoved = movedFiles.length;
  await fsp.mkdir(path.join(backupDir, 'logs'), { recursive: true });
  const logs: string[] = [];
  for (const e of await fsp.readdir(VAR, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.log')) { await fsp.rename(path.join(VAR, e.name), path.join(backupDir, 'logs', e.name)); logs.push(e.name); }
  result.moved = { library: path.join(backupDir, 'library'), logs };

  // 3. ComfyUI scratch volumes: archived into the backup, then emptied (the volumes themselves stay)
  const archives: string[] = [];
  for (const v of SCRATCH_VOLUMES) {
    await run('docker', ['run', '--rm', '-v', `${v}:/v`, '-v', `${path.resolve(backupDir)}:/b`, 'alpine', 'sh', '-c', `tar -C /v -czf /b/${v}.tar.gz . && find /v -mindepth 1 -delete`]);
    archives.push(`${v}.tar.gz`);
  }
  result.scratchVolumes = archives;

  // 4. the studio: an empty one with the settings kept; then the old work's history
  const replaced = await replaceStudio('empty', true);
  await db().transaction(async (tx) => { for (const t of HISTORY) await tx.execute(dsql.raw(`delete from "${t}"`)); });
  const after: Record<string, number> = {};
  for (const t of [...CONTENT, ...HISTORY, ...RETAIN]) after[t] = await count(t);
  result.studio = { version: replaced.version, after };
  result.finishedAt = new Date().toISOString();
  await fsp.writeFile(path.join(backupDir, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

const [mode, dir] = process.argv.slice(2);
if (!dir || !['plan', 'execute'].includes(mode)) { console.error('usage: studio-cleanup.ts plan|execute <backupDir>'); process.exit(2); }
try {
  const out = mode === 'plan' ? await plan(path.resolve(dir)) : await execute(path.resolve(dir));
  const summary = mode === 'plan'
    ? { tables: (out as Awaited<ReturnType<typeof plan>>).tables, libraryFiles: (out as Awaited<ReturnType<typeof plan>>).files.library.count, libraryBytes: (out as Awaited<ReturnType<typeof plan>>).files.library.bytes, scratch: (out as Awaited<ReturnType<typeof plan>>).scratchVolumes.map((v) => ({ volume: v.volume, files: v.files.length })) }
    : out;
  console.log(JSON.stringify(summary, null, 2));
} finally { await sql().end(); }
