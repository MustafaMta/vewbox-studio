import fsp from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { ffprobe, decodeCheck, libraryRoot } from '../media';
import { log } from '../log';
import { jobScope } from './context';
import { addEvent } from './queue';

/** FAILED OUTPUTS ARE KEPT (directive 2026-10-06 §20: "preserve the failed output; diagnose root cause"). An engine
 *  answer the studio rejects — zero bytes, a truncated or undecodable clip — is written, as it came, to
 *  `LIBRARY_ROOT/evidence/<jobId>/a<attempt>-<name>` and named on the job's event. It is never an asset and never
 *  enters a cut; the library GC leaves the folder alone (it is not a library file name). */

/** Keep `bytes` (or a copy of `file`) as evidence of the running job. Returns the path relative to the library root. */
export async function preserveFailedOutput(name: string, src: { bytes?: Buffer; file?: string }): Promise<string | undefined> {
  const s = jobScope();
  const jobId = s?.jobId || 'no-job';
  const attempt = s?.lease?.attempt ?? 0;
  const rel = path.posix.join('evidence', jobId.replace(/[^\w-]/g, '_'), `a${attempt}-${path.basename(name).replace(/[^\w.-]/g, '_')}`);
  const abs = path.join(libraryRoot(), rel);
  try {
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if (src.bytes) await fsp.writeFile(abs, src.bytes); else if (src.file) await fsp.copyFile(src.file, abs); else return undefined;
    return rel;
  } catch (e) { log.warn({ jobId, name, err: (e as Error).message }, 'could not keep a failed output as evidence'); return undefined; }
}

/** Why a video file an engine produced cannot be used, or null: empty, not readable as media, no picture, or it does
 *  not decode to the end (a truncated download or an engine that died mid-write). */
export async function videoProblem(file: string): Promise<string | null> {
  const st = await fsp.stat(file).catch(() => null);
  if (!st || st.size === 0) return 'empty (0 bytes)';
  try {
    const p = await ffprobe(file);
    if (!p.hasVideo) return `no video stream (${st.size} bytes)`;
    const d = await decodeCheck(file);
    if (!d.ok) return `does not decode cleanly (${st.size} bytes): ${(d.error ?? '').split('\n')[0].slice(0, 200)}`;
    return null;
  } catch (e) { return `not readable as media (${st.size} bytes): ${(e as Error).message.split('\n')[0].slice(0, 200)}`; }
}

/** The provider task ids (ComfyUI prompts, hosted tasks) whose output this job rejected as corrupt: a later attempt —
 *  automatic or the producer's retry — must generate again instead of adopting the same broken result. */
export async function rejectedTaskIds(jobId: string): Promise<string[]> {
  const rows = await db().select({ data: schema.jobEvents.data }).from(schema.jobEvents).where(and(eq(schema.jobEvents.jobId, jobId), eq(schema.jobEvents.level, 'error')));
  return rows.map((r) => (r.data as { rejectedTaskId?: unknown } | null)?.rejectedTaskId).filter((x): x is string => typeof x === 'string');
}

/** Record that a provider task's output was rejected (with the evidence), on the running job. */
export async function rejectTaskOutput(taskId: string, problem: string, evidence?: string): Promise<void> {
  const jobId = jobScope()?.jobId;
  if (!jobId) return;
  await addEvent(jobId, 'error', `engine output rejected (${problem}); kept as evidence${evidence ? ` at ${evidence}` : ''} — the next attempt generates again instead of adopting it`, { rejectedTaskId: taskId, problem, evidence, failureClass: 'OUTPUT_CORRUPTION' }).catch(() => undefined);
}
