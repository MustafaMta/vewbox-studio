import { describe, expect, it } from 'vitest';
import { shapeShotPlan, type PlanLine } from '@/server/story/engine';
import { ShotPlanSchema } from '@/server/story/schemas';
import type { Character, Location, Scene } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** THE SHOT PLANNER'S OUTPUT ON FIXTURE PLANS (no model): what the language model returns is shaped by code — the
 *  boundary of every shot set (explicit, or from the relation; a scene's first shot opens it), names resolved to the
 *  cast, every line assigned once; and the staging (docs/research/STORYBUILDER-INTEGRATION.md §d): timed beats tiled
 *  over the shot, in-take cuts policed, the cast reconciled with the actions, speech scrubbed from silent shots,
 *  speaking faces framed close, the point of view and the extras resolved — on an English story and an Iraqi Arabic
 *  one. */

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

describe('shapeShotPlan: the staging (English story)', () => {
  it('beats timed and tiled, cuts policed, the cast reconciled with the actions, speech scrubbed from a silent shot, a speaking face framed close, pov and extras resolved', () => {
    const { cast, a, b, scene, lines } = setup();
    const { state } = fixture();
    const data = ShotPlanSchema.parse({ shots: [
      // a silent wide shot that names b in its beats (b was not listed) and names speech
      shot({ characterNames: [a.name], framing: 'WIDE', durationSeconds: 8, pace: 'montage', actions: ['sets the box down', 'looks up'], beats: [{ seconds: 1, action: `${a.name} sets the box down.` }, { seconds: 3, action: `${b.name} says a word and looks up.`, cut: { camera: 'reverse on him' } }, { seconds: 0.2, action: 'A glance.' }, { seconds: 4, action: 'Both wait.', cut: 'close on the box' }], extras: ['four tired shoppers in winter coats'] }),
      // a speaking wide shot: framed close; pov through the door crack
      shot({ characterNames: [a.name, b.name], framing: 'WIDE', durationSeconds: 6, dialogueLineIndexes: [0, 1], pov: b.name, boundary: 'cut', beats: [{ seconds: 2, action: 'She leans in.' }, { seconds: 4, action: 'He answers.' }] }),
      // a dwell: no cuts at all
      shot({ characterNames: [a.name], framing: 'MEDIUM', durationSeconds: 5, pace: 'DWELL', beats: [{ seconds: 1, action: 'Still.' }, { seconds: 2, action: 'Still.', cut: { camera: 'x' } }] }),
    ] });
    const shots = shapeShotPlan(data, { cast, scene, lines, maxShot: 10, locations: state.locations });
    const [s1, s2, s3] = shots;
    // s1: 8 s, ratios 1:3:0.2:4 → the first beat and the glance lifted to 1 s (from the longest beat); the cut at
    // 1.0 s is inside the 1.6 s start margin and dropped, the cut at 4.9 s is kept
    expect(s1.staging!.beats!.map((x) => [x.at, Boolean(x.cut)])).toEqual([[0, false], [1, false], [3.927, false], [4.927, true]]);
    expect(s1.notes).toEqual(expect.arrayContaining([expect.stringMatching(/1 in-take cut\(s\) dropped/), expect.stringMatching(/added to the cast from the actions: .+/), 'speech words scrubbed from a silent shot']));
    expect(s1.characterIds).toEqual([a.id, b.id]);
    expect(s1.staging!.beats![1].action).toBe(`${b.name} stays silent a word and looks up. Mouths stay closed; nobody speaks.`);
    expect(s1.staging).toMatchObject({ pace: 'MONTAGE', extras: [{ description: 'four tired shoppers in winter coats' }], actions: ['sets the box down', 'looks up'] });
    expect(s1.framing).toBe('WIDE'); // silent: the size stays
    // s2: speaking, two people on screen but one is the point of view → one face: medium close-up
    expect(s2.framing).toBe('MEDIUM_CLOSE_UP');
    expect(s2.staging).toMatchObject({ pov: b.id, beats: [{ at: 0, action: 'She leans in.' }, { at: 2, action: 'He answers.' }] });
    expect(s2.notes).toEqual(expect.arrayContaining([expect.stringMatching(/framing WIDE → MEDIUM_CLOSE_UP/)]));
    expect(s2.dialogue.map((d) => d.id)).toEqual(['l1', 'l2']);
    // s3: a dwell loses its cut, keeps the beat
    expect(s3.staging!.beats!.every((x) => !x.cut)).toBe(true);
    expect(s3.staging!.pace).toBe('DWELL');
  });
});

describe('shapeShotPlan: an Iraqi Arabic story', () => {
  it('Arabic names resolve to the cast, in the actions too; Iraqi lines stay as written; the staging holds', () => {
    const { state, p } = fixture();
    const cast: Character[] = state.characters.filter((c) => p.castIds.includes(c.id)).map((c, i) => (i === 0 ? { ...c, name: 'Umm Hassan', nameAr: 'أم حسن', language: 'AR', dialect: 'IRAQI_BAGHDADI' } : { ...c, name: 'Abu Kareem', nameAr: 'أبو كريم', language: 'AR', dialect: 'IRAQI_BAGHDADI' }));
    const [a, b] = cast;
    const scene: Scene = { ...p.scenes[0], title: 'الصيدلية', beats: [{ id: 'b1', action: 'أم حسن تحط الصندوق على الكاونتر. أبو كريم يرفع راسه.', lines: [{ id: 'l1', characterId: a.id, text: 'We close in ten minutes.', textAr: 'نسد بعد عشر دقايق.' }, { id: 'l2', characterId: b.id, text: 'Then I will be quick.', textAr: 'زين، راح أخلص بسرعة.' }] }] };
    const lines: PlanLine[] = scene.beats.flatMap((bt) => bt.lines.map((l) => ({ id: l.id, characterId: l.characterId, characterName: cast.find((c) => c.id === l.characterId)!.name, text: l.text, textAr: l.textAr })));
    const data = ShotPlanSchema.parse({ shots: [
      shot({ characterNames: ['أم حسن'], framing: 'WIDE', durationSeconds: 6, boundary: 'transition', beats: [{ seconds: 2, action: 'أم حسن تحط الصندوق على الكاونتر.' }, { seconds: 4, action: 'أبو كريم يرفع راسه ويتطلع بيها.' }], actions: ['تحط الصندوق', 'يرفع راسه'] }),
      shot({ characterNames: ['أبو كريم'], framing: 'MEDIUM_WIDE', durationSeconds: 5, dialogueLineIndexes: [0, 1], boundary: 'cut' }),
    ] });
    const shots = shapeShotPlan(data, { cast, scene, lines, maxShot: 10 });
    expect(shots[0].characterIds).toEqual([a.id, b.id]); // أبو كريم acts in a beat: added
    expect(shots[0].notes).toEqual(expect.arrayContaining([expect.stringMatching(/added to the cast from the actions: Abu Kareem/)]));
    expect(shots[0].staging!.beats!.map((x) => x.at)).toEqual([0, 2]);
    expect(shots[0].boundary).toBe('transition');
    // the speaking shot: both speakers in frame, framed as a two-shot, the Iraqi lines untouched
    expect(shots[1].characterIds).toEqual([b.id, a.id]);
    expect(shots[1].framing).toBe('TWO_SHOT');
    expect(shots[1].dialogue.map((d) => d.textAr)).toEqual(['نسد بعد عشر دقايق.', 'زين، راح أخلص بسرعة.']);
    expect(shots[1].boundary).toBe('cut');
    // an Arabic action without a speech verb in English is left alone
    expect(shots[0].action).toBe('She sets the box on the counter.');
    const extra: Location = { ...state.locations[0], id: 'loc-x', name: 'Street', nameAr: 'الشارع' };
    const withCut = shapeShotPlan(ShotPlanSchema.parse({ shots: [shot({ characterNames: ['أم حسن'], durationSeconds: 10, beats: [{ seconds: 3, action: 'a' }, { seconds: 7, action: 'b', cut: { camera: 'wide', location: 'الشارع' } }] })] }), { cast, scene, lines, maxShot: 10, locations: [extra] });
    expect(withCut[0].staging!.beats![1].cut).toEqual({ camera: 'wide', locationId: 'loc-x' });
  });
});
