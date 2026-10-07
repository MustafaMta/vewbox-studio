import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobCancelled, deadlineExceeded, followJobSignal, jobSignal, raceAbort, runInJobScope, sleep, withSignal } from '@/server/jobs/context';
import { JOB_DEADLINE_MS, jobDeadline } from '@/server/jobs/deadlines';
import { JOB_TYPES } from '@/domain/jobs';

/** DEADLINES AND REAL CANCELLATION (docs/BACKEND-AUDIT-2026-10.md H5, step 4): a stopped job's signal reaches the
 *  work itself — ffmpeg children are killed, requests aborted, ComfyUI prompts cancelled — and a handler that
 *  ignores it is let go of at its deadline. Uses the real ffmpeg (as the media unit tests do). */

process.env.COMFYUI_URL = 'http://comfy.test:8188';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const scope = (ctrl: AbortController) => <T>(fn: () => T) => runInJobScope({ jobId: 'job-test', signal: ctrl.signal }, fn);
// a 10-minute ffmpeg run: it only ends early if it is killed
const LONG = ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '600', '-f', 'null', '-'];

describe('per-job-type deadlines', () => {
  it('every job type has one; generous for long renders, overridable by environment', () => {
    for (const t of JOB_TYPES) expect(JOB_DEADLINE_MS[t], t).toBeGreaterThan(0);
    expect(JOB_DEADLINE_MS.GENERATE_TAKE).toBeGreaterThanOrEqual(2 * 90 * 60_000); // twice a 90-min local H3 render
    expect(jobDeadline('MEDIA_PROBE', {})).toEqual({ ms: JOB_DEADLINE_MS.MEDIA_PROBE, mode: 'enforce' });
    expect(jobDeadline('MEDIA_PROBE', { JOB_DEADLINE_SCALE: '2', JOB_DEADLINES: 'log' })).toEqual({ ms: 2 * JOB_DEADLINE_MS.MEDIA_PROBE, mode: 'log' });
    expect(jobDeadline('MEDIA_PROBE', { JOB_DEADLINES: 'off' }).mode).toBe('off');
  });

  it('a handler that ignores its signal is let go of at the deadline (plus the grace), with the deadline as the reason', async () => {
    const ctrl = new AbortController();
    const t0 = Date.now();
    setTimeout(() => ctrl.abort(deadlineExceeded('Check a file', 150)), 150);
    const stubborn = new Promise<never>(() => {}); // never settles, never looks at the signal
    await expect(raceAbort(scope(ctrl)(() => stubborn), ctrl.signal, 100)).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { reason: 'DEADLINE', failureClass: 'INFRASTRUCTURE' } });
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('a cooperative handler settles first: raceAbort returns its own outcome', async () => {
    const ctrl = new AbortController();
    await expect(raceAbort(Promise.resolve(42), ctrl.signal, 100)).resolves.toBe(42);
  });
});

describe('the job signal reaches the work', () => {
  it('ffmpeg is killed when the job is cancelled', async () => {
    const { ffmpeg } = await import('@/server/media/ffmpeg');
    const ctrl = new AbortController();
    const t0 = Date.now();
    setTimeout(() => ctrl.abort(new JobCancelled()), 300);
    await expect(scope(ctrl)(() => ffmpeg(LONG))).rejects.toBeInstanceOf(JobCancelled);
    expect(Date.now() - t0).toBeLessThan(5_000);
  }, 20_000);

  it('execFile children (ffprobe/ffmpeg reads) are killed on the job signal too', async () => {
    const { execFileP } = await import('@/server/media/exec');
    const ctrl = new AbortController();
    const t0 = Date.now();
    setTimeout(() => ctrl.abort(new JobCancelled()), 300);
    await expect(scope(ctrl)(() => execFileP('ffmpeg', ['-v', 'error', ...LONG]))).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(5_000);
  }, 20_000);

  it('followJobSignal aborts a provider request with the job\'s reason; withSignal narrows the scope', async () => {
    const ctrl = new AbortController();
    await scope(ctrl)(async () => {
      const req = new AbortController();
      const unlink = followJobSignal(req);
      const inner = new AbortController();
      await withSignal(inner.signal, async () => { inner.abort(new Error('tool timeout')); expect(jobSignal()?.aborted).toBe(true); });
      expect(jobSignal()?.aborted).toBe(false);
      ctrl.abort(new JobCancelled());
      expect(req.signal.aborted).toBe(true); expect(req.signal.reason).toBeInstanceOf(JobCancelled);
      unlink();
    });
    await expect(sleep(10_000, ctrl.signal)).rejects.toBeInstanceOf(JobCancelled);
  });

  it('a ComfyUI prompt is cancelled (interrupted) when the job is stopped, and the wait ends with the job\'s reason', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url)); calls.push(`${init?.method ?? 'GET'} ${u.pathname}`);
      if (init?.signal?.aborted) throw init.signal.reason;
      if (u.pathname === '/prompt') return new Response(JSON.stringify({ prompt_id: 'x', node_errors: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (/\/cancel$/.test(u.pathname)) return new Response(JSON.stringify({ cancelled: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.pathname.startsWith('/api/jobs/')) return new Response(JSON.stringify({ status: 'in_progress' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const comfy = await import('@/server/providers/comfy');
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(new JobCancelled()), 200);
    const t0 = Date.now();
    await expect(scope(ctrl)(() => comfy.run({ '1': { class_type: 'X', inputs: {} } }, { pollMs: 60_000, socket: false }))).rejects.toBeInstanceOf(JobCancelled);
    expect(Date.now() - t0).toBeLessThan(5_000); // the 60 s poll sleep woke on the abort
    expect(calls.some((c) => /^POST \/api\/jobs\/[^/]+\/cancel$/.test(c))).toBe(true);
  });
});

describe('a tool timeout aborts the tool\'s work instead of racing it', () => {
  it('the ffmpeg child of a timed-out tool call is killed and the call fails with the timeout', async () => {
    vi.doMock('@/server/org/model', async (orig) => {
      const m = await orig<typeof import('@/server/org/model')>();
      return { ...m, toolById: (id: string) => ({ ...(m.toolById(id) ?? { id, name: id, version: '1' }), timeoutMs: 300 }) };
    });
    vi.doMock('@/server/org/runs', async (orig) => ({ ...(await orig<typeof import('@/server/org/runs')>()), recordToolCall: async () => undefined }));
    const { makeToolRunner } = await import('@/server/org/tools');
    const { ffmpeg } = await import('@/server/media/ffmpeg');
    const { AGENTS } = await import('@/server/org/model');
    const agent = AGENTS.find((a) => a.tools.includes('media.assemble'))!;
    const tool = makeToolRunner(agent, 'run-test', { warn: () => {}, debug: () => {}, error: () => {}, info: () => {} } as never);
    const ctrl = new AbortController();
    const t0 = Date.now();
    let childEnded = false;
    await expect(scope(ctrl)(() => tool('media.assemble', () => { const work = ffmpeg(LONG); work.catch(() => { childEnded = true; }); return work; }))).rejects.toThrow(/did not finish within/);
    expect(Date.now() - t0).toBeLessThan(5_000);
    await new Promise((r) => setTimeout(r, 500));
    expect(childEnded).toBe(true); // killed, not left rendering behind a raced timeout
    expect(ctrl.signal.aborted).toBe(false); // only the tool's own work was stopped, not the job
    vi.doUnmock('@/server/org/model'); vi.doUnmock('@/server/org/runs');
  }, 20_000);

  it('a call sized larger than the flat timeout runs to its own bound; a smaller one never shortens the flat timeout', async () => {
    vi.resetModules();
    vi.doMock('@/server/org/model', async (orig) => {
      const m = await orig<typeof import('@/server/org/model')>();
      return { ...m, toolById: (id: string) => ({ ...(m.toolById(id) ?? { id, name: id, version: '1' }), timeoutMs: 200 }) };
    });
    vi.doMock('@/server/org/runs', async (orig) => ({ ...(await orig<typeof import('@/server/org/runs')>()), recordToolCall: async () => undefined }));
    // only the bound is under test here, not the answer's contract
    vi.doMock('@/server/org/contracts', async (orig) => ({ ...(await orig<typeof import('@/server/org/contracts')>()), CONTRACTS: {} }));
    const { makeToolRunner } = await import('@/server/org/tools');
    const { AGENTS } = await import('@/server/org/model');
    const agent = AGENTS.find((a) => a.tools.includes('story.structured_answer'))!;
    const tool = makeToolRunner(agent, 'run-test', { warn: () => {}, debug: () => {}, error: () => {}, info: () => {} } as never);
    // work that outlasts the flat 200 ms and the 2 s the runner lets aborted work finish in
    const slow = () => new Promise<string>((r) => setTimeout(() => r('done'), 2_600));
    await expect(tool('story.structured_answer', slow, { timeoutMs: 5_000 })).resolves.toBe('done');
    await expect(tool('story.structured_answer', slow, { timeoutMs: 50 })).rejects.toThrow(/did not finish within/);
    vi.doUnmock('@/server/org/model'); vi.doUnmock('@/server/org/runs'); vi.doUnmock('@/server/org/contracts');
  }, 20_000);
});
