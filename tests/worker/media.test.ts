import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureLoudness, qaTake, thumbnail, trimAudio, webReady } from '@/server/media/ffmpeg';
import { decodeCheck, ffprobe } from '@/server/media';

/** THE MEDIA TOOLCHAIN ON REAL FILES — the quality checks every take goes through, the web-ready transcode, the
 *  poster frame, loudness and the audio trim used for reference audio. ffmpeg/ffprobe must be on the machine. */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-media-'));
const good = path.join(tmp, 'good.mp4');
const black = path.join(tmp, 'black.mp4');
const truncated = path.join(tmp, 'cut.mp4');

beforeAll(() => {
  // a lively 4 s clip with a tone, and a 4 s black silent clip
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', good]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=24', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', black]);
  const bytes = fs.readFileSync(path.join(tmp, 'black.mp4'));
  fs.writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length * 0.5)));
}, 60_000);
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('take quality checks', () => {
  it('accepts a lively clip with sound and reports the facts', async () => {
    const { report, probe } = await qaTake(good, { durationSeconds: 4, width: 640, height: 360, expectAudio: true, minFps: 24 });
    expect(probe.width).toBe(640); expect(probe.hasAudio).toBe(true);
    const names = report.checks.map((c) => c.name);
    for (const n of ['decodable', 'duration', 'resolution', 'frame_rate', 'audio_stream', 'black_frames', 'frozen_video', 'flicker', 'audio_silence', 'audio_peak']) expect(names).toContain(n);
    expect(report.ok, JSON.stringify(report.checks.filter((c) => !c.ok))).toBe(true);
    expect(report.reviewer).toBe('AUTO');
  }, 60_000);

  it('rejects a black, frozen, silent clip by name, and a wrong duration', async () => {
    const { report } = await qaTake(black, { durationSeconds: 8, expectAudio: true });
    expect(report.ok).toBe(false);
    const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toContain('black_frames');
    expect(failed).toContain('frozen_video');
    expect(failed).toContain('audio_silence');
    expect(failed).toContain('duration');
  }, 60_000);

  it('a truncated file fails the full decode even when it probes', async () => {
    const d = await decodeCheck(truncated);
    expect(d.ok).toBe(false);
  }, 30_000);
});

describe('transcode, poster, loudness, trim', () => {
  it('makes a web-ready H.264/AAC file with faststart and a poster frame', async () => {
    const out = path.join(tmp, 'web.mp4');
    await webReady(good, out, await ffprobe(good));
    const p = await ffprobe(out);
    expect(p.videoCodec).toBe('h264'); expect(p.audioCodec).toBe('aac'); expect(p.pixFmt).toBe('yuv420p');
    const head = fs.readFileSync(out).subarray(0, 64 * 1024).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1); // faststart: moov near the front
    const poster = path.join(tmp, 'poster.jpg');
    await thumbnail(out, poster, { at: 1, width: 320 });
    const pp = await ffprobe(poster);
    expect(pp.width).toBe(320);
  }, 60_000);

  it('measures loudness and trims a window to mono 44.1 kHz WAV', async () => {
    const l = await measureLoudness(good);
    expect(l).not.toBeNull();
    expect(l!.integrated).toBeLessThan(0); expect(l!.truePeak).toBeLessThan(3);
    const wav = path.join(tmp, 'win.wav');
    await trimAudio(good, wav, 1, 2.5);
    const p = await ffprobe(wav);
    expect(p.channels).toBe(1); expect(p.sampleRate).toBe(44100);
    expect(Math.abs((p.durationSeconds ?? 0) - 1.5)).toBeLessThan(0.1);
  }, 60_000);
});
