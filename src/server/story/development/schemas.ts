import { z } from 'zod';
import { PATTERN_KINDS, REVIEW_CRITERIA } from '@/domain/development';
import { aliases, looseArray, looseEnum, looseNumber, looseString } from '../lenient';
import { ProposalSchema } from '../schemas';

/** WHAT THE DEVELOPMENT AGENTS MUST RETURN — strict about meaning, tolerant about spelling (lenient.ts), like every
 *  story schema. The writer's draft is the existing proposal schema (reused, not duplicated) plus the hook, the
 *  ending, the English gloss of an Arabic story, a few lines that set its voice, and — in a revision — what each review
 *  note became. */

const str = (max = 400) => looseString.pipe(z.string().trim().max(max));
const req = (max = 400) => looseString.pipe(z.string().trim().min(1).max(max));
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
export const DraftOutSchema = z.intersection(ProposalSchema, DraftExtras);
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
