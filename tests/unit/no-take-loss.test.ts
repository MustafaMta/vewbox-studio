import { describe, expect, it } from 'vitest';
import { matchScenes } from '@/domain/actions';
import { seed as sampleState } from '@/domain/sample';
import { runCommand, type Command } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** REPLACING A SCRIPT KEEPS WHAT WAS FILMED (docs/BACKEND-AUDIT-2026-10.md C4, step 10): the new scenes take the ids of
 *  the scenes they match, so shots and takes stay attached; a written script is not replaced by a re-run. */

const run = (s: StudioState, name: string, args: unknown[]) => runCommand(s, { name, args, seed: `s-${Math.random()}`, at: '2026-10-04T00:00:00.000Z' } as unknown as Command).state;

describe('matchScenes', () => {
  const existing = [{ id: 'a', title: 'The harbour' }, { id: 'b', title: 'The lighthouse' }, { id: 'c', title: 'Dawn' }];
  it('by id, then by title (case and spacing ignored), then by place; each existing scene once', () => {
    expect(matchScenes(existing, [{ id: 'b', title: 'renamed' }, { title: 'the  HARBOUR' }, { title: 'something new' }])).toEqual(['b', 'a', 'c']);
    expect(matchScenes(existing, [{ id: 'random-1', title: 'x' }, { id: 'random-2', title: 'The lighthouse' }])).toEqual(['a', 'b']);
    expect(matchScenes(existing, [{ title: 'Dawn' }, { title: 'Dawn' }, { title: 'q' }, { title: 'r' }])).toEqual(['c', 'b', undefined, undefined]);
    expect(matchScenes([], [{ title: 'x' }])).toEqual([undefined]);
  });
});

describe('replaceScript', () => {
  const s0 = sampleState();
  const p = s0.productions.find((x) => x.scenes.length >= 2 && x.shots.some((sh) => sh.takes.length > 0))!;
  const lineless = (s: StudioState) => ({ ...s, productions: s.productions.map((x) => (x.id === p.id ? { ...x, scenes: x.scenes.map((sc) => ({ ...sc, beats: [] })) } : x)) });

  it('a re-developed story with new random ids keeps the matched scenes\' ids, shots and takes', () => {
    const base = lineless(s0);
    const before = base.productions.find((x) => x.id === p.id)!;
    const developed = before.scenes.map((sc, i) => ({ id: `scene-fresh-${i}`, title: sc.title.toUpperCase(), timeOfDay: sc.timeOfDay, characterIds: sc.characterIds, beats: [] }));
    const after = run(base, 'replaceScript', [p.id, developed, { keepWritten: true }]).productions.find((x) => x.id === p.id)!;
    expect(after.scenes.map((sc) => sc.id)).toEqual(before.scenes.map((sc) => sc.id));
    expect(after.shots.map((sh) => [sh.id, sh.takes.length, sh.selectedTakeId])).toEqual(before.shots.map((sh) => [sh.id, sh.takes.length, sh.selectedTakeId]));
  });

  it('keepWritten refuses to replace a script that has lines (decided on the state the command runs on)', () => {
    const written = s0.productions.find((x) => x.scenes.some((sc) => sc.beats.some((b) => b.lines.length)));
    if (!written) return;
    expect(() => run(s0, 'replaceScript', [written.id, [{ title: 'x', timeOfDay: 'DAWN', characterIds: [], beats: [] }], { keepWritten: true }])).toThrow(/written lines/);
  });
});
