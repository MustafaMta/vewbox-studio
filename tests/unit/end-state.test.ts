import { describe, expect, it } from 'vitest';
import { recordTakeEndState } from '@/domain/actions';
import { productionContextFor } from '@/domain/production-context';
import type { Shot, StudioState } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** PLANNED vs ACTUAL END STATE: the next same-moment shot starts from what the previous shot's chosen take ACTUALLY
 *  ended with, as the producer approved it — the plan's end pose only when nobody approved one, and then it says so. */
const setup = () => {
  const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, continuity: { ...s.continuity!, characters: s.continuity!.characters.map((c) => ({ ...c, endPose: 'standing behind the counter' })) } } as Shot : s)) });
  return { state, p, a: p.castIds[0], b: p.castIds[1] };
};
const prod = (s: StudioState) => s.productions.find((x) => x.id === 'prod-cont')!;

describe('the approved actual end state', () => {
  it('without one, the continuous shot starts from the planned end pose and names the gap', () => {
    const { state, p, a } = setup();
    const c = productionContextFor(state, p, shotOf(p, 's12'));
    const x = c.characters.find((k) => k.characterId === a)!;
    expect(x.startPose).toMatchObject({ text: 'standing behind the counter', source: { kind: 'PREVIOUS_SHOT', shotId: 's11' } });
    expect(c.gaps.join(' ')).toMatch(/no approved end state .* PLANNED end pose/);
  });

  it('an observation alone changes nothing; the producer’s approved record is where the next shot starts', () => {
    const { state, p, a } = setup();
    const observed = recordTakeEndState(state, p.id, 's11', 'take-a', { characters: [{ characterId: a, pose: 'leaning on the counter', holding: ['the box'] }], source: 'VISION' });
    expect(productionContextFor(observed, prod(observed), shotOf(prod(observed), 's12')).characters.find((k) => k.characterId === a)!.startPose?.text).toBe('standing behind the counter');
    const approved = recordTakeEndState(observed, p.id, 's11', 'take-a', { characters: [{ characterId: a, pose: 'leaning on the counter', holding: ['the box'], condition: 'out of breath' }], by: 'producer' }, { approve: true });
    const c = productionContextFor(approved, prod(approved), shotOf(prod(approved), 's12'));
    const x = c.characters.find((k) => k.characterId === a)!;
    expect(x.startPose).toEqual({ text: 'leaning on the counter', source: { kind: 'PREVIOUS_TAKE', shotId: 's11', takeId: 'take-a' } });
    expect(x.holding).toEqual(['the box']);
    expect(x.condition[0]).toMatchObject({ text: 'out of breath', source: { kind: 'PREVIOUS_TAKE' } });
    expect(c.shot.constraints).toContain(`${x.name} starts as the previous shot ended: leaning on the counter`);
    // the recorded person no longer starts from the plan; the other (not in the record) still does, and is named
    expect(c.gaps.filter((g) => g.includes(x.name) && /PLANNED end pose/.test(g))).toEqual([]);
    // both records are kept on the take
    const take = shotOf(prod(approved), 's11').takes[0];
    expect(take.endState?.observed?.source).toBe('VISION');
    expect(take.endState?.approved?.source).toBe('PRODUCER');
  });

  it('refuses a person outside the shot and an unknown take', () => {
    const { state, p } = setup();
    expect(() => recordTakeEndState(state, p.id, 's13', 'take-a', { characters: [] })).toThrow(/Take take-a was not found/);
    const s13cast = shotOf(p, 's13').characterIds;
    const outsider = p.castIds.find((id) => !s13cast.includes(id))!;
    const withTake = { ...state, productions: state.productions.map((x) => (x.id !== p.id ? x : { ...x, shots: x.shots.map((s) => (s.id === 's13' ? { ...s, takes: [{ ...shotOf(p, 's11').takes[0] }] } : s)) })) };
    expect(() => recordTakeEndState(withTake, p.id, 's13', 'take-a', { characters: [{ characterId: outsider, pose: 'x' }] })).toThrow(/Only the people in shot 3/);
  });
});
