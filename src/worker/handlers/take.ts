import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, TakeReference } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor, libraryRoot } from '@/server/media';
import { qaTake, thumbnail, tmpDir, trimAudio, webReady } from '@/server/media/ffmpeg';
import { shotWindows } from '@/domain/timeline';
import { generateVideo, chooseBackend } from '@/server/providers/video';
import { takePrompt } from '@/server/story/prompts';
import { recordMetric } from '@/server/jobs/queue';
import { env } from '@/server/env';

/** GENERATE A TAKE — the heart of production. Gather the shot's references (opening frame, character portraits,
 *  location plate, voice samples), write the prompt, ask MiniMax (hosted or local) for the clip, download it, prove
 *  it decodes, run the quality checks, make a poster frame, and record a new take with full provenance. A new take
 *  never replaces an existing one. If the worker restarts mid-way, the hosted task id is reused, not resubmitted. */

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export const generateTake: Handler = async (ctx) => {
  const payload = ctx.job.payload as { productionId: string; shotId: string; model?: string; resolution?: string; durationSeconds?: number; prompt?: string; seed?: number };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === payload.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const sh = p.shots.find((x) => x.id === payload.shotId);
  if (!sh) throw new StudioError('NOT_FOUND', 'Shot not found');
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const loc = world.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const backend = chooseBackend();

  await ctx.progress('PREPARING', { phase: 'preparing', message: 'Gathering references and writing the prompt' });
  const prompt = payload.prompt?.trim() || takePrompt(p, sh, cast, loc, scene);
  const seconds = Math.min(15, Math.max(4, Math.round(payload.durationSeconds ?? sh.durationSeconds)));
  // the seed is chosen here, not inside the engine, so the take records the number that made it
  const seed = payload.seed ?? Math.floor(Math.random() * 2 ** 31);
  const info = ASPECT_INFO[p.aspect];
  const references: TakeReference[] = [];
  const opening = byId(sh.openingFrameAssetId);
  const ending = byId(sh.endingFrameAssetId);
  // Music video with a song file: the shot's stretch of the song goes in as reference audio, so the performer's
  // mouth follows the real track. MiniMax takes audio only in reference mode, so the opening frame (when there is
  // one) becomes the first reference picture instead of a first frame.
  const songAsset = p.kind === 'MUSIC_VIDEO' && p.song?.assetId ? byId(p.song.assetId) : undefined;
  const window = songAsset ? shotWindows(p).get(sh.id) : undefined;
  const songSegment = songAsset && songAsset.kind === 'AUDIO' && window && window.to > window.from && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL'
    ? await trimAudio(assetFile(songAsset), path.join(await tmpDir('song'), `${sh.id}.wav`), window.from, Math.min(window.to, window.from + seconds))
    : undefined;
  const useFrames = !songSegment;
  const firstFrame = useFrames && opening && opening.kind === 'IMAGE' && opening.mimeType !== 'image/svg+xml' ? { file: assetFile(opening), mime: opening.mimeType ?? 'image/png' } : undefined;
  const lastFrame = useFrames && ending && ending.kind === 'IMAGE' && ending.mimeType !== 'image/svg+xml' ? { file: assetFile(ending), mime: ending.mimeType ?? 'image/png' } : undefined;
  if (firstFrame) references.push({ kind: 'FIRST_FRAME', assetId: opening!.id });
  if (lastFrame) references.push({ kind: 'LAST_FRAME', assetId: ending!.id });
  // without an opening frame, condition on identity references instead: character portraits and the location plate
  const referenceImages: Array<{ file: string; mime: string }> = [];
  if (songSegment && opening && opening.kind === 'IMAGE' && opening.mimeType !== 'image/svg+xml') { referenceImages.push({ file: assetFile(opening), mime: opening.mimeType ?? 'image/png' }); references.push({ kind: 'FIRST_FRAME', assetId: opening.id }); }
  if (!firstFrame) {
    for (const cid of sh.characterIds.slice(0, 4)) {
      const c = cast.find((x) => x.id === cid); const a = byId(c?.portraitAssetId);
      if (a && a.kind === 'IMAGE' && a.mimeType !== 'image/svg+xml') { referenceImages.push({ file: assetFile(a), mime: a.mimeType ?? 'image/png' }); references.push({ kind: 'CHARACTER', assetId: a.id, characterId: cid }); }
    }
    const plate = byId(loc?.masterAssetId);
    if (plate && plate.kind === 'IMAGE' && plate.mimeType !== 'image/svg+xml') { referenceImages.push({ file: assetFile(plate), mime: plate.mimeType ?? 'image/png' }); references.push({ kind: 'LOCATION', assetId: plate.id, locationId: loc?.id }); }
  }
  // voice identity for speaking characters: the chosen voice sample as audio reference (timbre)
  const referenceAudio: Array<{ file: string }> = [];
  if (songSegment) { referenceAudio.push({ file: songSegment }); references.push({ kind: 'AUDIO', assetId: songAsset!.id }); }
  for (const cid of Array.from(new Set(sh.dialogue.map((d) => d.characterId))).slice(0, songSegment ? 2 : 3)) {
    const c = cast.find((x) => x.id === cid);
    const sample = c?.voice.samples.find((v) => v.id === c.voice.selectedSampleId);
    const a = byId(sample?.assetId);
    if (a && a.kind === 'AUDIO' && !a.sample && referenceImages.length > 0) { referenceAudio.push({ file: assetFile(a) }); references.push({ kind: 'AUDIO', assetId: a.id, characterId: cid }); }
  }
  await ctx.event('info', 'take request prepared', { backend, seconds, prompt: prompt.slice(0, 500), references });

  const t0 = Date.now();
  let lastStatus = '';
  const result = await generateVideo({
    prompt, seconds, width: info.width, height: info.height, aspect: p.aspect, firstFrame, lastFrame, referenceImages: referenceImages.length ? referenceImages : undefined, referenceAudio: referenceAudio.length ? referenceAudio : undefined,
    seed, model: payload.model, resolution: payload.resolution,
    resumeTaskId: ctx.job.providerTaskId ?? undefined,
    onTaskCreated: async (id) => { await ctx.progress('GENERATING', { phase: 'generating', message: `MiniMax task ${id} created`, providerStatus: 'queued', percent: null }, { providerTaskId: id }); },
    onStatus: async (s) => { if (s.status !== lastStatus) { lastStatus = s.status; await ctx.progress(s.status === 'downloading' ? 'DOWNLOADING' : 'GENERATING', { phase: s.status, message: s.queue ? `waiting behind ${s.queue} in the GPU queue` : backend === 'api' ? `MiniMax: ${s.status}` : `local MiniMax H3: ${s.status}`, providerStatus: s.status, percent: null }); } else await ctx.checkpoint(); },
    shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } },
  });
  const genMs = Date.now() - t0;
  await recordMetric('take.generation_ms', genMs, 'ms', { backend, seconds }, ctx.job.id);

  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the clip' });
  // MiniMax H3 always renders a soundtrack; a shot with no lines may legitimately be near-silent
  const { report, probe } = await qaTake(result.file, { durationSeconds: seconds, width: Math.round(info.width * 0.5), height: Math.round(info.height * 0.5), expectAudio: true, speechExpected: sh.dialogue.length > 0 || (p.kind === 'MUSIC_VIDEO' && Boolean(songSegment)) });
  await ctx.checkpoint();
  await ctx.progress('POSTPROCESSING', { phase: 'postprocessing', message: 'Making it playable and drawing the poster frame' });
  const dir = await tmpDir('take');
  const playable = path.join(dir, 'take.mp4');
  await webReady(result.file, playable, probe);
  const poster = path.join(dir, 'poster.jpg');
  await thumbnail(playable, poster, { at: Math.min(0.5, (probe.durationSeconds ?? 1) / 4) });

  // files into the library, then records in one go
  const videoId = nid('gen'); const posterId = nid('gen');
  const storedPoster = await adoptFile(posterId, poster, { expectKind: 'IMAGE' });
  const stored = await adoptFile(videoId, playable, { expectKind: 'VIDEO' });
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(path.dirname(result.file), { recursive: true, force: true }).catch(() => {});
  const takeNumber = sh.takes.length + 1;
  const label = `Take ${takeNumber}`;
  const provenance = { provider: 'MINIMAX', backend: result.backend, model: result.model, requestId: result.requestId, prompt, references, seed, params: result.params, workflowVersion: result.workflowVersion, codeVersion: env().CODE_VERSION, jobId: ctx.job.id, productionId: p.id, shotId: sh.id };
  await command('addAsset', [assetFromStored(posterId, storedPoster, { label: `${p.title} ${sh.number} — ${label} poster`, tags: ['take', 'poster'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: videoId } })], 'worker');
  await command('addAsset', [assetFromStored(videoId, stored, { label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${label}`, tags: ['take', 'minimax'], origin: 'GENERATED', jobId: ctx.job.id, provenance, poster: `/api/media/${posterId}` })], 'worker');
  const r = await command('addTake', [p.id, sh.id, { assetId: videoId, label, status: report.ok ? 'READY' : 'REJECTED', rejectionReason: report.ok ? undefined : `Automatic checks failed: ${report.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`, provider: 'MINIMAX', model: result.model, requestId: result.requestId, prompt, params: result.params, seed, references, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, generationMs: genMs, costUsd: result.costUsd, qa: report, jobId: ctx.job.id, codeVersion: env().CODE_VERSION, workflowVersion: result.workflowVersion, thumbnailAssetId: posterId }], 'worker');
  // the first accepted take of a shot is selected automatically so the cut can be assembled — also when the current
  // choice is only a bundled sample clip; a producer's own choice of a real take is never overridden
  const current = sh.takes.find((t) => t.id === sh.selectedTakeId);
  if (report.ok && (!current || current.provider === 'SAMPLE')) await command('selectTake', [p.id, sh.id, r.take.id], 'worker');
  await recordMetric('take.qa_ok', report.ok ? 1 : 0, 'bool', { backend }, ctx.job.id);
  return { takeId: r.take.id, assetId: videoId, qaOk: report.ok, backend: result.backend, model: result.model, requestId: result.requestId, generationMs: genMs, costUsd: result.costUsd, awaitingReview: false, libraryRoot: libraryRoot() };
};
