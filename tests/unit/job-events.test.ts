import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import { jobEnricher, type StudioEvent } from '@/server/events';
import { JOB_LIST_LIMIT, applyJobEvent, jobEventNeedsReload, mergeJob } from '@/studio/job-list';

/** Audit H4: a job notification reaches every open tab WITH the row, so no tab reloads the newest 300 jobs on each
 *  progress report. The web process reads the row once per change (coalesced per job); the browser merges it. */

const job = (id: string, over: Partial<Job> = {}): Job => ({ id, type: 'MEDIA_PROBE', status: 'QUEUED', priority: 0, payload: {}, attempts: 0, maxAttempts: 3, cancelRequested: false, createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-03T10:00:00.000Z', ...over });
const note = (jobId: string, status = 'GENERATING'): StudioEvent => ({ type: 'job', jobId, status, at: new Date().toISOString() });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('jobEnricher (web process, one LISTEN connection)', () => {
  it('sends each job notification with the row as it is now', async () => {
    const out: StudioEvent[] = [];
    const enrich = jobEnricher(async (id) => job(id, { status: 'GENERATING', progress: { phase: 'generating', percent: 40 } }), (e) => out.push(e));
    enrich(note('job-1'));
    await tick();
    expect(out).toHaveLength(1);
    expect(out[0].job?.progress?.percent).toBe(40);
    expect(out[0].status).toBe('GENERATING');
  });

  it('coalesces a burst for one job into one read in flight and one more read, ending on the latest row', async () => {
    let version = 0;
    let reads = 0;
    const gates: Array<() => void> = [];
    const load = (id: string) => { reads++; const v = ++version; return new Promise<Job>((r) => gates.push(() => r(job(id, { updatedAt: `2026-10-03T10:00:0${v}.000Z`, progress: { phase: 'generating', percent: v * 10 } })))); };
    const out: StudioEvent[] = [];
    const enrich = jobEnricher(load, (e) => out.push(e));
    enrich(note('job-1')); enrich(note('job-1')); enrich(note('job-1')); enrich(note('job-1'));
    expect(reads).toBe(1);
    gates.shift()!(); await tick(); await tick();
    expect(reads).toBe(2); // the three that arrived while the first read ran: one more read
    gates.shift()!(); await tick(); await tick();
    expect(reads).toBe(2);
    expect(out.map((e) => e.job?.progress?.percent)).toEqual([10, 20]);
  });

  it('reads different jobs independently', async () => {
    const seen: string[] = [];
    const enrich = jobEnricher(async (id) => { seen.push(id); return job(id); }, () => undefined);
    enrich(note('a')); enrich(note('b'));
    await tick();
    expect(seen.sort()).toEqual(['a', 'b']);
  });

  it('a row that is gone travels as job: null; a reset and activity events pass through untouched', async () => {
    const out: StudioEvent[] = [];
    const enrich = jobEnricher(async () => undefined, (e) => out.push(e));
    enrich(note('gone'));
    enrich({ type: 'job', jobId: '*', status: 'CLEARED', at: 'x' });
    enrich({ type: 'activity', kind: 'RUN_STARTED', at: 'x' });
    await tick();
    expect(out.find((e) => e.jobId === 'gone')?.job).toBeNull();
    expect(out.find((e) => e.jobId === '*')).toEqual({ type: 'job', jobId: '*', status: 'CLEARED', at: 'x' });
    expect(out.find((e) => e.type === 'activity')).toEqual({ type: 'activity', kind: 'RUN_STARTED', at: 'x' });
  });

  it('a failed read passes the bare notification on (the browser then reloads the list)', async () => {
    const out: StudioEvent[] = [];
    const enrich = jobEnricher(async () => { throw new Error('db away'); }, (e) => out.push(e));
    enrich(note('job-1'));
    await tick();
    expect(out).toHaveLength(1);
    expect('job' in out[0]).toBe(false);
    expect(jobEventNeedsReload(out[0])).toBe(true);
  });
});

describe('the browser job list', () => {
  it('replaces a job in place and keeps the newer copy when events overtake each other', () => {
    const list = [job('b', { createdAt: '2026-10-03T10:00:02.000Z' }), job('a')];
    const newer = mergeJob(list, job('a', { status: 'GENERATING', updatedAt: '2026-10-03T10:00:05.000Z' }));
    expect(newer.map((j) => j.id)).toEqual(['b', 'a']);
    expect(newer[1].status).toBe('GENERATING');
    const stale = mergeJob(newer, job('a', { status: 'QUEUED', updatedAt: '2026-10-03T10:00:01.000Z' }));
    expect(stale).toBe(newer);
  });

  it('inserts a job it has not seen at its place by creation time, and stays within the limit', () => {
    const list = [job('c', { createdAt: '2026-10-03T10:00:03.000Z' }), job('a', { createdAt: '2026-10-03T10:00:01.000Z' })];
    expect(mergeJob(list, job('b', { createdAt: '2026-10-03T10:00:02.000Z' })).map((j) => j.id)).toEqual(['c', 'b', 'a']);
    expect(mergeJob(list, job('d', { createdAt: '2026-10-03T10:00:04.000Z' })).map((j) => j.id)).toEqual(['d', 'c', 'a']);
    const full = Array.from({ length: JOB_LIST_LIMIT }, (_, i) => job(`old-${i}`, { createdAt: `2026-10-02T10:00:00.${String(999 - i).padStart(3, '0')}Z` }));
    const merged = mergeJob(full, job('new', { createdAt: '2026-10-03T12:00:00.000Z' }));
    expect(merged).toHaveLength(JOB_LIST_LIMIT);
    expect(merged[0].id).toBe('new');
    // a job older than everything in a full list that just moved (a long creation a page follows) is kept
    const old = mergeJob(full, job('ancient', { createdAt: '2026-09-01T00:00:00.000Z', status: 'GENERATING' }));
    expect(old).toHaveLength(JOB_LIST_LIMIT);
    expect(old[old.length - 1].id).toBe('ancient');
  });

  it('applies an event: the row merges, null removes, a reset asks for a reload', () => {
    const list = [job('a'), job('b')];
    expect(applyJobEvent(list, { jobId: 'a', job: job('a', { status: 'COMPLETED', updatedAt: '2026-10-03T11:00:00.000Z' }) })[0].status).toBe('COMPLETED');
    expect(applyJobEvent(list, { jobId: 'a', job: null }).map((j) => j.id)).toEqual(['b']);
    expect(jobEventNeedsReload({ jobId: '*' })).toBe(true);
    expect(jobEventNeedsReload({ jobId: 'a' })).toBe(true);
    expect(jobEventNeedsReload({ jobId: 'a', job: null })).toBe(false);
    expect(jobEventNeedsReload({ jobId: 'a', job: job('a') })).toBe(false);
  });
});
