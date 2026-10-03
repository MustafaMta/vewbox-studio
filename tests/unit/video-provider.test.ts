import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** generateVideo on both backends with the engines mocked: the hosted API REFUSES what it cannot do (anchored guides,
 *  frame roles mixed with references) instead of silently dropping it (P0.5); the local graph carries the
 *  continuation tail's sound (P0.2), records the clip it really makes (frames snapped up) and frees ComfyUI's models
 *  before switching between the FL2VA and Ref2VA checkpoints (the OOM kill measured on 2026-10-03). */

const fake = vi.hoisted(() => ({ backend: 'local' as 'local' | 'api', graphs: [] as Array<Record<string, { class_type: string; inputs: Record<string, unknown> }>>, frees: 0, created: 0 }));
vi.mock('@/server/env', () => ({ env: () => ({ VIDEO_BACKEND: fake.backend, MINIMAX_API_KEY: fake.backend === 'api' ? 'k' : '', MINIMAX_VIDEO_MODEL: 'MiniMax-H3', MINIMAX_VIDEO_RESOLUTION: '768P', LOG_LEVEL: 'silent' }) }));
vi.mock('@/server/providers/minimax', () => ({
  dataUri: async () => 'data:x',
  createVideo: async () => { fake.created++; return { taskId: 't1' }; },
  waitForVideo: async () => ({ status: 'Success', url: 'http://x/v.mp4', duration: 6, resolution: '768P' }),
  download: async (_u: string, file: string) => { await fs.writeFile(file, 'x'); },
  estimateVideoCostUsd: () => 0.5,
  cancelVideo: async () => ({ action: 'cancelled' }),
}));
vi.mock('@/server/providers/comfy', () => ({
  health: async () => ({ ok: true }),
  uploadInput: async (file: string) => `up-${path.basename(file)}`,
  run: async (graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => { fake.graphs.push(graph); return { promptId: 'p1', outputs: { '16': { video: [{ filename: 'h3.mp4', subfolder: 'vewbox', type: 'output' }] } }, ms: 10, engineMs: 9, workflowVersion: 'wv' }; },
  firstOutput: (outputs: Record<string, { video?: unknown[] }>, kind: string) => (kind === 'video' ? outputs['16']?.video?.[0] : undefined),
  view: async () => Buffer.from('mp4'),
  free: async () => { fake.frees++; },
}));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async (prefix: string) => fs.mkdtemp(path.join(os.tmpdir(), `vb-${prefix}-`)) }));

import { generateVideo, hostedVideoProblem } from '@/server/providers/video';

const base = { prompt: 'p', seconds: 6, width: 1280, height: 720, aspect: 'WIDE_16_9' };
const pic = { file: '/lib/a.png', mime: 'image/png' };

beforeEach(() => { fake.graphs = []; fake.frees = 0; fake.created = 0; });

describe('hosted API (P0.5)', () => {
  it('names what it cannot do', () => {
    expect(hostedVideoProblem({ guides: [{ frameIdx: 0, imageFile: '/t.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audioFile: '/l.wav' }] })).toMatch(/no anchored guides \(2 given: clip@0, audio@22\)/);
    expect(hostedVideoProblem({ firstFrame: pic, referenceImages: [pic] })).toMatch(/cannot mix a first\/last frame with reference/);
    expect(hostedVideoProblem({ referenceAudio: [{ file: '/a.wav' }] })).toMatch(/needs a reference picture/);
    expect(hostedVideoProblem({ referenceImages: [pic], referenceAudio: [{ file: '/a.wav' }] })).toBeNull();
    expect(hostedVideoProblem({ firstFrame: pic, lastFrame: pic })).toBeNull();
  });
  it('refuses a request with guides — NOT_CONFIGURED, failure class UNSUPPORTED_CAPABILITY — before any task is created', async () => {
    fake.backend = 'api';
    await expect(generateVideo({ ...base, referenceImages: [pic], guides: [{ frameIdx: 0, audioFile: '/l.wav' }] })).rejects.toMatchObject({ code: 'NOT_CONFIGURED', failureClass: 'UNSUPPORTED_CAPABILITY' });
    await expect(generateVideo({ ...base, firstFrame: pic, referenceImages: [pic] })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fake.created).toBe(0);
  });
  it('runs a lowered request and records the lowering', async () => {
    fake.backend = 'api';
    const r = await generateVideo({ ...base, firstFrame: pic, lowering: 'hosted continuation: last frame as first frame' });
    expect(fake.created).toBe(1);
    expect(r.params).toMatchObject({ lowering: 'hosted continuation: last frame as first frame', content: [{ type: 'text' }, { type: 'image_url', role: 'first_frame' }] });
  });
});

describe('local engine', () => {
  it('wires the tail’s own sound into the continuation guide and records the snapped clip (P0.1, P0.2)', async () => {
    fake.backend = 'local';
    const r = await generateVideo({ ...base, seconds: 5 + 22 / 24, referenceImages: [pic, { file: '/lib/plate.png', mime: 'image/png' }], guides: [{ frameIdx: 0, imageFile: '/tmp/tail.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audioFile: '/tmp/line.wav' }] });
    const g = fake.graphs[0];
    expect(g.g0.inputs).toMatchObject({ image: ['g0c', 0], audio: ['g0c', 1] });
    expect(g.g0v.inputs.file).toBe('up-tail.mov');
    expect(g['7'].inputs.length).toBe(158);
    expect(r.seconds).toBeCloseTo(158 / 24, 5);
    expect(r.params).toMatchObject({ graph: 'REF2VA', frames: 158, refs: 2, guides: [{ frameIdx: 0, video: true, audio: true }, { frameIdx: 22, image: false, audio: true }] });
  });
  it('a reference shot keeps its opening and ending frames as anchors (P0.7)', async () => {
    fake.backend = 'local';
    await generateVideo({ ...base, referenceImages: [pic], firstFrame: { file: '/lib/open.png', mime: 'image/png' }, lastFrame: { file: '/lib/end.png', mime: 'image/png' } });
    const g = fake.graphs[0];
    expect(Object.values(g).filter((n) => n.class_type === 'MiniMaxH3AddGuide').map((n) => n.inputs.frame_idx)).toEqual([0, -1]);
  });
  it('frees ComfyUI’s models before switching between the FL2VA and Ref2VA checkpoints, not between runs on the same one', async () => {
    fake.backend = 'local';
    await generateVideo({ ...base, referenceImages: [pic] });
    await generateVideo({ ...base, referenceImages: [pic] });
    const before = fake.frees;
    await generateVideo({ ...base, firstFrame: pic });
    expect(fake.frees).toBe(before + 1);
    await generateVideo({ ...base, firstFrame: pic });
    expect(fake.frees).toBe(before + 1);
  });
});
