import { describe, expect, it } from 'vitest';
import { inputSnapshot, snapshotChanges } from '@/domain/input-snapshot';
import { recordTakeEndState } from '@/domain/actions';
import type { StudioState } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** THE FROZEN INPUT SNAPSHOT: what a cut was made from, hashed; the same inputs give the same snapshot, and a change
 *  is named. */
const prod = (s: StudioState) => s.productions.find((x) => x.id === 'prod-cont')!;
const W = { revisionId: 'wrev-1', revision: 3, pinned: true };

describe('inputSnapshot', () => {
  it('records the world revision, the script, every chosen take, the cast and the places; the same inputs hash the same', () => {
    const { state, p } = fixture();
    const s = inputSnapshot(state, p, W);
    expect(s).toMatchObject({ version: 1, productionId: p.id, world: W, script: { scenes: 2, lines: 1 } });
    expect(s.shots.find((x) => x.shotId === 's11')).toMatchObject({ takeId: 'take-a', assetId: 'vid-a', endStateApproved: false });
    expect(s.characters.map((c) => c.canonical?.assetId)).toEqual(['canon-a', 'canon-b']);
    expect(s.locations.map((l) => l.locationId)).toEqual(['loc-pharmacy', 'loc-street']);
    expect(inputSnapshot(state, p, W).hash).toBe(s.hash);
  });

  it('names what changed: another World Bible revision, a script line, an approved end, the cast', () => {
    const { state, p } = fixture();
    const a = inputSnapshot(state, p, W);
    expect(snapshotChanges(a, inputSnapshot(state, p, { ...W, revision: 4 }))).toEqual(['World Bible revision 3 → 4']);
    const edited = { ...p, shots: p.shots.map((sh) => (sh.id === 's12' ? { ...sh, dialogue: sh.dialogue.map((d) => ({ ...d, text: 'We close now.' })) } : sh)) };
    expect(snapshotChanges(a, inputSnapshot(state, edited, W))).toContain('the script changed');
    const ended = recordTakeEndState(state, p.id, 's11', 'take-a', { characters: [] }, { approve: true });
    const b = inputSnapshot(ended, prod(ended), W);
    expect(b.hash).not.toBe(a.hash);
    expect(b.shots.find((x) => x.shotId === 's11')!.endStateApproved).toBe(true);
    const recast = { ...state, characters: state.characters.map((c) => (c.id === p.castIds[1] ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: 'canon-b2', version: 2 } } : c)) };
    expect(snapshotChanges(a, inputSnapshot(recast, p, W))).toEqual([expect.stringMatching(/another canonical image/)]);
  });
});
