import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue } from '@/server/jobs/queue';
import { command, commands, readState } from '@/server/studio/engine';
import { jobOutputs } from '@/server/jobs/outputs';
import { assetFromStored } from '@/server/media';
import { correctLipsync } from '@/worker/handlers/lipsync';
import type { HandlerContext } from '@/worker/handlers';
import type { Job } from '@/domain/jobs';

/** CORRECT_LIPSYNC is never silent and never runs on an ineligible take: the payload must carry the producer's
 *  confirmation and the visual review's reason (refused at enqueue), and a take of a style the corrector is not enabled
 *  for fails the job with the reason before any GPU or service call — no take is added. Test database only. */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-lipsync-'));
const made: string[] = [];
let productionId = ''; let shotId = ''; let takeId = '';

beforeAll(async () => {
  const [prod] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title: 'Lip-sync correction test', style: 'CARTOON', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productionId = prod.production.id;
  const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'MIDDAY' }]);
  shotId = (await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' }])).shot.id;
  const clip = path.join(tmp, 'take.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
  const out = jobOutputs({ id: `job-lipsync-fixture-${Date.now().toString(36)}`, attempts: 1 });
  const v = await out.adopt('video', clip, { expectKind: 'VIDEO' });
  await commands([{ name: 'addAsset', args: [assetFromStored(v.id, v.stored, { label: 'fixture take', tags: ['take'], origin: 'GENERATED' })] }]);
  const [r] = await commands([{ name: 'addTake', args: [productionId, shotId, { assetId: v.id, label: 'Take 1', provider: 'MINIMAX', status: 'READY', durationSeconds: 1, fps: 24, params: { lipSync: { verdict: 'FAIL' } }, soundtrack: { kind: 'DIALOGUE', assetId: v.id, lines: [] } }] }]) as [{ take: { id: string } }];
  takeId = r.take.id;
}, 60_000);

afterAll(async () => {
  if (made.length) { await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().delete(schema.jobs).where(inArray(schema.jobs.id, made)); }
  if (productionId) await commands([{ name: 'deleteProduction', args: [productionId] }]).catch(() => undefined);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ctxFor = (job: Job, calls: string[]): HandlerContext => ({
  job, log: { info() {}, warn() {}, error() {}, debug() {} } as never, workerId: 'test', agent: {} as never, runId: 'run',
  tool: (async (id: string) => { calls.push(`tool:${id}`); throw new Error('no tool call expected'); }) as never,
  activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async () => {},
  gpu: (async () => { calls.push('gpu'); throw new Error('no GPU expected'); }) as never,
});

describe('CORRECT_LIPSYNC', () => {
  it('an unconfirmed request, or one without the visual review\'s reason, is refused when it is queued', async () => {
    await expect(enqueue({ type: 'CORRECT_LIPSYNC', payload: { productionId, shotId, takeId, reason: 'late mouth' } as never })).rejects.toThrow();
    await expect(enqueue({ type: 'CORRECT_LIPSYNC', payload: { productionId, shotId, takeId, confirm: true } as never })).rejects.toThrow();
  });
  it('a cartoon take is refused with the reason before any GPU or service call; no take is added', async () => {
    const { job } = await enqueue({ type: 'CORRECT_LIPSYNC', payload: { productionId, shotId, takeId, confirm: true, reason: 'the mouth closes late on every vowel' }, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);
    const calls: string[] = [];
    await expect(correctLipsync(ctxFor(job, calls))).rejects.toThrow(/not enabled for cartoon faces/);
    expect(calls).toEqual([]);
    const sh = (await readState()).state.productions.find((p) => p.id === productionId)!.shots.find((s) => s.id === shotId)!;
    expect(sh.takes.map((t) => t.id)).toEqual([takeId]);
  });
});
