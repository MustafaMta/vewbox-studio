import { z } from 'zod';
import { PATTERN_KINDS, REVIEW_CRITERIA } from '@/domain/development';
import { aliases, looseArray, looseEnum, looseNumber, looseString } from '../lenient';
import { ProposalSchema } from '../schemas';

/** WHAT THE DEVELOPMENT AGENTS MUST RETURN — strict about meaning, tolerant about spelling (lenient.ts), like every
 *  story schema. The writer's draft is the existing proposal schema (reused, not duplicated) plus the hook, the
 *  ending, the English gloss of an Arabic story, a few lines that set its voice, and — in a revision — what each review
 *  note became. */

/** A text longer than its limit is cut at a sentence or a word (marked …), never refused: a long answer is not a wrong
 *  one, and a 14B model asked to shorten often breaks something else in the repair round (seen in the live smoke). */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sentence = Math.max(...['. ', '! ', '? ', '؟ ', '، ', '; '].map((m) => cut.lastIndexOf(m)));
  const at = sentence > max * 0.6 ? sentence + 1 : Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.6));
  return `${cut.slice(0, at).trimEnd()}…`;
}
const str = (max = 400) => looseString.pipe(z.string().trim().transform((s) => clipText(s, max)));
const req = (max = 400) => looseString.pipe(z.string().trim().min(1).transform((s) => clipText(s, max)));
const ids = (max = 8) => looseArray(looseString.pipe(z.string().trim()), { max });

const PATTERN_SYNONYMS = { OPENING: 'HOOK', FIRST_SECONDS: 'HOOK', MYSTERY: 'CURIOSITY', QUESTION: 'CURIOSITY', FEELING: 'EMOTION', HEART: 'EMOTION', RHYTHM: 'PACING', TEMPO: 'PACING', CHARACTERS: 'CHARACTER', TENSION: 'SUSPENSE', COMEDY: 'HUMOR', HUMOUR: 'HUMOR', FUNNY: 'HUMOR', TWIST: 'SURPRISE', PAYOFF: 'ENDING', REWATCH: 'REPLAY', REWATCHABILITY: 'REPLAY', LENGTH: 'FORMAT', STRUCTURE: 'FORMAT', SONG: 'MUSIC', VISUALS: 'VISUAL', IMAGERY: 'VISUAL', CULTURAL: 'CULTURE', LOCAL: 'CULTURE' } as const;

export const AudienceOutSchema = z.object({
  audience: req(300),
  patterns: looseArray(z.preprocess(aliases({ pattern: ['description', 'insight', 'name', 'title'], evidenceIds: ['evidence', 'sources', 'itemIds', 'evidence_ids', 'items'], interpretation: ['reading', 'why', 'analysis', 'meaning'], measured: ['measurement', 'numbers', 'data', 'metrics'] }), z.object({
    kind: looseEnum(PATTERN_KINDS, PATTERN_SYNONYMS, 'FORMAT'),
    pattern: req(300),
    evidenceIds: ids(),
    measured: str(300).optional(),
    interpretation: req(600),
    confidence: looseEnum(['LOW', 'MEDIUM', 'HIGH'], { MODERATE: 'MEDIUM', MED: 'MEDIUM' }, 'LOW'),
    limitations: str(300).optional(),
  })), { min: 3, max: 8 }),
  cautions: looseArray(str(300), { max: 6 }),
});
export type AudienceOut = z.infer<typeof AudienceOutSchema>;

const gloss3 = z.preprocess(aliases({ title: ['titleEn'], logline: ['loglineEn'], hook: ['hookEn'] }), z.object({ title: str(120), logline: str(400), hook: str(400) }));
export const ConceptsOutSchema = z.preprocess(aliases({ chosen: ['chosenIndex', 'choice', 'chosenConcept', 'pick'], rationale: ['reason', 'why', 'choiceRationale'] }), z.object({
  concepts: looseArray(z.preprocess(aliases({ whyItWorks: ['why', 'appeal', 'whyItWillWork'], patternIds: ['patterns', 'usesPatterns', 'pattern_ids'], originalityNote: ['originality', 'whatIsNew'], risks: ['risk', 'weaknesses'] }), z.object({
    title: req(120), logline: req(400), hook: req(400), whyItWorks: req(600), patternIds: ids(), originalityNote: req(400), risks: str(400),
    score: looseNumber.pipe(z.number().min(0).max(10)).optional(),
    gloss: gloss3.optional(),
  })), { min: 3, max: 3 }),
  chosen: looseNumber.pipe(z.number().int().min(1).max(3)),
  rationale: req(900),
}));
export type ConceptsOut = z.infer<typeof ConceptsOutSchema>;

const DraftExtras = z.preprocess(aliases({ hook: ['opening', 'firstSeconds'], ending: ['endsWith', 'finale', 'resolution'], sampleLines: ['lines', 'voiceLines', 'dialogue'], answered: ['changes', 'addressed', 'revisions'] }), z.object({
  hook: req(500),
  ending: req(500),
  gloss: z.preprocess(aliases({ structure: ['scenes', 'episodes', 'sections'] }), z.object({ title: str(120).optional(), logline: str(400).optional(), premise: str(1600).optional(), hook: str(500).optional(), ending: str(500).optional(), structure: looseArray(z.object({ title: str(120), summary: str(400) }), { max: 8 }).optional() })).optional(),
  sampleLines: looseArray(z.preprocess(aliases({ speaker: ['character', 'characterName', 'who', 'name'], line: ['text', 'textAr', 'dialogue'], gloss: ['english', 'textEn', 'translation'] }), z.object({ speaker: req(80), line: req(300), gloss: str(300).optional() })), { max: 6 }).optional(),
  answered: looseArray(str(500), { max: 16 }).optional(),
}));
/** The writer's draft: the proposal schema the studio already uses, and the development's extras beside it. */
/** The proposal schema's limits, applied by cutting (clipText) before it validates; an age that is not a number from 1 to
 *  120 ("unknown", "30s" without digits, 0) is left out (the field is optional) rather than sent back for repair. */
const LIMITS = { title: 80, titleAr: 80, logline: 240, premise: 1600, genre: 60, mood: 80 } as const;
const fit = (v: unknown, max: number) => (typeof v === 'string' ? clipText(v.trim(), max) : v);
function fitDraft(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const [k, max] of Object.entries(LIMITS)) o[k] = fit(o[k], max);
  const each = (key: string, fn: (x: Record<string, unknown>) => Record<string, unknown>) => { if (Array.isArray(o[key])) o[key] = (o[key] as unknown[]).map((x) => (x && typeof x === 'object' ? fn({ ...(x as Record<string, unknown>) }) : x)); };
  each('structure', (x) => ({ ...x, title: fit(x.title, 80), summary: fit(x.summary, 400) }));
  each('cast', (x) => {
    const age = typeof x.ageYears === 'number' ? x.ageYears : typeof x.ageYears === 'string' ? Number(/\d+/.exec(x.ageYears)?.[0]) : NaN;
    const out = { ...x, name: fit(x.name, 60), role: fit(x.role, 120), reason: fit(x.reason, 240), appearance: fit(x.appearance, 400), personality: fit(x.personality, 400), ageYears: Number.isFinite(age) && age >= 1 && age <= 120 ? Math.round(age) : undefined };
    return out;
  });
  each('locations', (x) => ({ ...x, name: fit(x.name, 60), description: fit(x.description, 400) }));
  if (o.song && typeof o.song === 'object') { const s = o.song as Record<string, unknown>; o.song = { ...s, title: fit(s.title, 80), caption: fit(s.caption, 300), lyrics: fit(s.lyrics, 4000) }; }
  return o;
}
export const DraftOutSchema = z.preprocess(fitDraft, z.intersection(ProposalSchema, DraftExtras));
export type DraftOut = z.infer<typeof DraftOutSchema>;

const CRITERION_SYNONYMS = { HOOK: 'OPENING', BEGINNING: 'OPENING', START: 'OPENING', ORIGINAL: 'ORIGINALITY', NOVELTY: 'ORIGINALITY', EMOTIONAL_IMPACT: 'EMOTION', CHARACTERS: 'CHARACTER', CHARACTERISATION: 'CHARACTER', CHARACTERIZATION: 'CHARACTER', RHYTHM: 'PACING', TENSION: 'CONFLICT', STAKES: 'CONFLICT', SUSPENSE: 'CURIOSITY', INTRIGUE: 'CURIOSITY', VISUALS: 'VISUAL', VISUAL_STORYTELLING: 'VISUAL', ARC: 'PROGRESSION', DEVELOPMENT: 'PROGRESSION', PAYOFF: 'ENDING', LINES: 'DIALOGUE', LANGUAGE: 'DIALOGUE', DIALECT: 'DIALOGUE', CONSISTENCY: 'CONTINUITY', SONG: 'MUSIC_FIT', MUSIC: 'MUSIC_FIT' } as const;

/** Scores as an object of criterion → 1…5, or a list of {criterion, score}: both become the object. */
const scoreMap = (v: unknown): unknown => {
  if (Array.isArray(v)) return Object.fromEntries(v.filter((x) => x && typeof x === 'object').map((x) => { const o = x as Record<string, unknown>; return [String(o.criterion ?? o.name ?? o.key ?? ''), o.score ?? o.value]; }));
  return v ?? {};
};
export const ReviewOutSchema = z.object({
  scores: z.preprocess(scoreMap, z.record(z.string(), looseNumber.pipe(z.number().min(0).max(10)))),
  issues: looseArray(z.preprocess(aliases({ note: ['problem', 'issue', 'description', 'comment'], fix: ['suggestion', 'solution', 'recommendation', 'change'], where: ['location', 'part', 'section', 'scene'] }), z.object({
    criterion: looseEnum(REVIEW_CRITERIA, CRITERION_SYNONYMS, 'CLARITY'),
    severity: looseEnum(['MINOR', 'MAJOR'], { HIGH: 'MAJOR', CRITICAL: 'MAJOR', SEVERE: 'MAJOR', BLOCKER: 'MAJOR', LOW: 'MINOR', MEDIUM: 'MINOR', MODERATE: 'MINOR', SMALL: 'MINOR' }, 'MINOR'),
    where: str(200), note: req(500), fix: req(500),
  })), { max: 10 }),
  verdict: looseEnum(['APPROVE', 'REVISE'], { ACCEPT: 'APPROVE', APPROVED: 'APPROVE', OK: 'APPROVE', PASS: 'APPROVE', GOOD: 'APPROVE', REVISION: 'REVISE', CHANGES: 'REVISE', REJECT: 'REVISE', REWRITE: 'REVISE', NEEDS_REVISION: 'REVISE' }),
  summary: req(900),
});
export type ReviewOut = z.infer<typeof ReviewOutSchema>;
