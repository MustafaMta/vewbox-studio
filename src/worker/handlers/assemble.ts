import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import type { Asset, StudioState } from '@/domain/types';
import { timelineDigest } from '@/domain/timeline';
import { cutInputsHash } from '@/domain/cut';
import { commands, readState, type CommandSpec } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { assetFile, assetFromStored } from '@/server/media';
import { jobOutputs, outputId } from '@/server/jobs/outputs';
import { thumbnail, tmpDir } from '@/server/media/ffmpeg';
import { measureSongCopies } from '@/server/media/song-copies';
import { assemble as assembleCut, buildMixPlan, buildTimeline, dialogueCues, exportSize, lyricCues, mergeBilingual, toSrt, toVtt, validateExport, type JoinMetric } from '@/server/media/assembly';
import { takeLagAgainstMaster } from '@/server/media/sync';
import { enqueue, recordMetric } from '@/server/jobs/queue';
import { listQaReports, recordHandoff, recordQaReport } from '@/server/org/runs';
import { requireApproval } from '@/server/org/gates';
import { establishFromApprovedCut, saveAudioTimeline, worldOfProduction } from '@/server/world';

/** ASSEMBLE the chosen takes into a review cut (1080-class H.264, subtitles as sidecars); EXPORT renders the
 *  deliverable at the chosen format/resolution with the chosen subtitle treatment. Both record what they made.
 *  The cut follows THE PRODUCTION AUDIO TIMELINE (src/domain/timeline.ts): the song is the clock of a music video,
 *  each shot's own sound the clock of a film; the picture conforms to it; the mix plays every source once, under the
 *  pinned World Bible's audio policy; every join is measured and a continuation join that jumps fails its take. */

async function render(ctx: Parameters<Handler>[0], opts: { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both'; kind: 'cut' | 'export' }) {
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === opts.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  // the World Bible the production is pinned to decides the audio policy and the places' ambience beds
  const world = await worldOfProduction(state, p, { jobId: ctx.job.id });
  const bible = world.revision.bible;
  const ambience = Object.fromEntries(bible.locations.filter((l) => l.ambience?.assetId).map((l) => [l.locationId, l.ambience!.assetId!]));
  // a stale continuation join (src/domain/continuation.ts) is refused unless the producer's override is on the job
  const allowStaleJoins = Boolean((ctx.job.payload as { allowStaleJoins?: boolean }).allowStaleJoins);
  const timelineOpts = { policy: bible.audio, ambience, allowStaleJoins };
  let timeline = buildTimeline(p, state.assets, timelineOpts);
  // sample takes are stand-ins made by the prototype; refuse to pass them off as a production cut
  const sampleTakes = timeline.items.filter((it) => it.take.sample);
  if (sampleTakes.length) throw new StudioError('INVALID', `${sampleTakes.length} chosen take(s) are bundled sample clips, not generated footage. Generate real takes before assembling.`);
  await ctx.progress('PREPARING', { phase: 'preparing', message: `Assembling ${timeline.items.length} shots (${Math.round(timeline.total)} s, ${timeline.audio.clock === 'SONG' ? 'on the song' : 'on the dialogue clock'})` });
  // the QA stage's handoff to Post: every chosen take carries its inspectors' reports; a chosen take that failed a
  // check is the producer's own choice and is named here, not hidden
  if (opts.kind === 'cut') {
    // the QA hand-off review (the Quality Director's step)
    const items = timeline.items;
    await step(ctx, 'quality-director', `qa-handoff-review: “${p.title}”`, async () => {
      const reports = await listQaReports({ productionId: p.id, limit: 1000 });
      const perTake = items.map((it) => { const takeId = p.shots.find((s) => s.id === it.shot.id)?.selectedTakeId; const mine = reports.filter((r) => r.subjectKind === 'TAKE' && r.subjectId === takeId); return { shotId: it.shot.id, inspected: mine.length > 0, rejected: mine.some((r) => r.decision === 'REJECT') }; });
      const uninspected = perTake.filter((t) => !t.inspected).length; const rejected = perTake.filter((t) => t.rejected).length;
      await recordHandoff({ id: outputId(ctx.job.id, 'handoff:qa', 'handoff'), productionId: p.id, stage: 'QA', producerDepartment: 'QA', receiverDepartment: 'POST', artifactIds: items.map((it) => it.take.id), outputVersions: { takes: items.length }, validation: { ok: uninspected === 0 && rejected === 0, checks: [{ name: 'every-chosen-take-inspected', ok: uninspected === 0, detail: uninspected ? `${uninspected} take(s) without a report (uploaded or older takes)` : `${perTake.length} takes` }, { name: 'no-chosen-take-rejected', ok: rejected === 0, detail: rejected ? `${rejected} chosen take(s) were rejected by an inspector; the producer chose them anyway` : undefined }] }, jobId: ctx.job.id });
    });
  }
  const size = exportSize(p.aspect, opts.resolution);
  const song = p.song?.assetId ? state.assets.find((a) => a.id === p.song!.assetId && !a.sample) : undefined;
  // music video: bring each take's mouths onto the master's beat. The take's own (muted) sound says where its mouths
  // are; its lag against the master's stretch is measured on loudness envelopes and that many head frames are dropped
  // (a late take) — nothing is stretched and the song is never touched. The shot keeps its song window: the frames
  // move inside it, the clock does not. Early takes and tiny lags are left alone.
  const sync: Array<{ shotId: string; lagMs: number; corrZero: number; corrBest: number; droppedFrames: number }> = [];
  if (p.kind === 'MUSIC_VIDEO' && song) {
    await ctx.progress('PREPARING', { phase: 'aligning', message: 'Aligning the performers to the song' });
    const extraTrim: Record<string, number> = {};
    for (const it of timeline.items) {
      const hasAudio = Boolean((it.take.provenance as { probe?: { hasAudio?: boolean } } | undefined)?.probe?.hasAudio);
      if (!hasAudio || (it.shot.performance?.mode ?? 'SOLO') === 'INSTRUMENTAL') continue;
      try {
        // a continuation's head repeats the previous shot and is dropped from the cut: measured from where the cut starts
        const songAt = (it.startFrame + timeline.audio.songOffsetFrames) / 24;
        const lag = { takeFile: assetFile(it.take), masterFile: assetFile(song), from: songAt, seconds: it.duration, takeFrom: it.trimStartFrames / 24 };
        const r = await ctx.tool('media.align_lag', () => takeLagAgainstMaster(lag.takeFile, lag.masterFile, lag.from, lag.seconds, lag.takeFrom), { label: it.shot.id, input: lag });
        const frames = r.lagMs >= 60 && r.corrBest > Math.max(0.2, r.corrZero + 0.1) ? Math.min(14, Math.round((r.lagMs / 1000) * 24)) : 0;
        if (frames) extraTrim[it.shot.id] = frames;
        sync.push({ shotId: it.shot.id, lagMs: r.lagMs, corrZero: Number(r.corrZero.toFixed(2)), corrBest: Number(r.corrBest.toFixed(2)), droppedFrames: frames });
      } catch (e) { await ctx.event('warn', `alignment skipped for shot ${it.shot.id}: ${(e as Error).message}`); }
    }
    if (Object.keys(extraTrim).length) timeline = buildTimeline(p, state.assets, { ...timelineOpts, extraTrim });
    await ctx.event('info', 'performers aligned to the song', { shots: sync, totalSeconds: Number(timeline.total.toFixed(3)) });
  }
  const tl = timeline;
  // THE MIX PLAN (the Audio Engineer's step): the production audio timeline as typed tracks — one authoritative sound
  // per stretch, sample-placed, edge-faded, beds ducked under voices, recorded lines where the policy puts them —
  // refused when a source, a song or a voice would play twice
  const { mix, files } = await step(ctx, 'audio-engineer', `mix-plan: ${opts.kind} of “${p.title}”`, async () => {
    const mix = buildMixPlan(p, tl);
    const files: Record<string, string> = {};
    for (const t of mix.tracks) { const a = state.assets.find((x) => x.id === t.sourceAssetId); if (a) files[a.id] = assetFile(a); }
    await ctx.event('info', 'mix plan', { clock: tl.audio.clock, policy: tl.audio.policy, world: { revision: world.revision.number, pinned: world.pinned }, tracks: mix.tracks.map((t) => ({ kind: t.kind, source: t.sourceAssetId, startSample: t.startSample, durationSamples: t.durationSamples, gain: t.gain, muted: t.muted ?? false, ducked: t.automation?.spans.length ?? 0, policy: t.policy })), targetLufs: mix.targetLufs, notes: mix.notes });
    return { mix, files };
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
    await recordQaReport({ id: outputId(ctx.job.id, `qa:${opts.kind}-validation`, 'qa'), productionId: p.id, subjectKind: opts.kind === 'cut' ? 'CUT' : 'EXPORT', subjectId: `${ctx.job.id}:${opts.kind}`, inspectorId: 'technical-media-inspector', checks: v.checks, failureClass: v.ok ? undefined : 'OUTPUT_CORRUPTION', decision: v.ok ? 'ACCEPT' : 'REJECT', jobId: ctx.job.id, notes: `${size.width}×${size.height}, ${mix.tracks.length} audio track(s), target ${mix.targetLufs} LUFS` });
    return v;
  });
  if (!validation.ok) throw Object.assign(new StudioError('PROVIDER', `The ${opts.kind} failed validation: ${validation.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.value ?? ''} ${c.detail ?? ''})`.trim()).join('; ')}`), { failureClass: 'OUTPUT_CORRUPTION' });
  // JOIN QA: a continuation join that jumps (picture or sound beyond the shots' own frame-to-frame change) fails the
  // take that continues — an inspector's REJECT report on it, named in the next hand-off — never the cut
  const joins = result.joins;
  for (const j of joins.filter((x) => x.judged)) {
    const it = timeline.items.find((x) => x.shot.id === j.toShotId);
    if (!it) continue;
    await recordQaReport({ id: outputId(ctx.job.id, `qa:${opts.kind}-join:${j.toShotId}`, 'qa'), productionId: p.id, subjectKind: 'TAKE', subjectId: it.takeRecord.id, inspectorId: 'visual-quality-inspector', checks: joinChecks(j), failureClass: j.ok ? undefined : 'ENVIRONMENT_INCONSISTENCY', decision: j.ok ? 'ACCEPT' : 'REJECT', jobId: ctx.job.id, notes: `continuation join into shot ${it.sceneNumber}.${it.shot.number} at ${j.atSeconds.toFixed(2)} s of the ${opts.kind}` });
  }
  // ONE COPY OF THE MUSIC (src/server/media/song-copies.ts; directive §8): a music video's rendered sound against its
  // master — a second copy of the song at another lag is a REVIEW report on the cut, never a silent pass or a re-mix
  if (p.kind === 'MUSIC_VIDEO' && song) {
    try {
      const copies = await step(ctx, 'technical-media-inspector', `song-copies: ${opts.kind} of “${p.title}”`, () => measureSongCopies(outFile, assetFile(song)));
      await recordQaReport({ id: outputId(ctx.job.id, `qa:${opts.kind}-song-copies`, 'qa'), productionId: p.id, subjectKind: opts.kind === 'cut' ? 'CUT' : 'EXPORT', subjectId: `${ctx.job.id}:${opts.kind}`, inspectorId: 'technical-media-inspector', checks: [{ name: 'one-copy-of-the-music', ok: copies.ok, value: copies.copies.length, detail: copies.detail }], failureClass: copies.ok ? undefined : 'AUDIO_DUPLICATION', decision: copies.ok ? 'ACCEPT' : 'REVIEW', jobId: ctx.job.id });
      await ctx.event(copies.ok ? 'info' : 'warn', `${opts.kind}: ${copies.detail}`, { copies });
    } catch (e) {
      await ctx.event('warn', `${opts.kind}: the copies of the song could not be measured (${(e as Error).message.split('\n')[0]})`);
    }
  }
  const jumps = joins.filter((j) => j.judged && !j.ok);
  if (joins.length) await ctx.event(jumps.length ? 'warn' : 'info', `joins measured: ${joins.filter((j) => j.judged).length} continuation join(s), ${jumps.length} jump(s)`, { joins });
  const poster = path.join(outDir, 'poster.jpg');
  await thumbnail(outFile, poster, { at: Math.min(2, result.durationSeconds / 3), width: 1280 });
  // files into the library under the job's output ids (named for this attempt); the records are committed by the
  // caller in ONE batch with what the result changes (the cut, the export record) — audit C2, step 6
  const out = jobOutputs(ctx.job);
  const { id: posterId, stored: storedPoster } = await out.adopt(`${opts.kind}-poster`, poster, { expectKind: 'IMAGE' });
  const { id: videoId, stored } = await out.adopt(opts.kind, outFile, { expectKind: 'VIDEO' });
  const digest = timelineDigest(timeline.audio);
  const assets: Array<Omit<Asset, 'createdAt'>> = [
    assetFromStored(posterId, storedPoster, { label: `${p.title} — ${opts.kind} poster`, tags: [opts.kind, 'poster'], origin: 'DERIVED', jobId: ctx.job.id }),
    assetFromStored(videoId, stored, { label: `${p.title} — ${opts.kind === 'cut' ? 'assembled cut' : `export ${opts.resolution}p ${opts.format}`}`, tags: [opts.kind, opts.format, `${opts.resolution}p`], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shots: timeline.items.map((it) => ({ shotId: it.shot.id, takeAssetId: it.take.id, start: it.start, duration: it.duration, startFrame: it.startFrame, frames: it.frames, trimStartFrames: it.trimStartFrames, holdFrames: it.holdFrames, basis: it.basis, relation: it.relation, join: it.join })), fps: 24, mix, timeline: digest, joins, world: { revisionId: world.revision.id, revision: world.revision.number, pinned: world.pinned }, sync, validation, loudness: result.loudness, subtitles: opts.subtitles, dialogueAudio: mix.tracks.filter((t) => t.kind === 'DIALOGUE').length, song: song?.id, durationSeconds: result.durationSeconds, size, shotCount: timeline.items.length }, poster: `/api/media/${posterId}` }),
  ];
  // sidecar subtitle files
  const sidecars: string[] = [];
  for (const [lang, cs] of [['ar', cuesAr], ['en', cuesEn]] as const) {
    if (!cs.length) continue;
    for (const [fmt, body] of [['srt', toSrt(cs)], ['vtt', toVtt(cs)]] as const) {
      const st = await out.store(`${opts.kind}-subtitles-${lang}-${fmt}`, Buffer.from(body, 'utf8'), { declaredType: fmt === 'vtt' ? 'text/vtt' : 'application/x-subrip', probe: false });
      assets.push(assetFromStored(st.id, st.stored, { label: `${p.title} — subtitles ${lang} (${fmt})`, tags: ['subtitles', lang, fmt, opts.kind], origin: 'DERIVED', jobId: ctx.job.id, provenance: { for: videoId, lang, format: fmt } }));
      sidecars.push(st.id);
    }
  }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
  await recordMetric(`${opts.kind}.render_ms`, Date.now() - t0, 'ms', { shots: timeline.items.length, seconds: Math.round(result.durationSeconds) }, ctx.job.id);
  // what this cut was made from: setCut compares it with the production when the cut is recorded (step 12)
  return { inputs: cutInputsHash(p), videoId, posterId, sidecars, assets, digest, durationSeconds: result.durationSeconds, loudness: result.loudness, size, shots: timeline.items.length, p, mix, sync, validation, joins };
}

/** Commit a rendered cut or export as ONE batch: its assets, then `then` (setCut / recordExport, markStepDone).
 *  The audio timeline it was rendered from is stored after it (idempotent: an identical timeline is not written
 *  twice). */
async function commitRender(ctx: Parameters<Handler>[0], r: Awaited<ReturnType<typeof render>>, then: CommandSpec[]): Promise<number> {
  await commands([...r.assets.map((a) => ({ name: 'addAsset' as const, args: [a] as [typeof a] })), ...then], 'worker', { seed: `${ctx.job.id}:render-commit` });
  return (await saveAudioTimeline(r.p.id, r.digest as unknown as Record<string, unknown>, { cutAssetId: r.videoId, jobId: ctx.job.id })).revision;
}

/** The cut or export an earlier attempt of this job already committed (it crashed after its commit): its video asset
 *  exists under the job's output id. */
function committedRender(state: StudioState, job: { id: string }, kind: 'cut' | 'export'): Asset | undefined {
  const id = outputId(job.id, kind);
  return state.assets.find((a) => a.id === id);
}

/** A measured join as QA checks. */
export function joinChecks(j: JoinMetric): Array<{ name: string; ok: boolean; value?: number; threshold?: number; detail?: string }> {
  return [
    { name: 'join-picture', ok: j.picture.ok, value: j.picture.diff, threshold: j.picture.threshold, detail: `mean luma step at the join; the shots' own 95th-percentile frame-to-frame change is ${j.picture.intraP95}` },
    ...(j.audio ? [
      { name: 'join-audio-level', ok: j.audio.rmsOk, value: j.audio.rmsStepDb, threshold: Math.max(j.audio.rmsP95, 1), detail: 'RMS step across the join (dB, 20 ms windows)' },
      { name: 'join-audio-spectrum', ok: j.audio.fluxOk, value: j.audio.flux, threshold: Math.max(j.audio.fluxP95, 0.1), detail: 'spectral flux across the join' },
    ] : []),
  ];
}

export const assemble: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  // an earlier attempt committed this cut (and set it) before it crashed: it is returned, not rendered again
  const done = committedRender((await readState()).state, ctx.job, 'cut');
  if (done) {
    await ctx.event('info', 'the cut was already recorded by an earlier attempt of this job; nothing is rendered again', { cutAssetId: done.id });
    return { cutAssetId: done.id, durationSeconds: done.durationSeconds, resumedFromCommit: true };
  }
  const r = await render(ctx, { productionId, format: 'mp4-h264', resolution: '1080', subtitles: 'none', kind: 'cut' });
  const audioTimelineRevision = await commitRender(ctx, r, [{ name: 'setCut', args: [productionId, r.videoId, { inputs: r.inputs }] }, { name: 'markStepDone', args: [productionId, 'PRODUCE'] }]);
  const judged = r.joins.filter((j) => j.judged);
  const jumps = judged.filter((j) => !j.ok);
  await recordHandoff({ id: outputId(ctx.job.id, 'handoff:edit', 'handoff'), productionId, stage: 'EDIT', producerDepartment: 'POST', receiverDepartment: 'EXECUTIVE', artifactIds: [r.videoId, ...r.sidecars], outputVersions: { cut: r.videoId, shots: r.shots, audioTimeline: audioTimelineRevision }, validation: { ok: r.validation.ok && jumps.length === 0, checks: [{ name: 'cut-validated', ok: r.validation.ok }, { name: 'one-sound-per-stretch', ok: true, detail: `${r.mix.tracks.length} track(s): ${Array.from(new Set(r.mix.tracks.map((t) => t.kind))).join(', ')}; audited (no source, song or voice twice)` }, { name: 'loudness-at-target', ok: r.loudness ? Math.abs(r.loudness.integrated - r.mix.targetLufs) <= 1.5 : true, detail: r.loudness ? `${r.loudness.integrated.toFixed(1)} LUFS for ${r.mix.targetLufs}` : 'not measured' }, { name: 'continuation-joins', ok: jumps.length === 0, detail: judged.length ? `${judged.length - jumps.length} of ${judged.length} continuation join(s) within the shots' own change${jumps.length ? `; jumps into ${jumps.map((j) => j.toShotId).join(', ')}` : ''}` : 'no continuation join' }, ...(r.sync.length ? [{ name: 'performers-aligned', ok: true, detail: `${r.sync.filter((s) => s.droppedFrames).length} of ${r.sync.length} take(s) shifted` }] : [])] }, jobId: ctx.job.id });
  await ctx.activity('CUT_ASSEMBLED', `“${r.p.title}” assembled: ${r.shots} shots, ${Math.round(r.durationSeconds)} s, ${r.loudness ? `${r.loudness.integrated.toFixed(1)} LUFS` : 'loudness not measured'}${jumps.length ? `, ${jumps.length} continuation join(s) jump` : ''}`, { cutAssetId: r.videoId, shots: r.shots, seconds: r.durationSeconds, joinJumps: jumps.length });
  // an episode that has a cut is a fact of its show: the Continuity Writer records it in the bible
  if (r.p.kind === 'EPISODE' && r.p.showId) await enqueue({ type: 'EPISODE_CONTINUITY', payload: { productionId }, parentId: ctx.job.id, idempotencyKey: `continuity:${productionId}:${r.videoId}` });
  return { cutAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, shots: r.shots, subtitleAssets: r.sidecars, joins: judged.length, joinJumps: jumps.length, audioTimelineRevision };
};

export const exportCut: Handler = async (ctx) => {
  const { productionId, format, resolution, subtitles } = ctx.job.payload as { productionId: string; format: 'mp4-h264' | 'mp4-h265' | 'mov-prores'; resolution: '720' | '1080' | '2160'; subtitles: 'none' | 'ar' | 'en' | 'both' };
  // the second human gate (the Quality Director's step): only an approved cut is exported
  await step(ctx, 'quality-director', `cut-gate: production ${productionId}`, () => requireApproval(productionId, 'EDIT'));
  // ESTABLISHED PLACES (the World Continuity step): the approved cut's places become established frames of the World
  // Bible, reused by id when the story returns there (and the places are locked)
  const established = await step(ctx, 'world-continuity', `establish-locations: production ${productionId}`, async () => {
    const { state } = await readState();
    const p = state.productions.find((x) => x.id === productionId);
    if (!p) return { added: 0, reason: 'production not found' };
    const r = await establishFromApprovedCut(state, p, { jobId: ctx.job.id });
    await ctx.event('info', `World Bible: ${r.reason}${r.revision ? ` (revision ${r.revision.number})` : ''}`, { added: r.added, revision: r.revision?.number });
    return { added: r.added, reason: r.reason };
  });
  // an earlier attempt committed this export (asset and record) before it crashed: it is returned, not rendered again
  const done = committedRender((await readState()).state, ctx.job, 'export');
  if (done) {
    await ctx.event('info', 'the export was already recorded by an earlier attempt of this job; nothing is rendered again', { exportAssetId: done.id });
    return { exportAssetId: done.id, durationSeconds: done.durationSeconds, establishedFrames: established.added, resumedFromCommit: true };
  }
  const r = await render(ctx, { productionId, format, resolution, subtitles, kind: 'export' });
  const asset = r.assets.find((a) => a.id === r.videoId);
  await commitRender(ctx, r, [{ name: 'recordExport', args: [productionId, { id: outputId(ctx.job.id, 'export-record', 'export'), assetId: r.videoId, format, resolution, subtitles, jobId: ctx.job.id, durationSeconds: r.durationSeconds, bytes: asset?.bytes }] }, { name: 'markStepDone', args: [productionId, 'FINAL_CUT'] }]);
  await recordHandoff({ id: outputId(ctx.job.id, 'handoff:export', 'handoff'), productionId, stage: 'EXPORT', producerDepartment: 'POST', artifactIds: [r.videoId, ...r.sidecars], outputVersions: { export: r.videoId, format, resolution, establishedFrames: established.added }, validation: { ok: r.validation.ok, checks: r.validation.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail })) }, jobId: ctx.job.id });
  await ctx.activity('EXPORTED', `“${r.p.title}” exported: ${resolution}p ${format}, ${Math.round(r.durationSeconds)} s${subtitles !== 'none' ? `, subtitles ${subtitles}` : ''}`, { exportAssetId: r.videoId, format, resolution, bytes: asset?.bytes });
  return { exportAssetId: r.videoId, durationSeconds: r.durationSeconds, loudness: r.loudness, size: r.size, subtitleAssets: r.sidecars, establishedFrames: established.added };
};
