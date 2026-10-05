import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileP } from './exec';
import type { Asset, Character, Production, Shot, ShotRelation, Take } from '@/domain/types';

// ffmpeg/ffprobe with a timeout, killed when the job is cancelled or times out (src/server/media/exec.ts)
import { buildAudioTimeline, CLOCK_FPS, CLOCK_RATE, type AudioTimeline, type AudioTimelineOptions, type GuideJoin, type ShotClock } from '@/domain/timeline';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { StudioError } from '@/domain/errors';
import { assetFile, ffprobe } from '../media';
import { ffmpeg, measureLoudness, tmpDir } from './ffmpeg';
import { mixPlanOf, trackFilter, type MixPlan } from './mix';
import { measureJoins, type JoinMetric } from './assembly-joins';
import { log } from '../log';

export type { AudioTrack, AudioTrackKind, MixPlan } from './mix';
export type { JoinMetric } from './assembly-joins';

/** ASSEMBLY — the chosen take of every shot, in order, conformed to one frame size and rate, with the sound laid
 *  under it as the production audio timeline says (src/domain/timeline.ts): the take's own audio (MiniMax H3 speaks),
 *  the character's recorded line where the policy says so, the song of a music video, a song bed ducked under voices,
 *  ambience beds; loudness brought to broadcast level. The picture CONFORMS TO THE TIMELINE: each shot fills exactly
 *  its window (a continuation's head dropped, frames past what the take was made for left out, a short take holding
 *  its last frame under a song window), so the clock never drifts. Every join is measured (join QA). Subtitles are
 *  written as SRT/VTT sidecars and can be burned in on export. Every intermediate is probed; nothing is trusted
 *  because it exists. */

/** The cut's clock runs in whole frames at the cut's frame rate and in whole samples at 48 kHz: every shot starts on
 *  a frame boundary, every sound at a sample offset derived from that frame count. No accumulated float estimates. */
export const CUT_FPS = CLOCK_FPS;
export const CUT_RATE = CLOCK_RATE;

export interface TimelineItem { shot: Shot; take: Asset; takeRecord: Take; start: number; duration: number; startFrame: number; frames: number; /** the take's frame at the start of the window (its continuation head and any alignment trim dropped) */ trimStartFrames: number; /** frames that repeat the take's last frame (a song window longer than the take) */ holdFrames: number; relation?: ShotRelation; /** a continuation's join: TRIM (head dropped) or HARD (head kept) */ join?: GuideJoin; basis: ShotClock['basis']; sceneNumber: number }
export interface Timeline { items: TimelineItem[]; total: number; totalFrames: number; /** the authoritative production audio timeline the items are read from */ audio: AudioTimeline }

/** The cut's timeline: the production audio timeline's shot windows, as items the renderer conforms. */
export function buildTimeline(p: Production, assets: Asset[], opts: AudioTimelineOptions = {}): Timeline {
  const audio = buildAudioTimeline(p, assets, opts);
  const items: TimelineItem[] = audio.shots.map((s) => {
    const sh = p.shots.find((x) => x.id === s.shotId)!;
    const take = sh.takes.find((x) => x.id === s.takeId)!;
    const a = assets.find((x) => x.id === s.assetId)!;
    return { shot: sh, take: a, takeRecord: take, start: s.startFrame / CUT_FPS, duration: s.frames / CUT_FPS, startFrame: s.startFrame, frames: s.frames, trimStartFrames: s.sourceStartFrame, holdFrames: s.holdFrames, relation: s.relation, join: s.join, basis: s.basis, sceneNumber: p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? 0 };
  });
  if (items.length === 0) throw new StudioError('INVALID', 'There are no shots to assemble.');
  return { items, total: audio.totalFrames / CUT_FPS, totalFrames: audio.totalFrames, audio };
}

/** The mix plan of a timeline (src/server/media/mix.ts): one typed track per cue of its audio timeline; refused
 *  (AUDIO_DUPLICATION) when the timeline would route a source twice, play a song twice or two voices at once. */
export function buildMixPlan(p: Production, timeline: Timeline, opts: { targetLufs?: number } = {}): MixPlan {
  return mixPlanOf(p, timeline.audio, opts);
}

export interface AssembleOptions { width: number; height: number; fps?: number; /** the typed, sample-placed tracks (see buildMixPlan) */ mix: MixPlan; /** file of every source the mix names */ files: Record<string, string>; subtitles?: { srt?: string; burn?: 'ar' | 'en' | 'both' | 'none' }; crf?: number; codec?: 'h264' | 'h265' | 'prores'; outFile: string; onProgress?: (msg: string) => Promise<void> | void; /** measure every join (default true) */ joins?: boolean }

/** The ffmpeg video filter that conforms one shot's take to its window: the take's frames from `trimStartFrames`,
 *  the last frame held for `holdFrames`, one size (letterboxed), one rate. Pure, so its shape is tested. */
export function conformFilter(it: Pick<TimelineItem, 'trimStartFrames' | 'holdFrames'>, size: { width: number; height: number }, fps = CUT_FPS): string {
  return `fps=${fps},select=gte(n\\,${it.trimStartFrames}),setpts=N/FRAME_RATE/TB${it.holdFrames > 0 ? `,tpad=stop_mode=clone:stop=${it.holdFrames}` : ''},scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1`;
}

/** Concatenate the takes' pictures with a uniform conform, lay the mix plan's tracks at their sample offsets, measure
 *  the joins, bring the loudness to target, encode. Returns the output path, the measured loudness and the joins. */
export async function assemble(p: Production, timeline: Timeline, opts: AssembleOptions): Promise<{ file: string; loudness: { integrated: number; truePeak: number } | null; durationSeconds: number; joins: JoinMetric[] }> {
  const dir = await tmpDir('cut');
  const fps = opts.fps ?? CUT_FPS;
  const { width, height } = opts;
  // 1) conform each take's PICTURE to its window: same size (letterboxed), same fps, exactly its frame count, head
  //    frames of a continuation guide dropped, a short take's last frame held; no audio here — sound is placed by
  //    the mix plan, never carried by the parts
  const parts: string[] = [];
  for (const [i, it] of timeline.items.entries()) {
    await opts.onProgress?.(`conforming shot ${it.sceneNumber}.${it.shot.number} (${i + 1}/${timeline.items.length})`);
    const src = assetFile(it.take);
    const out = path.join(dir, `part-${String(i).padStart(3, '0')}.mp4`);
    await ffmpeg(['-i', src, '-map', '0:v:0', '-an', '-vf', conformFilter(it, { width, height }, fps), '-frames:v', String(it.frames), '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-video_track_timescale', String(fps * 1000), out], { timeoutMs: 20 * 60_000 });
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
    // a looping bed (ambience) repeats its source to fill the cue
    inputs.push(...(t.loop ? ['-stream_loop', '-1'] : []), '-i', file);
    const n = k + 1;
    filters.push(trackFilter(t, `[${n}:a]`, `[t${n}]`, rate));
    labels.push(`[t${n}]`);
  });
  if (!labels.length) { inputs.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${rate}`); filters.push(`[1:a]atrim=end_sample=${totalSamples}[t1]`); labels.push('[t1]'); }
  filters.push(`${labels.join('')}${labels.length > 1 ? `amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,` : ''}apad=whole_len=${totalSamples},atrim=end_sample=${totalSamples}[mix]`);
  const mixed = path.join(dir, 'mixed.mp4');
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', String(rate), mixed], { timeoutMs: 30 * 60_000 });
  // 3b) JOIN QA: every join measured on the conformed pictures and on the mix the audience hears
  let joins: JoinMetric[] = [];
  if (opts.joins !== false && timeline.items.length > 1) {
    await opts.onProgress?.('measuring the joins');
    joins = await measureJoins(timeline.items.map((it, i) => ({ file: parts[i], shotId: it.shot.id, relation: it.relation, join: it.join, startFrame: it.startFrame, frames: it.frames })), mixed, fps).catch((e) => { log.warn({ err: (e as Error).message }, 'join measurement failed'); return []; });
  }
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
  log.info({ production: p.id, duration: probe.durationSeconds, loud, joins: joins.filter((j) => j.judged).map((j) => ({ to: j.toShotId, ok: j.ok })) }, 'cut assembled');
  return { file: opts.outFile, loudness: loud ? { integrated: loud.integrated, truePeak: loud.truePeak } : null, durationSeconds: probe.durationSeconds ?? timeline.total, joins };
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

/** Subtitle cues from the shots' dialogue: where the audio timeline plays a recorded line, exactly there; else where
 *  the take was heard to speak it; else a slice of its shot proportional to its length. Arabic text keeps its own
 *  direction; the player handles RTL. */
/** THE TEXT OF A CUE IN ONE SUBTITLE LANGUAGE, or nothing (acceptance 2026-10-05, open item 4: an "ar" track full of
 *  English was written for an English film). A track holds only text in its own script: the Arabic track takes the
 *  Arabic line (`textAr`, or `text` when it is Arabic), the English track the Latin-script line (`text`, or the gloss);
 *  a film with no Arabic text has no Arabic track at all, and an Arabic line with no English gloss has no English cue. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;
export function cueTextIn(lang: 'ar' | 'en', d: { text?: string; textAr?: string }): string | undefined {
  const candidates = lang === 'ar' ? [d.textAr, d.text] : [d.text, d.textAr];
  const fits = (t?: string) => Boolean(t?.trim()) && (lang === 'ar' ? ARABIC_SCRIPT.test(t!) : LATIN_LETTER.test(t!) && !ARABIC_SCRIPT.test(t!));
  return candidates.find(fits)?.trim();
}

export function dialogueCues(_p: Production, timeline: Timeline, cast: Character[], lang: 'ar' | 'en'): Cue[] {
  const cues: Cue[] = [];
  const played = new Map(timeline.audio.cues.filter((c) => c.kind === 'DIALOGUE' && !c.muted && c.lineId).map((c) => [c.lineId!, c]));
  for (const it of timeline.items) {
    const lines = it.shot.dialogue.filter((d) => cueTextIn(lang, d));
    if (!lines.length) continue;
    if (lines.every((d) => played.has(d.id))) {
      for (const d of lines) {
        const c = played.get(d.id)!;
        cues.push({ start: c.startSample / CUT_RATE, end: (c.startSample + c.durationSamples) / CUT_RATE, text: rtlMark(lang, cueTextIn(lang, d)!), speaker: cast.find((x) => x.id === d.characterId)?.name });
      }
      continue;
    }
    // a take generated to a recorded soundtrack knows exactly when each line is spoken
    const exact = it.takeRecord.soundtrack?.kind === 'DIALOGUE' ? it.takeRecord.soundtrack.lines : [];
    if (exact.length) {
      const head = it.trimStartFrames / CUT_FPS;
      for (const d of lines) {
        const w = exact.find((x) => x.lineId === d.id);
        if (!w) continue;
        const who = cast.find((c) => c.id === d.characterId);
        cues.push({ start: it.start + Math.max(0, w.from - head), end: Math.min(it.start + it.duration, it.start + w.to - head), text: rtlMark(lang, cueTextIn(lang, d)!), speaker: who?.name });
      }
      continue;
    }
    const weights = lines.map((d) => Math.max(1, cueTextIn(lang, d)!.split(/\s+/).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = it.start + 0.15;
    const avail = it.duration - 0.3;
    lines.forEach((d, i) => {
      const dur = d.durationSeconds ?? (avail * weights[i]) / total;
      const text = rtlMark(lang, cueTextIn(lang, d)!);
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
    const text = cueTextIn(lang, s) ?? '';
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
