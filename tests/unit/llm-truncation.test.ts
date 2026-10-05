import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Production, Scene } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** A CUT-OFF ANSWER IS NEVER ACCEPTED (docs/research/MODEL-EVAL-2026-10.md §3, open item 5): Gemma's Arabic shot plan
 *  hit max_tokens 9000 (13 shots pretty-printed, JSON cut mid-shot), and the two repair rounds that re-sent the cut
 *  answer ran out of the 16K context themselves (10,885 + 5,499 and 15,697 + 687 tokens). Now: the stop reason and
 *  unterminated JSON are detected; a cut answer is asked again with the room the context has left, or the task is made
 *  smaller — the shot planner plans the scene in parts — and a partial plan is never shaped. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.doUnmock('@/server/gpu/lease'); vi.resetModules(); });

async function withLocalGemma() {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/x', MINIMAX_API_KEY: '', ANTHROPIC_API_KEY: '', LLM_PROVIDER: 'auto', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:11434/v1', OPENAI_COMPATIBLE_MODEL: 'gemma4:31b-it-qat', OLLAMA_CONTEXT_LENGTH: '16384' };
  vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (_f: string, _mb: number, fn: () => Promise<unknown>) => fn() }));
  const llm = await import('@/server/providers/llm');
  const engine = await import('@/server/story/engine');
  return { llm, engine };
}

interface Sent { messages: Array<{ role: string; content: string }>; max_tokens: number }
/** fetch answering /chat/completions from `answer(request, n)`: { content, finish_reason, prompt_tokens?, completion_tokens? } */
function ollama(answer: (req: Sent, n: number) => { content: string; finish?: string; prompt?: number; completion?: number }) {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const req = JSON.parse(String((init as RequestInit).body)) as Sent;
    sent.push(req);
    const a = answer(req, sent.length);
    return new Response(JSON.stringify({ choices: [{ message: { content: a.content }, finish_reason: a.finish ?? 'stop' }], usage: { prompt_tokens: a.prompt ?? 4000, completion_tokens: a.completion ?? 1000 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return sent;
}

// the tail of the real cut answer (ar-plan-run2, attempt 1: 9,000 tokens, finish "length")
const CUT_TAIL = `{
  "shots": [
    { "purpose": "Establish the cosmic event and the setting", "action": "A bright meteor streaks across the night sky above the sea." },
    {
      "purpose": "Final image of unity and shared purpose",`;

describe('isUnterminatedJson', () => {
  it('flags the cut answer and accepts closed JSON, fenced or with prose after it', async () => {
    const { llm } = await withLocalGemma();
    expect(llm.isUnterminatedJson(CUT_TAIL)).toBe(true);
    expect(llm.isUnterminatedJson('```json\n{"shots":[{"a":1}')).toBe(true);
    expect(llm.isUnterminatedJson('{"a":"text with a } brace and \\" quote"')).toBe(true);
    expect(llm.isUnterminatedJson('{"shots":[{"a":"}"}]}')).toBe(false);
    expect(llm.isUnterminatedJson('```json\n{"a":1}\n```')).toBe(false);
    expect(llm.isUnterminatedJson('{"a":1} and then some prose')).toBe(false);
    expect(llm.isUnterminatedJson('no json at all')).toBe(false);
  });
});

describe('outputRoom: the answer gets what the local context has left', () => {
  it('is OLLAMA_CONTEXT_LENGTH minus the prompt (known, else a conservative estimate) minus the margin', async () => {
    const { llm } = await withLocalGemma();
    const msgs = [{ role: 'user' as const, content: 'x'.repeat(17_356) }];
    expect(llm.outputRoom(msgs, { promptTokens: 4076 })).toBe(16384 - 4076 - llm.CONTEXT_MARGIN_TOKENS);
    // the estimate over-counts the measured 4.26 characters per token: never more room than the context has
    expect(llm.estimateTokens(msgs)).toBeGreaterThan(4076);
    expect(llm.outputRoom(msgs)).toBeLessThan(16384 - 4076 - llm.CONTEXT_MARGIN_TOKENS);
  });
});

describe('json(): a cut answer', () => {
  const Schema = z.object({ shots: z.array(z.object({ purpose: z.string() })) });

  it('is asked again with the whole room left, never sent back as a repair', async () => {
    const { llm } = await withLocalGemma();
    const sent = ollama((_r, n) => (n === 1 ? { content: CUT_TAIL, finish: 'length', prompt: 4076, completion: 9000 } : { content: '{"shots":[{"purpose":"a"},{"purpose":"b"}]}', prompt: 4076, completion: 9500 }));
    const r = await llm.json(Schema, [{ role: 'user', content: 'plan' }], { maxTokens: 9000 });
    expect(r.data.shots).toHaveLength(2);
    expect(r.attempts).toBe(2);
    expect(sent.map((s) => s.max_tokens)).toEqual([9000, 16384 - 4076 - llm.CONTEXT_MARGIN_TOKENS]);
    // the same messages: the cut answer is not in the history
    expect(sent[1].messages).toEqual(sent[0].messages);
  });

  it('throws TruncatedAnswerError when there is no more room (and never parses the partial answer)', async () => {
    const { llm } = await withLocalGemma();
    const sent = ollama(() => ({ content: CUT_TAIL, finish: 'length', prompt: 4076, completion: 11_924 }));
    const err = await llm.json(Schema, [{ role: 'user', content: 'plan' }], { maxTokens: 11_924 }).catch((e) => e);
    expect(llm.isTruncatedAnswer(err)).toBe(true);
    expect(err.details).toMatchObject({ truncated: true, outputTokens: 11_924, inputTokens: 4076, finishReason: 'length' });
    expect(sent).toHaveLength(1);
  });

  it('treats unterminated JSON as cut even when the engine reports "stop"', async () => {
    const { llm } = await withLocalGemma();
    ollama(() => ({ content: CUT_TAIL, finish: 'stop', prompt: 15_000, completion: 1000 }));
    await expect(llm.json(Schema, [{ role: 'user', content: 'plan' }], { maxTokens: 1000 })).rejects.toMatchObject({ details: { truncated: true } });
  });

  it('a closed answer at the limit is complete and is validated as usual', async () => {
    const { llm } = await withLocalGemma();
    ollama(() => ({ content: '{"shots":[{"purpose":"a"}]}', finish: 'length', completion: 9000 }));
    const r = await llm.json(Schema, [{ role: 'user', content: 'plan' }], { maxTokens: 9000 });
    expect(r.data.shots).toHaveLength(1);
  });
});

// ------------------------------------------------------------------------------------------- the shot planner

function sixBeatScene(): { p: Production; scene: Scene; ids: [string, string] } {
  const { p } = fixture();
  const [a, b] = p.castIds as [string, string];
  const beats = Array.from({ length: 6 }, (_, i) => ({ id: `b${i + 1}`, action: `Beat ${i + 1}: something happens at the counter.`, lines: [{ id: `l${i + 1}`, characterId: i % 2 ? b : a, text: `Line number ${i + 1}.` }] }));
  const scene: Scene = { ...p.scenes[0], beats };
  return { p: { ...p, targetSeconds: 60, scenes: [scene] }, scene, ids: [a, b] };
}
const planShot = (over: Record<string, unknown>) => ({ purpose: 'p', action: 'She sets the box on the counter.', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterNames: [], dialogueLineIndexes: [], transition: 'CUT', continuity: { characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CUT' }, prompt: 'x', ...over });
const plan = (n: number, firstBoundary = 'transition') => JSON.stringify({ shots: Array.from({ length: n }, (_, i) => planShot({ boundary: i === 0 ? firstBoundary : 'cut', dialogueLineIndexes: i < 3 ? [i] : [] })) });
const userOf = (s: Sent) => s.messages.find((m) => m.role === 'user')!.content;

describe('planShotsDraft: a plan that does not fit one answer is planned in parts', () => {
  it('a 60-second, six-beat scene (up to 15 shots ≈ 16,900 tokens) is planned in two parts that each fit the room', async () => {
    const { llm, engine } = await withLocalGemma();
    const { p, scene } = sixBeatScene();
    const sent = ollama((req) => ({ content: plan(6, /PART: beats 4–6/.test(userOf(req)) ? 'continuous' : 'transition') }));
    const draft = await engine.planShotsDraft({} as never, p, scene, fixture().state.characters, fixture().state.locations, {});
    expect(engine.planOutputTokens(60)).toBeGreaterThan(llm.outputRoom([{ role: 'user', content: userOf(sent[0]) }]));
    expect(sent).toHaveLength(2);
    expect(userOf(sent[0])).toContain('PART: beats 1–3 of the scene\'s 6');
    expect(userOf(sent[1])).toContain('PART: beats 4–6 of the scene\'s 6');
    // each part offers its own lines, indexed from 0, and the second continues from the first part's last shot
    expect(userOf(sent[1])).toContain('"line":"Line number 4."');
    expect(userOf(sent[1])).not.toContain('Line number 3.');
    expect(userOf(sent[1])).toContain('The previous shot');
    // each call's budget is the room its prompt leaves, and the plan's need fits in it
    for (const s of sent) { expect(s.max_tokens).toBe(llm.outputRoom(s.messages as never)); expect(engine.planOutputTokens(30)).toBeLessThanOrEqual(s.max_tokens); }
    // the scene's draft: both parts, every line once in order, the budget of the whole scene
    expect(draft.budget).toBe(60);
    expect(draft.shots).toHaveLength(12);
    expect(draft.shots.flatMap((s) => s.dialogue.map((d) => d.id))).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
    // the scene opens with a transition; the second part's first shot continues (it does not open the scene)
    expect(draft.shots[0].boundary).toBe('transition');
    expect(draft.shots[6].boundary).toBe('continuous');
  });

  it('a part cut off anyway is split again; nothing of the cut answer is kept', async () => {
    const { engine } = await withLocalGemma();
    const { p, scene } = sixBeatScene();
    const short = { ...p, targetSeconds: 12 }; // 12 s: one call by the estimate
    const sent = ollama((req) => (/PART/.test(userOf(req)) ? { content: plan(2) } : { content: CUT_TAIL, finish: 'length', prompt: 16_000, completion: 384 }));
    const draft = await engine.planShotsDraft({} as never, short, scene, fixture().state.characters, fixture().state.locations, {});
    expect(/PART/.test(userOf(sent[0]))).toBe(false);
    expect(sent.slice(1).every((s) => /PART: beats/.test(userOf(s)))).toBe(true);
    expect(draft.shots).toHaveLength(4);
    // every line once (the shaping places a line the model forgot with its speaker)
    expect(draft.shots.flatMap((s) => s.dialogue.map((d) => d.id)).sort()).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
  });

  it('a one-beat scene that is cut off fails the call: a partial plan is never accepted', async () => {
    const { llm, engine } = await withLocalGemma();
    const { p, scene } = sixBeatScene();
    const one: Scene = { ...scene, beats: scene.beats.slice(0, 1) };
    ollama(() => ({ content: CUT_TAIL, finish: 'length', prompt: 16_000, completion: 384 }));
    const err = await engine.planShotsDraft({} as never, { ...p, scenes: [one] }, one, fixture().state.characters, fixture().state.locations, {}).catch((e) => e);
    expect(llm.isTruncatedAnswer(err)).toBe(true);
  });
});
