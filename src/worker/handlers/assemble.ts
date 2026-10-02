import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset } from '@/domain/types';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor, storeBuffer } from '@/server/media';
import { thumbnail, tmpDir } from '@/server/media/ffmpeg';
import { assemble as assembleCut, buildMixPlan, buildTimeline, dialogueCues, exportSize, lyricCues, mergeBilingual, toSrt, toVtt, validateExport } from '@/server/media/assembly';
import { recordMetric } from '@/server/jobs/queue';
import { ASPECT_INFO } from '@/domain/vocabulary';

/** ASSEMBLE the chosen takes into a review cut (1080-class H.264, subtitles as sidecars); EXPORT renders the
 *  deliverable at the chosen format/resolution with the chosen subtitle treatment. Both record what they made. */

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

async function render(ctx: Parameters<Handler>[0], opts: { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both'; kind: 'cut' | 'export' }) {
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === opts.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  const timeline = buildTimeline(p, state.assets);
  // sample takes are stand-ins made by the prototype; refuse to pass them off as a production cut
  const sampleTakes = timeline.items.filter((it) => it.take.sample);
  if (sampleTakes.length) throw new StudioError('INVALID', `${sampleTakes.length} chosen take(s) are bundled sample clips, not generated footage. Generate real takes before assembling.`);
  await ctx.progress('PREPARING', { phase: 'preparing', message: `Assembling ${timeline.items.length} shots (${Math.round(timeline.total)} s)` });
  const size = exportSize(p.aspect, opts.resolution);
  const song = p.song?.assetId ? state.assets.find((a) => a.id === p.song!.assetId && !a.sample) : undefined;
  // recorded dialogue lines for shots whose take is silent (MiniMax H3 speaks natively; uploaded or legacy takes may not)
  const dialogueAudio: Array<{ assetId: string; start: number; durationSeconds?: number; shotId: string }> = [];
  const files: Record<string, string> = {};
  for (const it of timeline.items) {
    files[it.take.id] = assetFile(it.take);
    const takeHasAudio = Boolean(it.take.provenance && (it.take.provenance as { probe?: { hasAudio?: boolean } }).probe?.hasAudio);
    if (takeHasAudio) continue;
    let cursor = it.start + 0.2;
    for (const d of it.shot.dialogue) {
      const a = d.audioAssetId ? state.assets.find((x) => x.id === d.audioAssetId) : undefined;
      if (!a) continue;
      files[a.id] = assetFile(a);
      dialogueAudio.push({ assetId: a.id, start: cursor, durationSeconds: d.durationSeconds ?? a.durationSeconds, shotId: it.shot.id });
      cursor += (d.durationSeconds ?? a.durationSeconds ?? 2) + 0.25;
    }
  }
  if (song) files[song.id] = assetFile(song);
  // the typed mix plan: one authoritative sound per stretch, sample-placed, kept with the cut's provenance
  const mix = buildMixPlan(p, timeline, { song, dialogueAudio });
  await ctx.event('info', 'mix plan', { tracks: mix.tracks.map((t) => ({ kind: t.kind, source: t.sourceAssetId, startSample: t.startSample, durationSamples: t.durationSamples, gain: t.gain, muted: t.muted ?? false, policy: t.policy })), targetLufs: mix.targetLufs, notes: mix.notes });
  // subtitles
  const dir = await tmpDir('subs');
  const cuesAr = p.kind === 'MUSIC_VIDEO' ? lyricCues(p, 'ar') : dialogueCues(p, timeline, cast, 'ar');
  const cuesEn = p.kind === 'MUSIC_VIDEO' ? lyricCues(p, 'en') : dialogueCues(p, timeline, cast, 'en');
  const cues = opts.subtitles === 'ar' ? cuesAr : opts.subtitles === 'en' ? cuesEn : opts.subtitles === 'both' ? mergeBilingual(cuesAr, cuesEn) : [];
  const srtPath = path.join(dir, 'subs.srt');
  if (cues.length) await fsp.writeFile(srtPath, toSrt(cues), 'utf8');
  const outDir = await tmpDir(opts.kind);
  const ext = opts.format === 'mov-prores' ? 'mov' : 'mp4';
  const outFile = path.join(outDir, `${opts.kind}.${ext}`);
  const t0 = Date.now();
  const result = await assembleCut(p, timeline, { width: size.width, height: size.height, fps: 24, mix, files, subtitles: { srt: cues.length ? srtPath : undefined, burn: opts.kind === 'export' ? opts.subtitles : 'none' }, codec: opts.format === 'mp4-h265' ? 'h265' : opts.format === 'mov-prores' ? 'prores' : 'h264', outFile, onProgress: (m) => ctx.progress('POSTPROCESSING', { phase: 'rendering', message: m, percent: null }) });
  await ctx.checkpoint();
  // the finished file is inspected, not trusted: lengths, rate, size, timestamps, black stretches
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the finished file' });
  const validation = await validateExport(outFile, { width: size.width, height: size.height, fps: 24, durationSeconds: timeline.total, subtitlesBurned: opts.kind === 'export' && opts.subtitles !== 'none' });
  await ctx.event(validation.ok ? 'info' : 'error', `${opts.kind} validation ${validation.ok ? 'passed' : 'FAILED'}`, { checks: validation.checks });
  if (!validation.ok) throw new StudioError('PROVIDER', `The ${opts.kind} failed validation: ${validation.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.value ?? ''} ${c.detail ?? ''})`.trim()).join('; ')}`);
  const poster = path.join(outDir, 'poster.jpg');
  await thumbnail(outFile, poster, { at: Math.min(2, result.durationSeconds / 3), width: 1280 });
  const videoId = nid('gen'); const posterId = nid('gen');
  const storedPoster = await adoptFile(posterId, poster, { expectKind: 'IMAGE' });
  const stored = await adoptFile(videoId, outFile, { expectKind: 'VIDEO' });
  await command('addAsset', [assetFromStored(posterId, storedPoster, { label: `${p.title} — ${opts.kind} poster`, tags: [opts.kind, 'poster'], origin: 'DERIVED', jobId: ctx.job.id })], 'worker');
  await command('addAsset', [assetFromStored(videoId, stored, { label: `${p.title} — ${opts.kind === 'cut' ? 'assembled cut' : `export ${opts.resolution}p ${opts.format}`}`, tags: [opts.kind, opts.format, `${opts.resolution}p`], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shots: timeline.items.map((it) => ({ shotId: it.shot.id, takeAssetId: it.take.id, start: it.start, duration: it.duration, startFrame: it.startFrame, frames: it.frames, trimStartFrames: it.trimStartFrames })), fps: 24, mix, validation, loudness: result.loudness, subtitles: opts.subtitles, dialogueAudio: dialogueAudio.length, song: song?.id }, poster: `/api/media/${posterId}` })], 'worker');
  // sidecar subtitle files
  const sidecars: string[] = [];
  for (const [lang, cs] of [['ar', cuesAr], ['en', cuesEn]] as const) {
    if (!cs.length) continue;
    for (const [fmt, body] of [['srt', toSrt(cs)], ['vtt', toVtt(cs)]] as const) {
      const sid = nid('gen');
      const st = await storeBuffer(sid, Buffer.from(body, 'utf8'), { declaredType: fmt === 'vtt' ? 'text/vtt' : 'application/x-subrip', probe: false });
      await command('addAsset', [assetFromStored(sid, st, { label: `${p.title} — subtitles ${lang} (${fmt})`, tags: ['subtitles', lang, fmt, opts.kind], origin: 'DERIVED', jobId: ctx.job.id, provenance: { for: videoId, lang, format: fmt } })], 'worker');
      sidecars.push(sid);
    }
  }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
  await recordMetric(`${opts.kind}.render_ms`, Date.now() - t0, 'ms', { shots: timeline.items.length, seconds: Math.round(result.durationSeconds) }, ctx.job.id);
  return { videoId, posterId, sidecars, durationSeconds: result.durationSeconds, loudness: result.loudness, size, shots: timeline.items.length, p };
}

export const assemble: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  const r = await render(ctx, { productionId, format: 'mp4-h264', resolution: ASPECT_INFO[(await readState()).state.productions.find((x) => x.id === productionId)?.aspect ?? 'WIDE_16_9'].height > 1000 ? '1080' : '1080', subtitles: 'none', kind: 'cut' });
  await command('setCut', [productionId, r.videoId], 'worker');
  await command('markStepDone', [productionId, 'PRODUCE'], 'worker');
  return { cutAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, shots: r.shots, subtitleAssets: r.sidecars };
};

export const exportCut: Handler = async (ctx) => {
  const { productionId, format, resolution, subtitles } = ctx.job.payload as { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both' };
  const r = await render(ctx, { productionId, format, resolution, subtitles, kind: 'export' });
  const asset = (await readState()).state.assets.find((a) => a.id === r.videoId);
  await command('recordExport', [productionId, { assetId: r.videoId, format, resolution, subtitles, jobId: ctx.job.id, durationSeconds: r.durationSeconds, bytes: asset?.bytes }], 'worker');
  await command('markStepDone', [productionId, 'FINAL_CUT'], 'worker');
  return { exportAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, size: r.size, subtitleAssets: r.sidecars };
};
