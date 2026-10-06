import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/** THE LOCAL MODEL ANSWERS AS A STREAM (docs/research/MODEL-EVAL-2026-10.md §7): a long answer from a large model with
 *  experts offloaded to the CPU takes longer than Node's fetch waits for response headers (300 s), so the local Ollama
 *  is asked with `stream: true` and the server-sent events are read into the same answer (content, stop reason, usage);
 *  the deadline grows with the output budget and a silent engine is given up early. A hosted or JSON answer is read
 *  as before. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.doUnmock('@/server/gpu/lease'); vi.resetModules(); });

async function local(model = 'gemma4:31b-it-qat') {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/x', MINIMAX_API_KEY: '', ANTHROPIC_API_KEY: '', LLM_PROVIDER: 'auto', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:11434/v1', OPENAI_COMPATIBLE_MODEL: model, OLLAMA_CONTEXT_LENGTH: '16384' };
  vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (_f: string, _mb: number, fn: () => Promise<unknown>) => fn() }));
  return import('@/server/providers/llm');
}

/** An SSE body as Ollama's /v1/chat/completions streams it, split at awkward places (mid-line, mid-JSON). */
function sse(chunks: string[], finish = 'stop', usage = { prompt_tokens: 3785, completion_tokens: 6151 }) {
  const events = [
    ...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: c }, finish_reason: null }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: finish }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [], usage })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  const enc = new TextEncoder();
  const pieces = events.match(/[\s\S]{1,37}/g) ?? [];
  return new Response(new ReadableStream({ start(c) { for (const p of pieces) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('local stream', () => {
  it('asks the local Ollama for a stream and reads content, stop reason and usage', async () => {
    const llm = await local();
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => { sent.push(JSON.parse(String((init as RequestInit).body))); return sse(['{"shots":', '[{"a":"Ein ', 'Licht}"}', ']}']); });
    const r = await llm.json(z.object({ shots: z.array(z.object({ a: z.string() })) }), [{ role: 'user', content: 'plan' }], { maxTokens: 9000 });
    expect(r.data.shots[0].a).toBe('Ein Licht}');
    expect(r.attempts).toBe(1);
    expect(r.result).toMatchObject({ inputTokens: 3785, outputTokens: 6151, finishReason: 'stop', truncated: false });
    expect(sent[0]).toMatchObject({ stream: true, stream_options: { include_usage: true }, think: false, reasoning_effort: 'none', options: { num_ctx: 16384 }, max_tokens: 9000 });
  });

  it('a streamed answer cut at the limit is still a truncation', async () => {
    const llm = await local();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => sse(['{"shots":[{"a":"x"},'], 'length', { prompt_tokens: 4076, completion_tokens: 9000 }));
    const r = await llm.chat([{ role: 'user', content: 'plan' }], { maxTokens: 9000 });
    expect(r).toMatchObject({ truncated: true, finishReason: 'length', outputTokens: 9000 });
  });

  it('a JSON (non-stream) answer is read as before', async () => {
    const llm = await local();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await llm.chat([{ role: 'user', content: 'x' }]);
    expect(r).toMatchObject({ text: '{"ok":true}', inputTokens: 10, outputTokens: 3 });
  });

  it('a silent stream is given up with its own message', async () => {
    const llm = await local();
    const ctrl = new AbortController();
    const res = new Response(new ReadableStream({ start() { /* never sends */ } }), { headers: { 'content-type': 'text/event-stream' } });
    const p = llm.readChatStream(res, ctrl, 50);
    await new Promise((r) => setTimeout(r, 120));
    expect(ctrl.signal.aborted).toBe(true);
    expect(String((ctrl.signal.reason as Error).message)).toMatch(/sent nothing for/);
    void p.catch(() => {});
  });

  it('reasoning is off unless asked; asked, it gets its own budget inside the context', async () => {
    const llm = await local();
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => { sent.push(JSON.parse(String((init as RequestInit).body))); return sse(['{"ok":true}']); });
    await llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 2000 });
    await llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 2000, reasoning: true, reasoningTokens: 3000 });
    await llm.chat([{ role: 'user', content: 'x'.repeat(30_000) }], { maxTokens: 2000, reasoning: true, reasoningTokens: 8000 });
    expect(sent[0]).toMatchObject({ think: false, reasoning_effort: 'none', max_tokens: 2000 });
    expect(sent[1]).toMatchObject({ think: true, reasoning_effort: 'high', max_tokens: 5000 });
    // a 10K-token prompt in a 16K context: the thinking budget is cut to what the context has left
    expect(sent[2].max_tokens).toBe(16384 - Math.ceil(30_000 / 3) - 8 - 384);
    process.env.LLM_LOCAL_REASONING = 'on';
    expect(llm.reasoningOf({})).toBe(true);
    expect(llm.reasoningOf({ reasoning: false })).toBe(false);
  });

  it('the local deadline grows with the output budget', async () => {
    const llm = await local();
    expect(llm.localDeadlineMs(0)).toBe(300_000);
    expect(llm.localDeadlineMs(10_000)).toBe(2_800_000);
  });
});
