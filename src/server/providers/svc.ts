/** SINGING VOICE CONVERSION — the studio's side of docker/svc-seedvc (Seed-VC v1, GPL-3.0, an isolated worker reached over
 *  HTTP only; docs/research/SINGING-IDENTITY-2026-10.md §3). A lead vocal (ACE-Step → htdemucs_ft) is converted to a
 *  character's timbre from the identity's own clip: the speech seed, or the identity's bootstrapped SINGING_REFERENCE.
 *  F0-conditioned, never auto-adjusted (melismas, glides and quarter-tones follow the source), a semitone shift of at most
 *  ±3 is the only melodic freedom. One call = one conversion, deterministic for a seed. The service is a GPU family TTS
 *  engine for the lease (unloaded with the voice engines); it is lazy and holds nothing when idle. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { log } from '../log';

export interface SvcInput {
  sourceWav: string; referenceWav: string;
  diffusionSteps?: number; lengthAdjust?: number; cfgRate?: number;
  f0Condition?: boolean; autoF0Adjust?: boolean; semitoneShift?: number;
  fp16?: boolean; seed?: number; raw?: boolean;
}
export interface SvcF0Stats { median_hz: number | null; p5_hz: number | null; p95_hz: number | null; semitones: number | null }
export interface SvcResult {
  file: string; ms: number; sampleRate: number; durationSeconds: number; engine: string; model: string; engineVersion: string;
  settings: Record<string, unknown>; f0: { reference?: SvcF0Stats; source?: SvcF0Stats; applied?: SvcF0Stats }; truePeakDbtp?: number; peakVramMb?: number;
}

const base = () => (process.env.SVC_SEEDVC_URL || 'http://127.0.0.1:8028').replace(/\/$/, '');
/** The measured peak of the service (DiT 200M + whisper-small encoder + BigVGAN + torchcrepe full); an estimate until the
 *  first conversion reports x-peak-vram-mb. */
export const SVC_VRAM_MB = 6000;

export async function svcHealth(timeoutMs = 10_000): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${base()}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch { return null; }
}

/** Best effort, silent when the service is not running (the profile `svc` is up only during singing work). */
export async function unloadSvc(): Promise<void> {
  try { await fetch(`${base()}/unload`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* not running: nothing on the card */ }
}

export async function convertVoice(i: SvcInput, outDir: string): Promise<SvcResult> {
  if ((i.semitoneShift ?? 0) > 3 || (i.semitoneShift ?? 0) < -3) throw new StudioError('INVALID', 'A singing conversion shifts the melody by at most ±3 semitones (the research §4: the identity, not the song, bends).', { semitoneShift: i.semitoneShift });
  const fd = new FormData();
  fd.set('source', new Blob([await fsp.readFile(i.sourceWav)]), path.basename(i.sourceWav));
  fd.set('reference', new Blob([await fsp.readFile(i.referenceWav)]), path.basename(i.referenceWav));
  fd.set('diffusion_steps', String(i.diffusionSteps ?? 40));
  fd.set('length_adjust', String(i.lengthAdjust ?? 1));
  fd.set('inference_cfg_rate', String(i.cfgRate ?? 0.7));
  fd.set('f0_condition', i.f0Condition === false ? '0' : '1');
  fd.set('auto_f0_adjust', i.autoF0Adjust ? '1' : '0');
  fd.set('semi_tone_shift', String(Math.trunc(i.semitoneShift ?? 0)));
  fd.set('fp16', i.fp16 === false ? '0' : '1');
  fd.set('seed', String(Math.trunc(i.seed ?? 7)));
  if (i.raw) fd.set('raw', '1');
  const t0 = Date.now();
  let res: Response;
  try { res = await fetch(`${base()}/convert`, { method: 'POST', body: fd, signal: AbortSignal.timeout(20 * 60_000) }); } catch (e) {
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    throw new StudioError('UNAVAILABLE', `The singing voice converter (svc-seedvc) is not reachable: ${(e as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ''}. Start it with the profile svc.`, { failureClass: 'INFRASTRUCTURE', cause: cause?.code ?? cause?.message });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new StudioError(res.status === 503 ? 'NOT_CONFIGURED' : 'PROVIDER', `The singing voice converter refused the request (${res.status}): ${detail.slice(0, 300)}`, { status: res.status, failureClass: res.status === 503 ? 'NOT_CONFIGURED' : 'PROVIDER' });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw Object.assign(new StudioError('PROVIDER', 'The singing voice converter returned an unusable recording (empty).', { bytes: buf.length }), { failureClass: 'OUTPUT_CORRUPTION' });
  await fsp.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `svc-${Date.now().toString(36)}.wav`);
  await fsp.writeFile(file, buf);
  const h = (k: string) => res.headers.get(k) ?? undefined;
  const num = (k: string) => { const v = h(k); const n = v === undefined || v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : undefined; };
  const parse = <T,>(k: string, fallback: T): T => { try { const v = h(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
  const out: SvcResult = {
    file, ms: Date.now() - t0, sampleRate: num('x-sample-rate') ?? 44100, durationSeconds: num('x-duration') ?? 0,
    engine: h('x-engine') ?? 'seed-vc', model: h('x-model') ?? 'seed-uvit-whisper-base-f0-44k', engineVersion: h('x-engine-version') ?? '',
    settings: parse<Record<string, unknown>>('x-settings', {}), f0: parse<SvcResult['f0']>('x-f0', {}), truePeakDbtp: num('x-true-peak'), peakVramMb: num('x-peak-vram-mb'),
  };
  log.info({ engine: out.engine, version: out.engineVersion, ms: out.ms, seconds: out.durationSeconds, f0: out.f0, peakVramMb: out.peakVramMb }, 'svc conversion');
  return out;
}
