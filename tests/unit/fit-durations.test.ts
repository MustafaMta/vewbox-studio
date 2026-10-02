import { describe, expect, it } from 'vitest';
import { fitDurations } from '@/server/story/engine';

const d = (...secs: number[]) => secs.map((durationSeconds) => ({ durationSeconds }));
const sum = (xs: Array<{ durationSeconds: number }>) => xs.reduce((a, s) => a + s.durationSeconds, 0);

describe('fitDurations', () => {
  it('stretches a short plan to its scene budget without exceeding the per-shot cap', () => {
    const out = fitDurations(d(5, 5, 4, 5), 36);
    expect(sum(out)).toBe(36);
    expect(Math.max(...out.map((s) => s.durationSeconds))).toBeLessThanOrEqual(10);
    expect(Math.min(...out.map((s) => s.durationSeconds))).toBeGreaterThanOrEqual(3);
  });
  it('leaves a plan alone when it already fills the budget', () => {
    const shots = d(6, 7, 5);
    expect(fitDurations(shots, 19)).toBe(shots);
    expect(fitDurations(shots, 20)).toBe(shots); // 18 ≥ 90 % of 20
  });
  it('stops at the cap when even the longest shots cannot fill the budget', () => {
    const out = fitDurations(d(5, 5), 60);
    expect(out.map((s) => s.durationSeconds)).toEqual([10, 10]);
  });
  it('keeps every other field', () => {
    const out = fitDurations([{ durationSeconds: 4, purpose: 'x' }], 8);
    expect(out[0].purpose).toBe('x');
    expect(out[0].durationSeconds).toBe(8);
  });
});
