import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Asset, Production, ShotRelation, Take } from '@/domain/types';

const run = promisify(execFile);

/** ASSEMBLY ON REAL MEDIA (no GPU, no database): synthetic takes made by ffmpeg whose PICTURE carries its own frame
 *  number in the luma (Y = 10 + 1.5·n) and its identity in the chroma (U), and whose SOUND is a tone of its own; a
 *  recorded line and a song of their own tones. The real assembly renders the cut from the production audio
 *  timeline; the cut is then decoded and read back: which take and which source frame is on every cut frame, which
 *  tone is heard when. This proves the clock, the continuation trims, the window trims, the holds under a song
 *  window, the recorded line replacing the take's speech, the song master once from its window with the takes muted,
 *  and the join QA telling a smooth continuation from a jump. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-assembly-'));
vi.stubEnv('LIBRARY_ROOT', dir);
vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');

const { buildMixPlan, buildTimeline, assemble } = await import('@/server/media/assembly');

const ff = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const video = (name: string, seconds: number, lum: string, cb: number, audio: string) => ff('-f', 'lavfi', '-i', `color=c=black:s=160x90:r=24:d=${seconds.toFixed(6)},format=yuv444p,geq=lum='${lum}':cb=${cb}:cr=128,format=yuv420p`, '-f', 'lavfi', '-i', `${audio}:d=${seconds.toFixed(6)}`, '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', path.join(dir, `${name}.mp4`));
const tone = (hz: number, sr = 48000) => `aevalsrc=exprs='0.5*sin(2*PI*${hz}*t)':s=${sr}`;
const asset = (id: string, kind: 'VIDEO' | 'AUDIO', seconds: number, ext = kind === 'VIDEO' ? 'mp4' : 'wav'): Asset => ({ id, kind, src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', durationSeconds: seconds, provenance: { path: `${id}.${ext}`, probe: { hasAudio: true } }, createdAt: 'x' });

interface Spec { id: string; take: string; seconds: number; trim?: number; intended?: number; relation?: ShotRelation; songWindow?: { from: number; to: number }; line?: { asset: string; seconds: number; from: number; to: number }; speechOk?: boolean }
function production(kind: 'SHORT' | 'MUSIC_VIDEO', specs: Spec[], song?: string): Production {
  return {
    id: 'p', kind, title: 'Fixture', scenes: [{ id: 'sc', number: 1, title: 'S', timeOfDay: 'DUSK', characterIds: [], beats: [] }],
    shots: specs.map((s, i) => {
      const take: Take = { id: `take-${s.id}`, label: 'Take 1', assetId: s.take, createdAt: 'x', status: 'READY', provider: 'MINIMAX', durationSeconds: s.seconds, trimStartFrames: s.trim, relation: s.relation, params: s.intended ? { timeline: { newFrames: s.intended } } : undefined, qa: { ok: true, checks: s.line ? [{ name: 'script-spoken', ok: s.speechOk ?? true }] : [] }, soundtrack: s.line ? { kind: 'DIALOGUE', lines: [{ lineId: `l-${s.id}`, from: s.line.from, to: s.line.to }] } : undefined };
      return { id: s.id, sceneId: 'sc', number: i + 1, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: s.seconds, characterIds: [], dialogue: s.line ? [{ id: `l-${s.id}`, characterId: 'c', text: 'We close in ten minutes.', audioAssetId: s.line.asset, durationSeconds: s.line.seconds }] : [], transition: 'CUT', takes: [take], selectedTakeId: take.id, songWindow: s.songWindow };
    }),
    song: song ? { id: 'song-rec', title: 'Song', source: 'GENERATED', assetId: song, durationSeconds: 30, caption: '', sections: [], singerIds: [] } : undefined,
  } as unknown as Production;
}

async function cut(p: Production, assets: Asset[], name: string) {
  const timeline = buildTimeline(p, assets);
  const mix = buildMixPlan(p, timeline);
  const files = Object.fromEntries(assets.map((a) => [a.id, path.join(dir, String(a.provenance!.path))]));
  const out = path.join(dir, `${name}.mp4`);
  const r = await assemble(p, timeline, { width: 320, height: 180, mix, files, outFile: out });
  return { timeline, mix, r, out };
}

/** Per cut frame: mean luma and mean U of a 32×18 read-back. */
async function frames(file: string): Promise<Array<{ y: number; u: number }>> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', 'scale=32:18:flags=area,format=yuv444p', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const n = 32 * 18; const out: Array<{ y: number; u: number }> = [];
  for (let o = 0; o + 3 * n <= stdout.length; o += 3 * n) { let y = 0, u = 0; for (let i = 0; i < n; i++) { y += stdout[o + i]; u += stdout[o + n + i]; } out.push({ y: y / n, u: u / n }); }
  return out;
}
async function pcm(file: string, rate = 16000): Promise<Float32Array> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + Math.floor(stdout.length / 4) * 4));
}
/** Goertzel amplitude of `hz` over [from, to) seconds. */
function level(x: Float32Array, hz: number, from: number, to: number, rate = 16000): number {
  const a = Math.round(from * rate), b = Math.round(to * rate), n = b - a;
  const k = 2 * Math.cos((2 * Math.PI * hz) / rate);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s = x[i] + k * s1 - s2; s2 = s1; s1 = s; }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2))) / n;
}
/** The tone heard over [from, to): the loudest of the candidates, and how far above the next one (×). */
function heard(x: Float32Array, from: number, to: number, candidates: number[]): { hz: number; margin: number } {
  const l = candidates.map((hz) => ({ hz, a: level(x, hz, from, to) })).sort((p, q) => q.a - p.a);
  return { hz: l[0].hz, margin: l[0].a / Math.max(1e-9, l[1].a) };
}
beforeAll(() => {
  // a film: A (5 s), B a continuation (158 frames, its first 22 repeat A — 1320 Hz under them, 660 Hz after), C a cut
  // that speaks (880 Hz) with a recorded line (1000 Hz) for its failed speech check
  video('take-a', 5, '10+N*1.5', 70, tone(440));
  video('take-b', 158 / 24, '10+N*1.5', 170, `aevalsrc=exprs='0.5*sin(2*PI*if(lt(t,0.916667),1320,660)*t)':s=48000`);
  video('take-c', 5, '10+N*1.5', 120, tone(880));
  ff('-f', 'lavfi', '-i', `${tone(1000)}:d=1.5`, '-ac', '1', '-c:a', 'pcm_s16le', path.join(dir, 'line.wav'));
  // join QA: a continuation whose first kept frame continues A2's motion, and one that jumps
  video('take-a2', 5, '120+50*sin(2*PI*(N-119)/40+PI/2)', 70, 'anoisesrc=color=pink:amplitude=0.1:seed=1:r=48000');
  video('take-b2', 158 / 24, '120+50*sin(2*PI*(N-21)/40+PI/2)', 70, 'anoisesrc=color=pink:amplitude=0.1:seed=2:r=48000');
  video('take-b3', 158 / 24, '120+50*sin(2*PI*(N-22)/40+PI)', 70, 'anoisesrc=color=pink:amplitude=1:seed=3:r=48000');
  // a music video: a song whose pitch says where in it we are (300 Hz + 50 Hz a second), two takes singing at 2000 Hz
  ff('-f', 'lavfi', '-i', `aevalsrc=exprs='0.5*sin(2*PI*(300+50*floor(t))*t)':s=48000:d=30`, '-ac', '2', '-c:a', 'pcm_s16le', path.join(dir, 'song.wav'));
  video('take-m1', 4.5, '10+N*1.5', 70, tone(2000));
  video('take-m2', 3, '10+N*1.5', 170, tone(2000));
}, 120_000);
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('a film cut on its dialogue clock', () => {
  it('each shot shows exactly its window: the continuation head and the frames past the window left out; the recorded line replaces a failed take’s speech; a jumping continuation join is caught', async () => {
    const p = production('SHORT', [
      { id: 's1', take: 'take-a', seconds: 5 },
      { id: 's2', take: 'take-b', seconds: 158 / 24, trim: 22, intended: 100, relation: 'CONTINUATION' },
      { id: 's3', take: 'take-c', seconds: 5, intended: 96, relation: 'CUT', line: { asset: 'line', seconds: 1.5, from: 1.0, to: 2.5 }, speechOk: false },
    ]);
    const assets = [asset('take-a', 'VIDEO', 5), asset('take-b', 'VIDEO', 158 / 24), asset('take-c', 'VIDEO', 5), asset('line', 'AUDIO', 1.5)];
    const { timeline, mix, r, out } = await cut(p, assets, 'film');
    expect(timeline.items.map((it) => [it.startFrame, it.frames, it.trimStartFrames])).toEqual([[0, 120, 0], [120, 100, 22], [220, 96, 0]]);
    expect(mix.tracks.map((t) => t.kind)).toEqual(['GENERATED_VIDEO_AUDIO', 'GENERATED_VIDEO_AUDIO', 'GENERATED_VIDEO_AUDIO', 'DIALOGUE']);
    // the picture, frame by frame: which take (U) and which of its frames (Y)
    const f = await frames(out);
    expect(f).toHaveLength(316);
    expect(Math.abs(r.durationSeconds - 316 / 24)).toBeLessThan(0.05);
    const at = (i: number) => ({ take: Math.round(f[i].u / 10) * 10, frame: Math.round((f[i].y - 10) / 1.5) });
    expect([0, 119, 120, 219, 220, 315].map(at)).toEqual([{ take: 70, frame: 0 }, { take: 70, frame: 119 }, { take: 170, frame: 22 }, { take: 170, frame: 121 }, { take: 120, frame: 0 }, { take: 120, frame: 95 }]);
    for (let i = 121; i < 220; i++) expect(at(i).frame - at(i - 1).frame, `cut frame ${i}`).toBe(1);
    // the sound: A's 440 Hz, then B's 660 Hz — B's repeated head (1320 Hz) only inside the 3-frame cross-fade
    const x = await pcm(out);
    const tones = [440, 660, 1320, 880, 1000];
    expect(heard(x, 0.2, 4.7, tones)).toMatchObject({ hz: 440 });
    expect(heard(x, 5.1, 9.1, tones)).toMatchObject({ hz: 660 });
    for (const [a, b] of [[0.2, 4.8], [5.05, 9.1]]) expect(level(x, 1320, a, b)).toBeLessThan(0.02 * level(x, a < 5 ? 440 : 660, a, b));
    expect(level(x, 1320, 4.885, 4.995)).toBeGreaterThan(5 * level(x, 1320, 3.0, 4.0));
    // C: its own 880 Hz, then the character's recorded line (1000 Hz) with the take muted under it, then 880 Hz again
    expect(heard(x, 9.25, 10.1, tones)).toMatchObject({ hz: 880 });
    const line = heard(x, 10.25, 11.6, tones);
    expect(line.hz).toBe(1000); expect(line.margin).toBeGreaterThan(20);
    expect(heard(x, 11.75, 13.1, tones)).toMatchObject({ hz: 880 });
    // join QA: A → B is a continuation and its picture jumps (frame 119 of A, frame 22 of another take); B → C is a cut
    expect(r.joins.map((j) => ({ to: j.toShotId, judged: j.judged, ok: j.ok, pictureOk: j.picture.ok }))).toEqual([{ to: 's2', judged: true, ok: false, pictureOk: false }, { to: 's3', judged: false, ok: true, pictureOk: false }]);
  }, 180_000);

  it('join QA passes a continuation whose first kept frame continues the motion, and fails one that jumps in picture and level', async () => {
    const assets = [asset('take-a2', 'VIDEO', 5), asset('take-b2', 'VIDEO', 158 / 24), asset('take-b3', 'VIDEO', 158 / 24)];
    const smooth = production('SHORT', [{ id: 's1', take: 'take-a2', seconds: 5 }, { id: 's2', take: 'take-b2', seconds: 158 / 24, trim: 22, intended: 100, relation: 'CONTINUATION' }]);
    const jump = production('SHORT', [{ id: 's1', take: 'take-a2', seconds: 5 }, { id: 's2', take: 'take-b3', seconds: 158 / 24, trim: 22, intended: 100, relation: 'CONTINUATION' }]);
    const a = (await cut(smooth, assets, 'smooth')).r.joins[0];
    const b = (await cut(jump, assets, 'jump')).r.joins[0];
    expect(a).toMatchObject({ judged: true, picture: { ok: true } });
    expect(a.picture.diff).toBeLessThan(a.picture.threshold);
    expect(b).toMatchObject({ judged: true, ok: false, picture: { ok: false }, audio: { rmsOk: false } });
    expect(b.picture.diff).toBeGreaterThan(20);
    expect(b.audio!.rmsStepDb).toBeGreaterThan(10);
  }, 180_000);
});

describe('a music video cut on the song', () => {
  it('the song master once from the first window, the takes muted; each shot fills its window, a short take holds its last frame', async () => {
    const p = production('MUSIC_VIDEO', [{ id: 's1', take: 'take-m1', seconds: 4.5, songWindow: { from: 4, to: 8 } }, { id: 's2', take: 'take-m2', seconds: 3, songWindow: { from: 8, to: 12 } }], 'song');
    const assets = [asset('take-m1', 'VIDEO', 4.5), asset('take-m2', 'VIDEO', 3), asset('song', 'AUDIO', 30)];
    const { timeline, mix, r, out } = await cut(p, assets, 'mv');
    expect(timeline.audio.songOffsetFrames).toBe(96);
    expect(timeline.items.map((it) => [it.startFrame, it.frames, it.holdFrames])).toEqual([[0, 96, 0], [96, 96, 24]]);
    expect(mix.tracks.filter((t) => !t.muted).map((t) => [t.kind, t.sourceAssetId, t.sourceOffsetSamples])).toEqual([['MASTER_MUSIC', 'song', 96 * 2000]]);
    expect(mix.targetLufs).toBe(-14);
    const f = await frames(out);
    expect(f).toHaveLength(192);
    const at = (i: number) => ({ take: Math.round(f[i].u / 10) * 10, frame: Math.round((f[i].y - 10) / 1.5) });
    expect([0, 95, 96, 167].map(at)).toEqual([{ take: 70, frame: 0 }, { take: 70, frame: 95 }, { take: 170, frame: 0 }, { take: 170, frame: 71 }]);
    for (let i = 168; i < 192; i++) expect(at(i)).toEqual({ take: 170, frame: 71 });
    // the song from 4 s: at cut 0.5 s the song is at 4.5 s (500 Hz), at 4.5 s at 8.5 s (700 Hz), at 7.5 s at 11.5 s (850 Hz)
    const x = await pcm(out);
    const songTones = [450, 500, 550, 650, 700, 750, 800, 850, 900, 2000];
    expect(heard(x, 0.2, 0.8, songTones).hz).toBe(500);
    expect(heard(x, 4.2, 4.8, songTones).hz).toBe(700);
    expect(heard(x, 7.2, 7.8, songTones).hz).toBe(850);
    // the takes sang along at 2000 Hz: never heard
    expect(level(x, 2000, 0.1, 7.9)).toBeLessThan(0.01 * level(x, 500, 0.2, 0.8));
    expect(Math.abs(r.durationSeconds - 8)).toBeLessThan(0.05);
  }, 180_000);
});
