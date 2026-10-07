import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { StudioError } from '@/domain/errors';
import type { QaCheck, QaReport } from '@/domain/types';
import { JOIN_SPEECH } from '@/domain/timeline';
import { ffprobe, type Probe } from '../media';
import { execFileP } from './exec';
import { log } from '../log';
import { jobSignal } from '../jobs/context';

/** FFMPEG — every media transformation the studio performs, as explicit argument lists (never a shell string):
 *  thumbnails, review proxies, loudness measurement, the quality checks on a generated take, assembly and export. */

export const tmpRoot = () => process.env.TMP_ROOT || path.join(os.tmpdir(), 'vewbox');
export async function tmpDir(prefix: string): Promise<string> { const d = path.join(tmpRoot(), `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`); await fsp.mkdir(d, { recursive: true }); return d; }

/** Run ffmpeg. The child is killed (SIGKILL) at its timeout, and — audit H5 — when `signal` (by default the running
 *  job's: cancel, deadline, lost lease; src/server/jobs/context.ts) aborts; the promise then rejects with the
 *  signal's reason. */
export async function ffmpeg(args: string[], opts: { timeoutMs?: number; cwd?: string; signal?: AbortSignal } = {}): Promise<{ stderr: string; ms: number }> {
  const t0 = Date.now();
  const signal = opts.signal ?? jobSignal();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const child = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { cwd: opts.cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(); };
    const onAbort = () => { child.kill('SIGKILL'); done(() => reject(signal!.reason)); };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.on('data', (d) => { err += d.toString(); if (err.length > 400_000) err = err.slice(-200_000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); done(() => reject(new StudioError('PROVIDER', `ffmpeg timed out after ${Math.round((opts.timeoutMs ?? 0) / 1000)} s`))); }, opts.timeoutMs ?? 30 * 60_000);
    child.on('error', (e) => done(() => reject(new StudioError('UNAVAILABLE', `ffmpeg could not start: ${e.message}`))));
    child.on('close', (code) => done(() => { if (code === 0) resolve({ stderr: err, ms: Date.now() - t0 }); else reject(new StudioError('PROVIDER', `ffmpeg exited with ${code}: ${err.split('\n').filter(Boolean).slice(-6).join(' | ')}`)); }));
  });
}

/** A poster frame from a video (a little way in, so a fade-up does not give a black thumbnail). */
export async function thumbnail(video: string, out: string, opts: { at?: number; width?: number } = {}): Promise<string> {
  const at = opts.at ?? 0.5;
  await ffmpeg(['-ss', String(at), '-i', video, '-frames:v', '1', '-vf', `scale=${opts.width ?? 640}:-2`, '-q:v', '3', out], { timeoutMs: 120_000 });
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
    // the loudnorm block itself: an input's tags are printed first and can hold JSON (ComfyUI's workflow in a FLAC)
    const m = /\{\s*"input_i"[\s\S]*?\}/.exec(stderr);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, string>;
    return { integrated: Number(j.input_i), range: Number(j.input_lra), truePeak: Number(j.input_tp), threshold: Number(j.input_thresh) };
  } catch { return null; }
}

/** QUALITY CHECKS ON A TAKE — container and stream facts first (what was asked for vs what came back), then signal
 *  checks: black frames, frozen video, extreme flicker, silent or clipping audio. Each check is a line in the report;
 *  the report decides acceptance but a human still reviews the footage. */
export async function qaTake(file: string, expect: { durationSeconds: number; width?: number; height?: number; expectAudio?: boolean; minFps?: number; /** false = a near-silent track is acceptable (an ambient shot with no lines); default: a silent clip fails */ speechExpected?: boolean }): Promise<{ report: QaReport; probe: Probe }> {
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
    // freezedetect reports a duration only when a freeze ends; a clip frozen to the last frame reports a start alone
    const freezeStarts = [...stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const freezeDurations = [...stderr.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
    const openFreeze = freezeStarts.length > freezeDurations.length ? Math.max(0, dur - freezeStarts[freezeStarts.length - 1]) : 0;
    const frozen = freezeDurations.reduce((a, d) => a + d, 0) + openFreeze;
    checks.push({ name: 'frozen_video', ok: frozen <= Math.max(1.0, dur * 0.3), value: Number(frozen.toFixed(2)), threshold: `≤ ${Math.max(1, dur * 0.3).toFixed(1)}s` });
    // flicker: large frame-to-frame swings of average luma
    const yavg = [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    let swings = 0;
    for (let i = 1; i < yavg.length; i++) if (Math.abs(yavg[i] - yavg[i - 1]) > 40) swings++;
    const flickerRate = yavg.length > 1 ? swings / (yavg.length - 1) : 0;
    checks.push({ name: 'flicker', ok: flickerRate < 0.08, value: Number(flickerRate.toFixed(3)), threshold: '< 0.08 of frames swing > 40 luma' });
    if (probe.hasAudio) {
      const silence = [...stderr.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
      const silent = silence >= dur * 0.95;
      checks.push({ name: 'audio_silence', ok: !silent || expect.speechExpected === false, value: Number(silence.toFixed(2)), threshold: `< ${(dur * 0.95).toFixed(1)}s`, detail: silent ? (expect.speechExpected === false ? 'the clip is silent (no lines expected)' : 'the whole clip is silent') : undefined });
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

/** The audio padded with silence (or cut) to exactly `seconds`, mono 48 kHz PCM. */
export async function padAudio(input: string, out: string, seconds: number): Promise<string> {
  await ffmpeg(['-y', '-v', 'error', '-i', input, '-vn', '-af', `aformat=sample_rates=48000:channel_layouts=mono,apad=whole_dur=${seconds.toFixed(3)},atrim=0:${seconds.toFixed(3)}`, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  return out;
}

/** Join spoken lines into one soundtrack with silence between them: a lead-in, a gap after every line, a tail. Mono
 *  48 kHz PCM. Returns each line's window inside the track (exact, from the measured durations). */
export async function joinSpeech(lines: Array<{ file: string; durationSeconds: number }>, out: string, opts: { leadIn?: number; gap?: number; tail?: number } = {}): Promise<{ file: string; durationSeconds: number; windows: Array<{ from: number; to: number }> }> {
  // the cut reads the same rule back to place each recording where the take was anchored on it (anchoredLineStarts)
  const leadIn = opts.leadIn ?? JOIN_SPEECH.leadIn, gap = opts.gap ?? JOIN_SPEECH.gap, tail = opts.tail ?? JOIN_SPEECH.tail;
  const args: string[] = ['-y', '-v', 'error'];
  const parts: string[] = [];
  const windows: Array<{ from: number; to: number }> = [];
  let t = leadIn;
  for (const [i, l] of lines.entries()) {
    args.push('-i', l.file);
    parts.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay=${Math.round(t * 48000)}S:all=1[s${i}]`);
    windows.push({ from: t, to: t + l.durationSeconds });
    t += l.durationSeconds + gap;
  }
  const total = t - gap + tail;
  parts.push(`${lines.map((_, i) => `[s${i}]`).join('')}amix=inputs=${lines.length}:duration=longest:normalize=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[mix]`);
  await ffmpeg([...args, '-filter_complex', parts.join(';'), '-map', '[mix]', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  return { file: out, durationSeconds: total, windows };
}

/** The ffmpeg arguments of a tail clip: the last `frames` frames before `endFrame` (default: the clip's end) of a
 *  clip of `totalFrames` frames, picture and sound bounded to exactly frames/fps seconds (the sound would otherwise
 *  run to the end of the input, a few ms past the picture), mono 48 kHz PCM in a .mov. Pure, so the shape is tested. */
export function tailClipArgs(video: string, out: string, frames: number, totalFrames: number, fps = 24, endFrame?: number): string[] {
  const end = endFrame !== undefined && endFrame > 0 ? (totalFrames ? Math.min(endFrame, totalFrames) : endFrame) : totalFrames;
  const startFrame = Math.max(0, end - frames);
  const n = Math.min(frames, end || frames);
  return ['-y', '-v', 'error', '-ss', (startFrame / fps).toFixed(6), '-i', video, '-t', (n / fps).toFixed(6), '-frames:v', String(n), '-vf', `fps=${fps}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', out];
}

/** What a guide clip really holds, counted (not read from the container's header): the decoded picture frames, and the
 *  sound's length and rate. `ffprobe -count_frames` decodes the file, so the number is the one `LoadVideo` will hand
 *  `MiniMaxH3AddGuide`. */
export interface GuideClipProbe { frames: number; hasAudio: boolean; audioSeconds?: number; sampleRate?: number }
export async function probeGuideClip(file: string): Promise<GuideClipProbe> {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,duration,sample_rate', '-of', 'json', file], { maxBuffer: 8 * 1024 * 1024 });
  const streams = (JSON.parse(stdout) as { streams?: Array<{ codec_type: string; nb_read_frames?: string; duration?: string; sample_rate?: string }> }).streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video'); const a = streams.find((s) => s.codec_type === 'audio');
  const audioSeconds = a?.duration !== undefined ? Number(a.duration) : undefined;
  return { frames: v?.nb_read_frames ? Number(v.nb_read_frames) : 0, hasAudio: Boolean(a), audioSeconds: audioSeconds !== undefined && Number.isFinite(audioSeconds) ? audioSeconds : undefined, sampleRate: a?.sample_rate ? Number(a.sample_rate) : undefined };
}

/** A continuation's tail clip: the file, what it really holds (counted), and where it was cut from. */
export interface TailClip extends GuideClipProbe { file: string; /** the source frame after the last one in the clip */ sourceEndFrame: number; sourceTotalFrames: number }

/** The last `frames` frames of a clip as a small video WITH its audio, for a continuation guide: both streams are
 *  anchored together at frame 0 of the next take (the template's continuation idiom). `endFrame`: where the previous
 *  shot's window ends in its take (the audio timeline) — the guide is what the audience sees last, not the take's
 *  own last frames when the cut leaves those out. The clip is COUNTED after it is written (frames and sound), so the
 *  caller validates what the node will see (src/server/production/guide.ts) instead of trusting the request. */
export async function tailClip(video: string, out: string, frames: number, fps = 24, endFrame?: number): Promise<TailClip> {
  const p = await ffprobe(video);
  const total = p.frames ?? Math.round((p.durationSeconds ?? 0) * fps);
  const mov = out.replace(/\.mp4$/, '.mov');
  await ffmpeg(tailClipArgs(video, mov, frames, total, fps, endFrame));
  const end = endFrame !== undefined && endFrame > 0 ? (total ? Math.min(endFrame, total) : endFrame) : total;
  return { file: mov, ...(await probeGuideClip(mov)), sourceEndFrame: end, sourceTotalFrames: total };
}

/** The ffmpeg arguments that write frame `frame` of a clip as a PNG (an established plate of a place). */
export function frameAtArgs(video: string, out: string, frame: number, fps = 24): string[] {
  return ['-y', '-v', 'error', '-ss', (Math.max(0, frame) / fps).toFixed(6), '-i', video, '-an', '-frames:v', '1', '-update', '1', out];
}
export async function frameAt(video: string, out: string, frame: number, fps = 24): Promise<string> {
  await ffmpeg(frameAtArgs(video, out, frame, fps));
  return out;
}

/** The last frame of a clip as a PNG (the hosted continuation: the previous take's closing frame becomes the next
 *  take's first frame, the platform's own continuation idiom). */
export async function lastFrame(video: string, out: string): Promise<string> {
  await ffmpeg(['-y', '-v', 'error', '-sseof', '-1', '-i', video, '-an', '-update', '1', '-q:v', '1', out]);
  return out;
}

/** The ffmpeg arguments that extract a take's sound for transcription (mono 16 kHz WAV), starting after the head that
 *  repeats the previous shot (`fromSeconds`, a continuation guide): those words were the previous shot's and are not
 *  this take's script, so they are not heard back as insertions. */
export function speechAudioArgs(video: string, wav: string, fromSeconds = 0): string[] {
  return ['-y', '-v', 'error', ...(fromSeconds > 0 ? ['-ss', fromSeconds.toFixed(6)] : []), '-i', video, '-vn', '-ac', '1', '-ar', '16000', wav];
}

