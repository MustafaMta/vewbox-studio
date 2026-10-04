import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { gpuStatus } from '@/server/gpu/status';
import { UNLOAD_METRIC, unloadFor } from '@/server/gpu/unloaders';
import { recentCommands } from '@/server/studio/journal';
import { applyCommands } from '@/server/studio/engine';
import type { Command } from '@/domain/commands';

/** THE ENGINE ROOM'S READ-ONLY APIS on the test database: GET /api/studio/gpu (holders, waiters in admission order,
 *  what is loaded, the last unloads) and GET /api/studio/commands (the newest journal entries, no payloads). */

const resource = `gpu-test-${Math.random().toString(36).slice(2, 8)}`;
afterAll(async () => { await db().delete(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource)); await db().delete(schema.resourceState).where(eq(schema.resourceState.resource, resource)); });

describe('engine room APIs', () => {
  it('the GPU status lists the holder, the waiters in ticket order (expired rows left out), what is loaded and the last unloads', async () => {
    const now = Date.now(); const iso = (ms: number) => new Date(now + ms).toISOString();
    await db().insert(schema.resourceLeases).values([
      { resource, holder: 'p1:1', family: 'IMAGE', state: 'HOLDING', jobId: 'job-a', process: 'p1', requestedAt: iso(-5000), grantedAt: iso(-4000), expiresAt: iso(60_000) },
      { resource, holder: 'p2:1', family: 'TTS', state: 'WAITING', jobId: 'job-b', process: 'p2', requestedAt: iso(-3000), expiresAt: iso(60_000) },
      { resource, holder: 'p2:2', family: 'ASR', state: 'WAITING', jobId: null, process: 'p2', requestedAt: iso(-2000), expiresAt: iso(60_000) },
      { resource, holder: 'dead:1', family: 'VIDEO', state: 'WAITING', jobId: null, process: 'dead', requestedAt: iso(-1000), expiresAt: iso(-1) },
    ]);
    await db().insert(schema.resourceState).values({ resource, loadedFamily: 'IMAGE', updatedAt: iso(-4000) });
    await unloadFor('IMAGE', 'TTS', [{ name: 'fake-comfy', serves: ['IMAGE'], unload: async () => undefined }, { name: 'fake-tts', serves: ['TTS'], unload: async () => undefined }]);
    const s = await gpuStatus({ resource });
    expect(s.loaded.family).toBe('IMAGE');
    expect(s.holders.map((h) => [h.holder, h.family, h.jobId])).toEqual([['p1:1', 'IMAGE', 'job-a']]);
    expect(s.waiting.map((w) => [w.holder, w.family, w.position])).toEqual([['p2:1', 'TTS', 1], ['p2:2', 'ASR', 2]]);
    expect(s.unloads[0]).toMatchObject({ engine: 'fake-comfy', from: 'IMAGE', to: 'TTS', ok: true });
    expect((await db().select().from(schema.metrics).where(eq(schema.metrics.name, UNLOAD_METRIC))).length).toBeGreaterThan(0);
  });

  it('the command log lists the newest batches with their commands and targets, never their arguments', async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    await applyCommands([{ name: 'addLocation', args: [{ name: `Engine room ${tag}`, kind: 'INTERIOR', description: `private description ${tag}`, style: 'ANIME', lighting: [], landmarks: [], props: [] }], seed: `er-${tag}`, at: new Date().toISOString() } as unknown as Command], 'worker');
    const [latest] = await recentCommands(5);
    expect(latest).toMatchObject({ sender: 'worker', ok: true, commands: [{ name: 'addLocation', touches: [] }] });
    expect(JSON.stringify(await recentCommands(5))).not.toContain(`private description ${tag}`);
    expect((await recentCommands(1000)).length).toBeLessThanOrEqual(200);
  });
});
