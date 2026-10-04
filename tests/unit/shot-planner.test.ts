import { describe, expect, it } from 'vitest';
import { shapeShotPlan, type PlanLine } from '@/server/story/engine';
import { ShotPlanSchema } from '@/server/story/schemas';
import type { Character, Scene } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** THE SHOT PLANNER'S OUTPUT ON FIXTURE PLANS (no model): what the language model returns is shaped by code — the
 *  boundary of every shot set (explicit, or from the relation; a scene's first shot opens it), names resolved to the
 *  cast, every line assigned once. */

function setup() {
  const { state, p } = fixture();
  const cast = state.characters.filter((c) => p.castIds.includes(c.id)) as Character[];
  const [a, b] = cast;
  const scene: Scene = { ...p.scenes[0], beats: [{ id: 'b1', action: `${a.name} sets the box down. ${b.name} looks up.`, lines: [{ id: 'l1', characterId: a.id, text: 'We close in ten minutes.' }, { id: 'l2', characterId: b.id, text: 'Then I will be quick.' }] }] };
  const lines: PlanLine[] = scene.beats.flatMap((bt) => bt.lines.map((l) => ({ id: l.id, characterId: l.characterId, characterName: cast.find((c) => c.id === l.characterId)!.name, text: l.text, textAr: l.textAr })));
  return { cast, a, b, scene, lines };
}

const shot = (over: Record<string, unknown>) => ({ purpose: 'p', action: 'She sets the box on the counter.', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterNames: [], dialogueLineIndexes: [], transition: 'CUT', continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CUT' }, prompt: 'x', ...over });

describe('shapeShotPlan: the boundary', () => {
  it('an explicit boundary is kept (in any spelling), relationToPrevious follows it; without one the relation decides; the first shot of a scene opens it', () => {
    const { cast, a, b, scene, lines } = setup();
    const data = ShotPlanSchema.parse({ shots: [
      shot({ characterNames: [a.name], dialogueLineIndexes: [0], boundary: 'continuous', continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CONTINUATION' } }),
      shot({ characterNames: [a.name, b.name], boundary: 'Continuous', continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CUT' } }),
      shot({ characterNames: [b.name], dialogueLineIndexes: [1], boundary: 'new angle' }),
      shot({ characterNames: [b.name], continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'STORY_TRANSITION' } }),
      shot({ characterNames: [a.name], boundary: null, continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CONTINUATION' } }),
    ] });
    const shots = shapeShotPlan(data, { cast, scene, lines, maxShot: 10 });
    expect(shots.map((s) => s.boundary)).toEqual(['transition', 'continuous', 'cut', 'transition', 'continuous']);
    expect(shots.map((s) => s.continuity.relationToPrevious)).toEqual(['STORY_TRANSITION', 'CONTINUATION', 'CUT', 'STORY_TRANSITION', 'CONTINUATION']);
    // names resolved, lines assigned once each
    expect(shots[0].characterIds).toEqual([a.id]);
    expect(shots[1].characterIds).toEqual([a.id, b.id]);
    expect(shots.flatMap((s) => s.dialogue.map((d) => d.id))).toEqual(['l1', 'l2']);
  });
  it('a forgotten line goes to the next shot that holds its speaker', () => {
    const { cast, a, b, scene, lines } = setup();
    const data = ShotPlanSchema.parse({ shots: [shot({ characterNames: [a.name], dialogueLineIndexes: [0] }), shot({ characterNames: [b.name] })] });
    const shots = shapeShotPlan(data, { cast, scene, lines, maxShot: 10 });
    expect(shots[1].dialogue.map((d) => d.id)).toEqual(['l2']);
    expect(shots[1].characterIds).toEqual([b.id]);
  });
});
