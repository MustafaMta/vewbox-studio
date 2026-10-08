import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStatus } from '@/domain/jobs';
import type { Production, StudioState, Take } from '@/domain/types';

/** PRODUCE with the pilot gate (P1, docs/research/MINIMAX-CONTINUITY.md §3.9), over a fake queue whose GENERATE_TAKE
 *  jobs finish at once with a scripted outcome: the first shot of every unproven scene is generated alone and must
 *  pass before the scene's other shots are queued; a failed pilot stops its scene only; a continuation is queued only
 *  after the take it continues was accepted; a continuation gets no opening frame. */

type Outcome = 'pass' | 'reject' | 'fail' | 'review' | 'slow';
const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, jobs: new Map<string, Job>(), byKey: new Map<string, string>(), order: [] as string[], outcome: {} as Record<string, Outcome>, imagesReady: false, events: [] as string[], world: [] as string[] }));

vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: fake.state, version: 1, hash: 'h' }) }));
vi.mock('@/server/org/gates', () => ({ requireApproval: async () => { fake.world.push('story-gate'); } }));
// the World Bible: approved cuts register what they establish, then the production is pinned — before any job
vi.mock('@/server/world', () => ({
  establishApprovedCuts: async () => { fake.world.push('establish'); return [{ productionId: 'prod-earlier', added: 2, reason: '2 frame(s) established' }]; },
  ensurePin: async () => { fake.world.push(`pin:${fake.jobs.size}`); return { view: { revision: { number: 4 }, pinned: true }, action: 'PINNED', message: 'pinned to World Bible revision 4 at the story\'s approval', blocking: [] }; },
}));
vi.mock('@/server/providers/comfy', () => ({ health: async () => ({ ok: fake.imagesReady }), listModels: async () => ['qwen_image_2512_fp8_e4m3fn.safetensors'] }));
vi.mock('@/server/jobs/queue', () => ({
  listJobs: async () => [],
  getJob: async (id: string) => fake.jobs.get(id),
  enqueue: async (input: { type: Job['type']; payload: { productionId: string; shotId?: string }; idempotencyKey?: string }) => {
    // the real queue: an idempotency key it has seen returns that job
    if (input.idempotencyKey && fake.byKey.has(input.idempotencyKey)) return { job: fake.jobs.get(fake.byKey.get(input.idempotencyKey)!)!, created: false };
    const id = `job-${fake.jobs.size + 1}`;
    if (input.idempotencyKey) fake.byKey.set(input.idempotencyKey, id);
    const shotId = input.payload.shotId;
    fake.order.push(`${input.type}${shotId ? `:${shotId}` : ''}`);
    let status: JobStatus = 'COMPLETED'; let result: Record<string, unknown> | undefined; let error: Job['error'];
    if (input.type === 'GENERATE_TAKE' && shotId) {
      const o = fake.outcome[shotId] ?? 'pass';
      if (o === 'fail') { status = 'FAILED'; error = { code: 'INVALID', message: 'Preflight failed' }; }
      else if (o === 'slow') status = 'GENERATING';
      else {
        const take: Take = { id: `take-${shotId}`, label: 'Take 1', assetId: 'vid-a', createdAt: 'x', status: o === 'reject' ? 'REJECTED' : 'READY', provider: 'MINIMAX', qa: { ok: o !== 'reject', checks: [{ name: 'decodable', ok: o !== 'reject' }] }, rejectionReason: o === 'reject' ? 'Automatic checks failed: script-spoken' : undefined };
        fake.state = { ...fake.state, productions: fake.state.productions.map((p) => (p.id !== input.payload.productionId ? p : { ...p, shots: p.shots.map((s) => (s.id !== shotId ? s : { ...s, takes: [...s.takes, take], selectedTakeId: o === 'pass' ? take.id : s.selectedTakeId })) })) };
        result = { takeId: take.id, qaOk: o !== 'reject', takeUnverified: o === 'review', awaitingReview: o === 'review' };
        if (o === 'review') status = 'AWAITING_REVIEW';
      }
    }
    const job = { id, type: input.type, status, priority: 0, payload: input.payload, result, error, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x', shotId } as Job;
    fake.jobs.set(id, job);
    return { job, created: true };
  },
}));

import { planPilots, pilotVerdict, produce as producePass, takeAccepted } from '@/worker/handlers/produce';
import { waitRequestOf } from '@/worker/handlers/wait';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** PRODUCE is a planner (step 14): each pass queues what is ready and ends WAITING for it; the queue wakes it when its
 *  children settle. Here the fake children settle at once, so the next pass runs straight away — as the worker would
 *  run it once woken (the plan carried over, a wake counted). Returns the final result and the number of passes. */
let passes = 0;
async function produce(c: Parameters<typeof producePass>[0]) {
  passes = 0;
  for (;;) {
    passes++;
    const r = await producePass(c);
    const w = waitRequestOf(r);
    if (!w) return r as Record<string, unknown>;
    expect(w.jobIds.length).toBeGreaterThan(0);
    c.job = { ...c.job, plan: w.plan, wakes: (c.job.wakes ?? 0) + 1, attempts: c.job.attempts + 1 };
  }
}

const unproven = () => fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined })) });
const ctx = (productionId: string) => ({
  job: { id: 'produce-1', type: 'PRODUCE', status: 'GENERATING', attempts: 0, payload: { productionId } } as unknown as Job,
  tool: (_id: string, fn: () => unknown) => fn(),
  checkpoint: async () => {}, progress: async () => {}, activity: async () => {},
  event: async (_l: string, m: string) => { fake.events.push(m); },
}) as unknown as Parameters<typeof produce>[0];

beforeEach(() => { fake.byKey = new Map(); fake.jobs = new Map(); fake.order = []; fake.outcome = {}; fake.imagesReady = false; fake.events = []; fake.world = []; });

describe('pure: pilots, verdicts', () => {
  it('the first shot to generate in each unproven scene is its pilot; a scene with an accepted chosen take is open', () => {
    const { p } = unproven();
    expect(planPilots(p, p.shots).map((s) => ({ scene: s.sceneId, pilot: s.pilot?.id, rest: s.rest.map((x) => x.id) }))).toEqual([{ scene: 'sc1', pilot: 's11', rest: ['s12', 's13'] }, { scene: 'sc2', pilot: 's21', rest: [] }]);
    const { p: proven } = fixture();
    const targets = proven.shots.filter((s) => s.id !== 's11');
    expect(planPilots(proven, targets)).toEqual([{ sceneId: 'sc1', pilot: undefined, rest: [shotOf(proven, 's12'), shotOf(proven, 's13')] }, { sceneId: 'sc2', pilot: shotOf(proven, 's21'), rest: [] }]);
  });
  it('a take is accepted when real, READY and its checks passed; a verdict reads the job and the take it recorded', () => {
    expect(takeAccepted(TAKE_A)).toBe(true);
    expect(takeAccepted({ ...TAKE_A, status: 'REJECTED' })).toBe(false);
    expect(takeAccepted({ ...TAKE_A, provider: 'SAMPLE' })).toBe(false);
    expect(takeAccepted({ ...TAKE_A, qa: { ok: false, checks: [] } })).toBe(false);
    const { state, p } = fixture();
    expect(pilotVerdict({ status: 'COMPLETED', result: { takeId: 'take-a' } }, state, p.id, 's11')).toMatchObject({ passed: true });
    expect(pilotVerdict({ status: 'FAILED', error: { code: 'INVALID', message: 'Preflight failed for shot 1' } }, state, p.id, 's11')).toMatchObject({ passed: false, reason: expect.stringMatching(/the pilot failed: Preflight failed/) });
    expect(pilotVerdict({ status: 'AWAITING_REVIEW', result: { takeId: 'take-a', takeUnverified: true } }, state, p.id, 's11')).toMatchObject({ passed: false, reason: expect.stringMatching(/awaits a person/) });
    expect(pilotVerdict({ status: 'COMPLETED', result: {} }, state, p.id, 's11')).toMatchObject({ passed: false, reason: 'the pilot recorded no take' });
  });
});

describe('PRODUCE with the pilot gate', () => {
  it('queues every scene’s pilot first, then the rest of the scenes whose pilot passed, then assembles', async () => {
    const { state, p } = unproven(); fake.state = state;
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12', 'GENERATE_TAKE:s13', 'ASSEMBLE']);
    expect(r).toMatchObject({ completed: 4, pilots: [{ scene: 1, shotId: 's11', passed: true }, { scene: 2, shotId: 's21', passed: true }], blocked: [] });
    // the World Bible is pinned after the story gate and before the first job: established frames first
    expect(fake.world).toEqual(['story-gate', 'establish', 'pin:0']);
    expect(r).toMatchObject({ world: { revision: 4, pinned: true, action: 'PINNED', established: 2, blocking: 0 } });
    expect(fake.events.join('\n')).toContain('World Bible: pinned to World Bible revision 4');
  });

  it('a pilot that fails its checks stops its scene only', async () => {
    const { state, p } = unproven(); fake.state = state;
    fake.outcome = { s11: 'reject' };
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21']);
    expect(r).toMatchObject({ pilots: [{ shotId: 's11', passed: false, reason: expect.stringMatching(/failed its checks/) }, { shotId: 's21', passed: true }], blocked: [{ shotId: 's12', reason: expect.stringMatching(/pilot did not pass/) }, { shotId: 's13', reason: expect.stringMatching(/pilot did not pass/) }] });
    expect(fake.events.join('\n')).toMatch(/scene 1: the pilot take failed its checks.*its other 2 shot\(s\) are not generated/);
  });

  it('a pilot awaiting a person’s ear holds its scene (and the wait ends: AWAITING_REVIEW is settled)', async () => {
    const { state, p } = unproven(); fake.state = state;
    fake.outcome = { s21: 'review' };
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12', 'GENERATE_TAKE:s13']);
    expect(r).toMatchObject({ pilots: [{ passed: true }, { shotId: 's21', passed: false }], awaitingReview: true });
  });

  it('a continuation is queued only after the take it continues was accepted; a chain behind a failure is held', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined, ...(s.id === 's13' ? { continuity: { ...s.continuity!, relationToPrevious: 'CONTINUATION' as const } } : {}) })) });
    fake.state = state;
    fake.outcome = { s12: 'fail' };
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12']);
    expect(r).toMatchObject({ blocked: [{ shotId: 's13', reason: 'continues shot 2, whose take was not accepted' }], failed: 1 });
  });

  it('a stale continuation (its predecessor chose another take) is re-conditioned: queued with select, in order; whole shots are left alone', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => {
      if (s.id === 's11') return { ...s, takes: [TAKE_A, { ...TAKE_A, id: 'take-a2', label: 'Take 2' }], selectedTakeId: 'take-a2' };
      if (s.id === 's12') return { ...s, takes: [{ ...TAKE_A, id: 'take-b1', relation: 'CONTINUATION' as const, continuesTakeId: 'take-a', trimStartFrames: 22, stale: { since: 'x', because: 'PREDECESSOR_RESELECTED' as const, previousShotId: 's11', expectedTakeId: 'take-a2', detail: 'shot 1 now chooses Take 2' } }], selectedTakeId: 'take-b1' };
      if (s.id === 's13') return { ...s, takes: [{ ...TAKE_A, id: 'take-c1' }], selectedTakeId: 'take-c1' };
      return { ...s, takes: [{ ...TAKE_A, id: 'take-d1' }], selectedTakeId: 'take-d1' };
    }) });
    fake.state = state;
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s12', 'ASSEMBLE']);
    const job = [...fake.jobs.values()].find((j) => j.shotId === 's12')!;
    expect(job.payload).toEqual({ productionId: p.id, shotId: 's12', select: true });
    expect(r).toMatchObject({ shots: 1, completed: 1 });
    expect(fake.events.join('\n')).toMatch(/1 stale continuation\(s\) are re-conditioned on their predecessor's current take: shot 2/);
  });

  it('draws no opening frame for a continuation (it starts from the previous take’s tail)', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined, openingFrameAssetId: undefined })) });
    fake.state = state; fake.imagesReady = true;
    await produce(ctx(p.id));
    const frames = fake.order.filter((o) => o.startsWith('SHOT_FRAMES'));
    // s13 is a CUT after s12 in the same scene: its frame is drawn later, by its take, from s12's actual end
    expect(frames).toEqual(['SHOT_FRAMES:s11', 'SHOT_FRAMES:s21']);
  });

  it('a scene already proven by an accepted take has no pilot', async () => {
    const { state, p } = fixture(); fake.state = state;
    const r = await produce(ctx(p.id));
    expect(fake.order[0]).toBe('GENERATE_TAKE:s21');
    expect(fake.order).toContain('GENERATE_TAKE:s12');
    expect((r as { pilots: unknown[] }).pilots).toHaveLength(1);
    void (p as Production);
  });
});

describe('PRODUCE and a stale cut (audit M2, step 12)', () => {
  it('every shot has its take and the cut is out of date: the cut is assembled again; a current cut is left alone', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [{ ...TAKE_A, id: `take-${s.id}` }], selectedTakeId: `take-${s.id}` })) });
    expect(p.shots.every((s) => s.selectedTakeId)).toBe(true);
    fake.state = { ...state, productions: state.productions.map((x) => (x.id === p.id ? { ...x, cutAssetId: 'cut-old', cutStale: true } : x)) };
    const stale = await produce(ctx(p.id));
    expect(fake.order).toEqual(['ASSEMBLE']);
    expect(stale).toMatchObject({ shots: 0, assembled: true });
    fake.order = []; fake.jobs = new Map();
    fake.state = { ...state, productions: state.productions.map((x) => (x.id === p.id ? { ...x, cutAssetId: 'cut-current', cutStale: undefined } : x)) };
    const current = await produce(ctx(p.id));
    expect(fake.order).toEqual([]);
    expect(current).toMatchObject({ shots: 0 });
  });
});
describe('PRODUCE is a dependency graph (step 14)', () => {
  it('the first pass queues the pilots and waits for them alone; the rest is queued by a later pass', async () => {
    const { state, p } = unproven(); fake.state = state;
    const c = ctx(p.id);
    const first = waitRequestOf(await producePass(c))!;
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21']);
    expect(first.jobIds).toEqual(['job-1', 'job-2']);
    expect(first.plan).toMatchObject({ round: 0, targets: ['s11', 's12', 's13', 's21'], takes: { s11: 'job-1', s21: 'job-2' } });
    // the rest takes three more passes: the scene is filmed in order (s12, then s13 drawn from s12's actual end), then
    // the cut and the report
    c.job = { ...c.job, plan: first.plan, wakes: 1, attempts: 1 };
    await produce(c);
    expect(passes).toBe(3);
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12', 'GENERATE_TAKE:s13', 'ASSEMBLE']);
  });

  it('a pass run again (a crash before it could wait) queues nothing twice', async () => {
    const { state, p } = unproven(); fake.state = state;
    fake.outcome = { s11: 'slow', s21: 'slow' }; // still filming when the worker died
    await producePass(ctx(p.id));
    await producePass(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21']);
  });

  it('a continuation waits — as a dependency, holding no slot — for the take it continues, then is queued', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined, ...(s.id === 's13' ? { continuity: { ...s.continuity!, relationToPrevious: 'CONTINUATION' as const } } : {}) })) });
    fake.state = state; fake.outcome = { s12: 'slow' };
    const c = ctx(p.id);
    const pilots = waitRequestOf(await producePass(c))!;
    c.job = { ...c.job, plan: pilots.plan, wakes: 1, attempts: 1 };
    const rest = waitRequestOf(await producePass(c))!;
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12']);
    const s12 = (rest.plan.takes as Record<string, string>).s12;
    expect(rest.jobIds).toContain(s12);
    // s12's take arrives and is accepted: the next pass queues s13
    const take = { ...TAKE_A, id: 'take-s12' };
    fake.state = { ...fake.state, productions: fake.state.productions.map((x) => (x.id !== p.id ? x : { ...x, shots: x.shots.map((s) => (s.id === 's12' ? { ...s, takes: [take], selectedTakeId: take.id } : s)) })) };
    fake.jobs.set(s12, { ...fake.jobs.get(s12)!, status: 'COMPLETED', result: { takeId: take.id } });
    c.job = { ...c.job, plan: rest.plan, wakes: 2, attempts: 2 };
    await producePass(c);
    expect(fake.order.slice(3)).toEqual(['GENERATE_TAKE:s13', 'ASSEMBLE']);
  });

  it('a failed shot fails alone: the others are generated and the report names its job, to regenerate it on its own', async () => {
    const { state, p } = unproven(); fake.state = state;
    fake.outcome = { s13: 'fail' };
    const r = await produce(ctx(p.id));
    expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12', 'GENERATE_TAKE:s13']);
    expect(r).toMatchObject({ completed: 3, failed: 1, failedShots: [{ shotId: 's13', jobId: 'job-4', reason: 'Preflight failed' }] });
  });

  it('PRODUCE_DAG=off runs the polling orchestrator (rollback): the same film in one pass', async () => {
    const { state, p } = unproven(); fake.state = state;
    process.env.PRODUCE_DAG = 'off';
    try { const r = await producePass(ctx(p.id)); expect(waitRequestOf(r)).toBeUndefined(); expect(fake.order).toEqual(['GENERATE_TAKE:s11', 'GENERATE_TAKE:s21', 'GENERATE_TAKE:s12', 'GENERATE_TAKE:s13', 'ASSEMBLE']); } finally { delete process.env.PRODUCE_DAG; }
  });
});
describe('the state is handed on in order (continuity recovery 2026-10-08)', () => {
  it('waitsForPredecessor: a continuation, and a CUT inside the scene whose predecessor is filmed in the run', async () => {
    const { waitsForPredecessor } = await import('@/worker/handlers/produce');
    const { p } = unproven();
    const all = new Set(p.shots.map((s) => s.id));
    expect(waitsForPredecessor(p, shotOf(p, 's11'), all)).toBe(false); // the scene's first shot opens it
    expect(waitsForPredecessor(p, shotOf(p, 's12'), new Set(['s12']))).toBe(true); // a continuation always waits
    expect(waitsForPredecessor(p, shotOf(p, 's13'), all)).toBe(true); // a cut after s12, filmed in this run
    expect(waitsForPredecessor(p, shotOf(p, 's13'), new Set(['s13']))).toBe(false); // s12 already has its take
    expect(waitsForPredecessor(p, shotOf(p, 's21'), all)).toBe(false); // a new scene
  });
});