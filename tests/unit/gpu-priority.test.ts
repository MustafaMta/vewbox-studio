import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');
const { admits, BACKGROUND_PREFIX, BACKGROUND_STARVATION_MS } = await import('@/server/gpu/lease');

/** GPU LEASE PRIORITY (the films first): benchmarks through scripts/gpu-hold.ts are BACKGROUND requests. One test per
 *  rule, on the pure admission function. */

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
type Row = { holder: string; ticket: number; family: string; state: string; jobId: string | null; requestedAt?: string };
const row = (holder: string, ticket: number, family: string, state: 'WAITING' | 'HOLDING', requestedAt = ago(60_000), jobId: string | null = null): Row => ({ holder, ticket, family, state, jobId, requestedAt });
const bg = (name: string) => `${BACKGROUND_PREFIX}${name}`;
const may = (rows: Row[], holder: string, family: string, ctx: { gpuJobsWaiting?: boolean } = {}) => admits(rows, { holder, family, jobId: null }, NOW, ctx);

describe('GPU lease priority', () => {
  it('a background request waits behind a worker request, even one that asked later (worker waiters go first)', () => {
    const rows = [row(bg('bench'), 1, 'IMAGE', 'WAITING', ago(10 * 60_000)), row('worker:take', 2, 'VIDEO', 'WAITING', ago(5_000))];
    expect(may(rows, 'worker:take', 'VIDEO')).toBe(true);
    expect(may(rows, bg('bench'), 'IMAGE')).toBe(false);
  });
  it('worker requests stay FIFO among themselves', () => {
    const rows = [row(bg('bench'), 1, 'IMAGE', 'WAITING'), row('worker:asr', 2, 'ASR', 'WAITING'), row('worker:video', 3, 'VIDEO', 'WAITING')];
    expect(may(rows, 'worker:asr', 'ASR')).toBe(true);
    expect(may(rows, 'worker:video', 'VIDEO')).toBe(false);
  });
  it('a background request is admitted when no worker request waits and no worker GPU job is queued or preparing', () => {
    const rows = [row(bg('bench-1'), 1, 'IMAGE', 'WAITING'), row(bg('bench-2'), 2, 'LLM', 'WAITING')];
    expect(may(rows, bg('bench-1'), 'IMAGE')).toBe(true);
    expect(may(rows, bg('bench-2'), 'LLM')).toBe(false); // background FIFO among themselves too
    expect(may(rows, bg('bench-1'), 'IMAGE', { gpuJobsWaiting: true })).toBe(false); // a film job is about to ask
  });
  it('a holder is never preempted: a background batch that holds the card keeps it; the worker request waits for its release', () => {
    const rows = [row(bg('bench'), 1, 'IMAGE', 'HOLDING'), row('worker:take', 2, 'VIDEO', 'WAITING')];
    expect(may(rows, 'worker:take', 'VIDEO')).toBe(false);
    expect(may(rows.slice(1), 'worker:take', 'VIDEO')).toBe(true); // released
  });
  it('the starvation guard: a background request waiting 45 min is served at the next free slot, ahead of newer worker requests', () => {
    const rows = [row(bg('bench'), 1, 'IMAGE', 'WAITING', ago(BACKGROUND_STARVATION_MS + 1)), row('worker:take', 5, 'VIDEO', 'WAITING', ago(10_000))];
    expect(may(rows, bg('bench'), 'IMAGE', { gpuJobsWaiting: true })).toBe(true);
    expect(may(rows, 'worker:take', 'VIDEO')).toBe(false);
    // …but not while the card is held by another family (no preemption)
    expect(may([row('worker:asr', 0, 'ASR', 'HOLDING'), ...rows], bg('bench'), 'IMAGE')).toBe(false);
    // 44 min is not starving
    expect(may([row(bg('bench'), 1, 'IMAGE', 'WAITING', ago(44 * 60_000)), rows[1]], bg('bench'), 'IMAGE')).toBe(false);
  });
  it('incident 13:05Z: a starved background request is NEVER admitted beside a holder of another family — granted, switching (HOLDING without granted_at) or legacy SWITCHING', () => {
    const starved = row(bg('tts-bench'), 1, 'TTS', 'WAITING', ago(BACKGROUND_STARVATION_MS + 60_000));
    const holders = [
      { ...row('worker:asr', 0, 'ASR', 'HOLDING'), grantedAt: ago(5_000) },
      { ...row('worker:asr', 0, 'ASR', 'HOLDING'), grantedAt: null },
      { ...row('worker:asr', 0, 'ASR', 'HOLDING'), state: 'SWITCHING', grantedAt: ago(5_000) },
    ];
    for (const h of holders) expect(admits([h, starved], { holder: bg('tts-bench'), family: 'TTS', jobId: null }, NOW, {}), `${h.state}/${h.grantedAt}`).toBe(false);
    // and not beside a switching holder of its OWN family either (the unloads are not done)
    expect(admits([{ ...row('worker:tts', 0, 'TTS', 'HOLDING'), grantedAt: null }, starved], { holder: bg('tts-bench'), family: 'TTS', jobId: null }, NOW, {})).toBe(false);
    // once the card is free it is served
    expect(admits([starved], { holder: bg('tts-bench'), family: 'TTS', jobId: null }, NOW, { gpuJobsWaiting: true })).toBe(true);
  });
});
