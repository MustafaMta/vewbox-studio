import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { performanceFor, sectionFor, shotWindows, sungLinesFor } from '@/domain/timeline';

/** A music video's shots must know which part of the song they cover and who sings it: only the assigned performer
 *  performs their lyrics, and an instrumental window has nobody mouthing words. */

describe('timeline', () => {
  const s = seed();
  const mv = s.productions.find((p) => p.kind === 'MUSIC_VIDEO' && p.song)!;

  it('places shots back to back in cut order', () => {
    const w = shotWindows(mv);
    const ordered = [...w.values()];
    expect(ordered[0].from).toBe(0);
    for (let i = 1; i < ordered.length; i++) expect(ordered[i].from).toBe(ordered[i - 1].to);
  });

  it('a music video’s windows are its windows on the song, as the cut plays them: the producer’s songWindow wins, gaps are run over', () => {
    const p = { ...mv, shots: mv.shots.map((sh, i) => (i === 1 ? { ...sh, songWindow: { from: mv.shots[0].durationSeconds + 2, to: mv.shots[0].durationSeconds + 6 } } : sh)) };
    const w = shotWindows(p);
    const [a, b, c] = [w.get(p.shots[0].id)!, w.get(p.shots[1].id)!, w.get(p.shots[2].id)!];
    // shot 1 runs on over the 2 s nobody covers; shot 2 starts where the producer put it and runs on to shot 3
    expect(a).toEqual({ from: 0, to: mv.shots[0].durationSeconds + 2 });
    expect(b).toEqual({ from: mv.shots[0].durationSeconds + 2, to: c.from });
    expect(c).toEqual(p.shots[2].songWindow ?? c);
  });

  it('maps a window to the section that owns most of it and to its singers', () => {
    const song = mv.song!;
    const verse = song.sections.find((x) => x.kind === 'VERSE')!;
    const w = { from: verse.from + 1, to: verse.from + 5 };
    expect(sectionFor(song, w)?.id).toBe(verse.id);
    const perf = performanceFor(song, w)!;
    expect(perf.singerIds).toEqual(verse.singerIds);
    expect(perf.mode).toBe(verse.singerIds.length === 1 ? 'SOLO' : perf.mode);
    const lines = sungLinesFor(song, w, 'AR');
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) { expect(verse.singerIds).toContain(l.singerId); expect(l.textAr || l.text).toBeTruthy(); }
  });

  it('an intro with no singers performs nothing', () => {
    const song = mv.song!;
    const intro = song.sections.find((x) => x.singerIds.length === 0)!;
    const w = { from: intro.from, to: Math.min(intro.to, intro.from + 4) };
    expect(performanceFor(song, w)?.mode).toBe('INSTRUMENTAL');
    expect(sungLinesFor(song, w, 'EN')).toEqual([]);
  });

  it('alternating sections give each line to its own singer', () => {
    const song = { ...mv.song!, sections: [{ id: 'x', kind: 'VERSE' as const, text: 'a\nb', singerIds: ['p', 'q'], from: 0, to: 10, performanceMode: 'ALTERNATING' as const, lines: [{ singerId: 'p', text: 'a' }, { singerId: 'q', text: 'b' }] }] };
    expect(sungLinesFor(song, { from: 0, to: 4 }, 'EN')).toEqual([{ singerId: 'p', text: 'a' }]);
    expect(sungLinesFor(song, { from: 6, to: 10 }, 'EN')).toEqual([{ singerId: 'q', text: 'b' }]);
  });
});
