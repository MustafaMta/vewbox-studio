import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GUIDE_HEAD, judgeGuideHead, measureGuideHead, guideHeadRecord } from '@/server/media/guide-head';
import { ffmpeg, tailClip } from '@/server/media/ffmpeg';
import { measureJoins } from '@/server/media/assembly-joins';
import { guideJoinOf } from '@/domain/timeline';

/** DOES THE TAKE'S HEAD REPEAT THE TAIL? (gap V2) The trim of a continuation is an assumption until measured: the
 *  take's first frames against the tail clip, frame by frame. A close re-render keeps the trim; a head that landed a
 *  frame early or late moves it; a head that is something else keeps the take untrimmed with a HARD join. Pure
 *  judgement on synthetic frames, then the real ffmpeg on synthetic clips. */

const N = 64 * 36;
const flat = (v: number) => new Uint8Array(N).fill(Math.max(0, Math.min(255, Math.round(v))));
const seq = (from: number, count: number, step = 1) => Array.from({ length: count }, (_, i) => flat(from + i * step));

describe('judgeGuideHead (pure)', () => {
  const tail = seq(100, 22);
  it('a head that repeats the tail keeps the planned trim', () => {
    const m = judgeGuideHead([...seq(100, 22), ...seq(122, 10)], tail, 22);
    expect(m).toMatchObject({ repeats: true, corrected: false, trimStartFrames: 22, lastMatchIndex: 21, meanDiff: 0, frames: 22, takeFrames: 32, tailFrames: 22 });
    expect(m.detail).toMatch(/repeats the tail .*22 frames are dropped/);
    expect(guideHeadRecord(m)).toEqual({ repeats: true, meanDiff: 0, maxDiff: 0, threshold: GUIDE_HEAD.maxMeanDiff, lastMatchIndex: 21, corrected: false, trimStartFrames: 22, detail: m.detail });
  });
  it('a head that lands one frame late moves the trim to 23; one frame early to 21', () => {
    const late = judgeGuideHead([flat(100), ...seq(100, 22), ...seq(122, 5)], tail, 22);
    expect(late).toMatchObject({ repeats: true, corrected: true, lastMatchIndex: 22, trimStartFrames: 23 });
    expect(late.detail).toMatch(/last frame lands at take frame 22, not 21: the trim moves to 23 frames/);
    const early = judgeGuideHead([...seq(101, 21), ...seq(122, 10)], tail, 22);
    expect(early).toMatchObject({ repeats: true, corrected: true, lastMatchIndex: 20, trimStartFrames: 21 });
    // a shift is only taken when it clearly beats the planned frame (shiftGain): a tie stays put
    const tie = judgeGuideHead([...seq(100, 22), flat(121), ...seq(122, 5)], tail, 22);
    expect(tie).toMatchObject({ repeats: true, corrected: false, trimStartFrames: 22 });
  });
  it('a head that is not the tail keeps the take untrimmed: a HARD join, the numbers recorded', () => {
    const m = judgeGuideHead(seq(200, 30), tail, 22);
    expect(m).toMatchObject({ repeats: false, trimStartFrames: 0, corrected: false });
    expect(m.meanDiff).toBeGreaterThan(80);
    expect(m.detail).toMatch(/did not repeat the tail, so the take is kept untrimmed and joined by a hard cut/);
    // a take shorter than the guide cannot have repeated it
    expect(judgeGuideHead(seq(100, 10), tail, 22)).toMatchObject({ repeats: false, trimStartFrames: 0 });
  });
  it('the threshold follows the tail’s own motion: a lively tail allows a looser re-render', () => {
    const lively = seq(0, 11, 20); // 20 luma a frame, an 11-frame guide
    const m = judgeGuideHead(seq(15, 20, 20), lively, 11); // every frame 15 off: more than the 12 floor, less than the motion
    expect(m.threshold).toBe(20);
    expect(m).toMatchObject({ repeats: true, meanDiff: 15 });
    expect(judgeGuideHead(seq(21, 20, 20), lively, 11)).toMatchObject({ repeats: false, meanDiff: 21, threshold: 20 });
    // a still tail keeps the floor
    expect(judgeGuideHead(seq(100, 30), seq(100, 22), 22).threshold).toBe(GUIDE_HEAD.maxMeanDiff);
  });
});

describe('guideJoinOf (what the timeline reads from a take)', () => {
  it('HARD when recorded, TRIM for a trimmed continuation, nothing for a cut', () => {
    expect(guideJoinOf({ relation: 'CONTINUATION', trimStartFrames: 22 })).toBe('TRIM');
    expect(guideJoinOf({ relation: 'CONTINUATION', trimStartFrames: undefined, params: { guide: { join: 'HARD' } } })).toBe('HARD');
    expect(guideJoinOf({ relation: 'CONTINUATION', trimStartFrames: 23, params: { guide: { join: 'TRIM' } } })).toBe('TRIM');
    expect(guideJoinOf({ relation: 'CUT' })).toBeUndefined();
    expect(guideJoinOf({ relation: 'CONTINUATION' })).toBeUndefined();
  });
});

describe('on real clips (ffmpeg)', () => {
  it('a take whose head re-renders the tail keeps its trim, one a frame late moves it, one that does not repeat is a hard join; the join QA does not judge a hard join', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-guide-head-'));
    const clip = async (name: string, seconds: number, lum: string) => { const f = path.join(dir, `${name}.mp4`); await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=160x90:r=24:d=${seconds},format=yuv444p,geq=lum='${lum}':cb=128:cr=128,format=yuv420p`, '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv420p', f]); return f; };
    const prev = await clip('prev', 3, '10+N*1.5');                 // 72 frames; the tail is frames 50..71
    const tail = await tailClip(prev, path.join(dir, 'tail.mp4'), 22);
    expect(tail.frames).toBe(22);
    const same = await clip('same', 2, '10+(N+50)*1.5');            // head = prev 50..71 exactly, then carries on
    const late = await clip('late', 2, '10+(max(N-1,0)+50)*1.5');   // one frame late: frame 0 doubled
    const other = await clip('other', 2, '10+N*1.5');               // the clip's own start: not the tail
    const a = await measureGuideHead(same, tail.file, 22);
    expect(a).toMatchObject({ repeats: true, corrected: false, trimStartFrames: 22 });
    expect(a.meanDiff).toBeLessThan(2);
    const b = await measureGuideHead(late, tail.file, 22);
    expect(b).toMatchObject({ repeats: true, corrected: true, lastMatchIndex: 22, trimStartFrames: 23 });
    const c = await measureGuideHead(other, tail.file, 22);
    expect(c).toMatchObject({ repeats: false, trimStartFrames: 0 });
    expect(c.meanDiff).toBeGreaterThan(50);
    // join QA: the same two files as a HARD join are measured but not judged; as a TRIM join the jump is caught
    const hard = await measureJoins([{ file: prev, shotId: 'a', startFrame: 0, frames: 72 }, { file: other, shotId: 'b', relation: 'CONTINUATION', join: 'HARD', startFrame: 72, frames: 48 }], undefined);
    expect(hard[0]).toMatchObject({ judged: false, ok: true, join: 'HARD', picture: { ok: false } });
    const trimmed = await measureJoins([{ file: prev, shotId: 'a', startFrame: 0, frames: 72 }, { file: other, shotId: 'b', relation: 'CONTINUATION', join: 'TRIM', startFrame: 72, frames: 48 }], undefined);
    expect(trimmed[0]).toMatchObject({ judged: true, ok: false, join: 'TRIM' });
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});
