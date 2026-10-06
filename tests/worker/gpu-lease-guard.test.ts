import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@/server/db/client';
import { leaseDb, leaseDatabaseUrl } from '@/server/gpu/lease-db';
import { createDbGpuLease } from '@/server/gpu/lease';
import { databaseName } from '@/server/test-guard';

/** THE WORKER SUITE KEEPS ITS OWN GPU LEASE (vitest.worker.config.ts sets GPU_LEASE_DATABASE_URL to the test database),
 *  and so the guard refuses its calls to the machine's real engines: the studio's clients answer with the reason, they
 *  never reach the card. (The engine URLs here are whatever .env/.env.local say — the live engines.) */

const resource = `gpu-guard-${Math.random().toString(36).slice(2, 8)}`;
afterAll(async () => { await leaseDb().delete(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource)); await leaseDb().delete(schema.resourceState).where(eq(schema.resourceState.resource, resource)); });

describe('the GPU lease guard in the worker suite', () => {
  it('the lease is the test database, never the live one', () => {
    expect(databaseName(leaseDatabaseUrl())).toBe(databaseName(process.env.DATABASE_URL));
    expect(databaseName(leaseDatabaseUrl())).not.toBe('vewbox');
  });

  it('lease rows land in the lease database', async () => {
    const lease = createDbGpuLease({ process: `guard-${resource}`, resource, pollMs: 15, unload: async () => {} });
    let seen = 0;
    await lease('IMAGE', 1, async () => { seen = (await leaseDb().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource))).length; });
    expect(seen).toBe(1);
  });

  it('the real engines are refused with the reason (ComfyUI, voice, transcription, local story model)', async () => {
    const saved = process.env.VEWBOX_FIXTURE_ENGINES; delete process.env.VEWBOX_FIXTURE_ENGINES;
    try {
      const comfy = await import('@/server/providers/comfy');
      const speech = await import('@/server/providers/speech');
      await expect(comfy.objectInfo()).rejects.toMatchObject({ code: 'NOT_CONFIGURED', details: { reason: 'GPU_LEASE_NOT_SHARED' } });
      expect((await comfy.health()).ok).toBe(false); // health reports it unreachable, never touches it
      await expect(speech.transcribe('tests/fixtures/speech-en.wav')).rejects.toMatchObject({ details: { reason: 'GPU_LEASE_NOT_SHARED' } });
      const { guardedEngineUrl } = await import('@/server/gpu/lease-db');
      expect(() => guardedEngineUrl('http://127.0.0.1:11434', 'the local story model')).toThrow(/may not call the machine's real engine/);
    } finally { if (saved !== undefined) process.env.VEWBOX_FIXTURE_ENGINES = saved; }
  });
});
