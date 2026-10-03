import type { Handler, HandlerContext } from './index';
import { RESEARCH_PLATFORMS, emptyRun, stagePhase, type AudienceAnalysis, type ConceptSet, type DevelopmentStage, type DevelopmentStep, type ResearchItem, type ResearchRunSummary, type StoryReview } from '@/domain/development';
import { isTerminalStatus, type Job, type JobPayloadParsed, type JobType } from '@/domain/jobs';
import type { IdeaProposal } from '@/domain/types';
import { StudioError, asStudioErrorCode } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue, getJob, recordMetric, retry } from '@/server/jobs/queue';
import { readState } from '@/server/studio/engine';
import { recordHandoff } from '@/server/org/runs';
import type { LlmResult } from '@/server/providers/llm';
import { artifactOfJob, artifactsOf, loadArtifact, loadArtifacts, saveArtifact, type DevelopmentArtifact } from '@/server/development/artifacts';
import { getResearchItems, planTopics, querySource, storeEvidence, type ResearchRequest, type SourceResult } from '@/server/research';
import { ideaContext, type IdeaRequest } from '@/server/story/development/context';
import { analyseAudience, developConcepts, reviewDraft, writeDraft, type DraftContent } from '@/server/story/development/engine';
import { needsRevision } from '@/server/story/development/rubric';
import { buildDossier } from '@/server/story/development/dossier';
import { stageChecks, type BasedOn } from '@/server/story/development/checks';

/** THE RESEARCH-DRIVEN AUTO IDEA (docs/CONTRACTS-AUTO-IDEA.md §1). AUTO_IDEA is the Head of Story's orchestration: each
 *  stage is a durable child job (parent = the AUTO_IDEA job, key `idea:${ideaJobId}:${stage}:1`, so a restart adopts
 *  what is queued and never runs a stage twice) that runs as its own agent and writes one versioned artifact:
 *
 *    RESEARCH (Trend Research Agent) → AUDIENCE (Audience Research Agent) → CONCEPTS (Creative Concept Agent) →
 *    WRITING (Screenwriter) → EDITING (Story Editor) → AUDIENCE_REVIEW (Audience Experience Agent) → at most one
 *    REVISION (Screenwriter) → PROPOSAL (Head of Story: the proposal with its development dossier).
 *
 *  Research failing never fails the idea (an UNAVAILABLE record, then an original concept); any other stage failing
 *  fails the idea with that stage's class. Progress is the running child's own message, never a timer. */

const metric = (jobId: string, r: LlmResult) => recordMetric('llm.ms', r.ms, 'ms', { provider: r.provider, model: r.model, in: r.inputTokens ?? 0, out: r.outputTokens ?? 0 }, jobId);

/** How the orchestrator waits on a stage: it polls the child and gives up after a wall-clock bound (the chain keeps
 *  running; a retry of the idea adopts it). Mutable for tests. */
export const DEVELOPMENT_TIMING = { pollMs: 3000, timeoutMs: 90 * 60_000 };

const STAGE_JOB: Record<Exclude<DevelopmentStage, 'PROPOSAL'>, JobType> = { RESEARCH: 'IDEA_RESEARCH', AUDIENCE: 'IDEA_AUDIENCE', CONCEPTS: 'IDEA_CONCEPTS', WRITING: 'IDEA_WRITE', EDITING: 'IDEA_REVIEW', AUDIENCE_REVIEW: 'IDEA_REVIEW', REVISION: 'IDEA_WRITE' };
const STAGE_LABEL: Record<DevelopmentStage, string> = { RESEARCH: 'Researching what audiences watch', AUDIENCE: 'Analysing the audience', CONCEPTS: 'Developing three concepts', WRITING: 'Writing the first draft', EDITING: 'The story editor is reading draft 1', AUDIENCE_REVIEW: 'Reviewing draft 1 as the audience', REVISION: 'Revising once on the reviews', PROPOSAL: 'Assembling the proposal' };
const ORDER: DevelopmentStage[] = ['RESEARCH', 'AUDIENCE', 'CONCEPTS', 'WRITING', 'EDITING', 'AUDIENCE_REVIEW', 'REVISION', 'PROPOSAL'];

interface Chain { deadline: number; boundMs: number; children: string[] }

/** Queue one stage as a child (or adopt the child an earlier attempt queued under the same key) and wait for it. An
 *  adopted child that FAILED or was CANCELLED is run again, so a retry of the idea makes progress. */
async function runChild(ctx: HandlerContext, chain: Chain, stage: Exclude<DevelopmentStage, 'PROPOSAL'>, payload: Record<string, unknown>): Promise<{ job: Job; adopted: boolean }> {
  const type = STAGE_JOB[stage];
  const req = { type, payload, parentId: ctx.job.id, idempotencyKey: `idea:${ctx.job.id}:${stage}:1`, priority: 1, maxAttempts: 2 };
  const r = await ctx.tool('jobs.enqueue', () => enqueue(req), { label: `${stage} ${type}`, input: req });
  let job = r.job;
  // a stage an earlier attempt finished: its result stands, and its handoff was already recorded
  const adopted = !r.created && job.status === 'COMPLETED';
  chain.children.push(job.id);
  if (!r.created) {
    await ctx.event('info', `${stage}: adopted job ${job.id} (${job.status})`, { stage, jobId: job.id, status: job.status });
    if (job.status === 'FAILED' || job.status === 'CANCELLED') {
      const before = job.status;
      job = await retry(job.id).catch(async () => (await getJob(job.id)) ?? job);
      await ctx.event('info', `${stage}: the earlier ${type} ${job.id} had ${before.toLowerCase()}; running it again`, { stage, jobId: job.id });
    }
  }
  const index = ORDER.indexOf(stage);
  for (;;) {
    await ctx.checkpoint();
    if (isTerminalStatus(job.status) || job.status === 'AWAITING_REVIEW') return { job, adopted };
    if (Date.now() > chain.deadline) throw new StudioError('UNAVAILABLE', `The ${stage.toLowerCase().replace('_', ' ')} stage did not finish within ${Math.round(chain.boundMs / 60_000)} min (${type} ${job.id} is still ${job.status.toLowerCase()}); it keeps running — retry the idea to pick it up.`, { failureClass: 'INFRASTRUCTURE', stage, childJobId: job.id, children: [...chain.children] });
    await ctx.progress('GENERATING', { phase: stagePhase(stage), message: `${STAGE_LABEL[stage]}${job.progress?.message && job.progress.message !== STAGE_LABEL[stage] ? `: ${job.progress.message}` : ''}`, step: index + 1, total: ORDER.length, percent: null });
    await new Promise((res) => setTimeout(res, DEVELOPMENT_TIMING.pollMs));
    job = (await getJob(job.id)) ?? job;
  }
}

const failureOf = (job: Job) => (job.error?.details?.failureClass as string | undefined) ?? (job.status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN');

/** The AUTO_IDEA job's request, and the idea's context as the studio is now. */
async function loadIdea(ideaJobId: string) {
  const parent = await getJob(ideaJobId);
  if (!parent || parent.type !== 'AUTO_IDEA') throw new StudioError('NOT_FOUND', `The Auto Idea ${ideaJobId} this stage belongs to was not found.`, { failureClass: 'INVALID_INPUT' });
  const request = parent.payload as unknown as IdeaRequest;
  const { state } = await readState();
  return { request, state, c: ideaContext(state, ideaJobId, request) };
}

async function mustLoad<T>(id: string | undefined, stage: DevelopmentStage): Promise<DevelopmentArtifact<T & { basedOn?: BasedOn }>> {
  const a = id ? await loadArtifact<T & { basedOn?: BasedOn }>(id) : undefined;
  if (!a || a.stage !== stage) throw new StudioError('NOT_FOUND', `The ${stage.toLowerCase()} artifact ${id ?? '(none)'} was not found.`, { failureClass: 'INCONSISTENT_PLAN' });
  return a;
}

async function evidenceOf(researchArtifactId: string | undefined): Promise<{ run?: ResearchRunSummary; items: ResearchItem[] }> {
  if (!researchArtifactId) return { items: [] };
  const a = await loadArtifact<{ run: ResearchRunSummary }>(researchArtifactId);
  const run = a?.content.run;
  return { run, items: run?.itemIds.length ? await getResearchItems(run.itemIds) : [] };
}

// --------------------------------------------------------------------------------------- AUTO_IDEA (orchestrator)

export const autoIdea: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'AUTO_IDEA'>;
  const ideaJobId = ctx.job.id;
  const chain: Chain = { deadline: Date.now() + DEVELOPMENT_TIMING.timeoutMs, boundMs: DEVELOPMENT_TIMING.timeoutMs, children: [] };
  const steps: DevelopmentStep[] = [];
  // a proposal an earlier attempt already wrote is the result
  const [written] = await db().select().from(schema.proposals).where(eq(schema.proposals.jobId, ideaJobId));
  if (written) return { proposalId: written.id, title: written.proposal.title, steps: written.proposal.development?.steps ?? [] };
  const { state } = await readState();
  const c = ideaContext(state, ideaJobId, payload);
  const handoff = async (stage: DevelopmentStage, artifactId: string) => {
    const a = await loadArtifact(artifactId);
    if (!a) return;
    const research = stage === 'AUDIENCE' ? await evidenceOf((a.content as { basedOn?: BasedOn }).basedOn?.researchArtifactId) : undefined;
    const checks = stageChecks(stage, a.content, { language: c.language, itemIds: research?.run?.itemIds });
    // the idea has no production yet: its handoffs are keyed by the idea's job id
    await recordHandoff({ productionId: ideaJobId, stage: 'STORY', producerDepartment: 'STORY', receiverDepartment: 'STORY', artifactIds: [artifactId], outputVersions: { stage, version: a.version, agent: a.agentId }, validation: { ok: checks.every((x) => x.ok), checks }, jobId: ctx.job.id });
  };
  const must = async (stage: Exclude<DevelopmentStage, 'PROPOSAL' | 'RESEARCH'>, p: Record<string, unknown>): Promise<string> => {
    const { job, adopted } = await runChild(ctx, chain, stage, p);
    const artifactId = job.result?.artifactId as string | undefined;
    if (job.status !== 'COMPLETED' || !artifactId) {
      steps.push({ stage, status: 'failed', jobId: job.id, reason: job.error?.message ?? job.status.toLowerCase(), failureClass: failureOf(job) });
      await ctx.activity('IDEA_STAGE_FAILED', `${STAGE_LABEL[stage]} failed: ${(job.error?.message ?? job.status).slice(0, 160)}`, { stage, jobId: job.id });
      throw new StudioError(asStudioErrorCode(job.error?.code), `The ${stage.toLowerCase().replace('_', ' ')} stage failed: ${job.error?.message ?? job.status.toLowerCase()}`, { failureClass: failureOf(job), stage, childJobId: job.id, steps });
    }
    steps.push({ stage, status: 'done', jobId: job.id, artifactId });
    if (!adopted) await handoff(stage, artifactId);
    return artifactId;
  };

  // 1) RESEARCH — off for this request or in Settings: skipped, an explicitly original concept; failed: recorded as
  //    UNAVAILABLE and the idea continues on craft
  let researchArtifactId: string;
  let researchAdopted = false;
  const off = payload.preferences.research === 'OFF' ? 'research was switched off for this request' : state.settings.research?.enabled === false ? 'research is switched off in Settings' : undefined;
  if (off) {
    const a = await saveArtifact({ ideaJobId, stage: 'RESEARCH', agentId: ctx.agent.id, jobId: ctx.job.id, content: { run: emptyRun(`none-${ideaJobId}`, 'DISABLED', `Original concept — ${off}.`) } });
    researchArtifactId = a.id;
    steps.push({ stage: 'RESEARCH', status: 'skipped', artifactId: a.id, reason: off });
  } else {
    const { job, adopted } = await runChild(ctx, chain, 'RESEARCH', { ideaJobId, kind: payload.kind, refresh: payload.refresh });
    researchAdopted = adopted;
    const artifactId = job.result?.artifactId as string | undefined;
    if (job.status === 'COMPLETED' && artifactId) {
      researchArtifactId = artifactId;
      steps.push({ stage: 'RESEARCH', status: 'done', jobId: job.id, artifactId });
    } else {
      const why = job.error?.message ?? job.status.toLowerCase();
      const a = await saveArtifact({ ideaJobId, stage: 'RESEARCH', agentId: ctx.agent.id, jobId: ctx.job.id, content: { run: emptyRun(`none-${ideaJobId}`, 'UNAVAILABLE', why) } });
      researchArtifactId = a.id;
      steps.push({ stage: 'RESEARCH', status: 'failed', jobId: job.id, artifactId: a.id, reason: `research unavailable, continuing with an original concept: ${why}`, failureClass: failureOf(job) });
      await ctx.event('warn', `research failed (${failureOf(job)}): ${why}; continuing with an original concept`, { childJobId: job.id });
    }
  }
  if (!researchAdopted) await handoff('RESEARCH', researchArtifactId);
  if (!researchAdopted) await ctx.activity('IDEA_STAGE_DONE', `Research ${steps[0].status}${steps[0].reason ? ` (${steps[0].reason.slice(0, 120)})` : ''}`, { stage: 'RESEARCH', artifactId: researchArtifactId });

  // 2)–6) the stages that must succeed
  const audienceArtifactId = await must('AUDIENCE', { ideaJobId, researchArtifactId });
  const conceptsArtifactId = await must('CONCEPTS', { ideaJobId, audienceArtifactId });
  const draftArtifactId = await must('WRITING', { ideaJobId, conceptsArtifactId });
  const editing = await must('EDITING', { ideaJobId, draftArtifactId, reviewer: 'STORY_EDITOR' });
  const audienceReview = await must('AUDIENCE_REVIEW', { ideaJobId, draftArtifactId, reviewer: 'AUDIENCE_EXPERIENCE' });

  // 7) REVISION — at most once, only when a reviewer asks for it; the revision is not re-reviewed in a loop
  const reviews = (await loadArtifacts([editing, audienceReview])).map((a) => a.content as unknown as StoryReview);
  if (needsRevision(reviews)) await must('REVISION', { ideaJobId, conceptsArtifactId, draftArtifactId, reviewArtifactIds: [editing, audienceReview] });
  else steps.push({ stage: 'REVISION', status: 'skipped', reason: 'both reviewers approved draft 1 with no major issue' });

  // 8) PROPOSAL — the final draft with its dossier, for the producer to edit before anything is made
  await ctx.progress('POSTPROCESSING', { phase: stagePhase('PROPOSAL'), message: STAGE_LABEL.PROPOSAL, step: ORDER.length, total: ORDER.length, percent: null });
  const arts = await artifactsOf(ideaJobId);
  const as = <T,>(a: DevelopmentArtifact | undefined) => a as unknown as DevelopmentArtifact<T>;
  const research = as<{ run: ResearchRunSummary }>(arts.find((a) => a.id === researchArtifactId));
  // this attempt's chain only: the drafts and reviews of the artifacts it produced
  const drafts = arts.filter((a) => (a.stage === 'WRITING' && a.id === draftArtifactId) || (a.stage === 'REVISION' && steps.some((s) => s.artifactId === a.id))).map((a) => as<DraftContent>(a));
  const reviewArts = arts.filter((a) => a.id === editing || a.id === audienceReview).map((a) => as<StoryReview>(a));
  const final = [...drafts].sort((a, b) => b.content.draft - a.content.draft)[0];
  const proposalId = nid('proposal');
  steps.push({ stage: 'PROPOSAL', status: 'done', reason: `proposal ${proposalId}` });
  const items = research.content.run.itemIds.length ? await getResearchItems(research.content.run.itemIds) : [];
  const dossier = buildDossier({ c, research, items, audience: as<AudienceAnalysis>(arts.find((a) => a.id === audienceArtifactId)), concepts: as<ConceptSet>(arts.find((a) => a.id === conceptsArtifactId)), drafts, reviews: reviewArts, steps });
  const proposal: IdeaProposal = { ...final.content.proposal, development: dossier };
  await db().insert(schema.proposals).values({ id: proposalId, jobId: ideaJobId, request: payload, proposal, createdAt: new Date().toISOString() });
  const checks = [
    { name: 'research-recorded', ok: dossier.research.coverage.length === RESEARCH_PLATFORMS.length, detail: `${dossier.research.status}: ${dossier.research.itemIds.length} source(s)` },
    { name: 'analysis-traceable', ok: Boolean(dossier.analysis?.patterns.every((p) => !p.measured || p.evidenceIds.length)) },
    { name: 'concept-original', ok: Boolean(dossier.concepts?.originality.find((o) => o.conceptId === dossier.concepts?.chosenId)?.ok) },
    { name: 'both-reviews-present', ok: dossier.reviews.length === 2 },
    { name: 'revised-at-most-once', ok: dossier.revisions <= 1, detail: `${dossier.revisions} revision(s)` },
  ];
  await recordHandoff({ productionId: ideaJobId, stage: 'STORY', producerDepartment: 'STORY', receiverDepartment: 'STORY', artifactIds: dossier.artifacts.map((a) => a.artifactId), outputVersions: { proposal: proposalId, drafts: drafts.length, revisions: dossier.revisions }, validation: { ok: checks.every((x) => x.ok), checks }, jobId: ctx.job.id });
  await ctx.activity('IDEA_PROPOSED', `Proposed ${payload.kind.toLowerCase().replace('_', ' ')}: “${proposal.title}” — research ${dossier.research.status.toLowerCase()}, ${dossier.reviews.length} review(s), ${dossier.revisions} revision(s)`, { proposalId, steps });
  return { proposalId, title: proposal.title, steps };
};

// --------------------------------------------------------------------------------- 1. IDEA_RESEARCH (Trend Research)

export const ideaResearch: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'IDEA_RESEARCH'>;
  const prior = await artifactOfJob<{ run: ResearchRunSummary }>(p.ideaJobId, 'RESEARCH', ctx.job.id);
  if (prior) return { artifactId: prior.id, runId: prior.content.run.id, status: prior.content.run.status, items: prior.content.run.itemIds.length, reused: true };
  const { request, state, c } = await loadIdea(p.ideaJobId);
  const settings = state.settings.research;
  const req: ResearchRequest = { ideaJobId: p.ideaJobId, jobId: ctx.job.id, kind: c.kind, language: c.language, dialect: c.dialect, style: c.style, preferences: request.preferences ?? {}, brief: c.brief, show: c.show, refresh: p.refresh };
  const startedAt = new Date().toISOString();
  await ctx.progress('GENERATING', { phase: 'research', message: 'Planning the research topics', step: 0, total: RESEARCH_PLATFORMS.length, percent: null });
  const topics = await ctx.tool('research.plan_topics', async () => planTopics(req), { label: 'topics', input: { ideaJobId: p.ideaJobId, kind: c.kind, language: c.language, dialect: c.dialect, style: c.style, genre: c.genre, show: c.show?.title, refresh: Boolean(p.refresh) } });
  await ctx.event('info', `topics: ${topics.map((t) => `${t.query} → ${t.platforms.join('/')}`).join(' · ')}`, { topics });
  const results: SourceResult[] = [];
  for (const [i, platform] of RESEARCH_PLATFORMS.entries()) {
    await ctx.checkpoint();
    await ctx.progress('GENERATING', { phase: 'research', message: `Checking ${platform.toLowerCase()}`, step: i + 1, total: RESEARCH_PLATFORMS.length, percent: null });
    const r = await ctx.tool('research.query_source', () => querySource(platform, topics, { kind: c.kind, refresh: p.refresh, settings, event: (m, d) => ctx.event('info', m, d), progress: (m) => ctx.progress('GENERATING', { phase: 'research', message: m, step: i + 1, total: RESEARCH_PLATFORMS.length, percent: null }) }), { label: platform, input: { platform, topics, refresh: Boolean(p.refresh) } });
    results.push(r);
    await ctx.event(r.coverage.status === 'FAILED' || r.coverage.status === 'RATE_LIMITED' ? 'warn' : 'info', `${platform}: ${r.coverage.status} — ${r.coverage.detail}`, { coverage: r.coverage });
  }
  const run = await ctx.tool('research.store_evidence', () => storeEvidence({ request: req, topics, results, startedAt }), { label: 'evidence', input: { ideaJobId: p.ideaJobId, platforms: results.map((r) => r.coverage.platform), items: results.reduce((a, r) => a + r.items.length, 0) } });
  const a = await saveArtifact({ ideaJobId: p.ideaJobId, stage: 'RESEARCH', agentId: ctx.agent.id, jobId: ctx.job.id, content: { run } });
  await ctx.activity('RESEARCH_DONE', `Research ${run.status.toLowerCase()}: ${run.itemIds.length} source(s) — ${run.coverage.map((x) => `${x.platform} ${x.status}`).join(', ')}`, { runId: run.id, artifactId: a.id, status: run.status });
  return { artifactId: a.id, runId: run.id, status: run.status, items: run.itemIds.length };
};

// ------------------------------------------------------------------------------- 2. IDEA_AUDIENCE (Audience Research)

export const ideaAudience: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'IDEA_AUDIENCE'>;
  const prior = await artifactOfJob<AudienceAnalysis>(p.ideaJobId, 'AUDIENCE', ctx.job.id);
  if (prior) return { artifactId: prior.id, patterns: prior.content.patterns.length, basis: prior.content.basis, reused: true };
  const { c } = await loadIdea(p.ideaJobId);
  await mustLoad<{ run: ResearchRunSummary }>(p.researchArtifactId, 'RESEARCH');
  const { run, items } = await evidenceOf(p.researchArtifactId);
  await ctx.progress('GENERATING', { phase: 'audience', message: items.length ? `Reading ${items.length} source(s) for the audience` : 'No research evidence: drawing on storytelling craft', percent: null });
  const r = await ctx.tool('story.structured_answer', () => analyseAudience(c, run!, items, { agentId: ctx.agent.id, jobId: ctx.job.id, onResult: (x) => void metric(ctx.job.id, x).catch(() => undefined) }), { label: 'audience', input: { task: 'audience-analysis', ideaJobId: p.ideaJobId, kind: c.kind } });
  await ctx.checkpoint();
  if (r.downgraded) await ctx.event('warn', `${r.downgraded} pattern(s) downgraded to interpretation only: their numbers are not in the cited sources' metrics`);
  if (r.droppedRefs) await ctx.event('warn', `${r.droppedRefs} citation(s) of evidence that does not exist were dropped`);
  const a = await saveArtifact({ ideaJobId: p.ideaJobId, stage: 'AUDIENCE', agentId: ctx.agent.id, jobId: ctx.job.id, content: { ...r.analysis, basedOn: { researchArtifactId: p.researchArtifactId } } });
  await ctx.activity('AUDIENCE_ANALYSED', `Audience: ${r.analysis.audience.slice(0, 120)} — ${r.analysis.patterns.length} pattern(s) on ${r.analysis.basis === 'EVIDENCE' ? `${items.length} source(s)` : 'storytelling craft'}`, { artifactId: a.id, basis: r.analysis.basis });
  return { artifactId: a.id, patterns: r.analysis.patterns.length, basis: r.analysis.basis, downgraded: r.downgraded };
};

// ------------------------------------------------------------------------------ 3. IDEA_CONCEPTS (Creative Concept)

export const ideaConcepts: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'IDEA_CONCEPTS'>;
  const prior = await artifactOfJob<ConceptSet>(p.ideaJobId, 'CONCEPTS', ctx.job.id);
  if (prior) return { artifactId: prior.id, chosenId: prior.content.chosenId, reused: true };
  const { c } = await loadIdea(p.ideaJobId);
  const audience = await mustLoad<AudienceAnalysis>(p.audienceArtifactId, 'AUDIENCE');
  const { items } = await evidenceOf(audience.content.basedOn?.researchArtifactId);
  await ctx.progress('GENERATING', { phase: 'concepts', message: `Developing three concepts on ${audience.content.patterns.length} pattern(s)`, percent: null });
  const set = await ctx.tool('story.structured_answer', () => developConcepts(c, audience.content, items, { agentId: ctx.agent.id, jobId: ctx.job.id, onResult: (x) => void metric(ctx.job.id, x).catch(() => undefined) }), { label: 'concepts', input: { task: 'concepts', ideaJobId: p.ideaJobId, kind: c.kind } });
  await ctx.checkpoint();
  for (const o of set.originality.filter((x) => !x.ok)) await ctx.event('warn', `concept ${o.conceptId} refused by the originality check: ${o.note}`);
  const a = await saveArtifact({ ideaJobId: p.ideaJobId, stage: 'CONCEPTS', agentId: ctx.agent.id, jobId: ctx.job.id, content: { ...set, basedOn: { researchArtifactId: audience.content.basedOn?.researchArtifactId, audienceArtifactId: audience.id } } });
  const chosen = set.concepts.find((x) => x.id === set.chosenId)!;
  await ctx.activity('CONCEPTS_DEVELOPED', `Three concepts; chosen “${chosen.gloss?.title ?? chosen.title}”`, { artifactId: a.id, chosenId: set.chosenId });
  return { artifactId: a.id, chosenId: set.chosenId, title: chosen.title };
};

// ------------------------------------------------------------------------------ 4./7. IDEA_WRITE (Screenwriter)

export const ideaWrite: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'IDEA_WRITE'>;
  const stage: DevelopmentStage = p.draftArtifactId ? 'REVISION' : 'WRITING';
  const prior = await artifactOfJob<DraftContent>(p.ideaJobId, stage, ctx.job.id);
  if (prior) return { artifactId: prior.id, draft: prior.content.draft, title: prior.content.proposal.title, reused: true };
  const { c, state } = await loadIdea(p.ideaJobId);
  const concepts = await mustLoad<ConceptSet>(p.conceptsArtifactId, 'CONCEPTS');
  const concept = concepts.content.concepts.find((x) => x.id === concepts.content.chosenId);
  if (!concept) throw new StudioError('NOT_FOUND', 'The chosen concept is missing from its artifact.', { failureClass: 'INCONSISTENT_PLAN' });
  const audience = await mustLoad<AudienceAnalysis>(concepts.content.basedOn?.audienceArtifactId, 'AUDIENCE');
  let revise: { draft: DraftContent; reviews: StoryReview[] } | undefined;
  if (p.draftArtifactId) {
    const draft = await mustLoad<DraftContent>(p.draftArtifactId, 'WRITING');
    const reviews = (await loadArtifacts(p.reviewArtifactIds ?? [])).map((x) => x.content as unknown as StoryReview);
    revise = { draft: draft.content, reviews };
  }
  await ctx.progress('GENERATING', { phase: stagePhase(stage), message: revise ? `Revising draft ${revise.draft.draft} on ${revise.reviews.reduce((n, r) => n + r.issues.length, 0)} note(s)` : `Writing “${concept.gloss?.title ?? concept.title}”`, percent: null });
  const draft = await ctx.tool('story.structured_answer', () => writeDraft(state, c, { concept, analysis: audience.content, revise }, { agentId: ctx.agent.id, jobId: ctx.job.id, onResult: (x) => void metric(ctx.job.id, x).catch(() => undefined) }), { label: revise ? 'revision' : 'draft', input: { task: 'idea-draft', ideaJobId: p.ideaJobId, kind: c.kind } });
  await ctx.checkpoint();
  const basedOn: BasedOn = { researchArtifactId: concepts.content.basedOn?.researchArtifactId, audienceArtifactId: audience.id, conceptsArtifactId: concepts.id, draftArtifactId: p.draftArtifactId, reviewArtifactIds: p.reviewArtifactIds };
  const a = await saveArtifact({ ideaJobId: p.ideaJobId, stage, agentId: ctx.agent.id, jobId: ctx.job.id, content: { ...draft, basedOn } });
  await ctx.activity(revise ? 'IDEA_REVISED' : 'IDEA_DRAFTED', `${revise ? 'Revised' : 'Drafted'} “${draft.proposal.title}” (draft ${draft.draft})${draft.answered ? ` — ${draft.answered.length} note(s) answered` : ''}`, { artifactId: a.id, draft: draft.draft });
  return { artifactId: a.id, draft: draft.draft, title: draft.proposal.title };
};

// --------------------------------------------------------------- 5./6. IDEA_REVIEW (Story Editor / Audience Experience)

export const ideaReview: Handler = async (ctx) => {
  const p = ctx.job.payload as JobPayloadParsed<'IDEA_REVIEW'>;
  const stage: DevelopmentStage = p.reviewer === 'STORY_EDITOR' ? 'EDITING' : 'AUDIENCE_REVIEW';
  const prior = await artifactOfJob<StoryReview>(p.ideaJobId, stage, ctx.job.id);
  if (prior) return { artifactId: prior.id, verdict: prior.content.verdict, reused: true };
  const { c } = await loadIdea(p.ideaJobId);
  const draft = await mustLoad<DraftContent>(p.draftArtifactId, 'WRITING');
  const { items } = await evidenceOf(draft.content.basedOn?.researchArtifactId);
  await ctx.progress('GENERATING', { phase: stagePhase(stage), message: p.reviewer === 'AUDIENCE_EXPERIENCE' ? `Reviewing draft ${draft.content.draft} as the audience` : `Story editor reading draft ${draft.content.draft}`, percent: null });
  const review = await ctx.tool('story.structured_answer', () => reviewDraft(c, draft.content, p.reviewer, items, { agentId: ctx.agent.id, jobId: ctx.job.id, onResult: (x) => void metric(ctx.job.id, x).catch(() => undefined) }), { label: p.reviewer, input: { task: 'idea-review', ideaJobId: p.ideaJobId, kind: c.kind } });
  await ctx.checkpoint();
  const a = await saveArtifact({ ideaJobId: p.ideaJobId, stage, agentId: ctx.agent.id, jobId: ctx.job.id, content: { ...review, basedOn: { draftArtifactId: draft.id, researchArtifactId: draft.content.basedOn?.researchArtifactId } } });
  const major = review.issues.filter((i) => i.severity === 'MAJOR').length;
  await ctx.activity('IDEA_REVIEWED', `${p.reviewer === 'STORY_EDITOR' ? 'Story editor' : 'Audience experience'}: ${review.verdict} draft ${review.draft} — ${review.issues.length} issue(s), ${major} major`, { artifactId: a.id, verdict: review.verdict });
  return { artifactId: a.id, verdict: review.verdict, issues: review.issues.length, major };
};
