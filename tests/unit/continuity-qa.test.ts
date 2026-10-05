import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { continuityChecks, frameSeries, judgeContainer, judgeCuts, judgeDuplicates, judgeFades, judgeLineTiming, judgeRepeatedSpeech, measuredCuts } from '@/server/media/continuity-qa';

/** Continuity QA without a model (cloud directive §10): fades, duplicated frames, unplanned cuts, repeated speech,
 *  line timing, container. Pure judges on synthetic frames, and the measuring pass on ffmpeg-made test clips (lavfi
 *  sources — fixtures, not generated film). */

const W = 64 * 36;
const flat = (v: number, noise = 0, seed = 1) => { const a = new Uint8Array(W); let x = seed; for (let i = 0; i < W; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a[i] = Math.max(0, Math.min(255, v + (noise ? (x % (2 * noise + 1)) - noise : 0))); } return a; };
const moving = (n: number, base = 120) => Array.from({ length: n }, (_, i) => flat(base, 20, i + 1));

describe('fades and black dips', () => {
  it('a ramp up from black at the start is a fade; a clean start is not', () => {
    const fade = [...Array.from({ length: 10 }, (_, i) => flat(i * 12)), ...moving(40)];
    expect(judgeFades(frameSeries(fade, 24)).ok).toBe(false);
    expect(judgeFades(frameSeries(fade, 24)).detail).toMatch(/fades in from black over \d+ frames/);
    expect(judgeFades(frameSeries(moving(50), 24)).ok).toBe(true);
  });
  it('a fade out at the end and a black dip inside are flagged; a continuation head is not judged', () => {
    const out = [...moving(40), ...Array.from({ length: 10 }, (_, i) => flat(120 - i * 13))];
    expect(judgeFades(frameSeries(out, 24)).detail).toMatch(/fades out to black/);
    const dip = [...moving(20), flat(2), flat(3), ...moving(20)];
    expect(judgeFades(frameSeries(dip, 24)).detail).toMatch(/dips to black at 0\.83–0\.92 s/);
    const head = [...Array.from({ length: 10 }, (_, i) => flat(i * 12)), ...moving(40)];
    expect(judgeFades(frameSeries(head, 24), 10).ok).toBe(true);
  });
});

describe('duplicated frames', () => {
  it('a run of identical frames is flagged with where it is', () => {
    const f = moving(48);
    const dup = [...f.slice(0, 20), f[20], f[20], f[20], f[20], f[20], ...f.slice(21)];
    const c = judgeDuplicates(frameSeries(dup, 24));
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/longest run 4 at 0\.88 s/);
    expect(judgeDuplicates(frameSeries(moving(48), 24)).ok).toBe(true);
  });
});

describe('cuts inside the take', () => {
  const scene = (n: number, base: number) => Array.from({ length: n }, (_, i) => flat(base, 3, i + 1));
  it('finds a hard change, allows a planned one, flags an unplanned one', () => {
    const s = frameSeries([...scene(48, 60), ...scene(48, 190)], 24);
    expect(measuredCuts(s)).toEqual([2]);
    expect(judgeCuts(s, [2.2]).ok).toBe(true);
    const c = judgeCuts(s, []);
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/unplanned: 2\.00 s/);
    expect(judgeCuts(frameSeries(scene(96, 60), 24), [2]).detail).toMatch(/planned but not seen: 2\.00 s/);
  });
  it('the join out of a continuation head is not an in-take cut', () => {
    const s = frameSeries([...scene(22, 60), ...scene(60, 190)], 24);
    expect(judgeCuts(s, [], 22).ok).toBe(true);
  });
});

describe('speech and timing', () => {
  it('a line said again to fill the clip is repeated speech (acceptance shot 1.3)', () => {
    const c = judgeRepeatedSpeech(['Thank you, Clara.'], 'Thank you, Clara. Thank you.');
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/“thank you” heard 2× \(script 1×\)/);
    expect(judgeRepeatedSpeech(['Thank you.'], 'Thank you. Thank you.').ok).toBe(false);
    expect(judgeRepeatedSpeech(['Thank you.'], 'thank you').ok).toBe(true);
    expect(judgeRepeatedSpeech(['Hello there.', 'Hello there, friend.'], 'Hello there. Hello there, friend.').ok).toBe(true);
  });
  it('a line heard late or much shorter than its recording is a timing problem', () => {
    expect(judgeLineTiming([{ lineId: 'l1', recordedSeconds: 1.8, expectedFrom: 0.4 }], [{ lineId: 'l1', from: 0.45, to: 2.2 }]).ok).toBe(true);
    const c = judgeLineTiming([{ lineId: 'l1', recordedSeconds: 1.8, expectedFrom: 0.4 }], [{ lineId: 'l1', from: 1.5, to: 2.0 }]);
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/starts at 1\.50 s, expected 0\.40 s; l1 heard for 0\.50 s, recorded 1\.80 s/);
    expect(judgeLineTiming([{ lineId: 'l2' }], []).detail).toMatch(/l2 not placed/);
  });
});

describe('container', () => {
  it('H.264 yuv420p at 24 fps with sound passes; anything else says what', () => {
    expect(judgeContainer({ hasVideo: true, hasAudio: true, videoCodec: 'h264', pixFmt: 'yuv420p', fps: 24, frames: 124, durationSeconds: 5.1667, audioCodec: 'aac' }, { fps: 24, expectAudio: true }).ok).toBe(true);
    const c = judgeContainer({ hasVideo: true, hasAudio: false, videoCodec: 'vp9', pixFmt: 'yuv444p', fps: 25 }, { fps: 24, expectAudio: true });
    expect(c.detail).toBe('video codec vp9; pixel format yuv444p; 25.000 fps, not 24; no audio stream');
  });
});

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe.skipIf(!hasFfmpeg)('the measuring pass on test clips (ffmpeg lavfi sources)', () => {
  let dir = '';
  const make = (name: string, filter: string) => { const f = path.join(dir, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', f]); return f; };
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-')); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('a clean moving clip passes; a faded one and a spliced one are flagged', async () => {
    const clean = make('clean.mp4', 'testsrc2=size=320x180:rate=24:duration=3');
    const faded = make('faded.mp4', 'testsrc2=size=320x180:rate=24:duration=3,fade=t=in:st=0:d=1');
    const spliced = make('spliced.mp4', 'testsrc2=size=320x180:rate=24:duration=2[a];mandelbrot=size=320x180:rate=24[m];[m]trim=duration=2,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1');
    const ok = await continuityChecks(clean, { fps: 24, head: 0, plannedCuts: [] });
    expect(ok.map((c) => [c.name, c.ok])).toEqual([['no-accidental-fade', true], ['no-duplicate-frames', true], ['no-unplanned-cut', true]]);
    expect((await continuityChecks(faded, { fps: 24, head: 0, plannedCuts: [] })).find((c) => c.name === 'no-accidental-fade')!.ok).toBe(false);
    const cut = (await continuityChecks(spliced, { fps: 24, head: 0, plannedCuts: [] })).find((c) => c.name === 'no-unplanned-cut')!;
    expect(cut.ok).toBe(false);
    expect(cut.detail).toMatch(/unplanned: 2\.0\d s/);
    expect((await continuityChecks(spliced, { fps: 24, head: 0, plannedCuts: [2] })).find((c) => c.name === 'no-unplanned-cut')!.ok).toBe(true);
  }, 60_000);
});
