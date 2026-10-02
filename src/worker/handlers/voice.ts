import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, Production, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import type { JobPayloadParsed } from '@/domain/jobs';
import { commands, command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor, removeFile } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { REFERENCE_WINDOW, analyseSilence, chooseWindow, parseSilences, staticGainDb, trimReference } from '@/server/studio/voice-reference';
import { pickEngine, scriptCoverage, synthesize, transcribe, wordErrorRate, type TtsEngine } from '@/server/providers/speech';
import * as minimax from '@/server/providers/minimax';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { registerUnloader } from '../gpu';
import { unloadAsr, unloadTts } from '@/server/providers/speech';
import { recordHandoff, recordQaReport } from '@/server/org/runs';
import { guardVoiceChange, isCloneSource } from '@/domain/rules';
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

/** Gates (contract §1.4): a recorded line must cover this much of its script, in order; WER is reported, not gated.
 *  CER after the dialect fold joins the gate when the Voice agent's metric lands in speech.ts. */
export const LINE_COVERAGE = 0.85;
export const PROOF_COVERAGE = 0.85;
export { REFERENCE_WINDOW, chooseWindow, parseSilences, staticGainDb, analyseSilence, trimReference };

const missingReference = (message: string, details: Record<string, unknown> = {}) => Object.assign(new StudioError('INVALID', message, { ...details, failureClass: 'MISSING_REFERENCE' }), { failureClass: 'MISSING_REFERENCE' });

// ----------------------------------------------------------------------------------------------- pure helpers

/** Which script a line is written in: Arabic letters only, Latin letters only, both, or neither (numerals, marks). */
export function lineScript(text: string): 'AR' | 'LATIN' | 'MIXED' | 'NONE' {
  const ar = /[؀-ۿݐ-ݿ]/.test(text);
  const latin = /[A-Za-z]{2,}/.test(text);
  return ar && latin ? 'MIXED' : ar ? 'AR' : latin ? 'LATIN' : 'NONE';
}

/** The language a line is spoken and verified in: its script decides; a line with no letters follows the character. */
export function lineLanguage(text: string, fallback: Language): Language {
  const s = lineScript(text);
  return s === 'AR' ? 'AR' : s === 'LATIN' ? 'EN' : fallback;
}

export interface LineRoute { engine: Exclude<TtsEngine, 'auto'>; language: Language; script: ReturnType<typeof lineScript>; /** set when the line left the identity's engine: the reason, for the job event */ fallback?: string }

/** ROUTING PARITY — the engine and the verification language follow the line's script, identically in every
 *  handler: Arabic script → the character's Arabic engine (the pinned one when the identity is Arabic, else the
 *  one its dialect calls for); Latin only → IndexTTS; mixed → IndexTTS with the fallback named. The identity's
 *  `model` is never rewritten by a fallback. */
export function routeLine(c: Pick<Character, 'language' | 'dialect' | 'voice'>, text: string): LineRoute {
  const script = lineScript(text);
  const id = c.voice.identity;
  const pinned = id?.provider === 'LOCAL_TTS' && (id.model === 'habibi' || id.model === 'indextts') ? (id.model as 'habibi' | 'indextts') : undefined;
  const arabicEngine = id?.language === 'AR' && pinned ? pinned : pickEngine('AR', c.dialect);
  if (script === 'AR') return { engine: arabicEngine, language: 'AR', script };
  if (script === 'LATIN') return { engine: 'indextts', language: 'EN', script, fallback: pinned === 'habibi' ? 'Latin-only line: the Iraqi engine has no English, spoken by IndexTTS with the same reference' : undefined };
  if (script === 'MIXED') return { engine: 'indextts', language: c.language, script, fallback: pinned === 'habibi' ? 'mixed-script line: spoken by IndexTTS (bilingual) instead of the Iraqi engine, same reference' : undefined };
  return { engine: pinned ?? pickEngine(c.language, c.dialect), language: c.language, script };
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
 *  there is nothing to clone from. The window stored at upload is used as it is; otherwise it is cut here. */
export async function referenceWav(c: Character, assets: Asset[], dir: string, opts: { sampleId?: string } = {}): Promise<Reference | null> {
  const pick = pickReference(c, assets, opts);
  if (!pick) return null;
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
  const { silences, durationSeconds } = await analyseSilence(src);
  const window = chooseWindow(silences, durationSeconds || pick.asset.durationSeconds || REFERENCE_WINDOW.maxSeconds);
  const out = path.join(dir, `ref-${c.id}.wav`);
  await trimReference(src, out, window);
  return { file: out, asset: pick.asset, sample: pick.sample, text, window, via: pick.via };
}

/** What the reference recording says. Habibi (F5-TTS) conditions on the reference transcript; it is stored once on
 *  the sample (at upload, or here on first use) and never transcribed again. */
export async function referenceText(ctx: HandlerContext, c: Character, ref: Reference): Promise<string | undefined> {
  if (ref.text !== undefined) return ref.text || undefined;
  try {
    const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(ref.file, { language: 'auto' }), { label: 'reference text' }), { jobId: ctx.job.id });
    ref.text = t.text.trim();
    if (ref.sample && ref.text) await command('updateVoiceSample', [c.id, ref.sample.id, { text: ref.text, language: t.language === 'ar' ? 'AR' : t.language === 'en' ? 'EN' : undefined }], 'worker');
  } catch (e) { await ctx.event('warn', `reference transcription skipped: ${(e as Error).message}`); ref.text = ''; }
  return ref.text || undefined;
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

export interface LineCheck { ok: boolean; wer: number; coverage: number; heard: string }

/** Say the line back: transcribe in the line's language and compare. `null` means the line could not be heard
 *  back (the transcription service was away): callers treat that as unverified — flagged for review, never passed. */
export async function verifyLine(ctx: HandlerContext, file: string, text: string, language: Language, gate = LINE_COVERAGE): Promise<LineCheck | null> {
  try {
    const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(file, { language: language === 'AR' ? 'ar' : 'en' }), { label: 'verify line' }), { jobId: ctx.job.id });
    const coverage = scriptCoverage(text, t.text, language);
    return { ok: coverage >= gate, wer: wordErrorRate(text, t.text, language), coverage, heard: t.text };
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
  // the voice of a character who has been in a video is preserved like their face (VOICE_LOCKED)
  if (c.voice.identity) guardVoiceChange(c, 'rebuild the voice');
  const dir = await tmpDir('voice');
  const useMinimax = mode === 'MANUAL' || ((payload.provider ?? state.settings.generation?.voiceProvider) === 'MINIMAX' && Boolean(env().MINIMAX_API_KEY));
  if (mode === 'MANUAL' && !env().MINIMAX_API_KEY) throw new StudioError('NOT_CONFIGURED', 'A catalogue voice needs the hosted speech provider: MINIMAX_API_KEY is not set.');

  // 1) the reference: the producer's upload, never a generated line
  let ref: Reference | null = null;
  if (mode !== 'MANUAL') {
    ref = await referenceWav(c, state.assets, dir, mode === 'REFERENCE' ? { sampleId: payload.referenceSampleId } : {});
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
      await ctx.progress('GENERATING', { phase: 'cloning', message: 'Cloning the voice with MiniMax' });
      const voiceId = `vb_${c.id.replace(/[^a-z0-9]/gi, '').slice(0, 20)}_${Date.now().toString(36)}`;
      const r = await ctx.tool('speech.clone_voice', () => minimax.cloneVoice({ file: ref!.file, voiceId, languageBoost: c.language === 'AR' ? 'Arabic' : 'English' }));
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
  const check = await verifyLine(ctx, line.file, text, line.language, PROOF_COVERAGE);
  const status: VoiceIdentity['status'] = check?.ok ? 'ACTIVE' : 'REVIEW';

  // 4) into the studio in one batch: the audio first, then its sample, then the identity that cites both
  const sampleId = nid('voice'); const assetId = nid('gen');
  const stored = await adoptFile(assetId, line.file, { expectKind: 'AUDIO' });
  const identity: VoiceIdentityInput = {
    ...head, mode, referenceSampleId: ref?.sample?.id, referenceAssetId: ref?.asset.id, referenceWindow: ref?.window?.assetId ? { from: ref.window.from, to: ref.window.to, assetId: ref.window.assetId } : undefined, referenceText: ref?.text,
    language: c.language, dialect: c.dialect, params, proof: { sampleId, assetId, text, wer: check?.wer, coverage: check?.coverage, heard: check?.heard }, status, engineVersion: line.model, jobId: ctx.job.id,
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
  await recordQaReport({ subjectKind: 'CHARACTER', subjectId: c.id, inspectorId: 'audio-sync-inspector', checks: [{ name: 'proof-line-heard', ok: check !== null, detail: check ? `heard: ${check.heard.slice(0, 120)}` : 'transcription unavailable' }, { name: 'proof-line-coverage', ok: Boolean(check?.ok), value: check ? Number(check.coverage.toFixed(2)) : undefined, threshold: PROOF_COVERAGE }, { name: 'word-error-rate', ok: true, value: check ? Number(check.wer.toFixed(2)) : undefined, detail: 'reported, not gated' }], decision: status === 'ACTIVE' ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [assetId], jobId: ctx.job.id, notes: `voice of ${c.name} (${line.engine}, ${mode.toLowerCase()})` });
  await ctx.activity('VOICE_BUILT', `${c.name}'s voice pinned (${line.engine}, ${mode.toLowerCase()}); proof line ${check ? `${Math.round(check.coverage * 100)} % heard` : 'not verified — review'}`, { characterId: c.id, engine: line.engine, coverage: check?.coverage, wer: check?.wer, status });
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
    if (check && !check.ok) { await ctx.event('warn', `line drifted (${Math.round(check.coverage * 100)} % heard, WER ${(check.wer * 100).toFixed(0)} %), regenerating once`, { heard: check.heard }); line = await speakLine(ctx, c, text, ref, dir, { delivery: d.delivery }); check = await verifyLine(ctx, line.file, text, line.language); }
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
  await recordHandoff({ productionId: p.id, stage: 'AUDIO_PREP', producerDepartment: 'SOUND', receiverDepartment: 'VIDEO', artifactIds: fresh.shots.flatMap((sh) => sh.dialogue.map((d) => d.audioAssetId).filter((x): x is string => Boolean(x))), outputVersions: { lines: done }, validation: { ok: missing === 0 && flagged === 0 && unverified === 0, checks: [{ name: 'every-line-recorded', ok: missing === 0, detail: missing ? `${missing} line(s) without a recording` : undefined }, { name: 'no-line-flagged', ok: flagged === 0, detail: flagged ? `${flagged} line(s) drifted from the script (coverage < ${LINE_COVERAGE})` : undefined }, { name: 'every-line-heard-back', ok: unverified === 0, detail: unverified ? `${unverified} line(s) could not be transcribed; review them` : undefined }] }, jobId: ctx.job.id });
  await ctx.activity('DIALOGUE_RECORDED', `${done} line(s) recorded for “${p.title}”${flagged ? `, ${flagged} flagged for review` : ''}${unverified ? `, ${unverified} not heard back` : ''}`, { lines: done, flagged, unverified });
  return { lines: done, flagged, unverified, awaitingReview: flagged > 0 || unverified > 0 };
};
