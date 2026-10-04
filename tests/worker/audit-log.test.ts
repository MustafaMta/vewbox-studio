import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as dsql } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue } from '@/server/jobs/queue';
import { agentStats, finishAttempt, listAgentRuns, listFailures, listStudioEvents, recordChangeMade, recordToolCall, reliabilityEvent, reliabilitySummary, resolveReliability, startAttempt, startRun } from '@/server/org/runs';
import type { Job } from '@/domain/jobs';

/** ONE AUDIT LOG (docs/BACKEND-AUDIT-2026-10.md M4, step 15), on the test database: every attempt is a job_attempts row
 *  (who, when, how it ended, the failure's class and what changed); reliability_events is no longer written and its
 *  history was copied by the migration; tool calls are TOOL_CALL event rows, read back into each run's `toolCalls`
 *  beside the old JSONB arrays, counted in the agent's statistics, and never shown as activity. */

const made: string[] = [];
const runs: string[] = [];
afterAll(async () => {
  if (runs.length) { await db().delete(schema.studioEvents).where(inArray(schema.studioEvents.runId, runs)); await db().delete(schema.agentRuns).where(inArray(schema.agentRuns.id, runs)); }
  if (made.length) { await db().delete(schema.reliabilityEvents).where(inArray(schema.reliabilityEvents.jobId, made)); await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().delete(schema.jobs).where(inArray(schema.jobs.id, made)); }
});
const parked = async () => { const r = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: `audit-${Math.random().toString(36).slice(2)}` }, runAfter: new Date(Date.now() + 3600_000).toISOString() }); made.push(r.job.id); return r.job; };

describe('one audit log (step 15)', () => {
  it('attempts: a failure, then a success that resolves it, the producer’s change — and nothing in reliability_events', async () => {
    const j1 = { ...(await parked()), attempts: 1 } as Job;
    await startAttempt(j1, 'w-audit', 'run-x');
    await reliabilityEvent({ job: j1, failureClass: 'PROVIDER', failureMessage: 'busy', changeMade: 'automatic retry scheduled (PROVIDER)' });
    await finishAttempt(j1.id, 1, { outcome: 'FAILED', ms: 1200, failureClass: 'PROVIDER', failureMessage: 'busy' });
    await recordChangeMade(j1.id, 'switched the model');
    const j2 = { ...j1, attempts: 2 };
    await startAttempt(j2, 'w-audit');
    await finishAttempt(j1.id, 2, { outcome: 'COMPLETED', ms: 800 });
    await resolveReliability(j1.id, 'attempt 2 succeeded');
    const rows = await db().select().from(schema.jobAttempts).where(eq(schema.jobAttempts.jobId, j1.id)).orderBy(schema.jobAttempts.attempt);
    expect(rows.map((r) => [r.attempt, r.outcome, r.failureClass, r.resolved, r.changeMade, r.workerId])).toEqual([[1, 'FAILED', 'PROVIDER', true, 'switched the model', 'w-audit'], [2, 'COMPLETED', null, false, null, 'w-audit']]);
    expect(await db().select().from(schema.reliabilityEvents).where(eq(schema.reliabilityEvents.jobId, j1.id))).toEqual([]);
    // the reliability lists read the attempts, in the shape reliability_events had
    const failures = await listFailures({ jobIds: [j1.id] });
    expect(failures).toEqual([expect.objectContaining({ id: `${j1.id}#1`, jobId: j1.id, jobType: 'MEDIA_PROBE', attempt: 1, failureClass: 'PROVIDER', failureMessage: 'busy', resolved: true })]);
    expect((await reliabilitySummary(1)).openEvents.some((e) => e.jobId === j1.id)).toBe(true);
  });

  it('the migration copied the reliability events of existing jobs (and copying again changes nothing)', async () => {
    const j = await parked();
    await db().insert(schema.reliabilityEvents).values({ id: `rel-${j.id}`, jobId: j.id, jobType: j.type, attempt: 1, failureClass: 'INFRASTRUCTURE', failureMessage: 'old failure', resolved: false, createdAt: new Date().toISOString() });
    const sqlText = fs.readFileSync(path.join('drizzle', '0021_job_attempts_tool_events.sql'), 'utf8');
    const backfill = sqlText.slice(sqlText.indexOf('INSERT INTO "job_attempts"'));
    await db().execute(dsql.raw(backfill));
    await db().execute(dsql.raw(backfill));
    const rows = await db().select().from(schema.jobAttempts).where(eq(schema.jobAttempts.jobId, j.id));
    expect(rows.map((r) => [r.attempt, r.outcome, r.failureClass, r.failureMessage])).toEqual([[1, 'FAILED', 'INFRASTRUCTURE', 'old failure']]);
  });

  it('tool calls are event rows, read back into the run beside its old JSONB array, counted, and never activity', async () => {
    const j = await parked();
    const runId = await startRun({ ...j, attempts: 1 } as Job, 'production-coordinator'); runs.push(runId);
    // a run from before step 15 kept its calls in its JSONB array
    await db().update(schema.agentRuns).set({ toolCalls: [{ tool: 'jobs.enqueue', ms: 5, ok: true, at: '2026-10-04T10:00:00.000Z' }] }).where(eq(schema.agentRuns.id, runId));
    await recordToolCall(runId, { tool: 'jobs.enqueue', version: '1', ms: 7, ok: false, error: 'boom', at: '2026-10-04T10:00:01.000Z' }, { agentId: 'production-coordinator', departmentId: 'EXECUTIVE', jobId: j.id });
    const run = (await listAgentRuns({ jobId: j.id }))[0];
    expect(run.toolCalls.map((c) => [c.ms, c.ok])).toEqual([[5, true], [7, false]]);
    const stat = (await agentStats(1)).find((s) => s.agentId === 'production-coordinator')!;
    expect(stat.toolCalls).toBeGreaterThanOrEqual(2);
    expect(stat.toolFailures).toBeGreaterThanOrEqual(1);
    // the run row was not rewritten for the call (its JSONB array is as it was)
    expect((await db().select({ c: schema.agentRuns.toolCalls }).from(schema.agentRuns).where(eq(schema.agentRuns.id, runId)))[0].c).toHaveLength(1);
    expect((await listStudioEvents({ jobId: j.id, limit: 50 })).some((e) => e.kind === 'TOOL_CALL')).toBe(false);
    expect((await listStudioEvents({ jobId: j.id, includeBookkeeping: true, limit: 50 })).some((e) => e.kind === 'TOOL_CALL')).toBe(true);
  });
});
