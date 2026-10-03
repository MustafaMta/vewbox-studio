import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, ShotDialogue, Take, TakeReference } from '@/domain/types';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, commands, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, fileFor, libraryRoot } from '@/server/media';
import { ffmpeg, joinSpeech, lastFrame as closingFrame, qaTake, speechAudioArgs, tailClip, thumbnail, tmpDir, trimAudio, webReady } from '@/server/media/ffmpeg';
import { shotWindows } from '@/domain/timeline';
import { generateVideo, chooseBackend } from '@/server/providers/video';
import { H3_FPS } from '@/server/workflows/minimax-h3';
import { VOICE_GATES, transcribe } from '@/server/providers/speech';
import { alignLyrics } from '@/server/media/lyrics';
import { TAKE_COVERAGE, judgeHeard, lineLanguage, lineRecordingCurrent, referenceWav, shouldRegenerate, speakLine, verifyLine, type LineCheck, type Reference } from './voice';
import { h3ReferencePrompt, lintH3Prompt, takePrompt } from '@/server/story/prompts';
import { recordMetric } from '@/server/jobs/queue';
import { env } from '@/server/env';
import { recordHandoff, recordQaReport } from '@/server/org/runs';
import { preflightTake } from '@/server/org/preflight';
import { bindingOf, clipSecondsFor, resolveShotPack } from '@/server/production/shot-pack';

/** GENERATE A TAKE — the heart of production. Resolve the shot pack (relation to the previous shot, every character's
 *  canonical image and the plate bound as pictures, what the clip starts from), record the lines first, write the
 *  prompt in MiniMax H3's reference grammar, ask MiniMax (hosted or local) for the clip, download it, prove it
 *  decodes, run the quality checks, make a poster frame, and record a new take with full provenance. A new take
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
  // PREFLIGHT (the Executive Producer's step) — the request is refused before the engine is touched when it could not
  // succeed: a failed check is a classified failure the producer corrects, not an attempt the engine burns
  await step(ctx, 'executive-producer', `take-preflight: shot ${sh.number}`, async () => {
    const preflight = preflightTake(state, p, sh, { backend, customPrompt: Boolean(payload.prompt) });
    await ctx.event(preflight.ok ? (preflight.warnings.length ? 'warn' : 'info') : 'error', `preflight ${preflight.ok ? (preflight.warnings.length ? `passed with ${preflight.warnings.length} warning(s): ${preflight.warnings.map((w) => w.detail ?? w.name).join('; ').slice(0, 300)}` : 'passed') : 'FAILED'}`, { checks: preflight.checks, warnings: preflight.warnings });
    if (!preflight.ok) {
      const failed = preflight.checks.filter((c) => !c.ok);
      throw Object.assign(new StudioError('INVALID', `Preflight failed for shot ${sh.number}: ${failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`, { checks: preflight.checks }), { failureClass: failed[0].failureClass });
    }
  });
  // THE SHOT PACK: the relation to the previous shot, the identity references (every character's canonical image and
  // the plate, on every shot that shows them), what the clip starts from, the graph — the same resolution the
  // preflight judged
  const pack = resolveShotPack(state, p, sh, { backend });
  let seconds = Math.min(15, Math.max(1, Math.round(payload.durationSeconds ?? sh.durationSeconds)));
  // the seed is chosen here, not inside the engine, so the take records the number that made it
  const seed = payload.seed ?? Math.floor(Math.random() * 2 ** 31);
  const info = ASPECT_INFO[p.aspect];
  const references: TakeReference[] = [];
  const work = await tmpDir('take-prep');
  const guides: NonNullable<Parameters<typeof generateVideo>[0]['guides']> = [];
  const trimStartFrames = pack.trimStartFrames;
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
        const dur = have.durationSeconds ?? d.durationSeconds ?? (await ctx.tool('media.probe', () => ffprobe(assetFile(have)), { input: { file: assetFile(have) } })).durationSeconds ?? 2;
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
      seconds = Math.min(15, Math.max(1, Math.min(Math.max(planned, need), need + 2)));
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
  //    mouth follows the real vocal and the cut carries one copy of the music. The hosted API cannot anchor it.
  const window = songAsset ? shotWindows(p).get(sh.id) : undefined;
  if (backend === 'local' && songAsset && songAsset.kind === 'AUDIO' && window && window.to > window.from && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') {
    soundtrackFile = await trimAudio(assetFile(songAsset), path.join(work, `${sh.id}-song.wav`), window.from, Math.min(window.to, window.from + seconds));
    soundtrack = { kind: 'SONG', assetId: songAsset.id, lines: [] };
    references.push({ kind: 'AUDIO', assetId: songAsset.id, note: `song ${window.from.toFixed(2)}–${Math.min(window.to, window.from + seconds).toFixed(2)} s`, binding: `guide@${trimStartFrames}` });
  }
  // 3) WHAT THE CLIP STARTS FROM, by relation. CONTINUATION: the previous take's last frames AND their sound anchored
  //    at frame 0 in one guide (the template's continuation idiom), dropped again in the cut — under a song master the
  //    sound of those frames is the song's, since that is what the audience hears there. Hosted: the previous take's
  //    last frame becomes the first frame. CUT / STORY_TRANSITION: the drawn opening frame (below).
  let continuesTakeId: string | undefined;
  let hostedFirstFrame: { file: string; mime: string } | undefined;
  if (pack.opening.kind === 'TAIL') {
    const prevAsset = byId(pack.opening.assetId)!;
    const tail = await tailClip(assetFile(prevAsset), path.join(work, 'tail.mp4'), pack.opening.frames);
    const songTail = soundtrack?.kind === 'SONG' && songAsset && window ? await trimAudio(assetFile(songAsset), path.join(work, 'tail-song.wav'), Math.max(0, window.from - pack.opening.frames / H3_FPS), window.from) : undefined;
    guides.push(songTail ? { frameIdx: 0, imageFile: tail, imageIsVideo: true, audioFile: songTail } : { frameIdx: 0, imageFile: tail, imageIsVideo: true, audioFromVideo: pack.opening.withAudio });
    continuesTakeId = pack.opening.takeId;
    references.push({ kind: 'VIDEO', assetId: prevAsset.id, binding: 'guide@0', note: `continuation guide: the last ${pack.opening.frames} frames of the previous take with ${songTail ? 'the song under them' : pack.opening.withAudio ? 'their own sound' : 'no sound (the previous take speaks there and this shot has no lines)'}` });
  } else if (pack.opening.kind === 'LAST_FRAME_AS_FIRST') {
    const prevAsset = byId(pack.opening.assetId)!;
    hostedFirstFrame = { file: await closingFrame(assetFile(prevAsset), path.join(work, 'last-frame.png')), mime: 'image/png' };
    continuesTakeId = pack.opening.takeId;
    references.push({ kind: 'FIRST_FRAME', assetId: prevAsset.id, binding: 'first_frame', note: 'hosted continuation: the previous take’s last frame' });
  }
  if (soundtrackFile) guides.push({ frameIdx: trimStartFrames, audioFile: soundtrackFile });
  // the clip: the new content plus the guide frames, snapped up to the engine's grid and held in its trained range
  const clip = clipSecondsFor(pack, seconds);
  if (clip.truncated) await ctx.event('warn', `a continuation carries at most ${clip.newFrames} new frames after its guide: the shot is cut short of ${seconds} s`, { frames: clip.frames, newFrames: clip.newFrames });

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
        else if (pic.role === 'LOCATION') references.push({ kind: 'LOCATION', assetId: pic.assetId, locationId: pic.locationId, binding: pic.binding, note: `${pack.location?.role === 'STATE' ? `plate for ${scene?.timeOfDay?.toLowerCase().replace('_', ' ') ?? 'the time of day'}` : 'master plate'}` });
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
  const binding = bindingOf(pack, audioRefs);
  const prompt = refsGraph
    ? (custom && /<Picture \d+>|\bImage \d+\b/.test(custom) ? custom : h3ReferencePrompt(p, sh, cast, loc, scene, binding, { relation: pack.relation, ...(custom ? { body: custom, includeDialogue: false } : {}) }))
    : (custom || [pack.opening.kind === 'TAIL' ? `The shot continues the previous shot without a cut: its first ${(pack.opening.frames / H3_FPS).toFixed(1)} seconds are the end of the previous shot, then the action carries on.` : '', takePrompt(p, sh, cast, loc, scene)].filter(Boolean).join(' '));
  const lint = lintH3Prompt(prompt, { labels: binding.labels, pictures: refsGraph ? referenceImages.length : 0, audios: refsGraph ? referenceAudio.length : 0, lines: custom || p.kind === 'MUSIC_VIDEO' ? [] : sh.dialogue.map(lineText).filter(Boolean), names: cast.map((c) => c.name) });
  if (!lint.ok) {
    const failed = lint.checks.filter((c) => !c.ok && c.hard);
    throw new StudioError('INVALID', `The prompt for shot ${sh.number} failed its lint: ${failed.map((c) => `${c.rule}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`, { failureClass: 'PROMPT_AMBIGUITY', lint: lint.checks });
  }
  const softLint = lint.checks.filter((c) => !c.ok && !c.hard);
  if (softLint.length) await ctx.event('warn', `prompt lint: ${softLint.map((c) => c.detail ?? c.rule).join('; ')}`, { lint: softLint });
  await ctx.event('info', 'take request prepared', { backend, relation: pack.relation, plannedRelation: pack.plannedRelation, graph: pack.graph, seconds: clip.seconds, frames: clip.frames, newSeconds: seconds, soundtrack: soundtrack?.kind, continuation: pack.opening.kind === 'TAIL' || pack.opening.kind === 'LAST_FRAME_AS_FIRST', continuesTakeId, lowering: pack.lowering, prompt: prompt.slice(0, 800), references });

  const t0 = Date.now();
  let lastStatus = '';
  // the local engine runs under the GPU lease (one model family on the card at a time; other services unload
  // first); the hosted API needs no card and runs in the hosted lane's concurrency
  const run = <T>(fn: () => Promise<T>) => (backend === 'local' ? ctx.gpu('VIDEO', 28000, fn, { jobId: ctx.job.id }) : fn());
  // the request as the contract sees it (the callbacks below are the job's own plumbing)
  const request = {
    prompt, seconds: clip.seconds, width: info.width, height: info.height, aspect: p.aspect, firstFrame, lastFrame, referenceImages: referenceImages.length ? referenceImages : undefined, referenceAudio: referenceAudio.length ? referenceAudio : undefined, guides: guides.length ? guides : undefined,
    lowering: pack.lowering,
    seed, model: payload.model, resolution: payload.resolution,
    resumeTaskId: ctx.job.providerTaskId ?? undefined,
  };
  const result = await run(() => ctx.tool('video.minimax_generate', () => generateVideo({
    ...request,
    onTaskCreated: async (id) => { await ctx.progress('GENERATING', { phase: 'generating', message: `MiniMax task ${id} created`, providerStatus: 'queued', percent: null }, { providerTaskId: id }); },
    onStatus: async (s) => { if (s.status !== lastStatus) { lastStatus = s.status; await ctx.progress(s.status === 'downloading' ? 'DOWNLOADING' : 'GENERATING', { phase: s.status, message: s.queue ? `waiting behind ${s.queue} in the GPU queue` : backend === 'api' ? `MiniMax: ${s.status}` : `local MiniMax H3: ${s.status}`, providerStatus: s.status, percent: null }); } else await ctx.checkpoint(); },
    shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } },
  }), { label: backend, input: request }));
  const genMs = Date.now() - t0;
  await recordMetric('take.generation_ms', genMs, 'ms', { backend, seconds }, ctx.job.id);
  if (result.engineMs) await recordMetric('take.engine_ms', result.engineMs, 'ms', { backend, seconds }, ctx.job.id);

  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Checking the clip' });
  // PICTURE CHECK (the Visual Quality Inspector's step). MiniMax H3 always renders a soundtrack; a shot with no lines
  // may legitimately be near-silent
  // the length asked for is the clip the engine really makes: the local frames snapped up (≥ 124), the hosted 4–15 s
  const expectSeconds = backend === 'local' ? clip.frames / H3_FPS : Math.min(15, Math.max(4, Math.round(clip.seconds)));
  const qa = { file: result.file, expect: { durationSeconds: expectSeconds, width: Math.round(info.width * 0.5), height: Math.round(info.height * 0.5), expectAudio: true, speechExpected: sh.dialogue.length > 0 || soundtrack?.kind === 'SONG' } };
  const { report, probe } = await step(ctx, 'visual-quality-inspector', `picture-check: shot ${sh.number}`, (tool) => tool('media.qa_take', () => qaTake(qa.file, qa.expect), { input: qa }));
  const pictureChecks = report.checks.map((c) => ({ ...c }));
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
  const provenance = { provider: 'MINIMAX', backend: result.backend, model: result.model, requestId: result.requestId, prompt, references, seed, params: result.params, workflowVersion: result.workflowVersion, codeVersion: env().CODE_VERSION, jobId: ctx.job.id, productionId: p.id, shotId: sh.id, relation: pack.relation, plannedRelation: pack.plannedRelation, graph: pack.graph, continuesTakeId, lowering: pack.lowering, frames: clip.frames, lint: lint.checks.filter((c) => !c.ok) };
  await command('addAsset', [assetFromStored(posterId, storedPoster, { label: `${p.title} ${sh.number} — ${label} poster`, tags: ['take', 'poster'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: videoId } })], 'worker');
  await command('addAsset', [assetFromStored(videoId, stored, { label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${label}`, tags: ['take', 'minimax'], origin: 'GENERATED', jobId: ctx.job.id, provenance, poster: `/api/media/${posterId}` })], 'worker');
  const r = await command('addTake', [p.id, sh.id, { assetId: videoId, label, status: report.ok ? 'READY' : 'REJECTED', rejectionReason: report.ok ? undefined : `Automatic checks failed: ${report.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`, provider: 'MINIMAX', model: result.model, requestId: result.requestId, prompt, params: result.params, seed, references, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, fps: probe.fps, generationMs: genMs, costUsd: result.costUsd, qa: report, jobId: ctx.job.id, codeVersion: env().CODE_VERSION, workflowVersion: result.workflowVersion, thumbnailAssetId: posterId, trimStartFrames: trimStartFrames || undefined, soundtrack, relation: pack.relation, continuesTakeId }], 'worker');
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
