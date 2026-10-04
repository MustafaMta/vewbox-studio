import { describe, expect, it } from 'vitest';
import { seed as sampleState } from '@/domain/sample';
import { runCommand, validateClientCommand, type Command } from '@/domain/commands';
import { cutInputsHash } from '@/domain/cut';
import type { Production, StudioState } from '@/domain/types';

/** STALE DERIVATIVES (docs/BACKEND-AUDIT-2026-10.md M2, step 12): a production's assembled cut goes out of date when
 *  what it was made from changes — and only then. Pure reducers, so the browser computes the same flag. */

const run = (s: StudioState, name: string, args: unknown[]) => runCommand(s, { name, args, seed: `s-${Math.random()}`, at: '2026-10-04T00:00:00.000Z' } as unknown as Command).state;

describe('cutStale', () => {
  const s0 = sampleState();
  const base = s0.productions.find((x) => x.shots.length > 1 && x.shots.some((sh) => sh.takes.length > 1 || sh.selectedTakeId))!;
  const cut = s0.assets.find((a) => a.kind === 'VIDEO')!.id;
  const withCut = run(s0, 'setCut', [base.id, cut]);
  const prod = (s: StudioState): Production => s.productions.find((x) => x.id === base.id)!;
  const shot = prod(withCut).shots.find((sh) => sh.selectedTakeId)!;
  const other = prod(withCut).shots.find((sh) => sh.id !== shot.id)!;

  it('a fresh cut is current', () => { expect(prod(withCut).cutStale).toBeUndefined(); });

  it('selectTake, rateTake and removeTake make the cut stale', () => {
    expect(prod(run(withCut, 'selectTake', [base.id, shot.id, undefined])).cutStale).toBe(true);
    expect(prod(run(withCut, 'rateTake', [base.id, shot.id, shot.selectedTakeId!, 'GOOD'])).cutStale).toBe(true);
    expect(prod(run(withCut, 'removeTake', [base.id, shot.id, shot.selectedTakeId!])).cutStale).toBe(true);
    // choosing the take already chosen changes nothing
    expect(prod(run(withCut, 'selectTake', [base.id, shot.id, shot.selectedTakeId])).cutStale).toBeUndefined();
  });

  it('shot edits the cut shows make it stale; a note or a prompt does not', () => {
    expect(prod(run(withCut, 'updateShot', [base.id, other.id, { durationSeconds: other.durationSeconds + 1 }])).cutStale).toBe(true);
    expect(prod(run(withCut, 'deleteShot', [base.id, other.id])).cutStale).toBe(true);
    expect(prod(run(withCut, 'addShot', [base.id, { sceneId: other.sceneId, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }])).cutStale).toBe(true);
    expect(prod(run(withCut, 'updateShot', [base.id, other.id, { notes: 'a note', prompt: 'a prompt' }])).cutStale).toBeUndefined();
  });

  it('without a cut nothing is stale; a new current cut clears it; a cut rendered from older inputs is stale at once', () => {
    const noCut = run(s0, 'setCut', [base.id, undefined]);
    expect(prod(run(noCut, 'updateShot', [base.id, other.id, { durationSeconds: 9 }])).cutStale).toBeUndefined();
    const stale = run(withCut, 'updateShot', [base.id, other.id, { durationSeconds: 9 }]);
    expect(prod(run(stale, 'setCut', [base.id, cut, { inputs: cutInputsHash(prod(stale)) }])).cutStale).toBeUndefined();
    expect(prod(run(stale, 'setCut', [base.id, cut, { inputs: cutInputsHash(prod(withCut)) }])).cutStale).toBe(true);
    expect(prod(run(stale, 'deleteAsset', [cut])).cutStale).toBeUndefined();
  });

  it('a page cannot set the flag', () => {
    expect(() => validateClientCommand('updateProduction', [base.id, { cutStale: false }])).toThrow(/written by the studio/);
  });
});
