import { and, desc, eq, gt, inArray, isNull, notInArray, sql as dsql } from 'drizzle-orm';
import type { Job } from '@/domain/jobs';
import { ACTIVITY_HIDDEN_KINDS, type RunPhaseEvent } from '@/domain/phases';
import { isStudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { db, schema, sql } from '../db/client';
import { log } from '../log';
import { AGENTS, FAILURE_CLASSES, ORG_VERSION, PIPELINE, agentById, agentIdForJob, toolById, type AgentDef, type DepartmentId, type FailureClass, type PipelineStage } from './model';
import { skillVersions } from './skills';
import { fenced } from '../jobs/fence';

/** THE RECORD OF WORK — every job runs as an agent and leaves an agent run (tool calls, outcome, failure class), the
 *  departments leave handoffs and QA reports, people leave approvals, and everything that happened is a studio event
 *  the pages read back. Nothing here is derived from a timer or invented: an event is written when the thing happened. */

/** One recorded tool call: the tool's version, how long, whether it worked, and the failure class when it did not
 *  (WRONG_PARAMETERS / OUTPUT_CORRUPTION when the contract refused the input or the output). */
export type ToolCall = { tool: string; version?: string; ms: number; ok: boolean; error?: string; failureClass?: string; at: string };

/** What a run ran with, so a change of prompt, skill, tool or model can be compared before and after. */
export interface RunVersions { model: string; skills: Record<string, string>; tools: Record<string, string> }
export const runVersions = (a: AgentDef): RunVersions => ({ model: a.model, skills: skillVersions(a), tools: Object.fromEntries(a.tools.map((t) => [t, toolById(t)?.version ?? '?'])) });
const versionColumns = (a: AgentDef | undefined) => (a ? { agentVersion: a.version, orgVersion: ORG_VERSION, versions: runVersions(a) } : { orgVersion: ORG_VERSION });

// ---------------------------------------------------------------------------------------------- failure classes

/** Map an error to the directive's failure classes. StudioError codes carry most of it; the message decides the rest. */
export function classifyFailure(e: unknown): FailureClass {
  const err = e as Error & { code?: string; failureClass?: string; name?: string };
  if (err?.failureClass && (FAILURE_CLASSES as readonly string[]).includes(err.failureClass)) return err.failureClass as FailureClass;
  if (err?.name === 'Cancelled') return 'CANCELLED';
  const m = (err?.message ?? '').toLowerCase();
  if (/lip.?sync|mouth/.test(m)) return 'LIP_SYNC_FAILURE';
  if (/doubled|duplicate audio|twice in the mix|double routing/.test(m)) return 'AUDIO_DUPLICATION';
  if (/voice (does not|doesn't) match|wrong voice|voice mismatch/.test(m)) return 'VOICE_MISMATCH';
  if (/no (usable )?(reference|portrait|plate|opening frame|recording)|reference .* missing|missing reference|has no voice/.test(m)) return 'MISSING_REFERENCE';
  if (/corrupt|not decodable|cannot be decoded|no (video|audio) stream|frozen|black (frames|stretch)/.test(m)) return 'OUTPUT_CORRUPTION';
  if (/out of memory|cuda|vram|disk full|no space|enospc/.test(m)) return 'RESOURCE_EXHAUSTION';
  if (/unsupported|cannot (do|generate)|not supported|too many references|limit of/.test(m)) return 'UNSUPPORTED_CAPABILITY';
  if (/no shots|no scenes|not planned|plan is incomplete|inconsistent|continuation .* no previous/.test(m)) return 'INCONSISTENT_PLAN';
  if (/prompt|dialogue tags|script lines/.test(m) && /(empty|missing|ambiguous)/.test(m)) return 'PROMPT_AMBIGUITY';
  const code = isStudioError(e) ? e.code : err?.code;
  switch (code) {
    case 'INVALID': return 'INVALID_INPUT';
    case 'NOT_FOUND': return 'INVALID_INPUT';
    case 'NOT_CONFIGURED': return 'INFRASTRUCTURE';
    case 'UNAVAILABLE': return 'INFRASTRUCTURE';
    case 'PROVIDER': return 'PROVIDER';
    case 'APPEARANCE_LOCKED':
    case 'ASSET_PROTECTED':
    case 'CONFLICT': return 'INCONSISTENT_PLAN';
  }
  if (/timeout|timed out|econnrefused|not reachable|unreachable|fetch failed/.test(m)) return 'INFRASTRUCTURE';
  if (/parameter|bpm|keyscale|timesignature|out of range|must be between/.test(m)) return 'WRONG_PARAMETERS';
  return 'UNKNOWN';
}

/** Only infrastructure and provider failures may be retried without a change; everything else needs a correction. */
export const RETRYABLE_CLASSES: readonly FailureClass[] = ['INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION'];

/** Whether a manual retry must say what was changed: a FAILED job whose recorded failure class is not transient (or,
 *  without a class, whose error was not marked retryable). A cancelled job restarts as it was. Pure. */
export function retryNeedsChange(job: Pick<Job, 'status' | 'error'>): { needed: boolean; failureClass?: FailureClass } {
  if (job.status !== 'FAILED') return { needed: false };
  const fc = job.error?.details?.failureClass;
  const failureClass = typeof fc === 'string' && (FAILURE_CLASSES as readonly string[]).includes(fc) ? (fc as FailureClass) : undefined;
  const transient = failureClass ? RETRYABLE_CLASSES.includes(failureClass) : job.error?.retryable === true;
  return { needed: !transient, failureClass };
}

// --------------------------------------------------------------------------------------------------- agent runs

export const agentForJob = (job: Pick<Job, 'type' | 'payload'>) => agentById(agentIdForJob(job)) ?? AGENTS.find((a) => a.id === 'production-coordinator')!;

export async function startRun(job: Job, agentId: string): Promise<string> {
  const agent = agentById(agentId);
  const id = nid('run');
  const now = new Date().toISOString();
  // a run of this job still open belongs to a worker that died (the job was reclaimed): close it as abandoned so
  // the pages never show a ghost "running" and the statistics count it as the infrastructure failure it was
  await db().update(schema.agentRuns).set({ finishedAt: now, outcome: 'FAILED', failureClass: 'INFRASTRUCTURE', errorMessage: 'worker lost (lease expired); the job was reclaimed by another attempt' }).where(and(eq(schema.agentRuns.jobId, job.id), isNull(schema.agentRuns.outcome)));
  await db().insert(schema.agentRuns).values({ id, agentId, departmentId: agent?.department ?? 'EXECUTIVE', jobId: job.id, jobType: job.type, attempt: job.attempts, productionId: job.productionId ?? null, shotId: job.shotId ?? null, startedAt: now, toolCalls: [], phases: initialPhases(job, now), ...versionColumns(agent) });
  return id;
}

/** THE RUN'S FIRST PHASES (docs/CONTRACTS-REDESIGN-BACKEND.md B9): QUEUED from the moment the job could run (its
 *  creation, or the retry's `runAfter` when later) and PREPARING from the claim. Pure. */
export function initialPhases(job: Pick<Job, 'createdAt' | 'runAfter'>, claimedAt: string): RunPhaseEvent[] {
  const queuedAt = job.runAfter && job.runAfter > job.createdAt && job.runAfter <= claimedAt ? job.runAfter : job.createdAt;
  return [{ phase: 'QUEUED', at: queuedAt }, { phase: 'PREPARING', at: claimedAt }];
}

/** Append a phase change to the run (never rewritten; the worker calls it only when the phase changed). */
export async function recordRunPhase(runId: string, event: RunPhaseEvent) {
  await db().update(schema.agentRuns).set({ phases: dsql`${schema.agentRuns.phases} || ${JSON.stringify([event])}::jsonb` }).where(eq(schema.agentRuns.id, runId));
}

/** The phases of the runs of a job, newest attempt first (the status row reads the current attempt's). */
export async function runPhasesOf(jobId: string): Promise<Array<{ runId: string; attempt: number; startedAt: string; finishedAt: string | null; outcome: string | null; phases: RunPhaseEvent[] }>> {
  const rows = await db().select({ runId: schema.agentRuns.id, attempt: schema.agentRuns.attempt, startedAt: schema.agentRuns.startedAt, finishedAt: schema.agentRuns.finishedAt, outcome: schema.agentRuns.outcome, phases: schema.agentRuns.phases, parentRunId: schema.agentRuns.parentRunId }).from(schema.agentRuns).where(and(eq(schema.agentRuns.jobId, jobId), isNull(schema.agentRuns.parentRunId))).orderBy(desc(schema.agentRuns.startedAt));
  return rows.map(({ parentRunId: _p, ...r }) => { void _p; return r; });
}

/** A DELEGATED STEP — a specialist's real piece of work inside another agent's job (a check, a selection, a
 *  normalisation that exists as its own code). It gets its own run under the parent run, with its own tool calls,
 *  outcome and duration, so the specialist's profile shows work it actually did. */
export async function startDelegatedRun(input: { job: Pick<Job, 'id' | 'type' | 'attempts' | 'productionId' | 'shotId'>; parentRunId: string; agentId: string; purpose: string }): Promise<string> {
  const agent = agentById(input.agentId);
  if (!agent) throw new Error(`Unknown agent ${input.agentId}`);
  const id = nid('run');
  await db().insert(schema.agentRuns).values({ id, agentId: agent.id, departmentId: agent.department, jobId: input.job.id, jobType: input.job.type, attempt: input.job.attempts, productionId: input.job.productionId ?? null, shotId: input.job.shotId ?? null, startedAt: new Date().toISOString(), toolCalls: [], parentRunId: input.parentRunId, purpose: input.purpose.slice(0, 300), ...versionColumns(agent) });
  return id;
}

export async function recordToolCall(runId: string, call: ToolCall) {
  await db().update(schema.agentRuns).set({ toolCalls: dsql`${schema.agentRuns.toolCalls} || ${JSON.stringify([call])}::jsonb` }).where(eq(schema.agentRuns.id, runId));
}

export async function finishRun(runId: string, out: { outcome: 'COMPLETED' | 'AWAITING_REVIEW' | 'FAILED' | 'CANCELLED'; failureClass?: FailureClass; errorMessage?: string; ms: number; costUsd?: number }) {
  await db().update(schema.agentRuns).set({ finishedAt: new Date().toISOString(), outcome: out.outcome, failureClass: out.failureClass ?? null, errorMessage: out.errorMessage?.slice(0, 2000) ?? null, ms: out.ms, costUsd: out.costUsd ?? null }).where(eq(schema.agentRuns.id, runId));
}

// ------------------------------------------------------------------------------------------------ studio events

export interface NewStudioEvent { departmentId: DepartmentId; agentId?: string; productionId?: string; kind: string; message: string; data?: Record<string, unknown>; jobId?: string }

/** Write the event and tell every open page (the SSE channel the browser already listens to). */
export async function studioEvent(e: NewStudioEvent) {
  const at = new Date().toISOString();
  try {
    await db().insert(schema.studioEvents).values({ at, departmentId: e.departmentId, agentId: e.agentId ?? null, productionId: e.productionId ?? null, kind: e.kind, message: e.message.slice(0, 1000), data: e.data ?? null, jobId: e.jobId ?? null });
    await sql().notify('vewbox_jobs', JSON.stringify({ type: 'activity', at, departmentId: e.departmentId, agentId: e.agentId, productionId: e.productionId, kind: e.kind }));
  } catch (err) { log.warn({ err: (err as Error).message, kind: e.kind }, 'could not record a studio event'); }
}

export interface StudioEventRow { id: number; at: string; departmentId: string; agentId: string | null; productionId: string | null; kind: string; message: string; data: Record<string, unknown> | null; jobId: string | null }

export interface StudioEventQuery { limit?: number; departmentId?: string; agentId?: string; productionId?: string; since?: string; jobId?: string; /** include the bookkeeping kinds (RUN_PHASE): only the status row asks for them */ includeBookkeeping?: boolean }

/** The WHERE of an activity list. The bookkeeping kinds (src/domain/phases.ts ACTIVITY_HIDDEN_KINDS) are left out
 *  unless asked for, so no activity list shows phase noise. Pure (tested on the SQL it builds). */
export function studioEventConditions(opts: StudioEventQuery) {
  const conds = [];
  if (opts.departmentId) conds.push(eq(schema.studioEvents.departmentId, opts.departmentId));
  if (opts.agentId) conds.push(eq(schema.studioEvents.agentId, opts.agentId));
  if (opts.productionId) conds.push(eq(schema.studioEvents.productionId, opts.productionId));
  if (opts.jobId) conds.push(eq(schema.studioEvents.jobId, opts.jobId));
  if (opts.since) conds.push(gt(schema.studioEvents.at, opts.since));
  if (!opts.includeBookkeeping) conds.push(notInArray(schema.studioEvents.kind, [...ACTIVITY_HIDDEN_KINDS]));
  return conds.length ? and(...conds) : undefined;
}

export async function listStudioEvents(opts: StudioEventQuery = {}): Promise<StudioEventRow[]> {
  const rows = await db().select().from(schema.studioEvents).where(studioEventConditions(opts)).orderBy(desc(schema.studioEvents.at), desc(schema.studioEvents.id)).limit(Math.min(500, opts.limit ?? 100));
  return rows as StudioEventRow[];
}

// ------------------------------------------------------------------------------------------- reliability events

export async function reliabilityEvent(e: { job: Job; failureClass: FailureClass; failureMessage?: string; changeMade?: string }) {
  await db().insert(schema.reliabilityEvents).values({ id: nid('rel'), jobId: e.job.id, jobType: e.job.type, productionId: e.job.productionId ?? null, shotId: e.job.shotId ?? null, attempt: e.job.attempts, failureClass: e.failureClass, failureMessage: e.failureMessage?.slice(0, 2000) ?? null, changeMade: e.changeMade ?? null, resolved: false, createdAt: new Date().toISOString() });
}

/** A later successful attempt resolves the open events of its job. */
export async function resolveReliability(jobId: string, changeMade: string) {
  await db().update(schema.reliabilityEvents).set({ resolved: true, changeMade: dsql`coalesce(${schema.reliabilityEvents.changeMade}, ${changeMade})` }).where(and(eq(schema.reliabilityEvents.jobId, jobId), eq(schema.reliabilityEvents.resolved, false)));
}

// ------------------------------------------------------------------------------------------- handoffs, QA, approvals

export interface NewHandoff { productionId: string; stage: PipelineStage; producerDepartment: DepartmentId; receiverDepartment?: DepartmentId; artifactIds: string[]; inputVersions?: Record<string, string | number>; outputVersions?: Record<string, string | number>; validation: { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }; remainingDependencies?: string[]; jobId?: string }

/** `h.id`: a deterministic id (a job's output, src/server/jobs/outputs.ts) makes the record idempotent — a retried
 *  attempt that hands the same thing over again writes nothing new. */
export async function recordHandoff(h: NewHandoff & { id?: string }): Promise<string> {
  const id = h.id ?? nid('handoff');
  const rows = await db().insert(schema.handoffs).values({ id, productionId: h.productionId, stage: h.stage, producerDepartment: h.producerDepartment, receiverDepartment: h.receiverDepartment ?? null, artifactIds: h.artifactIds, inputVersions: h.inputVersions ?? {}, outputVersions: h.outputVersions ?? {}, validation: h.validation, qualityStatus: h.validation.ok ? 'VALIDATED' : 'INVALID', remainingDependencies: h.remainingDependencies ?? [], jobId: h.jobId ?? null, createdAt: new Date().toISOString() }).onConflictDoNothing({ target: schema.handoffs.id }).returning({ id: schema.handoffs.id });
  if (!rows.length) return id;
  await studioEvent({ departmentId: h.producerDepartment, productionId: h.productionId, kind: h.validation.ok ? 'HANDOFF' : 'HANDOFF_INVALID', message: `${h.stage} ${h.validation.ok ? 'handed to' : 'NOT handed to'} ${h.receiverDepartment ?? 'the production'}: ${h.validation.checks.filter((c) => !c.ok).map((c) => c.name).join(', ') || `${h.validation.checks.length} checks passed`}`, data: { handoffId: id, stage: h.stage, artifacts: h.artifactIds.length }, jobId: h.jobId });
  return id;
}

export interface NewQaReport { productionId?: string; subjectKind: 'TAKE' | 'CUT' | 'EXPORT' | 'CHARACTER' | 'LOCATION' | 'SONG' | 'LINE'; subjectId: string; inspectorId: string; checks: Array<{ name: string; ok: boolean; value?: string | number; threshold?: string | number; detail?: string }>; failureClass?: FailureClass; decision: 'ACCEPT' | 'REJECT' | 'REVIEW'; evidenceAssetIds?: string[]; notes?: string; jobId?: string }

/** A QA report's row. Inside a result commit (the take's batch, src/server/studio/engine.ts `also`) it is inserted in
 *  the commit's transaction; `id` deterministic makes a retry write nothing new. */
export async function insertQaReport(tx: Pick<ReturnType<typeof db>, 'insert'>, r: NewQaReport & { id?: string }): Promise<{ id: string; created: boolean }> {
  const id = r.id ?? nid('qa');
  const rows = await tx.insert(schema.qaReports).values({ id, productionId: r.productionId ?? null, subjectKind: r.subjectKind, subjectId: r.subjectId, inspectorId: r.inspectorId, checks: r.checks, failureClass: r.failureClass ?? null, decision: r.decision, evidenceAssetIds: r.evidenceAssetIds ?? [], notes: r.notes ?? null, jobId: r.jobId ?? null, createdAt: new Date().toISOString() }).onConflictDoNothing({ target: schema.qaReports.id }).returning({ id: schema.qaReports.id });
  return { id, created: rows.length > 0 };
}

/** The activity a recorded QA report announces. */
export async function announceQaReport(id: string, r: NewQaReport): Promise<void> {
  const inspector = agentById(r.inspectorId);
  const failed = r.checks.filter((c) => !c.ok);
  await studioEvent({ departmentId: 'QA', agentId: r.inspectorId, productionId: r.productionId, kind: `QA_${r.decision}`, message: `${inspector?.name ?? r.inspectorId}: ${r.subjectKind.toLowerCase()} ${r.decision === 'ACCEPT' ? 'accepted' : r.decision === 'REJECT' ? 'rejected' : 'sent to review'}${failed.length ? ` (${failed.map((c) => c.name).join(', ')})` : ` (${r.checks.length} checks)`}`, data: { reportId: id, subjectId: r.subjectId, failureClass: r.failureClass }, jobId: r.jobId });
}

export async function recordQaReport(r: NewQaReport & { id?: string }): Promise<string> {
  const { id, created } = await fenced('QA report', (tx) => insertQaReport(tx, r));
  if (created) await announceQaReport(id, r);
  return id;
}

/** `subjectHash`/`subjectVersion`: what was approved (src/domain/approvals.ts) and the studio version then (step 9). */
export async function recordApproval(a: { productionId: string; stage: PipelineStage; subjectKind: string; subjectId: string; decision: 'APPROVED' | 'REJECTED' | 'CHANGES'; by: string; note?: string; subjectHash?: string; subjectVersion?: number }): Promise<string> {
  const id = nid('appr');
  await db().insert(schema.approvals).values({ id, ...a, note: a.note ?? null, subjectHash: a.subjectHash ?? null, subjectVersion: a.subjectVersion ?? null, createdAt: new Date().toISOString() });
  await studioEvent({ departmentId: 'EXECUTIVE', productionId: a.productionId, kind: `APPROVAL_${a.decision}`, message: `${a.by} ${a.decision.toLowerCase()} ${a.subjectKind.toLowerCase()} at ${a.stage}${a.note ? `: ${a.note}` : ''}`, data: { approvalId: id, subjectId: a.subjectId } });
  return id;
}

export const listHandoffs = (productionId: string) => db().select().from(schema.handoffs).where(eq(schema.handoffs.productionId, productionId)).orderBy(desc(schema.handoffs.createdAt));
export const listQaReports = (opts: { productionId?: string; subjectId?: string; limit?: number }) => {
  const conds = [];
  if (opts.productionId) conds.push(eq(schema.qaReports.productionId, opts.productionId));
  if (opts.subjectId) conds.push(eq(schema.qaReports.subjectId, opts.subjectId));
  return db().select().from(schema.qaReports).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.qaReports.createdAt)).limit(opts.limit ?? 200);
};
export const listApprovals = (productionId: string) => db().select().from(schema.approvals).where(eq(schema.approvals.productionId, productionId)).orderBy(desc(schema.approvals.createdAt));

// ------------------------------------------------------------------------------------------- pipeline positions

export type StageStatus = 'DONE' | 'AWAITING_APPROVAL' | 'REJECTED' | 'INVALID' | 'READY' | 'BLOCKED';
export interface ProductionPipeline { productionId: string; stages: Array<{ id: PipelineStage; department: DepartmentId; status: StageStatus; at: string | null; failed: string[] }> }

/** Where every production stands, from its handoffs and approvals: a human approval settles a gated stage even
 *  when the work was done by hand; a refused handoff shows as INVALID until a validated one replaces it. */
export async function pipelinePositions(productionIds: string[]): Promise<ProductionPipeline[]> {
  if (!productionIds.length) return [];
  const [handoffs, approvals] = await Promise.all([
    db().select().from(schema.handoffs).where(inArray(schema.handoffs.productionId, productionIds)).orderBy(desc(schema.handoffs.createdAt)),
    db().select().from(schema.approvals).where(inArray(schema.approvals.productionId, productionIds)).orderBy(desc(schema.approvals.createdAt)),
  ]);
  return productionIds.map((id) => {
    const hs = handoffs.filter((h) => h.productionId === id);
    const as = approvals.filter((a) => a.productionId === id);
    const stages = PIPELINE.map((s) => {
      const h = hs.find((x) => x.stage === s.id);
      const a = as.find((x) => x.stage === s.id);
      const depsDone = s.dependsOn.every((d) => hs.some((x) => x.stage === d && x.qualityStatus === 'VALIDATED'));
      const status: StageStatus = a?.decision === 'APPROVED' ? 'DONE' : a && a.decision !== 'APPROVED' ? 'REJECTED' : h ? (h.qualityStatus === 'VALIDATED' ? (s.approval ? 'AWAITING_APPROVAL' : 'DONE') : 'INVALID') : depsDone ? 'READY' : 'BLOCKED';
      return { id: s.id, department: s.department, status, at: h?.createdAt ?? null, failed: h && !h.validation.ok ? h.validation.checks.filter((c) => !c.ok).map((c) => c.name) : [] };
    });
    return { productionId: id, stages };
  });
}

/** The latest handoffs across the studio (the connections of the company diagram light up from these). */
export const recentHandoffs = (limit = 40) => db().select().from(schema.handoffs).orderBy(desc(schema.handoffs.createdAt)).limit(limit);
export const recentApprovals = (limit = 20) => db().select().from(schema.approvals).orderBy(desc(schema.approvals.createdAt)).limit(limit);

// ------------------------------------------------------------------------------------------------------ queries

export interface AgentStat { agentId: string; runs: number; completed: number; failed: number; cancelled: number; running: number; firstAttemptOk: number; firstAttempts: number; p50Ms: number | null; lastRunAt: string | null; toolCalls: number; toolFailures: number }

/** Per agent: how often it ran, how often the first attempt succeeded, median time, last run — from agent_runs only. */
export async function agentStats(hours = 24 * 30): Promise<AgentStat[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await db().execute<{ agent_id: string; runs: string; completed: string; failed: string; cancelled: string; running: string; first_ok: string; firsts: string; p50_ms: number | null; last_run_at: string | null; tool_calls: string; tool_failures: string }>(dsql`
    select agent_id, count(*) as runs,
      count(*) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as completed,
      count(*) filter (where outcome = 'FAILED') as failed,
      count(*) filter (where outcome = 'CANCELLED') as cancelled,
      count(*) filter (where outcome is null) as running,
      count(*) filter (where attempt <= 1 and outcome in ('COMPLETED','AWAITING_REVIEW')) as first_ok,
      count(*) filter (where attempt <= 1 and outcome is not null and outcome <> 'CANCELLED') as firsts,
      percentile_cont(0.5) within group (order by ms) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as p50_ms,
      max(started_at) as last_run_at,
      coalesce(sum(jsonb_array_length(tool_calls)), 0) as tool_calls,
      coalesce(sum((select count(*) from jsonb_array_elements(tool_calls) c where (c->>'ok') = 'false')), 0) as tool_failures
    from agent_runs where started_at > ${since} group by agent_id`);
  return rows.map((r) => ({ agentId: r.agent_id, runs: Number(r.runs), completed: Number(r.completed), failed: Number(r.failed), cancelled: Number(r.cancelled), running: Number(r.running), firstAttemptOk: Number(r.first_ok), firstAttempts: Number(r.firsts), p50Ms: r.p50_ms === null ? null : Number(r.p50_ms), lastRunAt: r.last_run_at, toolCalls: Number(r.tool_calls), toolFailures: Number(r.tool_failures) }));
}

export interface AgentRunRow { id: string; agentId: string; departmentId: string; jobId: string; jobType: string; attempt: number; productionId: string | null; shotId: string | null; startedAt: string; finishedAt: string | null; outcome: string | null; failureClass: string | null; errorMessage: string | null; toolCalls: ToolCall[]; ms: number | null; costUsd: number | null; /** a delegated step: the run of the job it belongs to, and what the step did */ parentRunId: string | null; purpose: string | null; agentVersion: string | null; orgVersion: number | null; versions: RunVersions | null; /** the run's phases as timed events (B9) */ phases: RunPhaseEvent[] }

export async function listAgentRuns(opts: { agentId?: string; departmentId?: string; productionId?: string; jobId?: string; limit?: number }): Promise<AgentRunRow[]> {
  const conds = [];
  if (opts.agentId) conds.push(eq(schema.agentRuns.agentId, opts.agentId));
  if (opts.departmentId) conds.push(eq(schema.agentRuns.departmentId, opts.departmentId));
  if (opts.productionId) conds.push(eq(schema.agentRuns.productionId, opts.productionId));
  if (opts.jobId) conds.push(eq(schema.agentRuns.jobId, opts.jobId));
  const rows = await db().select().from(schema.agentRuns).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.agentRuns.startedAt)).limit(Math.min(500, opts.limit ?? 50));
  return rows as AgentRunRow[];
}

export interface ReliabilitySummary {
  hours: number;
  firstAttemptTechnical: { ok: number; total: number };
  firstAttemptCreative: { accepted: number; total: number };
  retryRate: { retried: number; jobs: number };
  failureClasses: Array<{ failureClass: string; count: number; resolved: number }>;
  perAcceptedShot: { takes: number; acceptedTakes: number; meanMsPerAccepted: number | null; meanAttemptsPerAccepted: number | null; costUsdPerAccepted: number | null };
  qa: { reports: number; rejected: number; review: number };
  exports: { ok: number; total: number };
  openEvents: Array<{ id: string; jobId: string; jobType: string; productionId: string | null; shotId: string | null; attempt: number; failureClass: string; failureMessage: string | null; changeMade: string | null; resolved: boolean; createdAt: string }>;
}

/** The reliability dashboard, from agent runs, reliability events, QA reports and job rows. */
export async function reliabilitySummary(hours = 24 * 7): Promise<ReliabilitySummary> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const [tech] = await db().execute<{ ok: string; total: string }>(dsql`select count(*) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as ok, count(*) as total from agent_runs where attempt <= 1 and outcome is not null and outcome <> 'CANCELLED' and started_at > ${since}`);
  // creative acceptance: first-attempt takes whose first QA report accepted them
  const [creative] = await db().execute<{ accepted: string; total: string }>(dsql`
    select count(*) filter (where q.decision = 'ACCEPT') as accepted, count(*) as total
    from agent_runs r join lateral (select decision from qa_reports where subject_kind = 'TAKE' and job_id = r.job_id order by created_at asc limit 1) q on true
    where r.job_type = 'GENERATE_TAKE' and r.attempt <= 1 and r.started_at > ${since}`);
  const [retry] = await db().execute<{ retried: string; jobs: string }>(dsql`select count(*) filter (where attempts > 1) as retried, count(*) as jobs from jobs where created_at > ${since} and status in ('COMPLETED','FAILED','AWAITING_REVIEW')`);
  const classes = await db().execute<{ failure_class: string; count: string; resolved: string }>(dsql`select failure_class, count(*) as count, count(*) filter (where resolved) as resolved from reliability_events where created_at > ${since} group by failure_class order by count desc`);
  const [shots] = await db().execute<{ takes: string; accepted: string; mean_ms: number | null; mean_attempts: number | null; cost: number | null }>(dsql`
    select count(*) as takes,
      count(*) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as accepted,
      avg(ms) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as mean_ms,
      avg(attempt) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as mean_attempts,
      avg(cost_usd) filter (where outcome in ('COMPLETED','AWAITING_REVIEW')) as cost
    from agent_runs where job_type = 'GENERATE_TAKE' and started_at > ${since}`);
  const [qa] = await db().execute<{ reports: string; rejected: string; review: string }>(dsql`select count(*) as reports, count(*) filter (where decision = 'REJECT') as rejected, count(*) filter (where decision = 'REVIEW') as review from qa_reports where created_at > ${since}`);
  const [exp] = await db().execute<{ ok: string; total: string }>(dsql`select count(*) filter (where outcome = 'COMPLETED') as ok, count(*) as total from agent_runs where job_type = 'EXPORT' and outcome is not null and started_at > ${since}`);
  const open = await db().select().from(schema.reliabilityEvents).where(gt(schema.reliabilityEvents.createdAt, since)).orderBy(desc(schema.reliabilityEvents.createdAt)).limit(50);
  return {
    hours,
    firstAttemptTechnical: { ok: Number(tech?.ok ?? 0), total: Number(tech?.total ?? 0) },
    firstAttemptCreative: { accepted: Number(creative?.accepted ?? 0), total: Number(creative?.total ?? 0) },
    retryRate: { retried: Number(retry?.retried ?? 0), jobs: Number(retry?.jobs ?? 0) },
    failureClasses: classes.map((c) => ({ failureClass: c.failure_class, count: Number(c.count), resolved: Number(c.resolved) })),
    perAcceptedShot: { takes: Number(shots?.takes ?? 0), acceptedTakes: Number(shots?.accepted ?? 0), meanMsPerAccepted: shots?.mean_ms === null || shots?.mean_ms === undefined ? null : Number(shots.mean_ms), meanAttemptsPerAccepted: shots?.mean_attempts === null || shots?.mean_attempts === undefined ? null : Number(shots.mean_attempts), costUsdPerAccepted: shots?.cost === null || shots?.cost === undefined ? null : Number(shots.cost) },
    qa: { reports: Number(qa?.reports ?? 0), rejected: Number(qa?.rejected ?? 0), review: Number(qa?.review ?? 0) },
    exports: { ok: Number(exp?.ok ?? 0), total: Number(exp?.total ?? 0) },
    openEvents: open as ReliabilitySummary['openEvents'],
  };
}
