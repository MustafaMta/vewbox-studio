import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/domain/jobs';
import type { StudioState } from '@/domain/types';

/** GENERATE_TAKE end to end with every engine mocked: what the handler sends for each relation and what it records.
 *  CONTINUATION (local): the previous take's last 22 frames WITH their sound at frame 0, the recorded line at frame 22,
 *  the canonical images and the plate re-applied and bound in the prompt, the speech check reading after the head,
 *  the take recording its relation and the take it continues. CUT: the opening frame anchored and bound, the ending
 *  frame anchored. Hosted continuation: the previous take's last frame as the first frame, nothing silently dropped. */

const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, backend: 'local' as 'local' | 'api', requests: [] as Array<Record<string, unknown>>, commands: [] as Array<{ name: string; args: unknown[] }>, ffmpegArgs: [] as string[][], tails: [] as unknown[][], closing: [] as string[], qaExpect: [] as Array<{ durationSeconds: number }>, tmp: '' }));

vi.mock('@/server/studio/engine', () => ({
  readState: async () => ({ state: fake.state, version: 1, hash: 'h' }),
  command: async (name: string, args: unknown[]) => { fake.commands.push({ name, args }); return name === 'addTake' ? { take: { id: 'take-new' } } : {}; },
  commands: async (list: Array<{ name: string; args: unknown[] }>) => { fake.commands.push(...list); return {}; },
}));
vi.mock('@/server/media', () => ({
  adoptFile: async (_id: string, file: string) => ({ absPath: file, probe: { durationSeconds: 2.55 } }),
  assetFromStored: (id: string, _st: unknown, extra: Record<string, unknown>) => ({ id, ...extra }),
  ffprobe: async () => ({ durationSeconds: 1.8 }),
  fileFor: (f: { path: string }) => `/lib/${f.path}`,
  libraryRoot: () => '/lib',
}));
vi.mock('@/server/media/ffmpeg', async (orig) => ({
  ...(await orig<typeof import('@/server/media/ffmpeg')>()),
  ffmpeg: async (args: string[]) => { fake.ffmpegArgs.push(args); return { stderr: '', ms: 1 }; },
  joinSpeech: async (_lines: unknown[], out: string) => ({ file: out, durationSeconds: 2.55, windows: [{ from: 0.4, to: 2.2 }] }),
  qaTake: async (_file: string, expect: { durationSeconds: number }) => { fake.qaExpect.push(expect); return { report: { ok: true, checks: [{ name: 'decodable', ok: true }] }, probe: { durationSeconds: 158 / 24, width: 1280, height: 736, hasAudio: true } }; },
  tailClip: async (...a: unknown[]) => { fake.tails.push(a); return '/tmp/tail.mov'; },
  lastFrame: async (video: string) => { fake.closing.push(video); return '/tmp/last.png'; },
  thumbnail: async (_v: string, out: string) => out,
  webReady: async (_i: string, out: string) => out,
  trimAudio: async (_i: string, out: string) => out,
  tmpDir: async (prefix: string) => fs.mkdtemp(path.join(fake.tmp, `${prefix}-`)),
}));
vi.mock('@/server/providers/video', () => ({
  chooseBackend: () => fake.backend,
  generateVideo: async (req: Record<string, unknown>) => { fake.requests.push(req); const dir = await fs.mkdtemp(path.join(fake.tmp, 'h3-')); return { file: path.join(dir, 'h3.mp4'), backend: fake.backend, model: 'MiniMax-H3', requestId: 'p1', resolution: '1280x736', seconds: 158 / 24, ms: 1, engineMs: 1, workflowVersion: 'wv', params: {} }; },
}));
vi.mock('@/server/providers/speech', () => ({ VOICE_GATES: { cer: 0.15 }, transcribe: async () => ({ text: 'We close in ten minutes.', segments: [{ start: 0.5, end: 2.1, text: 'We close in ten minutes.', words: [] }] }) }));
vi.mock('@/worker/handlers/voice', () => ({
  TAKE_COVERAGE: 0.7,
  judgeHeard: () => ({ ok: true, coverage: 1, wer: 0, cer: 0, reasons: [] }),
  lineLanguage: () => 'EN', lineRecordingCurrent: () => true, referenceWav: async () => null, shouldRegenerate: () => false,
  speakLine: async () => { throw new Error('no line is recorded: it is stored'); }, verifyLine: async () => null,
}));
vi.mock('@/server/media/lyrics', () => ({ alignLyrics: () => [{ from: 0.5, to: 2.1, method: 'ALIGNED', confidence: 0.9 }] }));
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {} }));
vi.mock('@/server/env', () => ({ env: () => ({ CODE_VERSION: 'test' }) }));
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h', recordQaReport: async () => 'qa' }));

import { generateTake } from '@/worker/handlers/take';
import { fixture } from './continuity-fixture';

const ctx = (productionId: string, shotId: string) => ({
  job: { id: 'job-take', type: 'GENERATE_TAKE', status: 'PREPARING', attempts: 0, payload: { productionId, shotId }, providerTaskId: undefined } as unknown as Job,
  tool: (_id: string, fn: () => unknown) => fn(),
  gpu: (_f: string, _mb: number, fn: () => unknown) => fn(),
  checkpoint: async () => {}, progress: async () => {}, activity: async () => {}, event: async () => {},
}) as unknown as Parameters<typeof generateTake>[0];
const addTake = () => fake.commands.find((c) => c.name === 'addTake')!.args[2] as Record<string, unknown> & { references: Array<Record<string, unknown>>; soundtrack: { lines: Array<{ from: number; to: number }> } };

beforeEach(async () => {
  fake.requests = []; fake.commands = []; fake.ffmpegArgs = []; fake.tails = []; fake.closing = []; fake.qaExpect = [];
  fake.tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-take-'));
  fake.backend = 'local';
});

describe('GENERATE_TAKE by relation', () => {
  it('CONTINUATION: tail frames + their sound at 0, the line at 22, references re-applied and bound; speech heard after the head', async () => {
    const { state, p } = fixture(); fake.state = state;
    await generateTake(ctx(p.id, 's12'));
    expect(fake.tails[0]).toEqual(['/lib/vid/vid-a.mp4', expect.stringMatching(/tail\.mp4$/), 22]);
    const req = fake.requests[0] as { guides: unknown[]; referenceImages: Array<{ file: string }>; firstFrame?: unknown; seconds: number; prompt: string; lowering?: string };
    expect(req.guides).toEqual([{ frameIdx: 0, imageFile: '/tmp/tail.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audioFile: expect.stringMatching(/dialogue\.wav$/) }]);
    expect(req.referenceImages.map((r) => r.file)).toEqual(['/lib/img/canon-a.png', '/lib/img/canon-b.png', '/lib/img/plate-dusk.png']);
    expect(req.firstFrame).toBeUndefined();
    expect(req.seconds).toBeCloseTo(5 + 22 / 24, 3);
    expect(req.prompt).toMatch(/<Subject 1> is the [^\n]+ in <Picture 1>/);
    expect(req.prompt).toContain('It continues the previous shot without a cut');
    expect(req.prompt).toContain('<Subject 1> (S1) says, <d>[English] We close in ten minutes.</d>');
    // the clip the engine makes, not the rounded seconds
    expect(fake.qaExpect[0].durationSeconds).toBeCloseTo(158 / 24, 5);
    // the speech check starts after the 22 repeated frames
    const asr = fake.ffmpegArgs.find((a) => a.includes('16000'))!;
    expect(asr.slice(asr.indexOf('-ss'), asr.indexOf('-ss') + 2)).toEqual(['-ss', '0.916667']);
    const t = addTake();
    expect(t).toMatchObject({ trimStartFrames: 22, relation: 'CONTINUATION', continuesTakeId: 'take-a', status: 'READY' });
    expect(t.soundtrack.lines[0].from).toBeCloseTo(0.5 + 22 / 24, 5);
    expect(t.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'VIDEO', assetId: 'vid-a', binding: 'guide@0' }),
      expect.objectContaining({ kind: 'CHARACTER', assetId: 'canon-a', binding: '<Picture 1> = <Subject 1>' }),
      expect.objectContaining({ kind: 'CHARACTER', assetId: 'canon-b', binding: '<Picture 2> = <Subject 2>', note: 'canonical image (draft)' }),
      expect.objectContaining({ kind: 'LOCATION', assetId: 'plate-dusk', binding: '<Picture 3> = <Subject 3>' }),
    ]));
    expect(t.references.some((r) => r.assetId === 'open-12')).toBe(false);
  });

  it('CUT: the drawn opening frame anchored at 0 and bound as <Picture 3>; the ending frame anchored; no tail', async () => {
    const { state, p } = fixture(); fake.state = state;
    await generateTake(ctx(p.id, 's13'));
    expect(fake.tails).toEqual([]);
    const req = fake.requests[0] as { guides?: unknown[]; referenceImages: Array<{ file: string }>; firstFrame?: { file: string }; lastFrame?: { file: string }; prompt: string };
    expect(req.referenceImages.map((r) => r.file)).toEqual(['/lib/img/canon-a.png', '/lib/img/plate-dusk.png', '/lib/img/open-13.png']);
    expect(req.firstFrame?.file).toBe('/lib/img/open-13.png');
    expect(req.lastFrame?.file).toBe('/lib/img/end-13.png');
    expect(req.guides).toBeUndefined();
    expect(req.prompt).toContain('<Picture 3> is the first frame of [Shot 1]');
    expect(req.prompt).toContain('a new camera angle on the same moment as the previous shot');
    const t = addTake();
    expect(t).toMatchObject({ relation: 'CUT' });
    expect(t.trimStartFrames).toBeUndefined();
    expect(t.continuesTakeId).toBeUndefined();
    expect(t.references).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'FIRST_FRAME', assetId: 'open-13', binding: 'guide@0' }), expect.objectContaining({ kind: 'LAST_FRAME', assetId: 'end-13', binding: 'guide@-1' })]));
  });

  it('hosted CONTINUATION: the previous take’s last frame as the first frame, no references, no guides, the lowering recorded', async () => {
    const { state, p } = fixture(); fake.state = state; fake.backend = 'api';
    await generateTake(ctx(p.id, 's12'));
    expect(fake.closing).toEqual(['/lib/vid/vid-a.mp4']);
    const req = fake.requests[0] as { guides?: unknown[]; referenceImages?: unknown[]; firstFrame?: { file: string }; lowering?: string; prompt: string };
    expect(req.firstFrame?.file).toBe('/tmp/last.png');
    expect(req.referenceImages).toBeUndefined();
    expect(req.guides).toBeUndefined();
    expect(req.lowering).toMatch(/last frame as the first frame/);
    expect(req.prompt).toContain('<d>[English] We close in ten minutes.</d>');
    expect(addTake()).toMatchObject({ relation: 'CONTINUATION', continuesTakeId: 'take-a' });
  });

  it('refuses a producer prompt that names a picture the request does not connect (PROMPT_AMBIGUITY), before the engine', async () => {
    const { state, p } = fixture(); fake.state = state;
    const c = ctx(p.id, 's13');
    (c.job.payload as Record<string, unknown>).prompt = 'She waves at <Picture 7>.';
    await expect(generateTake(c)).rejects.toMatchObject({ failureClass: 'PROMPT_AMBIGUITY' });
    expect(fake.requests).toEqual([]);
  });
});
