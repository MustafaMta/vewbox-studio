import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgres://u:p@127.0.0.1:5432/vewbox_qa3');
const { engineGuardProblem, isLocalEngine, leaseDatabaseUrl, leaseIsLive } = await import('@/server/gpu/lease-db');

/** ONE GPU LEASE PER MACHINE (incident 2026-10-06): the lease database, and the guard that keeps a process outside the
 *  live lease off the real engines. Pure. */

const COPY = 'postgres://u:p@127.0.0.1:5432/vewbox_qa3';
const LIVE = 'postgres://u:p@127.0.0.1:5432/vewbox';

describe('the lease database', () => {
  it('defaults to the live studio database on the same server, whatever database the process uses', () => {
    expect(leaseDatabaseUrl({ DATABASE_URL: COPY })).toBe(LIVE);
    expect(leaseDatabaseUrl({ DATABASE_URL: LIVE })).toBe(LIVE);
    expect(leaseIsLive({ DATABASE_URL: COPY })).toBe(true);
  });
  it('GPU_LEASE_DATABASE_URL overrides it (the test suites keep their own)', () => {
    expect(leaseDatabaseUrl({ DATABASE_URL: COPY, GPU_LEASE_DATABASE_URL: COPY })).toBe(COPY);
    expect(leaseIsLive({ DATABASE_URL: COPY, GPU_LEASE_DATABASE_URL: COPY })).toBe(false);
  });
});

describe('the engine guard', () => {
  it('local engines are loopback, the Docker host alias, or compose service names; a hosted API is not', () => {
    for (const u of ['http://127.0.0.1:8188', 'http://localhost:8020', 'http://[::1]:8030', 'http://comfyui:8188', 'http://tts-habibi:8021', 'http://host.docker.internal:11434/v1']) expect(isLocalEngine(u), u).toBe(true);
    for (const u of ['https://api.minimax.io', 'https://api.anthropic.com', 'not a url']) expect(isLocalEngine(u), u).toBe(false);
  });
  it('a process on a copy database that queues on the live lease may call the real engines (the default)', () => {
    expect(engineGuardProblem('http://127.0.0.1:8188', { DATABASE_URL: COPY })).toBeUndefined();
  });
  it('a process on its own lease is refused the real engines, with a clear reason; hosted APIs and fixture engines are allowed', () => {
    const own = { DATABASE_URL: COPY, GPU_LEASE_DATABASE_URL: COPY };
    expect(engineGuardProblem('http://127.0.0.1:8188', own)).toMatch(/takes its GPU lease in "vewbox_qa3", not in the live studio's, so it may not call the machine's real engine at http:\/\/127\.0\.0\.1:8188/);
    expect(engineGuardProblem('https://api.minimax.io', own)).toBeUndefined();
    expect(engineGuardProblem('http://127.0.0.1:8188', { ...own, VEWBOX_FIXTURE_ENGINES: '1' })).toBeUndefined();
    // the live database with a non-live lease is refused too: the lease must be the shared one
    expect(engineGuardProblem('http://127.0.0.1:8030', { DATABASE_URL: LIVE, GPU_LEASE_DATABASE_URL: COPY })).toBeTruthy();
  });
});
