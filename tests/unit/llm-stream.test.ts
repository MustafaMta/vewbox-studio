import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/** THE PLANNER ANSWERS AS A STREAM: a long answer takes longer than Node's fetch waits for response headers (300 s), so
 *  vLLM is asked with `stream: true` and the server-sent events are read into the same answer (content, stop reason,
 *  usage); the deadline grows with the output budget and a silent or crawling engine is given up early (and put to
 *  sleep, so the retry wakes it on a free card). A JSON answer is read as well. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.doUnmock('@/server/gpu/lease'); vi.resetModules(); });

async function local(model = 'Qwen3.8-27B-NVFP4') {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/x', GPU_LEASE_DATABASE_URL: '', VEWBOX_FIXTURE_ENGINES: '1', MINIMAX_API_KEY: '', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:8050/v1', OPENAI_COMPATIBLE_MODEL: model, LLM_CONTEXT_LENGTH: '16384' };
  vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (_f: string, _mb: number, fn: () => Promise<unknown>) => fn() }));
  return import('@/server/providers/llm');
}

/** vLLM's /is_sleeping answer (awake), for every mock: the planner is woken, when asleep, before it answers. */
const awake = (u: unknown) => String(u).endsWith('/is_sleeping') ? new Response(JSON.stringify({ is_sleeping: false })) : undefined;

/** An SSE body as /v1/chat/completions streams it, split at awkward places (mid-line, mid-JSON). */
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
  it('asks vLLM for a stream and reads content, stop reason and usage', async () => {
    const llm = await local();
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => awake(u) ?? (sent.push(JSON.parse(String((init as RequestInit).body))), sse(['{"shots":', '[{"a":"Ein ', 'Licht}"}', ']}'])));
    const r = await llm.json(z.object({ shots: z.array(z.object({ a: z.string() })) }), [{ role: 'user', content: 'plan' }], { maxTokens: 9000 });
    expect(r.data.shots[0].a).toBe('Ein Licht}');
    expect(r.attempts).toBe(1);
    expect(r.result).toMatchObject({ inputTokens: 3785, outputTokens: 6151, finishReason: 'stop', truncated: false });
    expect(sent[0]).toMatchObject({ stream: true, stream_options: { include_usage: true }, chat_template_kwargs: { enable_thinking: false }, max_tokens: 9000 });
    expect(sent[0]).not.toHaveProperty('options');
  });

  it('a streamed answer cut at the limit is still a truncation', async () => {
    const llm = await local();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => awake(u) ?? sse(['{"shots":[{"a":"x"},'], 'length', { prompt_tokens: 4076, completion_tokens: 9000 }));
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => awake(u) ?? (sent.push(JSON.parse(String((init as RequestInit).body))), sse(['{"ok":true}'])));
    await llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 2000 });
    await llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 2000, reasoning: true, reasoningTokens: 3000 });
    await llm.chat([{ role: 'user', content: 'x'.repeat(30_000) }], { maxTokens: 2000, reasoning: true, reasoningTokens: 8000 });
    expect(sent[0]).toMatchObject({ chat_template_kwargs: { enable_thinking: false }, max_tokens: 2000 });
    expect(sent[1]).toMatchObject({ chat_template_kwargs: { enable_thinking: true }, max_tokens: 5000 });
    // a 10K-token prompt in a 16K context: the thinking budget is cut to what the context has left
    expect(sent[2].max_tokens).toBe(16384 - Math.ceil(30_000 / 3) - 8 - 384);
    process.env.LLM_LOCAL_REASONING = 'on';
    expect(llm.reasoningOf({})).toBe(true);
    expect(llm.reasoningOf({ reasoning: false })).toBe(false);
  });

  it('a model that crawls once writing (weights paged out of VRAM) is stopped as RESOURCE_EXHAUSTION', async () => {
    const llm = await local();
    const ctrl = new AbortController();
    const enc = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    // three deltas, then one every 200 ms: 2 in a 400 ms window, below the floor of 5
    const res = new Response(new ReadableStream({ start(c) { for (let i = 0; i < 3; i++) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}\n\n`)); timer = setInterval(() => { try { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'y' } }] })}\n\n`)); } catch { clearInterval(timer); } }, 200); } }), { headers: { 'content-type': 'text/event-stream' } });
    const p = llm.readChatStream(res, ctrl, 10_000, { windowMs: 400, minTokens: 5 });
    await new Promise((r) => setTimeout(r, 1200));
    clearInterval(timer);
    expect(ctrl.signal.aborted).toBe(true);
    const reason = ctrl.signal.reason as InstanceType<typeof llm.LocalModelStalled>;
    expect(reason).toBeInstanceOf(llm.LocalModelStalled);
    expect(reason).toMatchObject({ failureClass: 'RESOURCE_EXHAUSTION', retryable: true, code: 'UNAVAILABLE' });
    expect(reason.message).toMatch(/slowed to \d+ tokens/);
    const { classifyFailure, RETRYABLE_CLASSES } = await import('@/server/org/runs');
    expect(RETRYABLE_CLASSES).toContain(classifyFailure(reason));
    void p.catch(() => {});
  });

  it('a stall inside chat() puts vLLM to sleep and fails RESOURCE_EXHAUSTION', async () => {
    const llm = await local();
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      calls.push(String(u));
      if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false }));
      if (String(u).includes('/sleep?level=2')) return new Response('{}');
      // a stream that never sends: the silence watch (LOCAL_STALL_MS, fake time) aborts the request
      const signal = (init as RequestInit).signal!;
      return new Response(new ReadableStream({ start(c) { signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); } }), { headers: { 'content-type': 'text/event-stream' } });
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 100 }).catch((e) => e);
    // the wake check comes first: the silence watch is armed once the chat request is open
    await vi.waitFor(() => expect(calls.some((c) => c.endsWith('/chat/completions'))).toBe(true));
    await vi.advanceTimersByTimeAsync(llm.LOCAL_STALL_MS + 1000);
    const err = await p;
    vi.useRealTimers();
    expect(err).toBeInstanceOf(llm.LocalModelStalled);
    expect(calls.some((c) => c.endsWith('/sleep?level=2'))).toBe(true);
  });

  it('the local deadline grows with the output budget', async () => {
    const llm = await local();
    expect(llm.localDeadlineMs(0)).toBe(300_000);
    expect(llm.localDeadlineMs(10_000)).toBe(2_800_000);
  });
});
