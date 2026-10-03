import { REVIEW_CRITERIA, type ResearchItem, type ReviewCriterion, type ReviewIssue, type StoryReview } from '@/domain/development';
import type { IdeaProposal } from '@/domain/types';
import type { IdeaContext } from './context';
import { checkOriginality, tokens } from './originality';
import { structureBounds } from './strategy';
import type { ReviewOut } from './schemas';
import { lifeTimelineIssues, storyTexts, type LifeOf } from './timeline';

/** THE REVIEW RUBRIC (contract §2) — which criteria apply to a format, the checks the studio computes itself (they
 *  are issues like the reviewer's, marked CODE), and the verdict rule: a MAJOR issue — the reviewer's or the code's —
 *  means REVISE, whatever the reviewer concluded. */

export type Reviewer = StoryReview['reviewer'];

/** The criteria a format is scored on: CONTINUITY only for a continuing season or episode, MUSIC_FIT only for a music
 *  video (which is scored on its lyrics, not on dialogue). */
export function criteriaFor(kind: IdeaContext['kind']): ReviewCriterion[] {
  return REVIEW_CRITERIA.filter((c) => (c === 'CONTINUITY' ? kind === 'SEASON' || kind === 'EPISODE' : c === 'MUSIC_FIT' ? kind === 'MUSIC_VIDEO' : c === 'DIALOGUE' ? kind !== 'MUSIC_VIDEO' : true));
}

/** What each reviewer reads for: the Story Editor the craft, the Audience Experience Agent the viewer's experience. */
export const FOCUS: Record<Reviewer, ReviewCriterion[]> = {
  STORY_EDITOR: ['CLARITY', 'CHARACTER', 'CONFLICT', 'PROGRESSION', 'ENDING', 'DIALOGUE', 'CONTINUITY', 'MUSIC_FIT', 'ORIGINALITY'],
  AUDIENCE_EXPERIENCE: ['OPENING', 'CURIOSITY', 'EMOTION', 'PACING', 'VISUAL', 'ENDING', 'ORIGINALITY', 'MUSIC_FIT'],
};

const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SYN: Record<string, ReviewCriterion> = { HOOK: 'OPENING', BEGINNING: 'OPENING', ORIGINAL: 'ORIGINALITY', CHARACTERS: 'CHARACTER', RHYTHM: 'PACING', STAKES: 'CONFLICT', SUSPENSE: 'CURIOSITY', VISUALS: 'VISUAL', ARC: 'PROGRESSION', PAYOFF: 'ENDING', LINES: 'DIALOGUE', DIALECT: 'DIALOGUE', SONG: 'MUSIC_FIT', MUSIC: 'MUSIC_FIT' };

/** The reviewer's scores on the format's criteria only, as whole numbers 1…5 (a 1…10 answer is halved). */
export function normaliseScores(raw: Record<string, number>, kind: IdeaContext['kind']): Partial<Record<ReviewCriterion, number>> {
  const applicable = new Set(criteriaFor(kind));
  const entries = Object.entries(raw).map(([k, v]) => [SYN[slug(k)] ?? slug(k), v] as const).filter(([k]) => applicable.has(k as ReviewCriterion));
  const tenScale = entries.some(([, v]) => v > 5);
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.min(5, Math.max(1, Math.round(tenScale ? v / 2 : v)))]));
}

const ARABIC = /[؀-ۿ]/;
const overlap = (a: string, b: string) => { const x = new Set(tokens(a)); const y = tokens(b); return y.filter((t) => x.has(t)).length; };

export interface DraftForReview { proposal: Omit<IdeaProposal, 'development'>; hook: string; ending: string; sampleLines?: Array<{ speaker: string; line: string; gloss?: string }>; gloss?: { logline?: string; premise?: string; structure?: Array<{ title: string; summary: string }> } }

/** The people of a draft with their ages: a studio character's real age (the draft may misstate it), a new one's as
 *  written. */
export function draftPeople(d: Pick<DraftForReview, 'proposal'>, c: Pick<IdeaContext, 'mustCast' | 'library'>): LifeOf[] {
  const known = new Map([...c.mustCast, ...c.library.characters].map((x) => [x.id, x.ageYears]));
  return d.proposal.cast.map((x) => ({ name: x.name, ageYears: (x.characterId ? known.get(x.characterId) : undefined) ?? x.ageYears }));
}

/** The checks the studio computes on a draft, per reviewer. */
export function codeChecks(reviewer: Reviewer, d: DraftForReview, c: IdeaContext, items: ResearchItem[], year = new Date().getUTCFullYear()): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const p = d.proposal;
  const add = (criterion: ReviewCriterion, severity: ReviewIssue['severity'], where: string, note: string, fix: string) => out.push({ criterion, severity, where, note, fix, source: 'CODE' });
  if (reviewer === 'STORY_EDITOR') {
    out.push(...lifeTimelineIssues(storyTexts(d), draftPeople(d, c), year));
    const b = structureBounds(c);
    if (p.structure.length < b.min || p.structure.length > b.max) add('PACING', 'MINOR', 'structure', `${p.structure.length} ${b.unit} for this format (expected ${b.min}–${b.max}).`, `Restructure into ${b.min}–${b.max} ${b.unit}.`);
    if (c.language === 'AR' && !ARABIC.test(`${p.logline} ${p.premise}`)) add('DIALOGUE', 'MAJOR', 'logline and premise', 'The story is written in English, not in the Arabic dialect it is for.', 'Write the logline, premise and structure in the dialect first, then the English gloss.');
    if (c.language === 'AR' && d.sampleLines?.some((l) => !ARABIC.test(l.line))) add('DIALOGUE', 'MINOR', 'sample lines', 'A spoken line is not written in Arabic script.', 'Write every spoken line in the dialect, in Arabic script.');
    if (c.continuity) {
      const k = c.continuity;
      if (p.language !== k.language || (k.dialect && p.dialect !== k.dialect)) add('CONTINUITY', 'MAJOR', 'language', `The show is in ${k.language}${k.dialect ? ` (${k.dialect})` : ''}; the draft changed it.`, 'Keep the show\'s language and dialect.');
      const returning = new Set(k.returningCast.map((x) => x.id));
      if (returning.size && !p.cast.some((x) => x.characterId && returning.has(x.characterId))) add('CONTINUITY', 'MAJOR', 'cast', 'No returning character carries the story.', 'Build the story on the show\'s returning cast.');
      const newcomers = p.cast.filter((x) => x.isNew).length;
      if (newcomers > 2) add('CONTINUITY', 'MINOR', 'cast', `${newcomers} new characters at once.`, 'Keep newcomers to the one or two the story needs, each with a reason.');
      const open = k.bible?.unresolved ?? [];
      // the bible is kept in English (the Continuity Writer's record): an Arabic draft is compared through its gloss too
      const story = [p.premise, p.logline, ...p.structure.map((x) => `${x.title} ${x.summary}`), d.gloss?.premise, d.gloss?.logline, ...(d.gloss?.structure ?? []).map((x) => `${x.title} ${x.summary}`)].filter(Boolean).join(' ');
      if (open.length && !open.some((u) => overlap(story, u) >= 2)) add('CONTINUITY', 'MINOR', 'premise', 'None of the show\'s open storylines is picked up.', `Pick up at least one open storyline (e.g. “${open[0].slice(0, 80)}”).`);
    }
    if (c.kind === 'MUSIC_VIDEO') {
      const lyrics = p.song?.lyrics ?? '';
      if (!p.song || !/\[(verse|chorus|bridge|intro|outro|pre-chorus)/i.test(lyrics)) add('MUSIC_FIT', 'MAJOR', 'song', 'The music video has no song with tagged sections.', 'Write the song first: title, caption and lyrics with [verse]/[chorus]/[bridge] tags.');
      else if (!p.structure.every((s) => /verse|chorus|bridge|intro|outro|hook|مقطع|كورس|لازمة/i.test(`${s.title} ${s.summary}`))) add('MUSIC_FIT', 'MINOR', 'structure', 'Not every visual section names the song section it plays over.', 'Map each section to its song section (Verse 1, Chorus, …).');
    }
    const orig = checkOriginality({ id: 'draft', title: p.title, logline: p.logline, hook: d.hook, gloss: { title: p.titleAr } }, items);
    if (!orig.ok) add('ORIGINALITY', 'MAJOR', 'title', `The draft ${orig.note}.`, 'Give the story its own title and names; research is a pattern, not material.');
  } else {
    if (!d.hook.trim()) add('OPENING', 'MAJOR', 'hook', 'There is no hook.', 'Write what the first seconds show that makes a viewer stay.');
    else if (p.structure[0] && overlap(`${p.structure[0].title} ${p.structure[0].summary}`, d.hook) === 0) add('OPENING', 'MINOR', 'structure[0]', 'The first scene does not deliver the hook.', 'Open the first scene on the hook itself.');
    if (!d.ending.trim()) add('ENDING', 'MAJOR', 'ending', 'There is no ending.', 'Say how it ends and why the ending pays off.');
    if (c.kind === 'SHORT' && c.durationSeconds <= 60 && p.structure.length > 4) add('PACING', 'MINOR', 'structure', `${p.structure.length} scenes in ${c.durationSeconds} s leaves seconds per scene.`, 'Fewer, fuller scenes.');
  }
  return out;
}

/** The review as stored: the reviewer's scores and issues on the format's criteria, the code's issues beside them, and
 *  the verdict rule applied. */
export function finaliseReview(reviewer: Reviewer, agentId: string, draft: number, out: ReviewOut, code: ReviewIssue[], kind: IdeaContext['kind']): StoryReview {
  const applicable = new Set(criteriaFor(kind));
  const issues: ReviewIssue[] = [...out.issues.filter((i) => applicable.has(i.criterion)).map((i) => ({ ...i, source: 'MODEL' as const })), ...code];
  const verdict: StoryReview['verdict'] = out.verdict === 'REVISE' || issues.some((i) => i.severity === 'MAJOR') ? 'REVISE' : 'APPROVE';
  return { reviewer, agentId, scores: normaliseScores(out.scores, kind), issues, verdict, summary: out.summary, draft };
}

/** Whether the reviews ask for the one revision. */
export const needsRevision = (reviews: StoryReview[]) => reviews.some((r) => r.verdict === 'REVISE' || r.issues.some((i) => i.severity === 'MAJOR'));
