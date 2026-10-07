/** CROSS-LANGUAGE VOICE IDENTITY (Phase 3, producer directive 2026-10-07): an Iraqi character speaks Baghdadi Arabic
 *  through Habibi-TTS Specialized IRQ and English through MOSS-TTS v1.5, both cloned from the SAME consented reference.
 *  Two engines do not guarantee one perceived person, so continuity is MEASURED before the character is called
 *  bilingual: ECAPA speaker similarity within and across the languages and against the reference, pitch (median and
 *  range), tone (spectral centroid) and formants. The verdict is CONSISTENT or MISMATCH_SUSPECTED — never a pass: a
 *  mismatch is reported with its numbers and samples kept, and the producer's listening decides. Pure (tested). */

import type { VoiceProfile } from '@/server/providers/voice-design';

export interface Rendered { embedding: number[]; profile: VoiceProfile }
export interface IdentityEvidence {
  withinArabic: number | null; withinEnglish: number | null; acrossLanguages: number | null;
  referenceToArabic: number | null; referenceToEnglish: number | null;
  pitch: { reference?: number; arabic?: number; english?: number; arabicVsEnglishSemitones?: number };
  centroid: { arabic?: number; english?: number; ratio?: number };
  formants: { arabic?: [number, number, number]; english?: [number, number, number] };
  flags: string[];
  verdict: 'CONSISTENT' | 'MISMATCH_SUSPECTED' | 'INSUFFICIENT';
}

const cos = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0) / Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pairs = (A: Rendered[], B: Rendered[], same: boolean) => { const xs: number[] = []; for (let i = 0; i < A.length; i++) for (let j = same ? i + 1 : 0; j < B.length; j++) xs.push(cos(A[i].embedding, B[j].embedding)); return xs; };
function round(x: number | null, d?: number): number | null;
function round(x: number | undefined, d?: number): number | undefined;
function round(x: number | null | undefined, d = 3): number | null | undefined { return x === null || x === undefined ? x : Number(x.toFixed(d)); }

/** Thresholds of the suspicion flags — evidence for the listener, not a gate. The embedding drop is relative to the
 *  same-language agreement (Phase 1: one voice 0.76–0.81 within, distinct voices 0.11–0.19 across). */
export const IDENTITY_FLAGS = { acrossDropRatio: 0.8, acrossFloor: 0.45, pitchSemitones: 3, centroidRatio: [0.8, 1.25] as const };

export function crossLanguageIdentity(reference: Rendered | null, arabic: Rendered[], english: Rendered[]): IdentityEvidence {
  const flags: string[] = [];
  const withinArabic = mean(pairs(arabic, arabic, true));
  const withinEnglish = mean(pairs(english, english, true));
  const acrossLanguages = mean(pairs(arabic, english, false));
  const referenceToArabic = reference ? mean(arabic.map((a) => cos(reference.embedding, a.embedding))) : null;
  const referenceToEnglish = reference ? mean(english.map((a) => cos(reference.embedding, a.embedding))) : null;
  const f0 = (xs: Rendered[]) => median(xs.map((x) => x.profile.f0MedianHz).filter((v): v is number => typeof v === 'number'));
  const cen = (xs: Rendered[]) => median(xs.map((x) => x.profile.centroidMedianHz).filter((v): v is number => typeof v === 'number'));
  const fmt = (xs: Rendered[]): [number, number, number] | undefined => {
    const f = xs.filter((x) => x.profile.f1Hz && x.profile.f2Hz && x.profile.f3Hz);
    return f.length ? [median(f.map((x) => x.profile.f1Hz!))!, median(f.map((x) => x.profile.f2Hz!))!, median(f.map((x) => x.profile.f3Hz!))!] : undefined;
  };
  const pa = f0(arabic), pe = f0(english);
  const st = pa && pe ? 12 * Math.log2(pa / pe) : undefined;
  const ca = cen(arabic), ce = cen(english);
  const ratio = ca && ce ? ca / ce : undefined;
  if (!arabic.length || !english.length) return { withinArabic: round(withinArabic), withinEnglish: round(withinEnglish), acrossLanguages: null, referenceToArabic: round(referenceToArabic), referenceToEnglish: round(referenceToEnglish), pitch: { reference: reference?.profile.f0MedianHz, arabic: pa, english: pe }, centroid: {}, formants: {}, flags: ['needs lines in both languages'], verdict: 'INSUFFICIENT' };
  const within = [withinArabic, withinEnglish].filter((v): v is number => v !== null);
  if (acrossLanguages !== null && within.length && acrossLanguages < IDENTITY_FLAGS.acrossDropRatio * Math.min(...within)) flags.push(`speaker similarity drops across languages (${acrossLanguages.toFixed(3)} vs ${Math.min(...within).toFixed(3)} within a language)`);
  if (acrossLanguages !== null && acrossLanguages < IDENTITY_FLAGS.acrossFloor) flags.push(`speaker similarity across languages is low (${acrossLanguages.toFixed(3)} < ${IDENTITY_FLAGS.acrossFloor})`);
  if (st !== undefined && Math.abs(st) > IDENTITY_FLAGS.pitchSemitones) flags.push(`the Arabic voice is ${Math.abs(st).toFixed(1)} semitones ${st > 0 ? 'higher' : 'lower'} than the English one`);
  if (ratio !== undefined && (ratio < IDENTITY_FLAGS.centroidRatio[0] || ratio > IDENTITY_FLAGS.centroidRatio[1])) flags.push(`the tone differs (spectral centroid Arabic/English ${ratio.toFixed(2)})`);
  return {
    withinArabic: round(withinArabic), withinEnglish: round(withinEnglish), acrossLanguages: round(acrossLanguages), referenceToArabic: round(referenceToArabic), referenceToEnglish: round(referenceToEnglish),
    pitch: { reference: reference?.profile.f0MedianHz, arabic: pa, english: pe, arabicVsEnglishSemitones: round(st, 2) },
    centroid: { arabic: ca, english: ce, ratio: round(ratio, 2) }, formants: { arabic: fmt(arabic), english: fmt(english) },
    flags, verdict: flags.length ? 'MISMATCH_SUSPECTED' : 'CONSISTENT',
  };
}
