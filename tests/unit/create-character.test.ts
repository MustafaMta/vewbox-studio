import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandName } from '@/domain/commands';
import type { StudioState } from '@/domain/types';
import type { Job, JobType } from '@/domain/jobs';

/** CREATE_CHARACTER with an in-memory studio (the real reducers) and a fake queue whose children finish at once:
 *  the chain, its idempotency keys, what a restart adopts, and what the result reports. */

const fake = vi.hoisted(() => ({
  state: null as unknown as StudioState,
  jobs: new Map<string, Job & { key?: string }>(),
  enqueued: [] as Array<{ type: JobType; key?: string; parentId?: string; payload: Record<string, unknown> }>,
  /** how a child of a type ends: COMPLETED with a result (and an effect on the studio), or FAILED */
  outcomes: {} as Partial<Record<JobType, { status: 'COMPLETED' | 'FAILED' | 'GENERATING'; result?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> }; effect?: (payload: Record<string, unknown>) => void }>>,
  retried: [] as string[],
  events: [] as Array<{ level: string; message: string }>,
}));

vi.mock('@/server/studio/engine', async () => {
  const { runCommand } = await import('@/domain/commands');
  type Spec = { name: CommandName; args: unknown[] };
  const stamp = (list: Spec[], opts: { seed?: string; at?: string } = {}) => { const s = opts.seed ?? `b-${Math.random().toString(36).slice(2)}`; const at = opts.at ?? new Date().toISOString(); return list.map((c, i) => ({ ...c, seed: `${s}-${i}`, at }) as Command); };
  const apply = async (cmds: Command[]) => { let s = fake.state; const results: unknown[] = []; for (const c of cmds) { const r = runCommand(s, c); s = r.state; results.push(r.result ?? null); } fake.state = s; return results; };
  return { readState: async () => ({ state: fake.state, version: 1, hash: 'h' }), command: async (name: CommandName, args: unknown[]) => (await apply(stamp([{ name, args }])))[0], commands: async (list: Spec[], _o?: string, opts?: { seed?: string; at?: string }) => apply(stamp(list, opts)), stampCommands: stamp, applyCommands: async () => { throw new Error('unused'); }, notifyJobs: async () => {}, notifyChange: async () => {}, currentVersion: async () => 1 };
});
vi.mock('@/server/jobs/queue', () => ({
  enqueue: async (input: { type: JobType; payload: Record<string, unknown>; idempotencyKey?: string; parentId?: string }) => {
    const existing = input.idempotencyKey ? [...fake.jobs.values()].find((j) => j.key === input.idempotencyKey) : undefined;
    if (existing) return { job: existing, created: false };
    fake.enqueued.push({ type: input.type, key: input.idempotencyKey, parentId: input.parentId, payload: input.payload });
    const o = fake.outcomes[input.type] ?? { status: 'COMPLETED' as const, result: {} };
    const id = `${input.type.toLowerCase()}-${fake.jobs.size + 1}`;
    const job: Job & { key?: string } = { id, type: input.type, status: 'QUEUED', priority: 0, payload: input.payload, attempts: 0, maxAttempts: 1, cancelRequested: false, parentId: input.parentId, characterId: input.payload.characterId as string | undefined, createdAt: 'x', updatedAt: 'x', key: input.idempotencyKey };
    fake.jobs.set(id, job);
    // the child finishes before the parent polls it
    o.effect?.(input.payload);
    fake.jobs.set(id, { ...job, status: o.status, result: o.result, error: o.error });
    return { job: fake.jobs.get(id)!, created: true };
  },
  getJob: async (id: string) => fake.jobs.get(id),
  // the queue's retry: the same row runs again and (in this fake) ends as the type's outcome says now
  retry: async (id: string) => { const j = fake.jobs.get(id)!; fake.retried.push(id); const o = fake.outcomes[j.type] ?? { status: 'COMPLETED' as const, result: {} }; o.effect?.(j.payload); fake.jobs.set(id, { ...j, status: o.status, result: o.result, error: o.error }); return fake.jobs.get(id)!; },
  listChildren: async (parentId: string) => [...fake.jobs.values()].filter((j) => j.parentId === parentId),
  recordMetric: async () => {},
}));
vi.mock('@/server/env', () => ({ env: () => ({ MINIMAX_API_KEY: '' }) }));

import { seed } from '@/domain/sample';
import { addAsset, setCanonicalImage, addVoiceRecording } from '@/domain/actions';
import { CHAIN_TIMING, createCharacter as handler } from '@/worker/handlers/character';
import type { HandlerContext } from '@/worker/handlers';
import type { CreateCharacterResult } from '@/domain/jobs';
import { REFERENCE_LOOK_BRIEF } from '@/server/story/schemas';

const createCharacter = (ctx: HandlerContext) => handler(ctx) as unknown as Promise<CreateCharacterResult & { awaitingReview?: boolean }>;

const ctxFor = (payload: Record<string, unknown>, id = 'job-cc'): HandlerContext => ({
  job: { id, type: 'CREATE_CHARACTER', status: 'PREPARING', priority: 0, payload, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-02T12:00:00.000Z', updatedAt: 'x' } as Job,
  log: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as unknown as HandlerContext['log'], workerId: 'w', agent: { id: 'casting-director', name: 'Casting', department: 'CASTING', tools: [] } as unknown as HandlerContext['agent'], runId: 'run',
  tool: (_id, fn) => fn(), activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async (level, message) => { fake.events.push({ level, message }); }, gpu: async (_f, _mb, fn) => fn(),
});

const sheet = { name: 'Rafid', role: 'Night bus driver', sex: 'MALE', ageYears: 52, build: 'heavy', face: 'broad', hair: 'grey', skin: 'olive', eyes: 'brown', wardrobe: 'blue uniform', personality: 'patient', distinguishing: ['a scar'], style: 'REALISTIC', language: 'AR', dialect: 'IRAQI_BAGHDADI' } as const;
/** What CHARACTER_APPEARANCE does now (contract v2): one canonical image, a DRAFT awaiting the producer's approval. */
const drawPortrait = (payload: Record<string, unknown>) => { const c = fake.state.characters.find((x) => x.id === payload.characterId)!; fake.state = addAsset(fake.state, { id: `gen-canonical-${c.id}`, kind: 'IMAGE', src: '/api/media/p', label: 'canonical image', tags: [], sample: false, origin: 'GENERATED', width: 928, height: 1664 }).state; fake.state = setCanonicalImage(fake.state, c.id, { assetId: `gen-canonical-${c.id}`, seed: 1, referenceAssetId: c.pendingReference?.assetId, identityLine: 'Identity: x.', check: { ok: true, notes: ['full body in frame'] } }); };
const DRAWN = 'canonical image drawn — awaiting your approval';

beforeEach(() => { fake.state = seed(); fake.jobs.clear(); fake.enqueued = []; fake.events = []; fake.retried = []; fake.outcomes = { CHARACTER_APPEARANCE: { status: 'COMPLETED', result: {}, effect: drawPortrait }, CHARACTER_REFS: { status: 'COMPLETED', result: { refs: 5 } } }; });

describe('CREATE_CHARACTER', () => {
  it('MANUAL with a complete sheet: the record and its seat are written in one batch; the canonical image runs as a keyed child (no sheet: contract v2); the voice is skipped with the reason; the result awaits approval', async () => {
    const before = fake.state.characters.length;
    const show = fake.state.shows[0];
    const r = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet, showId: show.id, voice: { mode: 'AUTOMATIC' } }));
    expect(fake.state.characters).toHaveLength(before + 1);
    const c = fake.state.characters.find((x) => x.name === 'Rafid')!;
    expect(c).toMatchObject({ dialect: 'IRAQI_BAGHDADI', style: 'REALISTIC', usage: { known: true, videos: [] } });
    expect(fake.state.shows[0].castIds).toContain(c.id);
    expect(r).toMatchObject({ characterId: c.id, awaitingReview: false, awaitingApproval: true, canonicalAssetId: `gen-canonical-${c.id}`, message: expect.stringMatching(/awaiting your approval$/) });
    expect(r!.steps).toEqual([
      { step: 'design', status: 'skipped', reason: 'the sheet was complete' },
      { step: 'appearance', status: 'done', jobId: 'character_appearance-1', reason: DRAWN },
      { step: 'voice', status: 'skipped', reason: expect.stringMatching(/no voice yet: .*upload a 3–30 second recording/) },
    ]);
    expect(fake.enqueued.map((e) => [e.type, e.key, e.parentId])).toEqual([['CHARACTER_APPEARANCE', 'create:job-cc:appearance', 'job-cc']]);
    expect(fake.state.characters.find((x) => x.id === c.id)!.canonicalImage).toMatchObject({ status: 'DRAFT', version: 1 });
    expect(fake.enqueued.every((e) => e.payload.characterId === c.id)).toBe(true);
  });
  it('a restart of the same job adopts the record it wrote and the children it queued: nothing runs twice', async () => {
    await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet }));
    const n = fake.state.characters.length; const queued = fake.enqueued.length;
    const r = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet }));
    expect(fake.state.characters).toHaveLength(n);
    expect(fake.enqueued).toHaveLength(queued);
    expect(r!.steps.filter((s) => s.status === 'done')).toHaveLength(1);
    expect(fake.events.some((e) => /already written by an earlier attempt/.test(e.message))).toBe(true);
    expect(fake.events.filter((e) => /adopted job/.test(e.message))).toHaveLength(1);
  });
  it('AUTO (a name alone or a brief) runs the design child first and takes the character it made; a failed design creates nothing and fails the job with its class', async () => {
    const before = fake.state.characters.length;
    fake.outcomes.DESIGN_CHARACTER = { status: 'COMPLETED', result: { characterId: 'nour' } };
    const r = await createCharacter(ctxFor({ mode: 'AUTO', name: 'Nour' }));
    expect(fake.enqueued[0]).toMatchObject({ type: 'DESIGN_CHARACTER', key: 'create:job-cc:design', payload: { name: 'Nour', style: fake.state.settings.defaults.style } });
    expect(r!.steps[0]).toMatchObject({ step: 'design', status: 'done', jobId: 'design_character-1' });
    expect(r!.characterId).toBe('nour');
    fake.jobs.clear(); fake.enqueued = [];
    fake.outcomes.DESIGN_CHARACTER = { status: 'FAILED', error: { code: 'INVALID', message: 'the design failed the character schema', details: { failureClass: 'INVALID_INPUT' } } };
    await expect(createCharacter(ctxFor({ mode: 'AUTO', brief: 'a tired night-bus driver' }, 'job-cc-2'))).rejects.toMatchObject({ failureClass: 'INVALID_INPUT' });
    expect(fake.state.characters).toHaveLength(before);
    expect(fake.enqueued.map((e) => e.type)).toEqual(['DESIGN_CHARACTER']);
    // a child code outside the studio's union (a provider's own string) is a PROVIDER failure, never passed on as a code
    fake.jobs.clear(); fake.enqueued = [];
    fake.outcomes.DESIGN_CHARACTER = { status: 'FAILED', error: { code: 'ECONNRESET', message: 'socket hang up' } };
    await expect(createCharacter(ctxFor({ mode: 'AUTO', brief: 'a tired night-bus driver' }, 'job-cc-3'))).rejects.toMatchObject({ code: 'PROVIDER', message: expect.stringMatching(/socket hang up/) });
    fake.jobs.clear(); fake.enqueued = [];
    fake.outcomes.DESIGN_CHARACTER = { status: 'FAILED', error: { code: 'UNAVAILABLE', message: 'the story model is not reachable', details: { failureClass: 'INFRASTRUCTURE' } } };
    await expect(createCharacter(ctxFor({ mode: 'AUTO', brief: 'a tired night-bus driver' }, 'job-cc-4'))).rejects.toMatchObject({ code: 'UNAVAILABLE', failureClass: 'INFRASTRUCTURE' });
  });
  it('MANUAL with a partial sheet is completed by the design child (the producer’s fields travel with it)', async () => {
    fake.outcomes.DESIGN_CHARACTER = { status: 'COMPLETED', result: { characterId: 'nour' } };
    await createCharacter(ctxFor({ mode: 'MANUAL', profile: { name: 'Rafid', style: 'ANIME', language: 'EN', role: 'driver' } }));
    expect(fake.enqueued[0]).toMatchObject({ type: 'DESIGN_CHARACTER', payload: { name: 'Rafid', style: 'ANIME', language: 'EN', profile: { name: 'Rafid', role: 'driver' } } });
  });
  it('REFERENCE: an unusable picture (a bundled sample, too small, missing) creates nothing — MISSING_REFERENCE; a usable one becomes the pending reference before the portrait is drawn', async () => {
    const before = fake.state.characters.length;
    await expect(createCharacter(ctxFor({ mode: 'REFERENCE', profile: sheet, referenceAssetId: 'ref-nour-side' }))).rejects.toMatchObject({ failureClass: 'MISSING_REFERENCE' });
    fake.state = addAsset(fake.state, { id: 'up-small', kind: 'IMAGE', src: '/api/media/up-small', label: 'tiny', tags: [], sample: false, origin: 'UPLOAD', width: 200, height: 300 }).state;
    await expect(createCharacter(ctxFor({ mode: 'REFERENCE', profile: sheet, referenceAssetId: 'up-small' }))).rejects.toMatchObject({ failureClass: 'MISSING_REFERENCE' });
    await expect(createCharacter(ctxFor({ mode: 'REFERENCE', profile: sheet, referenceAssetId: 'up-missing' }))).rejects.toMatchObject({ failureClass: 'MISSING_REFERENCE' });
    // the validation the upload endpoint stored on the asset (finding 2) is read: a blurry picture creates nothing
    fake.state = addAsset(fake.state, { id: 'up-blur', kind: 'IMAGE', src: '/api/media/up-blur', label: 'blurry', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, provenance: { purpose: 'character-reference', validation: { ok: false, width: 1024, height: 1280, sharpness: 3.1, reasons: ['blurry: sharpness 3.1 is below 30'] } } }).state;
    await expect(createCharacter(ctxFor({ mode: 'REFERENCE', profile: sheet, referenceAssetId: 'up-blur' }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: expect.stringMatching(/blurry/) });
    expect(fake.state.characters).toHaveLength(before);
    expect(fake.enqueued).toHaveLength(0);
    fake.state = addAsset(fake.state, { id: 'up-face', kind: 'IMAGE', src: '/api/media/up-face', label: 'face', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, provenance: { validation: { ok: true, width: 1024, height: 1280, faces: 1, reasons: [] } } }).state;
    let pendingWhenDrawn: string | undefined;
    fake.outcomes.CHARACTER_APPEARANCE = { status: 'COMPLETED', result: {}, effect: (payload) => { pendingWhenDrawn = fake.state.characters.find((x) => x.id === payload.characterId)!.pendingReference?.assetId; drawPortrait(payload); } };
    const r = await createCharacter(ctxFor({ mode: 'REFERENCE', profile: sheet, referenceAssetId: 'up-face' }));
    expect(pendingWhenDrawn).toBe('up-face');
    expect(r!.steps.map((s) => `${s.step}:${s.status}`)).toEqual(['design:skipped', 'appearance:done', 'voice:skipped']);
  });
  it('REFERENCE: the look is the picture’s — design runs only for who the character is, with the look marker in its brief; a sheet with role, sex, age and personality needs no design', async () => {
    fake.state = addAsset(fake.state, { id: 'up-face', kind: 'IMAGE', src: '/api/media/up-face', label: 'face', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, provenance: { validation: { ok: true, width: 1024, height: 1280, reasons: [] } } }).state;
    fake.outcomes.DESIGN_CHARACTER = { status: 'COMPLETED', result: { characterId: 'nour' } };
    await createCharacter(ctxFor({ mode: 'REFERENCE', brief: 'Keep the face from the reference picture.', profile: { name: 'Maysoon', role: 'seamstress', style: 'REALISTIC', language: 'AR' }, referenceAssetId: 'up-face' }));
    expect(fake.enqueued[0]).toMatchObject({ type: 'DESIGN_CHARACTER', payload: { name: 'Maysoon', profile: { name: 'Maysoon', role: 'seamstress' } } });
    expect(String(fake.enqueued[0].payload.brief)).toBe(`${REFERENCE_LOOK_BRIEF}\nKeep the face from the reference picture.`);
    fake.jobs.clear(); fake.enqueued = [];
    const r = await createCharacter(ctxFor({ mode: 'REFERENCE', profile: { name: 'Rana', role: 'tailor', sex: 'FEMALE', ageYears: 33, personality: 'quiet', style: 'REALISTIC', language: 'EN' }, referenceAssetId: 'up-face' }, 'job-cc-ref'));
    expect(fake.enqueued.map((e) => e.type)).not.toContain('DESIGN_CHARACTER');
    const rana = fake.state.characters.find((c) => c.name === 'Rana')!;
    expect(rana).toMatchObject({ hair: '', face: '', wardrobe: '', skin: '', eyes: '', build: '' }); // nothing invented
    expect(r!.steps[0]).toMatchObject({ step: 'design', status: 'skipped', reason: expect.stringMatching(/look follows the picture/) });
  });
  it('a failed image keeps the record and reports the step; the job awaits review (partial success, never fabricated)', async () => {
    fake.outcomes.CHARACTER_APPEARANCE = { status: 'FAILED', error: { code: 'UNAVAILABLE', message: 'ComfyUI is not reachable', details: { failureClass: 'INFRASTRUCTURE' } } };
    const r = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet, draw: true }));
    expect(fake.state.characters.some((x) => x.name === 'Rafid')).toBe(true);
    expect(r!.steps).toEqual([
      { step: 'design', status: 'skipped', reason: 'the sheet was complete' },
      { step: 'appearance', status: 'failed', jobId: 'character_appearance-1', reason: 'ComfyUI is not reachable', failureClass: 'INFRASTRUCTURE' },
      { step: 'voice', status: 'skipped', reason: 'no voice requested' },
    ]);
    expect(r!.awaitingReview).toBe(true);
  });
  it('draw: false skips the pictures; a voice reference on the character runs VOICE_BUILD as the last child', async () => {
    fake.outcomes.VOICE_BUILD = { status: 'COMPLETED', result: { engine: 'habibi' } };
    // the record exists from an earlier attempt and already has an upload (the page let the producer add one)
    await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet, draw: false }));
    const c = fake.state.characters.find((x) => x.name === 'Rafid')!;
    fake.state = addAsset(fake.state, { id: 'up-voice', kind: 'AUDIO', src: '/api/media/up-voice', label: 'v', tags: [], sample: false, origin: 'UPLOAD' }).state;
    fake.state = addVoiceRecording(fake.state, c.id, 'up-voice', 'ref');
    const r = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet, draw: false, voice: { mode: 'AUTOMATIC' } }));
    expect(r!.steps.map((s) => `${s.step}:${s.status}`)).toEqual(['design:skipped', 'appearance:skipped', 'voice:done']);
    expect(fake.enqueued.at(-1)).toMatchObject({ type: 'VOICE_BUILD', key: 'create:job-cc:voice', payload: { characterId: c.id, mode: 'AUTOMATIC' } });
  });
  it('retrying the parent (same job, /api/jobs/{id}/retry) runs a failed child again and makes progress (finding 12)', async () => {
    fake.outcomes.CHARACTER_APPEARANCE = { status: 'FAILED', error: { code: 'UNAVAILABLE', message: 'ComfyUI is not reachable', details: { failureClass: 'INFRASTRUCTURE' } } };
    const first = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet }));
    expect(first!.steps.find((s) => s.step === 'appearance')!.status).toBe('failed');
    // the engine is back; the producer presses Retry on the Production page — the same parent job runs again
    fake.outcomes.CHARACTER_APPEARANCE = { status: 'COMPLETED', result: {}, effect: drawPortrait };
    const again = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet }));
    expect(fake.retried).toEqual(['character_appearance-1']);
    expect(again!.steps.map((s) => `${s.step}:${s.status}`)).toEqual(['design:skipped', 'appearance:done', 'voice:skipped']);
    expect(again!.awaitingReview).toBe(false);
    expect(fake.events.some((e) => /had failed; running it again/.test(e.message))).toBe(true);
  });
  it('a chain whose child never finishes is bounded: the parent fails INFRASTRUCTURE naming the children (finding 10)', async () => {
    const saved = { ...CHAIN_TIMING };
    CHAIN_TIMING.pollMs = 1; CHAIN_TIMING.timeoutMs = 30;
    try {
      fake.outcomes.CHARACTER_APPEARANCE = { status: 'GENERATING' };
      const err = await createCharacter(ctxFor({ mode: 'MANUAL', profile: sheet })).catch((e: unknown) => e) as { code: string; failureClass: string; details: { children: string[]; childJobId: string; step: string } };
      expect(err).toMatchObject({ code: 'UNAVAILABLE', failureClass: 'INFRASTRUCTURE', details: { step: 'appearance', childJobId: 'character_appearance-1' } });
      expect(err.details.children).toEqual(['character_appearance-1']);
      // the agent's own limit wins over the default
      const ctx = ctxFor({ mode: 'MANUAL', profile: sheet }, 'job-cc-limit');
      (ctx.agent as { limits?: { timeoutMs: number } }).limits = { timeoutMs: 10 };
      await expect(createCharacter(ctx)).rejects.toMatchObject({ details: { timeoutMs: 10 } });
    } finally { Object.assign(CHAIN_TIMING, saved); }
  });
  it('the chain waits in a lane of its own: orchestrators never take a CPU slot (finding 10)', async () => {
    const { laneOf, ORCHESTRATION_LANE } = await vi.importActual<typeof import('@/server/jobs/queue')>('@/server/jobs/queue');
    expect(laneOf('CREATE_CHARACTER')).toBe('ORCHESTRATION');
    expect(laneOf('PRODUCE')).toBe('ORCHESTRATION');
    expect(laneOf('ASSEMBLE')).toBe('CPU'); expect(laneOf('EXPORT')).toBe('CPU'); expect(laneOf('MEDIA_PROBE')).toBe('CPU');
    expect(laneOf('VOICE_BUILD')).toBe('GPU'); expect(laneOf('DESIGN_CHARACTER')).toBe('LLM');
    expect(ORCHESTRATION_LANE.limit).toBeGreaterThan(1);
  });
});
