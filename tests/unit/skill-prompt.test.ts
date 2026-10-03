import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { LlmMessage } from '@/server/providers/llm';

/** R5 — PROMPT skills reach the model: the story engine appends the calling agent's role, instructions and PROMPT
 *  skill bodies to the system message (src/server/org/skills.ts agentPrompt), and nothing for a call made without an
 *  agent or by an agent that does not call the model. The same calls produce the real engine outputs the
 *  `story.structured_answer` contract must accept (R4): the model's answer is canned, everything after it is the
 *  engine's own code. */

const h = vi.hoisted(() => ({ calls: [] as Array<Array<{ role: string; content: string }>>, answer: { value: {} as unknown } }));
vi.mock('@/server/providers/llm', async (orig) => ({
  ...(await orig<typeof import('@/server/providers/llm')>()),
  json: vi.fn(async (schema: z.ZodType, messages: LlmMessage[]) => {
    h.calls.push(messages);
    return { data: schema.parse(h.answer.value), result: { text: '', provider: 'openai-compatible', model: 'test', ms: 1 }, attempts: 1 };
  }),
}));
const calls = h.calls as LlmMessage[][];
const setAnswer = (v: unknown) => { h.answer.value = v; };

const { seed } = await import('@/domain/sample');
const engine = await import('@/server/story/engine');
const { agentPrompt, skillFile } = await import('@/server/org/skills');
/** The SKILL bodies an agent's prompt carries, in order. */
const skillBodies = (agentId: string) => agentPrompt(agentId).split('\n\nSKILL: ').slice(1).map((part) => part.slice(part.indexOf('\n') + 1));
const { CONTRACTS } = await import('@/server/org/contracts');
const { AGENTS } = await import('@/server/org/model');
const { castOf, worldOf } = await import('@/studio/selectors');

const state = seed();
const film = state.productions.find((p) => p.id === 's1e1')!;
const mv = state.productions.find((p) => p.kind === 'MUSIC_VIDEO')!;
const show = state.shows.find((s) => s.id === film.showId)!;
const system = (i = calls.length - 1) => calls[i][0].content;
const body = (id: string) => skillFile(id)!.body;
const contract = (task: string, out: unknown) => {
  const c = CONTRACTS['story.structured_answer'];
  expect(c.input.safeParse({ task }).success).toBe(true);
  const r = c.outputFor!({ task })!.safeParse(out);
  expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true);
  expect(c.output.safeParse(out).success).toBe(true);
};

const DESIGN = { name: 'Rana', role: 'Bus driver', sex: 'FEMALE', ageYears: 41, build: 'Broad shoulders', face: 'Round face, laugh lines', hair: 'Grey braid', skin: 'Olive', eyes: 'Brown', distinguishing: ['a brass whistle on a cord'], wardrobe: 'Navy uniform jacket over a green dress', personality: 'Patient, dry humour', voice: { pitch: 'LOW', pace: 'MEASURED', timbre: 'warm, a little hoarse' } };

beforeEach(() => { calls.length = 0; });

describe('agentPrompt', () => {
  it('an LLM agent gets its role, its instructions and the bodies of its PROMPT skills — in that order', () => {
    const p = agentPrompt('film-director');
    const a = AGENTS.find((x) => x.id === 'film-director')!;
    expect(p.startsWith(`\n\nYOUR ROLE: Film Director — ${a.role}.\n${a.systemInstructions}`)).toBe(true);
    expect(p).toContain(`SKILL: Scene-by-scene shot planning\n${body('shot-planning')}`);
    expect(skillBodies('film-director')).toEqual([body('shot-planning')]);
    expect(skillBodies('head-of-story')).toEqual([body('screenwriting')]);
    expect(skillBodies('casting-director')).toEqual([body('character-design')]);
  });
  it('a PROCEDURE skill is never injected; an agent without PROMPT skills gets only its instructions', () => {
    const p = agentPrompt('continuity-writer');
    expect(p).toContain('YOUR ROLE: Continuity Writer');
    expect(p).not.toContain('SKILL:');
    expect(agentPrompt('screenwriter')).not.toContain(body('iraqi-dialogue'));
    expect(agentPrompt('singing-performance')).not.toContain('SKILL:');
  });
  it('no agent, an unknown agent or an agent that does not call the model: nothing', () => {
    expect(agentPrompt(undefined)).toBe('');
    expect(agentPrompt('nobody')).toBe('');
    expect(agentPrompt('audio-engineer')).toBe('');
    expect(agentPrompt('minimax-video-specialist')).toBe('');
    expect(skillBodies('audio-engineer')).toEqual([]);
  });
});

describe('the story engine injects the calling agent’s prompt (and the contract accepts what it returns)', () => {
  it('character design: the Casting Director’s instructions and the character-design skill; nothing without an agent', async () => {
    setAnswer(DESIGN);
    const out = await engine.designCharacter(state, { brief: 'a bus driver', style: 'CARTOON', language: 'EN' }, { agentId: 'casting-director' });
    expect(system()).toContain('YOUR ROLE: Casting Director');
    expect(system()).toContain(body('character-design'));
    contract('character-design', out);
    await engine.designCharacter(state, { brief: 'a bus driver', style: 'CARTOON', language: 'EN' });
    expect(system()).not.toContain('YOUR ROLE');
    expect(system(1)).toBe(system(0).slice(0, system(0).indexOf('\n\nYOUR ROLE')));
  });
  it('character design from a reference picture: the look stays empty and the contract accepts it', async () => {
    setAnswer({ name: 'Rana', role: 'Bus driver', sex: 'FEMALE', ageYears: 41, personality: 'Patient', voice: { pitch: 'LOW', pace: 'MEASURED', timbre: 'warm' } });
    const out = await engine.designCharacter(state, { brief: 'a bus driver', style: 'CARTOON', language: 'EN', lookFrom: 'REFERENCE' }, { agentId: 'casting-director' });
    expect(system()).toContain(body('character-design'));
    expect(out.face).toBe('');
    contract('character-design', out);
  });
  it('a proposal (Head of Story) carries the screenwriting skill', async () => {
    setAnswer({ title: 'Night Bus', logline: 'A driver and her last passenger.', premise: 'A night bus crosses the city with one passenger who will not say where she is going.', genre: 'Drama', mood: 'Quiet', structure: [{ title: 'Boarding', summary: 'She gets on.' }, { title: 'The bridge', summary: 'They talk.' }], cast: [{ name: 'Rana', role: 'Driver', appearance: 'A woman in a navy jacket.' }], locations: [{ name: 'Night bus', description: 'An empty city bus at night.' }] });
    const out = await engine.proposeIdea(state, { kind: 'SHORT', preferences: {} }, { agentId: 'head-of-story' });
    expect(system()).toContain('YOUR ROLE: Head of Story');
    expect(system()).toContain(body('screenwriting'));
    contract('proposal', out);
  });
  it('story development and the script (Head of Story, Screenwriter); the gloss call keeps its own prompt', async () => {
    setAnswer({ logline: 'Abu Samir opens the café.', synopsis: 'Abu Samir opens the café at dawn and waits for the first customer, who does not come until noon.', newCharacters: [], newLocations: [], scenes: [{ title: 'Dawn', locationName: worldOf(state, film)[0]?.name ?? 'The café', timeOfDay: 'DAWN', characterNames: [castOf(state, film)[0].name], purpose: 'Open', emotionalObjective: 'Hope', entryState: 'Closed', exitState: 'Open', targetSeconds: 30 }] });
    const developed = await engine.developStory(state, film, castOf(state, film), worldOf(state, film), { agentId: 'head-of-story' });
    expect(system()).toContain(body('screenwriting'));
    contract('develop', developed);

    const ar = { ...film, language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
    const sc = ar.scenes[0];
    const who = castOf(state, ar).find((c) => sc.characterIds.includes(c.id)) ?? castOf(state, ar)[0];
    setAnswer({ scenes: [{ sceneId: sc.id, beats: [{ action: 'He unlocks the door.', lines: [{ characterName: who.name, text: 'هسه نفتح', textAr: '' }] }] }] });
    calls.length = 0;
    // the first call writes the script; the second asks for the missing English gloss
    const json = (await import('@/server/providers/llm')).json as unknown as ReturnType<typeof vi.fn>;
    json.mockImplementationOnce(async (schema: z.ZodType, messages: LlmMessage[]) => { calls.push(messages); return { data: schema.parse(h.answer.value), result: { text: '', provider: 'openai-compatible', model: 't', ms: 1 }, attempts: 1 }; })
      .mockImplementationOnce(async (schema: z.ZodType, messages: LlmMessage[]) => { calls.push(messages); return { data: schema.parse({ lines: [{ n: 0, english: 'We open now' }] }), result: { text: '', provider: 'openai-compatible', model: 't', ms: 1 }, attempts: 1 }; });
    const script = await engine.writeScript(state, ar, [sc], castOf(state, ar), worldOf(state, ar), { agentId: 'screenwriter' });
    expect(calls).toHaveLength(2);
    expect(system(0)).toContain('YOUR ROLE: Screenwriter');
    expect(system(0)).toContain(body('screenwriting'));
    expect(system(1)).not.toContain('YOUR ROLE');
    expect(system(1).startsWith('You translate')).toBe(true);
    contract('script', script);
  });
  it('the shot plan (Film Director) is a draft the Shot Planner fits; the contract accepts the draft', async () => {
    const sc = film.scenes[0];
    const lines = sc.beats.flatMap((b) => b.lines);
    const shot = (i: number) => ({ purpose: `Shot ${i}`, action: 'He wipes the counter.', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 4, characterNames: [castOf(state, film).find((c) => sc.characterIds.includes(c.id))?.name ?? 'Abu Samir'], dialogueLineIndexes: i === 0 ? lines.map((_, k) => k).slice(0, 6) : [], transition: 'CUT', continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CUT' }, prompt: 'A man wipes a counter.' });
    setAnswer({ shots: Array.from({ length: 14 }, (_, i) => shot(i)) });
    const draft = await engine.planShotsDraft(state, film, sc, castOf(state, film), worldOf(state, film), {}, { agentId: 'film-director' });
    expect(system()).toContain(body('shot-planning'));
    contract('shot-plan', draft);
    const fitted = engine.fitDurations(draft.shots, draft.budget, draft.maxShot);
    expect(fitted.reduce((s, x) => s + x.durationSeconds, 0)).toBeGreaterThanOrEqual(Math.min(draft.budget * 0.9, draft.shots.length * draft.maxShot));
  });
  it('the singing assignment (Singing Performance Agent: instructions, no skills) and the bible update', async () => {
    const sec = mv.song!.sections;
    setAnswer({ sections: sec.map((x) => ({ sectionId: x.id, mode: 'SOLO', singerNames: [castOf(state, mv)[0].name] })) });
    const plan = await engine.planPerformance(mv, castOf(state, mv), { agentId: 'singing-performance' });
    expect(system()).toContain('YOUR ROLE: Singing Performance Agent');
    expect(system()).not.toContain('SKILL:');
    contract('performance-plan', plan);
    setAnswer({ events: ['S1E1: the café opened.'], unresolved: ['Who owns the café?'] });
    const bible = await engine.continuityUpdate(state, show, film, castOf(state, film), { agentId: 'continuity-writer' });
    expect(system()).toContain('YOUR ROLE: Continuity Writer');
    contract('continuity', bible);
  });
});
