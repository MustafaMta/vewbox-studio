import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStatus } from '@/domain/jobs';
import type { Production, StudioState, Take } from '@/domain/types';

/** PRODUCE with the pilot gate (P1, docs/research/MINIMAX-CONTINUITY.md §3.9), over a fake queue whose GENERATE_TAKE
 *  jobs finish at once with a scripted outcome: the first shot of every unproven scene is generated alone and must
 *  pass before the scene's other shots are queued; a failed pilot stops its scene only; a continuation is queued only
 *  after the take it continues was accepted; a continuation gets no opening frame. */

type Outcome = 'pass' | 'reject' | 'fail' | 'review';
const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, jobs: new Map<string, Job>(), order: [] as string[], outcome: {} as Record<string, Outcome>, imagesReady: false, events: [] as string[], world: [] as string[] }));

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
  enqueue: async (input: { type: Job['type']; payload: { productionId: string; shotId?: string } }) => {
    const id = `job-${fake.jobs.size + 1}`;
    const shotId = input.payload.shotId;
    fake.order.push(`${input.type}${shotId ? `:${shotId}` : ''}`);
    let status: JobStatus = 'COMPLETED'; let result: Record<string, unknown> | undefined; let error: Job['error'];
    if (input.type === 'GENERATE_TAKE' && shotId) {
      const o = fake.outcome[shotId] ?? 'pass';
      if (o === 'fail') { status = 'FAILED'; error = { code: 'INVALID', message: 'Preflight failed' }; }
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

import { planPilots, pilotVerdict, produce, takeAccepted } from '@/worker/handlers/produce';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

const unproven = () => fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined })) });
const ctx = (productionId: string) => ({
  job: { id: 'produce-1', type: 'PRODUCE', status: 'GENERATING', attempts: 0, payload: { productionId } } as unknown as Job,
  tool: (_id: string, fn: () => unknown) => fn(),
  checkpoint: async () => {}, progress: async () => {}, activity: async () => {},
  event: async (_l: string, m: string) => { fake.events.push(m); },
}) as unknown as Parameters<typeof produce>[0];

beforeEach(() => { fake.jobs = new Map(); fake.order = []; fake.outcome = {}; fake.imagesReady = false; fake.events = []; fake.world = []; });

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

  it('draws no opening frame for a continuation (it starts from the previous take’s tail)', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, takes: [], selectedTakeId: undefined, openingFrameAssetId: undefined })) });
    fake.state = state; fake.imagesReady = true;
    await produce(ctx(p.id));
    const frames = fake.order.filter((o) => o.startsWith('SHOT_FRAMES'));
    expect(frames).toEqual(['SHOT_FRAMES:s11', 'SHOT_FRAMES:s13', 'SHOT_FRAMES:s21']);
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
