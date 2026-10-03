import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Audit H6: GET /api/registry reads what the last sync wrote and never syncs (a sync is an engine round trip and
 *  ~47 upserts); the worker syncs on boot and POST is the explicit "check again". The registry module is faked; the
 *  route is the real one. */

const fake = vi.hoisted(() => ({ syncs: 0, reads: 0 }));
vi.mock('@/server/registry', () => ({
  syncRegistry: async () => { fake.syncs++; return { models: 47, workflows: 15, present: 30 }; },
  readRegistry: async () => { fake.reads++; return { models: [{ name: 'vae/x.safetensors', status: 'PRESENT' }], workflows: [] }; },
}));

import { GET, POST } from '@/app/api/registry/route';

beforeEach(() => { fake.syncs = 0; fake.reads = 0; });

describe('/api/registry', () => {
  it('GET reads the registry and does not sync (no write on read)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await GET(new Request('http://studio.test/api/registry'), undefined);
      expect(res.status).toBe(200);
      const body = await res.json() as { models: unknown[]; synced?: unknown };
      expect(body.models).toHaveLength(1);
      expect(body.synced).toBeUndefined();
    }
    expect(fake.syncs).toBe(0);
    expect(fake.reads).toBe(3);
  });

  it('POST syncs once and answers with the registry as written', async () => {
    const res = await POST(new Request('http://studio.test/api/registry', { method: 'POST' }), undefined);
    const body = await res.json() as { models: unknown[]; synced: { models: number } };
    expect(fake.syncs).toBe(1);
    expect(body.synced.models).toBe(47);
    expect(body.models).toHaveLength(1);
  });
});
