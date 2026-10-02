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
  const corrAt = (lag: number) => { let s = 0; let c = 0; for (let i = 0; i < n; i++) { const j = i + lag; if (j < 0 || j >= n) continue; s += a[j] * b[i]; c++; } return c ? s / c : -1; };
  const maxLag = Math.round(maxMs / frameMs);
  let best = { lagMs: 0, corrBest: -2, corrZero: corrAt(0) };
  for (let lag = -maxLag; lag <= maxLag; lag++) { const c = corrAt(lag); if (c > best.corrBest + 1e-9) best = { ...best, corrBest: c, lagMs: lag * frameMs }; }
  return best;
}

async function pcm(file: string, from?: number, seconds?: number, rate = 16000): Promise<Float32Array> {
  const args = ['-v', 'error', ...(from !== undefined ? ['-ss', from.toFixed(3)] : []), ...(seconds !== undefined ? ['-t', seconds.toFixed(3)] : []), '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'];
  const { stdout } = await execFileP('ffmpeg', args, { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}

/** How late (or early) a take's sound runs against the master's stretch [from, from+seconds). */
export async function takeLagAgainstMaster(takeFile: string, masterFile: string, from: number, seconds: number): Promise<{ lagMs: number; corrZero: number; corrBest: number }> {
  const [a, b] = await Promise.all([pcm(takeFile, 0, seconds), pcm(masterFile, from, seconds)]);
  return bestLag(envelope(a, 16000), envelope(b, 16000));
}
