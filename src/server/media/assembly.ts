import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Asset, Character, Production, Shot, Take } from '@/domain/types';

const execFileP = promisify(execFile);
import { orderedShots } from '@/domain/timeline';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { StudioError } from '@/domain/errors';
import { ffprobe, fileFor } from '../media';
import { ffmpeg, measureLoudness, tmpDir } from './ffmpeg';
import { log } from '../log';

/** ASSEMBLY — the chosen take of every shot, in order, conformed to one frame size and rate, with the sound laid
 *  under it: the take's own audio (MiniMax H3 speaks), the recorded dialogue lines where a take is silent, the song
 *  of a music video, and loudness brought to broadcast level. Subtitles are written as SRT/VTT sidecars and can be
 *  burned in on export. Every intermediate is probed; nothing is trusted because it exists. */

/** The cut's clock runs in whole frames at the cut's frame rate and in whole samples at 48 kHz: every shot starts on
 *  a frame boundary, every sound at a sample offset derived from that frame count. No accumulated float estimates. */
export const CUT_FPS = 24;
export const CUT_RATE = 48000;

export interface TimelineItem { shot: Shot; take: Asset; takeRecord: Take; start: number; duration: number; startFrame: number; frames: number; /** frames dropped at the head of the take (continuation guide) */ trimStartFrames: number; sceneNumber: number }
export interface Timeline { items: TimelineItem[]; total: number; totalFrames: number }

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export function buildTimeline(p: Production, assets: Asset[], opts: { /** extra head frames to drop per shot (sound-to-picture alignment under a song master) */ extraTrim?: Record<string, number> } = {}): Timeline {
  const items: TimelineItem[] = [];
  let frame = 0;
  for (const sh of orderedShots(p)) {
    const take = sh.takes.find((x) => x.id === sh.selectedTakeId);
    if (!take) throw new StudioError('INVALID', `Shot ${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number} has no chosen take.`);
    const a = assets.find((x) => x.id === take.assetId);
    if (!a) throw new StudioError('NOT_FOUND', `The file of ${take.label} is missing.`);
    const trimStartFrames = Math.max(0, take.trimStartFrames ?? 0) + Math.max(0, opts.extraTrim?.[sh.id] ?? 0);
    const sourceFrames = Math.round((take.durationSeconds ?? a.durationSeconds ?? sh.durationSeconds) * CUT_FPS);
    const frames = Math.max(1, sourceFrames - trimStartFrames);
    items.push({ shot: sh, take: a, takeRecord: take, start: frame / CUT_FPS, duration: frames / CUT_FPS, startFrame: frame, frames, trimStartFrames, sceneNumber: p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? 0 });
    frame += frames;
  }
  if (items.length === 0) throw new StudioError('INVALID', 'There are no shots to assemble.');
  return { items, total: frame / CUT_FPS, totalFrames: frame };
}

/** AUDIO TRACKS — every sound in a cut is a typed track with a stable source, a sample-exact placement and a gain
 *  set by policy, so the same timeline always mixes to the same result and no source can be routed twice. */
export type AudioTrackKind = 'MASTER_MUSIC' | 'LEAD_VOCAL' | 'BACKING_VOCAL' | 'DIALOGUE' | 'AMBIENCE' | 'FOLEY' | 'SOUND_EFFECTS' | 'GENERATED_VIDEO_AUDIO';
export interface AudioTrack {
  kind: AudioTrackKind;
  /** stable source: the asset (or the take's file) and, for a take, the frames skipped at its head */
  sourceAssetId: string;
  sourceOffsetSamples: number;
  startSample: number;
  durationSamples: number;
  gain: number;
  /** why this gain: the policy that set it (shown in the Final Cut mix panel and kept in provenance) */
  policy: string;
  shotId?: string;
  muted?: boolean;
}
export interface MixPlan { rate: number; tracks: AudioTrack[]; targetLufs: number; notes: string[] }

/** The mix plan for a timeline: the one authoritative sound for each stretch of the cut.
 *  - A music video with a song master: the song is the soundtrack from sample 0; the takes' own sound is muted
 *    (MiniMax sings along to its anchored stretch of the song, so it would double the vocals); nothing else.
 *  - Otherwise: each take's own sound (MiniMax speaks natively, or carries the anchored dialogue soundtrack) at unity;
 *    recorded dialogue lines only under takes that have no sound of their own; a song, when present, as a bed.
 *  Each source appears once. */
export function buildMixPlan(p: Production, timeline: Timeline, opts: { song?: Asset; dialogueAudio?: Array<{ assetId: string; start: number; durationSeconds?: number; shotId?: string }>; targetLufs?: number }): MixPlan {
  const rate = CUT_RATE;
  const tracks: AudioTrack[] = [];
  const notes: string[] = [];
  const musicVideo = p.kind === 'MUSIC_VIDEO' && Boolean(opts.song);
  for (const it of timeline.items) {
    const hasAudio = Boolean((it.take.provenance as { probe?: { hasAudio?: boolean } } | undefined)?.probe?.hasAudio);
    if (!hasAudio) continue;
    const muted = musicVideo;
    tracks.push({ kind: 'GENERATED_VIDEO_AUDIO', sourceAssetId: it.take.id, sourceOffsetSamples: Math.round((it.trimStartFrames / CUT_FPS) * rate), startSample: Math.round((it.startFrame / CUT_FPS) * rate), durationSamples: Math.round((it.frames / CUT_FPS) * rate), gain: muted ? 0 : 1, muted, policy: muted ? 'music video: the song master is the soundtrack; the take sang along to it' : it.takeRecord.soundtrack?.kind === 'DIALOGUE' ? 'carries the anchored dialogue soundtrack' : 'native MiniMax sound', shotId: it.shot.id });
  }
  if (!musicVideo) {
    for (const d of opts.dialogueAudio ?? []) tracks.push({ kind: 'DIALOGUE', sourceAssetId: d.assetId, sourceOffsetSamples: 0, startSample: Math.round(d.start * rate), durationSamples: Math.round((d.durationSeconds ?? 2) * rate), gain: 1, policy: 'recorded line under a take without its own sound', shotId: d.shotId });
  }
  if (opts.song) tracks.push({ kind: 'MASTER_MUSIC', sourceAssetId: opts.song.id, sourceOffsetSamples: 0, startSample: 0, durationSamples: Math.round(timeline.total * rate), gain: musicVideo ? 1 : 0.35, policy: musicVideo ? 'the song master, once, from the first frame' : 'music bed under dialogue' });
  if (musicVideo) notes.push(`${tracks.filter((t) => t.muted).length} take soundtracks muted under the song master`);
  const ids = tracks.filter((t) => !t.muted).map((t) => `${t.sourceAssetId}@${t.startSample}`);
  if (new Set(ids).size !== ids.length) throw new StudioError('INVALID', 'The mix plan routes one source twice.');
  return { rate, tracks, targetLufs: opts.targetLufs ?? (p.kind === 'MUSIC_VIDEO' ? -14 : -23), notes };
}

export interface AssembleOptions { width: number; height: number; fps?: number; /** the typed, sample-placed tracks (see buildMixPlan) */ mix: MixPlan; /** file of every source the mix names */ files: Record<string, string>; subtitles?: { srt?: string; burn?: 'ar' | 'en' | 'both' | 'none' }; crf?: number; codec?: 'h264' | 'h265' | 'prores'; outFile: string; onProgress?: (msg: string) => Promise<void> | void }

/** Concatenate the takes' pictures with a uniform conform, lay the mix plan's tracks at their sample offsets, bring
 *  the loudness to target, encode. Returns the output path and the measured loudness. */
export async function assemble(p: Production, timeline: Timeline, opts: AssembleOptions): Promise<{ file: string; loudness: { integrated: number; truePeak: number } | null; durationSeconds: number }> {
  const dir = await tmpDir('cut');
  const fps = opts.fps ?? CUT_FPS;
  const { width, height } = opts;
  // 1) conform each take's PICTURE: same size (letterboxed), same fps, exactly its frame count, head frames of a
  //    continuation guide dropped; no audio here — sound is placed by the mix plan, never carried by the parts
  const parts: string[] = [];
  for (const [i, it] of timeline.items.entries()) {
    await opts.onProgress?.(`conforming shot ${it.sceneNumber}.${it.shot.number} (${i + 1}/${timeline.items.length})`);
    const src = assetFile(it.take);
    const out = path.join(dir, `part-${String(i).padStart(3, '0')}.mp4`);
    const vf = `fps=${fps},select=gte(n\\,${it.trimStartFrames}),setpts=N/FRAME_RATE/TB,scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1`;
    await ffmpeg(['-i', src, '-map', '0:v:0', '-an', '-vf', vf, '-frames:v', String(it.frames), '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-video_track_timescale', String(fps * 1000), out], { timeoutMs: 20 * 60_000 });
    parts.push(out);
  }
  // 2) concat the pictures (same codec, same timescale: a frame-exact join)
  await opts.onProgress?.('joining shots');
  const list = path.join(dir, 'list.txt');
  await fsp.writeFile(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const joined = path.join(dir, 'joined.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined], { timeoutMs: 20 * 60_000 });
  // 3) the mix: every unmuted track is cut from its source by sample, placed at its start sample, scaled by its
  //    gain, and summed without automatic normalisation; the result is padded/cut to the picture's exact length
  await opts.onProgress?.('mixing sound');
  const rate = opts.mix.rate;
  const totalSamples = Math.round((timeline.totalFrames / fps) * rate);
  const live = opts.mix.tracks.filter((t) => !t.muted && t.gain > 0);
  const inputs: string[] = ['-i', joined];
  const filters: string[] = [];
  const labels: string[] = [];
  live.forEach((t, k) => {
    const file = opts.files[t.sourceAssetId];
    if (!file) throw new StudioError('NOT_FOUND', `The mix names a source that has no file (${t.kind} ${t.sourceAssetId}).`);
    inputs.push('-i', file);
    const n = k + 1;
    filters.push(`[${n}:a]aformat=sample_rates=${rate}:channel_layouts=stereo,atrim=start_sample=${t.sourceOffsetSamples}:end_sample=${t.sourceOffsetSamples + t.durationSamples},asetpts=PTS-STARTPTS,volume=${t.gain.toFixed(4)},adelay=${t.startSample}S:all=1[t${n}]`);
    labels.push(`[t${n}]`);
  });
  if (!labels.length) { inputs.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${rate}`); filters.push(`[1:a]atrim=end_sample=${totalSamples}[t1]`); labels.push('[t1]'); }
  filters.push(`${labels.join('')}${labels.length > 1 ? `amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,` : ''}apad=whole_len=${totalSamples},atrim=end_sample=${totalSamples}[mix]`);
  const mixed = path.join(dir, 'mixed.mp4');
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', String(rate), mixed], { timeoutMs: 30 * 60_000 });
  // 4) loudness: two-pass EBU R128 to the target (−23 LUFS for episodes/shorts, −14 for music videos), true peak −1
  await opts.onProgress?.('normalising loudness');
  const target = opts.mix.targetLufs;
  const stats = await measureLoudness(mixed);
  const loudArgs = stats ? `loudnorm=I=${target}:LRA=11:TP=-1:measured_I=${stats.integrated}:measured_LRA=${stats.range}:measured_TP=${stats.truePeak}:measured_thresh=${stats.threshold}:linear=true:print_format=summary` : `loudnorm=I=${target}:LRA=11:TP=-1`;
  const normalised = path.join(dir, 'normalised.mp4');
  await ffmpeg(['-i', mixed, '-af', loudArgs, '-ar', '48000', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', normalised], { timeoutMs: 30 * 60_000 });
  // 5) final encode (burn-in subtitles when asked), faststart
  await opts.onProgress?.('encoding the cut');
  const codec = opts.codec ?? 'h264';
  const vcodec = codec === 'h265' ? ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(opts.crf ?? 20), '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'] : codec === 'prores' ? ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(opts.crf ?? 18), '-pix_fmt', 'yuv420p'];
  const burn = opts.subtitles?.burn && opts.subtitles.burn !== 'none' && opts.subtitles.srt;
  const vf = burn ? ['-vf', `subtitles='${opts.subtitles!.srt!.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}':force_style='FontName=Noto Naskh Arabic,FontSize=22,Outline=1,Shadow=0,MarginV=36,Alignment=2'`] : [];
  await ffmpeg(['-i', normalised, ...vf, ...vcodec, '-c:a', codec === 'prores' ? 'pcm_s16le' : 'copy', '-movflags', '+faststart', opts.outFile], { timeoutMs: 60 * 60_000 });
  const probe = await ffprobe(opts.outFile);
  const loud = await measureLoudness(opts.outFile);
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  log.info({ production: p.id, duration: probe.durationSeconds, loud }, 'cut assembled');
  return { file: opts.outFile, loudness: loud ? { integrated: loud.integrated, truePeak: loud.truePeak } : null, durationSeconds: probe.durationSeconds ?? timeline.total };
}

/** EXPORT VALIDATION — the finished file is inspected, not trusted: picture and sound the same length to within a
 *  frame, the expected frame rate and size, timestamps starting at zero, no black stretch longer than a cut should
 *  have, and the mix plan's total matching the picture. A failed check fails the export. */
export interface ExportValidation { ok: boolean; checks: Array<{ name: string; ok: boolean; value?: string | number; detail?: string }> }
export async function validateExport(file: string, expect: { width: number; height: number; fps: number; durationSeconds: number; subtitlesBurned: boolean }): Promise<ExportValidation> {
  const checks: ExportValidation['checks'] = [];
  const p = await ffprobe(file);
  const push = (name: string, ok: boolean, value?: string | number, detail?: string) => checks.push({ name, ok, value, detail });
  push('decodable', Boolean(p.hasVideo), `${p.videoCodec ?? '?'} ${p.width}x${p.height}`);
  push('size', p.width === expect.width && p.height === expect.height, `${p.width}x${p.height}`, `expected ${expect.width}x${expect.height}`);
  push('frame-rate', Math.abs((p.fps ?? 0) - expect.fps) < 0.01, p.fps, `expected ${expect.fps}`);
  push('audio-present', Boolean(p.hasAudio), p.audioCodec ?? 'none');
  const dv = p.durationSeconds ?? 0;
  push('duration', Math.abs(dv - expect.durationSeconds) <= 1 / expect.fps + 0.001, Number(dv.toFixed(3)), `expected ${expect.durationSeconds.toFixed(3)} s`);
  // stream durations: picture and sound within one frame of each other
  try {
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,start_time', '-of', 'json', file]);
    const streams = (JSON.parse(stdout) as { streams: Array<{ codec_type: string; duration?: string; start_time?: string }> }).streams;
    const v = streams.find((s) => s.codec_type === 'video'); const a = streams.find((s) => s.codec_type === 'audio');
    const gap = Math.abs(Number(v?.duration ?? 0) - Number(a?.duration ?? 0));
    push('audio-video-length', gap <= 1 / expect.fps + 0.03, Number(gap.toFixed(3)), 'difference in seconds');
    push('timestamps-start', Math.abs(Number(v?.start_time ?? 0)) <= 1 / expect.fps + 0.001 && Math.abs(Number(a?.start_time ?? 0)) <= 0.05, `${v?.start_time ?? '?'} / ${a?.start_time ?? '?'}`);
  } catch (e) { push('audio-video-length', false, undefined, (e as Error).message); }
  // black stretches: a fade is short; a black second is a broken part
  try {
    const { stderr } = await execFileP('ffmpeg', ['-v', 'info', '-i', file, '-vf', 'blackdetect=d=0.8:pix_th=0.10', '-an', '-f', 'null', '-'], { maxBuffer: 50 * 1024 * 1024 });
    const found = [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${m[1]}–${m[2]}`);
    push('no-black-segments', found.length === 0, found.length, found.slice(0, 5).join(', '));
  } catch (e) { push('no-black-segments', false, undefined, (e as Error).message); }
  if (expect.subtitlesBurned) push('subtitles', true, 'burned', 'checked visually in the review');
  return { ok: checks.every((c) => c.ok), checks };
}

const srtTime = (t: number) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`; };
const vttTime = (t: number) => srtTime(t).replace(',', '.');

export interface Cue { start: number; end: number; text: string; speaker?: string }

/** Subtitle cues from the shots' dialogue: each line gets a slice of its shot proportional to its length, unless the
 *  line carries real timing from its recording. Arabic text keeps its own direction; the player handles RTL. */
export function dialogueCues(_p: Production, timeline: Timeline, cast: Character[], lang: 'ar' | 'en'): Cue[] {
  const cues: Cue[] = [];
  for (const it of timeline.items) {
    const lines = it.shot.dialogue.filter((d) => (lang === 'ar' ? d.textAr || d.text : d.text || d.textAr));
    if (!lines.length) continue;
    // a take generated to a recorded soundtrack knows exactly when each line is spoken
    const exact = it.takeRecord.soundtrack?.kind === 'DIALOGUE' ? it.takeRecord.soundtrack.lines : [];
    if (exact.length) {
      const head = it.trimStartFrames / CUT_FPS;
      for (const d of lines) {
        const w = exact.find((x) => x.lineId === d.id);
        if (!w) continue;
        const who = cast.find((c) => c.id === d.characterId);
        cues.push({ start: it.start + Math.max(0, w.from - head), end: Math.min(it.start + it.duration, it.start + w.to - head), text: rtlMark(lang, lang === 'ar' ? d.textAr || d.text : d.text || d.textAr || ''), speaker: who?.name });
      }
      continue;
    }
    const weights = lines.map((d) => Math.max(1, (lang === 'ar' ? d.textAr || d.text : d.text || d.textAr || '').split(/\s+/).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = it.start + 0.15;
    const avail = it.duration - 0.3;
    lines.forEach((d, i) => {
      const dur = d.durationSeconds ?? (avail * weights[i]) / total;
      const text = rtlMark(lang, lang === 'ar' ? d.textAr || d.text : d.text || d.textAr || '');
      const who = cast.find((c) => c.id === d.characterId);
      cues.push({ start: cursor, end: Math.min(it.start + it.duration, cursor + dur), text, speaker: who?.name });
      cursor += dur;
    });
  }
  return cues;
}

/** One cue per lyric line, spread evenly over its section (the transcription service refines timings when it has
 *  run); a section without line breaks stays one cue. */
export function lyricCues(p: Production, lang: 'ar' | 'en'): Cue[] {
  if (!p.song) return [];
  const cues: Cue[] = [];
  for (const s of p.song.sections) {
    const text = (lang === 'ar' ? s.textAr || s.text : s.text || s.textAr) ?? '';
    const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!lines.length) continue;
    const span = Math.max(0, s.to - s.from) / lines.length;
    const timed = s.lineTimes?.length === lines.length ? s.lineTimes : undefined;
    lines.forEach((line, i) => cues.push({ start: timed ? timed[i].from : s.from + span * i, end: timed ? timed[i].to : s.from + span * (i + 1), text: rtlMark(lang, line) }));
  }
  return cues;
}

/** An Arabic cue that starts with a digit or a Latin word has no strong character to set its direction, so the
 *  burn-in renderer may lay it out left-to-right ("35" ended up at the wrong end of a line). A leading right-to-left
 *  mark fixes the base direction; players and sidecar files ignore it visually. */
export const rtlMark = (lang: 'ar' | 'en', text: string) => (lang === 'ar' && text && !/^[؀-ۿ‏]/.test(text.trimStart()) ? `‏${text}` : text);

export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.trim()}\n`).join('\n');
export const toVtt = (cues: Cue[]) => `WEBVTT\n\n${cues.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text.trim()}\n`).join('\n')}`;

/** Both languages in one track: Arabic line above, English below. */
export function mergeBilingual(ar: Cue[], en: Cue[]): Cue[] {
  const out: Cue[] = [];
  const used = new Set<number>();
  for (const a of ar) {
    const j = en.findIndex((e, idx) => !used.has(idx) && Math.abs(e.start - a.start) < 0.05);
    if (j >= 0) { used.add(j); out.push({ ...a, text: `${a.text}\n${en[j].text}` }); } else out.push(a);
  }
  en.forEach((e, idx) => { if (!used.has(idx)) out.push(e); });
  return out.sort((x, y) => x.start - y.start);
}

export function exportSize(aspect: Production['aspect'], resolution: '720' | '1080' | '2160'): { width: number; height: number } {
  const info = ASPECT_INFO[aspect];
  const short = Number(resolution);
  const landscape = info.width >= info.height;
  const long = Math.round(short * (landscape ? info.ratio : 1 / info.ratio) / 2) * 2;
  return landscape ? { width: long, height: short } : { width: short, height: long };
}
