import type { CharacterProfilePartial } from '@/domain/jobs';
import type { Dialect, Language, Sex, Style } from '@/domain/vocabulary';

/** THE WRITTEN SHEET, AS DATA — age bands instead of a raw number for a human concept, and the sheet the creation
 *  page sends: only what the producer actually wrote or chose. Nothing is preselected (DESIGN-SYSTEM-V3 §9.5, E5):
 *  a sex, an age, a pitch or a pace left on "Studio decides" is left out, and Casting decides it. Pure; unit-tested. */

export const AGE_BANDS = ['child', 'teen', 'adult', 'older'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
/** The age a band stands for when the producer picks the band and no exact age. */
export const BAND_AGE: Record<AgeBand, number> = { child: 9, teen: 16, adult: 32, older: 66 };
export const ageBandOf = (age: number): AgeBand => (age <= 12 ? 'child' : age <= 19 ? 'teen' : age <= 59 ? 'adult' : 'older');

/** The sheet as the three steps collect it. Empty strings and `undefined` mean "not written". */
export interface SheetValues {
  name: string; nameAr: string; role: string; sex?: Sex; band?: AgeBand; exactAge?: number;
  look: string; build: string; face: string; hair: string; skin: string; eyes: string; wardrobe: string; marks: string;
  pitch?: 'LOW' | 'MID' | 'HIGH'; pace?: 'SLOW' | 'MEASURED' | 'QUICK'; timbre: string; voiceNotes: string; personality: string;
}
export const EMPTY_SHEET: SheetValues = { name: '', nameAr: '', role: '', look: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', marks: '', timbre: '', voiceNotes: '', personality: '' };

export const SHEET_STEPS = ['identity', 'look', 'voice'] as const;
export type SheetStep = (typeof SHEET_STEPS)[number];

/** Which step may be left: the identity step needs a name; the others never block. */
export const sheetStepProblem = (step: SheetStep, v: SheetValues): 'NAME' | null => (step === 'identity' && !v.name.trim() ? 'NAME' : null);

/** The age the sheet states: the exact age when given (1–120), else the band's age, else nothing. */
export function sheetAge(v: Pick<SheetValues, 'band' | 'exactAge'>): number | undefined {
  if (v.exactAge !== undefined && Number.isInteger(v.exactAge) && v.exactAge >= 1 && v.exactAge <= 120) return v.exactAge;
  return v.band ? BAND_AGE[v.band] : undefined;
}

/** The partial profile CREATE_CHARACTER receives in MANUAL mode, plus the free description of the look as the brief
 *  Casting designs the rest from. Only written or chosen fields travel. */
export function sheetPayload(v: SheetValues, settings: { style: Style; language: Language; dialect?: Dialect }): { profile: CharacterProfilePartial; brief?: string } {
  const t = (s: string) => s.trim() || undefined;
  const marks = v.marks.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const voice = { pitch: v.pitch, pace: v.pace, timbre: t(v.timbre), notes: t(v.voiceNotes) };
  const profile: CharacterProfilePartial = {
    name: v.name.trim(), nameAr: t(v.nameAr), role: t(v.role), sex: v.sex, ageYears: sheetAge(v), personality: t(v.personality),
    build: t(v.build), face: t(v.face), hair: t(v.hair), skin: t(v.skin), eyes: t(v.eyes), wardrobe: t(v.wardrobe), distinguishing: marks.length ? marks : undefined,
    style: settings.style, language: settings.language, dialect: settings.language === 'AR' ? settings.dialect : undefined,
    voice: Object.values(voice).some((x) => x !== undefined) ? voice : undefined,
  };
  for (const k of Object.keys(profile) as Array<keyof CharacterProfilePartial>) if (profile[k] === undefined) delete profile[k];
  return { profile, brief: t(v.look) };
}
