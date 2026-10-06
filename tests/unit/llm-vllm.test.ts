import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmDisplayName, PLANNER_MODEL } from '@/domain/llm-names';

/** THE PRODUCTION PLANNER ON vLLM (docs/research/MODEL-EVAL-2026-10.md §12): Qwen3.8-27B-NVFP4 served by vLLM (compose
 *  service llm-vllm). The request carries the model card's thinking switch (chat_template_kwargs.enable_thinking,
 *  off unless a stage asks) and its sampling, never Ollama's fields; max_tokens never passes the context's room (vLLM
 *  refuses that request); the GPU lease puts vLLM to sleep (level 2) and the next call wakes it (weights reloaded from
 *  the store) inside its own lease. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.doUnmock('@/server/gpu/lease'); vi.resetModules(); });

async function withVllm(vars: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/vewbox', GPU_LEASE_DATABASE_URL: '', VEWBOX_FIXTURE_ENGINES: '1', MINIMAX_API_KEY: '', ANTHROPIC_API_KEY: '', LLM_PROVIDER: 'auto', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:8050/v1', OPENAI_COMPATIBLE_RUNTIME: '', OPENAI_COMPATIBLE_MODEL: '', LLM_CONTEXT_LENGTH: '16384', LLM_PRESENCE_PENALTY: '' };
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const leases: Array<{ family: string; mb: number }> = [];
  vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (family: string, mb: number, fn: () => Promise<unknown>) => { leases.push({ family, mb }); return fn(); } }));
  const llm = await import('@/server/providers/llm');
  return { llm, leases };
}

const sse = (content: string, usage = { prompt_tokens: 1200, completion_tokens: 40 }) => new Response([
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`,
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
  `data: ${JSON.stringify({ choices: [], usage })}\n\n`, 'data: [DONE]\n\n'].join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('which server the base URL is', () => {
  it('names it, or reads it from the URL', async () => {
    const { llm } = await withVllm();
    expect(llm.llmRuntime('http://127.0.0.1:8050/v1', '')).toBe('vllm');
    expect(llm.llmRuntime('http://llm-vllm:8000/v1', '')).toBe('vllm');
    expect(llm.llmRuntime('http://llm:11434/v1', '')).toBe('ollama');
    expect(llm.llmRuntime('https://api.example.com/v1', '')).toBe('remote');
    expect(llm.llmRuntime('http://127.0.0.1:8050/v1', 'ollama')).toBe('ollama');
  });
  it('the default local model is Qwen3.8-27B-NVFP4; Qwen3.6 is the rollback, only when named', async () => {
    const { llm } = await withVllm();
    expect(llm.resolveProvider().model).toBe('Qwen3.8-27B-NVFP4');
    expect(llm.DEFAULT_LOCAL_LLM).toBe(PLANNER_MODEL);
    expect(llm.FALLBACK_LOCAL_LLM).toBe('qwen3.6:27b-q8_0');
    expect(llmDisplayName('')).toBe('Qwen3.8-27B-NVFP4');
    expect(llmDisplayName('qwen3.6:27b-q8_0')).toMatch(/rollback/);
  });
});

describe('the vLLM request', () => {
  it('thinking off by default with the card\'s non-thinking sampling; no Ollama fields; the lease is taken', async () => {
    const { llm, leases } = await withVllm();
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false }));
      sent.push(JSON.parse(String((init as RequestInit).body))); return sse('{"ok":true}');
    });
    const r = await llm.chat([{ role: 'user', content: 'plan' }], { maxTokens: 2000, temperature: 0.6 });
    expect(r.text).toBe('{"ok":true}');
    expect(sent[0]).toMatchObject({ model: 'Qwen3.8-27B-NVFP4', stream: true, max_tokens: 2000, temperature: 0.6, top_p: 0.8, top_k: 20, presence_penalty: 1.5, chat_template_kwargs: { enable_thinking: false } });
    expect(sent[0]).not.toHaveProperty('options');
    expect(sent[0]).not.toHaveProperty('keep_alive');
    expect(sent[0]).not.toHaveProperty('think');
    expect(leases).toEqual([{ family: 'LLM', mb: llm.llmLeaseMb('Qwen3.8-27B-NVFP4') }]);
  });
  it('reasoning, when a stage asks: enable_thinking with the card\'s thinking sampling and its own budget', async () => {
    const { llm } = await withVllm();
    expect(llm.vllmRequest(true)).toEqual({ chat_template_kwargs: { enable_thinking: true }, temperature: 1.0, top_p: 0.95, top_k: 20, presence_penalty: 0 });
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => { if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false })); sent.push(JSON.parse(String((init as RequestInit).body))); return sse('{}'); });
    await llm.chat([{ role: 'user', content: 'x' }], { maxTokens: 2000, reasoning: true, reasoningTokens: 3000 });
    expect(sent[0]).toMatchObject({ max_tokens: 5000, chat_template_kwargs: { enable_thinking: true } });
  });
  it('max_tokens never passes the context\'s room (vLLM would refuse the request)', async () => {
    const { llm } = await withVllm();
    const sent: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => { if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false })); sent.push(JSON.parse(String((init as RequestInit).body))); return sse('{}'); });
    await llm.chat([{ role: 'user', content: 'y'.repeat(30_000) }], { maxTokens: 9000 });
    expect(sent[0].max_tokens).toBe(16384 - (Math.ceil(30_000 / 3) + 8) - 384);
  });
  it('reasoning_content from vLLM\'s parser is counted (a warning when thinking was off)', async () => {
    const { llm } = await withVllm();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false }));
      return new Response([`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'hmm' } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: { content: '{}' }, finish_reason: 'stop' }] })}\n\n`, 'data: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } });
    });
    const r = await llm.chat([{ role: 'user', content: 'x' }]);
    expect(r.text).toBe('{}');
  });
});

describe('sleep and wake (the GPU lease)', () => {
  it('a sleeping server is woken before it answers: weights, reload_weights, kv cache', async () => {
    const { llm } = await withVllm();
    const calls: string[] = [];
    let asleep = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      const url = String(u); calls.push(`${(init as RequestInit | undefined)?.method ?? 'GET'} ${url.replace('http://127.0.0.1:8050', '')}${(init as RequestInit | undefined)?.body && !url.endsWith('/chat/completions') ? ` ${String((init as RequestInit).body)}` : ''}`);
      if (url.endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: asleep }));
      if (url.includes('/wake_up?tags=kv_cache')) asleep = false;
      if (url.endsWith('/chat/completions')) return sse('{}');
      return new Response('{}');
    });
    await llm.chat([{ role: 'user', content: 'x' }]);
    expect(calls).toEqual(['GET /is_sleeping', 'POST /wake_up?tags=weights', 'POST /collective_rpc {"method":"reload_weights"}', 'POST /wake_up?tags=kv_cache', 'POST /reset_prefix_cache', 'POST /v1/chat/completions']);
  });
  it('the unloader sleeps an awake server at level 2, and leaves a sleeping or absent one alone', async () => {
    const { llm } = await withVllm();
    void llm;
    const vllm = await import('@/server/providers/vllm');
    const calls: string[] = [];
    let state: boolean | null = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      calls.push(`${(init as RequestInit | undefined)?.method ?? 'GET'} ${String(u).replace('http://127.0.0.1:8050', '')}`);
      if (String(u).endsWith('/is_sleeping')) { if (state === null) throw new Error('ECONNREFUSED'); return new Response(JSON.stringify({ is_sleeping: state })); }
      return new Response('{}');
    });
    expect(vllm.localVllmBase()).toBe('http://127.0.0.1:8050');
    await vllm.sleepVllm();
    expect(calls).toEqual(['GET /is_sleeping', 'POST /sleep?level=2']);
    calls.length = 0; state = true; await vllm.sleepVllm(); expect(calls).toEqual(['GET /is_sleeping']);
    calls.length = 0; state = null; await vllm.sleepVllm(); expect(calls).toEqual(['GET /is_sleeping']);
    const { engines } = await import('@/server/gpu/unloaders');
    expect(engines().find((e) => e.name === 'vllm')?.serves).toEqual(['LLM']);
  });
  it('a failed wake is a retryable infrastructure error', async () => {
    const { llm } = await withVllm();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => (String(u).endsWith('/is_sleeping') ? new Response(JSON.stringify({ is_sleeping: true })) : new Response('boom', { status: 500 })));
    const err = await llm.chat([{ role: 'user', content: 'x' }]).catch((e) => e);
    expect(err).toMatchObject({ failureClass: 'INFRASTRUCTURE', retryable: true });
    expect(String(err.message)).toMatch(/could not wake/);
  });
});
