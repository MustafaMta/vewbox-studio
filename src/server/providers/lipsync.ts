import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { followJobSignal, stopReasonOf } from '../jobs/context';

/** THE LIP-SYNC CORRECTOR CLIENT — the `lipsync` service (docker/lipsync: LatentSync 1.6 with a YuNet + MediaPipe face
 *  tracker; no InsightFace). It redraws the MOUTH REGION of an existing take so it follows the authoritative audio; the
 *  frame count, frame rate, size, the take's own audio and every pixel outside the mouth region are kept. It never
 *  generates a video (MiniMax H3 stays the only generator).
 *
 *  Like the QA client (qa-service.ts), an offline or refusing service answers `{ available: false, reason }` instead of
 *  throwing; a stopped job's reason is rethrown. */

export interface LipsyncUnavailable { available: false; reason: string; status?: number }

export interface LipsyncReport {
  frames: number; fps: number; size: number[]; outFrames: number;
  track: { frames: number; framesWithFace: number; framesBridged: number; framesEdited: number; faceHeightPx: { median: number; min: number } | null; identityToReference: { median: number; min: number } | null; lostRuns: number[][]; minFacePx: number };
  params: Record<string, number>;
  mouthChangeMad: number | null;
  timingS: Record<string, number>;
  vramPeakAllocatedMb: number; vramPeakReservedMb: number;
  load: Record<string, number>;
  model: string;
  gpuAfter?: { usedMb: number; totalMb: number } | null;
}
export interface LipsyncResult { available: true; file: string; bytes: number; report: LipsyncReport }

export interface LipsyncHealth { available: boolean; reason?: string | null; loaded?: boolean; model?: string; detector?: string; licences?: Record<string, string>; defaults?: Record<string, number>; maxSeconds?: number }

const base = () => env().LIPSYNC_URL.replace(/\/$/, '');
export const lipsyncConfigured = () => Boolean(env().LIPSYNC_URL);

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
function camelize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camelize);
  if (v === null || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [camel(k), camelize(x)]));
}

/** The report header (base64url JSON) → the report. Exported for the tests. */
export function decodeReport(header: string | null): LipsyncReport | null {
  if (!header) return null;
  try { return camelize(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))) as LipsyncReport; } catch { return null; }
}

export async function lipsyncHealth(timeoutMs = 10_000): Promise<LipsyncHealth> {
  if (!lipsyncConfigured()) return { available: false, reason: 'LIPSYNC_URL is not set' };
  try {
    const r = await fetch(`${base()}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { available: false, reason: `the lipsync service answered HTTP ${r.status}` };
    return camelize(await r.json()) as LipsyncHealth;
  } catch (e) {
    return { available: false, reason: `the lipsync service is not reachable (${(e as Error).message})` };
  }
}

/** Drop the corrector's weights from the GPU (the lease calls this when another family takes the card). */
export async function unloadLipsync(): Promise<void> {
  if (!lipsyncConfigured()) return;
  try { await fetch(`${base()}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ }
}

export interface CorrectOptions {
  /** Where `audio` starts in the clip, seconds (the soundtrack's offset: the take's guide head). */
  audioOffset?: number;
  /** The speaker's canonical image: the face to correct is chosen by identity (never another character's). */
  reference?: string;
  /** The speaker's face box [x0, y0, x1, y1] in video pixels (from the mouth check), when there is no reference. */
  hintBox?: [number, number, number, number];
  steps?: number; guidance?: number; seed?: number;
  timeoutMs?: number;
}

/** Correct one take: `video` (the take file) against `audio` (the authoritative audio), written to `out`. */
export async function correctLipSync(video: string, audio: string, out: string, opts: CorrectOptions = {}): Promise<LipsyncResult | LipsyncUnavailable> {
  if (!lipsyncConfigured()) return { available: false, reason: 'LIPSYNC_URL is not set' };
  const read = async (f: string, what: string) => { try { return new Blob([await fsp.readFile(f)]); } catch (e) { throw new StudioError('INVALID', `correctLipSync: the ${what} ${f} cannot be read (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`); } };
  if (opts.audioOffset !== undefined && (!Number.isFinite(opts.audioOffset) || Math.abs(opts.audioOffset) > 600)) throw new StudioError('INVALID', 'correctLipSync: audioOffset must be a number within ±600 s');
  if (opts.hintBox && (opts.hintBox.length !== 4 || opts.hintBox.some((x) => !Number.isFinite(x)))) throw new StudioError('INVALID', 'correctLipSync: hintBox must be four numbers');
  const fd = new FormData();
  fd.set('video', await read(video, 'video'), path.basename(video));
  fd.set('audio', await read(audio, 'audio'), path.basename(audio));
  if (opts.reference) fd.set('reference', await read(opts.reference, 'reference image'), path.basename(opts.reference));
  if (opts.audioOffset !== undefined) fd.set('audio_offset', String(opts.audioOffset));
  if (opts.hintBox) fd.set('hint_box', JSON.stringify(opts.hintBox));
  if (opts.steps !== undefined) fd.set('steps', String(opts.steps));
  if (opts.guidance !== undefined) fd.set('guidance', String(opts.guidance));
  if (opts.seed !== undefined) fd.set('seed', String(opts.seed));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30 * 60_000);
  const unlink = followJobSignal(ctrl);
  try {
    const res = await fetch(`${base()}/lipsync`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail: unknown = text; try { detail = (JSON.parse(text) as { detail?: unknown }).detail ?? text; } catch { /* plain */ }
      return { available: false, reason: `/lipsync: ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) || `HTTP ${res.status}`}`, status: res.status };
    }
    const report = decodeReport(res.headers.get('x-lipsync-report'));
    if (!report) return { available: false, reason: '/lipsync: the answer carried no report' };
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, buf);
    return { available: true, file: out, bytes: buf.length, report };
  } catch (e) {
    const stop = stopReasonOf(ctrl.signal);
    if (stop) throw stop;
    const why = (e as Error & { cause?: { code?: string } }).cause?.code ?? (e as Error).message;
    return { available: false, reason: (e as Error).name === 'AbortError' ? `/lipsync did not answer in time (${why})` : `/lipsync: the service is not reachable (${why})` };
  } finally { clearTimeout(t); unlink(); }
}
