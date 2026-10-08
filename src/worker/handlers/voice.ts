import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { step } from './step';
import { StudioError, consentRequired, missingReference } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, Production, VoiceConsent, VoiceDesignRecord, VoiceIdentity, VoiceOrigin, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import type { JobPayloadParsed } from '@/domain/jobs';
import { commands, command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, removeFile, sha256File } from '@/server/media';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { engineOutputTag, formatTags, pickReferenceWindow, speechRegions, trimReference } from '@/server/media/voice-check';
import { unconfirmableCh } from '@/server/media/arabic-align';
import { REFERENCE_WINDOW } from '@/server/studio/voice-reference';
import { isQaUnavailable, transcribeQwen } from '@/server/providers/qa-service';
import { VOICE_GATES, latinFallbackOf, lineScript, pickEngine, routeLine as routeLineByScript, synthesize, transcribe, verdict, type LineScript, type TtsEngine, type VoiceVerdict } from '@/server/providers/speech';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { VOICE_ENGINES, durationFor, isLocalTtsEngine, pinnable, ttsVramFor, type LocalTtsEngine } from '@/server/providers/voice-engines';
import { cutWavStart, leadInCutPoint, quietestPoint, readPcm16 } from '@/server/media/lead-in';
import * as minimax from '@/server/providers/minimax';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { recordHandoff, recordQaReport } from '@/server/org/runs';
import { designChoiceProblem } from '@/server/org/preflight';
import { guardVoiceBuild, isCloneSource } from '@/domain/rules';
import { automaticVoicePlan, designedSeedProblem, initialDialectStatus, isConsentedUpload, isIraqi, languageLabel, languageProfileNotes, lineRecordingCurrent, pickReference, rankDesignCandidates, rankingFor, speakingAs, spokenLanguages, tagDesignId, usableRecordingAsset, voiceLabels, type ReferenceOptions, type ReferencePick } from '@/domain/voice-identity';
import type { VoiceIdentityInput } from '@/domain/actions';
import { assetFile, heardMetrics, measureVoiceLine, speedForPace } from './voice-measure';
import { designAndMeasure, designSummary } from './voice-design';

/** The seed a voice build pins: the character's and the next identity revision's (FNV-1a), so a retried build makes
 *  the same voice and a deliberate rebuild (a new revision) a new one. Inside the design service's seed range. */
export function voiceSeedOf(c: Pick<Character, 'id' | 'voice'>): number {
  let h = 2166136261;
  for (const ch of `${c.id}:voice:${(c.voice.identity?.revision ?? 0) + 1}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % (2 ** 31 - 4);
}

/** VOICES — one persistent identity per character (which engine, which reference, which revision), a preview line,
 *  and the recording of every dialogue line of a production. The reference is a consented recording or a studio
 *  design seed with its record (Rule V-DESIGN), never a generated line. Each generated line is transcribed back and
 *  compared with the script; a line that drifts too far is kept and flagged (never re-spoken automatically); a line
 *  that could not be heard back is flagged too, never passed. Contracts: docs/CONTRACTS-CHARACTER-VOICE.md §1.4,
 *  docs/CONTRACTS-VOICE-IDENTITY-V2.md. */

// the voice engines' unloaders are built into the shared GPU lease (src/server/gpu/unloaders.ts, step 8)

export { speedForPace };

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
const pinnedEngine = (c: Pick<Character, 'language' | 'voice'>): LocalTtsEngine | undefined => {
  const id = c.voice.identity;
  return id?.provider === 'LOCAL_TTS' && id.language === c.language ? pinnable(id.model, c.language) : undefined;
};

/** ROUTING PARITY — a thin adapter over THE routing rule (`routeLine` in src/server/providers/speech.ts, which the
 *  Iraqi suite uses too): the engine and the verification language follow the line's script — Arabic script → the
 *  character's engine (the pinned one); Latin only → IndexTTS; mixed → IndexTTS, heard in the language most of its
 *  letters are in; the fallback is named for the job event. The identity's `model` is never rewritten. */
export function routeLine(c: Pick<Character, 'language' | 'dialect' | 'voice'>, text: string, engine?: LocalTtsEngine): LineRoute {
  const r = routeLineByScript(text, c.language, c.dialect, engine ?? pinnedEngine(c));
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

/** THE REFERENCE RULE and the stored-line rule live in src/domain/voice-identity.ts (pure), so the take preflight asks
 *  the same questions as this worker. */
export { lineRecordingCurrent, pickReference };
export type { ReferenceOptions, ReferencePick };

/** The uploads a character has that could be cloned from but for a consent statement (for the refusal's words). */
export const unconsentedUploads = (c: Character, assets: Asset[]): VoiceSample[] => c.voice.samples.filter((s) => isCloneSource(s) && !isConsentedUpload(s) && usableRecordingAsset(assets.find((a) => a.id === s.assetId)));

// ----------------------------------------------------------------------------------------- reference on disk

export interface Reference {
  file: string; asset: Asset; sample?: VoiceSample;
  /** what the recording says, read from the sample (stored once at upload); transcribed on first use when absent. For
   *  a design seed: the calibration sentence it speaks (the record's) */
  text?: string;
  /** the stretch of the original the engine hears, and its stored asset when the window was stored at upload */
  window?: { from: number; to: number; assetId?: string };
  via: ReferencePick['via'];
  /** the identity origin this reference gives a voice (LEGACY_UPLOAD: speaking only, never a new build) */
  origin: Extract<VoiceOrigin, 'UPLOAD_CONSENTED' | 'DESIGNED'> | 'LEGACY_UPLOAD';
  consent?: VoiceConsent;
  /** a design seed: its record, candidate and the sha256 the file was checked against */
  design?: { designId: string; candidate: number; sha256: string; gateOk: boolean };
}

/** RULE V-DESIGN AT THE CLONE BOUNDARY — a design seed is spoken from only when the file as found hashes to its design
 *  record's sha256 (and the asset's, and the pinned identity's), its provenance tag names the same design, and the line
 *  engine hears all of it. Anything else is refused MISSING_REFERENCE, whatever path brought the file in. */
async function designedReference(c: Character, pick: ReferencePick): Promise<Reference> {
  const { record, candidate } = pick.design!;
  const file = assetFile(pick.asset);
  const tags = await formatTags(file);
  const fileSha256 = await sha256File(file).catch(() => '');
  const problem = designedSeedProblem(c, { designId: record.id, assetId: pick.asset.id, fileSha256, assetSha256: pick.asset.sha256, pinnedSha256: pick.via === 'IDENTITY' ? c.voice.identity?.seedSha256 : undefined, tagDesignId: tagDesignId([tags.comment, tags.icmt].filter(Boolean).join(' ')) });
  if (problem) throw missingReference(`Rule V-DESIGN refused ${c.name}'s design seed: ${problem}. A designed voice is cloned only from its own recorded seed; design the voice again.`, { characterId: c.id, designId: record.id, assetId: pick.asset.id });
  return { file, asset: pick.asset, text: record.text, via: pick.via, origin: 'DESIGNED', design: { designId: record.id, candidate: candidate.index, sha256: candidate.sha256, gateOk: candidate.gate.ok } };
}

/** The character's reference as the engine takes it (mono 24 kHz, ≤ 12 s, −20 LUFS), or null when there is nothing
 *  to clone from. A design seed is that already (checked by Rule V-DESIGN). For a recording, the window stored at
 *  upload is used as it is; otherwise it is cut here with the one measurement stack (voice-check). A recording without
 *  a consent statement is refused CONSENT_REQUIRED (an identity pinned from it before consent existed keeps speaking
 *  from it); a file the studio's own engine made is refused whatever path brought it in (finding 7: the
 *  synthetic-speech tag docker/tts writes is read here and at upload — no design record can make an upload DESIGNED). */
export async function referenceWav(c: Character, assets: Asset[], dir: string, opts: ReferenceOptions = {}): Promise<Reference | null> {
  const pick = pickReference(c, assets, opts);
  if (!pick) return null;
  if (pick.kind === 'DESIGNED') return designedReference(c, pick);
  if (pick.kind === 'UNCONSENTED' || (pick.kind === 'LEGACY' && opts.purpose === 'BUILD')) throw consentRequired(`“${pick.sample?.label ?? pick.asset.label}” has no consent statement; confirm that it is ${c.name}'s voice used with permission (your own voice, or the speaker's permission) before a voice is cloned from it.`, { characterId: c.id, sampleId: pick.sample?.id });
  const engine = await engineOutputTag(assetFile(pick.asset));
  if (engine) throw missingReference(`“${pick.sample?.label ?? pick.asset.label}” is the studio's own engine output (${engine.split(' · ')[0]}), not a recording; upload a real recording of ${c.name}'s voice.`, { characterId: c.id, assetId: pick.asset.id, engineOutput: engine });
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  const text = pick.sample?.text?.trim() || c.voice.identity?.referenceText?.trim() || undefined;
  // the trimmed window stored with the upload, or the one the identity was built with
  const storedWindowId = pick.sample?.provenance?.trimmedAssetId ?? (pick.via === 'IDENTITY' ? c.voice.identity?.referenceWindow?.assetId : undefined);
  const stored = byId(storedWindowId);
  const origin: Reference['origin'] = pick.kind === 'CONSENTED' ? 'UPLOAD_CONSENTED' : 'LEGACY_UPLOAD';
  const consent = pick.kind === 'CONSENTED' ? pick.sample?.consent : undefined;
  if (stored && stored.kind === 'AUDIO' && !stored.unavailable) {
    const w = pick.sample?.provenance?.window ?? c.voice.identity?.referenceWindow;
    return { file: assetFile(stored), asset: pick.asset, sample: pick.sample, text, window: w ? { from: w.from, to: w.to, assetId: stored.id } : { from: 0, to: stored.durationSeconds ?? 0, assetId: stored.id }, via: pick.via, origin, consent };
  }
  const src = assetFile(pick.asset);
  const speech = await speechRegions(src, { durationSeconds: pick.asset.durationSeconds });
  const found = pickReferenceWindow(speech.regions, speech.durationSeconds);
  // no clear run of speech found: the head of the file, as long as the engines take
  const window = found ? { from: found.from, to: found.to } : { from: 0, to: Math.min(speech.durationSeconds || REFERENCE_WINDOW.maxSeconds, REFERENCE_WINDOW.maxSeconds) };
  const out = path.join(dir, `ref-${c.id}.wav`);
  await trimReference(src, out, window);
  return { file: out, asset: pick.asset, sample: pick.sample, text, window, via: pick.via, origin, consent };
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
    heard = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(ref.file, { language: 'auto' }), { label: 'reference text', input: { file: ref.file, language: 'auto' } }), { jobId: ctx.job.id });
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
export async function speakLine(ctx: HandlerContext, c: Character, text: string, ref: Reference | null, dir: string, opts: { emotion?: string; delivery?: string; /** a target length (s), honoured by an engine with token-level duration control (MOSS) */ targetSeconds?: number; /** a language profile's engine (production or comparison) instead of the routed one */ engine?: LocalTtsEngine } = {}): Promise<SpokenLine> {
  const identity = c.voice.identity;
  // LINE PREPARATION (the Iraqi Arabic Language Specialist's step, for an Iraqi character): the engine and the
  // verification language follow the line's script (a fallback off the Iraqi engine is named below)
  const route = c.dialect === 'IRAQI_BAGHDADI' ? await step(ctx, 'iraqi-specialist', `line-preparation: ${c.name} — “${text.slice(0, 40)}”`, async () => routeLine(c, text, opts.engine)) : routeLine(c, text, opts.engine);
  const provider = (identity?.provider ?? (env().MINIMAX_API_KEY && (await readState()).state.settings.generation?.voiceProvider === 'MINIMAX' ? 'MINIMAX' : 'LOCAL_TTS')) as 'LOCAL_TTS' | 'MINIMAX';
  if (provider === 'MINIMAX') {
    const voiceId = identity?.providerVoiceId;
    if (!voiceId) throw new StudioError('INVALID', 'Build the voice first (MiniMax clone).');
    const hosted = { text, voiceId, languageBoost: route.language === 'AR' ? 'Arabic' : 'English', emotion: opts.emotion };
    const r = await ctx.tool('speech.synthesize', () => minimax.speak({ ...hosted, format: 'wav' }), { label: 'minimax', input: hosted });
    const file = path.join(dir, `mm-${Date.now().toString(36)}.wav`);
    await fsp.writeFile(file, r.bytes);
    return { file, engine: 'minimax', model: env().MINIMAX_SPEECH_MODEL, ms: 0, language: route.language };
  }
  if (!ref) throw missingReference(`${c.name} has no uploaded recording to speak with.`, { characterId: c.id });
  if (route.fallback) await ctx.event('info', `engine fallback for “${text.slice(0, 40)}”: ${route.fallback}`, { characterId: c.id, engine: route.engine, pinned: identity?.model, script: route.script });
  // engines that condition on the reference transcript (Habibi; dots.tts) get it, stored once on the sample
  const refText = VOICE_ENGINES[route.engine].usesReferenceText ? await referenceText(ctx, c, ref) : undefined;
  const params = identity?.params ?? { speed: speedForPace(c.voice.pace), emotionAlpha: 1 };
  // what the engine hears (src/server/providers/iraqi-text.ts): digits as Baghdadi (or MSA) number words, no tatweel
  // or invisible marks, line breaks as sentence ends — the script stays as written and is what the line is verified
  // against (the dialect fold reads spelled numbers back to digits)
  // the studio's pronunciation dictionary: only the entries a native reviewer approved (src/domain/pronunciation.ts)
  const pronunciations = (await readState()).state.settings.voice?.pronunciations;
  const prepared = prepareLineText(text, { engine: route.engine, language: route.language, dialect: c.dialect, pronunciations });
  if (prepared.changes.length) await ctx.event('info', `line prepared for ${route.engine}: ${prepared.changes.join('; ')}`, { characterId: c.id, spoken: prepared.text });
  const local = { text: prepared.text, language: route.language, dialect: c.dialect, referenceWav: ref.file, referenceText: refText, emotion: opts.emotion ?? opts.delivery, emotionAlpha: params.emotionAlpha, speed: params.speed, seed: params.seed, engine: route.engine, ...(durationFor(route.engine, text, opts.targetSeconds) ? { durationSeconds: durationFor(route.engine, text, opts.targetSeconds) } : {}) };
  if (local.durationSeconds && !opts.targetSeconds) await ctx.event('info', `one-word line: ${route.engine} is asked for ${local.durationSeconds} s (its token budget) so it stops after the word`, { characterId: c.id });
  // the lease estimate follows the engine (MOSS-TTS 8B needs far more of the card than IndexTTS)
  const vram = ttsVramFor(route.engine);
  const r = await ctx.gpu('TTS', vram, () => ctx.tool('speech.synthesize', () => synthesize(local, dir), { label: route.engine, input: local }), { jobId: ctx.job.id });
  if (prepared.leadIn) {
    // a one-word line was spoken after a lead-in sentence (lead-in.ts): cut at the silence before the word, found by
    // the transcript's word timings; a take whose word cannot be located is spoken again without the lead-in (and
    // judged by the line check like any other) — the lead-in never reaches a film
    const cut = await cutOneWordLeadIn(ctx, r.file, text, route.language);
    if (cut) { await ctx.event('info', `one-word line cut after its lead-in at ${cut.from.toFixed(2)} s`, { characterId: c.id, heard: cut.heard }); return { file: cut.file, engine: r.engine, model: r.model, ms: r.ms, language: route.language, durationSeconds: cut.durationSeconds, fallback: route.fallback }; }
    await ctx.event('warn', `one-word line: the word was not found after the lead-in; spoken alone instead`, { characterId: c.id });
    const alone = { ...local, text: prepared.text.slice(prepared.leadIn.length).trim() };
    const r2 = await ctx.gpu('TTS', vram, () => ctx.tool('speech.synthesize', () => synthesize(alone, dir), { label: route.engine, input: alone }), { jobId: ctx.job.id });
    return { file: r2.file, engine: r2.engine, model: r2.model, ms: r2.ms, language: route.language, durationSeconds: r2.durationSeconds, fallback: route.fallback };
  }
  return { file: r.file, engine: r.engine, model: r.model, ms: r.ms, language: route.language, durationSeconds: r.durationSeconds, fallback: route.fallback };
}

/** The cut of a one-word line's lead-in (src/server/media/lead-in.ts): transcribe with word timings, find the line's
 *  word as the last thing heard, cut at the quietest 10 ms between the lead-in and it. `null` when the transcription
 *  is away or the word is not found. */
async function cutOneWordLeadIn(ctx: HandlerContext, file: string, line: string, language: Language): Promise<{ file: string; from: number; durationSeconds: number; heard: string } | null> {
  try {
    const asr = { file, language: language === 'AR' ? ('ar' as const) : ('en' as const) };
    const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(asr.file, { language: asr.language }), { label: 'one-word lead-in', input: asr }), { jobId: ctx.job.id });
    const at = leadInCutPoint(t.segments.flatMap((s) => s.words), line);
    if (!at) return null;
    const wav = await fsp.readFile(file);
    const { samples, sampleRate } = readPcm16(wav);
    const from = quietestPoint(samples, sampleRate, at.from, at.to);
    const out = file.replace(/\.wav$/i, '-cut.wav');
    const cut = cutWavStart(wav, from);
    await fsp.writeFile(out, cut);
    return { file: out, from, durationSeconds: readPcm16(cut).samples.length / sampleRate, heard: t.text };
  } catch (e) { await ctx.event('warn', `one-word line: the lead-in could not be cut (${(e as Error).message})`); return null; }
}

/** What hearing a line back proved. `ok` only on PASS (coverage AND CER within the gate); `status` is the contract's
 *  verdict — FAIL is flagged for the producer (no automatic re-take), REVIEW (just below the gate) goes to a person. */
export interface LineCheck { ok: boolean; status: VoiceVerdict['status']; reasons: string[]; wer: number; cer: number; coverage: number; heard: string;
  /** the Whisper reference reading beside the primary (Qwen3-ASR) one; the language Qwen3-ASR detected; which judged */
  heardReference?: string; detectedLanguage?: string; asr?: 'qwen3-asr' | 'whisper' }

/** THE GATE (contract §1.4, v2 §4) on a line and what was heard: word coverage (Arabic on the space-insensitive
 *  alignment of src/server/media/arabic-align.ts — «گلتلك» written «قلت لك» is heard, «باچر» written «باسر» is not),
 *  CER after the dialect fold, WER for the report — and the verdict for a recorded line ('line') or a take's clip
 *  ('take'). «چ» cannot be confirmed by ASR (the Iraqi A/B: never written چ/ج/تش in 36 tries, a real Iraqi clip
 *  included): a line that fails only on words with چ is REVIEW for a listener, "چ not confirmable by ASR", never FAIL;
 *  the numbers recorded stay the measured ones. Pure. */
export function judgeHeard(text: string, heard: string, language: Language, context: 'line' | 'take' = 'line'): LineCheck {
  // A TAKE'S REPEAT IS NOT A WRONG LINE (2026-10-08, "The Relief" 1.5: "Duty calls. Duty calls." — every word right,
  // CER 1.10, rejected): coverage already ignores a repeated phrase, and the repeat is flagged on its own for review
  // (no-repeated-speech); the characters are compared after an immediate repeat is folded away
  const m = heardMetrics(text, context === 'take' ? withoutImmediateRepeats(heard) : heard, language);
  const v = verdict({ coverage: m.coverage, cer: m.cer, context });
  let status = v.status; let reasons = v.reasons;
  if (language === 'AR' && status !== 'PASS') {
    const ch = unconfirmableCh(text, heard);
    if (ch.blocks.length) {
      const f = heardMetrics(text, ch.forgiven, 'AR');
      const fv = verdict({ coverage: f.coverage, cer: f.cer, context });
      const why = `چ not confirmable by ASR: ${ch.blocks.map((b) => `«${b.ref.join(' ')}» heard «${b.hyp.join(' ')}»`).join(', ')} — a listener decides`;
      if (fv.status !== 'FAIL') { status = 'REVIEW'; reasons = fv.status === 'PASS' ? [why] : [...v.reasons, why]; }
    }
  }
  return { ok: status === 'PASS', status, reasons, wer: m.wer, cer: m.cer, coverage: m.coverage, heard };
}

/** The heard text with every phrase that immediately repeats the words before it removed ("Duty calls. Duty calls." →
 *  "Duty calls."), compared word by word without case or punctuation. Pure (tested). */
export function withoutImmediateRepeats(heard: string): string {
  const words = heard.split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let skipped = 0;
    for (let n = Math.min(8, out.length, words.length - i); n >= 1; n--) {
      const prev = out.slice(out.length - n).map(key); const next = words.slice(i, i + n).map(key);
      if (prev.every((w, k) => w && w === next[k])) { skipped = n; break; }
    }
    if (skipped) { i += skipped; continue; }
    out.push(words[i]); i++;
  }
  return out.join(' ');
}

/** A heard line that failed the gate outright. It is KEPT and flagged for the producer like every other line below the
 *  gate — never spoken again automatically (the first-attempt rule; the old name "shouldRegenerate" is gone because no
 *  caller may regenerate). An unheard one (null) is flagged as unverified. */
export const isFailedCheck = (check: LineCheck | null): boolean => check?.status === 'FAIL';

/** TWO READINGS, ONE VERDICT (the production stack: Qwen3-ASR-1.7B primary, Whisper the reference). The verdict is
 *  Qwen3-ASR's (auto language — a forced language can translate instead of transcribe); the Whisper reading (the
 *  Arabic-dialect model for Arabic) stands beside it, and where one passes the line and the other fails it the line
 *  goes to REVIEW for a listener — neither reading alone accepts or condemns it. A language Qwen3-ASR detected that
 *  is not the line's own is flagged too. With only one reading available, that one judges, and the reason says so.
 *  Pure (tested). */
export function combineReadings(text: string, language: Language, context: 'line' | 'take', primary: { text: string; detected: string | null } | null, reference: string | null): LineCheck | null {
  if (!primary && reference === null) return null;
  if (!primary) { const r = judgeHeard(text, reference!, language, context); return { ...r, reasons: [...r.reasons, 'heard by Whisper alone (Qwen3-ASR unavailable)'], asr: 'whisper' }; }
  const p = judgeHeard(text, primary.text, language, context);
  const r = reference !== null ? judgeHeard(text, reference, language, context) : null;
  let status = p.status;
  const reasons = [...p.reasons];
  if (r && ((p.status === 'FAIL' && r.status === 'PASS') || (p.status === 'PASS' && r.status === 'FAIL'))) {
    status = 'REVIEW';
    reasons.push(`the recognisers disagree — Qwen3-ASR heard «${primary.text}», Whisper heard «${reference}»: a listener decides`);
  }
  const want = language === 'AR' ? 'Arabic' : 'English';
  if (primary.detected && primary.detected !== want && status === 'PASS') { status = 'REVIEW'; reasons.push(`Qwen3-ASR detected ${primary.detected}, not ${want}`); }
  else if (primary.detected && primary.detected !== want) reasons.push(`Qwen3-ASR detected ${primary.detected}, not ${want}`);
  if (!r) reasons.push('no Whisper reference reading');
  return { ...p, ok: status === 'PASS', status, reasons, heardReference: reference ?? undefined, detectedLanguage: primary.detected ?? undefined, asr: 'qwen3-asr' };
}

/** Say the line back with both recognisers and judge it (`combineReadings`). `null` means the line could not be heard
 *  back at all (both services away): callers treat that as unverified — flagged, never passed. */
export async function verifyLine(ctx: HandlerContext, file: string, text: string, language: Language, context: 'line' | 'take' = 'line'): Promise<LineCheck | null> {
  const lang = language === 'AR' ? ('ar' as const) : ('en' as const);
  let primary: { text: string; detected: string | null } | null = null;
  try {
    const q = await ctx.gpu('ASR', 6000, () => ctx.tool('speech.transcribe_qwen', () => transcribeQwen(file), { label: 'verify line (Qwen3-ASR)', input: { file, language: 'auto' } }), { jobId: ctx.job.id });
    if (isQaUnavailable(q)) await ctx.event('warn', `Qwen3-ASR unavailable (${q.reason}); the line is checked by Whisper alone`);
    else primary = { text: q.text, detected: q.detectedLanguage };
  } catch (e) { await ctx.event('warn', `Qwen3-ASR failed (${(e as Error).message}); the line is checked by Whisper alone`); }
  let reference: string | null = null;
  try {
    const asr = { file, language: lang };
    const t = await ctx.gpu('ASR', 4000, () => ctx.tool('speech.transcribe', () => transcribe(asr.file, { language: asr.language }), { label: 'verify line (Whisper reference)', input: asr }), { jobId: ctx.job.id });
    reference = t.text;
  } catch (e) { await ctx.event('warn', `Whisper unavailable (${(e as Error).message}); no reference reading`); }
  const check = combineReadings(text, language, context, primary, reference);
  if (!check) await ctx.event('warn', 'neither recogniser could hear the line back; it is flagged for review');
  return check;
}

// ------------------------------------------------------------------------------------------------ VOICE_BUILD

/** The proof sentence in the character's language. An Arabic line names the character only by an Arabic name: a Latin
 *  name inside it would be measured against how the transcriber spells it in Arabic (and route the line as mixed). */
export const proofLineFor = (c: Pick<Character, 'language' | 'dialect' | 'name' | 'nameAr'>) => {
  if (c.language !== 'AR') return `Hello. My name is ${c.name}, and this is my voice.`;
  const nameAr = c.nameAr?.trim() || (lineScript(c.name) === 'AR' ? c.name.trim() : '');
  if (c.dialect === 'IRAQI_BAGHDADI') return nameAr ? `هلا بيك. اني اسمي ${nameAr}، وهذا صوتي.` : 'هلا بيك. هذا صوتي، شلونك اليوم؟';
  return nameAr ? `أهلاً بك. اسمي ${nameAr}، وهذا صوتي.` : 'أهلاً بك. هذا صوتي، وسأقرأ لك اليوم.';
};

/** Build and pin a character's voice (docs/CONTRACTS-VOICE-IDENTITY-V2.md §2). Modes: REFERENCE clones from one
 *  consented upload; DESIGN pins the producer's chosen design candidate; AUTOMATIC uses a consented recording when there
 *  is one, otherwise designs an English or MSA voice from the profile and pins the best measured candidate (Iraqi:
 *  refused without an Iraqi recording — or the designed-seed experiment when switched on, always REVIEW); MANUAL is a
 *  hosted catalogue voice. Nothing is written to the identity until the proof line exists on disk and was heard back
 *  and measured: identity and proof go into the studio in one batch; a failed build leaves the identity as it was (a
 *  design's candidates and record are kept). The proof line is a GENERATED sample and is never the chosen recording. */
export const voiceBuild: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'VOICE_BUILD'>;
  const mode = payload.mode ?? 'AUTOMATIC';
  let { state } = await readState();
  let c = state.characters.find((x) => x.id === payload.characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  // the voice of a character who has been in a video is preserved like their face (VOICE_LOCKED): with an identity it
  // is never rebuilt; locked by the chosen recording alone, it is built only from that recording (AUTOMATIC is held
  // to it, REFERENCE must name it, a design or a catalogue voice is refused) — finding 8
  guardVoiceBuild(c, mode === 'REFERENCE' ? payload.referenceSampleId : mode === 'AUTOMATIC' ? c.voice.selectedSampleId : undefined, 'build the voice');
  if (mode === 'MANUAL' && !env().MINIMAX_API_KEY) throw new StudioError('NOT_CONFIGURED', 'A catalogue voice needs the hosted speech provider: MINIMAX_API_KEY is not set.');
  const dir = await tmpDir('voice');

  // the line engine's parameters to pin — decided first: a design's previews are spoken with the same seed. The seed is
  // the character's and the revision's, never random: an infrastructure retry of this build makes the SAME voice, not a
  // second creative attempt (master plan §1)
  const params: VoiceIdentity['params'] = { speed: speedForPace(c.voice.pace), emotionAlpha: 1, seed: voiceSeedOf(c) };

  // 1) the reference: a consented recording or a recorded design seed (Rule V-DESIGN), never a generated line
  let ref: Reference | null = null;
  let record: VoiceDesignRecord | undefined;
  let experiment = false;
  if (mode === 'REFERENCE') {
    ref = await referenceWav(c, state.assets, dir, { sampleId: payload.referenceSampleId, purpose: 'BUILD' });
    if (!ref) throw missingReference(`The requested recording is not an uploaded recording of ${c.name} (or its file is gone). Upload a 3–30 second recording of the voice on the Voice tab.`, { characterId: c.id, mode });
  } else if (mode === 'DESIGN') {
    const problem = designChoiceProblem(state, c, payload.designId, payload.candidate);
    if (problem) throw missingReference(problem, { characterId: c.id, mode, designId: payload.designId });
    record = c.voice.designs!.find((d) => d.id === payload.designId)!;
    experiment = isIraqi(c);
    // the voice pinned is the voice heard: the previews' seed and emotion strength
    if (record.lineParams) { params.seed = record.lineParams.seed; params.emotionAlpha = record.lineParams.emotionAlpha; }
    ref = await referenceWav(c, state.assets, dir, { design: { designId: record.id, candidate: payload.candidate! }, purpose: 'BUILD' });
  } else if (mode === 'AUTOMATIC') {
    const plan = automaticVoicePlan(c, state.assets, state.settings);
    await ctx.event('info', `automatic voice: ${plan.kind === 'UPLOAD' ? `the consented recording “${plan.label}”` : plan.kind === 'DESIGN' ? (plan.experiment ? 'a designed Arabic seed for the Iraqi engine (experiment)' : 'a voice designed from the profile') : `refused (${plan.code})`}`, { plan });
    if (plan.kind === 'REFUSE') throw plan.code === 'CONSENT_REQUIRED' ? consentRequired(plan.message, { characterId: c.id, sampleId: plan.sampleId }) : missingReference(plan.message, { characterId: c.id, mode });
    if (plan.kind === 'UPLOAD') ref = await referenceWav(c, state.assets, dir, { sampleId: plan.sampleId, purpose: 'BUILD' });
    else {
      experiment = plan.experiment;
      // ONE designed voice (DESIGN_CANDIDATES), from the same seed on every infrastructure retry
      record = await designAndMeasure(ctx, c, { mode: 'AUTOMATIC', experiment, seed: params.seed, speech: { speed: params.speed, emotionAlpha: params.emotionAlpha, seed: params.seed! } });
      const pick = rankDesignCandidates(record.candidates, rankingFor(c)).pick;
      if (pick === undefined) {
        const unheard = record.candidates.every((x) => x.measured.cer === undefined);
        const why = record.candidates.map((x) => x.gate.reasons.join('; ')).join(' | ');
        throw new StudioError(unheard ? 'UNAVAILABLE' : 'PROVIDER', `The voice designed for ${c.name} did not pass its checks (${why}); it is kept on design ${record.id} for you to hear. Design the voice again (or change its description) to make a new one.`, { failureClass: unheard ? 'INFRASTRUCTURE' : 'PROVIDER', characterId: c.id, designId: record.id });
      }
      // the record is on the character now
      ({ state } = await readState());
      c = state.characters.find((x) => x.id === payload.characterId)!;
      ref = await referenceWav(c, state.assets, dir, { design: { designId: record.id, candidate: pick }, purpose: 'BUILD' });
    }
  }
  if (mode !== 'MANUAL') {
    if (!ref) throw missingReference(`${c.name} has nothing to clone from: the chosen source is gone from the library.`, { characterId: c.id, mode });
    await ctx.progress('PREPARING', { phase: 'preparing', message: ref.origin === 'DESIGNED' ? `Design seed for ${c.name}: design ${ref.design!.designId}, candidate ${ref.design!.candidate} (studio-designed synthetic voice)` : `Reference recording for ${c.name}: “${ref.sample?.label ?? ref.asset.label}” (${ref.window ? `${ref.window.from}–${ref.window.to} s` : 'whole file'})` });
    await ctx.event('info', 'reference chosen', { assetId: ref.asset.id, sampleId: ref.sample?.id, via: ref.via, origin: ref.origin, design: ref.design, window: ref.window, hasText: Boolean(ref.text) });
  }

  // 2) the identity to prove: engine, parameters, seed; a design seed stays local (a hosted clone is of a recording)
  const useMinimax = mode === 'MANUAL' || ((payload.provider ?? state.settings.generation?.voiceProvider) === 'MINIMAX' && Boolean(env().MINIMAX_API_KEY) && ref?.origin === 'UPLOAD_CONSENTED');
  const origin: VoiceOrigin = useMinimax ? 'HOSTED' : ref?.origin === 'DESIGNED' ? 'DESIGNED' : 'UPLOAD_CONSENTED';
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
      const clone = { file: cloneFrom, voiceId, languageBoost: c.language === 'AR' ? 'Arabic' : 'English' };
      const r = await ctx.tool('speech.clone_voice', () => minimax.cloneVoice(clone), { input: clone });
      head = { provider: 'MINIMAX', model: env().MINIMAX_SPEECH_MODEL, providerVoiceId: r.voiceId };
    }
  } else {
    const model = pickEngine(c.language, c.dialect);
    // an Iraqi voice speaks its English lines with the English engine, cloned from the same consented reference
    head = { provider: 'LOCAL_TTS', model, fallbackModel: model === 'habibi' ? latinFallbackOf() : undefined };
  }
  // ONE VOICE, EVERY LANGUAGE THE CHARACTER SPEAKS: its own language is proved by the proof line below; each other
  // language is spoken from the same reference by that language's engine (Iraqi: Habibi, with MOSS heard once beside
  // it for the producer's comparison) and stays REVIEW until a listener judges it
  const languageProfiles: NonNullable<VoiceIdentity['languageProfiles']> = spokenLanguages(c).map((l, i) => {
    const engine = i === 0 || head.provider === 'MINIMAX' ? head.model : pickEngine(l.language, l.dialect);
    return { language: l.language, ...(l.dialect ? { dialect: l.dialect } : {}), engine, ...(engine === 'habibi' ? { comparisonEngines: ['moss'] } : {}), status: i === 0 ? 'PRIMARY' : 'REVIEW', ...(i === 0 ? {} : { notes: languageProfileNotes(origin, l) }) };
  });
  // the character as the proof line will see it: the identity-to-be, so routing and parameters are the ones pinned
  const trial: Character = { ...c, voice: { ...c.voice, identity: { ...head, mode, origin, language: c.language, dialect: c.dialect, params, status: 'ACTIVE', revision: (c.voice.identity?.revision ?? 0) + 1, createdAt: new Date().toISOString() } } };

  // 3) the proof line, spoken, heard back and measured
  const text = proofLineFor(c);
  await ctx.progress('GENERATING', { phase: 'speaking', message: 'Speaking a proof line' });
  const line = await speakLine(ctx, trial, text, ref, dir);
  // the proof is a recorded line: coverage ≥ 0.85 and CER ≤ 0.15 (anything else, or unheard, is REVIEW) — heard back
  // by the Audio Synchronization Inspector (its step, with its own tool runner)
  const check = await step(ctx, 'audio-sync-inspector', `voice-proof-check: ${c.name}`, (tool) => verifyLine({ ...ctx, tool }, line.file, text, line.language, 'line'));
  const measured = await measureVoiceLine(ctx, line.file, ref?.file);
  const reviewReasons: string[] = [];
  if (!check?.ok) reviewReasons.push(check ? `proof line: ${check.reasons.join('; ')}` : 'proof line not heard back (transcription unavailable)');
  if (experiment) reviewReasons.push('designed Arabic seed on the Iraqi engine: an experiment, its dialect is unverified');
  if (ref?.design && !ref.design.gateOk) reviewReasons.push(`design candidate ${ref.design.candidate} did not pass its gates`);
  const status: VoiceIdentity['status'] = reviewReasons.length ? 'REVIEW' : 'ACTIVE';
  const evaluation: NonNullable<VoiceIdentity['evaluation']> = {
    ...(check ? { cer: Number(check.cer.toFixed(4)), coverage: Number(check.coverage.toFixed(4)) } : {}),
    ...(measured.lufs !== undefined ? { lufs: measured.lufs } : {}), ...(measured.truePeakDbtp !== undefined ? { truePeakDbtp: measured.truePeakDbtp } : {}), ...(measured.clipped !== undefined ? { clipped: measured.clipped } : {}),
    ...(measured.seedToLineSimilarity !== undefined ? { seedToLineSimilarity: measured.seedToLineSimilarity, similarityModel: measured.similarityModel } : {}),
    measuredAt: new Date().toISOString(),
  };
  const dialectStatus = initialDialectStatus(c.language);

  // 4) into the studio in one batch: the audio first, then its sample, then the identity that cites both
  const sampleId = nid('voice'); const assetId = nid('gen');
  const stored = await adoptFile(assetId, line.file, { expectKind: 'AUDIO' });
  const source = ref?.origin === 'DESIGNED'
    ? { referenceAssetId: ref.asset.id, designId: ref.design!.designId, seedSha256: ref.design!.sha256 }
    : { referenceSampleId: ref?.sample?.id, referenceAssetId: ref?.asset.id, referenceWindow: ref?.window?.assetId ? { from: ref.window.from, to: ref.window.to, assetId: ref.window.assetId } : undefined, ...(ref?.consent ? { consent: ref.consent } : {}) };
  const identity: VoiceIdentityInput = {
    ...head, mode, origin, ...source, referenceText: ref?.text,
    language: c.language, dialect: c.dialect, params, proof: { sampleId, assetId, text, wer: check?.wer, cer: check?.cer, coverage: check?.coverage, heard: check?.heard }, status, engineVersion: line.model, jobId: ctx.job.id,
    dialectStatus, evaluation, languageProfiles,
  };
  try {
    await commands([
      { name: 'addAsset', args: [assetFromStored(assetId, stored, { label: `${c.name} — voice proof`, tags: ['voice', 'generated', 'proof'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref?.asset.id, origin, designId: ref?.design?.designId, window: ref?.window, params, check, measured } })] },
      { name: 'addVoiceSample', args: [c.id, { id: sampleId, label: `Proof line (${line.engine})`, assetId, source: 'GENERATED', text, language: line.language, durationSeconds: stored.probe?.durationSeconds, jobId: ctx.job.id }, false] },
      { name: 'setVoiceIdentity', args: [c.id, identity] },
    ], 'worker');
  } catch (e) { await removeFile(stored.relPath); throw e; }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await recordMetric('voice.build_ms', line.ms, 'ms', { engine: line.engine }, ctx.job.id);
  const labels = voiceLabels({ origin, language: c.language, dialect: c.dialect, dialectStatus, listening: [] });
  // the voice is handed to the production only with its proof: a line spoken, heard back and measured
  await recordQaReport({ subjectKind: 'CHARACTER', subjectId: c.id, inspectorId: 'audio-sync-inspector', checks: [
    { name: 'proof-line-heard', ok: check !== null, detail: check ? `heard: ${check.heard.slice(0, 120)}` : 'transcription unavailable' },
    { name: 'proof-line-coverage', ok: Boolean(check && check.coverage >= PROOF_COVERAGE), value: check ? Number(check.coverage.toFixed(2)) : undefined, threshold: PROOF_COVERAGE },
    { name: 'proof-line-cer', ok: Boolean(check && check.cer <= VOICE_GATES.cer), value: check ? Number(check.cer.toFixed(2)) : undefined, threshold: VOICE_GATES.cer, detail: 'character error rate after the dialect fold' },
    { name: 'word-error-rate', ok: true, value: check ? Number(check.wer.toFixed(2)) : undefined, detail: 'reported, not gated' },
    { name: 'proof-line-clipping', ok: measured.clipped === 0, value: measured.clipped, threshold: 0, detail: measured.lufs !== undefined ? `${measured.lufs} LUFS, true peak ${measured.truePeakDbtp} dBTP` : 'level not measured' },
    { name: 'seed-to-line-similarity', ok: true, value: measured.seedToLineSimilarity, detail: 'ECAPA cosine between the reference and the proof line; reported, not gated (VoxCeleb-trained, relative)' },
    { name: 'voice-origin', ok: true, value: origin, detail: labels.join('; ') },
  ], decision: status === 'ACTIVE' ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [assetId], jobId: ctx.job.id, notes: `voice of ${c.name} (${line.engine}, ${mode.toLowerCase()}, ${origin.toLowerCase()})${reviewReasons.length ? `; ${reviewReasons.join('; ')}` : ''}` });
  await ctx.activity('VOICE_BUILT', `${c.name}'s voice pinned (${line.engine}, ${mode.toLowerCase()}, ${origin === 'DESIGNED' ? 'studio-designed synthetic voice' : origin === 'HOSTED' ? 'hosted' : 'consented recording'}); proof line ${check ? `${Math.round(check.coverage * 100)} % heard, CER ${Math.round(check.cer * 100)} % (intelligibility, measured)${check.ok ? '' : ' — review'}` : 'not verified — review'}${measured.seedToLineSimilarity !== undefined ? `; ECAPA reference→line ${measured.seedToLineSimilarity}` : ''}; ${labels.join('; ')}`, { characterId: c.id, engine: line.engine, origin, coverage: check?.coverage, cer: check?.cer, wer: check?.wer, status, designId: ref?.design?.designId });
  return {
    identity: { ...head, mode, origin, status, referenceAssetId: ref?.asset.id, designId: ref?.design?.designId, params, dialectStatus },
    sampleAssetId: assetId, proofSampleId: sampleId, engine: line.engine, check, evaluation,
    ...(record ? { design: { designId: record.id, chosen: ref?.design?.candidate, ranking: record.ranking ?? [], rankedBy: record.rankedBy, candidates: designSummary(record) } } : {}),
    labels, reviewReasons, awaitingReview: status !== 'ACTIVE',
  };
};

// ---------------------------------------------------------------------------------------------- VOICE_PREVIEW

export const voicePreview: Handler = async (ctx) => {
  const { characterId, text, emotion, language, dialect, engine } = ctx.job.payload as JobPayloadParsed<'VOICE_PREVIEW'>;
  const { state } = await readState();
  const found = state.characters.find((x) => x.id === characterId);
  if (!found) throw new StudioError('NOT_FOUND', 'Character not found');
  // ANOTHER LANGUAGE OF THE SAME VOICE: the line is spoken as the character speaking that language — the same
  // reference and parameters, that language's profile's engine (or one of its comparison engines, once)
  const speaking = speakingAs(found, { language, dialect, engine });
  const c = speaking.character;
  const dir = await tmpDir('voice');
  const ref = await referenceWav(found, state.assets, dir);
  if (!ref) {
    const waiting = unconsentedUploads(c, state.assets);
    if (waiting.length) throw consentRequired(`${c.name}'s recording “${waiting[0].label}” has no consent statement; confirm it before the voice speaks from it.`, { characterId, sampleId: waiting[0].id });
    throw missingReference(`${c.name} has no voice to speak with yet: build the voice (from a consented recording, or a studio-designed voice) first.`, { characterId });
  }
  await ctx.progress('GENERATING', { phase: 'speaking', message: `Speaking as ${c.name}${speaking.profile ? ` (${languageLabel(speaking.profile)}, ${speaking.engine ?? speaking.profile.engine})` : ''}` });
  const line = await speakLine(ctx, c, text, ref, dir, { emotion, engine: speaking.engine && isLocalTtsEngine(speaking.engine) ? speaking.engine : undefined });
  const check = await verifyLine(ctx, line.file, text, line.language);
  const measured = await measureVoiceLine(ctx, line.file, ref.file);
  const id = nid('gen');
  const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
  const role = speaking.role;
  const sampleDialect = line.language === 'AR' ? c.dialect : undefined;
  await commands([
    { name: 'addAsset', args: [assetFromStored(id, stored, { label: `${c.name} — “${text.slice(0, 40)}”`, tags: ['voice', 'preview', ...(role === 'COMPARISON' ? ['comparison'] : [])], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref.asset.id, referenceSha256: ref.design?.sha256, origin: ref.origin, designId: ref.design?.designId, language: line.language, dialect: sampleDialect, role, voiceRevision: found.voice.identity?.revision, params: found.voice.identity?.params, check, measured } })] },
    { name: 'addVoiceSample', args: [c.id, { label: text.slice(0, 48), assetId: id, source: 'GENERATED', text, language: line.language, ...(sampleDialect ? { dialect: sampleDialect } : {}), engine: line.engine, role, durationSeconds: stored.probe?.durationSeconds, jobId: ctx.job.id }, false] },
  ], 'worker');
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  return { assetId: id, engine: line.engine, model: line.model, role, language: line.language, dialect: sampleDialect, durationSeconds: stored.probe?.durationSeconds, check, measured, awaitingReview: check === null || !check.ok };
};

// --------------------------------------------------------------------------------------------- DIALOGUE_AUDIO

export const dialogueAudio: Handler = async (ctx) => {
  const { productionId, shotIds, lineIds, force } = ctx.job.payload as { productionId: string; shotIds?: string[]; lineIds?: string[]; force?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId) as Production | undefined;
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  const dir = await tmpDir('dialogue');
  const refs = new Map<string, Reference | null>();
  // lineIds: exactly these lines, recorded again whatever their state (targeted regeneration, step 14)
  const lines = p.shots.filter((sh) => !shotIds?.length || shotIds.includes(sh.id)).flatMap((sh) => sh.dialogue.filter((d) => { if (lineIds?.length) return lineIds.includes(d.id); const c = cast.find((x) => x.id === d.characterId); return force || !c || !lineRecordingCurrent(d, c, state.assets); }).map((d) => ({ sh, d })));
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
    const line = await speakLine(ctx, c, text, ref, dir, { delivery: d.delivery });
    const check = await verifyLine(ctx, line.file, text, line.language);
    // ONE recording per line (first-attempt policy): a line that fails its gate is kept and flagged for the producer,
    // never re-spoken behind their back; re-recording it is an explicit request (lineIds)
    if (isFailedCheck(check)) await ctx.event('warn', `line failed the gate (${check!.reasons.join('; ')}): kept and flagged for review`, { heard: check!.heard, coverage: check!.coverage, cer: check!.cer, lineId: d.id });
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
