import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchStore } from '@/server/research/store';

/** The API the Auto Idea screens build on: research sources (no secret, priority order, Settings applied), a research
 *  run with its items, and one idea's development (the job, its stages by key, the artifacts, the proposal). The
 *  routes are the real ones; the studio, the stores and the database are faked. */

const fake = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  store: null as unknown as ResearchStore,
  jobs: new Map<string, Record<string, unknown>>(),
  children: [] as Array<Record<string, unknown>>,
  proposals: [] as Array<{ id: string; createdAt: string }>,
  artifacts: [] as unknown[],
}));
vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: { settings: fake.settings }, version: 1, hash: 'h' }) }));
vi.mock('@/server/research/store', async (orig) => ({ ...(await orig<typeof import('@/server/research/store')>()), dbStore: () => fake.store }));
vi.mock('@/server/jobs/queue', () => ({
  getJob: async (id: string) => fake.jobs.get(id),
  rowToJob: (r: Record<string, unknown>) => ({ ...r }),
}));
vi.mock('@/server/development/artifacts', () => ({ artifactsOf: async () => fake.artifacts }));
vi.mock('@/server/db/client', async () => {
  const schema = await import('@/server/db/schema');
  const query = (fields?: unknown) => ({ from: (t: unknown) => ({ where: (..._a: unknown[]) => { const rows = t === schema.jobs ? fake.children : t === schema.proposals ? fake.proposals : []; return Object.assign(Promise.resolve(fields ? rows : rows), { orderBy: async () => rows }); } }) });
  return { db: () => ({ select: (fields?: unknown) => query(fields) }), schema };
});

import { GET as sources } from '@/app/api/research/sources/route';
import { GET as runRoute } from '@/app/api/research/runs/[id]/route';
import { GET as development } from '@/app/api/development/[ideaJobId]/route';
import { memoryStore } from '@/server/research/store';

const saved = process.env.YOUTUBE_API_KEY;
beforeEach(() => { fake.settings = {}; fake.store = memoryStore(); fake.jobs.clear(); fake.children = []; fake.proposals = []; fake.artifacts = []; delete process.env.YOUTUBE_API_KEY; });
afterEach(() => { if (saved === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = saved; });

const req = (u: string) => new Request(`http://studio.test${u}`);

describe('GET /api/research/sources', () => {
  it('every platform in priority order with its access status and reuse window; Settings applied; no secret', async () => {
    process.env.YOUTUBE_API_KEY = 'top-secret-key';
    fake.settings = { research: { enabled: true, platforms: { NEWS: false }, cacheHours: 6 } };
    const res = await sources(req('/api/research/sources'), undefined);
    const body = await res.json() as { enabled: boolean; cacheHours: number; sources: Array<{ platform: string; status: string; ttlHours: number; detail: string }> };
    expect(body.enabled).toBe(true); expect(body.cacheHours).toBe(6);
    expect(body.sources.map((s) => [s.platform, s.status])).toEqual([['TIKTOK', 'NOT_CONFIGURED'], ['INSTAGRAM', 'NOT_CONFIGURED'], ['FACEBOOK', 'UNSUPPORTED'], ['YOUTUBE', 'READY'], ['NEWS', 'DISABLED'], ['WIKIPEDIA', 'READY']]);
    expect(body.sources.every((s) => s.ttlHours === 6)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('top-secret-key');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/research/runs/:id', () => {
  it('the run with its items; an unknown run is 404', async () => {
    const [item] = await fake.store.upsertItems([{ id: 'ri-1', platform: 'WIKIPEDIA', provider: 'wikimedia-pageviews', url: 'https://en.wikipedia.org/wiki/X', title: 'X', retrievedAt: '2026-10-03T06:00:00Z', category: 'FILM', metrics: { pageviews: 5, rank: 3, periodDays: 1 }, query: 'top en.wikipedia 2026-10-02' }]);
    await fake.store.saveRun({ id: 'rr-1', ideaJobId: 'idea-1', request: {}, status: 'PARTIAL', topics: [], coverage: [], itemIds: [item.id], reusedFromCache: 0, limitations: ['l'], startedAt: 'a', finishedAt: 'b' });
    const res = await runRoute(req('/api/research/runs/rr-1'), { params: Promise.resolve({ id: 'rr-1' }) });
    const body = await res.json() as { run: Record<string, unknown>; items: Array<{ url: string }> };
    expect(body.run).toMatchObject({ id: 'rr-1', status: 'PARTIAL', limitations: ['l'] });
    expect(body.run).not.toHaveProperty('request');
    expect(body.items.map((i) => i.url)).toEqual(['https://en.wikipedia.org/wiki/X']);
    expect((await runRoute(req('/api/research/runs/nope'), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(404);
  });
});

describe('GET /api/development/:ideaJobId', () => {
  it('the idea’s job, its stages named from their keys, its artifacts and its proposal; another job type is 404', async () => {
    fake.jobs.set('idea-1', { id: 'idea-1', type: 'AUTO_IDEA', status: 'GENERATING', progress: { phase: 'concepts', message: 'Developing three concepts', step: 3, total: 8 }, attempts: 1, createdAt: 'x' });
    fake.jobs.set('job-x', { id: 'job-x', type: 'PLAN_SHOTS', status: 'COMPLETED' });
    fake.children = [
      { id: 'c1', type: 'IDEA_RESEARCH', status: 'COMPLETED', idempotencyKey: 'idea:idea-1:RESEARCH:1', result: { artifactId: 'dev-1' }, attempts: 1 },
      { id: 'c2', type: 'IDEA_REVIEW', status: 'GENERATING', idempotencyKey: 'idea:idea-1:AUDIENCE_REVIEW:1', progress: { message: 'Reviewing draft 1 as the audience' }, attempts: 1 },
    ];
    fake.artifacts = [{ id: 'dev-1', stage: 'RESEARCH', version: 1 }];
    fake.proposals = [{ id: 'proposal-1', createdAt: 'y' }];
    const res = await development(req('/api/development/idea-1'), { params: Promise.resolve({ ideaJobId: 'idea-1' }) });
    const body = await res.json() as { job: { progress: { message: string } }; stages: Array<{ stage: string; status: string }>; artifacts: unknown[]; proposal: { id: string } };
    expect(body.job.progress.message).toBe('Developing three concepts');
    expect(body.stages.map((s) => [s.stage, s.status])).toEqual([['RESEARCH', 'COMPLETED'], ['AUDIENCE_REVIEW', 'GENERATING']]);
    expect(body.artifacts).toHaveLength(1);
    expect(body.proposal.id).toBe('proposal-1');
    expect((await development(req('/api/development/job-x'), { params: Promise.resolve({ ideaJobId: 'job-x' }) })).status).toBe(404);
  });
});
