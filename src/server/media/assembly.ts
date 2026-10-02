import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Asset, Character, Production, Shot } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { StudioError } from '@/domain/errors';
import { ffprobe, fileFor } from '../media';
import { ffmpeg, measureLoudness, tmpDir } from './ffmpeg';
import { log } from '../log';

/** ASSEMBLY — the chosen take of every shot, in order, conformed to one frame size and rate, with the sound laid
 *  under it: the take's own audio (MiniMax H3 speaks), the recorded dialogue lines where a take is silent, the song
 *  of a music video, and loudness brought to broadcast level. Subtitles are written as SRT/VTT sidecars and can be
 *  burned in on export. Every intermediate is probed; nothing is trusted because it exists. */

export interface Timeline { items: Array<{ shot: Shot; take: Asset; start: number; duration: number; sceneNumber: number }>; total: number }

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export function buildTimeline(p: Production, assets: Asset[]): Timeline {
  const items: Timeline['items'] = [];
  let t = 0;
  for (const sh of p.shots) {
    const take = sh.takes.find((x) => x.id === sh.selectedTakeId);
    if (!take) throw new StudioError('INVALID', `Shot ${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number} has no chosen take.`);
    const a = assets.find((x) => x.id === take.assetId);
    if (!a) throw new StudioError('NOT_FOUND', `The file of ${take.label} is missing.`);
    const duration = take.durationSeconds ?? a.durationSeconds ?? sh.durationSeconds;
    items.push({ shot: sh, take: a, start: t, duration, sceneNumber: p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? 0 });
    t += duration;
  }
  if (items.length === 0) throw new StudioError('INVALID', 'There are no shots to assemble.');
  return { items, total: t };
}

export interface AssembleOptions { width: number; height: number; fps?: number; song?: Asset; dialogueAudio?: Array<{ assetId: string; start: number; file: string }>; subtitles?: { srt?: string; burn?: 'ar' | 'en' | 'both' | 'none' }; crf?: number; codec?: 'h264' | 'h265' | 'prores'; targetLufs?: number; outFile: string; onProgress?: (msg: string) => Promise<void> | void }

/** Concatenate the takes with a uniform conform, then mix. Returns the output path and the measured loudness. */
export async function assemble(p: Production, timeline: Timeline, opts: AssembleOptions): Promise<{ file: string; loudness: { integrated: number; truePeak: number } | null; durationSeconds: number }> {
  const dir = await tmpDir('cut');
  const fps = opts.fps ?? 24;
  const { width, height } = opts;
  // 1) conform each take: same size (letterboxed), same fps, same audio layout; silent takes get a silent track
  const parts: string[] = [];
  for (const [i, it] of timeline.items.entries()) {
    await opts.onProgress?.(`conforming shot ${it.sceneNumber}.${it.shot.number} (${i + 1}/${timeline.items.length})`);
    const src = assetFile(it.take);
    const probe = await ffprobe(src);
    const out = path.join(dir, `part-${String(i).padStart(3, '0')}.mp4`);
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},format=yuv420p,setsar=1`;
    const args = ['-i', src];
    if (!probe.hasAudio) args.push('-f', 'lavfi', '-t', String(it.duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    args.push('-map', '0:v:0', '-map', probe.hasAudio ? '0:a:0' : '1:a:0', '-t', String(it.duration), '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', '-shortest', out);
    await ffmpeg(args, { timeoutMs: 20 * 60_000 });
    parts.push(out);
  }
  // 2) concat
  await opts.onProgress?.('joining shots');
  const list = path.join(dir, 'list.txt');
  await fsp.writeFile(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const joined = path.join(dir, 'joined.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined], { timeoutMs: 20 * 60_000 });
  // 3) mix: take audio (dialogue from MiniMax) + recorded dialogue lines placed at their shot start + song under everything
  await opts.onProgress?.('mixing sound');
  const inputs: string[] = ['-i', joined];
  const filters: string[] = [];
  const mixInputs: string[] = ['[0:a]volume=1.0[a0]'];
  const labels: string[] = ['[a0]'];
  let n = 1;
  for (const d of opts.dialogueAudio ?? []) {
    inputs.push('-i', d.file);
    filters.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(d.start * 1000)}|${Math.round(d.start * 1000)},volume=1.0[d${n}]`);
    labels.push(`[d${n}]`); n++;
  }
  if (opts.song) {
    inputs.push('-i', assetFile(opts.song));
    filters.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${timeline.total.toFixed(3)},volume=${p.kind === 'MUSIC_VIDEO' ? '1.0' : '0.35'}[m]`);
    labels.push('[m]'); n++;
  }
  filters.unshift(...mixInputs);
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0[mix]`);
  const mixed = path.join(dir, 'mixed.mp4');
  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', mixed], { timeoutMs: 30 * 60_000 });
  // 4) loudness: two-pass EBU R128 to the target (−23 LUFS for episodes/shorts, −14 for music videos), true peak −1
  await opts.onProgress?.('normalising loudness');
  const target = opts.targetLufs ?? (p.kind === 'MUSIC_VIDEO' ? -14 : -23);
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
    const weights = lines.map((d) => Math.max(1, (lang === 'ar' ? d.textAr || d.text : d.text || d.textAr || '').split(/\s+/).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = it.start + 0.15;
    const avail = it.duration - 0.3;
    lines.forEach((d, i) => {
      const dur = d.durationSeconds ?? (avail * weights[i]) / total;
      const text = lang === 'ar' ? d.textAr || d.text : d.text || d.textAr || '';
      const who = cast.find((c) => c.id === d.characterId);
      cues.push({ start: cursor, end: Math.min(it.start + it.duration, cursor + dur), text, speaker: who?.name });
      cursor += dur;
    });
  }
  return cues;
}

export function lyricCues(p: Production, lang: 'ar' | 'en'): Cue[] {
  if (!p.song) return [];
  return p.song.sections.filter((s) => (lang === 'ar' ? s.textAr || s.text : s.text || s.textAr)).map((s) => ({ start: s.from, end: s.to, text: (lang === 'ar' ? s.textAr || s.text : s.text || s.textAr) ?? '' }));
}

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
