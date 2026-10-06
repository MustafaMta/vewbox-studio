import { afterEach, describe, expect, it, vi } from 'vitest';

/** The local story model and its GPU lease estimate (docs/research/MODEL-EVAL-2026-10.md §3, §9): Qwen3.6-27B Q8_0 is the
 *  default when OPENAI_COMPATIBLE_MODEL names none (2026-10-06), Gemma 4 31B the selectable fallback, and the lease asks
 *  for what each model was measured to hold on the card. */

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.resetModules(); });

/** a fresh module graph with this environment (env() caches its first parse) */
async function llmWith(vars: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...saved, DATABASE_URL: saved.DATABASE_URL ?? 'postgres://u:p@127.0.0.1:1/x', MINIMAX_API_KEY: '', ANTHROPIC_API_KEY: '', LLM_PROVIDER: 'auto', OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:11434/v1' };
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return import('@/server/providers/llm');
}

describe('the local story model', () => {
  it('is Qwen3.6-27B Q8_0 when OPENAI_COMPATIBLE_MODEL is unset or empty; Gemma is the fallback', async () => {
    for (const value of [undefined, '']) {
      const llm = await llmWith({ OPENAI_COMPATIBLE_MODEL: value });
      const cfg = llm.resolveProvider();
      expect(cfg.provider).toBe('openai-compatible');
      expect(cfg.model).toBe('qwen3.6:27b-q8_0');
      expect(llm.DEFAULT_LOCAL_LLM).toBe('qwen3.6:27b-q8_0');
      expect(llm.FALLBACK_LOCAL_LLM).toBe('gemma4:31b-it-qat');
    }
  });

  it('keeps Gemma, qwen3:14b (or any model) available behind the setting', async () => {
    expect((await llmWith({ OPENAI_COMPATIBLE_MODEL: 'gemma4:31b-it-qat' })).resolveProvider().model).toBe('gemma4:31b-it-qat');
    const llm = await llmWith({ OPENAI_COMPATIBLE_MODEL: 'qwen3:14b' });
    expect(llm.resolveProvider().model).toBe('qwen3:14b');
  });

  it('a hosted key still wins under LLM_PROVIDER=auto', async () => {
    const llm = await llmWith({ ANTHROPIC_API_KEY: 'k', OPENAI_COMPATIBLE_MODEL: undefined });
    expect(llm.resolveProvider().provider).toBe('anthropic');
  });
});

describe('the LLM lease estimate follows the model', () => {
  it('uses the measured card totals: Qwen3.6-27B 31.5 GB, Gemma 21.5 GB, qwen3:14b 12 GB, an unmeasured model the old 12 GB', async () => {
    const { llmLeaseMb, UNMEASURED_LLM_VRAM_MB } = await llmWith({});
    expect(llmLeaseMb('qwen3.6:27b-q8_0')).toBe(31500);
    expect(llmLeaseMb('qwen3.6:27b-q6_K')).toBe(31500);
    expect(llmLeaseMb('gemma4:31b-it-qat')).toBe(21500);
    expect(llmLeaseMb('gemma4:31b-it-q4_K_M')).toBe(21500);
    expect(llmLeaseMb(' QWEN3:14B ')).toBe(12000);
    expect(llmLeaseMb('llama3:8b')).toBe(UNMEASURED_LLM_VRAM_MB);
    expect(UNMEASURED_LLM_VRAM_MB).toBe(12000);
  });

  it('chat takes the LLM lease with the model\'s estimate on the local Ollama', async () => {
    const leases: Array<{ family: string; mb: number }> = [];
    vi.doMock('@/server/gpu/lease', () => ({ gpuLease: async (family: string, mb: number, fn: () => Promise<unknown>) => { leases.push({ family, mb }); return fn(); } }));
    const llm = await llmWith({ OPENAI_COMPATIBLE_MODEL: undefined });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await llm.chat([{ role: 'user', content: 'hi' }]);
    expect(leases).toEqual([{ family: 'LLM', mb: 31500 }]);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe('qwen3.6:27b-q8_0');
    fetchMock.mockRestore();
    vi.doUnmock('@/server/gpu/lease');
  });
});
