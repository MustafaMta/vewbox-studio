import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { StudioError } from '@/domain/errors';
import type { QaCheck, QaReport } from '@/domain/types';
import { ffprobe, type Probe } from '../media';
import { log } from '../log';

const execFileP = promisify(execFile);

/** FFMPEG — every media transformation the studio performs, as explicit argument lists (never a shell string):
 *  thumbnails, review proxies, loudness measurement, the quality checks on a generated take, assembly and export. */

export const tmpRoot = () => process.env.TMP_ROOT || path.join(os.tmpdir(), 'vewbox');
export async function tmpDir(prefix: string): Promise<string> { const d = path.join(tmpRoot(), `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`); await fsp.mkdir(d, { recursive: true }); return d; }

export async function ffmpeg(args: string[], opts: { timeoutMs?: number; cwd?: string } = {}): Promise<{ stderr: string; ms: number }> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { cwd: opts.cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); if (err.length > 400_000) err = err.slice(-200_000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new StudioError('PROVIDER', `ffmpeg timed out after ${Math.round((opts.timeoutMs ?? 0) / 1000)} s`)); }, opts.timeoutMs ?? 30 * 60_000);
    child.on('error', (e) => { clearTimeout(timer); reject(new StudioError('UNAVAILABLE', `ffmpeg could not start: ${e.message}`)); });
    child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve({ stderr: err, ms: Date.now() - t0 }); else reject(new StudioError('PROVIDER', `ffmpeg exited with ${code}: ${err.split('\n').filter(Boolean).slice(-6).join(' | ')}`)); });
  });
}

/** A poster frame from a video (a little way in, so a fade-up does not give a black thumbnail). */
export async function thumbnail(video: string, out: string, opts: { at?: number; width?: number } = {}): Promise<string> {
  const at = opts.at ?? 0.5;
  await ffmpeg(['-ss', String(at), '-i', video, '-frames:v', '1', '-vf', `scale=${opts.width ?? 640}:-2`, '-q:v', '3', out], { timeoutMs: 120_000 });
  return out;
}

/** A small H.264 proxy for review in the browser (the original stays the master). */
export async function proxy(video: string, out: string, opts: { height?: number } = {}): Promise<string> {
  await ffmpeg(['-i', video, '-vf', `scale=-2:${opts.height ?? 540}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out], { timeoutMs: 20 * 60_000 });
  return out;
}

/** Make any input a web-playable MP4 (H.264 + AAC, faststart) without re-encoding when it already is one. */
export async function webReady(input: string, out: string, probe?: Probe): Promise<string> {
  const p = probe ?? await ffprobe(input);
  const copyVideo = p.videoCodec === 'h264' && (p.pixFmt ?? 'yuv420p') === 'yuv420p';
  const copyAudio = !p.hasAudio || p.audioCodec === 'aac';
  await ffmpeg(['-i', input, ...(copyVideo ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p']), ...(p.hasAudio ? (copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']) : []), '-movflags', '+faststart', out], { timeoutMs: 20 * 60_000 });
  return out;
}

export interface LoudnessStats { integrated: number; range: number; truePeak: number; threshold: number }
/** EBU R128 measurement (first pass of loudnorm). */
export async function measureLoudness(input: string): Promise<LoudnessStats | null> {
  try {
    const { stderr } = await ffmpeg(['-i', input, '-af', 'loudnorm=I=-23:LRA=7:TP=-1:print_format=json', '-f', 'null', '-'], { timeoutMs: 10 * 60_000 });
    const m = /\{[\s\S]*"input_i"[\s\S]*\}/.exec(stderr);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, string>;
    return { integrated: Number(j.input_i), range: Number(j.input_lra), truePeak: Number(j.input_tp), threshold: Number(j.input_thresh) };
  } catch { return null; }
}

/** QUALITY CHECKS ON A TAKE — container and stream facts first (what was asked for vs what came back), then signal
 *  checks: black frames, frozen video, extreme flicker, silent or clipping audio. Each check is a line in the report;
 *  the report decides acceptance but a human still reviews the footage. */
export async function qaTake(file: string, expect: { durationSeconds: number; width?: number; height?: number; expectAudio?: boolean; minFps?: number }): Promise<{ report: QaReport; probe: Probe }> {
  const probe = await ffprobe(file);
  const checks: QaCheck[] = [];
  const dur = probe.durationSeconds ?? 0;
  checks.push({ name: 'decodable', ok: probe.hasVideo, detail: probe.hasVideo ? `${probe.videoCodec} ${probe.width}x${probe.height} ${probe.fps?.toFixed(2)} fps` : 'no video stream' });
  const durOk = Math.abs(dur - expect.durationSeconds) <= Math.max(1.0, expect.durationSeconds * 0.25);
  checks.push({ name: 'duration', ok: durOk, value: Number(dur.toFixed(2)), threshold: `${expect.durationSeconds}±${Math.max(1, expect.durationSeconds * 0.25).toFixed(1)}s` });
  if (expect.width && expect.height) checks.push({ name: 'resolution', ok: (probe.width ?? 0) >= expect.width * 0.9 && (probe.height ?? 0) >= expect.height * 0.9, value: `${probe.width}x${probe.height}`, threshold: `≥ ${expect.width}x${expect.height}` });
  if (expect.minFps) checks.push({ name: 'frame_rate', ok: (probe.fps ?? 0) >= expect.minFps - 0.5, value: probe.fps, threshold: `≥ ${expect.minFps}` });
  if (expect.expectAudio !== undefined) checks.push({ name: 'audio_stream', ok: probe.hasAudio === expect.expectAudio, value: probe.hasAudio ? probe.audioCodec : 'none', threshold: expect.expectAudio ? 'present' : 'absent' });
  // signal checks in one pass
  try {
    const { stderr } = await ffmpeg(['-i', file, '-vf', 'blackdetect=d=0.3:pix_th=0.10,freezedetect=n=-45dB:d=1.0,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', ...(probe.hasAudio ? ['-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-,silencedetect=n=-50dB:d=1.0'] : []), '-f', 'null', '-'], { timeoutMs: 10 * 60_000 });
    const blackTotal = [...stderr.matchAll(/black_duration:([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    checks.push({ name: 'black_frames', ok: blackTotal <= Math.max(0.5, dur * 0.1), value: Number(blackTotal.toFixed(2)), threshold: `≤ ${Math.max(0.5, dur * 0.1).toFixed(1)}s` });
    const frozen = [...stderr.matchAll(/freeze_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    checks.push({ name: 'frozen_video', ok: frozen <= Math.max(1.0, dur * 0.3), value: Number(frozen.toFixed(2)), threshold: `≤ ${Math.max(1, dur * 0.3).toFixed(1)}s` });
    // flicker: large frame-to-frame swings of average luma
    const yavg = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    let swings = 0;
    for (let i = 1; i < yavg.length; i++) if (Math.abs(yavg[i] - yavg[i - 1]) > 40) swings++;
    const flickerRate = yavg.length > 1 ? swings / (yavg.length - 1) : 0;
    checks.push({ name: 'flicker', ok: flickerRate < 0.08, value: Number(flickerRate.toFixed(3)), threshold: '< 0.08 of frames swing > 40 luma' });
    if (probe.hasAudio) {
      const silence = [...stderr.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
      checks.push({ name: 'audio_silence', ok: silence < dur * 0.95, value: Number(silence.toFixed(2)), threshold: `< ${(dur * 0.95).toFixed(1)}s`, detail: silence >= dur * 0.95 ? 'the whole clip is silent' : undefined });
    }
  } catch (e) {
    checks.push({ name: 'signal_analysis', ok: false, detail: (e as Error).message });
  }
  if (probe.hasAudio) {
    const loud = await measureLoudness(file);
    if (loud) checks.push({ name: 'audio_peak', ok: loud.truePeak <= 0.0, value: loud.truePeak, threshold: '≤ 0 dBTP', detail: `integrated ${loud.integrated.toFixed(1)} LUFS` });
  }
  const ok = checks.every((c) => c.ok);
  log.info({ file: path.basename(file), ok, failed: checks.filter((c) => !c.ok).map((c) => c.name) }, 'take qa');
  return { report: { ok, checks, reviewedAt: new Date().toISOString(), reviewer: 'AUTO' }, probe };
}

/** Cut a stretch of an audio file to mono 44.1 kHz WAV (what the video engines take as reference audio). */
export async function trimAudio(input: string, out: string, from: number, to: number): Promise<string> {
  await ffmpeg(['-y', '-v', 'error', '-ss', String(Math.max(0, from)), '-t', String(Math.max(0.1, to - from)), '-i', input, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', out]);
  return out;
}

export async function fileExists(p: string): Promise<boolean> { try { await fsp.access(p); return true; } catch { return false; } }

export async function ffmpegVersion(): Promise<string> { try { const { stdout } = await execFileP('ffmpeg', ['-version']); return stdout.split('\n')[0]; } catch { return 'unavailable'; } }
