import { execFileP } from './exec';
import type { ShotRelation } from '@/domain/types';
import { JOIN_CROSSFADE_FRAMES } from '@/domain/timeline';

// ffmpeg/ffprobe with a timeout, killed when the job is cancelled or times out (src/server/media/exec.ts)

/** JOIN QA (docs/research/MINIMAX-CONTINUITY.md §3.6) — at every join of the cut, is the step from one shot to the
 *  next a jump? Measured, not judged by eye:
 *  - picture: the mean absolute luma difference between the last frame of A and the first frame of B (64×36 grey),
 *    against the distribution of consecutive-frame differences INSIDE A and B: a join passes when it is no bigger
 *    than the 95th percentile of the shots' own frame-to-frame changes (floor 1.0 luma level, so two still shots do
 *    not fail on encoder noise);
 *  - sound (on the mix, what the audience hears): the RMS level step across the join region (20 ms windows, dB, from
 *    before the continuation cross-fade to after the join) and the spectral flux (32 ms Hann frames) over the same
 *    span, against the same measures inside the two shots (floors 1 dB and 0.1).
 *  Only CONTINUATION joins are judged (a cut or a story transition is meant to change); every join is measured and
 *  recorded. A failed join fails the take that continues (an inspector's REJECT report), never the cut. */

export const JOIN_FLOORS = { pictureLuma: 1.0, rmsDb: 1.0, flux: 0.1 } as const;
const W = 64, H = 36;

export interface JoinMetric {
  index: number; fromShotId: string; toShotId: string; relation?: ShotRelation; join?: 'TRIM' | 'HARD'; atSeconds: number;
  /** only continuation joins whose guide head was trimmed are judged */
  judged: boolean;
  picture: { diff: number; intraP95: number; threshold: number; ok: boolean };
  audio: { rmsStepDb: number; rmsP95: number; rmsOk: boolean; flux: number; fluxP95: number; fluxOk: boolean } | null;
  ok: boolean;
}

export const p95 = (xs: number[]): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(0.95 * (s.length - 1))]; };
export const meanAbsDiff = (a: Uint8Array, b: Uint8Array): number => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]); return n ? s / n : 0; };

/** Every frame of a clip as 64×36 grey (the measure's working size; also the guide-head check's). */
export async function greyFrames(file: string, maxFrames?: number): Promise<Uint8Array[]> {
  const { stdout } = await execFileP('ffmpeg', ['-v', 'error', '-i', file, '-an', ...(maxFrames ? ['-frames:v', String(maxFrames)] : []), '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  const size = W * H; const out: Uint8Array[] = [];
  for (let o = 0; o + size <= stdout.byteLength; o += size) out.push(new Uint8Array(stdout.buffer, stdout.byteOffset + o, size));
  return out;
}

async function monoPcm(file: string, rate: number): Promise<Float32Array> {
  const { stdout } = await execFileP('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + Math.floor(stdout.byteLength / 4) * 4));
}

/** RMS level of [from, from+n) in dB, floored at −60 (silence is −60, not −∞). */
export function rmsDb(x: Float32Array, from: number, n: number): number {
  let s = 0; let c = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, from + n); i++) { s += x[i] * x[i]; c++; }
  return Math.max(-60, 20 * Math.log10(Math.sqrt(c ? s / c : 0) + 1e-12));
}

/** Magnitude spectrum of a Hann-windowed frame (radix-2 FFT; n a power of two). */
export function magnitude(x: Float32Array, from: number, n: number): Float64Array {
  const re = new Float64Array(n); const im = new Float64Array(n);
  for (let i = 0; i < n; i++) { const v = from + i >= 0 && from + i < x.length ? x[from + i] : 0; re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); }
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len; const wr = Math.cos(ang); const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci; const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** Spectral flux from frame `a` to frame `b`: the energy that appears, relative to what was there. */
export function flux(a: Float64Array, b: Float64Array): number {
  let up = 0; let base = 0;
  for (let i = 0; i < a.length; i++) { up += Math.max(0, b[i] - a[i]); base += a[i]; }
  return up / (base + 1e-6);
}

export interface JoinPart { file: string; shotId: string; relation?: ShotRelation; /** TRIM: the guide head was dropped (a continuation join); HARD: kept untrimmed because the head did not repeat the tail (src/server/media/guide-head.ts) */ join?: 'TRIM' | 'HARD'; startFrame: number; frames: number }

/** Measure every join of a cut from its conformed picture parts and its mix (before loudness normalisation). The
 *  sound is compared ACROSS the join region — the level and spectrum before the continuation cross-fade begins
 *  (`gapFrames` before the join) against just after the join — and the shots' own changes are measured over the same
 *  span, so a cross-fade cannot hide a jump and a hard join is judged the same way. A continuation whose head was
 *  kept (a HARD join: the model did not repeat the tail) is measured but not judged — it is a cut by then, and the
 *  take already records why. */
export async function measureJoins(parts: JoinPart[], mixFile: string | undefined, fps = 24, gapFrames = JOIN_CROSSFADE_FRAMES): Promise<JoinMetric[]> {
  if (parts.length < 2) return [];
  const frames: Uint8Array[][] = [];
  for (const p of parts) frames.push(await greyFrames(p.file));
  const intra = frames.map((fs) => fs.slice(1).map((f, i) => meanAbsDiff(fs[i], f)));
  const rate = 16000; const win = 320; const fft = 512;
  const gap = Math.round((gapFrames / fps) * rate);
  const pcm = mixFile ? await monoPcm(mixFile, rate).catch(() => undefined) : undefined;
  const span = (p: JoinPart): [number, number] => [Math.round((p.startFrame / fps) * rate), Math.round(((p.startFrame + p.frames) / fps) * rate)];
  const audioIntra = (p: JoinPart) => {
    const [s, e] = span(p); const steps: number[] = []; const fluxes: number[] = [];
    for (let i = s + 2 * win; i + 3 * win + gap <= e; i += win) steps.push(Math.abs(rmsDb(pcm!, i + win + gap, win) - rmsDb(pcm!, i, win)));
    for (let i = s + fft; i + 3 * fft + gap <= e; i += fft) fluxes.push(flux(magnitude(pcm!, i, fft), magnitude(pcm!, i + fft + gap, fft)));
    return { steps, fluxes };
  };
  const out: JoinMetric[] = [];
  for (let i = 1; i < parts.length; i++) {
    const a = parts[i - 1]; const b = parts[i];
    const fa = frames[i - 1]; const fb = frames[i];
    const diff = fa.length && fb.length ? meanAbsDiff(fa[fa.length - 1], fb[0]) : 0;
    const intraP95 = p95([...intra[i - 1], ...intra[i]]);
    const threshold = Math.max(intraP95, JOIN_FLOORS.pictureLuma);
    const picture = { diff: Number(diff.toFixed(3)), intraP95: Number(intraP95.toFixed(3)), threshold: Number(threshold.toFixed(3)), ok: diff <= threshold };
    let audio: JoinMetric['audio'] = null;
    if (pcm && pcm.length) {
      const j = Math.round((b.startFrame / fps) * rate);
      const step = Math.abs(rmsDb(pcm, j, win) - rmsDb(pcm, j - gap - win, win));
      const f = flux(magnitude(pcm, j - gap - fft, fft), magnitude(pcm, j, fft));
      const ia = audioIntra(a); const ib = audioIntra(b);
      const rmsP95 = p95([...ia.steps, ...ib.steps]); const fluxP95 = p95([...ia.fluxes, ...ib.fluxes]);
      audio = { rmsStepDb: Number(step.toFixed(2)), rmsP95: Number(rmsP95.toFixed(2)), rmsOk: step <= Math.max(rmsP95, JOIN_FLOORS.rmsDb), flux: Number(f.toFixed(3)), fluxP95: Number(fluxP95.toFixed(3)), fluxOk: f <= Math.max(fluxP95, JOIN_FLOORS.flux) };
    }
    const judged = b.relation === 'CONTINUATION' && b.join !== 'HARD';
    out.push({ index: i, fromShotId: a.shotId, toShotId: b.shotId, relation: b.relation, join: b.join, atSeconds: Number((b.startFrame / fps).toFixed(3)), judged, picture, audio, ok: !judged || (picture.ok && (!audio || (audio.rmsOk && audio.fluxOk))) });
  }
  return out;
}
