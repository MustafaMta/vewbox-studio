import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/domain/types';

/** MEDIA_PROBE AS THE PRESENTATION RETRY (AUDIT C9, docs/DESIGN-SYSTEM-V4.md §2.4): the upload route queues the
 *  Technical Media Inspector's probe for a picture whose presentation could not be measured as it was stored, and
 *  the probe measures a picture that has none — never redoing one, never failing on a picture it cannot read. The
 *  studio, the queue and storage are faked; the measure is the real one, on a PNG ffmpeg writes here. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-presentation-probe-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const fake = vi.hoisted(() => ({
  assets: [] as Array<Record<string, unknown>>, commands: [] as Array<{ name: string; args: unknown[] }>, enqueued: [] as Array<Record<string, unknown>>,
  files: new Map<string, string>(), stored: {} as Record<string, unknown>, enqueueFails: false,
}));

vi.mock('@/server/studio/engine', () => ({
  readState: async () => ({ state: { assets: fake.assets } }),
  command: async (name: string, args: unknown[]) => { fake.commands.push({ name, args }); return name === 'addAsset' ? { asset: { ...(args[0] as object), createdAt: 'x' } } : undefined; },
}));
vi.mock('@/server/media', () => ({
  assetFile: (a: { id: string }) => fake.files.get(a.id) ?? '/missing.png',
  ffprobe: async (file: string) => (file.endsWith('.png') && fs.existsSync(file) ? { width: 64, height: 48, hasVideo: true, hasAudio: false } : { width: 160, height: 90, durationSeconds: 2, hasVideo: true, hasAudio: false }),
  decodeCheck: async () => ({ ok: true, frames: -1 }),
  storeBuffer: async (id: string, buf: Buffer) => ({ relPath: `image/${id}.png`, absPath: `/lib/image/${id}.png`, bytes: buf.length, mime: 'image/png', kind: 'IMAGE', ext: 'png', sha256: 'x', probe: { width: 64, height: 48 }, ...fake.stored }),
  assetFromStored: (id: string, stored: { kind: string; presentation?: unknown }, meta: { label: string; tags: string[]; origin: string }) => ({ id, kind: stored.kind, src: `/api/media/${id}`, label: meta.label, tags: meta.tags, sample: false, origin: meta.origin, ...(stored.presentation ? { presentation: stored.presentation } : {}) }),
  removeFile: async () => {},
}));
vi.mock('@/server/jobs/queue', () => ({ enqueue: async (input: Record<string, unknown>) => { if (fake.enqueueFails) throw new Error('Job intake is paused'); fake.enqueued.push(input); return { job: { id: 'job-1' }, created: true }; } }));
vi.mock('@/server/env', () => ({ env: () => ({ MAX_UPLOAD_MB: 2048 }) }));

const { mediaProbe } = await import('@/worker/handlers/media-probe');
const { POST } = await import('@/app/api/assets/route');
const { presentationFromPixels, faceBoxFromReading } = await import('@/server/media/presentation');

/** 64×48: a teal field with a 4 px warm-grey border. */
const pixels = () => {
  const data = new Uint8Array(64 * 48 * 4);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) data.set(x < 4 || y < 4 || x >= 60 || y >= 44 ? [150, 146, 140, 255] : [30, 140, 150, 255], (y * 64 + x) * 4);
  return { data, width: 64, height: 48 };
};
const png = path.join(dir, 'plate.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '64x48', '-i', 'pipe:0', '-frames:v', '1', png], { input: Buffer.from(pixels().data) });
const garbage = path.join(dir, 'garbage.png');
fs.writeFileSync(garbage, 'not a picture at all');

const picture = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'UPLOAD', width: 64, height: 48, provenance: { path: `image/${id}.png` }, createdAt: 'x', ...extra });
const events: Array<{ level: string; message: string }> = [];
const ctx = (assetId: string) => ({ job: { id: 'job-1', payload: { assetId } }, tool: async <T>(_id: string, fn: () => Promise<T>) => fn(), progress: async () => {}, event: async (level: string, message: string) => { events.push({ level, message }); } }) as never;
const patchOf = () => (fake.commands.find((c) => c.name === 'updateAsset')?.args[1] ?? {}) as Record<string, unknown>;

beforeEach(() => { fake.assets = []; fake.commands = []; fake.enqueued = []; fake.files = new Map(); fake.stored = {}; fake.enqueueFails = false; events.length = 0; });

describe('MEDIA_PROBE measures a picture that has no presentation', () => {
  it('measures it from the pixels and stores it with the probe', async () => {
    fake.assets = [picture('up-a')]; fake.files.set('up-a', png);
    const r = await mediaProbe(ctx('up-a')) as Record<string, unknown>;
    expect(patchOf().presentation).toEqual(presentationFromPixels(pixels()));
    expect(r.presentation).toEqual(patchOf().presentation);
    expect(patchOf()).toMatchObject({ width: 64, height: 48, unavailable: false });
  });
  it('adds the face box already measured on that picture (one MediaPipe box)', async () => {
    const provenance = { path: 'image/up-b.png', reading: { boxes: [{ x: 16, y: 8, width: 16, height: 12 }] } };
    fake.assets = [picture('up-b', { provenance })]; fake.files.set('up-b', png);
    await mediaProbe(ctx('up-b'));
    expect(patchOf().presentation).toEqual({ ...presentationFromPixels(pixels()), faceBox: faceBoxFromReading(provenance, { width: 64, height: 48 }) });
  });
  it('never redoes a stored presentation (focal and face box set later stay)', async () => {
    fake.assets = [picture('up-c', { presentation: { dominant: 'oklch(0.500 0.100 200.0)', focal: { x: 0.3, y: 0.3 } } })]; fake.files.set('up-c', png);
    const r = await mediaProbe(ctx('up-c')) as Record<string, unknown>;
    expect('presentation' in patchOf()).toBe(false);
    expect(r.presentation).toBeUndefined();
  });
  it('a picture it cannot measure: the probe still completes, says why, and leaves the field empty', async () => {
    fake.assets = [picture('up-d')]; fake.files.set('up-d', garbage);
    await expect(mediaProbe(ctx('up-d'))).resolves.toBeDefined();
    expect('presentation' in patchOf()).toBe(false);
    expect(events.find((e) => e.level === 'warn')?.message).toMatch(/presentation could not be measured/);
  });
  it('a video gets no presentation', async () => {
    fake.assets = [{ ...picture('gen-v'), kind: 'VIDEO' }]; fake.files.set('gen-v', path.join(dir, 'clip.mp4'));
    await mediaProbe(ctx('gen-v'));
    expect('presentation' in patchOf()).toBe(false);
  });
});

describe('the upload route queues the probe only for a picture it could not measure', () => {
  const upload = () => { const fd = new FormData(); fd.set('file', new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 'plate.png', { type: 'image/png' })); return POST(new Request('http://studio.test/api/assets', { method: 'POST', body: fd }), undefined); };
  it('measured at upload: stored on the asset, nothing queued', async () => {
    fake.stored = { presentation: { edge: 'oklch(0.600 0.000 0.0)', lightBackdrop: false } };
    const res = await upload();
    expect(res.status).toBe(201);
    expect(((await res.json()) as { asset: Asset }).asset.presentation).toEqual(fake.stored.presentation);
    expect(fake.enqueued).toHaveLength(0);
  });
  it('not measurable at upload: MEDIA_PROBE is queued once for it (idempotency key), the upload succeeds', async () => {
    fake.stored = { presentationError: 'the picture has no dimensions' };
    const res = await upload();
    expect(res.status).toBe(201);
    const { asset } = (await res.json()) as { asset: Asset };
    expect(asset.presentation).toBeUndefined();
    expect(fake.enqueued).toEqual([{ type: 'MEDIA_PROBE', payload: { assetId: asset.id }, idempotencyKey: `upload-probe-${asset.id}` }]);
  });
  it('a queue that refuses (intake paused) never fails the upload', async () => {
    fake.stored = { presentationError: 'x' }; fake.enqueueFails = true;
    expect((await upload()).status).toBe(201);
  });
});
