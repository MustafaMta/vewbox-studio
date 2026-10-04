import { describe, expect, it } from 'vitest';
import { seed as sampleState } from '@/domain/sample';
import { runCommand, type Command } from '@/domain/commands';
import { approvalSubjectHash } from '@/domain/approvals';
import type { StudioState } from '@/domain/types';
import { derivedBatchId, replayLog } from '@/server/studio/journal';

/** WHAT AN APPROVAL BINDS (docs/BACKEND-AUDIT-2026-10.md H9, step 9) and the journal's pure parts (H10). */

const run = (s: StudioState, name: string, args: unknown[], seed = `s-${Math.random()}`) => runCommand(s, { name, args, seed, at: '2026-10-04T00:00:00.000Z' } as unknown as Command).state;

describe('approval subjects', () => {
  const s0 = sampleState();
  const p = s0.productions.find((x) => x.scenes.length > 0 && x.shots.length > 0)!;
  const story = (s: StudioState) => approvalSubjectHash(s.productions.find((x) => x.id === p.id)!, 'STORY');
  const cut = (s: StudioState) => approvalSubjectHash(s.productions.find((x) => x.id === p.id)!, 'EDIT');

  it('the story: a scene\'s purpose or the synopsis changes it; the script, casting and shots do not', () => {
    const sc = p.scenes[0];
    expect(story(run(s0, 'updateScene', [p.id, sc.id, { purpose: 'something else entirely' }]))).not.toBe(story(s0));
    expect(story(run(s0, 'updateProduction', [p.id, { synopsis: 'another story' }]))).not.toBe(story(s0));
    expect(story(run(s0, 'updateScene', [p.id, sc.id, { beats: [{ id: 'b', action: 'x', lines: [] }], characterIds: [] }]))).toBe(story(s0));
    expect(story(run(s0, 'updateProduction', [p.id, { castIds: [], title: 'renamed' }]))).toBe(story(s0));
    expect(story(run(s0, 'deleteShot', [p.id, p.shots[0].id]))).toBe(story(s0));
  });

  it('the cut: another chosen take, a removed shot or another cut asset changes it; a note does not', () => {
    const sh = p.shots.find((x) => x.selectedTakeId)!;
    expect(cut(run(s0, 'selectTake', [p.id, sh.id, undefined]))).not.toBe(cut(s0));
    expect(cut(run(s0, 'deleteShot', [p.id, sh.id]))).not.toBe(cut(s0));
    expect(cut(run(s0, 'setCut', [p.id, s0.assets.find((a) => a.kind === 'VIDEO')!.id]))).not.toBe(cut(s0));
    expect(cut(run(s0, 'updateShot', [p.id, sh.id, { notes: 'a note' }]))).toBe(cut(s0));
  });
});

describe('the journal, pure', () => {
  it('an unnamed batch is named by its seeds: the same batch sent again has the same id', () => {
    expect(derivedBatchId([{ seed: 'a' }, { seed: 'b' }])).toBe(derivedBatchId([{ seed: 'a' }, { seed: 'b' }]));
    expect(derivedBatchId([{ seed: 'a' }, { seed: 'b' }])).not.toBe(derivedBatchId([{ seed: 'b' }, { seed: 'a' }]));
  });
  it('replaying logged batches (seeds and clocks kept) reproduces the state; refused batches are skipped', () => {
    const s0 = sampleState();
    const p = s0.productions[0];
    const c1 = { name: 'addScene', args: [p.id, { title: 'Replayed', timeOfDay: 'DUSK' }], seed: 'seed-1', at: '2026-10-04T01:00:00.000Z' } as unknown as Command;
    const c2 = { name: 'updateProduction', args: [p.id, { logline: 'replayed logline' }], seed: 'seed-2', at: '2026-10-04T01:00:01.000Z' } as unknown as Command;
    const direct = runCommand(runCommand(s0, c1).state, c2).state;
    const refused = { name: 'deleteShot', args: ['nope', 'nope'], seed: 'seed-3', at: '2026-10-04T01:00:02.000Z' } as unknown as Command;
    expect(replayLog(s0, [{ ok: true, commands: [c1] }, { ok: false, commands: [refused] }, { ok: true, commands: [c2] }])).toEqual(direct);
  });
});
