import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ffmpeg, frameAt, frameAtArgs, probeGuideClip, speechAudioArgs, tailClip, tailClipArgs } from '@/server/media/ffmpeg';
import { ffprobe } from '@/server/media';
import { validateGuideClip } from '@/server/production/guide';

const run = promisify(execFile);

/** The media side of a continuation: the tail clip carries the last frames AND their sound, bounded to the frames
 *  (P0.2); the speech check starts after the guide head (P0.4); the written clip is counted and judged against the
 *  node's real guide lengths (gap V1). The real ffmpeg runs on a synthetic clip. */

describe('guide clip validation (what MiniMaxH3AddGuide will really keep)', () => {
  it('22 frames with 0.9167 s of sound pass; the node keeps 22 (36.67 audio latent steps)', () => {
    expect(validateGuideClip({ frames: 22, hasAudio: true, audioSeconds: 22 / 24 }, { frames: 22, withAudio: true })).toEqual({ ok: true, frames: 22, audioLatentSteps: 36.67, problems: [] });
    expect(validateGuideClip({ frames: 5, hasAudio: false }, { frames: 5, withAudio: false })).toMatchObject({ ok: true, frames: 5, audioLatentSteps: 8.33 });
    expect(validateGuideClip({ frames: 39, hasAudio: true, audioSeconds: 39 / 24 }, { frames: 39, withAudio: true })).toMatchObject({ ok: true, frames: 39, audioLatentSteps: 65 });
  });
  it('21 frames (the node would keep 5), 5 frames for a 22-frame plan, a 2-frame tail (one frame), no sound, short sound: refused by name', () => {
    expect(validateGuideClip({ frames: 21, hasAudio: true, audioSeconds: 21 / 24 }, { frames: 22, withAudio: true })).toMatchObject({ ok: false, frames: 5, problems: [expect.stringMatching(/21 frames, not the 22 planned \(the node would silently keep 5\)/)] });
    expect(validateGuideClip({ frames: 5, hasAudio: true, audioSeconds: 5 / 24 }, { frames: 22, withAudio: true }).problems[0]).toMatch(/5 frames, not the 22 planned/);
    expect(validateGuideClip({ frames: 2, hasAudio: true, audioSeconds: 2 / 24 }, { frames: 22, withAudio: true })).toMatchObject({ ok: false, frames: 1 });
    expect(validateGuideClip({ frames: 22, hasAudio: false }, { frames: 22, withAudio: true }).problems).toEqual([expect.stringMatching(/carries no sound/)]);
    expect(validateGuideClip({ frames: 22, hasAudio: true, audioSeconds: 0.5 }, { frames: 22, withAudio: true }).problems).toEqual([expect.stringMatching(/sound runs 0\.500 s for 22 frames/)]);
    // a tail anchored without its sound does not need any
    expect(validateGuideClip({ frames: 22, hasAudio: false }, { frames: 22, withAudio: false }).ok).toBe(true);
  });
});

describe('tail clip', () => {
  it('arguments: the last N frames from (total − N)/24, bounded to N/24 s, with mono 48 kHz PCM sound', () => {
    const a = tailClipArgs('/in.mp4', '/out.mov', 22, 124);
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2)).toEqual(['-ss', (102 / 24).toFixed(6)]);
    expect(a.slice(a.indexOf('-t'), a.indexOf('-t') + 2)).toEqual(['-t', (22 / 24).toFixed(6)]);
    expect(a.slice(a.indexOf('-frames:v'), a.indexOf('-frames:v') + 2)).toEqual(['-frames:v', '22']);
    expect(a).toEqual(expect.arrayContaining(['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1']));
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'));
  });

  it('a real clip with sound: the tail has 22 frames and 22 frames of audio', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-tail-'));
    const src = path.join(dir, 'clip.mp4');
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
    const tail = await tailClip(src, path.join(dir, 'tail.mp4'), 22);
    expect(tail.file.endsWith('.mov')).toBe(true);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,duration,sample_rate', '-of', 'json', tail.file]);
    const streams = (JSON.parse(stdout) as { streams: Array<{ codec_type: string; nb_read_frames?: string; duration?: string; sample_rate?: string }> }).streams;
    const v = streams.find((s) => s.codec_type === 'video')!; const au = streams.find((s) => s.codec_type === 'audio')!;
    expect(Number(v.nb_read_frames)).toBe(22);
    expect(au).toBeDefined();
    expect(au.sample_rate).toBe('48000');
    expect(Math.abs(Number(au.duration) - 22 / 24)).toBeLessThan(0.03);
    expect((await ffprobe(tail.file)).hasAudio).toBe(true);
    // the clip counted itself, as the handler reads it: 22 frames, sound of the same length, cut from the clip's end
    expect(tail).toMatchObject({ frames: 22, hasAudio: true, sampleRate: 48000, sourceEndFrame: 72, sourceTotalFrames: 72 });
    expect(Math.abs((tail.audioSeconds ?? 0) - 22 / 24)).toBeLessThan(0.03);
    expect(validateGuideClip(tail, { frames: 22, withAudio: true }).ok).toBe(true);
    expect(await probeGuideClip(tail.file)).toMatchObject({ frames: 22, hasAudio: true });
    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);

  it('a real clip whose window ends at frame 15: the tail holds 15 frames and the validation refuses it (the node would keep 5)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-tail-short-'));
    const src = path.join(dir, 'clip.mp4');
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
    const tail = await tailClip(src, path.join(dir, 'tail.mp4'), 22, 24, 15);
    expect(tail.frames).toBe(15);
    const v = validateGuideClip(tail, { frames: 22, withAudio: true });
    expect(v.ok).toBe(false);
    expect(v.frames).toBe(5);
    expect(v.problems[0]).toMatch(/15 frames, not the 22 planned \(the node would silently keep 5\)/);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);
});

describe('the guide is what the cut shows (the production audio timeline)', () => {
  it('a tail that ends where the previous window ends: the 22 frames before that frame; an end past the clip is the clip’s end', () => {
    const a = tailClipArgs('/in.mp4', '/out.mov', 22, 158, 24, 120);
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2)).toEqual(['-ss', (98 / 24).toFixed(6)]);
    expect(a.slice(a.indexOf('-frames:v'), a.indexOf('-frames:v') + 2)).toEqual(['-frames:v', '22']);
    const b = tailClipArgs('/in.mp4', '/out.mov', 22, 124, 24, 200);
    expect(b.slice(b.indexOf('-ss'), b.indexOf('-ss') + 2)).toEqual(['-ss', (102 / 24).toFixed(6)]);
  });

  it('frameAt writes the frame asked for (an established plate, a hosted first frame) — read back by its luma', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vb-frame-'));
    const src = path.join(dir, 'clip.mp4');
    await ffmpeg(['-f', 'lavfi', '-i', "color=c=black:s=64x36:r=24:d=3,format=yuv444p,geq=lum='10+N*2':cb=128:cr=128,format=yuv420p", '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv420p', src]);
    expect(frameAtArgs(src, '/o.png', 30)).toEqual(expect.arrayContaining(['-ss', (30 / 24).toFixed(6), '-frames:v', '1']));
    const png = await frameAt(src, path.join(dir, 'f.png'), 30);
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
    // the PNG is full-range RGB: back to the clip's limited-range luma, then to the frame number
    const mean = [...stdout].reduce((s, v) => s + v, 0) / stdout.length;
    expect(Math.round(((mean * 219) / 255 + 16 - 10) / 2)).toBe(30);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);
});

describe('speech check audio (P0.4)', () => {
  it('starts after the continuation head; a take without a head is read from 0', () => {
    const withHead = speechAudioArgs('/take.mp4', '/a.wav', 22 / 24);
    expect(withHead.slice(withHead.indexOf('-ss'), withHead.indexOf('-ss') + 2)).toEqual(['-ss', '0.916667']);
    expect(withHead.indexOf('-ss')).toBeLessThan(withHead.indexOf('-i'));
    expect(withHead).toEqual(expect.arrayContaining(['-ac', '1', '-ar', '16000', '/a.wav']));
    expect(speechAudioArgs('/take.mp4', '/a.wav')).not.toContain('-ss');
  });
});
