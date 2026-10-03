import type { z } from 'zod';
import type { StudioState } from '@/domain/types';
import type { AudienceAnalysis, Concept, ConceptSet, ResearchItem, ResearchRunSummary, StoryReview } from '@/domain/development';
import { StudioError } from '@/domain/errors';
import { json as llmJson, type LlmMessage, type LlmOptions, type LlmResult } from '@/server/providers/llm';
import { agentPrompt } from '@/server/org/skills';
import { styleDirection } from '../style';
import { describeIdea, type IdeaContext } from './context';
import { disciplinedAnalysis, evidenceIds } from './evidence';
import { checkOriginality } from './originality';
import { resolveDraft } from './resolve';
import { codeChecks, criteriaFor, finaliseReview, type DraftForReview, type Reviewer } from './rubric';
import { AudienceOutSchema, ConceptsOutSchema, DraftOutSchema, ReviewOutSchema, type DraftOut } from './schemas';
import { continuityRules, ENGAGEMENT_RULES, languageRules, ORIGINALITY_RULES, STRATEGY_RULES, structureBounds } from './strategy';
import { TIMELINE_RULES } from './timeline';

/** THE DEVELOPMENT ENGINE — one structured model call per stage (the local qwen3:14b through the studio's LLM
 *  provider, or the configured hosted model), each validated against its schema with repair rounds, then checked in
 *  code: evidence traced, originality checked, the rubric applied. Temperature per stage: concepts high, writing
 *  warm, reviews low. The calling agent's instructions and PROMPT skills are appended to the system message. */

export interface DevOptions extends LlmOptions { agentId?: string; onResult?: (r: LlmResult) => void }

const BASE = `You are part of the story development department of Vewbox Studio, an AI filmmaking studio that makes ORIGINAL shows, short films and music videos (cartoon, anime or realistic) in English or Arabic, including Iraqi (Baghdadi) Arabic. Every story is produced as short generated video shots of 4–15 seconds with consistent characters and places, so stories are visual, concrete and producible. Answer with ONE JSON object only — no prose before or after it, no markdown fences, no comments.`;
const system = (content: string, opts: DevOptions): LlmMessage => ({ role: 'system', content: `${BASE}\n\n${content}${agentPrompt(opts.agentId)}` });
const compact = (v: unknown) => JSON.stringify(v);
/** Per call: under the story tool's 600 s bound, with the repair rounds inside it. */
const CALL_MS = 280_000;

async function ask<T>(schema: z.ZodType<T>, messages: LlmMessage[], opts: DevOptions, tune: { maxTokens: number; temperature: number }): Promise<T> {
  const r = await llmJson(schema, messages, { ...opts, timeoutMs: opts.timeoutMs ?? CALL_MS, maxTokens: tune.maxTokens, temperature: tune.temperature, repairs: 1 });
  opts.onResult?.(r.result);
  return r.data;
}

const ideaLines = (c: IdeaContext) => [
  `The request: ${describeIdea(c)}, about ${c.durationSeconds} seconds${c.kind === 'SHOW' || c.kind === 'SEASON' ? ' per episode' : ''}.`,
  c.genre ? `Genre: ${c.genre}.` : '', c.mood ? `Mood: ${c.mood}.` : '',
  c.kind === 'MUSIC_VIDEO' ? `Treatment: ${c.concept ?? 'PERFORMANCE'} (PERFORMANCE = the singer performs on screen; NARRATIVE = a story illustrates the song; MIXED = both).` : '',
  c.brief ? `The producer's own idea (build on it exactly): """${c.brief}"""` : '',
  c.direction ? `The producer's creative direction: """${c.direction}"""` : '',
].filter(Boolean).join('\n');

const direction = (c: IdeaContext) => { const d = styleDirection(c.style); return `PRODUCTION DIRECTION: ${d.name}. ${d.writing}`; };

// ------------------------------------------------------------------------------------------- 2. audience

/** The Audience Research Agent: the evidence → storytelling patterns for this audience and format. */
export async function analyseAudience(c: IdeaContext, run: Pick<ResearchRunSummary, 'status' | 'coverage' | 'limitations'>, items: ResearchItem[], opts: DevOptions = {}): Promise<{ analysis: AudienceAnalysis; downgraded: number; droppedRefs: number }> {
  const ids = evidenceIds(items);
  const evidence = items.map((it, i) => ({ id: `E${i + 1}`, platform: it.platform, title: it.title, category: it.category, date: it.publishedAt?.slice(0, 10) ?? it.query.match(/\d{4}-\d{2}-\d{2}/)?.[0], metrics: it.metrics, about: it.excerpt, from: it.query }));
  const coverage = run.coverage.map((x) => `${x.platform}: ${x.status} — ${x.detail}`).join('\n');
  const user = `${ideaLines(c)}
${c.audience ? `The producer's audience: ${c.audience}.` : 'The producer named no audience: name the audience this should be made for, concretely (age, place, what they watch).'}
${c.continuity ? `It continues the show “${c.continuity.title}” (${c.continuity.genre}): ${c.continuity.logline}` : ''}
RESEARCH RUN (${run.status}). What each platform answered:
${coverage}
Limitations: ${run.limitations.join(' ') || 'none recorded'}
${items.length ? `EVIDENCE (cite by id; "metrics" are the source's own numbers, nothing else is measured):\n${compact(evidence)}` : 'NO EVIDENCE was reachable. Give storytelling-craft patterns only: evidenceIds empty, no "measured" field.'}
TASK: 4–6 storytelling patterns this audience responds to, for this format. For each pattern:
- kind: one of HOOK, CURIOSITY, EMOTION, PACING, CHARACTER, SUSPENSE, HUMOR, SURPRISE, ENDING, REPLAY, FORMAT, MUSIC, VISUAL, CULTURE
- pattern: one sentence a writer can use
- evidenceIds: the E-ids it rests on ([] when it is craft knowledge)
- measured: OPTIONAL — only numbers copied exactly from the cited items' metrics, with what they count (e.g. "E2: 238832 pageviews on 2026-10-02"); leave it out when you have none. Never compute, round or estimate a number.
- interpretation: your reading of what the pattern means for this story (an interpretation, not a measurement)
- confidence: LOW, MEDIUM or HIGH (HIGH only when several sources agree)
- limitations: what this pattern cannot claim
Then "cautions": what this evidence does NOT show (e.g. views measure reach, not quality; reading about a title is not watching it).
Return JSON: { "audience": "...", "patterns": [ ... ], "cautions": [ ... ] }`;
  const out = await ask(AudienceOutSchema, [system(`You are the Audience Research Agent. You turn research evidence into storytelling patterns and keep measurement apart from interpretation: a number appears only when a source returned it.`, opts), { role: 'user', content: user }], opts, { maxTokens: 3500, temperature: 0.3 });
  return disciplinedAnalysis(out, items, ids, c.audience);
}

// ------------------------------------------------------------------------------------------- 3. concepts

const rulesFor = (c: IdeaContext) => [STRATEGY_RULES[c.strategy], ENGAGEMENT_RULES, ORIGINALITY_RULES, TIMELINE_RULES, languageRules(c.language, c.dialect), direction(c), continuityRules(c)].filter(Boolean).join('\n\n');
const continuityContext = (c: IdeaContext) => (c.continuity ? `SHOW CONTEXT: ${compact(c.continuity)}` : '');
const avoidList = (items: ResearchItem[]) => Array.from(new Set(items.flatMap((i) => [i.title, i.creator].filter((x): x is string => Boolean(x))))).slice(0, 40);

/** The Creative Concept Agent: three distinct concepts on the patterns, checked for originality in code; the chosen
 *  one passed its check, and the rationale names the patterns it builds on. One more round when all three fail. */
export async function developConcepts(c: IdeaContext, analysis: AudienceAnalysis, items: ResearchItem[], opts: DevOptions = {}): Promise<ConceptSet> {
  const patterns = analysis.patterns.map((p) => ({ id: p.id, kind: p.kind, pattern: p.pattern, measured: p.measured, interpretation: p.interpretation, confidence: p.confidence }));
  const ar = c.language === 'AR';
  const base = `${ideaLines(c)}
${rulesFor(c)}
${continuityContext(c)}
AUDIENCE: ${analysis.audience} (basis: ${analysis.basis === 'EVIDENCE' ? 'research evidence' : 'storytelling craft only — no research'}).
PATTERNS (cite their ids in patternIds): ${compact(patterns)}
${c.mustCast.length ? `These existing characters must be in it: ${compact(c.mustCast)}` : ''}${c.mustLocations.length ? `\nThese existing places must be used: ${compact(c.mustLocations)}` : ''}
${items.length ? `RESEARCHED TITLES AND NAMES — never reuse, echo or imitate any of them: ${compact(avoidList(items))}` : ''}
TASK: THREE distinct, original concepts (different premises, not variations of one). For each: title${ar ? ' (in the dialect)' : ''}, logline${ar ? ' (in the dialect)' : ''}, hook (what the first 3–5 seconds show${ar ? ', in the dialect' : ''}), whyItWorks (which patterns and how), patternIds, originalityNote (what is new here), risks, score (0–10, your honest estimate)${ar ? ', gloss: { title, logline, hook } — the faithful English gloss' : ''}.
Then choose the strongest: "chosen" is 1, 2 or 3, and "rationale" explains the choice, naming the pattern ids it builds on.
Return JSON: { "concepts": [ {...}, {...}, {...} ], "chosen": 1, "rationale": "..." }`;
  const sys = system(`You are the Creative Concept Agent. You invent original concepts that use what the audience responds to — never what someone else made.`, opts);
  let refusals = '';
  for (let round = 1; round <= 2; round++) {
    const out = await ask(ConceptsOutSchema, [sys, { role: 'user', content: base + refusals }], opts, { maxTokens: 4500, temperature: round === 1 ? 0.9 : 0.8 });
    const concepts: Concept[] = out.concepts.map((x, i) => ({ id: `C${i + 1}`, title: x.title, logline: x.logline, hook: x.hook, whyItWorks: x.whyItWorks, patternIds: x.patternIds.map((p) => p.trim().toUpperCase()).filter((p) => analysis.patterns.some((q) => q.id === p)), originalityNote: x.originalityNote, risks: x.risks, score: x.score, gloss: ar && x.gloss ? { title: x.gloss.title, logline: x.gloss.logline, hook: x.gloss.hook } : undefined }));
    const originality = concepts.map((x) => checkOriginality(x, items));
    const passing = concepts.filter((_, i) => originality[i].ok);
    if (!passing.length) {
      if (round === 2) throw new StudioError('PROVIDER', `None of the concepts passed the originality check twice (${originality.map((o) => `${o.conceptId}: ${o.note}`).join('; ')}).`, { failureClass: 'PROVIDER' });
      refusals = `\n\nYOUR PREVIOUS THREE CONCEPTS WERE REFUSED by the originality check: ${originality.map((o, i) => `“${concepts[i].title}” — ${o.note}`).join('; ')}. Write three NEW concepts that avoid this.`;
      continue;
    }
    const wanted = concepts[out.chosen - 1];
    const chosen = wanted && originality[concepts.indexOf(wanted)].ok ? wanted : [...passing].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    let rationale = out.rationale.trim();
    if (chosen !== wanted) rationale = `${wanted ? `“${wanted.title}” was the writer's pick but failed the originality check (${originality[concepts.indexOf(wanted)].note}); ` : ''}“${chosen.title}” is the strongest original concept. ${rationale}`;
    // the rationale names the patterns the chosen concept builds on
    const named = chosen.patternIds.filter((p) => rationale.includes(p));
    if (!named.length) {
      const uses = chosen.patternIds.length ? chosen.patternIds : analysis.patterns.slice(0, 2).map((p) => p.id);
      rationale = `${rationale} Builds on ${uses.map((p) => { const q = analysis.patterns.find((x) => x.id === p); return q ? `${p} (${q.kind.toLowerCase()}: ${q.pattern.replace(/\.$/, '')})` : p; }).join('; ')}.`;
      if (!chosen.patternIds.length) chosen.patternIds = uses;
    }
    return { concepts, chosenId: chosen.id, rationale, originality };
  }
  throw new StudioError('PROVIDER', 'No concept was developed.');
}

// ------------------------------------------------------------------------------------------- 4. writing

export interface DraftContent extends DraftForReview {
  strategy: IdeaContext['strategy'];
  draft: number;
  gloss?: DraftOut['gloss'];
  /** A revision: what each review note became. */
  answered?: string[];
  conceptId: string;
}

const KEYS = (c: IdeaContext) => `title (English${c.language === 'AR' ? ': the faithful English gloss of titleAr' : ''}), ${c.language === 'AR' ? 'titleAr (the title in the dialect), ' : ''}logline (one sentence), premise (2–4 short paragraphs, under 1500 characters), genre, mood, hook (what the first 3–5 seconds show), ending (how it ends and why it pays off), structure (array of {title, summary — under 300 characters}), cast (array of {existingCharacterId?, name, role, reason, sex: FEMALE or MALE, ageYears: a whole number, appearance, personality}), locations (array of {existingLocationId?, name, description, kind}), sampleLines (2–4 short lines that set the voice: {speaker, line${c.language === 'AR' ? ', gloss' : ''}})${c.language === 'AR' ? ', gloss: { title, logline, premise, hook, ending, structure: [{title, summary}] } — the faithful English gloss' : ''}${c.kind === 'MUSIC_VIDEO' ? ', song: { title, caption (genre, tempo, instrumentation, voice — one sentence), lyrics (complete, with [verse]/[chorus]/[bridge] tags and one blank line between sections) }' : ''}`;

const writingTask = (c: IdeaContext) => {
  const b = structureBounds(c);
  return `Target running time: about ${c.durationSeconds} seconds${c.kind === 'SHOW' || c.kind === 'SEASON' ? ' per episode' : ''}. The structure has ${b.min}–${b.max} ${b.unit}; each summary says what happens and why it matters.
${c.kind === 'MUSIC_VIDEO' ? 'Write the SONG FIRST (its lyrics, mood, tempo, structure and emotional progression), then the visual sections in the song\'s order, each titled with its song section (Verse 1, Chorus, …); name the performers in the cast; performers sing their assigned sections on screen.' : ''}
${c.language === 'AR' ? 'Everything the audience reads or hears — titles, logline, premise, structure, hook, ending, sample lines — is written in the dialect FIRST; the English gloss comes after, in "gloss" and "title".' : ''}
${c.continuity ? 'Reuse the returning cast and places by existingCharacterId / existingLocationId; at most one or two newcomers, each with the reason the story needs them.' : `Studio characters and places you may reuse by id when they genuinely fit (otherwise invent new ones): ${compact(c.library)}`}
For a new character "appearance" is one dense sentence of how they look (age, build, face, hair, skin, eyes, wardrobe, one distinguishing detail), in English.`;
};

/** The Screenwriter: the chosen concept → the full proposal by the format's strategy; or, given draft 1 and the
 *  reviews, the one revision. The cast and places are resolved against the studio by name and id. */
export async function writeDraft(s: StudioState, c: IdeaContext, input: { concept: Concept; analysis: AudienceAnalysis; revise?: { draft: DraftContent; reviews: StoryReview[] } }, opts: DevOptions = {}): Promise<DraftContent> {
  const { concept, analysis, revise } = input;
  const patterns = analysis.patterns.filter((p) => concept.patternIds.includes(p.id)).map((p) => ({ id: p.id, kind: p.kind, pattern: p.pattern }));
  const sys = system(`You are the Screenwriter of the development: you turn the chosen concept into the proposal the producer reviews, by the format's strategy.`, opts);
  let user: string;
  if (!revise) {
    user = `${ideaLines(c)}
${rulesFor(c)}
${continuityContext(c)}
THE CHOSEN CONCEPT: ${compact({ title: concept.title, logline: concept.logline, hook: concept.hook, whyItWorks: concept.whyItWorks, gloss: concept.gloss })}
AUDIENCE: ${analysis.audience}. PATTERNS IT BUILDS ON: ${compact(patterns)}
${c.mustCast.length ? `These existing characters MUST be in it (by existingCharacterId): ${compact(c.mustCast)}` : ''}${c.mustLocations.length ? `\nThese existing places MUST be used (by existingLocationId): ${compact(c.mustLocations)}` : ''}
${writingTask(c)}
Return JSON with exactly these keys: ${KEYS(c)}.`;
  } else {
    const notes = revise.reviews.flatMap((r) => r.issues.map((i) => ({ who: r.reviewer === 'STORY_EDITOR' ? 'Story Editor' : 'Audience Experience', ...i })));
    const numbered = notes.map((n, i) => `#${i + 1} [${n.who}, ${n.severity}, ${n.criterion}${n.where ? `, ${n.where}` : ''}] ${n.note} → ${n.fix}`).join('\n');
    const d = revise.draft;
    user = `${ideaLines(c)}
${rulesFor(c)}
${continuityContext(c)}
REVISE draft ${d.draft} ONCE, answering the reviewers' notes. Keep what works; change what the notes ask; keep the concept, the language and dialect, and every existing character's and place's id.
THE DRAFT: ${compact({ title: d.proposal.title, titleAr: d.proposal.titleAr, logline: d.proposal.logline, premise: d.proposal.premise, genre: d.proposal.genre, mood: d.proposal.mood, hook: d.hook, ending: d.ending, structure: d.proposal.structure, cast: d.proposal.cast.map((x) => ({ existingCharacterId: x.characterId, name: x.name, role: x.role, reason: x.reason, sex: x.sex, ageYears: x.ageYears, appearance: x.appearance, personality: x.personality })), locations: d.proposal.locations.map((l) => ({ existingLocationId: l.locationId, name: l.name, description: l.description, kind: l.kind })), sampleLines: d.sampleLines, gloss: d.gloss, song: d.proposal.song })}
THE REVIEWERS' NOTES (answer every one):
${numbered || '(none)'}
${writingTask(c)}
Return the complete revised JSON with exactly these keys: ${KEYS(c)}, and "answered": one entry per note, "#n: what you changed".`;
  }
  const out = await ask(DraftOutSchema, [sys, { role: 'user', content: user }], opts, revise ? { maxTokens: 7000, temperature: 0.6 } : { maxTokens: 6500, temperature: 0.8 });
  const proposal = resolveDraft(s, c, out);
  const notesCount = revise ? revise.reviews.reduce((a, r) => a + r.issues.length, 0) : 0;
  const answered = revise ? (out.answered?.length ? out.answered : Array.from({ length: notesCount }, (_, i) => `#${i + 1}: the writer did not say how this note was answered`)) : undefined;
  return { proposal, hook: out.hook, ending: out.ending, sampleLines: out.sampleLines, gloss: c.language === 'AR' ? out.gloss : undefined, strategy: c.strategy, draft: revise ? revise.draft.draft + 1 : 1, answered, conceptId: concept.id };
}

// ------------------------------------------------------------------------------------------- 5–6. reviews

const FOCUS_TEXT: Record<Reviewer, string> = {
  STORY_EDITOR: 'You are the Story Editor. Read for craft: is it clear, do the characters want something, is the conflict real, does it progress, does the ending pay off, do the sample lines sound like people (and, for an Arabic story, like the dialect — not Modern Standard Arabic, not a translation), does it keep the show\'s continuity, does a music video follow its song, is it original.',
  AUDIENCE_EXPERIENCE: 'You are the Audience Experience reviewer. Read as the audience, second by second: do the first 3–5 seconds earn attention, is there curiosity and emotion, is the pacing free of dead air, does it read visually, does the ending pay off. Flag manipulative retention tricks, arbitrary twists, constant action for its own sake and needless cliffhangers.',
};

/** A reviewer reads the draft against the rubric; the studio adds its own checks and applies the verdict rule. */
export async function reviewDraft(c: IdeaContext, d: DraftContent, reviewer: Reviewer, items: ResearchItem[], opts: DevOptions = {}): Promise<StoryReview> {
  const criteria = criteriaFor(c.kind);
  const user = `${ideaLines(c)}
${STRATEGY_RULES[c.strategy]}
${ENGAGEMENT_RULES}
${languageRules(c.language, c.dialect)}
${continuityRules(c)}
${continuityContext(c)}
DRAFT ${d.draft}: ${compact({ title: d.proposal.title, titleAr: d.proposal.titleAr, logline: d.proposal.logline, premise: d.proposal.premise, hook: d.hook, ending: d.ending, structure: d.proposal.structure, cast: d.proposal.cast.map((x) => ({ name: x.name, role: x.role, returning: Boolean(x.characterId) })), places: d.proposal.locations.map((l) => l.name), sampleLines: d.sampleLines, song: d.proposal.song, gloss: d.gloss })}
TASK: score each of these criteria from 1 (poor) to 5 (excellent): ${criteria.join(', ')}. List concrete issues as {criterion, severity, where, note, fix}: MAJOR only when the story fails its format or audience without the fix, MINOR otherwise; at most 6 issues, the most important first. verdict: APPROVE, or REVISE when the draft needs another pass. summary: 2–3 sentences.
Return JSON: { "scores": { ${criteria.slice(0, 2).map((x) => `"${x}": 4`).join(', ')}, … }, "issues": [ … ], "verdict": "APPROVE", "summary": "…" }`;
  const out = await ask(ReviewOutSchema, [system(FOCUS_TEXT[reviewer], opts), { role: 'user', content: user }], opts, { maxTokens: 2500, temperature: 0.2 });
  return finaliseReview(reviewer, opts.agentId ?? (reviewer === 'STORY_EDITOR' ? 'story-editor' : 'audience-experience'), d.draft, out, codeChecks(reviewer, d, c, items), c.kind);
}
