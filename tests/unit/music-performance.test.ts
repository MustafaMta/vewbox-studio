import { describe, expect, it } from 'vitest';
import { linesCutAt, performanceSegments, shotPerformers, singersAt } from '@/domain/music-performance';
import { judgeSongCopies } from '@/server/media/song-copies';
import { envelope } from '@/server/media/sync';
import type { Song } from '@/domain/types';

/** Music video performance (cloud directive §8): who sings each lyric line and in which role, cuts that break a sung
 *  line, and one copy of the music in the cut. */

const song: Song = {
  id: 'song', title: 'T', source: 'UPLOADED', durationSeconds: 40, caption: '', singerIds: ['lead', 'duo', 'bg'],
  sections: [
    { id: 'intro', kind: 'INSTRUMENTAL', text: '', singerIds: [], from: 0, to: 8 },
    { id: 'v1', kind: 'VERSE', text: 'one\ntwo', singerIds: ['lead'], backingIds: ['bg'], from: 8, to: 16, lineTimes: [{ index: 0, from: 8.4, to: 11.2, method: 'ALIGNED', confidence: 0.9 }, { index: 1, from: 12, to: 15.5, method: 'ALIGNED', confidence: 0.8 }] },
    { id: 'c1', kind: 'CHORUS', text: 'a\nb', singerIds: ['lead', 'duo'], from: 16, to: 24, performanceMode: 'ALTERNATING', lines: [{ singerId: 'lead', text: 'a', from: 16, to: 19 }, { singerId: 'duo', text: 'b', from: 19, to: 22 }, { singerId: 'bg', text: 'ooh', from: 19, to: 22, role: 'BACKING' }] },
  ],
} as Song;

describe('the performance plan', () => {
  it('one segment per sung line, aligned times kept, instrumental stretches have nobody', () => {
    const segs = performanceSegments(song);
    expect(segs.map((s) => [s.sectionId, s.text, s.from, s.timing])).toEqual([['v1', 'one', 8.4, 'ALIGNED'], ['v1', 'two', 12, 'ALIGNED'], ['c1', 'a', 16, 'SECTION'], ['c1', 'b', 19, 'SECTION'], ['c1', 'ooh', 19, 'SECTION']]);
    expect(singersAt(segs, 4)).toEqual({ lead: [], backing: [] });
    expect(singersAt(segs, 9)).toEqual({ lead: ['lead'], backing: ['bg'] });
    expect(singersAt(segs, 20)).toEqual({ lead: ['duo'], backing: ['bg'] });
  });
  it('a shot’s performers: lead, backing, and everyone else silent', () => {
    expect(shotPerformers(song, { from: 8, to: 12 }, ['lead', 'bg', 'stranger'])).toEqual({ lead: ['lead'], backing: ['bg'], silent: ['stranger'], section: 'v1' });
    expect(shotPerformers(song, { from: 0, to: 6 }, ['lead'])).toMatchObject({ lead: [], silent: ['lead'] });
  });
  it('a window edge inside a measured sung line is a broken line; a spread line is not judged', () => {
    const segs = performanceSegments(song);
    expect(linesCutAt(segs, { from: 8, to: 10 }).map((x) => [x.at, x.segment.text])).toEqual([[10, 'one']]);
    expect(linesCutAt(segs, { from: 8, to: 11.6 })).toEqual([]);
  });
});

describe('one copy of the music', () => {
  const rate = 8000;
  // a song-like signal: bursts of different loudness, not periodic
  const make = (seconds: number, seed = 7) => { const x = new Float32Array(seconds * rate); let r = seed; let level = 0.2; for (let i = 0; i < x.length; i++) { if (i % 1600 === 0) { r = (r * 1103515245 + 12345) & 0x7fffffff; level = 0.05 + (r % 1000) / 1000; } r = (r * 1103515245 + 12345) & 0x7fffffff; x[i] = level * (((r % 2001) - 1000) / 1000); } return x; };
  const master = make(20);
  it('the master alone is one copy', () => {
    expect(judgeSongCopies(envelope(master, rate), envelope(master, rate)).ok).toBe(true);
  });
  it('the master plus itself 1.2 s late is a second copy, found at its lag', () => {
    const mix = new Float32Array(master.length);
    const d = Math.round(1.2 * rate);
    for (let i = 0; i < mix.length; i++) mix[i] = master[i] + (i >= d ? 0.8 * master[i - d] : 0);
    const r = judgeSongCopies(envelope(mix, rate), envelope(master, rate));
    expect(r.ok).toBe(false);
    expect(r.copies[0].lagSeconds).toBeCloseTo(1.2, 1);
    expect(r.detail).toMatch(/a second copy of the music/);
  });
  it('dialogue-like sound over the master is not a copy', () => {
    const other = make(20, 99);
    const mix = master.map((v, i) => v + 0.5 * other[i]);
    expect(judgeSongCopies(envelope(mix, rate), envelope(master, rate)).ok).toBe(true);
  });
});

describe('lip-sync repair by the sound', () => {
  it('a recorded line shifts by a measured lag of 2–6 frames; in sync or too far is left alone', async () => {
    const { lipSyncShiftSamples, SAMPLES_PER_FRAME } = await import('@/domain/timeline');
    const { MOUTH_LAG_CALIBRATION: calibration } = await import('@/domain/lip-sync-calibration');
    const t = (lagFrames: number, against = 'RECORDED') => ({ params: { lipSync: { lagFrames, against, calibration } } });
    expect(lipSyncShiftSamples(t(1))).toBe(0);
    expect(lipSyncShiftSamples(t(3))).toBe(3 * SAMPLES_PER_FRAME);
    expect(lipSyncShiftSamples(t(-4))).toBe(-4 * SAMPLES_PER_FRAME);
    expect(lipSyncShiftSamples(t(9))).toBe(0);
    expect(lipSyncShiftSamples(t(3, 'TAKE_AUDIO'))).toBe(0);
    expect(lipSyncShiftSamples({ params: {} })).toBe(0);
    // a FAIL's lag (the mouth did not follow the audio) is no offset: nothing is moved
    expect(lipSyncShiftSamples({ params: { lipSync: { lagFrames: -2, against: 'RECORDED', verdict: 'FAIL', offsetRepair: false, calibration } } })).toBe(0);
    expect(lipSyncShiftSamples({ params: { lipSync: { lagFrames: -3, against: 'RECORDED', verdict: 'REVIEW', offsetRepair: true, calibration } } })).toBe(-3 * SAMPLES_PER_FRAME);
  });
  it('an older record holds the raw lag: its −4 is the measure’s own lead, in sync, and nothing is moved (1.2, 2.3)', async () => {
    const { lipSyncShiftSamples, SAMPLES_PER_FRAME } = await import('@/domain/timeline');
    expect(lipSyncShiftSamples({ params: { lipSync: { lagFrames: -4, against: 'RECORDED', verdict: 'REVIEW', offsetRepair: true } } })).toBe(0);
    expect(lipSyncShiftSamples({ params: { lipSync: { lagFrames: -1, against: 'RECORDED', verdict: 'REVIEW', offsetRepair: true } } })).toBe(3 * SAMPLES_PER_FRAME);
  });
});
