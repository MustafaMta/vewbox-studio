import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/domain/jobs';
import type { Asset, Production, Shot, StudioState, WorldBible } from '@/domain/types';

/** GENERATE_TAKE end to end with every engine mocked: what the handler sends for each relation and what it records.
 *  CONTINUATION (local): the previous take's last 22 frames WITH their sound at frame 0, the recorded line at frame 22,
 *  the canonical images and the plate re-applied and bound in the prompt, the speech check reading after the head,
 *  the take recording its relation and the take it continues. CUT: the opening frame anchored and bound, the ending
 *  frame anchored. Hosted continuation: the previous take's last frame as the first frame, nothing silently dropped. */

const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, backend: 'local' as 'local' | 'api', requests: [] as Array<Record<string, unknown>>, commands: [] as Array<{ name: string; args: unknown[] }>, ffmpegArgs: [] as string[][], tails: [] as unknown[][], closing: [] as string[], frames: [] as unknown[][], qaExpect: [] as Array<{ durationSeconds: number }>, tmp: '', bible: undefined as WorldBible | undefined, reads: [] as Array<Record<string, unknown>>, /** what the written tail clip counts as (frames, sound) */ tailClip: { frames: 22, hasAudio: true, audioSeconds: 22 / 24, sampleRate: 48000 } as { frames: number; hasAudio: boolean; audioSeconds?: number; sampleRate?: number }, /** what the generated take's head measures against the tail */ head: { frames: 22, takeFrames: 158, tailFrames: 22, perFrame: [], meanDiff: 1.2, maxDiff: 2, tailMotionP95: 3, lastMatchIndex: 21, lastMatchDiff: 1, plannedLastDiff: 1, threshold: 12, repeats: true, trimStartFrames: 22, corrected: false, detail: 'the head repeats the tail' }, headCalls: [] as unknown[][], /** the joined dialogue's length */ dialogueSeconds: 2.55 }));

vi.mock('@/server/studio/engine', () => ({
  readState: async () => ({ state: fake.state, version: 1, hash: 'h' }),
  command: async (name: string, args: unknown[]) => { fake.commands.push({ name, args }); return name === 'addTake' ? { take: { id: 'take-new' } } : {}; },
  // the take's one commit (step 6): its rows outside the studio (QA reports, the World Bible read) go through `also`
  commands: async (list: Array<{ name: string; args: unknown[] }>, _origin?: string, opts?: { also?: (tx: unknown, results: unknown[]) => Promise<void> }) => { fake.commands.push(...list); const results = list.map((c) => (c.name === 'addTake' ? { take: { id: (c.args[2] as { id?: string }).id ?? 'take-new' } } : {})); await opts?.also?.({}, results); return results; },
}));
vi.mock('@/server/media', () => ({
  adoptFile: async (_id: string, file: string) => ({ absPath: file, probe: { durationSeconds: 2.55 } }),
  assetFromStored: (id: string, _st: unknown, extra: Record<string, unknown>) => ({ id, ...extra }),
  assetFile: (a: { provenance?: { path?: string } }) => `/lib/${a.provenance?.path}`,
  ffprobe: async () => ({ durationSeconds: 1.8 }),
  fileFor: (f: { path: string }) => `/lib/${f.path}`,
  libraryRoot: () => '/lib',
}));
// the World Bible service, with the real pure overlay: the pinned bible is the test's (or derived from the studio)
vi.mock('@/server/world', async () => {
  const w = await vi.importActual<typeof import('@/domain/world')>('@/domain/world');
  return {
    worldForShot: async (state: StudioState, p: Production, sh: Shot) => {
      const bible = fake.bible ?? w.deriveWorld(state, w.worldScopeOf(p), undefined, '2026-10-03T00:00:00.000Z');
      const { state: s, read } = w.overlayWorld(state, bible, p, sh, { id: 'wrev-3', number: 3, pinned: true });
      return { state: s, read, outcome: { view: {}, action: 'KEPT', message: 'pinned to World Bible revision 3', blocking: [] } };
    },
    recordWorldRead: async (r: Record<string, unknown>) => { fake.reads.push(r); },
  };
});
vi.mock('@/server/media/ffmpeg', async (orig) => ({
  ...(await orig<typeof import('@/server/media/ffmpeg')>()),
  ffmpeg: async (args: string[]) => { fake.ffmpegArgs.push(args); return { stderr: '', ms: 1 }; },
  joinSpeech: async (_lines: unknown[], out: string) => ({ file: out, durationSeconds: fake.dialogueSeconds, windows: [{ from: 0.4, to: fake.dialogueSeconds - 0.35 }] }),
  qaTake: async (_file: string, expect: { durationSeconds: number }) => { fake.qaExpect.push(expect); return { report: { ok: true, checks: [{ name: 'decodable', ok: true }] }, probe: { durationSeconds: 158 / 24, width: 1280, height: 736, hasAudio: true } }; },
  tailClip: async (...a: unknown[]) => { fake.tails.push(a); return { file: '/tmp/tail.mov', ...fake.tailClip, sourceEndFrame: 124, sourceTotalFrames: 124 }; },
  frameAt: async (...a: unknown[]) => { fake.frames.push(a); return '/tmp/last.png'; },
  lastFrame: async (video: string) => { fake.closing.push(video); return '/tmp/last.png'; },
  thumbnail: async (_v: string, out: string) => out,
  webReady: async (_i: string, out: string) => out,
  trimAudio: async (_i: string, out: string) => out,
  tmpDir: async (prefix: string) => fs.mkdtemp(path.join(fake.tmp, `${prefix}-`)),
}));
vi.mock('@/server/media/guide-head', async (orig) => ({
  ...(await orig<typeof import('@/server/media/guide-head')>()),
  measureGuideHead: async (...a: unknown[]) => { fake.headCalls.push(a); return fake.head; },
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
vi.mock('@/server/org/runs', () => ({ recordHandoff: async () => 'h', recordQaReport: async () => 'qa', insertQaReport: async () => ({ id: 'qa', created: true }), announceQaReport: async () => {} }));
vi.mock('@/server/world/store', () => ({ insertWorldRead: async (_tx: unknown, r: Record<string, unknown>) => { fake.reads.push(r); } }));

import { generateTake } from '@/worker/handlers/take';
import { takeIdOf } from '@/worker/handlers/take-commit';
import { VideoGenerateInput } from '@/server/org/contracts';
import { deriveWorld, withEstablished, worldScopeOf } from '@/domain/world';
import { fixture, TAKE_A } from './continuity-fixture';

const ctx = (productionId: string, shotId: string) => ({
  job: { id: 'job-take', type: 'GENERATE_TAKE', status: 'PREPARING', attempts: 0, payload: { productionId, shotId }, providerTaskId: undefined } as unknown as Job,
  tool: (_id: string, fn: () => unknown) => fn(),
  gpu: (_f: string, _mb: number, fn: () => unknown) => fn(),
  checkpoint: async () => {}, progress: async () => {}, activity: async () => {}, event: async () => {},
}) as unknown as Parameters<typeof generateTake>[0];
const addTake = () => fake.commands.find((c) => c.name === 'addTake')!.args[2] as Record<string, unknown> & { references: Array<Record<string, unknown>>; soundtrack: { lines: Array<{ from: number; to: number }> } };

beforeEach(async () => {
  fake.requests = []; fake.commands = []; fake.ffmpegArgs = []; fake.tails = []; fake.closing = []; fake.frames = []; fake.qaExpect = []; fake.reads = []; fake.bible = undefined;
  fake.tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-take-'));
  fake.backend = 'local';
  fake.tailClip = { frames: 22, hasAudio: true, audioSeconds: 22 / 24, sampleRate: 48000 };
  fake.head = { ...fake.head, repeats: true, trimStartFrames: 22, corrected: false, lastMatchIndex: 21, meanDiff: 1.2, detail: 'the head repeats the tail' };
  fake.headCalls = []; fake.dialogueSeconds = 2.55;
});

describe('GENERATE_TAKE by relation', () => {
  it('CONTINUATION: tail frames + their sound at 0, the line at 22, references re-applied and bound; speech heard after the head', async () => {
    const { state, p } = fixture(); fake.state = state;
    await generateTake(ctx(p.id, 's12'));
    expect(fake.tails[0]).toEqual(['/lib/vid/vid-a.mp4', expect.stringMatching(/tail\.mp4$/), 22]);
    const req = fake.requests[0] as { guides: unknown[]; referenceImages: Array<{ file: string }>; firstFrame?: unknown; seconds: number; prompt: string; lowering?: string };
    expect(VideoGenerateInput.safeParse(req).error?.issues ?? []).toEqual([]); // what the tool runner validates
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
    // the take records the window it was made for (the cut shows exactly these frames), the guide the node really
    // kept (counted from the written clip: the trim reads this), and the World Bible it read
    expect(t.params).toMatchObject({ timeline: { newFrames: 120, headFrames: 22, basis: 'DIALOGUE' }, guide: { frames: 22, sourceFrames: 22, withAudio: true, audioLatentSteps: 36.67, sourceEndFrame: 124, join: 'TRIM', head: { repeats: true, trimStartFrames: 22 } }, world: { revisionId: 'wrev-3', revision: 3, pinned: true, plate: { assetId: 'plate-dusk', role: 'STATE' } } });
    // the head was measured against the tail clip the guide was cut from, for the guide's length
    expect(fake.headCalls).toEqual([[expect.stringMatching(/h3\.mp4$/), '/tmp/tail.mov', 22]]);
    expect((t.qa as { checks: Array<{ name: string; ok: boolean }> }).checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'guide-head-repeats-tail', ok: true })]));
    expect(fake.reads).toEqual([expect.objectContaining({ productionId: p.id, shotId: 's12', takeId: takeIdOf('job-take'), jobType: 'GENERATE_TAKE', read: expect.objectContaining({ revisionNumber: 3, pinned: true }) })]);
  });

  it('a head that landed a frame late moves the trim to 23: the speech check, the line windows and the recorded head follow', async () => {
    const { state, p } = fixture(); fake.state = state;
    fake.head = { ...fake.head, repeats: true, corrected: true, lastMatchIndex: 22, trimStartFrames: 23, detail: 'the head repeats the tail but its last frame lands at take frame 22, not 21: the trim moves to 23 frames' };
    await generateTake(ctx(p.id, 's12'));
    const asr = fake.ffmpegArgs.find((a) => a.includes('16000'))!;
    expect(asr.slice(asr.indexOf('-ss'), asr.indexOf('-ss') + 2)).toEqual(['-ss', (23 / 24).toFixed(6)]);
    const t = addTake();
    expect(t).toMatchObject({ trimStartFrames: 23, relation: 'CONTINUATION', continuesTakeId: 'take-a' });
    expect(t.soundtrack.lines[0].from).toBeCloseTo(0.5 + 23 / 24, 5);
    expect(t.params).toMatchObject({ timeline: { newFrames: 120, headFrames: 23 }, guide: { frames: 22, join: 'TRIM', head: { corrected: true, lastMatchIndex: 22, trimStartFrames: 23 }, why: expect.stringMatching(/trim moves to 23/) } });
  });

  it('a head that does not repeat the tail: the take is kept untrimmed, its join is HARD and the reason is recorded; the take is not rejected', async () => {
    const { state, p } = fixture(); fake.state = state;
    fake.head = { ...fake.head, repeats: false, trimStartFrames: 0, meanDiff: 48.2, maxDiff: 90, detail: "the take's first 22 frame(s) differ from the tail by 48.20 luma on average (max 90.00; allowed 12.00): the model did not repeat the tail, so the take is kept untrimmed and joined by a hard cut" };
    await generateTake(ctx(p.id, 's12'));
    const asr = fake.ffmpegArgs.find((a) => a.includes('16000'))!;
    expect(asr).not.toContain('-ss');
    const t = addTake();
    expect(t.trimStartFrames).toBeUndefined();
    expect(t).toMatchObject({ status: 'READY', relation: 'CONTINUATION', continuesTakeId: 'take-a' });
    expect(t.params).toMatchObject({ timeline: { newFrames: 158, headFrames: 0 }, guide: { frames: 22, join: 'HARD', head: { repeats: false, meanDiff: 48.2, trimStartFrames: 0 }, why: expect.stringMatching(/did not repeat the tail/) } });
    expect((t.qa as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }).checks.find((c) => c.name === 'guide-head-repeats-tail')).toMatchObject({ ok: true, detail: expect.stringMatching(/join: HARD; the take is not rejected/) });
  });

  it('over the frame budget (the words need more than 362 − guide frames): a hard cut without the guide, never a truncated continuation', async () => {
    const { state, p } = fixture(); fake.state = state;
    fake.dialogueSeconds = 14.2; // need = 15 s = 360 new frames > 340
    await generateTake(ctx(p.id, 's12'));
    const req = fake.requests[0] as { guides: Array<Record<string, unknown>>; seconds: number; prompt: string; lowering?: string };
    expect(req.guides).toEqual([{ frameIdx: 0, audioFile: expect.stringMatching(/dialogue\.wav$/) }]);
    expect(req.seconds).toBe(15);
    expect(req.lowering).toMatch(/360 new frames needed, 340 fit after a 22-frame guide — a hard cut without the guide/);
    expect(req.prompt).not.toContain('continues the previous shot');
    expect(fake.headCalls).toEqual([]);
    const t = addTake();
    expect(t).toMatchObject({ relation: 'CUT', continuesTakeId: 'take-a' });
    expect(t.trimStartFrames).toBeUndefined();
    expect(t.params).toMatchObject({ guide: { frames: 22, join: 'HARD', why: expect.stringMatching(/frame budget/) } });
    expect(t.references).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'VIDEO', assetId: 'vid-a', note: expect.stringMatching(/NOT anchored: frame budget/) })]));
    expect(t.references.some((r) => r.binding === 'guide@0')).toBe(false);
  });

  it('a tail clip the node would silently floor (21 frames → 5) is refused as WRONG_PARAMETERS before the engine is asked', async () => {
    const { state, p } = fixture(); fake.state = state;
    fake.tailClip = { frames: 21, hasAudio: true, audioSeconds: 21 / 24, sampleRate: 48000 };
    await expect(generateTake(ctx(p.id, 's12'))).rejects.toMatchObject({ failureClass: 'WRONG_PARAMETERS', message: expect.stringMatching(/21 frames, not the 22 planned \(the node would silently keep 5\)/) });
    expect(fake.requests).toEqual([]);
    expect(fake.commands.some((c) => c.name === 'addTake')).toBe(false);
    // a tail without its sound when the guide anchors the sound: refused too
    fake.tailClip = { frames: 22, hasAudio: false };
    await expect(generateTake(ctx(p.id, 's12'))).rejects.toMatchObject({ failureClass: 'WRONG_PARAMETERS', message: expect.stringMatching(/carries no sound/) });
    expect(fake.requests).toEqual([]);
  });

  it('a predecessor whose window shows fewer frames than the guide is refused by the preflight (no file is cut)', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, params: { timeline: { newFrames: 15 } } }] } : s)) });
    fake.state = state;
    await expect(generateTake(ctx(p.id, 's12'))).rejects.toMatchObject({ failureClass: 'INCONSISTENT_PLAN', message: expect.stringMatching(/continuation-source-ready.*shows only 15 frames in the cut, fewer than the 22-frame guide/) });
    expect(fake.tails).toEqual([]);
    expect(fake.requests).toEqual([]);
  });

  it('CONTINUATION of a take the cut shows only in part: the guide is cut from where its window ends (the audio timeline)', async () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, params: { timeline: { newFrames: 100 } } }] } : s)) });
    fake.state = state;
    await generateTake(ctx(p.id, 's12'));
    expect(fake.tails[0]).toEqual(['/lib/vid/vid-a.mp4', expect.stringMatching(/tail\.mp4$/), 22, 24, 100]);
    expect(addTake().references).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'VIDEO', note: expect.stringMatching(/ending at its frame 100/) })]));
    // hosted: the first frame is the last frame the cut shows, not the take's own last frame
    fake.backend = 'api'; fake.commands = [];
    await generateTake(ctx(p.id, 's12'));
    expect(fake.frames[0]).toEqual(['/lib/vid/vid-a.mp4', expect.stringMatching(/last-frame\.png$/), 99]);
    expect(fake.closing).toEqual([]);
  });

  it('RETURNING PLACE: the take is filmed against the World Bible’s established frame of the place, by id, not the drawn plate', async () => {
    const est: Asset = { id: 'est-1', kind: 'IMAGE', src: '/api/media/est-1', label: 'established', tags: ['location', 'established'], sample: false, origin: 'DERIVED', mimeType: 'image/png', provenance: { path: 'img/est-1.png' }, createdAt: 'x' };
    const { state: base, p } = fixture();
    const state = { ...base, assets: [...base.assets, est] };
    fake.state = state;
    fake.bible = withEstablished(deriveWorld(state, worldScopeOf(p), undefined, 'now'), [{ candidate: { locationId: 'loc-pharmacy', sceneId: 'sc0', shotId: 'earlier', takeId: 'take-earlier', videoAssetId: 'vid-x', frame: 6, timeOfDay: 'DUSK', framing: 'WIDE' }, imageAssetId: 'est-1', productionId: 'prod-earlier' }], 'now');
    await generateTake(ctx(p.id, 's13'));
    const req = fake.requests[0] as { referenceImages: Array<{ file: string }> };
    expect(req.referenceImages.map((r) => r.file)).toEqual(['/lib/img/canon-a.png', '/lib/img/est-1.png', '/lib/img/open-13.png']);
    const t = addTake();
    expect(t.references).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'LOCATION', assetId: 'est-1', note: expect.stringMatching(/established frame of Corner Pharmacy at dusk.*World Bible revision 3/) })]));
    expect(t.params).toMatchObject({ world: { plate: { assetId: 'est-1', role: 'ESTABLISHED' } } });
  });

  it('a production pinned to an earlier canonical image keeps filming with it (the redraw does not reach it)', async () => {
    const v1: Asset = { id: 'canon-a-v1', kind: 'IMAGE', src: '/api/media/canon-a-v1', label: 'v1', tags: [], sample: false, origin: 'GENERATED', mimeType: 'image/png', provenance: { path: 'img/canon-a-v1.png' }, createdAt: 'x', tier: 'RAW' };
    const { state: base, p } = fixture();
    const state = { ...base, assets: [...base.assets, v1] };
    fake.state = state;
    const bible = deriveWorld(state, worldScopeOf(p), undefined, 'now');
    const a = p.castIds[0];
    fake.bible = { ...bible, characters: bible.characters.map((c) => (c.characterId === a ? { ...c, canonical: { assetId: 'canon-a-v1', version: 1, status: 'APPROVED' as const } } : c)) };
    await generateTake(ctx(p.id, 's13'));
    const req = fake.requests[0] as { referenceImages: Array<{ file: string }> };
    expect(req.referenceImages[0].file).toBe('/lib/img/canon-a-v1.png');
    expect(fake.reads[0].read).toMatchObject({ characters: [{ characterId: a, pinnedVersion: 1, currentVersion: 2, usedPinned: true }], conflicts: [expect.stringMatching(/pinned to v1; the pinned image is used/)] });
  });

  it('CUT: the drawn opening frame anchored at 0 and bound as <Picture 3>; the ending frame anchored; no tail', async () => {
    const { state, p } = fixture(); fake.state = state;
    await generateTake(ctx(p.id, 's13'));
    expect(fake.tails).toEqual([]);
    const req = fake.requests[0] as { guides?: unknown[]; referenceImages: Array<{ file: string }>; firstFrame?: { file: string }; lastFrame?: { file: string }; prompt: string };
    expect(VideoGenerateInput.safeParse(req).error?.issues ?? []).toEqual([]); // what the tool runner validates
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
    expect(VideoGenerateInput.safeParse(req).error?.issues ?? []).toEqual([]); // what the tool runner validates
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
