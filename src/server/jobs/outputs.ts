import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import type { AssetKind } from '@/domain/types';
import { db, schema } from '../db/client';
import { adoptFile, libraryRoot, storeBuffer, type StoredFile } from '../media';
import { log } from '../log';
import { addEvent } from './queue';

/** A JOB'S OUTPUTS (docs/BACKEND-AUDIT-2026-10.md C2, step 6). Everything a job writes into the studio carries an id
 *  derived from the job and the output's name — `hash(jobId, name)` — never a random one, so:
 *  - a retry after a crash mints the SAME ids: it finds what the earlier attempt committed (and returns it) instead of
 *    recording a second take or a second cut;
 *  - every file a job wrote is recognisable by its name alone: `{prefix}-{12 hex of the job}{8 hex of the name}`,
 *    plus the attempt that wrote it (`.a{n}` before the extension, src/server/media.ts `libraryPathFor`). Two
 *    attempts never write the same file, and the GC below removes exactly the files of ONE job that no asset row
 *    points at — never anything else in the library. */

const hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** The 12-hex stamp every output id of a job starts with (after its prefix). */
export const jobStamp = (jobId: string): string => hex(`job\n${jobId}`).slice(0, 12);

/** The deterministic id of a job's output `name` (`gen-…`, `take-…`, `export-…`). */
export function outputId(jobId: string, name: string, prefix = 'gen'): string {
  return `${prefix}-${jobStamp(jobId)}${hex(`${jobId}\n${name}`).slice(0, 8)}`;
}

/** A stable 31-bit seed for a job's step: the same job draws the same picture on every attempt (so a ComfyUI prompt
 *  key finds the prompt an earlier attempt submitted, step 7). */
export function stableSeed(jobId: string, name: string): number {
  return parseInt(hex(`seed\n${jobId}\n${name}`).slice(0, 8), 16) % 2 ** 31;
}

export const attemptTag = (attempt: number): string => `a${Math.max(1, Math.floor(attempt))}`;

export interface JobOutputs {
  /** the deterministic id of an output */
  id: (name: string, prefix?: string) => string;
  /** move a produced file into the library as output `name` (file named for this attempt) */
  adopt: (name: string, file: string, opts?: { expectKind?: AssetKind }) => Promise<{ id: string; stored: StoredFile }>;
  /** write bytes into the library as output `name` */
  store: (name: string, buf: Buffer, opts?: { declaredType?: string; expectKind?: AssetKind; probe?: boolean }) => Promise<{ id: string; stored: StoredFile }>;
}

export function jobOutputs(job: { id: string; attempts: number }): JobOutputs {
  const tag = attemptTag(job.attempts);
  const id = (name: string, prefix = 'gen') => outputId(job.id, name, prefix);
  return {
    id,
    adopt: async (name, file, opts = {}) => { const assetId = id(name); return { id: assetId, stored: await adoptFile(assetId, file, { ...opts, tag }) }; },
    store: async (name, buf, opts = {}) => { const assetId = id(name); return { id: assetId, stored: await storeBuffer(assetId, buf, { ...opts, tag }) }; },
  };
}

// --------------------------------------------------------------------------------------------------- the job GC

const KIND_DIRS = ['image', 'video', 'audio', 'subtitle'];
const FILE = /^(?<id>[a-z]+-[0-9a-f]{20})(?:\.a(?<attempt>\d+))?\.(?:thumb\.jpg|[a-z0-9]+)(?:\.part)?$/;

/** A library file of one job: its path relative to the root, the output id and the attempt that wrote it. */
export interface JobFile { rel: string; id: string; attempt?: number }

/** Every library file whose name carries this job's stamp. Reads directory names only. */
export async function jobFiles(jobId: string, root = libraryRoot()): Promise<JobFile[]> {
  const stamp = jobStamp(jobId);
  const out: JobFile[] = [];
  const list = async (dir: string) => { try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; } };
  for (const kind of KIND_DIRS) {
    for (const y of await list(path.join(root, kind))) {
      if (!y.isDirectory() || !/^\d{4}$/.test(y.name)) continue;
      for (const m of await list(path.join(root, kind, y.name))) {
        if (!m.isDirectory() || !/^\d{2}$/.test(m.name)) continue;
        for (const f of await list(path.join(root, kind, y.name, m.name))) {
          if (!f.isFile()) continue;
          const g = FILE.exec(f.name)?.groups;
          if (!g || g.id.slice(g.id.indexOf('-') + 1, g.id.indexOf('-') + 13) !== stamp) continue;
          out.push({ rel: path.posix.join(kind, y.name, m.name, f.name), id: g.id, attempt: g.attempt ? Number(g.attempt) : undefined });
        }
      }
    }
  }
  return out;
}

/** THE JOB GC — remove the library files THIS job wrote that no asset row references (an attempt that crashed or
 *  failed between storing a file and committing its record). `attempts`: only files written by these attempts
 *  (default: every attempt). Each removal is logged and recorded on the job. Safe at any time for the attempts it is
 *  given, as long as none of them can still commit: the caller sweeps an attempt only once it has ended (or, at the
 *  start of attempt n, the attempts before n — their commits are fenced off by the lease). */
export async function sweepJobFiles(jobId: string, opts: { attempts?: (attempt: number | undefined) => boolean; reason: string; root?: string }): Promise<string[]> {
  const root = opts.root ?? libraryRoot();
  const files = (await jobFiles(jobId, root)).filter((f) => !opts.attempts || opts.attempts(f.attempt));
  if (!files.length) return [];
  const ids = Array.from(new Set(files.map((f) => f.id)));
  const rows = await db().select({ id: schema.assets.id, path: schema.assets.path, provenance: schema.assets.provenance, thumb: schema.assets.thumb }).from(schema.assets).where(inArray(schema.assets.id, ids));
  const referenced = new Set<string>();
  for (const r of rows) {
    for (const p of [r.path, r.provenance?.path, r.thumb?.path]) if (typeof p === 'string' && p) referenced.add(p.replace(/\\/g, '/'));
  }
  const removed: string[] = [];
  for (const f of files) {
    if (referenced.has(f.rel) || referenced.has(f.rel.replace(/\.part$/, ''))) continue;
    const abs = path.resolve(root, f.rel);
    if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
    try { await fsp.rm(abs, { force: true }); removed.push(f.rel); } catch (e) { log.warn({ jobId, file: f.rel, err: (e as Error).message }, 'job GC: could not remove an orphan file'); }
  }
  if (removed.length) {
    log.warn({ jobId, removed, reason: opts.reason }, 'job GC: removed files this job wrote that no record references');
    await addEvent(jobId, 'warn', `cleaned ${removed.length} orphan file(s) this job wrote (${opts.reason})`, { removed }).catch(() => undefined);
  }
  return removed;
}
