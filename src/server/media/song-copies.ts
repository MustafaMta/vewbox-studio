import { execFileP } from './exec';
import { ENVELOPE_MS, envelope } from './sync';

/** ONE COPY OF THE MUSIC (cloud directive 2026-10-05 §8 "prevention of duplicate music/audio"; AV-1 in
 *  docs/AUDIOVISUAL-QA.md). The typed mix plan already refuses to route a source twice and mutes the takes' own singing
 *  under a song master; this MEASURES the rendered cut: its sound against the song master on 20 ms loudness envelopes.
 *  The song is on the cut's clock from sample 0, so the master correlates with the mix at lag 0; a second copy (the
 *  song routed twice, a take's own rendition of the same stretch left unmuted, a stem on top of the master) shows as a
 *  further correlation peak at another lag that the song's OWN self-similarity at that lag (its beat, a repeated
 *  chorus) does not explain. A finding is a REVIEW flag with its lag; the measure never changes the mix. */

export const SONG_COPIES = {
  /** lags closer than this to zero are the same copy (envelope smear, the sync shift of a take) */
  minLagSeconds: 0.15,
  maxLagSeconds: 8,
  /** a copy at a lag: the mix–master correlation there exceeds the master's own self-similarity there by this much
   *  (both normalised by the lag-0 values) — START value, docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §E */
  excess: 0.25,
  /** the master must be clearly in the mix at all (lag-0 correlation) for the check to mean anything */
  presentAt: 0.3,
} as const;

function corr(a: Float32Array, b: Float32Array, lag: number): number {
  // mean product over the overlap of a[i + lag] and b[i]
  let s = 0; let c = 0;
  for (let i = Math.max(0, -lag); i < b.length && i + lag < a.length; i++) { s += a[i + lag] * b[i]; c++; }
  return c ? s / c : 0;
}

export interface SongCopies { ok: boolean; present: number; copies: Array<{ lagSeconds: number; excess: number }>; detail: string }

/** Judge a mix envelope against the master's envelope (both from `envelope`, same frame length). Pure. */
export function judgeSongCopies(mix: Float32Array, master: Float32Array, frameMs = ENVELOPE_MS): SongCopies {
  const present = corr(mix, master, 0);
  const self0 = corr(master, master, 0) || 1;
  if (present < SONG_COPIES.presentAt) return { ok: true, present: Number(present.toFixed(3)), copies: [], detail: `the master is barely in the mix (correlation ${present.toFixed(2)}): nothing to compare` };
  const minLag = Math.round((SONG_COPIES.minLagSeconds * 1000) / frameMs), maxLag = Math.min(Math.round((SONG_COPIES.maxLagSeconds * 1000) / frameMs), Math.floor(master.length / 2));
  const raw: Array<{ lag: number; excess: number }> = [];
  for (let d = minLag; d <= maxLag; d++) for (const lag of [d, -d]) {
    const excess = corr(mix, master, lag) / present - corr(master, master, lag) / self0;
    if (excess > SONG_COPIES.excess) raw.push({ lag, excess });
  }
  // one finding per peak: keep local maxima at least minLag apart
  raw.sort((a, b) => b.excess - a.excess);
  const peaks: typeof raw = [];
  for (const r of raw) if (!peaks.some((p) => Math.abs(p.lag - r.lag) < minLag)) peaks.push(r);
  const copies = peaks.slice(0, 5).map((p) => ({ lagSeconds: Number(((p.lag * frameMs) / 1000).toFixed(2)), excess: Number(p.excess.toFixed(2)) }));
  return { ok: copies.length === 0, present: Number(present.toFixed(3)), copies, detail: copies.length ? `the song is heard again ${copies.map((c) => `${c.lagSeconds > 0 ? '+' : ''}${c.lagSeconds} s off the master (excess ${c.excess})`).join(', ')}: a second copy of the music in the mix (review)` : `one copy of the song (master correlation ${present.toFixed(2)})` };
}

async function pcm(file: string, rate = 8000): Promise<Float32Array> {
  const { stdout } = await execFileP('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}

/** Measure a rendered cut's sound against the song master file. */
export async function measureSongCopies(cutFile: string, masterFile: string): Promise<SongCopies> {
  const [a, b] = await Promise.all([pcm(cutFile), pcm(masterFile)]);
  return judgeSongCopies(envelope(a, 8000), envelope(b, 8000));
}
