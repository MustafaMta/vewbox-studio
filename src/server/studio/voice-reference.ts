import type { VoiceReferenceRefusal, VoiceReferenceValidation } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import { REFERENCE_RULES as MEASURE_RULES, trimReference, validateVoiceReference, type VoiceReferenceMeasurement } from '../media/voice-check';
import { transcribe } from '../providers/speech';

/** THE VOICE REFERENCE — what a recording must be before a voice is cloned from it (contract §1.4, diagnosis §3.2).
 *  Format, level, clipping, provenance and the window are measured by THE measurement stack,
 *  src/server/media/voice-check.ts (review finding 9: one stack, no duplicate helpers); this module adds the speech
 *  judgement — the transcription service must hear words, in the language the voice is for — and composes the two
 *  into what the upload endpoint answers with. */

export const REFERENCE_RULES = { minWords: 3, languageConfidence: 0.6 } as const;
/** The trimmed reference the engines take: at most this long, at this loudness, mono 24 kHz (voice-check's trim). */
export const REFERENCE_WINDOW = { maxSeconds: MEASURE_RULES.windowSeconds, minSeconds: MEASURE_RULES.minSeconds, targetLufs: MEASURE_RULES.targetLufs, truePeakDbtp: MEASURE_RULES.ceilingDbtp, sampleRate: 24000 } as const;

export type Refusal = { code: VoiceReferenceRefusal; message: string };

/** Speech: the transcription must hear words, in the language the voice is for. A detected language below the
 *  confidence threshold is reported but never refused on. */
export function judgeSpeech(speech: VoiceReferenceValidation['speech'], expectLanguage: Language | undefined): Refusal | null {
  if (!speech.present || speech.words < REFERENCE_RULES.minWords) return { code: 'NO_SPEECH', message: speech.words ? `Only ${speech.words} word(s) were heard; the recording needs a few sentences of clear speech.` : 'No speech was heard in the recording; it needs a few sentences of clear speech (no music, no silence).' };
  if (expectLanguage && speech.language !== 'UNKNOWN' && speech.language !== expectLanguage && speech.confidence >= REFERENCE_RULES.languageConfidence) return { code: 'WRONG_LANGUAGE', message: `The recording is in ${speech.language === 'AR' ? 'Arabic' : 'English'}, but the voice is for ${expectLanguage === 'AR' ? 'Arabic' : 'English'}; record the reference in the character's language.` };
  return null;
}

/** What the transcription heard, as the contract's `speech` record. The detected language is the service's; its
 *  confidence travels beside it (the judgement applies the threshold — there is exactly one place that does). */
export function heardSpeech(t: Awaited<ReturnType<typeof transcribe>>): VoiceReferenceValidation['speech'] {
  const words = t.segments.flatMap((s) => s.words ?? []);
  const wordCount = words.length || t.text.trim().split(/\s+/).filter(Boolean).length;
  const confidence = t.languageProbability || (words.length ? words.reduce((a, w) => a + (w.probability ?? 0), 0) / words.length : 0);
  const language: VoiceReferenceValidation['speech']['language'] = t.language === 'ar' ? 'AR' : t.language === 'en' ? 'EN' : 'UNKNOWN';
  return { present: wordCount >= REFERENCE_RULES.minWords, words: wordCount, language, transcript: t.text.trim(), confidence: Number(confidence.toFixed(3)) };
}

export interface MeasuredReference {
  /** the contract's record (stored on the sample) */
  validation: VoiceReferenceValidation;
  /** everything voice-check measured (clipping, speech seconds, provenance, reasons) */
  measurement: VoiceReferenceMeasurement;
  window: { from: number; to: number }; trimmedFile: string; gainDb: number; refusal: Refusal | null;
}

const noSpeech: VoiceReferenceValidation['speech'] = { present: false, words: 0, language: 'UNKNOWN', transcript: '', confidence: 0 };
const record = (m: VoiceReferenceMeasurement, speech: VoiceReferenceValidation['speech']): VoiceReferenceValidation => ({ durationSeconds: m.durationSeconds, sampleRate: m.sampleRate, channels: m.channels, integratedLufs: m.integratedLufs, truePeakDbtp: m.truePeakDbtp, speech });

/** Measure an uploaded recording end to end: provenance, format, level and clipping on the whole file and the window
 *  at the speech (voice-check), the trimmed clip at −20 LUFS, and the speech heard in that clip (the transcription
 *  service, through the studio's client). Every CPU refusal comes back before the window is cut or the service is
 *  asked. */
export async function measureVoiceReference(file: string, opts: { expectLanguage?: Language; trimmedOut: string; transcribe?: typeof transcribe }): Promise<MeasuredReference> {
  const m = await validateVoiceReference(file, { language: opts.expectLanguage });
  if (!m.ok || !m.window) {
    const refusal: Refusal = { code: m.code ?? 'NO_SPEECH', message: m.message ?? 'No speech was found in the recording.' };
    return { validation: record(m, noSpeech), measurement: m, window: { from: 0, to: m.durationSeconds }, trimmedFile: '', gainDb: 0, refusal };
  }
  const window = { from: m.window.from, to: m.window.to };
  const trimmed = await trimReference(file, opts.trimmedOut, window);
  // the web server transcribes on the GPU too: under the SHARED lease, never around it (audit H7, step 8)
  const leased: typeof transcribe = async (f, o) => (await import('../gpu/lease')).gpuLease('ASR', 4000, () => transcribe(f, o));
  const t = await (opts.transcribe ?? leased)(trimmed.file, { language: 'auto' });
  const speech = heardSpeech(t);
  // a recording heard, with confidence, in a language that is neither Arabic nor English is the wrong language too
  const foreign = Boolean(opts.expectLanguage && t.language && t.language !== 'ar' && t.language !== 'en' && t.languageProbability >= REFERENCE_RULES.languageConfidence);
  const refusal = judgeSpeech(speech, opts.expectLanguage) ?? (foreign ? { code: 'WRONG_LANGUAGE' as const, message: `The recording was heard as “${t.language}”, not ${opts.expectLanguage === 'AR' ? 'Arabic' : 'English'}; record the reference in the character's language.` } : null);
  return { validation: record(m, speech), measurement: { ...m, speech }, window, trimmedFile: trimmed.file, gainDb: trimmed.gainDb, refusal };
}
