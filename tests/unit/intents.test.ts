import { describe, expect, it } from 'vitest';
import { seed as sampleState } from '@/domain/sample';
import { runCommand, isSystemCommand, validateClientCommand, type Command } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** INTENT COMMANDS (docs/BACKEND-AUDIT-2026-10.md H3, step 11), pure: what a worker means, applied to the state as it
 *  is when the command runs. */

const run = (s: StudioState, name: string, args: unknown[]) => runCommand(s, { name, args, seed: `s-${Math.random()}`, at: '2026-10-04T00:00:00.000Z' } as unknown as Command).state;

describe('intents', () => {
  const s0 = sampleState();
  const p = s0.productions[0];
  const [c1, c2] = s0.characters;

  it('addCastMember adds, keeps order, never removes, and refuses an unknown character', () => {
    const s = run(run(s0, 'updateProduction', [p.id, { castIds: [c1.id] }]), 'addCastMember', [{ productionId: p.id }, [c2.id, c1.id]]);
    expect(s.productions.find((x) => x.id === p.id)!.castIds).toEqual([c1.id, c2.id]);
    expect(() => run(s0, 'addCastMember', [{ productionId: p.id }, ['char-nobody']])).toThrow(/not found/);
  });

  it('fillProductionFields writes a field only while it is what the worker read', () => {
    const edited = run(s0, 'updateProduction', [p.id, { logline: 'producer' }]);
    const s = run(edited, 'fillProductionFields', [p.id, { logline: 'worker', synopsis: 'worker synopsis' }, { logline: p.logline, synopsis: p.synopsis }]);
    expect(s.productions.find((x) => x.id === p.id)).toMatchObject({ logline: 'producer', synopsis: 'worker synopsis' });
  });

  it('updateShowBible replaces only the episode\'s own timeline entries, resolves storylines, caps lists', () => {
    const show = s0.shows[0];
    if (!show) return;
    const withBible = run(s0, 'updateShow', [show.id, { bible: { timeline: ['S1E1: old', 'S1E2: keep'], unresolved: ['Who sent the letter?', 'A'], relationships: ['x'] } }]);
    const s = run(withBible, 'updateShowBible', [show.id, { timeline: { dropPrefix: 'S1E1:', add: ['S1E1: new'] }, unresolved: { resolve: ['who sent the letter?'], add: ['B', 'C'], max: 2 }, relationships: { add: ['x', 'y'] } }]);
    expect(s.shows.find((x) => x.id === show.id)!.bible).toMatchObject({ timeline: ['S1E2: keep', 'S1E1: new'], unresolved: ['A', 'B'], relationships: ['x', 'y'] });
  });

  it('a take numbered "Take N" from an old read becomes the next free number when N was taken', () => {
    const prod = s0.productions.find((x) => x.shots.some((sh) => sh.takes.length > 0))!;
    const sh = prod.shots.find((x) => x.takes.length > 0)!;
    const asset = s0.assets.find((a) => a.kind === 'VIDEO')!;
    const s = run(s0, 'addTake', [prod.id, sh.id, { assetId: asset.id, provider: 'MINIMAX', label: sh.takes[0].label }]);
    const labels = s.productions.find((x) => x.id === prod.id)!.shots.find((x) => x.id === sh.id)!.takes.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('the intents are the workers\': a page cannot send them', () => {
    for (const n of ['addCastMember', 'addLocationMember', 'updateShowBible', 'fillProductionFields'] as const) {
      expect(isSystemCommand(n)).toBe(true);
      expect(() => validateClientCommand(n, [])).toThrow(/written by the studio/);
    }
  });
});
