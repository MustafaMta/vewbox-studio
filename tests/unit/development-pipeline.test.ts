import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobType } from '@/domain/jobs';
import type { IdeaProposal, StudioState } from '@/domain/types';
import type { DevelopmentArtifact } from '@/server/development/artifacts';
import type { ResearchStore } from '@/server/research/store';

/** THE AUTO IDEA PIPELINE, end to end in process: the real orchestrator and the real stage handlers, each running as
 *  its agent through the real tool runner (allow-list and typed contracts enforced), with a fake queue whose children
 *  run at once, a memory artifact and research store, the network mocked (GDELT, Wikimedia, Wikidata) and the language
 *  model scripted per agent. Checks: the eight stages, keys and parents; the dossier (coverage in priority order,
 *  sources, traced patterns, the originality refusal, both reviews, the one revision); research off; research failing;
 *  a stage failing; a restart adopting what exists; an Iraqi show; a season continuing its show. */

const fake = vi.hoisted(() => ({
  state: null as unknown as StudioState,
  jobs: new Map<string, Job & { key?: string }>(),
  enqueued: [] as Array<{ type: string; key?: string; parentId?: string; created: boolean }>,
  artifacts: [] as Array<DevelopmentArtifact<Record<string, unknown>>>,
  proposals: [] as Array<{ id: string; jobId: string; request: unknown; proposal: IdeaProposal }>,
  handoffs: [] as Array<{ productionId: string; stage: string; artifactIds: string[]; validation: { ok: boolean; checks: Array<{ name: string; ok: boolean }> }; outputVersions?: Record<string, unknown> }>,
  activities: [] as Array<{ agent: string; kind: string; message: string }>,
  llm: [] as Array<{ agent: string; system: string; user: string; temperature?: number }>,
  fetches: [] as string[],
  currentIdea: '',
  researchStore: null as unknown as ResearchStore,
  answers: {} as Record<string, (user: string) => unknown>,
}));

vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: fake.state, version: 1, hash: 'h' }) }));
vi.mock('@/server/db/client', async () => {
  const schema = await import('@/server/db/schema');
  const db = () => ({
    select: () => ({ from: (t: unknown) => ({ where: async () => (t === schema.proposals ? fake.proposals.filter((p) => p.jobId === fake.currentIdea) : []) }) }),
    insert: (t: unknown) => ({ values: async (row: (typeof fake.proposals)[number]) => { if (t === schema.proposals) fake.proposals.push(structuredClone(row)); } }),
  });
  return { db, schema, sql: () => ({ notify: async () => undefined }) };
});
vi.mock('@/server/development/artifacts', () => ({
  saveArtifact: async (a: { ideaJobId: string; stage: string; agentId: string; jobId?: string; content: Record<string, unknown> }) => {
    const mine = fake.artifacts.filter((x) => x.ideaJobId === a.ideaJobId && x.stage === a.stage);
    const same = a.jobId ? mine.find((x) => x.jobId === a.jobId) : undefined;
    if (same) return same;
    const row = { id: `dev-${fake.artifacts.length + 1}`, ideaJobId: a.ideaJobId, stage: a.stage, version: mine.length + 1, agentId: a.agentId, jobId: a.jobId, content: structuredClone(a.content), createdAt: new Date(1_800_000_000_000 + fake.artifacts.length).toISOString() };
    fake.artifacts.push(row as DevelopmentArtifact<Record<string, unknown>>);
    return row;
  },
  artifactOfJob: async (ideaJobId: string, stage: string, jobId: string) => fake.artifacts.find((x) => x.ideaJobId === ideaJobId && x.stage === stage && x.jobId === jobId),
  loadArtifact: async (id: string) => fake.artifacts.find((x) => x.id === id),
  loadArtifacts: async (ids: string[]) => fake.artifacts.filter((x) => ids.includes(x.id)),
  artifactsOf: async (ideaJobId: string) => fake.artifacts.filter((x) => x.ideaJobId === ideaJobId),
}));
vi.mock('@/server/research/store', async (orig) => ({ ...(await orig<typeof import('@/server/research/store')>()), dbStore: () => fake.researchStore }));
vi.mock('@/server/org/runs', async (orig) => ({
  ...(await orig<typeof import('@/server/org/runs')>()),
  recordHandoff: async (h: (typeof fake.handoffs)[number]) => { fake.handoffs.push(h); return 'handoff'; },
  recordToolCall: async () => undefined, studioEvent: async () => undefined,
}));
vi.mock('@/server/providers/llm', () => ({
  json: async (schema: { parse: (v: unknown) => unknown }, messages: Array<{ role: string; content: string }>, opts: { temperature?: number }) => {
    const system = messages[0].content; const user = messages[1].content;
    const agent = /YOUR ROLE: ([^—]+) —/.exec(system)?.[1].trim() ?? 'unknown';
    fake.llm.push({ agent, system, user, temperature: opts.temperature });
    const answer = fake.answers[agent]?.(user);
    if (answer instanceof Error) throw answer;
    return { data: schema.parse(answer), result: { text: '', provider: 'openai-compatible', model: 'fake', ms: 1 }, attempts: 1 };
  },
}));
vi.mock('@/server/jobs/queue', async () => {
  const { JOB_PAYLOADS } = await import('@/domain/jobs');
  const run = async (job: Job & { key?: string }) => {
    const handlers = await import('@/worker/handlers/development');
    const table: Partial<Record<JobType, (ctx: never) => Promise<unknown>>> = { IDEA_RESEARCH: handlers.ideaResearch, IDEA_AUDIENCE: handlers.ideaAudience, IDEA_CONCEPTS: handlers.ideaConcepts, IDEA_WRITE: handlers.ideaWrite, IDEA_REVIEW: handlers.ideaReview };
    const { agentForJob, classifyFailure } = await import('@/server/org/runs');
    const { makeToolRunner } = await import('@/server/org/tools');
    const agent = agentForJob(job);
    const log = { info() {}, warn() {}, error() {}, debug() {}, child() { return log; } } as never;
    const ctx = { job, log, workerId: 'w', agent, runId: `run-${job.id}`, tool: makeToolRunner(agent, `run-${job.id}`, log), activity: async (kind: string, message: string) => { fake.activities.push({ agent: agent.id, kind, message }); }, checkpoint: async () => {}, progress: async (_s: string, p: Job['progress']) => { job.progress = p; }, event: async () => {}, gpu: async () => undefined };
    job.attempts += 1;
    try { const result = await table[job.type]!(ctx as never) as Record<string, unknown>; fake.jobs.set(job.id, { ...job, status: 'COMPLETED', result, error: undefined }); }
    catch (e) { const err = e as Error & { code?: string }; fake.jobs.set(job.id, { ...job, status: 'FAILED', error: { code: err.code ?? 'ERROR', message: err.message, details: { failureClass: classifyFailure(e) } } }); }
  };
  return {
    enqueue: async (input: { type: JobType; payload: Record<string, unknown>; idempotencyKey?: string; parentId?: string; maxAttempts?: number }) => {
      const existing = [...fake.jobs.values()].find((j) => j.key && j.key === input.idempotencyKey);
      fake.enqueued.push({ type: input.type, key: input.idempotencyKey, parentId: input.parentId, created: !existing });
      if (existing) return { job: existing, created: false };
      const payload = (JOB_PAYLOADS[input.type] as unknown as { parse: (v: unknown) => Record<string, unknown> }).parse(input.payload);
      const job: Job & { key?: string } = { id: `${input.type.toLowerCase()}-${fake.jobs.size + 1}`, type: input.type, status: 'QUEUED', priority: 1, payload, attempts: 0, maxAttempts: input.maxAttempts ?? 2, cancelRequested: false, parentId: input.parentId, createdAt: 'x', updatedAt: 'x', key: input.idempotencyKey };
      fake.jobs.set(job.id, job);
      await run(job);
      return { job: fake.jobs.get(job.id)!, created: true };
    },
    getJob: async (id: string) => fake.jobs.get(id),
    retry: async (id: string) => { const j = fake.jobs.get(id)!; await run({ ...j, status: 'QUEUED', error: undefined }); return fake.jobs.get(id)!; },
    recordMetric: async () => undefined,
  };
});

import { seed } from '@/domain/sample';
import { RESEARCH_PLATFORMS } from '@/domain/development';
import { autoIdea, DEVELOPMENT_TIMING } from '@/worker/handlers/development';
import { memoryStore } from '@/server/research/store';
import { GDELT_TIMING } from '@/server/research/providers/gdelt';
import { resetSpacing } from '@/server/research/http';
import { AGENTS } from '@/server/org/model';
import { makeToolRunner } from '@/server/org/tools';
import type { HandlerContext } from '@/worker/handlers';

DEVELOPMENT_TIMING.pollMs = 0;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function network() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url); fake.fetches.push(u);
    if (u.includes('api.gdeltproject.org')) return json({ articles: [{ url: `https://news.example/${fake.fetches.length}`, title: `Festival news ${fake.fetches.length}`, seendate: '20261002T120000Z', domain: 'news.example' }] });
    if (u.includes('/metrics/pageviews/top/')) return json({ items: [{ articles: [{ article: 'Main_Page', views: 1, rank: 1 }, { article: 'Some_Film', views: 238832, rank: 9 }, { article: 'Long_Show', views: 97669, rank: 27 }] }] });
    if (u.includes('query.wikidata.org')) return json({ results: { bindings: [{ title: { value: 'Some Film' }, class: { value: 'http://www.wikidata.org/entity/Q11424' } }, { title: { value: 'Long Show' }, class: { value: 'http://www.wikidata.org/entity/Q5398426' } }] } });
    throw new Error(`unexpected fetch ${u}`);
  }));
}

// ---------------------------------------------------------------------------------------- the scripted model

const audience = (user: string) => ({
  audience: 'Adults who like quiet mysteries',
  patterns: user.includes('NO EVIDENCE')
    ? [{ kind: 'HOOK', pattern: 'Open on a question', evidenceIds: [], interpretation: 'craft', confidence: 'MEDIUM' }, { kind: 'EMOTION', pattern: 'One person to care about', evidenceIds: [], interpretation: 'craft', confidence: 'LOW' }, { kind: 'ENDING', pattern: 'Pay off the opening', evidenceIds: [], interpretation: 'craft', confidence: 'LOW' }]
    : [
      { kind: 'HOOK', pattern: 'Open on an unanswered question', evidenceIds: ['E3'], measured: 'E3: 238832 pageviews on 2026-10-02', interpretation: 'Mystery films hold attention', confidence: 'HIGH' },
      { kind: 'PACING', pattern: 'Few, full scenes', evidenceIds: ['E4', 'E99'], measured: '2.4M views', interpretation: 'Series watchers binge', confidence: 'HIGH' },
      { kind: 'EMOTION', pattern: 'One person to care about', evidenceIds: [], interpretation: 'craft', confidence: 'MEDIUM' },
    ],
  cautions: ['Reading is not watching.'],
});
const concepts = () => ({
  concepts: [
    { title: 'Some Film', logline: 'A copy of what is trending.', hook: 'A door opens.', whyItWorks: 'P1', patternIds: ['P1'], originalityNote: 'none', risks: 'copying', score: 9 },
    { title: 'The Night Ledger', logline: 'A night clerk finds a ledger that lists tomorrow’s guests.', hook: 'A pen writes by itself in an empty lobby.', whyItWorks: 'An unanswered question in the first shot (P1); one person to care about (P3).', patternIds: ['P1', 'P3'], originalityNote: 'A hotel ledger as a clock', risks: 'Slow middle', score: 8 },
    { title: 'Salt and Static', logline: 'A radio host hears her own voice on a station that closed.', hook: 'Static says her name.', whyItWorks: 'P1', patternIds: ['P1'], originalityNote: 'new', risks: 'abstract', score: 6 },
  ],
  chosen: 1,
  rationale: 'The first is the strongest.',
});
const draft = (over: Record<string, unknown> = {}) => ({
  title: 'The Night Ledger', logline: 'A night clerk finds a ledger that lists tomorrow’s guests.', premise: 'Mina works nights at a small hotel. The ledger on the desk lists guests who have not arrived yet — and tonight it lists her.',
  genre: 'Mystery', mood: 'Quiet, uncanny', hook: 'A pen writes by itself in an empty lobby.', ending: 'Mina signs her own name and the front door opens.',
  structure: [{ title: 'The empty lobby', summary: 'A pen writes by itself; Mina watches.' }, { title: 'Tomorrow’s guests', summary: 'She reads the names.' }, { title: 'Her name', summary: 'She signs.' }],
  cast: [{ name: 'Mina', role: 'Night clerk', sex: 'FEMALE', ageYears: 29, appearance: 'A tired woman in a navy blazer.' }],
  locations: [{ name: 'Hotel lobby', description: 'A small lobby at night.', kind: 'INTERIOR' }],
  sampleLines: [{ speaker: 'Mina', line: 'Who wrote this?' }],
  ...over,
});
const editor = (verdict = 'APPROVE', major = true) => ({ scores: { OPENING: 4, CLARITY: 4, ENDING: 3 }, issues: major ? [{ criterion: 'ENDING', severity: 'MAJOR', where: 'ending', note: 'The ending is ambiguous.', fix: 'Show what the signature does.' }] : [], verdict, summary: 'Close.' });
const viewer = () => ({ scores: { OPENING: 5, CURIOSITY: 4 }, issues: [], verdict: 'APPROVE', summary: 'It holds.' });

beforeEach(() => {
  fake.state = seed(); fake.jobs.clear(); fake.enqueued = []; fake.artifacts = []; fake.proposals = []; fake.handoffs = []; fake.activities = []; fake.llm = []; fake.fetches = [];
  fake.researchStore = memoryStore();
  resetSpacing(); GDELT_TIMING.spacingMs = 0;
  network();
  fake.answers = {
    'Audience Research Agent': audience, 'Creative Concept Agent': concepts,
    Screenwriter: (user) => (user.includes('REVISE draft') ? draft({ ending: 'Mina signs; the ledger’s next page is blank — the guests were never coming.', answered: ['#1: the ending now shows what the signature does'] }) : draft()),
    'Story Editor': () => editor(), 'Audience Experience Agent': viewer,
  };
});

const head = AGENTS.find((a) => a.id === 'head-of-story')!;
const log = { info() {}, warn() {}, error() {}, debug() {}, child() { return log; } } as unknown as HandlerContext['log'];
function ideaCtx(payload: Record<string, unknown>, id = 'idea-1'): HandlerContext {
  fake.currentIdea = id;
  const job = { id, type: 'AUTO_IDEA', status: 'PREPARING', priority: 0, payload, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x' } as Job;
  fake.jobs.set(id, job);
  return { job, log, workerId: 'w', agent: head, runId: 'run-idea', tool: makeToolRunner(head, 'run-idea', log), activity: async (kind, message) => { fake.activities.push({ agent: head.id, kind, message }); }, checkpoint: async () => {}, progress: async () => {}, event: async () => {}, gpu: (async () => undefined) as unknown as HandlerContext['gpu'] };
}
const run = (ctx: HandlerContext) => autoIdea(ctx) as Promise<{ proposalId: string; title: string; steps: Array<{ stage: string; status: string; reason?: string; failureClass?: string }> }>;

describe('AUTO_IDEA: an English short with research', () => {
  it('runs the eight stages as keyed child jobs of their agents and writes the proposal with its dossier', async () => {
    const r = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN', style: 'REALISTIC', genre: 'mystery', durationSeconds: 60 } }));
    expect(r.steps.map((s) => [s.stage, s.status])).toEqual([['RESEARCH', 'done'], ['AUDIENCE', 'done'], ['CONCEPTS', 'done'], ['WRITING', 'done'], ['EDITING', 'done'], ['AUDIENCE_REVIEW', 'done'], ['REVISION', 'done'], ['PROPOSAL', 'done']]);
    expect(fake.enqueued.map((e) => [e.type, e.key, e.parentId])).toEqual([
      ['IDEA_RESEARCH', 'idea:idea-1:RESEARCH:1', 'idea-1'], ['IDEA_AUDIENCE', 'idea:idea-1:AUDIENCE:1', 'idea-1'], ['IDEA_CONCEPTS', 'idea:idea-1:CONCEPTS:1', 'idea-1'], ['IDEA_WRITE', 'idea:idea-1:WRITING:1', 'idea-1'],
      ['IDEA_REVIEW', 'idea:idea-1:EDITING:1', 'idea-1'], ['IDEA_REVIEW', 'idea:idea-1:AUDIENCE_REVIEW:1', 'idea-1'], ['IDEA_WRITE', 'idea:idea-1:REVISION:1', 'idea-1'],
    ]);
    // each stage ran as its own agent (the reviews split by the payload route)
    expect(fake.artifacts.map((a) => [a.stage, a.agentId])).toEqual([['RESEARCH', 'trend-research'], ['AUDIENCE', 'audience-research'], ['CONCEPTS', 'creative-concept'], ['WRITING', 'screenwriter'], ['EDITING', 'story-editor'], ['AUDIENCE_REVIEW', 'audience-experience'], ['REVISION', 'screenwriter']]);
    expect(fake.llm.map((c) => [c.agent, c.temperature])).toEqual([['Audience Research Agent', 0.3], ['Creative Concept Agent', 0.9], ['Screenwriter', 0.8], ['Story Editor', 0.2], ['Audience Experience Agent', 0.2], ['Screenwriter', 0.6]]);

    const [row] = fake.proposals;
    expect(r).toMatchObject({ proposalId: row.id, title: 'The Night Ledger' });
    const p = row.proposal; const d = p.development!;
    expect(p).toMatchObject({ sample: false, language: 'EN', style: 'REALISTIC', durationSeconds: 60 });
    // research: every platform in priority order, honest on this machine's access
    expect(d.research.coverage.map((c) => [c.platform, c.status])).toEqual([['TIKTOK', 'NOT_CONFIGURED'], ['INSTAGRAM', 'NOT_CONFIGURED'], ['FACEBOOK', 'UNSUPPORTED'], ['YOUTUBE', 'NOT_CONFIGURED'], ['NEWS', 'OK'], ['WIKIPEDIA', 'OK']]);
    expect(d.research.status).toBe('PARTIAL');
    expect(d.sources!.every((s) => /^https:\/\//.test(s.url) && s.retrievedAt)).toBe(true);
    expect(d.sources!.find((s) => s.title === 'Some Film')).toMatchObject({ metrics: { pageviews: 238832, rank: 9, periodDays: 1 } });
    // patterns: the traced measurement stays; the invented one is removed and downgraded; the unknown citation dropped
    const [p1, p2, p3] = d.analysis!.patterns;
    expect(p1).toMatchObject({ measured: 'E3: 238832 pageviews on 2026-10-02', confidence: 'HIGH' });
    expect(d.sources!.find((s) => s.id === p1.evidenceIds[0])!.title).toBe('Some Film');
    expect(p2).toMatchObject({ measured: undefined, confidence: 'MEDIUM', evidenceIds: [expect.any(String)] });
    expect(p3.limitations).toMatch(/Craft knowledge/);
    expect(d.analysis!.cautions.join(' ')).toMatch(/reach/);
    // concepts: the writer's pick copied a researched title — refused, never chosen; the rationale names its patterns
    expect(d.concepts!.originality.map((o) => o.ok)).toEqual([false, true, true]);
    expect(d.concepts!.chosenId).toBe('C2');
    expect(d.concepts!.rationale).toMatch(/“Some Film” was the writer's pick but failed the originality check/);
    expect(d.concepts!.rationale).toMatch(/P1|P3/);
    // two reviews of draft 1: the editor's MAJOR issue turned its APPROVE into REVISE → one revision, answered
    expect(d.reviews.map((x) => [x.reviewer, x.verdict, x.draft])).toEqual([['STORY_EDITOR', 'REVISE', 1], ['AUDIENCE_EXPERIENCE', 'APPROVE', 1]]);
    expect(d).toMatchObject({ revisions: 1, revisionNotes: ['#1: the ending now shows what the signature does'], strategy: 'SHORT_FOCUSED', format: 'SHORT', hook: 'A pen writes by itself in an empty lobby.' });
    expect(d.ending).toMatch(/never coming/);
    expect(d.steps.at(-1)).toMatchObject({ stage: 'PROPOSAL', status: 'done' });
    // handoffs: one per stage, then the proposal; every check passes
    expect(fake.handoffs.map((h) => h.outputVersions?.stage ?? 'PROPOSAL')).toEqual(['RESEARCH', 'AUDIENCE', 'CONCEPTS', 'WRITING', 'EDITING', 'AUDIENCE_REVIEW', 'REVISION', 'PROPOSAL']);
    expect(fake.handoffs.every((h) => h.productionId === 'idea-1' && h.stage === 'STORY' && h.validation.ok)).toBe(true);
    expect(fake.activities.at(-1)).toMatchObject({ kind: 'IDEA_PROPOSED' });
  });
  it('a restart after the proposal is written returns it; nothing runs again', async () => {
    const first = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN' } }));
    const queued = fake.enqueued.length; const calls = fake.llm.length;
    const again = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN' } }));
    expect(again.proposalId).toBe(first.proposalId);
    expect(fake.enqueued.length).toBe(queued); expect(fake.llm.length).toBe(calls);
  });
});

describe('AUTO_IDEA: research off, research failing, a stage failing', () => {
  it('research off: no source is called, DISABLED, an explicitly original concept on craft; both approve → no revision', async () => {
    fake.answers['Story Editor'] = () => editor('APPROVE', false);
    const r = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN', research: 'OFF' } }));
    expect(fake.fetches).toEqual([]);
    expect(r.steps[0]).toMatchObject({ stage: 'RESEARCH', status: 'skipped', reason: 'research was switched off for this request' });
    expect(r.steps.find((s) => s.stage === 'REVISION')).toMatchObject({ status: 'skipped', reason: 'both reviewers approved draft 1 with no major issue' });
    const d = fake.proposals[0].proposal.development!;
    expect(d.research.status).toBe('DISABLED');
    expect(d.research.coverage.map((c) => c.platform)).toEqual([...RESEARCH_PLATFORMS]);
    expect(d.note).toBe('Original concept — no trend research was used.');
    expect(d.analysis!.basis).toBe('CRAFT_ONLY');
    expect(d.revisions).toBe(0);
    expect(fake.llm[0].user).toMatch(/NO EVIDENCE was reachable/);
  });
  it('Settings switch research off the same way', async () => {
    fake.state.settings.research = { enabled: false };
    const r = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN' } }));
    expect(r.steps[0]).toMatchObject({ status: 'skipped', reason: 'research is switched off in Settings' });
  });
  it('research failing never fails the idea: UNAVAILABLE is recorded with the reason and the idea continues original', async () => {
    fake.researchStore.saveRun = async () => { throw new Error('ENOSPC: no space left on device'); };
    const r = await run(ideaCtx({ kind: 'SHORT', preferences: { language: 'EN' } }));
    expect(r.steps[0]).toMatchObject({ stage: 'RESEARCH', status: 'failed', failureClass: 'RESOURCE_EXHAUSTION', reason: expect.stringMatching(/research unavailable, continuing with an original concept: ENOSPC/) });
    const d = fake.proposals[0].proposal.development!;
    expect(d.research.status).toBe('UNAVAILABLE');
    expect(d.note).toMatch(/Original concept — research was unavailable/);
    expect(r.steps.at(-1)).toMatchObject({ stage: 'PROPOSAL', status: 'done' });
  });
  it('any other stage failing fails the idea with that stage’s class; a retry adopts what was done and re-runs only the failed stage', async () => {
    fake.answers['Creative Concept Agent'] = () => Object.assign(new Error('ollama qwen3:14b: HTTP 500'), { name: 'StudioError', code: 'PROVIDER' });
    const ctx = ideaCtx({ kind: 'SHORT', preferences: { language: 'EN' } });
    const err = await run(ctx).catch((e) => e);
    expect(err).toMatchObject({ code: 'PROVIDER', failureClass: 'PROVIDER', details: { stage: 'CONCEPTS' } });
    expect((err.details.steps as Array<{ stage: string; status: string }>).map((s) => [s.stage, s.status])).toEqual([['RESEARCH', 'done'], ['AUDIENCE', 'done'], ['CONCEPTS', 'failed']]);
    expect(fake.proposals).toEqual([]);
    // the model is back: the retry adopts research and audience by their keys and runs the concepts stage again
    fake.answers['Creative Concept Agent'] = concepts;
    const calls = fake.llm.filter((c) => c.agent === 'Audience Research Agent').length;
    const r = await run(ctx);
    expect(r.steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done']);
    expect(fake.enqueued.filter((e) => !e.created).map((e) => e.key)).toEqual(['idea:idea-1:RESEARCH:1', 'idea:idea-1:AUDIENCE:1', 'idea:idea-1:CONCEPTS:1']);
    expect(fake.llm.filter((c) => c.agent === 'Audience Research Agent').length).toBe(calls);
    expect(fake.artifacts.filter((a) => a.stage === 'RESEARCH')).toHaveLength(1);
    // a stage an earlier attempt finished is not handed off a second time
    expect(fake.handoffs.map((h) => h.outputVersions?.stage ?? 'PROPOSAL')).toEqual(['RESEARCH', 'AUDIENCE', 'CONCEPTS', 'WRITING', 'EDITING', 'AUDIENCE_REVIEW', 'REVISION', 'PROPOSAL']);
  });
});

describe('AUTO_IDEA: language and continuity', () => {
  it('an Iraqi cartoon show: researched in Iraq in Arabic words; a draft written in English is sent back once and comes back in Baghdadi Arabic with its gloss', async () => {
    fake.answers.Screenwriter = (user) => (user.includes('REVISE draft')
      ? draft({ title: 'Tea at Dawn', titleAr: 'چاي الفجر', logline: 'جدة بغدادية تعلّم حفيدها شلون يخدر الچاي', premise: 'كل فجر، الجدة أم علي تصعد للسطح وياه حفيدها. هسه الولد يريد يتعلم شلون يخدر الچاي مثلها.', structure: [{ title: 'السطح', summary: 'الجدة تشعل السماور' }, { title: 'الاستكان', summary: 'الولد يكسر الاستكان' }, { title: 'الچاي', summary: 'يخدرون الچاي سوية' }], hook: 'استكان ينكسر قبل الفجر', ending: 'الولد يخدر أول چاي إله', gloss: { title: 'Tea at Dawn', logline: 'A Baghdadi grandmother teaches her grandson to brew tea', premise: 'Every dawn…', hook: 'A tea glass breaks before dawn', ending: 'The boy brews his first tea' }, sampleLines: [{ speaker: 'Um Ali', line: 'يمعود دير بالك على الاستكان', gloss: 'Careful with the glass, dear' }], answered: ['#1: rewritten in Baghdadi Arabic'] })
      : draft({ title: 'Tea at Dawn', logline: 'A grandmother teaches her grandson to brew tea', premise: 'Every dawn, on a Baghdad roof, a grandmother and her grandson brew tea.' }));
    fake.answers['Story Editor'] = () => editor('APPROVE', false);
    const r = await run(ideaCtx({ kind: 'SHOW', preferences: { language: 'AR', dialect: 'IRAQI_BAGHDADI', style: 'CARTOON', genre: 'family comedy' } }));
    expect(fake.fetches.some((u) => u.includes('sourcelang%3Aarabic'))).toBe(true);
    expect(fake.fetches.some((u) => u.includes('/top/ar.wikipedia/'))).toBe(true);
    const writer = fake.llm.find((c) => c.agent === 'Screenwriter')!;
    expect(writer.user).toMatch(/BAGHDADI ARABIC FROM THE FIRST WORD/);
    expect(writer.user).toMatch(/SHOW_SERIAL|NEW SHOW \(serial\)/);
    const d = fake.proposals[0].proposal.development!;
    expect(d.reviews[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ criterion: 'DIALOGUE', severity: 'MAJOR', source: 'CODE' })]));
    expect(r.steps.find((s) => s.stage === 'REVISION')!.status).toBe('done');
    const p = fake.proposals[0].proposal;
    expect(p).toMatchObject({ language: 'AR', dialect: 'IRAQI_BAGHDADI', title: 'Tea at Dawn', titleAr: 'چاي الفجر', logline: 'جدة بغدادية تعلّم حفيدها شلون يخدر الچاي' });
    expect(d).toMatchObject({ dialect: 'IRAQI_BAGHDADI', gloss: { title: 'Tea at Dawn', hook: 'A tea glass breaks before dawn' } });
  });
  it('a season continues its show: the show’s genre is researched, its history and regulars are in the prompts, its language is kept', async () => {
    const show = fake.state.shows.find((x) => x.id === 'last-sip')!;
    show.bible = { unresolved: ['Karim still owes eleven teas'], timeline: ['S2E1: Layla took over the café'] };
    fake.answers.Screenwriter = () => draft({ title: 'The Ledger Season', titleAr: 'موسم الدفتر', logline: 'كريم لازم يدفع دينه', premise: 'كريم بعده مديون بإحدعش استكان، وليلى تدير المقهى.', cast: [{ existingCharacterId: 'karim', name: 'Karim', role: 'Poet' }], locations: [{ existingLocationId: 'cafe', name: 'The café', description: 'x' }], gloss: { premise: 'Karim still owes eleven teas; Layla runs the café.' } });
    fake.answers['Story Editor'] = () => editor('APPROVE', false);
    await run(ideaCtx({ kind: 'SEASON', showId: 'last-sip', preferences: { language: 'EN', genre: 'horror' } }));
    // research follows the show's own genre (Comedy), never the preference of the day
    expect(fake.fetches.some((u) => u.includes('comedy%20series'))).toBe(true);
    expect(fake.fetches.some((u) => u.includes('horror'))).toBe(false);
    const concept = fake.llm.find((c) => c.agent === 'Creative Concept Agent')!;
    expect(concept.user).toMatch(/SHOW CONTEXT/); expect(concept.user).toMatch(/Karim still owes eleven teas/); expect(concept.user).toMatch(/never restart the show/);
    const p = fake.proposals[0].proposal;
    expect(p).toMatchObject({ language: 'AR', dialect: 'IRAQI_BAGHDADI', style: 'CARTOON' });
    expect(p.cast.filter((c) => c.characterId).map((c) => c.characterId)).toEqual(expect.arrayContaining(['karim', 'abu-samir', 'layla', 'the-cat']));
    expect(p.development!.strategy).toBe('SEASON_CONTINUATION');
    expect(p.development!.reviews[0].issues.filter((i) => i.criterion === 'CONTINUITY')).toEqual([]);
  });
});
