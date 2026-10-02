import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { StudioError, missingReference } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, Production, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import type { JobPayloadParsed } from '@/domain/jobs';
import { commands, command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, fileFor, removeFile } from '@/server/media';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { engineOutputTag, pickReferenceWindow, speechRegions, trimReference } from '@/server/media/voice-check';
import { REFERENCE_WINDOW } from '@/server/studio/voice-reference';
import { VOICE_GATES, charErrorRate, lineScript, pickEngine, routeLine as routeLineByScript, scriptCoverage, synthesize, transcribe, verdict, wordErrorRate, type LineScript, type TtsEngine, type VoiceVerdict } from '@/server/providers/speech';
import * as minimax from '@/server/providers/minimax';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { registerUnloader } from '../gpu';
import { unloadAsr, unloadTts } from '@/server/providers/speech';
import { recordHandoff, recordQaReport } from '@/server/org/runs';
import { guardVoiceBuild, isCloneSource, voiceLock } from '@/domain/rules';
import type { VoiceIdentityInput } from '@/domain/actions';

/** VOICES — one persistent identity per character (which engine, which reference recording, which revision), a
 *  preview line, and the recording of every dialogue line of a production. The reference is always the producer's
 *  upload, never a generated line. Each generated line is transcribed back and compared with the script; a line
 *  that drifts too far is regenerated once and flagged if it still drifts; a line that could not be heard back is
 *  flagged too, never passed. Contract: docs/CONTRACTS-CHARACTER-VOICE.md §1.4. */

registerUnloader('TTS', unloadTts);
registerUnloader('ASR', unloadAsr);

const TTS_VRAM = 8000;
const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

/** Gates (contract §1.4, `VOICE_GATES` in speech.ts): a recorded line (and the proof line) must cover this much of
 *  its script, in order, AND be within CER ≤ 0.15 after the dialect fold; a take's clip ≥ 0.7 with the same CER.
 *  WER is reported, not gated. */
export const LINE_COVERAGE = VOICE_GATES.coverage.line;
export const PROOF_COVERAGE = VOICE_GATES.coverage.line;
export const TAKE_COVERAGE = VOICE_GATES.coverage.take;

// ----------------------------------------------------------------------------------------------- pure helpers

export { lineScript };

export interface LineRoute { engine: Exclude<TtsEngine, 'auto'>; language: Language; script: LineScript; /** set when the line left the character's engine: the reason, for the job event */ fallback?: string }

/** The engine a character's identity pins, when it is a local engine built for the language the character speaks
 *  now (a STALE identity of another language does not decide). */
const pinnedEngine = (c: Pick<Character, 'language' | 'voice'>): 'habibi' | 'indextts' | undefined => {
  const id = c.voice.identity;
  return id?.provider === 'LOCAL_TTS' && id.language === c.language && (id.model === 'habibi' || id.model === 'indextts') ? id.model : undefined;
};

/** ROUTING PARITY — a thin adapter over THE routing rule (`routeLine` in src/server/providers/speech.ts, which the
 *  Iraqi suite uses too): the engine and the verification language follow the line's script — Arabic script → the
 *  character's engine (the pinned one); Latin only → IndexTTS; mixed → IndexTTS, heard in the language most of its
 *  letters are in; the fallback is named for the job event. The identity's `model` is never rewritten. */
export function routeLine(c: Pick<Character, 'language' | 'dialect' | 'voice'>, text: string): LineRoute {
  const r = routeLineByScript(text, c.language, c.dialect, pinnedEngine(c));
  return { engine: r.engine, language: r.asrLanguage === 'ar' ? 'AR' : 'EN', script: r.script, fallback: r.fallback ? `${r.fallback} (same reference)` : undefined };
}

/** The language a line is spoken and verified in: its script decides; a line with no letters follows the character
 *  (or the production) — `routeLine`'s verification language. */
export function lineLanguage(text: string, fallback: Language): Language {
  return routeLineByScript(text, fallback).asrLanguage === 'ar' ? 'AR' : 'EN';
}

/** What the hosted clone (MiniMax) takes: the ORIGINAL recording, 10 s – 5 min, at most 20 MB, mp3/m4a/wav
 *  (VOICE-STACK §3). The trimmed ≤ 12 s window the local engines use is not it (finding 11). */
export const MINIMAX_CLONE = { minSeconds: 10, maxSeconds: 300, maxBytes: 20 * 1024 * 1024, types: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'] as readonly string[] };

/** Why an original recording cannot be sent to the hosted clone, or null. Pure. */
export function minimaxCloneProblem(a: Pick<Asset, 'durationSeconds' | 'bytes'>): string | null {
  const d = a.durationSeconds;
  if (d === undefined || !Number.isFinite(d)) return 'its length could not be read';
  if (d < MINIMAX_CLONE.minSeconds) return `it is ${d.toFixed(1)} s long; the hosted clone needs at least ${MINIMAX_CLONE.minSeconds} s`;
  if (d > MINIMAX_CLONE.maxSeconds) return `it is ${Math.round(d)} s long; the hosted clone takes at most ${MINIMAX_CLONE.maxSeconds / 60} min`;
  if (a.bytes !== undefined && a.bytes > MINIMAX_CLONE.maxBytes) return `it is ${(a.bytes / 1024 / 1024).toFixed(1)} MB; the hosted clone takes at most 20 MB`;
  return null;
}

/** The profile's pace as the engine's speed factor. */
export const speedForPace = (pace: Character['voice']['pace']): number => (pace === 'SLOW' ? 0.9 : pace === 'QUICK' ? 1.12 : 1.0);

export interface ReferencePick { asset: Asset; sample?: VoiceSample; via: 'IDENTITY' | 'SELECTED' | 'UPLOADED' | 'REQUESTED' }

const usableAudio = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'AUDIO' && !a.sample && !a.unavailable && a.origin !== 'GENERATED');

/** THE REFERENCE RULE — which recording a character's voice is cloned from, in this order: the identity's reference
 *  upload; the chosen sample when it is an upload; any upload. GENERATED lines (the proof, previews) and bundled
 *  SAMPLE voices are never cloned from. `sampleId` asks for one specific upload (REFERENCE mode). Null = refuse. */
export function pickReference(c: Character, assets: Asset[], opts: { sampleId?: string } = {}): ReferencePick | null {
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  if (opts.sampleId) {
    const sm = c.voice.samples.find((s) => s.id === opts.sampleId);
    const a = sm && isCloneSource(sm) ? byId(sm.assetId) : undefined;
    return usableAudio(a) ? { asset: a, sample: sm, via: 'REQUESTED' } : null;
  }
  const id = c.voice.identity;
  if (id?.referenceAssetId) {
    const a = byId(id.referenceAssetId);
    if (usableAudio(a)) return { asset: a, sample: c.voice.samples.find((s) => s.id === id.referenceSampleId) ?? c.voice.samples.find((s) => s.assetId === a.id && isCloneSource(s)), via: 'IDENTITY' };
  }
  const chosen = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  if (chosen && isCloneSource(chosen)) { const a = byId(chosen.assetId); if (usableAudio(a)) return { asset: a, sample: chosen, via: 'SELECTED' }; }
  for (const s of c.voice.samples) {
    if (!isCloneSource(s)) continue;
    const a = byId(s.assetId);
    if (usableAudio(a)) return { asset: a, sample: s, via: 'UPLOADED' };
  }
  return null;
}

// ----------------------------------------------------------------------------------------- reference on disk

export interface Reference {
  file: string; asset: Asset; sample?: VoiceSample;
  /** what the recording says, read from the sample (stored once at upload); transcribed on first use when absent */
  text?: string;
  /** the stretch of the original the engine hears, and its stored asset when the window was stored at upload */
  window?: { from: number; to: number; assetId?: string };
  via: ReferencePick['via'];
}

/** The character's reference recording as the engine takes it (mono 24 kHz, ≤ 12 s, −20 LUFS), or null when
 *  there is nothing to clone from. The window stored at upload is used as it is; otherwise it is cut here with the
 *  one measurement stack (voice-check). A file the studio's own engine made is refused whatever path brought it in
 *  (finding 7: the synthetic-speech tag docker/tts writes is read here and at upload). */
export async function referenceWav(c: Character, assets: Asset[], dir: string, opts: { sampleId?: string } = {}): Promise<Reference | null> {
  const pick = pickReference(c, assets, opts);
  if (!pick) return null;
  const engine = await engineOutputTag(assetFile(pick.asset));
  if (engine) throw missingReference(`“${pick.sample?.label ?? pick.asset.label}” is the studio's own engine output (${engine.split(' · ')[0]}), not a recording; upload a real recording of ${c.name}'s voice.`, { characterId: c.id, assetId: pick.asset.id, engineOutput: engine });
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  const text = pick.sample?.text?.trim() || c.voice.identity?.referenceText?.trim() || undefined;
  // the trimmed window stored with the upload, or the one the identity was built with
  const storedWindowId = pick.sample?.provenance?.trimmedAssetId ?? (pick.via === 'IDENTITY' ? c.voice.identity?.referenceWindow?.assetId : undefined);
  const stored = byId(storedWindowId);
  if (stored && stored.kind === 'AUDIO' && !stored.unavailable) {
    const w = pick.sample?.provenance?.window ?? c.voice.identity?.referenceWindow;
    return { file: assetFile(stored), asset: pick.asset, sample: pick.sample, text, window: w ? { from: w.from, to: w.to, assetId: stored.id } : { from: 0, to: stored.durationSeconds ?? 0, assetId: stored.id }, via: pick.via };
  }
  const src = assetFile(pick.asset);
  const speech = await speechRegions(src, { durationSeconds: pick.asset.durationSeconds });
  const found = pickReferenceWindow(speech.regions, speech.durationSeconds);
  // no clear run of speech found: the head of the file, as long as the engines take
  const window = found ? { from: found.from, to: found.to } : { from: 0, to: Math.min(speech.durationSeconds || REFERENCE_WINDOW.maxSeconds, REFERENCE_WINDOW.maxSeconds) };
  const out = path.join(dir, `ref-${c.id}.wav`);
  await trimReference(src, out, window);
  return { file: out, asset: pick.asset, sample: pick.sample, text, window, via: pick.via };
}

/** What the reference recording says. Habibi (F5-TTS) conditions on the reference transcript; it is stored once on
 *  the sample (at upload, or here on first use) and never transcribed again. Without it the engine would run its own
 *  Whisper inside the container on every line — a different transcript each time, an identity pinned with none
 *  (finding 17) — so a transcript that cannot be had is a refusal: UNAVAILABLE while the transcription service is
 *  away (the job is retried when it is back), MISSING_REFERENCE when the recording yields no words. */
export async function referenceText(ctx: HandlerContext, c: Character, ref: Reference): Promise<string> {
  if (ref.text) return ref.text;
  let heard: Awaited<ReturnType<typeof transcribe>>;
  try {
    heard = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(ref.file, { language: 'auto' }), { label: 'reference text' }), { jobId: ctx.job.id });
  } catch (e) {
    throw new StudioError('UNAVAILABLE', `The Iraqi engine needs the words of ${c.name}'s reference recording and the transcription service could not provide them (${(e as Error).message}); nothing was spoken with a guessed transcript — retry when the service is back.`, { failureClass: 'INFRASTRUCTURE', characterId: c.id, sampleId: ref.sample?.id });
  }
  const text = heard.text.trim();
  if (!text) throw missingReference(`No words were heard in ${c.name}'s reference recording “${ref.sample?.label ?? ref.asset.label}”; the Iraqi engine needs a recording of clear speech.`, { characterId: c.id, sampleId: ref.sample?.id });
  ref.text = text;
  if (ref.sample) await command('updateVoiceSample', [c.id, ref.sample.id, { text, language: heard.language === 'ar' ? 'AR' : heard.language === 'en' ? 'EN' : undefined }], 'worker');
  return text;
}

export interface SpokenLine { file: string; engine: string; model: string; ms: number; language: Language; durationSeconds?: number; fallback?: string }

/** Speak one line as the character: the engine and language follow the line's script (routeLine); the speech
 *  parameters are the identity's (speed from the pace, the seed), so every line of a voice sounds like its proof. */
export async function speakLine(ctx: HandlerContext, c: Character, text: string, ref: Reference | null, dir: string, opts: { emotion?: string; delivery?: string } = {}): Promise<SpokenLine> {
  const route = routeLine(c, text);
  const identity = c.voice.identity;
  const provider = (identity?.provider ?? (env().MINIMAX_API_KEY && (await readState()).state.settings.generation?.voiceProvider === 'MINIMAX' ? 'MINIMAX' : 'LOCAL_TTS')) as 'LOCAL_TTS' | 'MINIMAX';
  if (provider === 'MINIMAX') {
    const voiceId = identity?.providerVoiceId;
    if (!voiceId) throw new StudioError('INVALID', 'Build the voice first (MiniMax clone).');
    const r = await ctx.tool('speech.synthesize', () => minimax.speak({ text, voiceId, languageBoost: route.language === 'AR' ? 'Arabic' : 'English', emotion: opts.emotion, format: 'wav' }), { label: 'minimax' });
    const file = path.join(dir, `mm-${Date.now().toString(36)}.wav`);
    await fsp.writeFile(file, r.bytes);
    return { file, engine: 'minimax', model: env().MINIMAX_SPEECH_MODEL, ms: 0, language: route.language };
  }
  if (!ref) throw missingReference(`${c.name} has no uploaded recording to speak with.`, { characterId: c.id });
  if (route.fallback) await ctx.event('info', `engine fallback for “${text.slice(0, 40)}”: ${route.fallback}`, { characterId: c.id, engine: route.engine, pinned: identity?.model, script: route.script });
  const refText = route.engine === 'habibi' ? await referenceText(ctx, c, ref) : undefined;
  const params = identity?.params ?? { speed: speedForPace(c.voice.pace), emotionAlpha: 1 };
  const r = await ctx.gpu('TTS', TTS_VRAM, () => ctx.tool('speech.synthesize', () => synthesize({ text, language: route.language, dialect: c.dialect, referenceWav: ref.file, referenceText: refText, emotion: opts.emotion ?? opts.delivery, emotionAlpha: params.emotionAlpha, speed: params.speed, seed: params.seed, engine: route.engine }, dir), { label: route.engine }), { jobId: ctx.job.id });
  return { file: r.file, engine: r.engine, model: r.model, ms: r.ms, language: route.language, durationSeconds: r.durationSeconds, fallback: route.fallback };
}

/** What hearing a line back proved. `ok` only on PASS (coverage AND CER within the gate); `status` is the contract's
 *  verdict — FAIL is regenerated once, REVIEW (just below the gate) goes to a person. */
export interface LineCheck { ok: boolean; status: VoiceVerdict['status']; reasons: string[]; wer: number; cer: number; coverage: number; heard: string }

/** THE GATE (contract §1.4) on a line and what was heard: coverage over folded words, CER after the dialect fold,
 *  WER for the report — and the verdict for a recorded line ('line') or a take's clip ('take'). Pure. */
export function judgeHeard(text: string, heard: string, language: Language, context: 'line' | 'take' = 'line'): LineCheck {
  const coverage = scriptCoverage(text, heard, language);
  const cer = charErrorRate(text, heard, language);
  const v = verdict({ coverage, cer, context });
  return { ok: v.status === 'PASS', status: v.status, reasons: v.reasons, wer: wordErrorRate(text, heard, language), cer, coverage, heard };
}

/** A heard line that failed the gate outright is spoken once more; one just below the gate is kept and flagged for a
 *  person to listen to; an unheard one (null) is flagged too. */
export const shouldRegenerate = (check: LineCheck | null): boolean => check?.status === 'FAIL';

/** Say the line back: transcribe in the line's language and judge it (`judgeHeard`). `null` means the line could not
 *  be heard back (the transcription service was away): callers treat that as unverified — flagged, never passed. */
export async function verifyLine(ctx: HandlerContext, file: string, text: string, language: Language, context: 'line' | 'take' = 'line'): Promise<LineCheck | null> {
  try {
    const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(file, { language: language === 'AR' ? 'ar' : 'en' }), { label: 'verify line' }), { jobId: ctx.job.id });
    return judgeHeard(text, t.text, language, context);
  } catch (e) { await ctx.event('warn', `transcription unavailable; the line is flagged for review: ${(e as Error).message}`); return null; }
}

// ------------------------------------------------------------------------------------------------ VOICE_BUILD

const proofLineFor = (c: Character) => (c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'هلا بيك. اني اسمي ' + (c.nameAr || c.name) + '، وهذا صوتي.' : 'أهلاً بك. اسمي ' + (c.nameAr || c.name) + '، وهذا صوتي.') : `Hello. My name is ${c.name}, and this is my voice.`);

/** Build and pin a character's voice. Modes: REFERENCE clones from one validated upload; AUTOMATIC from the best
 *  upload (none → MISSING_REFERENCE); MANUAL is a hosted catalogue voice. Nothing is written until the proof line
 *  exists on disk and was heard back: identity and proof go into the studio in one batch; a failed build leaves the
 *  character exactly as it was. The proof line is a GENERATED sample and is never the chosen recording. */
export const voiceBuild: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'VOICE_BUILD'>;
  const mode = payload.mode ?? 'AUTOMATIC';
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === payload.characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  // the voice of a character who has been in a video is preserved like their face (VOICE_LOCKED): with an identity it
  // is never rebuilt; locked by the chosen recording alone, it is built only from that recording (AUTOMATIC is held
  // to it, REFERENCE must name it, a catalogue voice is refused) — finding 8
  const locked = voiceLock(c).locked;
  guardVoiceBuild(c, mode === 'REFERENCE' ? payload.referenceSampleId : mode === 'AUTOMATIC' ? c.voice.selectedSampleId : undefined, 'build the voice');
  const dir = await tmpDir('voice');
  const useMinimax = mode === 'MANUAL' || ((payload.provider ?? state.settings.generation?.voiceProvider) === 'MINIMAX' && Boolean(env().MINIMAX_API_KEY));
  if (mode === 'MANUAL' && !env().MINIMAX_API_KEY) throw new StudioError('NOT_CONFIGURED', 'A catalogue voice needs the hosted speech provider: MINIMAX_API_KEY is not set.');

  // 1) the reference: the producer's upload, never a generated line
  let ref: Reference | null = null;
  if (mode !== 'MANUAL') {
    ref = await referenceWav(c, state.assets, dir, mode === 'REFERENCE' ? { sampleId: payload.referenceSampleId } : locked ? { sampleId: c.voice.selectedSampleId } : {});
    if (!ref) throw missingReference(mode === 'REFERENCE' ? `The requested recording is not an uploaded recording of ${c.name} (or its file is gone). Upload a 3–30 second recording of the voice on the Voice tab.` : `${c.name} has no uploaded recording to clone from. Upload a 3–30 second recording of the voice on the Voice tab first.`, { characterId: c.id, mode });
    await ctx.progress('PREPARING', { phase: 'preparing', message: `Reference recording for ${c.name}: “${ref.sample?.label ?? ref.asset.label}” (${ref.window ? `${ref.window.from}–${ref.window.to} s` : 'whole file'})` });
    await ctx.event('info', 'reference chosen', { assetId: ref.asset.id, sampleId: ref.sample?.id, via: ref.via, window: ref.window, hasText: Boolean(ref.text) });
  }

  // 2) the identity to prove: engine, parameters, seed
  const seed = Math.floor(Math.random() * 2 ** 31);
  const params: VoiceIdentity['params'] = { speed: speedForPace(c.voice.pace), emotionAlpha: 1, seed };
  let head: Pick<VoiceIdentity, 'provider' | 'model' | 'fallbackModel' | 'providerVoiceId'>;
  if (useMinimax) {
    if (mode === 'MANUAL') head = { provider: 'MINIMAX', model: env().MINIMAX_SPEECH_MODEL, providerVoiceId: payload.providerVoiceId };
    else {
      // the hosted clone hears the ORIGINAL upload (10 s – 5 min), never the trimmed ≤ 12 s window; one that cannot
      // qualify is refused before anything is sent
      const original = ref!.asset;
      const problem = minimaxCloneProblem({ durationSeconds: original.durationSeconds ?? (await ffprobe(assetFile(original)).catch(() => undefined))?.durationSeconds, bytes: original.bytes });
      if (problem) throw new StudioError('INVALID', `The hosted voice clone (MiniMax) needs the original recording to be 10 s – 5 min and at most 20 MB: “${ref!.sample?.label ?? original.label}” — ${problem}. Upload a longer recording, or build the voice with the local engines.`, { failureClass: 'INVALID_INPUT', characterId: c.id, assetId: original.id, durationSeconds: original.durationSeconds });
      let cloneFrom = assetFile(original);
      if (!MINIMAX_CLONE.types.includes(original.mimeType ?? '')) { const wav = path.join(dir, `clone-${original.id}.wav`); await ffmpeg(['-v', 'error', '-i', cloneFrom, '-vn', '-c:a', 'pcm_s16le', wav], { timeoutMs: 120_000 }); cloneFrom = wav; }
      await ctx.progress('GENERATING', { phase: 'cloning', message: 'Cloning the voice with MiniMax' });
      const voiceId = `vb_${c.id.replace(/[^a-z0-9]/gi, '').slice(0, 20)}_${Date.now().toString(36)}`;
      const r = await ctx.tool('speech.clone_voice', () => minimax.cloneVoice({ file: cloneFrom, voiceId, languageBoost: c.language === 'AR' ? 'Arabic' : 'English' }));
      head = { provider: 'MINIMAX', model: env().MINIMAX_SPEECH_MODEL, providerVoiceId: r.voiceId };
    }
  } else {
    const model = pickEngine(c.language, c.dialect);
    head = { provider: 'LOCAL_TTS', model, fallbackModel: model === 'habibi' ? 'indextts' : undefined };
  }
  // the character as the proof line will see it: the identity-to-be, so routing and parameters are the ones pinned
  const trial: Character = { ...c, voice: { ...c.voice, identity: { ...head, mode, language: c.language, dialect: c.dialect, params, status: 'ACTIVE', revision: (c.voice.identity?.revision ?? 0) + 1, createdAt: new Date().toISOString() } } };

  // 3) the proof line, spoken and heard back
  const text = proofLineFor(c);
  await ctx.progress('GENERATING', { phase: 'speaking', message: 'Speaking a proof line' });
  const line = await speakLine(ctx, trial, text, ref, dir);
  // the proof is a recorded line: coverage ≥ 0.85 and CER ≤ 0.15 (anything else, or unheard, is REVIEW)
  const check = await verifyLine(ctx, line.file, text, line.language, 'line');
  const status: VoiceIdentity['status'] = check?.ok ? 'ACTIVE' : 'REVIEW';

  // 4) into the studio in one batch: the audio first, then its sample, then the identity that cites both
  const sampleId = nid('voice'); const assetId = nid('gen');
  const stored = await adoptFile(assetId, line.file, { expectKind: 'AUDIO' });
  const identity: VoiceIdentityInput = {
    ...head, mode, referenceSampleId: ref?.sample?.id, referenceAssetId: ref?.asset.id, referenceWindow: ref?.window?.assetId ? { from: ref.window.from, to: ref.window.to, assetId: ref.window.assetId } : undefined, referenceText: ref?.text,
    language: c.language, dialect: c.dialect, params, proof: { sampleId, assetId, text, wer: check?.wer, cer: check?.cer, coverage: check?.coverage, heard: check?.heard }, status, engineVersion: line.model, jobId: ctx.job.id,
  };
  try {
    await commands([
      { name: 'addAsset', args: [assetFromStored(assetId, stored, { label: `${c.name} — voice proof`, tags: ['voice', 'generated', 'proof'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref?.asset.id, window: ref?.window, params, check } })] },
      { name: 'addVoiceSample', args: [c.id, { id: sampleId, label: `Proof line (${line.engine})`, assetId, source: 'GENERATED', text, language: line.language, durationSeconds: stored.probe?.durationSeconds, jobId: ctx.job.id }, false] },
      { name: 'setVoiceIdentity', args: [c.id, identity] },
    ], 'worker');
  } catch (e) { await removeFile(stored.relPath); throw e; }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await recordMetric('voice.build_ms', line.ms, 'ms', { engine: line.engine }, ctx.job.id);
  // the voice is handed to the production only with its proof: a line spoken and heard back
  await recordQaReport({ subjectKind: 'CHARACTER', subjectId: c.id, inspectorId: 'audio-sync-inspector', checks: [{ name: 'proof-line-heard', ok: check !== null, detail: check ? `heard: ${check.heard.slice(0, 120)}` : 'transcription unavailable' }, { name: 'proof-line-coverage', ok: Boolean(check && check.coverage >= PROOF_COVERAGE), value: check ? Number(check.coverage.toFixed(2)) : undefined, threshold: PROOF_COVERAGE }, { name: 'proof-line-cer', ok: Boolean(check && check.cer <= VOICE_GATES.cer), value: check ? Number(check.cer.toFixed(2)) : undefined, threshold: VOICE_GATES.cer, detail: 'character error rate after the dialect fold' }, { name: 'word-error-rate', ok: true, value: check ? Number(check.wer.toFixed(2)) : undefined, detail: 'reported, not gated' }], decision: status === 'ACTIVE' ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [assetId], jobId: ctx.job.id, notes: `voice of ${c.name} (${line.engine}, ${mode.toLowerCase()})${check?.reasons.length ? `; ${check.reasons.join('; ')}` : ''}` });
  await ctx.activity('VOICE_BUILT', `${c.name}'s voice pinned (${line.engine}, ${mode.toLowerCase()}); proof line ${check ? `${Math.round(check.coverage * 100)} % heard, CER ${Math.round(check.cer * 100)} %${check.ok ? '' : ' — review'}` : 'not verified — review'}`, { characterId: c.id, engine: line.engine, coverage: check?.coverage, cer: check?.cer, wer: check?.wer, status });
  return { identity: { ...head, mode, status, referenceAssetId: ref?.asset.id, params }, sampleAssetId: assetId, proofSampleId: sampleId, engine: line.engine, check, awaitingReview: status !== 'ACTIVE' };
};

// ---------------------------------------------------------------------------------------------- VOICE_PREVIEW

export const voicePreview: Handler = async (ctx) => {
  const { characterId, text, emotion } = ctx.job.payload as { characterId: string; text: string; emotion?: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  const dir = await tmpDir('voice');
  const ref = await referenceWav(c, state.assets, dir);
  if (!ref) throw missingReference(`${c.name} has no uploaded recording to speak with. Upload a short clip of the voice first.`, { characterId });
  await ctx.progress('GENERATING', { phase: 'speaking', message: `Speaking as ${c.name}` });
  const line = await speakLine(ctx, c, text, ref, dir, { emotion });
  const check = await verifyLine(ctx, line.file, text, line.language);
  const id = nid('gen');
  const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
  await commands([
    { name: 'addAsset', args: [assetFromStored(id, stored, { label: `${c.name} — “${text.slice(0, 40)}”`, tags: ['voice', 'preview'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref.asset.id, check } })] },
    { name: 'addVoiceSample', args: [c.id, { label: text.slice(0, 48), assetId: id, source: 'GENERATED', text, language: line.language, durationSeconds: stored.probe?.durationSeconds, jobId: ctx.job.id }, false] },
  ], 'worker');
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  return { assetId: id, engine: line.engine, durationSeconds: stored.probe?.durationSeconds, check, awaitingReview: check === null || !check.ok };
};

// --------------------------------------------------------------------------------------------- DIALOGUE_AUDIO

/** A line's stored recording is current when its file exists and the voice that spoke it is the one pinned now. */
export function lineRecordingCurrent(d: { audioAssetId?: string; voiceRevision?: number }, c: Pick<Character, 'voice'>, assets: Asset[]): boolean {
  if (!d.audioAssetId) return false;
  const a = assets.find((x) => x.id === d.audioAssetId);
  if (!a || a.kind !== 'AUDIO' || a.unavailable) return false;
  const rev = c.voice.identity?.revision;
  return rev === undefined ? true : d.voiceRevision === rev;
}

export const dialogueAudio: Handler = async (ctx) => {
  const { productionId, shotIds, force } = ctx.job.payload as { productionId: string; shotIds?: string[]; force?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId) as Production | undefined;
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  const dir = await tmpDir('dialogue');
  const refs = new Map<string, Reference | null>();
  const lines = p.shots.filter((sh) => !shotIds?.length || shotIds.includes(sh.id)).flatMap((sh) => sh.dialogue.filter((d) => { const c = cast.find((x) => x.id === d.characterId); return force || !c || !lineRecordingCurrent(d, c, state.assets); }).map((d) => ({ sh, d })));
  if (lines.length === 0) return { lines: 0, message: 'every line already has a current recording' };
  let done = 0; let flagged = 0; let unverified = 0;
  for (const { sh, d } of lines) {
    const c = cast.find((x) => x.id === d.characterId);
    if (!c) continue;
    if (!refs.has(c.id)) refs.set(c.id, await referenceWav(c, state.assets, dir));
    const ref = refs.get(c.id);
    if (!ref) { await ctx.event('warn', `${c.name} has no uploaded voice recording; line skipped`, { shotId: sh.id, lineId: d.id }); continue; }
    const text = p.language === 'AR' ? (d.textAr || d.text) : d.text;
    if (!text?.trim()) continue;
    await ctx.progress('GENERATING', { phase: 'recording', message: `${c.name}: “${text.slice(0, 40)}”`, step: done + 1, total: lines.length });
    let line = await speakLine(ctx, c, text, ref, dir, { delivery: d.delivery });
    let check = await verifyLine(ctx, line.file, text, line.language);
    if (shouldRegenerate(check)) { await ctx.event('warn', `line failed the gate (${check!.reasons.join('; ')}), regenerating once`, { heard: check!.heard, coverage: check!.coverage, cer: check!.cer }); line = await speakLine(ctx, c, text, ref, dir, { delivery: d.delivery }); check = await verifyLine(ctx, line.file, text, line.language); }
    if (check === null) unverified++; else if (!check.ok) flagged++;
    const id = nid('gen');
    const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
    await commands([
      { name: 'addAsset', args: [assetFromStored(id, stored, { label: `${p.title} ${sh.number} — ${c.name}: “${text.slice(0, 32)}”`, tags: ['dialogue', 'voice'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, characterId: c.id, shotId: sh.id, lineId: d.id, voiceRevision: c.voice.identity?.revision, check } })] },
      { name: 'setDialogueAudio', args: [p.id, sh.id, d.id, { audioAssetId: id, durationSeconds: stored.probe?.durationSeconds ?? line.durationSeconds ?? 0, voiceRevision: c.voice.identity?.revision }] },
    ], 'worker');
    done++;
    await ctx.checkpoint();
  }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  // the dialogue is handed to Video Production: every requested line recorded, flagged lines named
  const fresh = (await readState()).state.productions.find((x) => x.id === p.id)!;
  const missing = fresh.shots.flatMap((sh) => sh.dialogue.filter((d) => !d.audioAssetId)).length;
  await recordHandoff({ productionId: p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: fresh.shots.flatMap((sh) => sh.dialogue.map((d) => d.audioAssetId).filter((x): x is string => Boolean(x))), outputVersions: { lines: done }, validation: { ok: missing === 0 && flagged === 0 && unverified === 0, checks: [{ name: 'every-line-recorded', ok: missing === 0, detail: missing ? `${missing} line(s) without a recording` : undefined }, { name: 'no-line-flagged', ok: flagged === 0, detail: flagged ? `${flagged} line(s) drifted from the script (coverage < ${LINE_COVERAGE} or CER > ${VOICE_GATES.cer})` : undefined }, { name: 'every-line-heard-back', ok: unverified === 0, detail: unverified ? `${unverified} line(s) could not be transcribed; review them` : undefined }] }, jobId: ctx.job.id });
  await ctx.activity('DIALOGUE_RECORDED', `${done} line(s) recorded for “${p.title}”${flagged ? `, ${flagged} flagged for review` : ''}${unverified ? `, ${unverified} not heard back` : ''}`, { lines: done, flagged, unverified });
  return { lines: done, flagged, unverified, awaitingReview: flagged > 0 || unverified > 0 };
};
