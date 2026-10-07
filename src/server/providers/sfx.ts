import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { followJobSignal, stopReasonOf } from '../jobs/context';

/** SOUND EFFECTS AND AMBIENCE — MOSS-SoundEffect v2.0 (OpenMOSS, 1.3 B DiT, Apache-2.0) in the `sfx-moss` service
 *  (docker/sfx): an ambience bed, a crowd, footsteps, a door, rain, from a text description, 48 kHz, up to 30 s a call.
 *  For narrative sections and scenes OUTSIDE the song: a music video's song stays the one authoritative soundtrack, so
 *  an effect is never generated over sung vocals (the mix places it). Run it under the GPU lease, family SFX. */

export interface SfxResult { file: string; seconds: number; sampleRate: number; ms: number; model: string; engineVersion: string; seed: number; peakVramMb: number | null }
export const sfxConfigured = () => Boolean(env().SFX_URL);
const base = () => env().SFX_URL.replace(/\/$/, '');

/** The answer headers → the result's numbers (pure, tested). */
export function sfxHeaders(h: { get(name: string): string | null }): Omit<SfxResult, 'file'> {
  const num = (k: string) => { const s = h.get(k); const v = s === null || s.trim() === '' ? NaN : Number(s); return Number.isFinite(v) ? v : NaN; };
  const seconds = num('x-duration');
  if (!(seconds > 0)) throw new StudioError('PROVIDER', 'the sound-effect service answered without a duration');
  const peak = num('x-peak-vram-mb');
  return { seconds, sampleRate: num('x-sample-rate'), ms: num('x-ms'), model: h.get('x-model') ?? 'MOSS-SoundEffect', engineVersion: h.get('x-engine-version') ?? '', seed: num('x-seed'), peakVramMb: Number.isFinite(peak) ? peak : null };
}

export const SFX_MAX_SECONDS = 30;

/** One ambience or effect from a description, `seconds` long (0.5–30, the model's window), into `out` (WAV). */
export async function generateSoundEffect(prompt: string, out: string, opts: { seconds?: number; seed?: number; timeoutMs?: number } = {}): Promise<SfxResult> {
  if (!sfxConfigured()) throw new StudioError('NOT_CONFIGURED', 'SFX_URL is not set (compose profile sfx: the sfx-moss service)');
  const text = prompt.trim();
  if (!text || text.length > 600) throw new StudioError('INVALID', 'generateSoundEffect: the description must be 1–600 characters');
  if (opts.seconds !== undefined && !(opts.seconds >= 0.5 && opts.seconds <= SFX_MAX_SECONDS)) throw new StudioError('INVALID', `generateSoundEffect: seconds must be within 0.5–${SFX_MAX_SECONDS}`);
  const fd = new FormData();
  fd.set('prompt', text);
  if (opts.seconds !== undefined) fd.set('duration', String(opts.seconds));
  if (opts.seed !== undefined) fd.set('seed', String(Math.trunc(opts.seed)));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10 * 60_000);
  const unlink = followJobSignal(ctrl);
  try {
    const res = await fetch(`${base()}/sfx`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body; try { detail = String((JSON.parse(body) as { detail?: unknown }).detail ?? body); } catch { /* plain */ }
      throw new StudioError(res.status === 503 ? 'NOT_CONFIGURED' : res.status >= 500 ? 'PROVIDER' : 'INVALID', `sound effect: ${detail.slice(0, 300) || `HTTP ${res.status}`}`);
    }
    const meta = sfxHeaders(res.headers);
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, Buffer.from(await res.arrayBuffer()));
    return { file: out, ...meta };
  } catch (e) {
    const stop = stopReasonOf(ctrl.signal);
    if (stop) throw stop;
    if (e instanceof StudioError) throw e;
    throw new StudioError('UNAVAILABLE', `the sound-effect service is not reachable (${(e as Error).message})`);
  } finally { clearTimeout(t); unlink(); }
}

/** Drop MOSS-SoundEffect from the GPU (the lease calls this when another family takes the card). */
export async function unloadSfx(): Promise<void> {
  if (!sfxConfigured()) return;
  try { await fetch(`${base()}/unload`, { method: 'POST', signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ }
}
