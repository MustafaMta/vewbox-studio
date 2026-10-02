import fsp from 'node:fs/promises';
import type { VoiceReferenceRefusal, VoiceReferenceValidation } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import { ffmpeg, measureLoudness } from '../media/ffmpeg';
import type { Probe } from '../media';
import { transcribe } from '../providers/speech';

/** THE VOICE REFERENCE — what a recording must be before a voice is cloned from it, how the window the engine hears
 *  is chosen and levelled, and the refusal codes the upload endpoint answers with (contract §1.4, diagnosis §3.2).
 *  The decisions are pure functions over measurements so they are tested without ffmpeg or the transcription
 *  service; the measuring functions below call ffmpeg and the ASR client. */

export const REFERENCE_RULES = { minSeconds: 3, maxSeconds: 30, minSampleRate: 16000, minLufs: -30, maxLufs: -10, maxTruePeakDbtp: -0.1, minWords: 3, languageConfidence: 0.6 } as const;
/** The trimmed reference: at most this long, not shorter than this, at this loudness, mono 24 kHz. */
export const REFERENCE_WINDOW = { maxSeconds: 12, minSeconds: 3, targetLufs: -20, truePeakDbtp: -1, sampleRate: 24000 } as const;

export type Refusal = { code: VoiceReferenceRefusal; message: string };

/** Format and level: the recording must be long enough to clone from, short enough to be one voice, sampled at
 *  speech quality, neither buried in noise nor clipped. */
export function judgeFormat(m: Pick<VoiceReferenceValidation, 'durationSeconds' | 'sampleRate' | 'integratedLufs' | 'truePeakDbtp'>): Refusal | null {
  const r = REFERENCE_RULES;
  if (!Number.isFinite(m.durationSeconds) || m.durationSeconds <= 0 || !m.sampleRate) return { code: 'BAD_FORMAT', message: 'The file has no readable audio stream.' };
  if (m.durationSeconds < r.minSeconds) return { code: 'TOO_SHORT', message: `The recording is ${m.durationSeconds.toFixed(1)} s; at least ${r.minSeconds} s of speech are needed.` };
  if (m.durationSeconds > r.maxSeconds) return { code: 'TOO_LONG', message: `The recording is ${Math.round(m.durationSeconds)} s; keep it under ${r.maxSeconds} s (one voice, one take).` };
  if (m.sampleRate < r.minSampleRate) return { code: 'BAD_FORMAT', message: `The recording is sampled at ${m.sampleRate} Hz; ${r.minSampleRate} Hz or more is needed.` };
  if (!Number.isFinite(m.integratedLufs) || m.integratedLufs < r.minLufs) return { code: 'TOO_QUIET', message: `The recording is too quiet (${Number.isFinite(m.integratedLufs) ? `${m.integratedLufs.toFixed(1)} LUFS` : 'silence'}); record closer to the microphone or raise the level.` };
  if (m.truePeakDbtp > r.maxTruePeakDbtp) return { code: 'CLIPPING', message: `The recording clips (true peak ${m.truePeakDbtp.toFixed(1)} dBTP); lower the input level and record again.` };
  if (m.integratedLufs > r.maxLufs) return { code: 'CLIPPING', message: `The recording is too hot (${m.integratedLufs.toFixed(1)} LUFS); lower the input level and record again.` };
  return null;
}

/** Speech: the transcription must hear words, in the language the voice is for. */
export function judgeSpeech(speech: VoiceReferenceValidation['speech'], expectLanguage: Language | undefined): Refusal | null {
  if (!speech.present || speech.words < REFERENCE_RULES.minWords) return { code: 'NO_SPEECH', message: speech.words ? `Only ${speech.words} word(s) were heard; the recording needs a few sentences of clear speech.` : 'No speech was heard in the recording; it needs a few sentences of clear speech (no music, no silence).' };
  if (expectLanguage && speech.language !== 'UNKNOWN' && speech.language !== expectLanguage && speech.confidence >= REFERENCE_RULES.languageConfidence) return { code: 'WRONG_LANGUAGE', message: `The recording is in ${speech.language === 'AR' ? 'Arabic' : 'English'}, but the voice is for ${expectLanguage === 'AR' ? 'Arabic' : 'English'}; record the reference in the character's language.` };
  return null;
}

export function judgeReference(v: VoiceReferenceValidation, expectLanguage: Language | undefined): Refusal | null {
  return judgeFormat(v) ?? judgeSpeech(v.speech, expectLanguage);
}

/** Silence stretches as ffmpeg's silencedetect prints them. */
export function parseSilences(stderr: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let open: number | undefined;
  for (const m of stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') open = Number(m[2]);
    else if (open !== undefined) { out.push({ start: open, end: Number(m[2]) }); open = undefined; }
  }
  if (open !== undefined) out.push({ start: open, end: Number.POSITIVE_INFINITY });
  return out;
}

/** THE WINDOW RULE — the stretch of a recording sent to the engine: it starts at the first speech (never the head
 *  of the file), runs through whole speech regions while they fit in `maxSeconds`, and ends at a silence boundary,
 *  so no word is cut in half. A single region longer than the limit is cut at the limit. */
export function chooseWindow(silences: Array<{ start: number; end: number }>, durationSeconds: number, opts: { maxSeconds?: number; minSeconds?: number; leadSeconds?: number } = {}): { from: number; to: number } {
  const max = opts.maxSeconds ?? REFERENCE_WINDOW.maxSeconds, min = opts.minSeconds ?? REFERENCE_WINDOW.minSeconds, lead = opts.leadSeconds ?? 0.15;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const regions: Array<{ from: number; to: number }> = [];
  let t = 0;
  for (const s of [...silences].sort((a, b) => a.start - b.start)) {
    if (s.start > t + 0.05) regions.push({ from: t, to: Math.min(s.start, durationSeconds) });
    t = Math.max(t, Math.min(s.end, durationSeconds));
  }
  if (durationSeconds > t + 0.05) regions.push({ from: t, to: durationSeconds });
  if (regions.length === 0) return { from: 0, to: r2(Math.min(durationSeconds, max)) };
  const from = Math.max(0, regions[0].from - lead);
  let to = regions[0].to;
  for (const r of regions.slice(1)) { if (r.to - from <= max) to = r.to; else break; }
  if (to - from > max) to = from + max;
  if (to - from < min) to = Math.min(durationSeconds, from + min);
  return { from: r2(from), to: r2(Math.min(durationSeconds, to + 0.1)) };
}

/** The static gain (dB) that brings a stretch to the target loudness without letting the true peak over the
 *  ceiling: never a dynamic normaliser, so the timbre the engine hears is the recording's own. */
export function staticGainDb(measured: { integrated: number; truePeak: number }, target = REFERENCE_WINDOW.targetLufs, ceiling = REFERENCE_WINDOW.truePeakDbtp): number {
  if (!Number.isFinite(measured.integrated) || measured.integrated < -70) return 0;
  const wanted = target - measured.integrated;
  const headroom = ceiling - measured.truePeak;
  return Math.round(Math.min(wanted, headroom) * 100) / 100;
}

// -------------------------------------------------------------------------------------------------- measuring

/** Find the silences of a recording (for the window) and its duration. */
export async function analyseSilence(file: string): Promise<{ silences: Array<{ start: number; end: number }>; durationSeconds: number }> {
  const { stderr } = await ffmpeg(['-i', file, '-af', 'silencedetect=n=-35dB:d=0.3', '-f', 'null', '-'], { timeoutMs: 120_000 });
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const durationSeconds = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  return { silences: parseSilences(stderr), durationSeconds };
}

/** Cut the window out of a recording as mono 24 kHz PCM at −20 LUFS by a static gain (true peak ≤ −1 dBTP). */
export async function trimReference(input: string, out: string, window: { from: number; to: number }): Promise<{ file: string; gainDb: number; measured: { integrated: number; truePeak: number } | null }> {
  const raw = `${out}.raw.wav`;
  const len = Math.max(0.5, window.to - window.from);
  await ffmpeg(['-ss', String(window.from), '-t', String(len), '-i', input, '-vn', '-ac', '1', '-ar', String(REFERENCE_WINDOW.sampleRate), '-c:a', 'pcm_s16le', raw], { timeoutMs: 120_000 });
  const measured = await measureLoudness(raw);
  const gainDb = measured ? staticGainDb(measured) : 0;
  await ffmpeg(['-i', raw, '-af', `volume=${gainDb}dB`, '-ac', '1', '-ar', String(REFERENCE_WINDOW.sampleRate), '-c:a', 'pcm_s16le', out], { timeoutMs: 120_000 });
  await fsp.rm(raw, { force: true }).catch(() => {});
  return { file: out, gainDb, measured: measured ? { integrated: measured.integrated, truePeak: measured.truePeak } : null };
}

export interface MeasuredReference { validation: VoiceReferenceValidation; window: { from: number; to: number }; trimmedFile: string; gainDb: number; refusal: Refusal | null }

/** Measure an uploaded recording end to end: format and level on the whole file, the window at a silence boundary,
 *  the trimmed clip at −20 LUFS, and the speech heard in that clip (the transcription service, through the studio's
 *  client). Format refusals come back before the window is cut or the service is asked. */
export async function measureVoiceReference(file: string, opts: { probe?: Probe; expectLanguage?: Language; trimmedOut: string; transcribe?: typeof transcribe }): Promise<MeasuredReference> {
  const loud = await measureLoudness(file);
  const base = { durationSeconds: opts.probe?.durationSeconds ?? 0, sampleRate: opts.probe?.sampleRate ?? 0, channels: opts.probe?.channels ?? 0, integratedLufs: loud?.integrated ?? Number.NEGATIVE_INFINITY, truePeakDbtp: loud?.truePeak ?? Number.NEGATIVE_INFINITY };
  const noSpeech: VoiceReferenceValidation['speech'] = { present: false, words: 0, language: 'UNKNOWN', transcript: '', confidence: 0 };
  const format = judgeFormat(base);
  if (format) return { validation: { ...base, speech: noSpeech }, window: { from: 0, to: base.durationSeconds }, trimmedFile: '', gainDb: 0, refusal: format };
  const { silences, durationSeconds } = await analyseSilence(file);
  const window = chooseWindow(silences, durationSeconds || base.durationSeconds);
  const trimmed = await trimReference(file, opts.trimmedOut, window);
  const asr = opts.transcribe ?? transcribe;
  const t = await asr(trimmed.file, { language: 'auto' });
  const words = t.segments.flatMap((s) => s.words ?? []);
  const wordCount = words.length || t.text.trim().split(/\s+/).filter(Boolean).length;
  const confidence = words.length ? words.reduce((a, w) => a + (w.probability ?? 0), 0) / words.length : t.languageProbability;
  const detected: VoiceReferenceValidation['speech']['language'] = t.language === 'ar' ? 'AR' : t.language === 'en' ? 'EN' : 'UNKNOWN';
  const speech: VoiceReferenceValidation['speech'] = { present: wordCount >= REFERENCE_RULES.minWords, words: wordCount, language: t.language && t.languageProbability >= REFERENCE_RULES.languageConfidence ? detected : detected === 'UNKNOWN' ? 'UNKNOWN' : detected, transcript: t.text.trim(), confidence: Number((t.languageProbability || confidence).toFixed(3)) };
  // a recording whose detected language is neither Arabic nor English with confidence is the wrong language too
  const foreign = t.language && t.language !== 'ar' && t.language !== 'en' && t.languageProbability >= REFERENCE_RULES.languageConfidence && opts.expectLanguage;
  const validation: VoiceReferenceValidation = { ...base, speech };
  const refusal = judgeReference(validation, opts.expectLanguage) ?? (foreign ? { code: 'WRONG_LANGUAGE' as const, message: `The recording was heard as “${t.language}”, not ${opts.expectLanguage === 'AR' ? 'Arabic' : 'English'}; record the reference in the character's language.` } : null);
  return { validation, window, trimmedFile: trimmed.file, gainDb: trimmed.gainDb, refusal };
}
