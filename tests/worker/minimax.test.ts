import { beforeEach, describe, expect, it, vi } from 'vitest';

/** THE MINIMAX CLIENT AGAINST THE REAL ENDPOINT, without a valid key: the request shape reaches api.minimax.io and
 *  the authentication refusal comes back through the client's error table as a terminal (non-retryable) provider
 *  error with the provider's code. This is the most that can be verified until a key is present. */

const online = async () => { try { const r = await fetch('https://api.minimax.io/', { method: 'HEAD', signal: AbortSignal.timeout(8000) }); return r.status > 0; } catch { return false; } };

describe('minimax client', () => {
  beforeEach(() => { vi.resetModules(); }); // env() memoises its parse; every test reads process.env afresh

  it('without a key: NOT_CONFIGURED before any request is made', async () => {
    delete process.env.MINIMAX_API_KEY;
    const { createVideo } = await import('@/server/providers/minimax');
    await expect(createVideo({ content: [{ type: 'text', text: 'x' }], duration: 6 })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('with a wrong key: the real API refuses, mapped to a terminal PROVIDER error with the provider code', async () => {
    if (!(await online())) return; // no route to MiniMax from this machine right now
    process.env.MINIMAX_API_KEY = 'not-a-real-key';
    process.env.MINIMAX_BASE_URL = 'https://api.minimax.io';
    const { createVideo, MinimaxError } = await import('@/server/providers/minimax');
    let caught: unknown;
    try { await createVideo({ content: [{ type: 'text', text: 'A cat on a sunny windowsill.' }], duration: 6, resolution: '768P' }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(MinimaxError);
    const err = caught as InstanceType<typeof MinimaxError>;
    expect(err.code).toBe('PROVIDER');
    expect(err.status).toBeGreaterThanOrEqual(400);
    expect(err.retryable).toBe(false); // a bad key must never be retried
    expect(`${err.providerCode} ${err.message}`).toMatch(/auth|1004|2049|401|invalid|key|token/i);
  }, 30_000);
});
