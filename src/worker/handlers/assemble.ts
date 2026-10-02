import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset } from '@/domain/types';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor, storeBuffer } from '@/server/media';
import { thumbnail, tmpDir } from '@/server/media/ffmpeg';
import { assemble as assembleCut, buildMixPlan, buildTimeline, dialogueCues, exportSize, lyricCues, mergeBilingual, toSrt, toVtt, validateExport } from '@/server/media/assembly';
import { takeLagAgainstMaster } from '@/server/media/sync';
import { enqueue, recordMetric } from '@/server/jobs/queue';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { listQaReports, recordHandoff, recordQaReport } from '@/server/org/runs';
import { requireApproval } from '@/server/org/gates';

/** ASSEMBLE the chosen takes into a review cut (1080-class H.264, subtitles as sidecars); EXPORT renders the
 *  deliverable at the chosen format/resolution with the chosen subtitle treatment. Both record what they made. */

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

async function render(ctx: Parameters<Handler>[0], opts: { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both'; kind: 'cut' | 'export' }) {
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === opts.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  let timeline = buildTimeline(p, state.assets);
  // sample takes are stand-ins made by the prototype; refuse to pass them off as a production cut
  const sampleTakes = timeline.items.filter((it) => it.take.sample);
  if (sampleTakes.length) throw new StudioError('INVALID', `${sampleTakes.length} chosen take(s) are bundled sample clips, not generated footage. Generate real takes before assembling.`);
  await ctx.progress('PREPARING', { phase: 'preparing', message: `Assembling ${timeline.items.length} shots (${Math.round(timeline.total)} s)` });
  // the QA stage's handoff to Post: every chosen take carries its inspectors' reports; a chosen take that failed a
  // check is the producer's own choice and is named here, not hidden
  if (opts.kind === 'cut') {
    // the QA hand-off review (the Quality Director's step)
    const items = timeline.items;
    await step(ctx, 'quality-director', `qa-handoff-review: “${p.title}”`, async () => {
      const reports = await listQaReports({ productionId: p.id, limit: 1000 });
      const perTake = items.map((it) => { const takeId = p.shots.find((s) => s.id === it.shot.id)?.selectedTakeId; const mine = reports.filter((r) => r.subjectKind === 'TAKE' && r.subjectId === takeId); return { shotId: it.shot.id, inspected: mine.length > 0, rejected: mine.some((r) => r.decision === 'REJECT') }; });
      const uninspected = perTake.filter((t) => !t.inspected).length; const rejected = perTake.filter((t) => t.rejected).length;
      await recordHandoff({ productionId: p.id, stage: 'QA', producerDepartment: 'QA', receiverDepartment: 'POST', artifactIds: items.map((it) => it.take.id), outputVersions: { takes: items.length }, validation: { ok: uninspected === 0 && rejected === 0, checks: [{ name: 'every-chosen-take-inspected', ok: uninspected === 0, detail: uninspected ? `${uninspected} take(s) without a report (uploaded or older takes)` : `${perTake.length} takes` }, { name: 'no-chosen-take-rejected', ok: rejected === 0, detail: rejected ? `${rejected} chosen take(s) were rejected by an inspector; the producer chose them anyway` : undefined }] }, jobId: ctx.job.id });
    });
  }
  const size = exportSize(p.aspect, opts.resolution);
  const song = p.song?.assetId ? state.assets.find((a) => a.id === p.song!.assetId && !a.sample) : undefined;
  // music video: bring each take's mouths onto the master's beat. The take's own (muted) sound says where its mouths
  // are; its lag against the master's stretch is measured on loudness envelopes and that many head frames are dropped
  // (a late take) — nothing is stretched and the song is never touched. Early takes and tiny lags are left alone.
  const sync: Array<{ shotId: string; lagMs: number; corrZero: number; corrBest: number; droppedFrames: number }> = [];
  if (p.kind === 'MUSIC_VIDEO' && song) {
    await ctx.progress('PREPARING', { phase: 'aligning', message: 'Aligning the performers to the song' });
    const extraTrim: Record<string, number> = {};
    for (const it of timeline.items) {
      const hasAudio = Boolean((it.take.provenance as { probe?: { hasAudio?: boolean } } | undefined)?.probe?.hasAudio);
      if (!hasAudio || (it.shot.performance?.mode ?? 'SOLO') === 'INSTRUMENTAL') continue;
      try {
        const lag = { takeFile: assetFile(it.take), masterFile: assetFile(song), from: it.start, seconds: it.duration };
        const r = await ctx.tool('media.align_lag', () => takeLagAgainstMaster(lag.takeFile, lag.masterFile, lag.from, lag.seconds), { label: it.shot.id, input: lag });
        const frames = r.lagMs >= 60 && r.corrBest > Math.max(0.2, r.corrZero + 0.1) ? Math.min(14, Math.round((r.lagMs / 1000) * 24)) : 0;
        if (frames) extraTrim[it.shot.id] = frames;
        sync.push({ shotId: it.shot.id, lagMs: r.lagMs, corrZero: Number(r.corrZero.toFixed(2)), corrBest: Number(r.corrBest.toFixed(2)), droppedFrames: frames });
      } catch (e) { await ctx.event('warn', `alignment skipped for shot ${it.shot.id}: ${(e as Error).message}`); }
    }
    if (Object.keys(extraTrim).length) timeline = buildTimeline(p, state.assets, { extraTrim });
    await ctx.event('info', 'performers aligned to the song', { shots: sync, totalSeconds: Number(timeline.total.toFixed(3)) });
  }
  const files: Record<string, string> = {};
  for (const it of timeline.items) files[it.take.id] = assetFile(it.take);
  if (song) files[song.id] = assetFile(song);
  // THE MIX PLAN (the Audio Engineer's step): one authoritative sound per stretch, sample-placed, kept with the cut's
  // provenance; recorded dialogue lines only for shots whose take is silent (MiniMax H3 speaks natively; uploaded or
  // legacy takes may not)
  const tl = timeline;
  const { mix, dialogueAudio } = await step(ctx, 'audio-engineer', `mix-plan: ${opts.kind} of “${p.title}”`, async () => {
    const dialogueAudio: Array<{ assetId: string; start: number; durationSeconds?: number; shotId: string }> = [];
    for (const it of tl.items) {
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
    const mix = buildMixPlan(p, tl, { song, dialogueAudio });
    await ctx.event('info', 'mix plan', { tracks: mix.tracks.map((t) => ({ kind: t.kind, source: t.sourceAssetId, startSample: t.startSample, durationSamples: t.durationSamples, gain: t.gain, muted: t.muted ?? false, policy: t.policy })), targetLufs: mix.targetLufs, notes: mix.notes });
    return { mix, dialogueAudio };
  });
  // SUBTITLE CUES (the Subtitle Specialist's step)
  const dir = await tmpDir('subs');
  const srtPath = path.join(dir, 'subs.srt');
  const { cuesAr, cuesEn, cues } = await step(ctx, 'subtitle-specialist', `subtitle-cues: ${opts.kind} of “${p.title}”`, async () => {
    const cuesAr = p.kind === 'MUSIC_VIDEO' ? lyricCues(p, 'ar') : dialogueCues(p, tl, cast, 'ar');
    const cuesEn = p.kind === 'MUSIC_VIDEO' ? lyricCues(p, 'en') : dialogueCues(p, tl, cast, 'en');
    const cues = opts.subtitles === 'ar' ? cuesAr : opts.subtitles === 'en' ? cuesEn : opts.subtitles === 'both' ? mergeBilingual(cuesAr, cuesEn) : [];
    if (cues.length) await fsp.writeFile(srtPath, toSrt(cues), 'utf8');
    return { cuesAr, cuesEn, cues };
  });
  const outDir = await tmpDir(opts.kind);
  const ext = opts.format === 'mov-prores' ? 'mov' : 'mp4';
  const outFile = path.join(outDir, `${opts.kind}.${ext}`);
  const t0 = Date.now();
  const cut = { productionId: p.id, shots: timeline.items.length, width: size.width, height: size.height, fps: 24, mix, files, subtitles: { srt: cues.length ? srtPath : undefined, burn: opts.kind === 'export' ? opts.subtitles : ('none' as const) }, codec: opts.format === 'mp4-h265' ? ('h265' as const) : opts.format === 'mov-prores' ? ('prores' as const) : ('h264' as const), outFile };
  const result = await ctx.tool('media.assemble', () => assembleCut(p, timeline, { width: cut.width, height: cut.height, fps: cut.fps, mix, files, subtitles: cut.subtitles, codec: cut.codec, outFile, onProgress: (m) => ctx.progress('POSTPROCESSING', { phase: 'rendering', message: m, percent: null }) }), { label: opts.kind, input: cut });
  await ctx.checkpoint();
  // FILE VALIDATION (the Technical Media Inspector's step): the finished file is inspected, not trusted — lengths,
  // rate, size, timestamps, black stretches — and the report is recorded whether it passes or not
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the finished file' });
  const check = { file: outFile, expect: { width: size.width, height: size.height, fps: 24, durationSeconds: timeline.total, subtitlesBurned: opts.kind === 'export' && opts.subtitles !== 'none' } };
  const validation = await step(ctx, 'technical-media-inspector', `file-validation: ${opts.kind} of “${p.title}”`, async (tool) => {
    const v = await tool('media.validate_export', () => validateExport(check.file, check.expect), { input: check });
    await ctx.event(v.ok ? 'info' : 'error', `${opts.kind} validation ${v.ok ? 'passed' : 'FAILED'}`, { checks: v.checks });
    await recordQaReport({ productionId: p.id, subjectKind: opts.kind === 'cut' ? 'CUT' : 'EXPORT', subjectId: `${ctx.job.id}:${opts.kind}`, inspectorId: 'technical-media-inspector', checks: v.checks, failureClass: v.ok ? undefined : 'OUTPUT_CORRUPTION', decision: v.ok ? 'ACCEPT' : 'REJECT', jobId: ctx.job.id, notes: `${size.width}×${size.height}, ${mix.tracks.length} audio track(s), target ${mix.targetLufs} LUFS` });
    return v;
  });
  if (!validation.ok) throw Object.assign(new StudioError('PROVIDER', `The ${opts.kind} failed validation: ${validation.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.value ?? ''} ${c.detail ?? ''})`.trim()).join('; ')}`), { failureClass: 'OUTPUT_CORRUPTION' });
  const poster = path.join(outDir, 'poster.jpg');
  await thumbnail(outFile, poster, { at: Math.min(2, result.durationSeconds / 3), width: 1280 });
  const videoId = nid('gen'); const posterId = nid('gen');
  const storedPoster = await adoptFile(posterId, poster, { expectKind: 'IMAGE' });
  const stored = await adoptFile(videoId, outFile, { expectKind: 'VIDEO' });
  await command('addAsset', [assetFromStored(posterId, storedPoster, { label: `${p.title} — ${opts.kind} poster`, tags: [opts.kind, 'poster'], origin: 'DERIVED', jobId: ctx.job.id })], 'worker');
  await command('addAsset', [assetFromStored(videoId, stored, { label: `${p.title} — ${opts.kind === 'cut' ? 'assembled cut' : `export ${opts.resolution}p ${opts.format}`}`, tags: [opts.kind, opts.format, `${opts.resolution}p`], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shots: timeline.items.map((it) => ({ shotId: it.shot.id, takeAssetId: it.take.id, start: it.start, duration: it.duration, startFrame: it.startFrame, frames: it.frames, trimStartFrames: it.trimStartFrames })), fps: 24, mix, sync, validation, loudness: result.loudness, subtitles: opts.subtitles, dialogueAudio: dialogueAudio.length, song: song?.id }, poster: `/api/media/${posterId}` })], 'worker');
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
  return { videoId, posterId, sidecars, durationSeconds: result.durationSeconds, loudness: result.loudness, size, shots: timeline.items.length, p, mix, sync, validation };
}

export const assemble: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  const r = await render(ctx, { productionId, format: 'mp4-h264', resolution: ASPECT_INFO[(await readState()).state.productions.find((x) => x.id === productionId)?.aspect ?? 'WIDE_16_9'].height > 1000 ? '1080' : '1080', subtitles: 'none', kind: 'cut' });
  await command('setCut', [productionId, r.videoId], 'worker');
  await command('markStepDone', [productionId, 'PRODUCE'], 'worker');
  const doubled = r.mix.notes.some((n) => /refus|twice|double/i.test(n));
  await recordHandoff({ productionId, stage: 'EDIT', producerDepartment: 'POST', receiverDepartment: 'EXECUTIVE', artifactIds: [r.videoId, ...r.sidecars], outputVersions: { cut: r.videoId, shots: r.shots }, validation: { ok: r.validation.ok && !doubled, checks: [{ name: 'cut-validated', ok: r.validation.ok }, { name: 'one-sound-per-stretch', ok: !doubled, detail: `${r.mix.tracks.length} track(s): ${Array.from(new Set(r.mix.tracks.map((t) => t.kind))).join(', ')}` }, { name: 'loudness-at-target', ok: r.loudness ? Math.abs(r.loudness.integrated - r.mix.targetLufs) <= 1.5 : true, detail: r.loudness ? `${r.loudness.integrated.toFixed(1)} LUFS for ${r.mix.targetLufs}` : 'not measured' }, ...(r.sync.length ? [{ name: 'performers-aligned', ok: true, detail: `${r.sync.filter((s) => s.droppedFrames).length} of ${r.sync.length} take(s) shifted` }] : [])] }, jobId: ctx.job.id });
  await ctx.activity('CUT_ASSEMBLED', `“${r.p.title}” assembled: ${r.shots} shots, ${Math.round(r.durationSeconds)} s, ${r.loudness ? `${r.loudness.integrated.toFixed(1)} LUFS` : 'loudness not measured'}`, { cutAssetId: r.videoId, shots: r.shots, seconds: r.durationSeconds });
  // an episode that has a cut is a fact of its show: the Continuity Writer records it in the bible
  if (r.p.kind === 'EPISODE' && r.p.showId) await enqueue({ type: 'EPISODE_CONTINUITY', payload: { productionId }, parentId: ctx.job.id, idempotencyKey: `continuity:${productionId}:${r.videoId}` });
  return { cutAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, shots: r.shots, subtitleAssets: r.sidecars };
};

export const exportCut: Handler = async (ctx) => {
  const { productionId, format, resolution, subtitles } = ctx.job.payload as { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both' };
  // the second human gate (the Quality Director's step): only an approved cut is exported
  await step(ctx, 'quality-director', `cut-gate: production ${productionId}`, () => requireApproval(productionId, 'EDIT'));
  const r = await render(ctx, { productionId, format, resolution, subtitles, kind: 'export' });
  const asset = (await readState()).state.assets.find((a) => a.id === r.videoId);
  await command('recordExport', [productionId, { assetId: r.videoId, format, resolution, subtitles, jobId: ctx.job.id, durationSeconds: r.durationSeconds, bytes: asset?.bytes }], 'worker');
  await command('markStepDone', [productionId, 'FINAL_CUT'], 'worker');
  await recordHandoff({ productionId, stage: 'EXPORT', producerDepartment: 'POST', artifactIds: [r.videoId, ...r.sidecars], outputVersions: { export: r.videoId, format, resolution }, validation: { ok: r.validation.ok, checks: r.validation.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail })) }, jobId: ctx.job.id });
  await ctx.activity('EXPORTED', `“${r.p.title}” exported: ${resolution}p ${format}, ${Math.round(r.durationSeconds)} s${subtitles !== 'none' ? `, subtitles ${subtitles}` : ''}`, { exportAssetId: r.videoId, format, resolution, bytes: asset?.bytes });
  return { exportAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, size: r.size, subtitleAssets: r.sidecars };
};
