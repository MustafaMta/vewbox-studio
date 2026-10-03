import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioError } from '@/domain/errors';
import { startHeartbeat } from '@/worker/heartbeat';

/** THE LEASE HEARTBEAT (audit H6, step 3): a transient database error is retried and never cancels the job; only a
 *  lost lease (CONFLICT) stops the attempt; a requested cancel is reported. */

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const run = (answers: Array<{ cancelRequested: boolean } | Error>) => {
  const calls: number[] = [];
  const events = { cancel: 0, lost: 0, errors: [] as number[] };
  let i = 0;
  const stop = startHeartbeat({
    intervalMs: 20_000, retryMs: [2_000, 5_000],
    beat: async () => { calls.push(Date.now()); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return a; },
    onCancel: () => { events.cancel++; }, onLost: () => { events.lost++; }, onError: (_e, n) => { events.errors.push(n); },
  });
  return { calls, events, stop };
};

describe('startHeartbeat', () => {
  it('a database outage is retried with backoff and does not cancel; the beat resumes when it is back', async () => {
    const t0 = Date.now();
    const db = new Error('Connection terminated unexpectedly');
    const { calls, events, stop } = run([db, db, db, { cancelRequested: false }, { cancelRequested: false }]);
    await vi.advanceTimersByTimeAsync(20_000 + 2_000 + 5_000 + 5_000 + 20_000);
    expect(calls.map((t) => t - t0)).toEqual([20_000, 22_000, 27_000, 32_000, 52_000]);
    expect(events).toEqual({ cancel: 0, lost: 0, errors: [1, 2, 3] });
    stop();
  });

  it('a lost lease (CONFLICT) stops the attempt and the beats', async () => {
    const { calls, events } = run([{ cancelRequested: false }, new StudioError('CONFLICT', 'Lost the lease on this job.')]);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(events.lost).toBe(1); expect(events.cancel).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it('a requested cancel is reported; stop() ends the beats', async () => {
    const { calls, events, stop } = run([{ cancelRequested: true }]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events.cancel).toBe(1);
    stop();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(calls).toHaveLength(1);
  });
});
