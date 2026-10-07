import { describe, expect, it } from 'vitest';
import { crossLanguageIdentity, type Rendered } from '@/server/media/cross-language-identity';

/** Cross-language identity (Phase 3): two engines from one reference do not prove one person — it is measured, and a
 *  mismatch is reported, never hidden. Never a pass: the producer's listening decides. */

const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const r = (emb: number[], f0: number, cen = 1000): Rendered => ({ embedding: unit(emb), profile: { voicedRatio: 0.7, f0MedianHz: f0, centroidMedianHz: cen, f1Hz: 400, f2Hz: 1400, f3Hz: 2300, durationSeconds: 4 } });

describe('cross-language voice identity', () => {
  it('one person in both languages: consistent', () => {
    const ar = [r([1, 0.1, 0], 140), r([1, 0.12, 0.02], 145)];
    const en = [r([1, 0.08, 0.03], 138), r([1, 0.1, 0.01], 142)];
    const e = crossLanguageIdentity(r([1, 0.1, 0.01], 141), ar, en);
    expect(e.verdict).toBe('CONSISTENT');
    expect(e.flags).toEqual([]);
    expect(e.acrossLanguages).toBeGreaterThan(0.99);
  });

  it('two engines that sound like two people: the drop, the pitch gap and the tone are all named — MISMATCH_SUSPECTED', () => {
    const ar = [r([1, 0, 0], 140, 900), r([1, 0.05, 0], 145, 920)];
    const en = [r([0, 1, 0], 220, 1400), r([0.05, 1, 0], 230, 1450)];
    const e = crossLanguageIdentity(null, ar, en);
    expect(e.verdict).toBe('MISMATCH_SUSPECTED');
    expect(e.flags.join(' | ')).toMatch(/drops across languages.*low.*semitones lower.*tone differs/);
  });

  it('lines in only one language: INSUFFICIENT, not a pass', () => {
    expect(crossLanguageIdentity(null, [r([1, 0, 0], 140)], []).verdict).toBe('INSUFFICIENT');
  });
});
