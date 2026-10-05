import { describe, expect, it } from 'vitest';
import { changesInForce, contextLines, contextRecord, productionContextFor, storyFactsBefore } from '@/domain/production-context';
import { resolveShotPack } from '@/server/production/shot-pack';
import { h3ReferencePrompt, takePrompt } from '@/server/story/prompts';
import { bindingOf } from '@/server/production/shot-pack';
import { validateClientCommand } from '@/domain/commands';
import { attemptRecord } from '@/worker/handlers/take';
import type { Production, Scene, Shot } from '@/domain/types';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** The production context (cloud directive §4): every take is made from structured state the studio stores —
 *  character, location, shot and story state — never from an LLM's memory. */

const withScenes = (p: Production, f: (sc: Scene[]) => Scene[]): Production => ({ ...p, scenes: f(p.scenes) });
const withShot = (p: Production, id: string, f: (s: Shot) => Shot): Production => ({ ...p, shots: p.shots.map((s) => (s.id === id ? f(s) : s)) });

describe('character state', () => {
  it('canonical image and voice per present person; condition, emotion, interaction, poses and motion from the continuity record', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    const q = withShot(p, 's11', (s) => ({ ...s, continuity: { ...s.continuity!, characters: [{ characterId: a, condition: 'soaked from the rain', emotion: 'wary', interactingWith: [b], startPose: 'standing at the door', endPose: 'leaning on the counter', motion: { direction: 'LEFT_TO_RIGHT', path: 'from the door to the counter' } }, { characterId: b }] } }));
    const c = productionContextFor(state, q, shotOf(q, 's11'));
    const ca = c.characters.find((x) => x.characterId === a)!;
    expect(ca.canonical).toEqual({ assetId: 'canon-a', version: 2, status: 'APPROVED' });
    expect(ca.condition).toEqual([{ text: 'soaked from the rain', source: { kind: 'SHOT', shotId: 's11' } }]);
    expect(ca).toMatchObject({ emotion: 'wary', interactingWith: [b], startPose: { text: 'standing at the door' }, endPose: 'leaning on the counter', motion: { direction: 'LEFT_TO_RIGHT' } });
    expect(c.characters.find((x) => x.characterId === b)!.canonical?.status).toBe('DRAFT');
  });

  it('a continuous shot starts in the previous shot’s END pose, keeps its motion, condition and emotion; a transition does not', () => {
    const { state, p } = fixture();
    const [a] = p.castIds;
    const q = withShot(p, 's11', (s) => ({ ...s, continuity: { ...s.continuity!, characters: [{ characterId: a, condition: 'limping', emotion: 'angry', endPose: 'sitting on the stool', motion: { direction: 'RIGHT_TO_LEFT' } }] } }));
    const c = productionContextFor(state, q, shotOf(q, 's12'));
    const ca = c.characters.find((x) => x.characterId === a)!;
    expect(ca.startPose).toEqual({ text: 'sitting on the stool', source: { kind: 'PREVIOUS_SHOT', shotId: 's11' } });
    expect(ca).toMatchObject({ emotion: 'angry', motion: { direction: 'RIGHT_TO_LEFT' }, condition: [{ text: 'limping' }] });
    expect(c.shot.constraints.some((k) => /starts as the previous shot ended: sitting on the stool/.test(k))).toBe(true);
    // shot 2.1 opens another scene: nothing carried from 1.x's continuity
    const t = productionContextFor(state, q, shotOf(q, 's21'));
    expect(t.characters[0].startPose).toBeUndefined();
    expect(t.characters[0].condition).toEqual([]);
  });
});

describe('story state', () => {
  const story = (p: Production): Production => withScenes(p, (scs) => scs.map((sc) => (sc.id === 'sc1' ? { ...sc, purpose: 'close the shop', story: {
    events: [{ id: 'e1', text: 'The pharmacy closes for the night.' }],
    knowledge: [{ id: 'k1', characterId: p.castIds[0], text: 'the safe is empty', atShotId: 's11' }],
    changes: [{ id: 'c1', subject: { kind: 'CHARACTER', characterId: p.castIds[0] }, key: 'hand', text: 'a bandage on her left hand', atShotId: 's11' }, { id: 'c2', subject: { kind: 'LOCATION', locationId: 'loc-pharmacy' }, text: 'the front window is cracked' }],
  } } : sc)));

  it('facts at a shot hold from the next shot of the scene; facts without a shot hold from the next scene', () => {
    const { p } = fixture();
    const q = story(p);
    expect(storyFactsBefore(q, shotOf(q, 's11'), (s) => s.changes)).toHaveLength(0);
    expect(storyFactsBefore(q, shotOf(q, 's12'), (s) => s.changes).map((x) => x.fact.id)).toEqual(['c1']);
    expect(storyFactsBefore(q, shotOf(q, 's21'), (s) => s.changes).map((x) => x.fact.id)).toEqual(['c1', 'c2']);
  });

  it('a persistent change reaches the person’s condition in every later shot; a later change with the same key replaces it; cleared ends it', () => {
    const { state, p } = fixture();
    const q = story(p);
    const [a] = q.castIds;
    expect(productionContextFor(state, q, shotOf(q, 's12')).characters.find((x) => x.characterId === a)!.condition.map((k) => k.text)).toEqual(['a bandage on her left hand']);
    const healed = withScenes(q, (scs) => scs.map((sc) => (sc.id === 'sc2' ? sc : { ...sc, story: { ...sc.story!, changes: [...sc.story!.changes!, { id: 'c3', subject: { kind: 'CHARACTER', characterId: a }, key: 'hand', text: 'healed', cleared: true, atShotId: 's12' }] } })));
    expect(changesInForce(healed, shotOf(healed, 's13')).map((x) => x.change.id)).toEqual([]);
    expect(changesInForce(healed, shotOf(healed, 's21')).map((x) => x.change.id)).toEqual(['c2']);
  });

  it('events completed, knowledge of the present people, the scene objective', () => {
    const { state, p } = fixture();
    const q = story(p);
    const c = productionContextFor(state, q, shotOf(q, 's21'));
    expect(c.story.eventsCompleted.map((e) => e.text)).toContain('The pharmacy closes for the night.');
    expect(c.story.knowledge[q.castIds[0]].map((k) => k.text)).toEqual(['the safe is empty']);
    expect(productionContextFor(state, q, shotOf(q, 's12')).story.sceneObjective).toBe('close the shop');
  });

  it('the location carries its persistent changes into a return; the prompt says them about the bound subject, never by name', () => {
    const { state, p } = fixture();
    const q = withShot(story(p), 's21', (s) => s);
    // a later scene back at the pharmacy
    const back: Production = { ...q, scenes: [...q.scenes, { id: 'sc3', number: 3, title: 'Morning', locationId: 'loc-pharmacy', timeOfDay: 'MORNING', characterIds: [q.castIds[0]], beats: [] }], shots: [...q.shots, { ...shotOf(q, 's21'), id: 's31', sceneId: 'sc3', number: 1, continuity: undefined }] };
    const c = productionContextFor(state, back, shotOf(back, 's31'));
    expect(c.location?.changes.map((k) => k.text)).toEqual(['the front window is cracked']);
    const line = contextLines(c, (id) => (id === back.castIds[0] ? '<Subject 1>' : undefined));
    expect(line).toContain('<Subject 1> is a bandage on her left hand'.replace('is a', 'is a'));
    expect(line).toContain('The place as the story left it: the front window is cracked.');
    expect(line).not.toContain(state.characters.find((x) => x.id === back.castIds[0])!.name);
  });
});

describe('shot state, gaps, record', () => {
  it('the previous approved shot, the camera, recorded dialogue timing as authoritative, estimates marked', () => {
    const { state, p } = fixture();
    const c = productionContextFor(state, p, shotOf(p, 's12'));
    expect(c.shot.previous).toMatchObject({ shotId: 's11', takeId: TAKE_A.id, approved: true, sameScene: true });
    expect(c.shot.dialogue).toEqual([{ lineId: 'l1', characterId: p.castIds[0], text: 'We close in ten minutes.', durationSeconds: 1.8, source: 'RECORDED', from: undefined, to: undefined }]);
    const q = withShot(p, 's12', (s) => ({ ...s, dialogue: s.dialogue.map((d) => ({ ...d, durationSeconds: undefined })) }));
    const est = productionContextFor(state, q, shotOf(q, 's12'));
    expect(est.shot.dialogue[0].source).toBe('ESTIMATE');
  });

  it('gaps are named, never filled in: a speaker without a voice identity, a continuation with no chosen take', () => {
    const { state, p } = fixture();
    const q = withShot(p, 's11', (s) => ({ ...s, selectedTakeId: undefined }));
    const c = productionContextFor(state, q, shotOf(q, 's12'));
    expect(c.gaps.join(' ')).toMatch(/continues shot 1, which has no chosen take/);
    expect(c.gaps.join(' ')).toMatch(/speaks but has no voice identity/);
  });

  it('recorded lines longer than the planned shot are not a gap: the take is made as long as its words (QA m3)', () => {
    const { state, p } = fixture();
    const q = withShot(p, 's12', (s) => ({ ...s, durationSeconds: 4, dialogue: s.dialogue.map((d) => ({ ...d, durationSeconds: 5.9 })) }));
    expect(productionContextFor(state, q, shotOf(q, 's12')).gaps.join(' ')).not.toMatch(/longer than the shot/);
  });
  it('the hash moves when the state does, and the take records a compact copy', () => {
    const { state, p } = fixture();
    const c1 = productionContextFor(state, p, shotOf(p, 's12'));
    const q = withShot(p, 's12', (s) => ({ ...s, continuity: { ...s.continuity!, constraints: ['the box stays on the counter'] } }));
    const c2 = productionContextFor(state, q, shotOf(q, 's12'));
    expect(c1.hash).not.toBe(c2.hash);
    expect(contextRecord(c2)).toMatchObject({ hash: c2.hash, boundary: 'continuous', constraints: ['the box stays on the counter'] });
  });
});

describe('re-anchoring a long continuous chain', () => {
  const chain = (n: number) => {
    const { state, p } = fixture();
    const base = shotOf(p, 's12');
    const extra: Shot[] = Array.from({ length: n }, (_, i) => ({ ...base, id: `s1x${i}`, number: 4 + i, dialogue: [], continuity: { ...base.continuity!, relationToPrevious: 'CONTINUATION' as const } }));
    // every shot of the chain has a chosen take so each continuation has a tail
    const takes = (id: string) => [{ ...TAKE_A, id: `take-${id}`, assetId: 'vid-a' }];
    const shots = [...p.shots.filter((s) => s.id !== 's13' && s.id !== 's21'), ...extra].map((s) => (s.id === 's11' ? s : { ...s, takes: takes(s.id), selectedTakeId: `take-${s.id}` }));
    return { state, p: { ...p, shots } as Production };
  };
  it('the chain length counts continuous shots in a row; past the limit the guide shortens to the engine’s shortest', () => {
    const { state, p } = chain(5);
    expect(productionContextFor(state, p, shotOf(p, 's12')).anchoring).toMatchObject({ chainLength: 1, reanchor: false });
    const deep = productionContextFor(state, p, shotOf(p, 's1x3'));
    expect(deep.anchoring).toMatchObject({ chainLength: 5, reanchor: true, after: 4 });
    const pack = resolveShotPack(state, p, shotOf(p, 's1x3'), { backend: 'local' });
    expect(pack.opening).toMatchObject({ kind: 'TAIL', frames: 5 });
    expect(pack.notes.join(' ')).toMatch(/re-anchor: .*guide 22 → 5 frames/);
    expect(resolveShotPack(state, p, shotOf(p, 's1x2'), { backend: 'local' }).opening).toMatchObject({ frames: 22 });
  });
  it('a shot’s own guide length wins; the studio can move the limit', () => {
    const { state, p } = chain(5);
    const q = withShot(p, 's1x3', (s) => ({ ...s, continuation: { guideFrames: 39 } }));
    expect(resolveShotPack(state, q, shotOf(q, 's1x3'), { backend: 'local' }).opening).toMatchObject({ frames: 39 });
    const relaxed = { ...state, settings: { ...state.settings, generation: { continuation: { reanchorAfter: 10 } } } };
    expect(resolveShotPack(relaxed, p, shotOf(p, 's1x3'), { backend: 'local' }).opening).toMatchObject({ frames: 22 });
  });
});

describe('the prompt and the commands', () => {
  it('the reference prompt carries the context sentences', () => {
    const { state, p } = fixture();
    const [a] = p.castIds;
    const q = withShot(p, 's12', (s) => ({ ...s, continuity: { ...s.continuity!, characters: [{ characterId: a, emotion: 'tired', endPose: 'sitting down' }] } }));
    const pack = resolveShotPack(state, q, shotOf(q, 's12'), { backend: 'local' });
    const prompt = h3ReferencePrompt(q, shotOf(q, 's12'), state.characters, state.locations.find((l) => l.id === 'loc-pharmacy'), q.scenes[0], bindingOf(pack), { relation: 'CONTINUATION', context: pack.context, sceneState: pack.sceneState });
    expect(prompt).toMatch(/<Subject 1> feels tired, ends sitting down\./);
  });
  it('a wordless story fact is never carried and never crashes a prompt; the commands refuse it (QA Q1)', () => {
    const { state, p } = fixture();
    const [a] = p.castIds;
    const q = withScenes(p, (scs) => scs.map((sc) => (sc.id === 'sc1' ? { ...sc, story: {
      events: [{ id: 'e0', text: '' }], knowledge: [{ id: 'k0', characterId: a, text: '   ' }], relationships: [{ id: 'r0', characterIds: [a], text: '' }],
      changes: [{ id: 'c0', subject: { kind: 'CHARACTER', characterId: a }, text: '' }, { id: 'c9', subject: { kind: 'LOCATION', locationId: 'loc-pharmacy' }, text: '' }],
    } } : sc)));
    const c = productionContextFor(state, q, shotOf(q, 's21'));
    expect(c.characters[0].condition).toEqual([]);
    expect(c.story.changes).toEqual([]);
    expect(c.story.eventsCompleted.every((e) => e.text)).toBe(true);
    const back: Production = { ...q, scenes: [...q.scenes, { id: 'sc3', number: 3, title: 'Morning', locationId: 'loc-pharmacy', timeOfDay: 'MORNING', characterIds: [a], beats: [] }], shots: [...q.shots, { ...shotOf(q, 's21'), id: 's31', sceneId: 'sc3', number: 1, continuity: undefined }] };
    const pack = resolveShotPack(state, back, shotOf(back, 's31'), { backend: 'local' });
    expect(() => h3ReferencePrompt(back, shotOf(back, 's31'), state.characters, state.locations.find((l) => l.id === 'loc-pharmacy'), back.scenes[2], bindingOf(pack), { relation: pack.relation, context: pack.context, sceneState: pack.sceneState })).not.toThrow();
    expect(() => takePrompt(back, shotOf(back, 's31'), state.characters, undefined, back.scenes[2], { context: pack.context, sceneState: pack.sceneState })).not.toThrow();
    // a context from older records that still holds one is skipped by the sentences
    expect(() => contextLines({ ...c, characters: [{ ...c.characters[0], condition: [{ text: undefined as unknown as string, source: { kind: 'UNKNOWN' } }] }] }, () => '<Subject 1>')).not.toThrow();
    expect(() => validateClientCommand('updateScene', ['p', 'sc', { story: { changes: [{ id: 'c1', text: '', subject: { kind: 'CHARACTER', characterId: 'char-1' } }] } }])).toThrow(/needs words/);
    expect(() => validateClientCommand('updateScene', ['p', 'sc', { story: { events: [{ id: 'e1', text: '  ' }] } }])).toThrow();
    expect(() => validateClientCommand('updateScene', ['p', 'sc', { story: { changes: [{ id: 'c1', text: '', key: 'arm', cleared: true, subject: { kind: 'CHARACTER', characterId: 'char-1' } }] } }])).not.toThrow();
  });
  it('a scene’s story record is accepted by the commands, junk is refused', () => {
    expect(() => validateClientCommand('updateScene', ['p', 'sc', { story: { changes: [{ id: 'c1', text: 'a sling', subject: { kind: 'CHARACTER', characterId: 'char-1' } }] } }])).not.toThrow();
    expect(() => validateClientCommand('updateScene', ['p', 'sc', { story: { changes: [{ id: 'c1', text: 'x', subject: { kind: 'DOG' } }] } }])).toThrow();
  });
  it('attempt #1 is told apart from retries and regenerations', () => {
    expect(attemptRecord(1, 0)).toEqual({ jobAttempt: 1, shotGeneration: 1, firstForShot: true, firstAttempt: true });
    expect(attemptRecord(2, 0).firstAttempt).toBe(false);
    expect(attemptRecord(1, 3)).toMatchObject({ shotGeneration: 4, firstForShot: false, firstAttempt: false });
  });
});
