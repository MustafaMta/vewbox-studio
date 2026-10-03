import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** SOUND-TO-PICTURE ALIGNMENT — a MiniMax take sings or speaks with its own timing; under a song master the cut mutes
 *  the take's sound, so its mouths must be brought onto the master's beat. The take's own audio is the one honest
 *  record of where its mouths are (the engine renders them together), so the offset between the take's audio and
 *  the master stretch is the offset between its mouths and the master. It is measured on loudness envelopes (20 ms
 *  RMS frames, normalised) by cross-correlation within ±600 ms; a positive lag means the take runs late and that
 *  many frames are dropped from its head. Nothing is stretched; the song is never altered. */

export const ENVELOPE_MS = 20;

export function envelope(samples: Float32Array, rate: number, frameMs = ENVELOPE_MS): Float32Array {
  const hop = Math.round((rate * frameMs) / 1000);
  const n = Math.floor(samples.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let acc = 0; for (let k = 0; k < hop; k++) { const v = samples[i * hop + k]; acc += v * v; } out[i] = Math.sqrt(acc / hop); }
  const mean = out.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(out.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] - mean) / sd;
  return out;
}

/** Best lag (ms, positive = `a` is late relative to `b`) and the correlations at zero and at the best lag. */
export function bestLag(a: Float32Array, b: Float32Array, frameMs = ENVELOPE_MS, maxMs = 600): { lagMs: number; corrZero: number; corrBest: number } {
  const n = Math.min(a.length, b.length);
  const maxLag = Math.min(Math.round(maxMs / frameMs), Math.floor(n / 3));
  // every lag is scored on the same central window of `b`, so the comparison between lags is fair (no edge effects)
  const corrAt = (lag: number) => { let s = 0; let c = 0; for (let i = maxLag; i < n - maxLag; i++) { s += a[i + lag] * b[i]; c++; } return c ? s / c : -1; };
  let best = { lagMs: 0, corrBest: corrAt(0), corrZero: corrAt(0) };
  // lags are tried from zero outwards and must beat the current best clearly, so a periodic signal (a beat) resolves
  // to the smallest shift, not a whole bar, and an aligned take stays at zero
  for (let d = 1; d <= maxLag; d++) for (const lag of [-d, d]) { const c = corrAt(lag); if (c > best.corrBest + 0.01) best = { ...best, corrBest: c, lagMs: lag * frameMs }; }
  return best;
}

async function pcm(file: string, from?: number, seconds?: number, rate = 16000): Promise<Float32Array> {
  const args = ['-v', 'error', ...(from !== undefined ? ['-ss', from.toFixed(3)] : []), ...(seconds !== undefined ? ['-t', seconds.toFixed(3)] : []), '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'];
  const { stdout } = await execFileP('ffmpeg', args, { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}

/** How late (or early) a take's sound runs against the master's stretch [from, from+seconds). `takeFrom` skips the
 *  take's head that repeats the previous shot (a continuation guide): the cut never plays it, so it is not measured. */
export async function takeLagAgainstMaster(takeFile: string, masterFile: string, from: number, seconds: number, takeFrom = 0): Promise<{ lagMs: number; corrZero: number; corrBest: number }> {
  const [a, b] = await Promise.all([pcm(takeFile, Math.max(0, takeFrom), seconds), pcm(masterFile, from, seconds)]);
  return bestLag(envelope(a, 16000), envelope(b, 16000));
}
