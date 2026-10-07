import { afterEach, describe, expect, it, vi } from 'vitest';

/** The planner and its GPU lease estimate: Qwen3.8-27B-NVFP4 on the local vLLM server is the default (and only)
 *  planner; a hosted key changes nothing (there is no hosted planner); the lease asks for the measured card total
 *  (29,976 MiB peak, 2026-10-07), and a model never measured for the whole card. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); vi.doUnmock('@/server/gpu/lease'); vi.resetModules(); });

async function llmWith(vars: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/x', GPU_LEASE_DATABASE_URL: '', VEWBOX_FIXTURE_ENGINES: '1', MINIMAX_API_KEY: '', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:8050/v1' };
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return import('@/server/providers/llm');
}

describe('the planner', () => {
  it('is Qwen3.8-27B-NVFP4 when OPENAI_COMPATIBLE_MODEL is unset or empty', async () => {
    for (const value of [undefined, '']) {
      const llm = await llmWith({ OPENAI_COMPATIBLE_MODEL: value });
      expect(llm.resolveProvider()).toMatchObject({ provider: 'openai-compatible', model: 'Qwen3.8-27B-NVFP4' });
      expect(llm.DEFAULT_LOCAL_LLM).toBe('Qwen3.8-27B-NVFP4');
    }
  });

  it('a hosted key (MiniMax for video, or any other) never becomes a planner', async () => {
    const llm = await llmWith({ MINIMAX_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', LLM_PROVIDER: 'anthropic' });
    expect(llm.resolveProvider()).toMatchObject({ provider: 'openai-compatible', model: 'Qwen3.8-27B-NVFP4' });
  });
});

describe('the LLM lease estimate', () => {
  it('uses the measured card total for the planner; a model never measured asks for the whole card', async () => {
    const { llmLeaseMb, UNMEASURED_LLM_VRAM_MB } = await llmWith({});
    expect(llmLeaseMb('Qwen3.8-27B-NVFP4')).toBe(28500);
    expect(llmLeaseMb(' qwen3.8-27b-nvfp4 ')).toBe(28500);
    expect(llmLeaseMb('llama3:8b')).toBe(UNMEASURED_LLM_VRAM_MB);
    expect(UNMEASURED_LLM_VRAM_MB).toBe(31500);
  });

  it('chat takes the LLM lease with the planner\'s estimate', async () => {
    const leases: Array<{ family: string; mb: number }> = [];
    vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (family: string, mb: number, fn: () => Promise<unknown>) => { leases.push({ family, mb }); return fn(); } }));
    const llm = await llmWith({});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      if (String(u).endsWith('/is_sleeping')) return new Response(JSON.stringify({ is_sleeping: false }));
      return new Response([`data: ${JSON.stringify({ choices: [{ delta: { content: '{}' }, finish_reason: 'stop' }] })}\n\n`, 'data: [DONE]\n\n'].join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    await llm.chat([{ role: 'user', content: 'hi' }]);
    expect(leases).toEqual([{ family: 'LLM', mb: 28500 }]);
    const body = JSON.parse(String((fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'))![1] as RequestInit).body));
    expect(body.model).toBe('Qwen3.8-27B-NVFP4');
  });
});
