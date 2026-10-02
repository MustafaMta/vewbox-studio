import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, ShotDialogue, Take, TakeReference } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, commands, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, fileFor, libraryRoot } from '@/server/media';
import { ffmpeg, joinSpeech, qaTake, tailClip, thumbnail, tmpDir, trimAudio, webReady } from '@/server/media/ffmpeg';
import { orderedShots, shotWindows } from '@/domain/timeline';
import { generateVideo, chooseBackend } from '@/server/providers/video';
import { H3_GUIDE_FRAMES } from '@/server/workflows/minimax-h3';
import { VOICE_GATES, transcribe } from '@/server/providers/speech';
import { alignLyrics } from '@/server/media/lyrics';
import { TAKE_COVERAGE, judgeHeard, lineLanguage, lineRecordingCurrent, referenceWav, shouldRegenerate, speakLine, verifyLine, type LineCheck, type Reference } from './voice';
import { takePrompt } from '@/server/story/prompts';
import { recordMetric } from '@/server/jobs/queue';
import { env } from '@/server/env';
import { recordHandoff, recordQaReport } from '@/server/org/runs';
import { preflightTake } from '@/server/org/preflight';

/** GENERATE A TAKE — the heart of production. Gather the shot's references (opening frame, character portraits,
 *  location plate, voice samples), write the prompt, ask MiniMax (hosted or local) for the clip, download it, prove
 *  it decodes, run the quality checks, make a poster frame, and record a new take with full provenance. A new take
 *  never replaces an existing one. If the worker restarts mid-way, the hosted task id is reused, not resubmitted. */

const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export const generateTake: Handler = async (ctx) => {
  const payload = ctx.job.payload as { productionId: string; shotId: string; model?: string; resolution?: string; durationSeconds?: number; prompt?: string; seed?: number; select?: boolean };
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
  // PREFLIGHT — the request is refused before the engine is touched when it could not succeed: a failed check is a
  // classified failure the producer corrects, not an attempt the engine burns
  const preflight = preflightTake(state, p, sh, { backend, customPrompt: Boolean(payload.prompt) });
  await ctx.event(preflight.ok ? 'info' : 'error', `preflight ${preflight.ok ? 'passed' : 'FAILED'}`, { checks: preflight.checks });
  if (!preflight.ok) {
    const failed = preflight.checks.filter((c) => !c.ok);
    throw Object.assign(new StudioError('INVALID', `Preflight failed for shot ${sh.number}: ${failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`, { checks: preflight.checks }), { failureClass: failed[0].failureClass });
  }
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
  let dialogueLineAssets: string[] | undefined;
  /** the checks of the lines recorded by THIS take (reused lines were checked when they were recorded) */
  const spokenChecks: Array<LineCheck | null> = [];

  // 1) SOUND FIRST. A speaking shot starts from its sound: every line recorded with its character's canonical voice
  //    and checked by transcription, joined with natural gaps. The recording sets the shot's length and is anchored
  //    inside the clip as time-positioned voice context (MiniMax H3 renders its own speech, natively in sync with
  //    the mouths; the exact words come from the <d> tags, which always carry the script). Only when a speaker has no
  //    usable voice does the shot speak with MiniMax's default voice.
  //    DIALOGUE REUSE (contract §1.4): a line is recorded only when it has no stored recording or the recording is
  //    stale (the voice was rebuilt since); a new recording is written back to the line, so every take of the shot
  //    — and every other shot the line is in — speaks the same file. The take's soundtrack is joined from them.
  const speakers = Array.from(new Set(sh.dialogue.map((d) => d.characterId)));
  const voices = new Map<string, Reference>();
  const reused = new Set<string>();
  const lineText = (d: ShotDialogue) => (p.language === 'AR' ? d.textAr || d.text : d.text).trim();
  const storedLine = (d: ShotDialogue): Asset | undefined => { const c = cast.find((x) => x.id === d.characterId); return c && lineRecordingCurrent(d, c, state.assets) ? byId(d.audioAssetId) : undefined; };
  for (const cid of speakers) {
    const c = cast.find((x) => x.id === cid);
    if (!c) continue;
    const mine = sh.dialogue.filter((d) => d.characterId === cid && lineText(d));
    if (mine.length && mine.every((d) => storedLine(d))) { reused.add(cid); continue; }
    const ref = await referenceWav(c, state.assets, work);
    if (ref) voices.set(cid, ref);
  }
  const songAsset = p.kind === 'MUSIC_VIDEO' && p.song?.assetId ? byId(p.song.assetId) : undefined;
  if (p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length && speakers.every((cid) => voices.has(cid) || reused.has(cid)) && backend === 'local' && !payload.prompt) {
    const toRecord = sh.dialogue.filter((d) => lineText(d) && !storedLine(d)).length;
    await ctx.progress('PREPARING', { phase: 'recording', message: toRecord ? `Recording ${toRecord} line${toRecord > 1 ? 's' : ''} with the characters' voices${toRecord < sh.dialogue.length ? ` (${sh.dialogue.length - toRecord} already recorded)` : ''}` : `Using the ${sh.dialogue.length} recorded line${sh.dialogue.length > 1 ? 's' : ''}` });
    const spoken: Array<{ file: string; durationSeconds: number; lineId: string; assetId: string; check: LineCheck | null; reused: boolean }> = [];
    for (const d of sh.dialogue) {
      const c = cast.find((x) => x.id === d.characterId)!;
      const text = lineText(d);
      if (!text) continue;
      const have = storedLine(d);
      if (have) {
        const dur = have.durationSeconds ?? d.durationSeconds ?? (await ctx.tool('media.probe', () => ffprobe(assetFile(have)))).durationSeconds ?? 2;
        spoken.push({ file: assetFile(have), durationSeconds: dur, lineId: d.id, assetId: have.id, check: (have.provenance?.check as LineCheck | null | undefined) ?? null, reused: true });
        continue;
      }
      const ref = voices.get(d.characterId)!;
      let line = await speakLine(ctx, c, text, ref, work, { delivery: d.delivery });
      let check = await verifyLine(ctx, line.file, text, line.language);
      if (shouldRegenerate(check)) { await ctx.event('warn', `line failed the gate (${check!.reasons.join('; ')}), regenerating once`, { lineId: d.id, heard: check!.heard, coverage: check!.coverage, cer: check!.cer }); line = await speakLine(ctx, c, text, ref, work, { delivery: d.delivery }); check = await verifyLine(ctx, line.file, text, line.language); }
      const id = nid('gen');
      const st = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
      const durationSeconds = st.probe?.durationSeconds ?? line.durationSeconds ?? 2;
      await commands([
        { name: 'addAsset', args: [assetFromStored(id, st, { label: `${p.title} ${sh.number} — ${c.name}: “${text.slice(0, 32)}”`, tags: ['dialogue', 'voice'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, characterId: c.id, shotId: sh.id, lineId: d.id, voiceRevision: c.voice.identity?.revision, check } })] },
        { name: 'setDialogueAudio', args: [p.id, sh.id, d.id, { audioAssetId: id, durationSeconds, voiceRevision: c.voice.identity?.revision }] },
      ], 'worker');
      spoken.push({ file: st.absPath, durationSeconds, lineId: d.id, assetId: id, check, reused: false });
      spokenChecks.push(check);
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
      // an earlier take of this shot joined the same recordings in the same order: its soundtrack is this one
      const lineAssets = spoken.map((s) => s.assetId);
      const prior = sh.takes.map((t) => t.soundtrack).find((st) => { if (!st || st.kind !== 'DIALOGUE' || !st.assetId) return false; const a = byId(st.assetId); const was = a?.provenance?.lineAssets as string[] | undefined; return Boolean(a && !a.unavailable && was && was.length === lineAssets.length && was.every((x, i) => x === lineAssets[i])); });
      soundtrack = { kind: 'DIALOGUE', assetId: prior?.assetId, lines: spoken.map((s, i) => ({ lineId: s.lineId, from: joined.windows[i].from, to: joined.windows[i].to })) };
      dialogueLineAssets = lineAssets;
      await ctx.event('info', `dialogue ${spoken.every((s) => s.reused) ? 'reused' : spoken.some((s) => s.reused) ? 'partly reused' : 'recorded'} as the shot's soundtrack${prior ? ' (joined track reused too)' : ''}`, { seconds: joined.durationSeconds, lines: spoken.map((s) => ({ lineId: s.lineId, assetId: s.assetId, reused: s.reused, durationSeconds: s.durationSeconds, coverage: s.check?.coverage, wer: s.check?.wer, heard: s.check?.heard })) });
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
  const result = await run(() => ctx.tool('video.minimax_generate', () => generateVideo({
    prompt, seconds, width: info.width, height: info.height, aspect: p.aspect, firstFrame, lastFrame, referenceImages: referenceImages.length ? referenceImages : undefined, referenceAudio: referenceAudio.length ? referenceAudio : undefined, guides: guides.length ? guides : undefined,
    seed, model: payload.model, resolution: payload.resolution,
    resumeTaskId: ctx.job.providerTaskId ?? undefined,
    onTaskCreated: async (id) => { await ctx.progress('GENERATING', { phase: 'generating', message: `MiniMax task ${id} created`, providerStatus: 'queued', percent: null }, { providerTaskId: id }); },
    onStatus: async (s) => { if (s.status !== lastStatus) { lastStatus = s.status; await ctx.progress(s.status === 'downloading' ? 'DOWNLOADING' : 'GENERATING', { phase: s.status, message: s.queue ? `waiting behind ${s.queue} in the GPU queue` : backend === 'api' ? `MiniMax: ${s.status}` : `local MiniMax H3: ${s.status}`, providerStatus: s.status, percent: null }); } else await ctx.checkpoint(); },
    shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } },
  }), { label: backend }));
  const genMs = Date.now() - t0;
  await recordMetric('take.generation_ms', genMs, 'ms', { backend, seconds }, ctx.job.id);
  if (result.engineMs) await recordMetric('take.engine_ms', result.engineMs, 'ms', { backend, seconds }, ctx.job.id);

  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the clip' });
  // MiniMax H3 always renders a soundtrack; a shot with no lines may legitimately be near-silent
  const { report, probe } = await ctx.tool('media.qa_take', () => qaTake(result.file, { durationSeconds: seconds, width: Math.round(info.width * 0.5), height: Math.round(info.height * 0.5), expectAudio: true, speechExpected: sh.dialogue.length > 0 || soundtrack?.kind === 'SONG' }));
  const pictureChecks = report.checks.map((c) => ({ ...c }));
  await ctx.checkpoint();
  let scriptCheck: { ok: boolean; coverage?: number; wer?: number; cer?: number; heard?: string; detail?: string } | undefined;
  let takeUnverified = false;
  // MiniMax H3 always renders its own speech (an anchored audio guide is context, not a pinned soundtrack — see
  // docs/AUDIOVISUAL-QA.md, E1), so a speaking take is proven by listening back: the clip is transcribed, compared
  // with the script, and each line is placed where it is actually spoken. A take that does not say its lines fails.
  if (sh.dialogue.length && backend === 'local' && p.kind !== 'MUSIC_VIDEO') {
    try {
      const wav = path.join(work, 'take-audio.wav');
      await ffmpeg(['-y', '-v', 'error', '-i', result.file, '-vn', '-ac', '1', '-ar', '16000', wav]);
      const lines = sh.dialogue.map((d) => ({ en: d.text, ar: d.textAr || d.text }));
      const expected = lines.map((l) => (p.language === 'AR' ? l.ar : l.en)).join(' ');
      // the verification language follows the script of the lines (routing parity), not the production's setting
      const heardIn = lineLanguage(expected, p.language);
      const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(wav, { language: heardIn === 'AR' ? 'ar' : 'en' }), { label: 'take audio' }), { jobId: ctx.job.id });
      // the contract's gate for a take (§1.4): coverage ≥ 0.7 of the script, in order (a repeated phrase is not a
      // missing line), AND CER ≤ 0.15 after the dialect fold; WER is reported. The report carries all three.
      const judged = judgeHeard(expected, t.text, heardIn, 'take');
      const { wer, coverage, cer } = judged;
      report.checks.push({ name: 'script-spoken', ok: judged.ok, value: Number(coverage.toFixed(2)), threshold: TAKE_COVERAGE, detail: `heard: ${t.text.slice(0, 160)} (CER ${cer.toFixed(2)}, WER ${wer.toFixed(2)})${judged.reasons.length ? `; ${judged.reasons.join('; ')}` : ''}` });
      scriptCheck = { ok: judged.ok, coverage: Number(coverage.toFixed(2)), wer: Number(wer.toFixed(2)), cer: Number(cer.toFixed(2)), heard: t.text.slice(0, 200) };
      if (!judged.ok) report.ok = false;
      const words = t.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
      const clipSeconds = probe.durationSeconds ?? seconds;
      const placed = alignLyrics([{ id: 'take', kind: 'VERSE', from: 0, to: clipSeconds, singerIds: [], text: lines.map((l) => l.en).join('\n'), textAr: lines.map((l) => l.ar).join('\n') }], words, heardIn);
      soundtrack = { kind: 'DIALOGUE', assetId: soundtrack?.assetId, lines: sh.dialogue.map((d, i) => { const w = placed[i]; return { lineId: d.id, from: w?.from ?? 0, to: w?.to ?? clipSeconds }; }) };
      await ctx.event('info', 'lines placed on the take', { wer: Number(wer.toFixed(2)), heard: t.text.slice(0, 200), lines: placed.map((w) => ({ from: Number(w.from.toFixed(2)), to: Number(w.to.toFixed(2)), method: w.method, confidence: w.confidence })) });
    } catch (e) {
      // the take could not be heard back: it is not passed on trust. The picture checks stand (the take stays
      // READY, so nobody regenerates it blindly), but the script check is recorded as not passed, the take is not
      // chosen for the cut, the inspector's decision is REVIEW and the job awaits a human ear.
      report.checks.push({ name: 'script-spoken', ok: false, detail: `not verified (transcription unavailable): ${(e as Error).message}` });
      scriptCheck = { ok: false, detail: `not verified: ${(e as Error).message}` };
      takeUnverified = true;
    }
  }
  const unverifiedLines = spokenChecks.filter((c) => c === null).length;
  const flaggedLines = spokenChecks.filter((c) => c && !c.ok).length;
  if (soundtrackFile) {
    // the joined dialogue track is stored once per set of recordings: a take that joined the same stored lines as
    // an earlier one points at that track; a song stretch is derived from the song for this take
    let id = soundtrack?.kind === 'DIALOGUE' ? soundtrack.assetId : undefined;
    if (!id) {
      id = nid('gen'); const stored = await adoptFile(id, soundtrackFile, { expectKind: 'AUDIO' });
      await command('addAsset', [assetFromStored(id, stored, { label: `${p.title} ${sh.number} — soundtrack (${soundtrack!.kind.toLowerCase()})`, tags: ['soundtrack', soundtrack!.kind.toLowerCase()], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shotId: sh.id, lines: soundtrack!.lines, lineAssets: dialogueLineAssets } })], 'worker');
    }
    soundtrack = { ...soundtrack!, assetId: soundtrack!.assetId ?? id };
    // audio before video: the shot's recorded lines are Sound's handoff to Video Production (one per speaking shot)
    if (soundtrack.kind === 'DIALOGUE') {
      await recordHandoff({ productionId: p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: [id, ...(dialogueLineAssets ?? [])], outputVersions: { shotId: sh.id, lines: soundtrack.lines.length, recordedNow: spokenChecks.length }, validation: { ok: flaggedLines === 0 && unverifiedLines === 0, checks: [{ name: 'lines-recorded', ok: true, detail: `${soundtrack.lines.length} line(s) in the characters' voices (${spokenChecks.length} recorded now)` }, { name: 'lines-verified-by-transcription', ok: flaggedLines === 0 && unverifiedLines === 0, detail: flaggedLines || unverifiedLines ? `${flaggedLines} line(s) drifted, ${unverifiedLines} not heard back` : undefined }] }, jobId: ctx.job.id });
    }
  }
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
  if (report.ok && !takeUnverified && (!current || current.provider === 'SAMPLE' || payload.select)) await command('selectTake', [p.id, sh.id, r.take.id], 'worker');
  await recordMetric('take.qa_ok', report.ok ? 1 : 0, 'bool', { backend }, ctx.job.id);
  // QA REPORTS — the inspectors' verdicts on this take, recorded apart from the take itself: the picture checks
  // (Visual Quality Inspector) and, for a speaking take, the script heard back (Audio Synchronization Inspector)
  const pictureOk = pictureChecks.every((c) => c.ok);
  await recordQaReport({ productionId: p.id, subjectKind: 'TAKE', subjectId: r.take.id, inspectorId: 'visual-quality-inspector', checks: pictureChecks, failureClass: pictureOk ? undefined : 'OUTPUT_CORRUPTION', decision: pictureOk ? 'ACCEPT' : 'REJECT', evidenceAssetIds: [videoId, posterId], jobId: ctx.job.id });
  if (scriptCheck) await recordQaReport({ productionId: p.id, subjectKind: 'TAKE', subjectId: r.take.id, inspectorId: 'audio-sync-inspector', checks: [{ name: 'script-spoken', ok: scriptCheck.ok, value: scriptCheck.coverage, threshold: TAKE_COVERAGE, detail: scriptCheck.heard ? `heard: ${scriptCheck.heard.slice(0, 160)}` : scriptCheck.detail }, ...(scriptCheck.cer !== undefined ? [{ name: 'character-error-rate', ok: scriptCheck.cer <= VOICE_GATES.cer, value: scriptCheck.cer, threshold: VOICE_GATES.cer, detail: 'after the dialect fold; gated' }] : []), ...(scriptCheck.wer !== undefined ? [{ name: 'word-error-rate', ok: true, value: scriptCheck.wer, detail: 'reported, not gated' }] : [])], failureClass: scriptCheck.ok || takeUnverified ? undefined : 'LIP_SYNC_FAILURE', decision: takeUnverified ? 'REVIEW' : scriptCheck.ok ? 'ACCEPT' : 'REJECT', notes: takeUnverified ? 'transcription unavailable: listen before choosing this take' : undefined, evidenceAssetIds: [videoId, ...(soundtrack?.assetId ? [soundtrack.assetId] : [])], jobId: ctx.job.id });
  // VIDEO handoff to QA once every shot of the production has an accepted, chosen take
  const after = (await readState()).state.productions.find((x) => x.id === p.id);
  if (after) {
    const chosen = after.shots.map((x) => x.takes.find((t) => t.id === x.selectedTakeId));
    const withReal = chosen.filter((t) => t && t.provider !== 'SAMPLE').length;
    if (withReal === after.shots.length) {
      const failing = chosen.filter((t) => t && !t.qa?.ok).length;
      await recordHandoff({ productionId: p.id, stage: 'VIDEO', producerDepartment: 'VIDEO', receiverDepartment: 'QA', artifactIds: chosen.map((t) => t!.assetId), outputVersions: { shots: after.shots.length }, validation: { ok: failing === 0, checks: [{ name: 'every-shot-has-chosen-take', ok: true, detail: `${after.shots.length} shots` }, { name: 'chosen-takes-passed-inspection', ok: failing === 0, detail: failing ? `${failing} chosen take(s) failed a check` : undefined }] }, jobId: ctx.job.id });
    }
  }
  await ctx.activity(report.ok ? (takeUnverified ? 'TAKE_REVIEW' : 'TAKE_ACCEPTED') : 'TAKE_REJECTED', `Shot ${scene?.number ?? '?'}.${sh.number} of “${p.title}”: ${label} ${report.ok ? (takeUnverified ? 'made, not verified (transcription unavailable)' : 'accepted') : 'rejected'} (${seconds} s, ${backend}${scriptCheck?.coverage !== undefined ? `, script ${Math.round(scriptCheck.coverage * 100)} % heard` : ''})`, { takeId: r.take.id, shotId: sh.id, seconds, backend, generationMs: genMs, qaOk: report.ok, unverified: takeUnverified });
  // a take or a line that could not be heard back (transcription away) waits for a human ear: never passed silently
  return { takeId: r.take.id, assetId: videoId, qaOk: report.ok, backend: result.backend, model: result.model, requestId: result.requestId, generationMs: genMs, costUsd: result.costUsd, unverifiedLines, takeUnverified, awaitingReview: unverifiedLines > 0 || takeUnverified, libraryRoot: libraryRoot() };
};
