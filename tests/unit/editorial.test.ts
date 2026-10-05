import { describe, expect, it } from 'vitest';
import { editorialTransition } from '@/domain/editorial';
import { addShot, updateShot } from '@/domain/actions';
import { shapeShotPlan } from '@/server/story/engine';
import { ShotPlanSchema } from '@/server/story/schemas';
import type { Character } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** QA Q3: the editorial join follows the boundary — continuous → EXTEND, cut and transition → CUT; a dissolve or a fade
 *  is never a producer's choice and never kept from the planner (final directive §13). */
describe('the editorial transition follows the boundary', () => {
  it('derived from the boundary, else the older relation, else a cut', () => {
    expect(editorialTransition({ boundary: 'continuous' })).toBe('EXTEND');
    expect(editorialTransition({ boundary: 'cut' })).toBe('CUT');
    expect(editorialTransition({ boundary: 'transition' })).toBe('CUT');
    expect(editorialTransition({ continuity: { version: 1, characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CONTINUATION' } })).toBe('EXTEND');
    expect(editorialTransition({})).toBe('CUT');
  });

  it('the reducers write it: a FADE sent with a shot is replaced; a boundary change moves it', () => {
    const { state, p } = fixture();
    const { state: s1, shot } = addShot(state, p.id, { sceneId: 'sc1', purpose: 'p', action: 'a', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'FADE', boundary: 'cut' });
    expect(shot.transition).toBe('CUT');
    const s2 = updateShot(s1, p.id, shot.id, { transition: 'DISSOLVE', boundary: 'continuous' });
    expect(s2.productions.find((x) => x.id === p.id)!.shots.find((x) => x.id === shot.id)!.transition).toBe('EXTEND');
  });

  it('the planner’s dissolve is not kept', () => {
    const { state, p } = fixture();
    const cast = state.characters.filter((c) => p.castIds.includes(c.id)) as Character[];
    const base = { purpose: 'p', action: 'x', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterNames: [], continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CUT' }, prompt: 'x' };
    const shots = shapeShotPlan(ShotPlanSchema.parse({ shots: [{ ...base, transition: 'DISSOLVE' }, { ...base, transition: 'FADE', boundary: 'continuous' }] }), { cast, scene: { ...p.scenes[0], beats: [] }, lines: [], maxShot: 10 });
    expect(shots.map((s) => s.transition)).toEqual(['CUT', 'EXTEND']);
  });
});
