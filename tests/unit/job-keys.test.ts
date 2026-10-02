import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, JobStatus, JobType } from '@/domain/jobs';
import type { StudioState } from '@/domain/types';

/** Dedupe keys of character jobs (findings 6, 19): a key stops a double submission; it never turns a new request
 *  into a no-op. The Voice tab used to send its own `VOICE_BUILD:${id}:${rev + 1}` key, the route handed back the
 *  FAILED build under it, and "Build the voice" silently did nothing after any failure. The real POST /api/jobs runs
 *  here over a fake queue with idempotency semantics. */

const fake = vi.hoisted(() => ({ jobs: [] as Array<Job & { key?: string }>, state: null as unknown as StudioState }));
vi.mock('@/server/jobs/queue', () => ({
  enqueue: async (input: { type: JobType; payload: Record<string, unknown>; idempotencyKey?: string }) => {
    const existing = input.idempotencyKey ? fake.jobs.find((j) => j.key === input.idempotencyKey) : undefined;
    if (existing) return { job: existing, created: false };
    const job = { id: `job-${fake.jobs.length + 1}`, type: input.type, status: 'QUEUED' as JobStatus, priority: 0, payload: input.payload, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x', key: input.idempotencyKey };
    fake.jobs.push(job);
    return { job, created: true };
  },
  listJobs: async () => fake.jobs,
}));
vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: fake.state, version: 1, hash: 'h' }) }));

import { seed } from '@/domain/sample';
import { addAsset, addVoiceRecording } from '@/domain/actions';
import { POST } from '@/app/api/jobs/route';
import { requeueKeyFor, voiceBuildKey } from '@/server/jobs/keys';
import { createCharacterKey, startCreateCharacter } from '@/components/character/contract';

const post = async (body: Record<string, unknown>) => { const res = await POST(new Request('http://studio.test/api/jobs', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), undefined); return { status: res.status, body: await res.json() as { job: Job & { key?: string }; created: boolean } }; };
const finish = (id: string, status: JobStatus) => { const j = fake.jobs.find((x) => x.id === id)!; j.status = status; };

beforeEach(() => {
  fake.jobs = [];
  let s = seed();
  s = addAsset(s, { id: 'up-rec', kind: 'AUDIO', src: '/api/media/up-rec', label: 'rec', tags: [], sample: false, origin: 'UPLOAD' }).state;
  s = addVoiceRecording(s, 'nour', 'up-rec', 'take one');
  fake.state = s;
});

describe('requeueKeyFor (pure)', () => {
  it('a finished voice build or a failed/cancelled creation is a new request; an active job, or a made character, is the answer', () => {
    expect(requeueKeyFor(voiceBuildKey('nour', 0), { status: 'FAILED' }, 36)).toBe('VOICE_BUILD:nour:0:10');
    expect(requeueKeyFor('VOICE_BUILD:nour:1', { status: 'CANCELLED' })).toMatch(/^VOICE_BUILD:nour:1:/);
    expect(requeueKeyFor('VOICE_BUILD:nour:1', { status: 'GENERATING' })).toBeNull();
    expect(requeueKeyFor('CREATE_CHARACTER:abc:1', { status: 'FAILED' })).toMatch(/^CREATE_CHARACTER:abc:1:/);
    expect(requeueKeyFor('CREATE_CHARACTER:abc:1', { status: 'COMPLETED' })).toBeNull();
    expect(requeueKeyFor('CREATE_CHARACTER:abc:1', { status: 'AWAITING_REVIEW' })).toBeNull();
    expect(requeueKeyFor('produce:job:frame', { status: 'FAILED' })).toBeNull();
    expect(requeueKeyFor(undefined, { status: 'FAILED' })).toBeNull();
  });
});

describe('POST /api/jobs — voice builds after a failure', () => {
  it('a client-supplied VOICE_BUILD key that meets the failed build queues a new build (the Voice tab’s old key)', async () => {
    const sample = fake.state.characters.find((c) => c.id === 'nour')!.voice.samples.at(-1)!;
    const payload = { characterId: 'nour', mode: 'REFERENCE', referenceSampleId: sample.id };
    const first = await post({ type: 'VOICE_BUILD', payload, idempotencyKey: 'VOICE_BUILD:nour:1' });
    expect(first.status).toBe(201);
    // a double click while it runs is the same job
    expect((await post({ type: 'VOICE_BUILD', payload, idempotencyKey: 'VOICE_BUILD:nour:1' })).body).toMatchObject({ created: false, job: { id: first.body.job.id } });
    finish(first.body.job.id, 'FAILED');
    const again = await post({ type: 'VOICE_BUILD', payload, idempotencyKey: 'VOICE_BUILD:nour:1' });
    expect(again.status).toBe(201);
    expect(again.body.created).toBe(true);
    expect(again.body.job.id).not.toBe(first.body.job.id);
    expect(again.body.job.status).toBe('QUEUED');
  });
  it('without a client key the server derives VOICE_BUILD:${id}:${revision} and does the same', async () => {
    const payload = { characterId: 'nour', mode: 'AUTOMATIC' };
    const first = await post({ type: 'VOICE_BUILD', payload });
    expect(first.body.job.key).toBe('VOICE_BUILD:nour:0');
    finish(first.body.job.id, 'CANCELLED');
    const again = await post({ type: 'VOICE_BUILD', payload });
    expect(again.body).toMatchObject({ created: true }); expect(again.body.job.key).toMatch(/^VOICE_BUILD:nour:0:/);
  });
});

describe('CREATE_CHARACTER dedupe (finding 19)', () => {
  const payload = { mode: 'MANUAL' as const, profile: { name: 'Rafid', style: 'REALISTIC' as const, language: 'EN' as const }, voice: { mode: 'NONE' as const }, draw: true };
  it('the key is stable for the same request in the same minute, and differs for another request or minute', () => {
    const t = Date.UTC(2026, 9, 3, 10, 15, 5);
    expect(createCharacterKey(payload, t)).toBe(createCharacterKey({ draw: true, voice: { mode: 'NONE' }, profile: { language: 'EN', style: 'REALISTIC', name: 'Rafid' }, mode: 'MANUAL' }, t + 20_000));
    expect(createCharacterKey(payload, t)).not.toBe(createCharacterKey({ ...payload, profile: { ...payload.profile, name: 'Rafida' } }, t));
    expect(createCharacterKey(payload, t)).not.toBe(createCharacterKey(payload, t + 61_000));
    expect(createCharacterKey(payload, t)).toMatch(/^CREATE_CHARACTER:[0-9a-f]{8}:\d+$/);
  });
  it('a double submit is one parent; a relaunch after a failure is a new one', async () => {
    const t = Date.UTC(2026, 9, 3, 10, 15, 5);
    const viaApi = async <T extends JobType>(type: T, p: unknown, opts?: { idempotencyKey?: string }) => (await post({ type, payload: p, ...opts })).body.job;
    const a = await startCreateCharacter(viaApi, payload, t);
    const b = await startCreateCharacter(viaApi, payload, t + 1500);
    expect(b.id).toBe(a.id);
    expect(fake.jobs.filter((j) => j.type === 'CREATE_CHARACTER')).toHaveLength(1);
    finish(a.id, 'FAILED');
    const c = await startCreateCharacter(viaApi, payload, t + 3000);
    expect(c.id).not.toBe(a.id);
    expect(fake.jobs.filter((j) => j.type === 'CREATE_CHARACTER')).toHaveLength(2);
  });
});
