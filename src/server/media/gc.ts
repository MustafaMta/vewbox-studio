import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { log } from '../log';
import { isLiveDatabase, isTestLibrary } from '../test-guard';
import { jobStamp } from '../jobs/outputs';
import { thumbPathFor } from './thumbs';

/** THE ORPHAN-FILE COLLECTOR (docs/BACKEND-AUDIT-2026-10.md M5, step 15). A library file no record refers to — left by
 *  a crash between storing a file and committing its record, by an asset row removed without its file, by an old
 *  version of the code — is found and, only when asked, MOVED to the library's `.gc-trash/<run>/` with a manifest
 *  (never deleted: a run can be put back with `restoreGc`). The rules, each of which KEEPS a file:
 *  - only files laid out as the library writes them are considered (`{image|video|audio|subtitle}/yyyy/mm/<name>`);
 *    anything else is reported as unknown and never touched;
 *  - a path an asset row names (its file or its thumbnail), or the thumbnail beside such a file;
 *  - a file named for an asset id that has a row, whatever its path;
 *  - a file of a job still in progress (its name carries the job's stamp, src/server/jobs/outputs.ts);
 *  - a file younger than the grace period (default 24 h: a job may be between storing and committing).
 *  It is a TOOL: nothing runs it on a schedule. A dry run is the default; moving files needs `apply` on a library
 *  marked as a test library, or an explicit live-library confirmation (scripts/gc-library.ts). */

export const LIBRARY_FILE = /^(image|video|audio|subtitle)\/\d{4}\/\d{2}\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const GC_TRASH = '.gc-trash';
export const DEFAULT_GRACE_MS = 24 * 3600_000;

export interface LibraryFile { path: string; bytes: number; mtimeMs: number }
export interface GcReferences { paths: Set<string>; assetIds: Set<string>; activeJobStamps: string[] }
export type KeepReason = 'referenced' | 'thumbnail of a referenced file' | 'asset row exists' | 'job in progress' | 'too recent';
export interface GcPlan {
  scanned: number;
  kept: Record<KeepReason, number>;
  /** files laid out otherwise: never touched */
  unknown: string[];
  candidates: Array<LibraryFile & { reason: string }>;
  bytes: number;
}

/** The id a library file is named for: its name up to the first dot (`gen-abc.a2.mp4` → `gen-abc`). */
export const fileAssetId = (rel: string): string => path.posix.basename(rel).split('.')[0];

/** Pure: which files are orphans. */
export function planGc(files: LibraryFile[], refs: GcReferences, opts: { now: number; graceMs?: number }): GcPlan {
  const grace = opts.graceMs ?? DEFAULT_GRACE_MS;
  const thumbs = new Set([...refs.paths].map(thumbPathFor));
  const kept: Record<KeepReason, number> = { referenced: 0, 'thumbnail of a referenced file': 0, 'asset row exists': 0, 'job in progress': 0, 'too recent': 0 };
  const plan: GcPlan = { scanned: files.length, kept, unknown: [], candidates: [], bytes: 0 };
  for (const f of files) {
    if (!LIBRARY_FILE.test(f.path)) { plan.unknown.push(f.path); continue; }
    const id = fileAssetId(f.path);
    const keep: KeepReason | undefined = refs.paths.has(f.path) ? 'referenced'
      : thumbs.has(f.path) ? 'thumbnail of a referenced file'
      : refs.assetIds.has(id) ? 'asset row exists'
      : refs.activeJobStamps.some((s) => id.includes(`-${s}`)) ? 'job in progress'
      : opts.now - f.mtimeMs < grace ? 'too recent' : undefined;
    if (keep) { kept[keep]++; continue; }
    plan.candidates.push({ ...f, reason: 'no record refers to it' });
    plan.bytes += f.bytes;
  }
  return plan;
}

/** Every file under the library root, relative with `/` (the trash, dot-files and the scratch `tmp` are skipped). */
export async function scanLibrary(root: string): Promise<LibraryFile[]> {
  const out: LibraryFile[] = [];
  const walk = async (dir: string, rel: string) => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || (rel === '' && e.name === 'tmp')) continue;
      const abs = path.join(dir, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(abs, r);
      else if (e.isFile()) { const st = await fsp.stat(abs); out.push({ path: r, bytes: st.size, mtimeMs: st.mtimeMs }); }
    }
  };
  if (fs.existsSync(root)) await walk(root, '');
  return out;
}

const ACTIVE = ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'AWAITING_REVIEW', 'WAITING'];

/** What the database refers to: every asset row's file and thumbnail, every asset id, the jobs in progress. */
export async function libraryReferences(): Promise<GcReferences> {
  const [assets, jobs] = await Promise.all([
    db().select({ id: schema.assets.id, storage: schema.assets.storage, path: schema.assets.path, thumb: schema.assets.thumb }).from(schema.assets),
    db().select({ id: schema.jobs.id }).from(schema.jobs).where(inArray(schema.jobs.status, ACTIVE)),
  ]);
  const paths = new Set<string>();
  for (const a of assets) { if (a.storage === 'LIBRARY' && a.path) paths.add(a.path.replace(/\\/g, '/')); if (a.thumb?.path) paths.add(a.thumb.path.replace(/\\/g, '/')); }
  return { paths, assetIds: new Set(assets.map((a) => a.id)), activeJobStamps: jobs.map((j) => jobStamp(j.id)) };
}

export interface GcRun { mode: 'dry-run' | 'apply'; root: string; run?: string; plan: GcPlan; moved: number; trash?: string; manifest?: string }

/** Refuse to MOVE files out of a library that is not marked as a test library, unless the live library was confirmed
 *  by name — and never with the live database's references against a test library (or the reverse). */
export function assertGcTarget(root: string, databaseUrl: string | undefined, opts: { confirmLiveLibrary?: string } = {}): void {
  const test = isTestLibrary(root);
  const liveDb = isLiveDatabase(databaseUrl);
  if (test && liveDb) throw new Error(`gc: refusing — ${root} is a test library but the database is the live one; its records are not this library's.`);
  if (!test) {
    if (!liveDb) throw new Error(`gc: refusing — ${root} is not a test library but the database is a test database; its records are not this library's.`);
    if (opts.confirmLiveLibrary !== path.resolve(root)) throw new Error(`gc: refusing to move files out of ${root}: it is not marked as a test library. Moving files out of the live library needs --confirm-live-library "${path.resolve(root)}" (and a backup first: docs/OPERATIONS-BACKUP.md).`);
  }
}

/** Find the orphans of `root` and, with `apply`, move them to `<root>/.gc-trash/<run>/` with a manifest (one JSON line
 *  per file: path, bytes, sha256, mtime) and a log line per run. */
export async function collectGarbage(root: string, opts: { apply?: boolean; now?: number; graceMs?: number; databaseUrl?: string; confirmLiveLibrary?: string; references?: GcReferences } = {}): Promise<GcRun> {
  const abs = path.resolve(root);
  const [files, refs] = await Promise.all([scanLibrary(abs), opts.references ? Promise.resolve(opts.references) : libraryReferences()]);
  const plan = planGc(files, refs, { now: opts.now ?? Date.now(), graceMs: opts.graceMs });
  if (!opts.apply) {
    log.info({ root: abs, scanned: plan.scanned, candidates: plan.candidates.length, bytes: plan.bytes, kept: plan.kept, unknown: plan.unknown.length }, 'library gc: dry run');
    return { mode: 'dry-run', root: abs, plan, moved: 0 };
  }
  assertGcTarget(abs, opts.databaseUrl ?? process.env.DATABASE_URL, { confirmLiveLibrary: opts.confirmLiveLibrary });
  const run = new Date().toISOString().replace(/[:.]/g, '-');
  const trash = path.join(abs, GC_TRASH, run);
  const manifest = path.join(trash, 'manifest.jsonl');
  await fsp.mkdir(trash, { recursive: true });
  let moved = 0;
  for (const c of plan.candidates) {
    const from = path.join(abs, ...c.path.split('/'));
    const to = path.join(trash, ...c.path.split('/'));
    const sha256 = crypto.createHash('sha256').update(await fsp.readFile(from)).digest('hex');
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(from, to);
    await fsp.appendFile(manifest, `${JSON.stringify({ path: c.path, bytes: c.bytes, sha256, mtime: new Date(c.mtimeMs).toISOString(), reason: c.reason, movedAt: new Date().toISOString() })}\n`);
    moved++;
  }
  log.warn({ root: abs, run, moved, bytes: plan.bytes, trash }, 'library gc: orphan files moved to the trash');
  return { mode: 'apply', root: abs, run, plan, moved, trash, manifest };
}

/** Put a run's files back where they were (a file now present again is left in the trash and reported). */
export async function restoreGc(root: string, run: string): Promise<{ restored: number; skipped: string[] }> {
  const abs = path.resolve(root);
  if (!/^[0-9TZ-]+$/.test(run)) throw new Error('gc: malformed run name');
  const trash = path.join(abs, GC_TRASH, run);
  const lines = (await fsp.readFile(path.join(trash, 'manifest.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as { path: string });
  let restored = 0; const skipped: string[] = [];
  for (const l of lines) {
    if (!LIBRARY_FILE.test(l.path)) { skipped.push(l.path); continue; }
    const to = path.join(abs, ...l.path.split('/'));
    if (fs.existsSync(to)) { skipped.push(l.path); continue; }
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(path.join(trash, ...l.path.split('/')), to);
    restored++;
  }
  log.info({ root: abs, run, restored, skipped: skipped.length }, 'library gc: run restored');
  return { restored, skipped };
}
