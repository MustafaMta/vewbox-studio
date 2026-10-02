import { describe, expect, it } from 'vitest';
import { dropNulls } from '@/server/story/lenient';
import { ContinuitySchema, ScriptSchema, ShotPlanSchema } from '@/server/story/schemas';

/** The story engine's schemas must accept what language models actually return (nulls, lower case, synonyms,
 *  near-miss keys) while still refusing nonsense. These are the exact failures seen from the local Qwen3 model. */

describe('lenient story schemas', () => {
  it('maps synonyms, cases and near-miss keys onto the vocabulary', () => {
    const raw = { shots: [{
      purpose: 'Open', description: 'She walks in.', shotSize: 'close up', camera: 'dolly in', duration: '6s', characters: 'Layla, Omar', lines: [0], transition: 'hard cut',
      continuity: { characters: [{ name: 'Layla', clothing: 'green coat', screenDirection: 'camera left' }], props: null, environment: { timeOfDay: 'evening' }, camera: null, relation: 'new scene' },
    }] };
    const v = ShotPlanSchema.safeParse(dropNulls(raw));
    expect(v.success).toBe(true);
    if (!v.success) return;
    const s = v.data.shots[0];
    expect(s.action).toBe('She walks in.');
    expect(s.framing).toBe('CLOSE_UP');
    expect(s.cameraMove).toBe('PUSH_IN');
    expect(s.durationSeconds).toBe(6);
    expect(s.characterNames).toEqual(['Layla', 'Omar']);
    expect(s.dialogueLineIndexes).toEqual([0]);
    expect(s.transition).toBe('CUT');
    expect(s.continuity.characters[0]).toMatchObject({ characterName: 'Layla', wardrobe: 'green coat', screenDirection: 'LEFT' });
    expect(s.continuity.props).toEqual([]);
    expect(s.continuity.environment.timeOfDay).toBe('DUSK');
    expect(s.continuity.relationToPrevious).toBe('STORY_TRANSITION');
    expect(s.prompt).toBeUndefined();
  });

  it('falls back to safe defaults only where a default is harmless', () => {
    const v = ContinuitySchema.safeParse({ characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'whatever' });
    expect(v.success).toBe(true);
    if (v.success) expect(v.data.relationToPrevious).toBe('CUT');
    const bad = ShotPlanSchema.safeParse({ shots: [{ purpose: 'x', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterNames: [], transition: 'CUT', continuity: {} }] });
    expect(bad.success).toBe(false); // an empty action is a real mistake, not a spelling problem
    const missing = ShotPlanSchema.safeParse({});
    expect(missing.success).toBe(false); // no shots at all
  });

  it('accepts script lines keyed by speaker and nulls for optional text', () => {
    const v = ScriptSchema.safeParse(dropNulls({ scenes: [{ id: 'scene-1', beats: [{ action: 'He sits.', dialogue: [{ speaker: 'Omar', line: 'Hello', textAr: null }] }] }] }));
    expect(v.success).toBe(true);
    if (v.success) expect(v.data.scenes[0].beats[0].lines[0]).toEqual({ characterName: 'Omar', text: 'Hello' });
  });
});
