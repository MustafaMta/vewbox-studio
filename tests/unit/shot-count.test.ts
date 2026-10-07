import { describe, expect, it } from 'vitest';
import { beatsForSeconds, shotCountFor } from '@/server/story/engine';

/** A SCENE IS WRITTEN AND PLANNED FOR ITS RUNNING TIME, NEVER PADDED (2026-10-07, ep-3fef2fe042): a flat "2–6 beats"
 *  gave a 45-second scene three beats, and the planner, asked for 8–11 shots, filled it with five near-identical "he
 *  prepares to act" shots. */

describe('beatsForSeconds', () => {
  it('about one beat per 7 seconds on screen, within 2–12 (±1)', () => {
    expect(beatsForSeconds(45)).toEqual({ min: 5, max: 7 });
    expect(beatsForSeconds(10)).toEqual({ min: 2, max: 3 });
    expect(beatsForSeconds(120)).toEqual({ min: 11, max: 13 });
    expect(beatsForSeconds(900).max).toBeLessThanOrEqual(14);
  });
});

describe('shotCountFor', () => {
  it('three beats over 45 s: asked 5–8 shots (the time at ≤ 10 s each), not 8–11', () => {
    expect(shotCountFor(45, 3, 10)).toEqual({ floor: 5, min: 5, max: 8 });
  });
  it('the range starts at the written beats when there are more of them than the floor; never inverted', () => {
    expect(shotCountFor(45, 7, 10)).toEqual({ floor: 5, min: 7, max: 8 });
    expect(shotCountFor(20, 9, 10)).toEqual({ floor: 2, min: 9, max: 9 });
    expect(shotCountFor(4, 1, 10)).toEqual({ floor: 1, min: 1, max: 1 });
  });
});
