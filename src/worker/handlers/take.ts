import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { canCountPeople, countPeopleOverTime, peopleExpected, peopleVerdict, showsPictureOfPeople } from './people';
import { StudioError } from '@/domain/errors';
import type { Asset, QaCheck, ShotDialogue, Take, TakeReference } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { facingAway } from '@/domain/blocking';
import { capabilityFor, type VideoQualityTier } from '@/domain/video-capability';
import { commands, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { assetFile, assetFromStored, ffprobe, libraryRoot } from '@/server/media';
import { referenceFilesReadiness, referenceNeeds } from '@/server/production/readiness';
import { ffmpeg, frameAt, joinSpeech, lastFrame as closingFrame, padAudio, qaTake, speechAudioArgs, tailClip, thumbnail, tmpDir, trimAudio, webReady } from '@/server/media/ffmpeg';
import { CLOCK_FPS, songWindowFrames, windowEndSourceFrame } from '@/domain/timeline';
import { worldForShot } from '@/server/world';
import { jobOutputs, stableSeed } from '@/server/jobs/outputs';
import { commitTake, committedTake, takeIdOf, type TakeCommit } from './take-commit';
import { generateVideo, chooseBackend } from '@/server/providers/video';
import { H3_FPS } from '@/server/workflows/minimax-h3';
import { VOICE_GATES, transcribe } from '@/server/providers/speech';
import { alignLyrics } from '@/server/media/lyrics';
import { TAKE_COVERAGE, judgeHeard, lineLanguage, lineRecordingCurrent, referenceWav, isFailedCheck, speakLine, verifyLine, type LineCheck, type Reference } from './voice';
import { bindNamesOutsideDialogue, h3ReferencePrompt, lintH3Prompt, takePrompt } from '@/server/story/prompts';
import { recordMetric } from '@/server/jobs/queue';
import { env } from '@/server/env';
import { VIDEO_H3_VRAM_MB } from '@/server/gpu/estimates';
import { recordHandoff } from '@/server/org/runs';
import { preflightTake } from '@/server/org/preflight';
import { bindingOf, clipSecondsFor, needsOpeningFrame, resolveShotPack } from '@/server/production/shot-pack';
import { drawShotFrame } from './images';
import { contextRecord } from '@/domain/production-context';
import { continuityChecks, judgeContainer, judgeLineTiming } from '@/server/media/continuity-qa';
import { takeVerdict } from '@/domain/take-checks';
import { withFaceReferences } from './face-reference';
import { alignScript, faceIdentity, isQaUnavailable, judgeAlignment, judgeIdentity, judgeLipSync, mouthActivity } from '@/server/providers/qa-service';
import { shotPerformers } from '@/domain/music-performance';
import { frameBudget, validateGuideClip, type GuideRecord } from '@/server/production/guide';
import { assertIdentityConditioning } from '@/server/production/identity-rule';
import { assertLocationPlate } from '@/server/production/location-rule';
import { identityAppliedChecks, measurePlateDrift, plateComparable, type PlateDrift } from '@/server/media/plate-drift';
import { establishFromTake } from '@/server/world';
import { outputId } from '@/server/jobs/outputs';
import type { CommandSpec } from '@/server/studio/engine';
import { guideHeadRecord, measureGuideHead } from '@/server/media/guide-head';
import { recordProducedTake } from '@/server/studio/notes';

/** GENERATE A TAKE — the heart of production. Resolve the shot pack (relation to the previous shot, every character's
 *  canonical image and the plate bound as pictures, what the clip starts from), record the lines first, write the
 *  prompt in MiniMax H3's reference grammar, ask MiniMax (hosted or local) for the clip, download it, prove it
 *  decodes, run the quality checks, make a poster frame, and record a new take with full provenance. A new take
 *  never replaces an existing one. If the worker restarts mid-way, the hosted task id is reused, not resubmitted. */

/** `params.quality` as recorded on every take (docs/CONTRACTS-REDESIGN-BACKEND.md B6): the tier it was made at,
 *  and the tier asked for when that differs. The local engine has two tiers (capability `tiers`,
 *  docs/research/MODEL-EVAL-2026-10.md §8.4): `final` (the default: the base model, 20 steps) and `draft` (the turbo LoRA,
 *  only when asked for). The hosted API has one tier, so a draft request there is made at final and recorded as asked.
 *  Pure, so the rule is tested. */
export function takeQuality(requested: 'draft' | 'final' | undefined, backend: 'local' | 'api' = 'local'): { quality: VideoQualityTier; qualityRequested?: 'draft' } {
  if (requested !== 'draft') return { quality: 'final' };
  return capabilityFor(backend).tiers?.draft ? { quality: 'draft' } : { quality: 'final', qualityRequested: 'draft' };
}

export const generateTake: Handler = async (ctx) => {
  const payload = ctx.job.payload as { productionId: string; shotId: string; model?: string; resolution?: string; durationSeconds?: number; prompt?: string; seed?: number; select?: boolean; quality?: 'draft' | 'final' };
  let { state: studio } = await readState();
  // AN EARLIER ATTEMPT ALREADY COMMITTED THIS TAKE (it crashed after its commit, before the job was completed): the
  // take is returned, never generated a second time (audit C2, step 6)
  const done = committedTake(studio, ctx.job.id);
  if (done) {
    await ctx.event('info', `take ${done.take.label} was already recorded by an earlier attempt of this job; nothing is generated again`, { takeId: done.take.id });
    const qaOk = done.take.status === 'READY' && done.take.qa?.ok !== false;
    const takeUnverified = done.take.qa?.checks.some((c) => c.name === 'script-spoken' && /not verified/.test(c.detail ?? '')) ?? false;
    return { takeId: done.take.id, assetId: done.take.assetId, qaOk, model: done.take.model, requestId: done.take.requestId, generationMs: done.take.generationMs, costUsd: done.take.costUsd, resumedFromCommit: true, takeUnverified, awaitingReview: takeUnverified, libraryRoot: libraryRoot() };
  }
  const out = jobOutputs(ctx.job);
  let p = studio.productions.find((x) => x.id === payload.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  let sh = p.shots.find((x) => x.id === payload.shotId);
  if (!sh) throw new StudioError('NOT_FOUND', 'Shot not found');
  // THE OPENING FRAME OF A CLOSE SHOT (acceptance 2026-10-06, G13): drawn before anything else when the shot has none
  // (src/server/production/shot-pack.ts needsOpeningFrame) — without it H3 opens on the plate's wide view and pushes in
  // (only for a request the preflight below would let through: a refused shot draws nothing)
  if (needsOpeningFrame(resolveShotPack(studio, p, sh, { backend: chooseBackend() }), sh, studio.settings, { customPrompt: Boolean(payload.prompt) }) && preflightTake(studio, p, sh, { backend: chooseBackend(), customPrompt: Boolean(payload.prompt) }).ok) {
    await ctx.progress('PREPARING', { phase: 'drawing', message: `Drawing the opening frame of shot ${sh.number}: a ${sh.framing.toLowerCase().replace(/_/g, ' ')} starts at its own framing` });
    const frameId = await drawShotFrame(ctx, studio, p, sh);
    await ctx.event('info', `opening frame drawn before the take (${frameId}): a ${sh.framing.toLowerCase().replace(/_/g, ' ')} with no frame would open on the plate's wide view`, { shotId: sh.id, assetId: frameId, setting: 'settings.generation.autoOpeningFrame' });
    ({ state: studio } = await readState());
    p = studio.productions.find((x) => x.id === payload.productionId)!;
    sh = p.shots.find((x) => x.id === payload.shotId)!;
  }
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const backend = chooseBackend();

  await ctx.progress('PREPARING', { phase: 'preparing', message: 'Gathering references and writing the prompt' });
  // THE WORLD BIBLE (the World Continuity step): the revision this production is pinned to (pinned at the story's
  // approval, advanced only when nothing it already filmed changes), laid over the studio for this shot — the place is
  // filmed against the plate the bible chooses (an established frame of an approved take before a drawn plate, by
  // id), each character holds its pinned canonical image. Everything below reads that world.
  const world = await step(ctx, 'world-continuity', `world-read: shot ${sh.number}`, async () => {
    const w = await worldForShot(studio, p, sh, { jobId: ctx.job.id, by: 'world-continuity' });
    await ctx.event(w.read.conflicts.length || w.outcome.blocking.length ? 'warn' : 'info', `World Bible revision ${w.read.revisionNumber}${w.read.pinned ? ' (pinned)' : ' (not pinned)'}: ${w.outcome.message}; ${w.read.location ? `the place: ${w.read.location.why}` : 'no place'}${w.read.conflicts.length ? `; ${w.read.conflicts.join('; ')}` : ''}`, { read: w.read, action: w.outcome.action, blocking: w.outcome.blocking });
    return w;
  });
  // a close shot of a character whose full-body canonical image leaves too few face pixels gets a derived face crop
  // (src/worker/handlers/face-reference.ts; the studio's `generation.faceReference`, OFF by default)
  const state = await withFaceReferences(ctx, world.state, p, sh, { backend, out });
  const cast = castOf(state, p); const places = worldOf(state, p);
  const loc = places.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  // PREFLIGHT (the Executive Producer's step) — the request is refused before the engine is touched when it could not
  // succeed: a failed check is a classified failure the producer corrects, not an attempt the engine burns
  await step(ctx, 'executive-producer', `take-preflight: shot ${sh.number}`, async () => {
    const preflight = preflightTake(state, p, sh, { backend, customPrompt: Boolean(payload.prompt) });
    await ctx.event(preflight.ok ? (preflight.warnings.length ? 'warn' : 'info') : 'error', `preflight ${preflight.ok ? (preflight.warnings.length ? `passed with ${preflight.warnings.length} warning(s): ${preflight.warnings.map((w) => w.detail ?? w.name).join('; ').slice(0, 300)}` : 'passed') : 'FAILED'}`, { checks: preflight.checks, warnings: preflight.warnings });
    if (!preflight.ok) {
      const failed = preflight.checks.filter((c) => !c.ok);
      // THE LOCATION PLATE RULE (src/server/production/location-rule.ts): a place without a plate is refused as its own
      // error class, the two ways out named — never filmed from words
      if (failed.some((c) => c.name === 'location-plate')) assertLocationPlate(resolveShotPack(state, p, sh, { backend }), p, sh, scene, loc);
      throw Object.assign(new StudioError('INVALID', `Preflight failed for shot ${sh.number}: ${failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`, { checks: preflight.checks }), { failureClass: failed[0].failureClass });
    }
  });
  // THE SHOT PACK: the relation to the previous shot, the identity references (every character's canonical image and
  // the plate, on every shot that shows them), what the clip starts from, the graph — the same resolution the
  // preflight judged
  const pack = resolveShotPack(state, p, sh, { backend, bible: world.outcome.view.revision?.bible });
  await ctx.event(pack.context.gaps.length ? 'warn' : 'info', `production context ${pack.context.hash}: ${pack.context.characters.length} character(s), ${pack.context.location ? pack.context.location.name : 'no place'}, ${pack.context.shot.boundary}${pack.context.anchoring.reanchor ? ', re-anchoring' : ''}${pack.context.gaps.length ? `; gaps: ${pack.context.gaps.join('; ')}` : ''}`, { context: contextRecord(pack.context) });
  await ctx.event('info', `scene state (${pack.sceneState.boundary}): ${pack.sceneState.timeOfDay?.toLowerCase().replace('_', ' ') ?? 'time of day unknown'}${pack.sceneState.weather ? `, ${pack.sceneState.weather}` : ''}${pack.sceneState.lighting ? `, ${pack.sceneState.lighting}` : ''}; ${pack.sceneState.present.length} present, ${pack.sceneState.props.length} prop(s); environment from ${pack.sceneState.sources.environment.kind.toLowerCase().replace(/_/g, ' ')}`, { sceneState: pack.sceneState });
  let seconds = Math.min(15, Math.max(1, Math.round(payload.durationSeconds ?? sh.durationSeconds)));
  // the seed is chosen here, not inside the engine, so the take records the number that made it — and from the job,
  // so every attempt of this request asks for the same clip
  const seed = payload.seed ?? stableSeed(ctx.job.id, 'take');
  const info = ASPECT_INFO[p.aspect];
  const references: TakeReference[] = [];
  const work = await tmpDir('take-prep');
  const guides: NonNullable<Parameters<typeof generateVideo>[0]['guides']> = [];
  // the frames the cut will drop: the guide length the node REALLY keeps of the tail clip (validated below), never
  // the pack's planned constant on trust
  let trimStartFrames = pack.trimStartFrames;
  let guideRecord: GuideRecord | undefined;
  let soundtrack: Take['soundtrack'] | undefined;
  let soundtrackFile: string | undefined;
  let dialogueLineAssets: string[] | undefined;
  /** each recorded line's place in the joined soundtrack (seconds) and its recording; with the guide frame the
   *  soundtrack is anchored at, where the cut plays the authoritative line (soundtrack.lines[].anchoredFrom) */
  let joinedLines: Array<{ lineId: string; from: number; audioAssetId: string }> | undefined;
  let soundtrackGuideFrame: number | undefined;
  /** the checks of the lines recorded by THIS take (reused lines were checked when they were recorded) */
  const spokenChecks: Array<LineCheck | null> = [];
  /** each line's aligned words (seconds into its own recording), when the aligner answered */
  const alignedLines = new Map<string, Array<{ start: number; end: number }>>();

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
  // THE REFERENCE FILES ARE ON DISK (src/server/production/readiness.ts): every picture, opening/ending frame or tail
  // and reused recording the request will send — before any voice or video inference runs
  await step(ctx, 'executive-producer', `take-preflight: reference files of shot ${sh.number}`, async () => {
    const needs = referenceNeeds(pack, sh.dialogue.filter((d) => lineText(d) && storedLine(d)));
    const r = await referenceFilesReadiness(needs, (id) => { const a = byId(id); return a ? assetFile(a) : undefined; });
    await ctx.event(r.ok ? 'info' : 'error', `reference files: ${r.detail}`, { missing: r.missing });
    if (!r.ok) throw Object.assign(new StudioError('INVALID', `Shot ${sh.number} cannot be filmed: ${r.detail}. Restore the files (docs/OPERATIONS-BACKUP.md) or choose other references.`, { missing: r.missing }), { failureClass: 'MISSING_REFERENCE', retryable: false });
  });
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
        const dur = have.durationSeconds ?? d.durationSeconds ?? (await ctx.tool('media.probe', () => ffprobe(assetFile(have)), { input: { file: assetFile(have) } })).durationSeconds ?? 2;
        spoken.push({ file: assetFile(have), durationSeconds: dur, lineId: d.id, assetId: have.id, check: (have.provenance?.check as LineCheck | null | undefined) ?? null, reused: true });
        const kept = (have.provenance?.alignment as { words?: Array<{ start: number; end: number }> } | undefined)?.words;
        if (kept?.length) alignedLines.set(d.id, kept);
        continue;
      }
      const ref = voices.get(d.characterId)!;
      const line = await speakLine(ctx, c, text, ref, work, { delivery: d.delivery });
      const check = await verifyLine(ctx, line.file, text, line.language);
      // THE FIRST-ATTEMPT RULE: a line that fails its check is kept and flagged for the producer — never spoken again
      // behind their back (this was a hidden "regenerate once", removed 2026-10-07 as DIALOGUE_AUDIO's was in Phase 1)
      if (isFailedCheck(check)) await ctx.event('warn', `line failed the gate (${check!.reasons.join('; ')}): kept and flagged for review`, { lineId: d.id, heard: check!.heard, coverage: check!.coverage, cer: check!.cer });
      // a line recording is committed on its own (it is kept even if the take fails); its id is this attempt's, and a
      // crash before its commit leaves a file of this job the next attempt's GC removes
      const { id, stored: st } = await out.adopt(`line:${d.id}:a${ctx.job.attempts}`, line.file, { expectKind: 'AUDIO' });
      const durationSeconds = st.probe?.durationSeconds ?? line.durationSeconds ?? 2;
      // WORD TIMING OF THE AUTHORITATIVE LINE (forced alignment of the script, qa-service /align; directive §7 step 6):
      // kept on the recording; an offline aligner is recorded as such, never guessed
      const alignment = await lineAlignment(st.absPath, text, line.language === 'AR' ? 'ar' : 'en');
      alignedLines.set(d.id, alignment.words);
      await commands([
        { name: 'addAsset', args: [assetFromStored(id, st, { label: `${p.title} ${sh.number} — ${c.name}: “${text.slice(0, 32)}”`, tags: ['dialogue', 'voice'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, characterId: c.id, shotId: sh.id, lineId: d.id, voiceRevision: c.voice.identity?.revision, check, alignment } })] },
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
      seconds = Math.min(15, Math.max(1, Math.min(Math.max(planned, need), need + 2)));
      if (seconds !== planned) await ctx.event('info', `shot length set to its dialogue: ${planned} s planned → ${seconds} s`, { dialogueSeconds: Number(joined.durationSeconds.toFixed(2)) });
      soundtrackFile = joined.file;
      // an earlier take of this shot joined the same recordings in the same order: its soundtrack is this one
      const lineAssets = spoken.map((s) => s.assetId);
      const prior = sh.takes.map((t) => t.soundtrack).find((st) => { if (!st || st.kind !== 'DIALOGUE' || !st.assetId) return false; const a = byId(st.assetId); const was = a?.provenance?.lineAssets as string[] | undefined; return Boolean(a && !a.unavailable && was && was.length === lineAssets.length && was.every((x, i) => x === lineAssets[i])); });
      soundtrack = { kind: 'DIALOGUE', assetId: prior?.assetId, lines: spoken.map((s, i) => ({ lineId: s.lineId, from: joined.windows[i].from, to: joined.windows[i].to })) };
      joinedLines = spoken.map((s, i) => ({ lineId: s.lineId, from: joined.windows[i].from, audioAssetId: s.assetId }));
      dialogueLineAssets = lineAssets;
      await ctx.event('info', `dialogue ${spoken.every((s) => s.reused) ? 'reused' : spoken.some((s) => s.reused) ? 'partly reused' : 'recorded'} as the shot's soundtrack${prior ? ' (joined track reused too)' : ''}`, { seconds: joined.durationSeconds, lines: spoken.map((s) => ({ lineId: s.lineId, assetId: s.assetId, reused: s.reused, durationSeconds: s.durationSeconds, coverage: s.check?.coverage, wer: s.check?.wer, heard: s.check?.heard })) });
    }
  }
  // 2) A music video shot anchors its stretch of the song: the take's soundtrack IS the song, so the performer's
  //    mouth follows the real vocal and the cut carries one copy of the music. The hosted API cannot anchor it. The
  //    stretch is the shot's window on the song as the cut will play it (the production audio timeline: the song is
  //    the clock), and the take is made exactly that long, so nothing drifts between the take and the cut.
  const songWin = songAsset ? songWindowFrames(p).windows.get(sh.id) : undefined;
  const window = songWin ? { from: songWin.fromFrame / CLOCK_FPS, to: songWin.toFrame / CLOCK_FPS } : undefined;
  if (window && payload.durationSeconds === undefined) seconds = Math.min(15, Math.max(1, window.to - window.from));
  if (backend === 'local' && songAsset && songAsset.kind === 'AUDIO' && window && window.to > window.from && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') {
    soundtrackFile = await trimAudio(assetFile(songAsset), path.join(work, `${sh.id}-song.wav`), window.from, Math.min(window.to, window.from + seconds));
    soundtrack = { kind: 'SONG', assetId: songAsset.id, lines: [] };
  }
  const songReference = soundtrack?.kind === 'SONG' && songAsset && window ? { kind: 'AUDIO' as const, assetId: songAsset.id, note: `song ${window.from.toFixed(2)}–${Math.min(window.to, window.from + seconds).toFixed(2)} s` } : undefined;
  // 3) WHAT THE CLIP STARTS FROM, by relation. CONTINUATION: the previous take's last frames AND their sound anchored
  //    at frame 0 in one guide (the template's continuation idiom), dropped again in the cut — under a song master the
  //    sound of those frames is the song's, since that is what the audience hears there. Hosted: the previous take's
  //    last frame becomes the first frame. CUT / STORY_TRANSITION: the drawn opening frame (below).
  let continuesTakeId: string | undefined;
  let hostedFirstFrame: { file: string; mime: string } | undefined;
  /** the relation the take is really generated for (a continuation over budget becomes a cut) */
  let relation = pack.relation;
  let lowering = pack.lowering;
  let tailFile: string | undefined;
  // the guide is what the audience sees last of the previous shot: its window's end on the production audio timeline
  // (a take may run past the frames the cut shows), not the take's own last frames
  const prevEnd = (opening: { shotId: string; takeId: string; assetId: string }) => {
    const ps = p.shots.find((x) => x.id === opening.shotId); const pt = ps?.takes.find((x) => x.id === opening.takeId);
    const a = byId(opening.assetId);
    return ps && pt ? { endFrame: windowEndSourceFrame(p, ps, pt, a), totalFrames: Math.round((pt.durationSeconds ?? a?.durationSeconds ?? 0) * CLOCK_FPS) } : undefined;
  };
  // the colour join (src/server/media/continuity-qa.ts colourJoin): against the end of the chosen take of the shot before,
  // in the same scene, on a continuation or a cut (a transition is meant to change the light)
  const colourAgainst = (prev: { shotId: string; takeId?: string; assetId?: string; sameScene: boolean } | undefined, rel: typeof relation) => {
    const a = prev?.sameScene && prev.takeId && prev.assetId && rel !== 'STORY_TRANSITION' ? byId(prev.assetId) : undefined;
    return a && a.kind === 'VIDEO' && !a.unavailable && !a.sample ? { previousFile: assetFile(a), previousEndFrame: prevEnd({ shotId: prev!.shotId, takeId: prev!.takeId!, assetId: a.id })?.endFrame, relation: rel === 'CONTINUATION' ? 'CONTINUATION' as const : 'CUT' as const } : undefined;
  };
  if (pack.opening.kind === 'TAIL') {
    const prevAsset = byId(pack.opening.assetId)!;
    const end = prevEnd(pack.opening);
    const cutShort = end && end.totalFrames && end.endFrame < end.totalFrames ? end.endFrame : undefined;
    const tail = await tailClip(assetFile(prevAsset), path.join(work, 'tail.mp4'), pack.opening.frames, ...(cutShort ? [CLOCK_FPS, cutShort] as const : []));
    const songTail = soundtrack?.kind === 'SONG' && songAsset && window ? await trimAudio(assetFile(songAsset), path.join(work, 'tail-song.wav'), Math.max(0, window.from - pack.opening.frames / H3_FPS), window.from) : undefined;
    // THE GUIDE IS VALIDATED BEFORE THE ENGINE IS TOUCHED (gap V1): the clip is counted, and a count the node would
    // silently floor (a short tail → 5 frames while the cut still dropped 22) is a WRONG_PARAMETERS refusal, not a take
    const verdict = validateGuideClip(tail, { frames: pack.opening.frames, withAudio: pack.opening.withAudio && !songTail });
    await ctx.event(verdict.ok ? 'info' : 'error', `continuation guide: ${tail.frames} frame(s) counted${tail.hasAudio ? `, ${(tail.audioSeconds ?? 0).toFixed(3)} s of sound` : ', no sound'}; the node keeps ${verdict.frames} (${verdict.audioLatentSteps} audio latent steps)${verdict.ok ? '' : `; REFUSED: ${verdict.problems.join('; ')}`}`, { guide: { ...tail, file: undefined }, verdict });
    if (!verdict.ok) throw Object.assign(new StudioError('INVALID', `The continuation guide for shot ${sh.number} is unusable: ${verdict.problems.join('; ')}`, { guide: { frames: tail.frames, audioSeconds: tail.audioSeconds, hasAudio: tail.hasAudio }, verdict }), { failureClass: 'WRONG_PARAMETERS' });
    trimStartFrames = verdict.frames;
    tailFile = tail.file;
    guideRecord = { frames: verdict.frames, sourceFrames: tail.frames, withAudio: Boolean(songTail || pack.opening.withAudio), audioSeconds: tail.audioSeconds, audioLatentSteps: verdict.audioLatentSteps, sourceEndFrame: tail.sourceEndFrame, settings: { engine: pack.continuation.engine, guideFrames: pack.continuation.guideFrames, guideAudio: pack.continuation.guideAudio, source: pack.continuation.source } };
    // THE FRAME BUDGET (G11): the words set the length (sound first), and a continuation carries at most 362 − guide
    // new frames. Over budget the take is a HARD CUT without its guide rather than a truncated continuation: the
    // planned content is never lost silently, and the take says why it is a cut
    const budget = frameBudget(verdict.frames, seconds);
    if (!budget.fits) {
      await ctx.event('warn', `shot ${sh.number} needs ${budget.neededFrames} new frames but a continuation carries at most ${budget.budgetFrames} after its ${verdict.frames}-frame guide: generated as a hard cut without the guide (never truncated)`, { budget });
      relation = 'CUT'; trimStartFrames = 0; tailFile = undefined;
      lowering = `frame budget: ${budget.neededFrames} new frames needed, ${budget.budgetFrames} fit after a ${verdict.frames}-frame guide — a hard cut without the guide, never a truncated continuation`;
      guideRecord = { ...guideRecord, join: 'HARD', why: lowering };
      references.push({ kind: 'VIDEO', assetId: prevAsset.id, note: `continuation guide NOT anchored: ${lowering}` });
    } else {
      guides.push(songTail ? { frameIdx: 0, imageFile: tail.file, imageIsVideo: true, audioFile: songTail } : { frameIdx: 0, imageFile: tail.file, imageIsVideo: true, audioFromVideo: pack.opening.withAudio });
      references.push({ kind: 'VIDEO', assetId: prevAsset.id, binding: 'guide@0', note: `continuation guide: the last ${verdict.frames} frames the cut shows of the previous take${cutShort ? ` (ending at its frame ${cutShort})` : ''} with ${songTail ? 'the song under them' : pack.opening.withAudio ? 'their own sound' : 'no sound (the previous take speaks there and this shot has no lines)'}` });
    }
    continuesTakeId = pack.opening.takeId;
  } else if (pack.opening.kind === 'LAST_FRAME_AS_FIRST') {
    const prevAsset = byId(pack.opening.assetId)!;
    const end = prevEnd(pack.opening);
    const cutShort = end && end.totalFrames && end.endFrame < end.totalFrames ? end.endFrame : undefined;
    hostedFirstFrame = { file: cutShort ? await frameAt(assetFile(prevAsset), path.join(work, 'last-frame.png'), cutShort - 1) : await closingFrame(assetFile(prevAsset), path.join(work, 'last-frame.png')), mime: 'image/png' };
    continuesTakeId = pack.opening.takeId;
    references.push({ kind: 'FIRST_FRAME', assetId: prevAsset.id, binding: 'first_frame', note: 'hosted continuation: the previous take’s last frame' });
  }
  if (songReference) references.push({ ...songReference, binding: `guide@${trimStartFrames}` });
  // the clip: the new content plus the guide frames (the length the node keeps), snapped up to the engine's grid and
  // held in its trained range
  const clip = clipSecondsFor({ trimStartFrames }, seconds);
  if (clip.truncated) throw Object.assign(new StudioError('INVALID', `Shot ${sh.number} needs ${Math.round(seconds * H3_FPS)} frames; the engine makes at most ${clip.newFrames} after a ${trimStartFrames}-frame guide.`), { failureClass: 'WRONG_PARAMETERS' });
  // THE SILENCE AFTER THE LAST LINE IS AUTHORITATIVE TOO (root cause of "Thank you. Thank you.", acceptance 2026-10-05
  // shot 1.3): local H3 never makes fewer than 124 frames, so a short line's soundtrack ended seconds before the clip
  // did, and H3 filled the unguided rest with more speech. The dialogue guide now runs to the clip's last frame, the
  // frames after the lines anchored to silence (H3 follows the anchored sound word by word: acceptance 2026-10-06).
  let guideSilence: { padSeconds: number; guideSeconds: number } | undefined;
  if (soundtrackFile) {
    let guideAudio = soundtrackFile;
    if (soundtrack?.kind === 'DIALOGUE') {
      const guideSeconds = (clip.frames - trimStartFrames) / H3_FPS;
      const have = (await ffprobe(soundtrackFile)).durationSeconds ?? 0;
      if (guideSeconds - have > 0.05) { guideAudio = await padAudio(soundtrackFile, path.join(work, 'dialogue-guide.wav'), guideSeconds); guideSilence = { padSeconds: Number((guideSeconds - have).toFixed(3)), guideSeconds: Number(guideSeconds.toFixed(3)) }; }
    }
    guides.push({ frameIdx: trimStartFrames, audioFile: guideAudio }); soundtrackGuideFrame = trimStartFrames;
    if (guideSilence) await ctx.event('info', `the dialogue guide runs to the clip's end: ${guideSilence.padSeconds} s of silence after the last line are anchored (nobody speaks there)`, guideSilence);
  }

  // IDENTITY HAND-OFF (the Character Continuity Agent's step) — the primary image of each character in the shot (the
  // canonical front full-body image, else a legacy portrait), every character the picture budget holds, in the shot's
  // order; a bundled sample or an SVG is never an identity reference
  const identity = sh.characterIds.length
    ? await step(ctx, 'character-continuity', `identity-handoff: shot ${sh.number}`, async () => {
      if (pack.unreferenced.length) await ctx.event('warn', `${pack.unreferenced.length} character(s) without an identity reference`, { unreferenced: pack.unreferenced });
      return pack.subjects.map((s) => ({ ...s, asset: byId(s.assetId)! }));
    })
    : [];
  // REFERENCE SELECTION (the Reference Conditioning Agent's step)
  // 4) PICTURES, by graph. Ref2VA (every shot with a character or a place): the characters' canonical images and the
  //    plate as bound pictures, the drawn opening frame anchored at 0 (and bound as a picture), the ending frame at −1.
  //    FL2VA (reference-free shots): the opening and ending frame as first/last frame. Hosted: reference mode (pictures,
  //    no frames) or frame mode (first/last frame, no pictures) — never both.
  // 5) VOICE TIMBRE for shots that still speak natively (no soundtrack): the chosen voice sample as audio reference,
  //    bound to its speaker in the prompt
  const { firstFrame, lastFrame, referenceImages, referenceAudio, audioRefs } = await step(ctx, 'reference-conditioning', `reference-selection: shot ${sh.number}`, async () => {
    const file = (id: string) => { const a = byId(id)!; return { file: assetFile(a), mime: a.mimeType ?? 'image/png' }; };
    const refsMode = pack.graph === 'REF2VA' || pack.graph === 'REFERENCE';
    const referenceImages: Array<{ file: string; mime: string }> = [];
    if (refsMode) {
      for (const pic of pack.pictures) {
        referenceImages.push(file(pic.assetId));
        if (pic.role === 'SUBJECT') references.push({ kind: 'CHARACTER', assetId: pic.assetId, characterId: pic.characterId, binding: pic.binding, note: identity.find((s) => s.characterId === pic.characterId)?.source === 'PORTRAIT' ? 'legacy portrait' : `canonical image${identity.find((s) => s.characterId === pic.characterId)?.approved ? '' : ' (draft)'}` });
        else if (pic.role === 'LOCATION') references.push({ kind: 'LOCATION', assetId: pic.assetId, locationId: pic.locationId, binding: pic.binding, note: world.read.location?.assetId === pic.assetId ? `${world.read.location.why} (World Bible revision ${world.read.revisionNumber})` : `${pack.location?.role === 'STATE' ? `plate for ${scene?.timeOfDay?.toLowerCase().replace('_', ' ') ?? 'the time of day'}` : 'master plate'}` });
        else if (pic.role === 'FACE_REFERENCE') references.push({ kind: 'CHARACTER', assetId: pic.assetId, characterId: pic.characterId, binding: pic.binding, note: `derived face reference (a crop of the canonical image; ${pack.faceReferences.find((f) => f.characterId === pic.characterId)?.reason ?? ''})` });
        else references.push({ kind: 'FIRST_FRAME', assetId: pic.assetId, binding: pic.binding, note: 'the drawn opening frame, bound as a picture (a production asset, not an identity)' });
      }
    }
    let firstFrame: { file: string; mime: string } | undefined;
    let lastFrame: { file: string; mime: string } | undefined;
    if (pack.graph === 'REF2VA' || pack.graph === 'FL2VA' || pack.graph === 'FRAMES') {
      if (hostedFirstFrame) firstFrame = hostedFirstFrame;
      else if (pack.opening.kind === 'FRAME') { firstFrame = file(pack.opening.assetId); references.push({ kind: 'FIRST_FRAME', assetId: pack.opening.assetId, binding: pack.graph === 'REF2VA' ? 'guide@0' : 'first_frame' }); }
      if (pack.ending) { lastFrame = file(pack.ending.assetId); references.push({ kind: 'LAST_FRAME', assetId: pack.ending.assetId, binding: pack.graph === 'REF2VA' ? 'guide@-1' : 'last_frame' }); }
    }
    const referenceAudio: Array<{ file: string }> = [];
    const audioRefs: Array<{ characterId: string }> = [];
    if (!soundtrackFile && refsMode && referenceImages.length > 0) {
      for (const cid of speakers.filter((id) => pack.subjects.some((s) => s.characterId === id)).slice(0, 3)) {
        const v = voices.get(cid);
        if (v) { referenceAudio.push({ file: v.file }); audioRefs.push({ characterId: cid }); references.push({ kind: 'AUDIO', assetId: v.asset.id, characterId: cid, note: 'voice timbre', binding: pack.backend === 'local' ? `<Audio ${audioRefs.length}>` : `Audio ${audioRefs.length}` }); }
      }
    }
    return { firstFrame, lastFrame, referenceImages, referenceAudio, audioRefs };
  });
  // THE PROMPT: the reference grammar on a reference graph (every picture bound to whom or what it shows), the plain
  // description on a first-frame or text graph; a producer's own prompt is kept, wrapped in the bindings when it
  // names no picture itself. Linted before anything is sent.
  const refsGraph = pack.graph === 'REF2VA' || pack.graph === 'REFERENCE';
  const custom = payload.prompt?.trim();
  const tailAnchored = relation === 'CONTINUATION' && pack.opening.kind === 'TAIL';
  const binding = { ...bindingOf(pack, audioRefs), ...(tailAnchored ? {} : pack.opening.kind === 'TAIL' ? { opening: undefined } : {}) };
  const draftPrompt = refsGraph
    ? (custom && /<Picture \d+>|\bImage \d+\b/.test(custom) ? custom : h3ReferencePrompt(p, sh, cast, loc, scene, binding, { relation, locations: places, sceneState: pack.sceneState, context: pack.context, ...(custom ? { body: custom, includeDialogue: false } : {}) }))
    : (custom || [tailAnchored ? `The shot continues the previous shot without a cut: its first ${(trimStartFrames / H3_FPS).toFixed(1)} seconds are the end of the previous shot, then the action carries on.` : '', takePrompt(p, sh, cast, loc, scene, { sceneState: pack.sceneState, context: pack.context })].filter(Boolean).join(' '));
  // the last name pass: nobody is named outside the spoken lines (bound subject on a reference graph, else described)
  const subjectOfPack = (id: string) => { const i = refsGraph ? pack.subjects.findIndex((x) => x.characterId === id) : -1; return i >= 0 ? `<Subject ${i + 1}>` : undefined; };
  const named = bindNamesOutsideDialogue(draftPrompt, cast, subjectOfPack);
  const prompt = named.prompt;
  if (named.replaced.length) await ctx.event('info', `names bound in the prompt: ${named.replaced.join(', ')}`, { replaced: named.replaced });
  const lint = lintH3Prompt(prompt, { labels: binding.labels, pictures: refsGraph ? referenceImages.length : 0, audios: refsGraph ? referenceAudio.length : 0, lines: custom || p.kind === 'MUSIC_VIDEO' ? [] : sh.dialogue.map(lineText).filter(Boolean), names: cast.map((c) => c.name) });
  if (!lint.ok) {
    const failed = lint.checks.filter((c) => !c.ok && c.hard);
    throw new StudioError('INVALID', `The prompt for shot ${sh.number} failed its lint: ${failed.map((c) => `${c.rule}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`, { failureClass: 'PROMPT_AMBIGUITY', lint: lint.checks });
  }
  const softLint = lint.checks.filter((c) => !c.ok && !c.hard);
  if (softLint.length) await ctx.event('warn', `prompt lint: ${softLint.map((c) => c.detail ?? c.rule).join('; ')}`, { lint: softLint });
  // THE IDENTITY RE-APPLICATION RULE (src/server/production/identity-rule.ts): the request really carries each
  // present character's canonical image and the place's plate — connected in order and bound in the prompt — or it
  // is refused here, before the engine, as MISSING_REFERENCE (an IdentityConditioningError, the rule named)
  const identityRule = await step(ctx, 'character-continuity', `identity-rule: shot ${sh.number}`, async () => {
    const report = assertIdentityConditioning(pack, sh, cast, loc, { referenceImages, prompt, fileOf: (id) => { const a = byId(id); return a ? assetFile(a) : undefined; } });
    await ctx.event(report.lowered ? 'warn' : 'info', report.lowered ? `identity rule waived: ${report.lowered}` : `identity rule: ${report.characters.length} character(s) and ${report.location ? 'the plate' : 'no place'} conditioned on and bound`, { report });
    return report;
  });
  await ctx.event('info', 'take request prepared', { backend, relation, plannedRelation: pack.plannedRelation, graph: pack.graph, seconds: clip.seconds, frames: clip.frames, newSeconds: seconds, soundtrack: soundtrack?.kind, continuation: tailAnchored || pack.opening.kind === 'LAST_FRAME_AS_FIRST', continuesTakeId, lowering, guide: guideRecord, prompt: prompt.slice(0, 800), references });

  const t0 = Date.now();
  let lastStatus = '';
  // the local engine runs under the GPU lease (one model family on the card at a time; other services unload
  // first); the hosted API needs no card and runs in the hosted lane's concurrency. The estimate is H3's measured peak;
  // it also needs ≈ 46.5 GiB of the Docker VM's host RAM while staging, in either quality tier (gpu/estimates.ts
  // VIDEO_H3_HOST_RAM_MB); the final tier holds the card about 3.2× as long as the draft (MODEL-EVAL §8.4)
  const run = <T>(fn: () => Promise<T>) => (backend === 'local' ? ctx.gpu('VIDEO', VIDEO_H3_VRAM_MB, fn, { jobId: ctx.job.id }) : fn());
  // the request as the contract sees it (the callbacks below are the job's own plumbing)
  const request = {
    prompt, seconds: clip.seconds, width: info.width, height: info.height, aspect: p.aspect, firstFrame, lastFrame, referenceImages: referenceImages.length ? referenceImages : undefined, referenceAudio: referenceAudio.length ? referenceAudio : undefined, guides: guides.length ? guides : undefined,
    lowering,
    seed, model: payload.model, resolution: payload.resolution,
    quality: takeQuality(payload.quality, backend).quality,
    resumeTaskId: ctx.job.providerTaskId ?? undefined,
  };
  const result = await run(() => ctx.tool('video.minimax_generate', () => generateVideo({
    ...request,
    // the local engine's id is its ComfyUI prompt: "MiniMax task … created" read as the hosted API (2026-10-08)
    onTaskCreated: async (id) => { await ctx.progress('GENERATING', { phase: 'generating', message: backend === 'api' ? `MiniMax task ${id} created` : `local MiniMax H3: queued (prompt ${id.slice(0, 8)})`, providerStatus: 'queued', percent: null }, { providerTaskId: id }); },
    onStatus: async (s) => { if (s.status !== lastStatus) { lastStatus = s.status; await ctx.progress(s.status === 'downloading' ? 'DOWNLOADING' : 'GENERATING', { phase: s.status, message: s.queue ? `waiting behind ${s.queue} in the GPU queue` : backend === 'api' ? `MiniMax: ${s.status}` : `local MiniMax H3: ${s.status}`, providerStatus: s.status, percent: null }); } else await ctx.checkpoint(); },
    shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } },
  }), { label: backend, input: request }));
  // A RECOVERED RUN (acceptance 2026-10-05, open item 3: a recovered take said "made in 8 s"): when an earlier
  // attempt's engine run was adopted, the wall clock here measured only the wait after adoption. The take then carries
  // the engine's own execution time (ComfyUI's history), or no time at all — never the adoption wait.
  // `resumed` is the provider's own answer: a recorded task id that the engine no longer knew (ComfyUI restarted) or
  // whose output was rejected was submitted again — that run is not "adopted" and its wall clock is its real time
  const resumedRun = Boolean(result.resumed);
  const waitedMs = Date.now() - t0;
  const genMs = takeGenerationMs({ resumed: resumedRun, engineMs: result.engineMs, waitedMs });
  if (genMs !== undefined) await recordMetric('take.generation_ms', genMs, 'ms', { backend, seconds, ...(resumedRun ? { resumed: true } : {}) }, ctx.job.id);
  if (resumedRun) await ctx.event('info', `the engine run was adopted from an earlier attempt: ${result.engineMs ? `engine time ${(result.engineMs / 1000).toFixed(0)} s` : 'engine time unknown'}, waited ${(waitedMs / 1000).toFixed(0)} s after the restart`, { engineMs: result.engineMs, waitedMs });
  if (result.engineMs) await recordMetric('take.engine_ms', result.engineMs, 'ms', { backend, seconds }, ctx.job.id);

  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the clip' });
  // DOES THE HEAD REPEAT THE TAIL? (the Visual Quality Inspector's step; gap V2.) The trim was an assumption until
  // now: the take's first frames are measured against the tail clip. A close re-render keeps the trim (moved by a
  // frame when the tail's last frame landed early or late); a head that does not repeat the tail is kept untrimmed
  // and the take joins by a HARD cut, the numbers recorded on it — nothing new is ever dropped on trust.
  const headChecks: QaCheck[] = [];
  if (guideRecord && tailFile && tailAnchored) {
    const g = guideRecord.frames;
    try {
      const m = await step(ctx, 'visual-quality-inspector', `guide-head-check: shot ${sh.number}`, () => measureGuideHead(result.file, tailFile!, g));
      guideRecord = { ...guideRecord, head: guideHeadRecord(m), join: m.repeats ? 'TRIM' : 'HARD', why: m.repeats && !m.corrected ? undefined : m.detail };
      trimStartFrames = m.trimStartFrames;
      headChecks.push({ name: 'guide-head-repeats-tail', ok: true, value: m.meanDiff, threshold: m.threshold, detail: `${m.detail}${m.repeats ? '' : ' (join: HARD; the take is not rejected)'}` });
      await ctx.event(m.repeats ? 'info' : 'warn', `shot ${sh.number}: ${m.detail}`, { head: guideRecord.head, trimStartFrames });
    } catch (e) {
      // the head could not be measured: the planned trim stands, and the take says the check did not run
      headChecks.push({ name: 'guide-head-repeats-tail', ok: true, detail: `not measured (${(e as Error).message.split('\n')[0]}); the planned ${g}-frame trim stands` });
      guideRecord = { ...guideRecord, join: 'TRIM', why: `head not measured: ${(e as Error).message.split('\n')[0]}` };
      await ctx.event('warn', `shot ${sh.number}: the guide head could not be measured; the planned trim stands`, { error: (e as Error).message });
    }
  }
  // PICTURE CHECK (the Visual Quality Inspector's step). MiniMax H3 always renders a soundtrack; a shot with no lines
  // may legitimately be near-silent
  // the length asked for is the clip the engine really makes: the local frames snapped up (≥ 124), the hosted 4–15 s
  const expectSeconds = backend === 'local' ? clip.frames / H3_FPS : Math.min(15, Math.max(4, Math.round(clip.seconds)));
  const qa = { file: result.file, expect: { durationSeconds: expectSeconds, width: Math.round(info.width * 0.5), height: Math.round(info.height * 0.5), expectAudio: true, speechExpected: sh.dialogue.length > 0 || soundtrack?.kind === 'SONG' } };
  const { report, probe } = await step(ctx, 'visual-quality-inspector', `picture-check: shot ${sh.number}`, (tool) => tool('media.qa_take', () => qaTake(qa.file, qa.expect), { input: qa }));
  report.checks.push(...headChecks);
  const pictureChecks = report.checks.map((c) => ({ ...c }));
  // where each line was anchored (the authoritative recording, placed at the first new frame): the timing check's expectation
  const plannedLines = soundtrack?.kind === 'DIALOGUE' ? soundtrack.lines.map((l) => ({ lineId: l.lineId, expectedFrom: trimStartFrames / H3_FPS + l.from, recordedSeconds: l.to - l.from })) : [];
  await ctx.checkpoint();
  let scriptCheck: { ok: boolean; coverage?: number; wer?: number; cer?: number; heard?: string; detail?: string } | undefined;
  let takeUnverified = false;
  // MiniMax H3 always renders its own speech (an anchored audio guide is context, not a pinned soundtrack — see
  // docs/AUDIOVISUAL-QA.md, E1), so a speaking take is proven by listening back: the clip is transcribed, compared
  // with the script, and each line is placed where it is actually spoken. A take that does not say its lines fails.
  if (sh.dialogue.length && backend === 'local' && p.kind !== 'MUSIC_VIDEO') {
    try {
      // SPEECH CHECK (the Audio Synchronization Inspector's step): the clip's sound is transcribed, compared with the
      // script, and each line is placed where it is actually spoken. A continuation's head repeats the previous shot
      // (its words are that shot's, and the cut drops them): it is not heard back, and the windows found are moved
      // back onto the take's own clock
      const head = trimStartFrames / H3_FPS;
      const heard = await step(ctx, 'audio-sync-inspector', `take-speech-check: shot ${sh.number}`, async (tool) => {
        const wav = path.join(work, 'take-audio.wav');
        await ffmpeg(speechAudioArgs(result.file, wav, head));
        const lines = sh.dialogue.map((d) => ({ en: d.text, ar: d.textAr || d.text }));
        const expected = lines.map((l) => (p.language === 'AR' ? l.ar : l.en)).join(' ');
        // the verification language follows the script of the lines (routing parity), not the production's setting
        const heardIn = lineLanguage(expected, p.language);
        const asr = { file: wav, language: heardIn === 'AR' ? ('ar' as const) : ('en' as const) };
        const t = await ctx.gpu('ASR', 4000, () => tool('speech.transcribe', () => transcribe(asr.file, { language: asr.language }), { label: 'take audio', input: asr }), { jobId: ctx.job.id });
        // the contract's gate for a take (§1.4): coverage ≥ 0.7 of the script, in order (a repeated phrase is not a
        // missing line), AND CER ≤ 0.15 after the dialect fold; WER is reported. The report carries all three.
        const judged = judgeHeard(expected, t.text, heardIn, 'take');
        const words = t.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
        const clipSeconds = probe.durationSeconds ?? expectSeconds;
        const heardSeconds = Math.max(0.1, clipSeconds - head);
        const placed = alignLyrics([{ id: 'take', kind: 'VERSE', from: 0, to: heardSeconds, singerIds: [], text: lines.map((l) => l.en).join('\n'), textAr: lines.map((l) => l.ar).join('\n') }], words, heardIn).map((w) => ({ ...w, from: w.from + head, to: w.to + head }));
        return { text: t.text, judged, clipSeconds, placed };
      });
      const { judged, clipSeconds, placed } = heard;
      const { wer, coverage, cer } = judged;
      report.checks.push({ name: 'script-spoken', ok: judged.ok, value: Number(coverage.toFixed(2)), threshold: TAKE_COVERAGE, detail: `heard: ${heard.text.slice(0, 160)} (CER ${cer.toFixed(2)}, WER ${wer.toFixed(2)})${judged.reasons.length ? `; ${judged.reasons.join('; ')}` : ''}` });
      scriptCheck = { ok: judged.ok, coverage: Number(coverage.toFixed(2)), wer: Number(wer.toFixed(2)), cer: Number(cer.toFixed(2)), heard: heard.text.slice(0, 200) };
      if (!judged.ok) report.ok = false;
      soundtrack = { kind: 'DIALOGUE', assetId: soundtrack?.assetId, lines: sh.dialogue.map((d, i) => { const w = placed[i]; return { lineId: d.id, from: w?.from ?? head, to: w?.to ?? clipSeconds }; }) };
      await ctx.event('info', 'lines placed on the take', { wer: Number(wer.toFixed(2)), heard: heard.text.slice(0, 200), lines: placed.map((w) => ({ from: Number(w.from.toFixed(2)), to: Number(w.to.toFixed(2)), method: w.method, confidence: w.confidence })) });
    } catch (e) {
      // the take could not be heard back: it is not passed on trust. The picture checks stand (the take stays
      // READY, so nobody regenerates it blindly), but the script check is recorded as not passed, the take is not
      // chosen for the cut, the inspector's decision is REVIEW and the job awaits a human ear.
      report.checks.push({ name: 'script-spoken', ok: false, detail: `not verified (transcription unavailable): ${(e as Error).message}` });
      scriptCheck = { ok: false, detail: `not verified: ${(e as Error).message}` };
      takeUnverified = true;
    }
  }
  // PEOPLE ON SCREEN (the Visual Quality Inspector's step, D33): the new frames sampled every half second and counted
  // by the vision model; anyone extra at any moment — a stranger, a duplicated character — fails the take
  const expectedPeople = peopleExpected(sh, sh.characterIds.filter((id) => pack.subjects.some((s) => s.characterId === id) || pack.unreferenced.some((u) => u.characterId === id)));
  if (expectedPeople !== undefined && backend === 'local' && await canCountPeople()) {
    try {
      const samples = await step(ctx, 'visual-quality-inspector', `people-check: shot ${sh.number}`, (tool) => countPeopleOverTime(ctx, tool, 'image.describe_reference', result.file, { from: trimStartFrames / H3_FPS, to: probe.durationSeconds ?? expectSeconds, label: `${p.title} ${sh.number} — people on screen` }));
      const v = peopleVerdict(samples, expectedPeople);
      // a shot that features a photo or a reflection of someone: a surplus may be that picture — flagged, not rejected
      const pictured = showsPictureOfPeople(sh.action);
      const where = `${v.max} people at ${v.at.map((t) => `${t.toFixed(1)} s`).join(', ')} where the shot has ${expectedPeople}`;
      report.checks.push({ name: 'people-on-screen', ok: v.ok, value: v.max, threshold: `≤ ${expectedPeople}`, detail: v.ok ? `${samples.length} moments counted, never more than ${expectedPeople}` : pictured ? `${where} — the shot shows a picture or a reflection of someone: look before choosing (not rejected)` : where });
      if (!v.ok && !pictured) report.ok = false;
      if (!v.ok && pictured) await ctx.event('warn', `shot ${sh.number}: ${where}; the shot shows a picture or a reflection of someone — look before choosing this take`, { shotId: sh.id, at: v.at });
    } catch (e) {
      await ctx.event('warn', `shot ${sh.number}: the people on screen could not be counted (${(e as Error).message})`, { shotId: sh.id });
    }
  }
  // DRIFT CHECKS (the World Continuity step; src/server/media/plate-drift.ts) — measured facts on the take, never a
  // score: (1) the place in the take's first kept frame against the canonical plate it was conditioned on (provisional
  // threshold: a mismatch is REVIEW, the take is not rejected); (2) each present character's identity reference was
  // applied in the request that was sent (the identity rule's report on the request)
  const driftChecks: QaCheck[] = [];
  const applied = identityAppliedChecks(identityRule);
  driftChecks.push({ name: 'identity-references-applied', ok: applied.ok, value: applied.characters.filter((c) => c.applied).length, threshold: applied.characters.length, detail: applied.detail });
  let plateDrift: PlateDrift | undefined;
  let plateDriftNote: string | undefined;
  const comparable = plateComparable(sh.framing);
  if (pack.location && loc && !comparable.comparable) {
    plateDriftNote = `not comparable: ${comparable.why}`;
    driftChecks.push({ name: 'location-matches-plate', ok: true, detail: `${plateDriftNote}; the plate ${pack.location.assetId} was conditioned on` });
  } else if (pack.location && loc) {
    const plateAsset = byId(pack.location.assetId);
    try {
      plateDrift = await step(ctx, 'world-continuity', `drift-check: shot ${sh.number}`, () => measurePlateDrift(result.file, trimStartFrames, assetFile(plateAsset!), pack.location!.assetId));
      driftChecks.push({ name: 'location-matches-plate', ok: plateDrift.matches, value: plateDrift.meanDiff, threshold: plateDrift.threshold, detail: plateDrift.detail });
      if (!plateDrift.matches) await ctx.event('warn', `shot ${sh.number}: ${plateDrift.detail}`, { plateDrift });
    } catch (e) {
      plateDriftNote = `not measured (${(e as Error).message.split('\n')[0]})`;
      driftChecks.push({ name: 'location-matches-plate', ok: true, detail: `${plateDriftNote}; the plate ${pack.location.assetId} was conditioned on` });
    }
  } else if (pack.establishing) driftChecks.push({ name: 'location-matches-plate', ok: true, detail: `${pack.establishing.name} is established by this take: there is no earlier plate to compare with` });
  // LIP-SYNC AND IDENTITY (the ASR service's picture QA, src/server/providers/qa-service.ts; directive §7 steps 9-10,
  // §10): the mouths against the AUTHORITATIVE audio (the recorded lines, else the song stretch, placed where the take
  // was conditioned on them; else the take's own sound), and each pictured character's face against their canonical
  // image. Flags for REVIEW with their numbers; an offline service is recorded as "not measured", never as a pass.
  // The lag against the recorded lines is kept on the take: the cut repairs 2-6 frames by moving the sound
  // (src/domain/timeline.ts lipSyncShiftSamples), never the face.
  let lipSyncRecord: Record<string, unknown> | undefined;
  let identityRecord: Record<string, unknown> | undefined;
  if (backend === 'local') {
    const headSeconds = trimStartFrames / H3_FPS;
    const speaking = p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length > 0;
    const singing = p.kind === 'MUSIC_VIDEO' && soundtrack?.kind === 'SONG' && Boolean(soundtrackFile);
    if (speaking || singing) {
      try {
        const against: 'RECORDED' | 'SONG' | 'TAKE_AUDIO' = singing ? 'SONG' : soundtrackFile ? 'RECORDED' : 'TAKE_AUDIO';
        // word windows of the recorded lines, on the clip's clock (the soundtrack guide sits at the first new frame)
        const windows = against === 'RECORDED' && plannedLines.length ? plannedLines.flatMap((l) => { const ws = alignedLines.get(l.lineId); return ws?.length ? ws.map((w) => ({ start: l.expectedFrom + w.start, end: l.expectedFrom + w.end })) : [{ start: l.expectedFrom, end: l.expectedFrom + l.recordedSeconds }]; }) : undefined;
        const onScreen = singing && p.song ? shotPerformers(p.song, { from: songWindowFrames(p).windows.get(sh.id)!.fromFrame / CLOCK_FPS, to: songWindowFrames(p).windows.get(sh.id)!.toFrame / CLOCK_FPS }, sh.characterIds).lead.length : speakers.length;
        const measured = await step(ctx, 'audio-sync-inspector', `lip-sync-check: shot ${sh.number}`, () => mouthActivity(result.file, { ...(against !== 'TAKE_AUDIO' ? { audio: soundtrackFile!, audioOffset: headSeconds } : {}), windows, fps: H3_FPS, mode: singing ? 'singing' : 'speech', speakers: Math.max(1, onScreen) }));
        const j = judgeLipSync(measured);
        lipSyncRecord = { verdict: j.verdict, against, lagFrames: j.lagFrames, lagMs: j.lagMs, offsetRepair: j.offsetRepair, speakerTrack: j.speakerTrack, flags: j.flags, thresholds: 'START' };
        driftChecks.push({ name: singing ? 'singing-sync' : 'lip-sync', ok: j.verdict === 'PASS' || j.verdict === 'NOT_MEASURED', value: j.lagFrames ?? undefined, threshold: '|lag| ≤ 1 frame; 2–6 repaired by moving the sound', detail: `${j.verdict === 'NOT_MEASURED' ? '' : `${j.verdict.toLowerCase()} against the ${against === 'RECORDED' ? 'recorded lines' : against === 'SONG' ? 'song' : 'take’s own sound'}: `}${j.detail.join('; ') || 'in sync'}${j.offsetRepair && against === 'RECORDED' ? ' — the cut moves the line onto the mouths' : ''}` });
      } catch (e) {
        driftChecks.push({ name: singing ? 'singing-sync' : 'lip-sync', ok: true, detail: `not measured (${(e as Error).message.split('\n')[0]})` });
      }
    }
    // a person the shot shows from behind has no face to measure: scored anyway, the back of Marcus's head (and a stray
    // face found in the lens glass) "failed" at SFace 0.01 (2026-10-08, "The Last Crossing" 1.3)
    const away = new Set(facingAway(sh));
    const faces = pack.subjects.map((x) => ({ characterId: x.characterId, a: byId(x.assetId) })).filter((x) => x.a && !away.has(x.characterId));
    if (away.size) driftChecks.push({ name: 'identity-similarity-away', ok: true, detail: `not measured for ${away.size} ${away.size === 1 ? 'person' : 'people'} facing away from the camera` });
    if (faces.length) {
      try {
        const measured = await step(ctx, 'visual-quality-inspector', `identity-check: shot ${sh.number}`, () => faceIdentity(result.file, faces.map((x) => ({ characterId: x.characterId, image: assetFile(x.a!) }))));
        const j = judgeIdentity(measured);
        identityRecord = { verdict: j.verdict, characters: j.characters, thresholds: 'START' };
        driftChecks.push({ name: 'identity-similarity', ok: j.verdict === 'PASS' || j.verdict === 'NOT_MEASURED', detail: j.verdict === 'PASS' ? `${Object.keys(j.characters).length} face(s) match their canonical image` : j.detail.join('; ') });
      } catch (e) {
        driftChecks.push({ name: 'identity-similarity', ok: true, detail: `not measured (${(e as Error).message.split('\n')[0]})` });
      }
    }
  }
  // CONTINUITY QA WITHOUT A MODEL (src/server/media/continuity-qa.ts; cloud directive §10): accidental fades, repeated
  // frames, cuts the shot did not plan, speech repeated beyond the script, each line heard on time, a container the
  // cut can use. Flags for REVIEW with their numbers — never a rejection, never a silent regeneration
  if (backend === 'local') {
    const headSeconds = trimStartFrames / H3_FPS;
    const plannedCuts = (sh.staging?.beats ?? []).filter((b) => b.cut && b.at > 0).map((b) => headSeconds + b.at);
    try {
      const measured = await step(ctx, 'visual-quality-inspector', `continuity-check: shot ${sh.number}`, () => continuityChecks(result.file, { fps: H3_FPS, head: trimStartFrames, plannedCuts, script: p.kind === 'MUSIC_VIDEO' ? undefined : sh.dialogue.map(lineText).filter(Boolean), heard: scriptCheck?.heard, colour: colourAgainst(pack.context.shot.previous, relation) }));
      driftChecks.push(...measured);
    } catch (e) {
      driftChecks.push({ name: 'continuity-measured', ok: true, detail: `not measured (${(e as Error).message.split('\n')[0]})` });
    }
    if (plannedLines.length && soundtrack?.kind === 'DIALOGUE' && scriptCheck?.heard) driftChecks.push(judgeLineTiming(plannedLines, soundtrack.lines));
  }
  driftChecks.push(judgeContainer(probe, { fps: backend === 'local' ? H3_FPS : (probe.fps ?? H3_FPS), expectAudio: true }));
  report.checks.push(...driftChecks);
  // THE TAKE'S VERDICT (src/domain/take-checks.ts takeVerdict; QA Q6): a take that passed its gate but carries a failed
  // or flagged check is REVIEW — kept READY and choosable, recorded with its flags, and never chosen by the studio on
  // its own; `report.ok` keeps its meaning (the gate)
  const verdict = takeVerdict(report, { unverified: takeUnverified });
  const unverifiedLines = spokenChecks.filter((c) => c === null).length;
  const flaggedLines = spokenChecks.filter((c) => c && !c.ok).length;
  // the joined dialogue track is stored once per set of recordings: a take that joined the same stored lines as an
  // earlier one points at that track; a song stretch is derived from the song for this take. A new track is recorded
  // in the take's own commit below.
  const newAssets: Array<Omit<Asset, 'createdAt'>> = [];
  let soundtrackId: string | undefined;
  if (soundtrackFile) {
    soundtrackId = soundtrack?.kind === 'DIALOGUE' ? soundtrack.assetId : undefined;
    if (!soundtrackId) {
      const st = await out.adopt('soundtrack', soundtrackFile, { expectKind: 'AUDIO' });
      soundtrackId = st.id;
      newAssets.push(assetFromStored(st.id, st.stored, { label: `${p.title} ${sh.number} — soundtrack (${soundtrack!.kind.toLowerCase()})`, tags: ['soundtrack', soundtrack!.kind.toLowerCase()], origin: 'DERIVED', jobId: ctx.job.id, provenance: { shotId: sh.id, lines: soundtrack!.lines, lineAssets: dialogueLineAssets } }));
    }
    soundtrack = { ...soundtrack!, assetId: soundtrack!.assetId ?? soundtrackId };
  }
  // where each recording was anchored on the take's clock (the cut plays it there: src/domain/timeline.ts)
  if (soundtrack?.kind === 'DIALOGUE' && joinedLines && soundtrackGuideFrame !== undefined) soundtrack = { ...soundtrack, lines: soundtrack.lines.map((l) => { const j = joinedLines!.find((x) => x.lineId === l.lineId); return j ? { ...l, anchoredFrom: Number((soundtrackGuideFrame! / H3_FPS + j.from).toFixed(4)), audioAssetId: j.audioAssetId } : l; }) };
  await ctx.progress('POSTPROCESSING', { phase: 'postprocessing', message: 'Making it playable and drawing the poster frame' });
  const dir = await tmpDir('take');
  const playable = path.join(dir, 'take.mp4');
  await webReady(result.file, playable, probe);
  const poster = path.join(dir, 'poster.jpg');
  await thumbnail(playable, poster, { at: Math.min(0.5, (probe.durationSeconds ?? 1) / 4) });
  // "ESTABLISH HERE" (the World Continuity step; src/server/production/location-rule.ts): a take that passed its checks
  // in a place that had no plate — by the scene's own declaration — establishes the place: a quarter second after its
  // first kept frame (the opening of the shot, as an approved cut establishes it) becomes the place's master plate,
  // written in the take's commit, and an ESTABLISHED frame of the World Bible (below, after the commit)
  const extraAssets: Array<Omit<Asset, 'createdAt'>> = [];
  const extraCommands: CommandSpec[] = [];
  let established: { imageAssetId: string; frame: number } | undefined;
  if (pack.establishing && loc && scene && report.ok) {
    const frame = Math.max(trimStartFrames, Math.min(trimStartFrames + 6, clip.frames - 1));
    const png = await frameAt(playable, path.join(dir, 'established.png'), frame);
    const { id: plateId, stored: storedPlate } = await out.adopt('established-plate', png, { expectKind: 'IMAGE' });
    const label = `${loc.name} — established in “${p.title}”, scene ${scene.number} shot ${sh.number} (${sh.framing.toLowerCase().replace(/_/g, ' ')})`;
    extraAssets.push(assetFromStored(plateId, storedPlate, { label, tags: ['location', 'established'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { takeId: takeIdOf(ctx.job.id), shotId: sh.id, frame, productionId: p.id, locationId: loc.id, view: 'ESTABLISHED', establishedHere: true, identityVersion: pack.establishing.identity.version } }));
    extraCommands.push({ name: 'addLocationRefs', args: [loc.id, [{ id: outputId(ctx.job.id, 'established-plate-ref', 'ref'), role: 'MASTER', assetId: plateId, label, timeOfDay: scene.timeOfDay }]] });
    established = { imageAssetId: plateId, frame };
    await ctx.event('info', `${loc.name} is established by this take: frame ${frame} becomes its master plate (${plateId})`, { locationId: loc.id, assetId: plateId, frame });
  } else if (pack.establishing && !report.ok) await ctx.event('warn', `${pack.establishing.name} is not established by this take: it failed its checks; the next accepted take establishes it`, { locationId: pack.establishing.locationId });

  // files into the library (named for this job and attempt), then every record in ONE commit
  const { id: posterId, stored: storedPoster } = await out.adopt('poster', poster, { expectKind: 'IMAGE' });
  const { id: videoId, stored } = await out.adopt('video', playable, { expectKind: 'VIDEO' });
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(path.dirname(result.file), { recursive: true, force: true }).catch(() => {});
  // the next free number, counting any numbered label already on the shot (uploads and samples included)
  const takeNumber = Math.max(sh.takes.length, ...sh.takes.map((t) => Number(/\bTake (\d+)/i.exec(t.label)?.[1] ?? 0))) + 1;
  const label = `Take ${takeNumber}`;
  // what the take records beyond the engine's own parameters: the window it was made for on the production audio
  // timeline (the new frames after its head — the cut shows exactly these), and the World Bible revision it read
  // a head kept because it did not repeat the tail is new picture: the whole take is the window then
  const headKept = Boolean(guideRecord?.head && !guideRecord.head.repeats);
  const takeTimeline = { newFrames: headKept ? clip.frames : Math.max(1, Math.min(Math.round(seconds * H3_FPS), backend === 'local' ? clip.frames - trimStartFrames : Math.round(seconds * H3_FPS))), headFrames: trimStartFrames, clipFrames: clip.frames, basis: soundtrack?.kind ?? 'PLAN' };
  const takeWorld = { revisionId: world.read.revisionId, revision: world.read.revisionNumber, pinned: world.read.pinned, plate: world.read.location?.assetId ? { assetId: world.read.location.assetId, role: world.read.location.role } : undefined, location: loc ? { locationId: loc.id, identityVersion: pack.location?.identity.version ?? pack.establishing?.identity.version, establishedHere: Boolean(established) } : undefined, characters: world.read.characters.map((c) => ({ characterId: c.characterId, version: c.usedPinned ? c.pinnedVersion : c.currentVersion })) };
  // THE QUALITY TIER (B6): what the take was really made at (the same rule chose the request's tier above). Local H3:
  // `final` = the base model at 20 steps (the official templates' default); `draft` = the turbo LoRA, 4 or 8 steps,
  // made only when the producer asked for it and recorded so. The hosted API has one tier: a draft request there is
  // made at final and recorded as asked.
  const quality = takeQuality(payload.quality, backend);
  if (quality.qualityRequested === 'draft') await ctx.event('info', 'a draft take was asked for; the hosted MiniMax API has one tier, so it was made at final quality', { quality });
  else if (quality.quality === 'draft') await ctx.event('info', 'made at the DRAFT tier as asked: the MiniMax H3 turbo LoRA (faster, less stable framing and identity than final)', { quality });
  const drift = { identity: { ok: applied.ok, characters: applied.characters }, location: plateDrift ? { plateAssetId: plateDrift.plateAssetId, frame: plateDrift.frame, meanDiff: plateDrift.meanDiff, rawMeanDiff: plateDrift.rawMeanDiff, threshold: plateDrift.threshold, matches: plateDrift.matches, measure: plateDrift.measure, basis: plateDrift.basis } : plateDriftNote ? { plateAssetId: pack.location?.assetId, measured: false, note: plateDriftNote } : undefined };
  const params = { ...(result.params ?? {}), ...quality, verdict, timeline: takeTimeline, world: takeWorld, sceneState: pack.sceneState, context: contextRecord(pack.context), attempt: attemptRecord(ctx.job.attempts, sh.takes.length), ...(guideSilence ? { dialogueGuide: guideSilence } : {}), ...(lipSyncRecord ? { lipSync: lipSyncRecord } : {}), ...(identityRecord ? { identityCheck: identityRecord } : {}), drift, ...(guideRecord ? { guide: guideRecord } : {}), identity: { rule: identityRule.rule, ok: identityRule.ok, lowered: identityRule.lowered, characters: identityRule.characters.map((c) => ({ characterId: c.characterId, assetId: c.assetId, picture: c.picture, source: c.source })), location: identityRule.location ? { locationId: identityRule.location.locationId, assetId: identityRule.location.assetId, picture: identityRule.location.picture } : undefined } };
  const provenance = { provider: 'MINIMAX', backend: result.backend, model: result.model, requestId: result.requestId, prompt, references, seed, params, workflowVersion: result.workflowVersion, codeVersion: env().CODE_VERSION, jobId: ctx.job.id, productionId: p.id, shotId: sh.id, relation, plannedRelation: pack.plannedRelation, graph: pack.graph, continuesTakeId, lowering, frames: clip.frames, lint: lint.checks.filter((c) => !c.ok), world: takeWorld };
  // QA REPORTS — the inspectors' verdicts on this take, recorded apart from the take itself (in the same commit): the
  // picture checks (Visual Quality Inspector) and, for a speaking take, the script heard back (Audio Synchronization
  // Inspector)
  const pictureOk = pictureChecks.every((c) => c.ok);
  const qaReports: TakeCommit['qa'] = [{ name: 'picture', productionId: p.id, subjectKind: 'TAKE', subjectId: '', inspectorId: 'visual-quality-inspector', checks: pictureChecks, failureClass: pictureOk ? undefined : 'OUTPUT_CORRUPTION', decision: pictureOk ? 'ACCEPT' : 'REJECT', evidenceAssetIds: [videoId, posterId], jobId: ctx.job.id }];
  // the drift checks as their own report (the take's QA record): ACCEPT, or REVIEW when the place drifted from its
  // plate or an identity was not applied — never a rejection on the provisional plate threshold
  const driftOk = driftChecks.every((c) => c.ok);
  qaReports.push({ name: 'continuity', productionId: p.id, subjectKind: 'TAKE', subjectId: '', inspectorId: 'visual-quality-inspector', checks: driftChecks, failureClass: driftOk ? undefined : applied.ok ? 'ENVIRONMENT_INCONSISTENCY' : 'CHARACTER_INCONSISTENCY', decision: driftOk ? 'ACCEPT' : 'REVIEW', notes: driftOk ? undefined : 'look before choosing this take: the measured drift is over the provisional threshold', evidenceAssetIds: [videoId, ...(pack.location ? [pack.location.assetId] : [])], jobId: ctx.job.id });
  if (scriptCheck) qaReports.push({ name: 'script', productionId: p.id, subjectKind: 'TAKE', subjectId: '', inspectorId: 'audio-sync-inspector', checks: [{ name: 'script-spoken', ok: scriptCheck.ok, value: scriptCheck.coverage, threshold: TAKE_COVERAGE, detail: scriptCheck.heard ? `heard: ${scriptCheck.heard.slice(0, 160)}` : scriptCheck.detail }, ...(scriptCheck.cer !== undefined ? [{ name: 'character-error-rate', ok: scriptCheck.cer <= VOICE_GATES.cer, value: scriptCheck.cer, threshold: VOICE_GATES.cer, detail: 'after the dialect fold; gated' }] : []), ...(scriptCheck.wer !== undefined ? [{ name: 'word-error-rate', ok: true, value: scriptCheck.wer, detail: 'reported, not gated' }] : [])], failureClass: scriptCheck.ok || takeUnverified ? undefined : 'LIP_SYNC_FAILURE', decision: takeUnverified ? 'REVIEW' : scriptCheck.ok ? 'ACCEPT' : 'REJECT', notes: takeUnverified ? 'transcription unavailable: listen before choosing this take' : undefined, evidenceAssetIds: [videoId, ...(soundtrack?.assetId ? [soundtrack.assetId] : [])], jobId: ctx.job.id });
  // THE COMMIT: the assets, the take (its id is the job's), its selection — the first accepted take of a shot is
  // chosen so the cut can be assembled, also over a bundled sample clip; a producer's own choice of a real take is
  // never overridden (decided on the state the commit runs on) — the QA reports and the World Bible read
  newAssets.push(
    assetFromStored(posterId, storedPoster, { label: `${p.title} ${sh.number} — ${label} poster`, tags: ['take', 'poster'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: videoId } }),
    assetFromStored(videoId, stored, { label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${label}`, tags: ['take', 'minimax'], origin: 'GENERATED', jobId: ctx.job.id, provenance, poster: `/api/media/${posterId}` }),
    ...extraAssets.map((a) => ({ ...a, provenance: { ...(a.provenance ?? {}), from: videoId } })),
  );
  const take = await commitTake({
    jobId: ctx.job.id, productionId: p.id, shotId: sh.id, assets: newAssets, qa: qaReports,
    take: { assetId: videoId, label, status: report.ok ? 'READY' : 'REJECTED', rejectionReason: report.ok ? undefined : `Automatic checks failed: ${report.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`, provider: 'MINIMAX', model: result.model, requestId: result.requestId, prompt, params, seed, references, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, generationMs: genMs, costUsd: result.costUsd, qa: report, jobId: ctx.job.id, codeVersion: env().CODE_VERSION, workflowVersion: result.workflowVersion, thumbnailAssetId: posterId, trimStartFrames: trimStartFrames || undefined, soundtrack, relation, continuesTakeId, ...(report.ok && !takeUnverified && (payload.select || verdict.autoChoose) ? { select: payload.select ? 'ALWAYS' as const : 'IF_UNCHOSEN' as const } : {}) },
    // the take's World Bible read, kept apart too (queryable by take: which revision, which plate, which images)
    worldRead: { productionId: p.id, read: world.read, jobId: ctx.job.id, jobType: 'GENERATE_TAKE', shotId: sh.id },
    // a place established by this take: its new master plate, in the same commit
    commands: extraCommands,
  });
  const r = { take };
  // the established frame goes into the World Bible as a new revision (by id; the place is locked from now on)
  if (established && loc && scene) {
    await step(ctx, 'world-continuity', `establish-here: shot ${sh.number}`, async () => {
      const fresh = (await readState()).state;
      const rev = await establishFromTake(fresh, fresh.productions.find((x) => x.id === p.id) ?? p, { locationId: loc.id, sceneId: scene.id, shotId: sh.id, takeId: take.id, videoAssetId: videoId, frame: established!.frame, imageAssetId: established!.imageAssetId, timeOfDay: scene.timeOfDay, framing: sh.framing, label: `${loc.name} — established in “${p.title}”, scene ${scene.number} shot ${sh.number}` }, { jobId: ctx.job.id });
      await ctx.event('info', `World Bible revision ${rev.revision.number}${rev.created ? ' written' : ' unchanged'}: ${loc.name} established by take ${take.id} (frame ${established!.frame}), locked`, { revision: rev.revision.number, locationId: loc.id, takeId: take.id });
    });
  }
  // audio before video: the shot's recorded lines are Sound's handoff to Video Production (one per speaking shot)
  if (soundtrack?.kind === 'DIALOGUE' && soundtrackId) {
    await recordHandoff({ id: out.id('handoff:audio-prep', 'handoff'), productionId: p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: [soundtrackId, ...(dialogueLineAssets ?? [])], outputVersions: { shotId: sh.id, lines: soundtrack.lines.length, recordedNow: spokenChecks.length }, validation: { ok: flaggedLines === 0 && unverifiedLines === 0, checks: [{ name: 'lines-recorded', ok: true, detail: `${soundtrack.lines.length} line(s) in the characters' voices (${spokenChecks.length} recorded now)` }, { name: 'lines-verified-by-transcription', ok: flaggedLines === 0 && unverifiedLines === 0, detail: flaggedLines || unverifiedLines ? `${flaggedLines} line(s) drifted, ${unverifiedLines} not heard back` : undefined }] }, jobId: ctx.job.id });
  }
  // a screening note sent to this shot (B2) now has the take it asked for
  try { const n = await recordProducedTake(sh.id, r.take.id); if (n) await ctx.event('info', `${n} screening note(s) sent to this shot record this take`, { takeId: r.take.id }); } catch (e) { await ctx.event('warn', `could not record the take on its screening notes: ${(e as Error).message.split('\n')[0]}`, { takeId: r.take.id }).catch(() => undefined); }
  await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  await recordMetric('take.qa_ok', report.ok ? 1 : 0, 'bool', { backend }, ctx.job.id);
  // VIDEO handoff to QA once every shot of the production has an accepted, chosen take
  const after = (await readState()).state.productions.find((x) => x.id === p.id);
  if (after) {
    const chosen = after.shots.map((x) => x.takes.find((t) => t.id === x.selectedTakeId));
    const withReal = chosen.filter((t) => t && t.provider !== 'SAMPLE').length;
    if (withReal === after.shots.length) {
      const failing = chosen.filter((t) => t && !t.qa?.ok).length;
      await recordHandoff({ id: out.id('handoff:video', 'handoff'), productionId: p.id, stage: 'VIDEO', producerDepartment: 'VIDEO', receiverDepartment: 'QA', artifactIds: chosen.map((t) => t!.assetId), outputVersions: { shots: after.shots.length }, validation: { ok: failing === 0, checks: [{ name: 'every-shot-has-chosen-take', ok: true, detail: `${after.shots.length} shots` }, { name: 'chosen-takes-passed-inspection', ok: failing === 0, detail: failing ? `${failing} chosen take(s) failed a check` : undefined }] }, jobId: ctx.job.id });
    }
  }
  await ctx.activity(report.ok ? (verdict.decision === 'REVIEW' ? 'TAKE_REVIEW' : 'TAKE_ACCEPTED') : 'TAKE_REJECTED', `Shot ${scene?.number ?? '?'}.${sh.number} of “${p.title}”: ${label} ${report.ok ? (takeUnverified ? 'made, not verified (transcription unavailable)' : verdict.decision === 'REVIEW' ? `made, to review (${verdict.flags.join(', ')}); not chosen automatically` : 'accepted') : 'rejected'} (${seconds} s, ${backend}${scriptCheck?.coverage !== undefined ? `, script ${Math.round(scriptCheck.coverage * 100)} % heard` : ''})`, { takeId: r.take.id, shotId: sh.id, seconds, backend, generationMs: genMs, qaOk: report.ok, unverified: takeUnverified });
  // a take or a line that could not be heard back (transcription away) waits for a human ear: never passed silently
  return { takeId: r.take.id, assetId: videoId, qaOk: report.ok, backend: result.backend, model: result.model, requestId: result.requestId, generationMs: genMs, costUsd: result.costUsd, unverifiedLines, takeUnverified, verdict: verdict.decision, flags: verdict.flags, awaitingReview: unverifiedLines > 0 || takeUnverified || verdict.decision === 'REVIEW', libraryRoot: libraryRoot() };
};

/** The generation time a take records: the wall clock of this attempt, or — when the engine run was adopted from an
 *  earlier attempt — the engine's own execution time, else nothing (the page then shows when it was made). */
export function takeGenerationMs(r: { resumed: boolean; engineMs?: number; waitedMs: number }): number | undefined {
  return r.resumed ? r.engineMs : r.waitedMs;
}

/** FIRST-ATTEMPT RELIABILITY (cloud directive 2026-10-05 §11: "Track attempt #1 separately from retries"). Which
 *  generation of the shot this take is (the shot's takes before it + 1) and which attempt of its job made it: a take
 *  with `firstForShot` and `jobAttempt` 1 is a first-attempt take; anything else is a retry (by the queue) or a
 *  regeneration (by a person). The engine room counts first-attempt acceptance from these. */
export function attemptRecord(jobAttempt: number, takesBefore: number): { jobAttempt: number; shotGeneration: number; firstForShot: boolean; firstAttempt: boolean } {
  return { jobAttempt, shotGeneration: takesBefore + 1, firstForShot: takesBefore === 0, firstAttempt: takesBefore === 0 && jobAttempt <= 1 };
}

/** A recorded line's word timing from the forced aligner (qa-service /align), or why there is none. */
async function lineAlignment(file: string, text: string, language: 'en' | 'ar'): Promise<{ verdict: string; words: Array<{ text: string; start: number; end: number }>; coverage?: number | null; detail?: string[] }> {
  try {
    const r = await alignScript(file, text, language);
    if (isQaUnavailable(r)) return { verdict: 'NOT_MEASURED', words: [], detail: [r.reason] };
    const j = judgeAlignment(r, text);
    return { verdict: j.verdict, coverage: j.coverage, words: j.words.filter((w) => w.aligned && w.start !== null && w.end !== null).map((w) => ({ text: w.text, start: w.start!, end: w.end! })), detail: j.detail };
  } catch (e) {
    return { verdict: 'NOT_MEASURED', words: [], detail: [(e as Error).message.split('\n')[0]] };
  }
}
