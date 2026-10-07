import { describe, expect, it } from 'vitest';
import type { LyricSection } from '@/domain/types';
import { alignLyrics, linesFromForcedAlignment, type Word } from '@/server/media/lyrics';
import { scriptWords } from '@/server/providers/qa-service';

/** Words as Whisper returns them for a sung verse: a few mis-hearings, a sustained word, a pause. */
const words: Word[] = [
  ...'these streets know every crack in my voice'.split(' ').map((w, i) => ({ word: w, start: 7.2 + i * 0.5, end: 7.6 + i * 0.5 })),
  ...'every mile ive driven through the night'.split(' ').map((w, i) => ({ word: w, start: 11.2 + i * 0.45, end: 11.6 + i * 0.45 })),
  ...'headlights cars stories on the asphalt'.split(' ').map((w, i) => ({ word: w, start: 14.4 + i * 0.5, end: 14.8 + i * 0.5 })), // "carve" heard as "cars"
  ...'but the city never listens'.split(' ').map((w, i) => ({ word: w, start: 17.8 + i * 0.4, end: 18.1 + i * 0.4 })),
];
const section: LyricSection = { id: 'v1', kind: 'VERSE', from: 0, to: 20, singerIds: ['a'], text: 'These streets know every crack in my voice\nEvery mile I\'ve driven through the night\nHeadlights carve stories on the asphalt\nBut the city never listens' } as LyricSection;

describe('alignLyrics', () => {
  it('places each line on the words that sing it, in order', () => {
    const out = alignLyrics([section], words, 'EN');
    expect(out).toHaveLength(4);
    expect(out.every((l) => l.method === 'ALIGNED')).toBe(true);
    expect(out[0].from).toBeCloseTo(7.2, 1);
    expect(out[1].from).toBeCloseTo(11.2, 1);
    expect(out[2].from).toBeCloseTo(14.4, 1);
    expect(out[3].to).toBeCloseTo(18.1 + 4 * 0.4, 1);
    for (let i = 1; i < out.length; i++) expect(out[i].from).toBeGreaterThanOrEqual(out[i - 1].to);
  });
  it('a singer who runs into the planned outro is still found; the window never reaches into the next sung section', () => {
    // Harbour Lights: the last chorus was planned to end at 84; its last line was sung at 85.5–88.8, in the "outro"
    const late = 'youre my home beneath the sky'.split(' ').map((w, i) => ({ word: w, start: 85.5 + i * 0.5, end: 85.9 + i * 0.5 }));
    const chorus = { id: 'c3', kind: 'CHORUS', from: 71, to: 84, singerIds: ['a'], text: 'You’re my home beneath the sky' } as LyricSection;
    const outro = { id: 'o', kind: 'OUTRO', from: 84, to: 90, singerIds: [], text: '' } as LyricSection;
    expect(alignLyrics([chorus, outro], late, 'EN')[0]).toMatchObject({ method: 'ALIGNED', from: 85.5 });
    // with a sung section after it, the same words belong to that section, not this one
    const verse = { id: 'v', kind: 'VERSE', from: 84, to: 90, singerIds: ['a'], text: 'You’re my home beneath the sky' } as LyricSection;
    const out = alignLyrics([{ ...chorus, text: 'Hold me close until the dawn' }, verse], late, 'EN');
    expect(out.map((l) => [l.sectionId, l.method])).toEqual([['c3', 'SPREAD'], ['v', 'ALIGNED']]);
  });

  it('falls back to an even spread when the transcript has nothing credible', () => {
    const out = alignLyrics([section], [{ word: 'la', start: 1, end: 1.2 }], 'EN');
    expect(out.every((l) => l.method === 'SPREAD')).toBe(true);
    expect(out[0].from).toBe(0);
    expect(out[3].to).toBe(20);
  });
  it('handles Arabic with normalisation', () => {
    const ar: LyricSection = { id: 'c', kind: 'CHORUS', from: 0, to: 10, singerIds: ['a'], text: 'the river keeps the lights\nwe borrow them one by one', textAr: 'النهر يحفظ الأضواء\nنستعيرها واحداً واحداً' } as LyricSection;
    const w: Word[] = [...'النهر يحفظ الاضواء'.split(' ').map((x, i) => ({ word: x, start: 1 + i * 0.6, end: 1.5 + i * 0.6 })), ...'نستعيرها واحدا واحدا'.split(' ').map((x, i) => ({ word: x, start: 4 + i * 0.6, end: 4.5 + i * 0.6 }))];
    const out = alignLyrics([ar], w, 'AR');
    expect(out[0].method).toBe('ALIGNED');
    expect(out[1].method).toBe('ALIGNED');
    expect(out[1].from).toBeCloseTo(4, 1);
    expect(out[1].textAr).toContain('نستعيرها');
  });
});

describe('linesFromForcedAlignment (asr /align on the vocal stem)', () => {
  const w = (start: number | null, end: number | null, aligned = true) => ({ start, end, aligned });
  it('each written line owns its words in order and is timed from its first to its last aligned word', () => {
    const lines = ['Hold the light, Paul,', 'we are almost home —', 'la la'];
    const words = [w(1.0, 1.3), w(1.3, 1.5), w(1.5, 1.9), w(1.9, 2.4), w(3.0, 3.2), w(3.2, 3.4), w(null, null, false), w(3.9, 4.6), w(5.0, 5.2), w(5.3, 5.6)];
    const r = linesFromForcedAlignment(lines, words, scriptWords);
    expect(r[0]).toEqual({ from: 1.0, to: 2.4, aligned: 4, total: 4 });
    expect(r[1]).toEqual({ from: 3.0, to: 4.6, aligned: 3, total: 4 }); // the dash is not a word; one word unaligned
    expect(r[2]).toEqual({ from: 5.0, to: 5.6, aligned: 2, total: 2 });
  });
  it('a line with fewer than half of its words aligned keeps no forced time', () => {
    const r = linesFromForcedAlignment(['one two three four'], [w(1, 2), w(null, null, false), w(null, null, false), w(null, null, false)], scriptWords);
    expect(r).toEqual([undefined]);
  });
});