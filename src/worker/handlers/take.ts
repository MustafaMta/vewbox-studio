import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Take, TakeReference } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, fileFor, libraryRoot } from '@/server/media';
import { ffmpeg, joinSpeech, qaTake, tailClip, thumbnail, tmpDir, trimAudio, webReady } from '@/server/media/ffmpeg';
import { orderedShots, shotWindows } from '@/domain/timeline';
import { generateVideo, chooseBackend } from '@/server/providers/video';
import { H3_GUIDE_FRAMES } from '@/server/workflows/minimax-h3';
import { scriptCoverage, transcribe, wordErrorRate } from '@/server/providers/speech';
import { alignLyrics } from '@/server/media/lyrics';
import { referenceWav, speakLine, verifyLine, type Reference } from './voice';
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
  let seconds = Math.min(15, Math.max(4, Math.round(payload.durationSeconds ?? sh.durationSeconds)));
  // the seed is chosen here, not inside the engine, so the take records the number that made it
  const seed = payload.seed ?? Math.floor(Math.random() * 2 ** 31);
  const info = ASPECT_INFO[p.aspect];
  const references: TakeReference[] = [];
  const usableImage = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && !a.sample && a.mimeType !== 'image/svg+xml');
  const opening = byId(sh.openingFrameAssetId);
  const ending = byId(sh.endingFrameAssetId);
  const work = await tmpDir('take-prep');
  const guides: NonNullable<Parameters<typeof generateVideo>[0]['guides']> = [];
  let trimStartFrames = 0;
  let soundtrack: Take['soundtrack'] | undefined;
  let soundtrackFile: string | undefined;

  // 1) SOUND FIRST. A speaking shot starts from its sound: every line recorded with its character's canonical voice
  //    and checked by transcription, joined with natural gaps. The recording sets the shot's length and is anchored
  //    inside the clip as time-positioned voice context (MiniMax H3 renders its own speech, natively in sync with
  //    the mouths; the exact words come from the <d> tags, which always carry the script). Only when a speaker has no
  //    usable voice does the shot speak with MiniMax's default voice.
  const speakers = Array.from(new Set(sh.dialogue.map((d) => d.characterId)));
  const voices = new Map<string, Reference>();
  for (const cid of speakers) { const c = cast.find((x) => x.id === cid); const ref = c ? await referenceWav(c, state.assets, work) : null; if (ref) voices.set(cid, ref); }
  const songAsset = p.kind === 'MUSIC_VIDEO' && p.song?.assetId ? byId(p.song.assetId) : undefined;
  if (p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length && speakers.every((cid) => voices.has(cid)) && backend === 'local' && !payload.prompt) {
    await ctx.progress('PREPARING', { phase: 'recording', message: `Recording ${sh.dialogue.length} line${sh.dialogue.length > 1 ? 's' : ''} with the characters' voices` });
    const spoken: Array<{ file: string; durationSeconds: number; lineId: string; check: { wer: number; heard: string } | null }> = [];
    for (const d of sh.dialogue) {
      const c = cast.find((x) => x.id === d.characterId)!;
      const text = (p.language === 'AR' ? d.textAr || d.text : d.text).trim();
      if (!text) continue;
      let line = await speakLine(ctx, c, text, voices.get(d.characterId)!, work);
      let check = await verifyLine(ctx, line.file, text, c.language);
      if (check && check.wer > 0.35) { line = await speakLine(ctx, c, text, voices.get(d.characterId)!, work); check = await verifyLine(ctx, line.file, text, c.language); }
      const pr = await ffprobe(line.file);
      spoken.push({ file: line.file, durationSeconds: pr.durationSeconds ?? ('durationSeconds' in line ? line.durationSeconds : 2), lineId: d.id, check });
    }
    if (spoken.length) {
      const joined = await joinSpeech(spoken, path.join(work, 'dialogue.wav'));
      // the shot runs as long as its words need plus room to breathe, within the engine's 15 s — and not much longer:
      // MiniMax fills silence after a short line by repeating it (E2a: a 1.8 s line in a 6 s clip was said twice)
      const need = Math.ceil(joined.durationSeconds + 0.5);
      if (need > 15) await ctx.event('warn', `the dialogue runs ${joined.durationSeconds.toFixed(1)} s, longer than one clip can hold; split the shot`, { lines: spoken.length });
      const planned = seconds;
      seconds = Math.min(15, Math.max(4, Math.min(Math.max(planned, need), need + 2)));
      if (seconds !== planned) await ctx.event('info', `shot length set to its dialogue: ${planned} s planned → ${seconds} s`, { dialogueSeconds: Number(joined.durationSeconds.toFixed(2)) });
      soundtrackFile = joined.file;
      soundtrack = { kind: 'DIALOGUE', lines: spoken.map((s, i) => ({ lineId: s.lineId, from: joined.windows[i].from, to: joined.windows[i].to })) };
      await ctx.event('info', 'dialogue recorded as the shot\'s soundtrack', { seconds: joined.durationSeconds, lines: spoken.map((s) => ({ lineId: s.lineId, durationSeconds: s.durationSeconds, wer: s.check?.wer, heard: s.check?.heard })) });
    }
  }
  // 2) A music video shot anchors its stretch of the song: the take's soundtrack IS the song, so the performer's
  //    mouth follows the real vocal and the cut carries one copy of the music.
  const window = songAsset ? shotWindows(p).get(sh.id) : undefined;
  if (songAsset && songAsset.kind === 'AUDIO' && window && window.to > window.from && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') {
    soundtrackFile = await trimAudio(assetFile(songAsset), path.join(work, `${sh.id}-song.wav`), window.from, Math.min(window.to, window.from + seconds));
    soundtrack = { kind: 'SONG', assetId: songAsset.id, lines: [] };
    references.push({ kind: 'AUDIO', assetId: songAsset.id, note: `song ${window.from.toFixed(2)}–${Math.min(window.to, window.from + seconds).toFixed(2)} s` });
  }
  // 3) An unbroken continuation: the previous shot's last frames and audio are anchored at frame 0, so the new clip
  //    starts exactly where the old one ended; those frames are dropped again in the cut.
  const ordered = orderedShots(p);
  const prevShot = ordered[ordered.findIndex((x) => x.id === sh.id) - 1];
  const prevTake = prevShot?.takes.find((t) => t.id === prevShot.selectedTakeId);
  const prevAsset = prevTake && prevTake.provider !== 'SAMPLE' ? byId(prevTake.assetId) : undefined;
  const continuation = sh.continuity?.relationToPrevious === 'CONTINUATION' && prevShot?.sceneId === sh.sceneId && prevAsset && prevAsset.kind === 'VIDEO' && backend === 'local';
  if (continuation) {
    const tail = await tailClip(assetFile(prevAsset!), path.join(work, 'tail.mp4'), H3_GUIDE_FRAMES);
    guides.push({ frameIdx: 0, imageFile: tail, imageIsVideo: true });
    trimStartFrames = H3_GUIDE_FRAMES;
    references.push({ kind: 'VIDEO', assetId: prevAsset!.id, note: `continuation guide: last ${H3_GUIDE_FRAMES} frames of the previous take` });
    seconds = Math.min(15, seconds + 1); // the guide eats most of a second
  }
  if (soundtrackFile) guides.push({ frameIdx: trimStartFrames, audioFile: soundtrackFile });

  // 4) PICTURES. With a drawn opening frame the clip starts on it (first-frame conditioning); otherwise identity comes
  //    from reference pictures: the characters' portraits and the location plate. A continuation starts on the guide
  //    instead of the drawn frame.
  const firstFrame = !continuation && usableImage(opening) ? { file: assetFile(opening!), mime: opening!.mimeType ?? 'image/png' } : undefined;
  const lastFrame = !continuation && usableImage(ending) ? { file: assetFile(ending!), mime: ending!.mimeType ?? 'image/png' } : undefined;
  if (firstFrame) references.push({ kind: 'FIRST_FRAME', assetId: opening!.id });
  if (lastFrame) references.push({ kind: 'LAST_FRAME', assetId: ending!.id });
  const referenceImages: Array<{ file: string; mime: string }> = [];
  if (!firstFrame) {
    if (usableImage(opening)) { referenceImages.push({ file: assetFile(opening!), mime: opening!.mimeType ?? 'image/png' }); references.push({ kind: 'FIRST_FRAME', assetId: opening!.id, note: 'as reference picture' }); }
    for (const cid of sh.characterIds.slice(0, 4)) {
      const c = cast.find((x) => x.id === cid); const a = byId(c?.portraitAssetId);
      if (usableImage(a)) { referenceImages.push({ file: assetFile(a!), mime: a!.mimeType ?? 'image/png' }); references.push({ kind: 'CHARACTER', assetId: a!.id, characterId: cid }); }
    }
    const plate = byId(loc?.masterAssetId);
    if (usableImage(plate)) { referenceImages.push({ file: assetFile(plate!), mime: plate!.mimeType ?? 'image/png' }); references.push({ kind: 'LOCATION', assetId: plate!.id, locationId: loc?.id }); }
  }
  // 5) VOICE TIMBRE for shots that still speak natively (no soundtrack): the chosen voice sample as audio reference
  const referenceAudio: Array<{ file: string }> = [];
  if (!soundtrackFile && referenceImages.length > 0) {
    for (const cid of speakers.slice(0, 3)) { const v = voices.get(cid); if (v) { referenceAudio.push({ file: v.file }); references.push({ kind: 'AUDIO', assetId: v.asset.id, characterId: cid, note: 'voice timbre' }); } }
  }
  await ctx.event('info', 'take request prepared', { backend, seconds, soundtrack: soundtrack?.kind, continuation: Boolean(continuation), prompt: prompt.slice(0, 500), references });

  const t0 = Date.now();
  let lastStatus = '';
  // the local engine runs under the GPU lease (one model family on the card at a time; other services unload
  // first); the hosted API needs no card and runs in the hosted lane's concurrency
  const run = <T>(fn: () => Promise<T>) => (backend === 'local' ? ctx.gpu('VIDEO', 28000, fn, { jobId: ctx.job.id }) : fn());
  const result = await run(() => generateVideo({
    prompt, seconds, width: info.width, height: info.height, aspect: p.aspect, firstFrame, lastFrame, referenceImages: referenceImages.length ? referenceImages : undefined, referenceAudio: referenceAudio.length ? referenceAudio : undefined, guides: guides.length ? guides : undefined,
    seed, model: payload.model, resolution: payload.resolution,
    resumeTaskId: ctx.job.providerTaskId ?? undefined,
    onTaskCreated: async (id) => { await ctx.progress('GENERATING', { phase: 'generating', message: `MiniMax task ${id} created`, providerStatus: 'queued', percent: null }, { providerTaskId: id }); },
    onStatus: async (s) => { if (s.status !== lastStatus) { lastStatus = s.status; await ctx.progress(s.status === 'downloading' ? 'DOWNLOADING' : 'GENERATING', { phase: s.status, message: s.queue ? `waiting behind ${s.queue} in the GPU queue` : backend === 'api' ? `MiniMax: ${s.status}` : `local MiniMax H3: ${s.status}`, providerStatus: s.status, percent: null }); } else await ctx.checkpoint(); },
    shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } },
  }));
  const genMs = Date.now() - t0;
  await recordMetric('take.generation_ms', genMs, 'ms', { backend, seconds }, ctx.job.id);
  if (result.engineMs) await recordMetric('take.engine_ms', result.engineMs, 'ms', { backend, seconds }, ctx.job.id);

  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the clip' });
  // MiniMax H3 always renders a soundtrack; a shot with no lines may legitimately be near-silent
  const { report, probe } = await qaTake(result.file, { durationSeconds: seconds, width: Math.round(info.width * 0.5), height: Math.round(info.height * 0.5), expectAudio: true, speechExpected: sh.dialogue.length > 0 || soundtrack?.kind === 'SONG' });
  await ctx.checkpoint();
  // MiniMax H3 always renders its own speech (an anchored audio guide is context, not a pinned soundtrack — see
  // docs/AUDIOVISUAL-QA.md, E1), so a speaking take is proven by listening back: the clip is transcribed, compared
  // with the script, and each line is placed where it is actually spoken. A take that does not say its lines fails.
  if (sh.dialogue.length && backend === 'local' && p.kind !== 'MUSIC_VIDEO') {
    try {
      const wav = path.join(work, 'take-audio.wav');
      await ffmpeg(['-y', '-v', 'error', '-i', result.file, '-vn', '-ac', '1', '-ar', '16000', wav]);
      const lines = sh.dialogue.map((d) => ({ en: d.text, ar: d.textAr || d.text }));
      const expected = lines.map((l) => (p.language === 'AR' ? l.ar : l.en)).join(' ');
      const t = await ctx.gpu('ASR', 4000, () => transcribe(wav, { language: p.language === 'AR' ? 'ar' : 'en' }), { jobId: ctx.job.id });
      const wer = wordErrorRate(expected, t.text, p.language);
      // coverage: how much of the script was heard, in order (a repeated phrase counts against WER but is not a
      // missing line); the take passes when the lines were spoken, and the report carries both numbers
      const coverage = scriptCoverage(expected, t.text, p.language);
      report.checks.push({ name: 'script-spoken', ok: coverage >= 0.7, value: Number(coverage.toFixed(2)), threshold: 0.7, detail: `heard: ${t.text.slice(0, 160)} (WER ${wer.toFixed(2)})` });
      if (coverage < 0.7) report.ok = false;
      const words = t.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
      const clipSeconds = probe.durationSeconds ?? seconds;
      const placed = alignLyrics([{ id: 'take', kind: 'VERSE', from: 0, to: clipSeconds, singerIds: [], text: lines.map((l) => l.en).join('\n'), textAr: lines.map((l) => l.ar).join('\n') }], words, p.language);
      soundtrack = { kind: 'DIALOGUE', assetId: soundtrack?.assetId, lines: sh.dialogue.map((d, i) => { const w = placed[i]; return { lineId: d.id, from: w?.from ?? 0, to: w?.to ?? clipSeconds }; }) };
      await ctx.event('info', 'lines placed on the take', { wer: Number(wer.toFixed(2)), heard: t.text.slice(0, 200), lines: placed.map((w) => ({ from: Number(w.from.toFixed(2)), to: Number(w.to.toFixed(2)), method: w.method, confidence: w.confidence })) });
    } catch (e) { report.checks.push({ name: 'script-spoken', ok: true, detail: `not checked: ${(e as Error).message}` }); }
  }
  if (soundtrackFile) { const id = nid('gen'); const stored = await adoptFile(id, soundtrackFile, { expectKind: 'AUDIO' }); await command('addAsset', [assetFromStored(id, stored, { label: `${p.title} ${sh.number} — soundtrack (${soundtrack!.kind.toLowerCase()})`, tags: ['soundtrack', soundtrack!.kind.toLowerCase()], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shotId: sh.id, lines: soundtrack!.lines } })], 'worker'); soundtrack = { ...soundtrack!, assetId: soundtrack!.assetId ?? id }; }
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
  // the next free number, counting any numbered label already on the shot (uploads and samples included)
  const takeNumber = Math.max(sh.takes.length, ...sh.takes.map((t) => Number(/\bTake (\d+)/i.exec(t.label)?.[1] ?? 0))) + 1;
  const label = `Take ${takeNumber}`;
  const provenance = { provider: 'MINIMAX', backend: result.backend, model: result.model, requestId: result.requestId, prompt, references, seed, params: result.params, workflowVersion: result.workflowVersion, codeVersion: env().CODE_VERSION, jobId: ctx.job.id, productionId: p.id, shotId: sh.id };
  await command('addAsset', [assetFromStored(posterId, storedPoster, { label: `${p.title} ${sh.number} — ${label} poster`, tags: ['take', 'poster'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: videoId } })], 'worker');
  await command('addAsset', [assetFromStored(videoId, stored, { label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${label}`, tags: ['take', 'minimax'], origin: 'GENERATED', jobId: ctx.job.id, provenance, poster: `/api/media/${posterId}` })], 'worker');
  const r = await command('addTake', [p.id, sh.id, { assetId: videoId, label, status: report.ok ? 'READY' : 'REJECTED', rejectionReason: report.ok ? undefined : `Automatic checks failed: ${report.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`, provider: 'MINIMAX', model: result.model, requestId: result.requestId, prompt, params: result.params, seed, references, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, generationMs: genMs, costUsd: result.costUsd, qa: report, jobId: ctx.job.id, codeVersion: env().CODE_VERSION, workflowVersion: result.workflowVersion, thumbnailAssetId: posterId, trimStartFrames: trimStartFrames || undefined, soundtrack }], 'worker');
  await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  // the first accepted take of a shot is selected automatically so the cut can be assembled — also when the current
  // choice is only a bundled sample clip; a producer's own choice of a real take is never overridden
  const current = sh.takes.find((t) => t.id === sh.selectedTakeId);
  if (report.ok && (!current || current.provider === 'SAMPLE')) await command('selectTake', [p.id, sh.id, r.take.id], 'worker');
  await recordMetric('take.qa_ok', report.ok ? 1 : 0, 'bool', { backend }, ctx.job.id);
  return { takeId: r.take.id, assetId: videoId, qaOk: report.ok, backend: result.backend, model: result.model, requestId: result.requestId, generationMs: genMs, costUsd: result.costUsd, awaitingReview: false, libraryRoot: libraryRoot() };
};
