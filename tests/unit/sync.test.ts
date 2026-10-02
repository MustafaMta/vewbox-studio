import { describe, expect, it } from 'vitest';
import { bestLag, envelope } from '@/server/media/sync';

/** A synthetic "song": bursts of noise every 500 ms; a "take" that is the same pattern 200 ms late. */
function bursts(rate: number, seconds: number, offsetMs: number): Float32Array {
  const out = new Float32Array(rate * seconds);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let i = 0; i < out.length; i++) { const t = (i / rate) * 1000 - offsetMs; const inBurst = t >= 0 && ((t % 500) < 120); out[i] = inBurst ? rnd() : rnd() * 0.02; }
  return out;
}

describe('sound-to-picture lag', () => {
  it('finds a late take', () => {
    const master = envelope(bursts(16000, 4, 0), 16000);
    const take = envelope(bursts(16000, 4, 200), 16000);
    const r = bestLag(take, master);
    expect(r.lagMs).toBe(200);
    expect(r.corrBest).toBeGreaterThan(0.8);
    expect(r.corrBest).toBeGreaterThan(r.corrZero);
  });
  it('reports zero for an aligned take', () => {
    const master = envelope(bursts(16000, 4, 0), 16000);
    expect(bestLag(master, master).lagMs).toBe(0);
  });
  it('finds an early take as a negative lag', () => {
    const master = envelope(bursts(16000, 4, 300), 16000);
    const take = envelope(bursts(16000, 4, 0), 16000);
    expect(bestLag(take, master).lagMs).toBe(-300);
  });
});
