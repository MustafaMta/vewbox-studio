import { afterEach, describe, expect, it, vi } from 'vitest';

/** The Ollama unloader drops EVERY model Ollama has loaded (its /api/ps), not only the studio's configured one: a
 *  benchmark's model left resident kept VRAM and host RAM under the next family (2026-10-06, a Qwen-Image frame job
 *  choked ComfyUI after an LLM batch). */

vi.mock('@/server/env', () => ({ env: () => ({ OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:11434/v1', OPENAI_COMPATIBLE_MODEL: 'gemma4:31b-it-qat' }) }));

const calls: Array<{ url: string; body?: unknown }> = [];
afterEach(() => { calls.length = 0; vi.unstubAllGlobals(); });

function stubFetch(ps: unknown, psOk = true) {
  vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/api/ps')) return { ok: psOk, json: async () => ps } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  });
}

describe('unloadOllama', () => {
  it('unloads every loaded model plus the configured one, each once', async () => {
    stubFetch({ models: [{ name: 'qwen3.6:27b-q8_0' }, { name: 'gemma4:31b-it-qat' }] });
    const { unloadOllama } = await import('@/server/gpu/unloaders');
    await unloadOllama();
    const unloaded = calls.filter((c) => c.url.endsWith('/api/generate')).map((c) => (c.body as { model: string; keep_alive: number }));
    expect(unloaded.map((u) => u.model).sort()).toEqual(['gemma4:31b-it-qat', 'qwen3.6:27b-q8_0']);
    expect(unloaded.every((u) => u.keep_alive === 0)).toBe(true);
  });

  it('falls back to the configured model when /api/ps does not answer', async () => {
    stubFetch({}, false);
    const { unloadOllama } = await import('@/server/gpu/unloaders');
    await unloadOllama();
    expect(calls.filter((c) => c.url.endsWith('/api/generate')).map((c) => (c.body as { model: string }).model)).toEqual(['gemma4:31b-it-qat']);
  });
});
