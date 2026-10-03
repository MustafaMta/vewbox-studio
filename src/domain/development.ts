import type { Dialect, Language } from './vocabulary';
import type { IdeaProposal } from './types';

/** STORY DEVELOPMENT — the research-driven Auto Idea (docs/CONTRACTS-AUTO-IDEA.md).
 *
 *  An Auto Idea is not one prompt. The Head of Story runs a development pipeline of real agents, each a durable child
 *  job that writes a versioned artifact:
 *
 *    Trend Research → Audience Analysis → Creative Concepts → Screenwriting → Story Editing → Audience Experience
 *    review → (one revision when a reviewer asks for it) → the proposal the producer edits before anything is made.
 *
 *  Research is evidence, never invention: every item has its platform, URL, dates and only the measurements the
 *  source itself returned. A platform the studio cannot legitimately reach is recorded as such, with the reason, and
 *  the pipeline continues on what was reachable — or as an explicitly original concept. */

// ------------------------------------------------------------------------------------------------- research

/** The platforms in the producer's priority order, then the supporting public sources. */
export const RESEARCH_PLATFORMS = ['TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'NEWS', 'WIKIPEDIA'] as const;
export type ResearchPlatform = (typeof RESEARCH_PLATFORMS)[number];

/** How a platform answered this run. CACHED: served from a still-valid earlier fetch. EMPTY: reachable, nothing
 *  relevant. NOT_CONFIGURED: a permitted API exists but its credentials are not set. UNSUPPORTED: no permitted access
 *  path exists for this studio. DISABLED: switched off in Settings. SKIPPED: not relevant to this request. */
export const PROVIDER_STATUSES = ['OK', 'CACHED', 'EMPTY', 'NOT_CONFIGURED', 'UNSUPPORTED', 'RATE_LIMITED', 'FAILED', 'DISABLED', 'SKIPPED'] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
/** The statuses that mean the platform answered (with items or without). */
export const ANSWERED_STATUSES: readonly ProviderStatus[] = ['OK', 'CACHED', 'EMPTY'];

export const RESEARCH_CATEGORIES = ['COMEDY', 'DRAMA', 'ROMANCE', 'MYSTERY', 'SUSPENSE', 'HORROR', 'ANIMATION', 'ANIME', 'SHORT_FORM', 'MUSIC_VIDEO', 'MUSIC', 'FILM', 'SERIES', 'OTHER'] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

export interface ProviderCoverage {
  platform: ResearchPlatform;
  /** The access path used, e.g. 'youtube-data-api-v3', 'wikimedia-pageviews', 'gdelt-doc-2'. */
  provider: string;
  status: ProviderStatus;
  /** One sentence a producer can read: what was reached, or why not. Never a secret. */
  detail: string;
  queries: number;
  items: number;
  fetchedAt?: string;
  cachedUntil?: string;
}

/** Only numbers the source returned, with the source's own meaning; absent when the source gives none. */
export interface ResearchMetrics { views?: number; likes?: number; comments?: number; shares?: number; pageviews?: number; rank?: number; articles?: number; periodDays?: number }

/** One piece of evidence. No reproduced content: a title, a link, at most a 200-character description the source
 *  published about itself, and its measurements. */
export interface ResearchItem {
  id: string;
  platform: ResearchPlatform;
  provider: string;
  url: string;
  title: string;
  /** When the source published it, when known. */
  publishedAt?: string;
  /** When the studio fetched it. */
  retrievedAt: string;
  category: ResearchCategory;
  language?: string;
  region?: string;
  metrics: ResearchMetrics;
  excerpt?: string;
  /** The query or list it came from (e.g. 'mostPopular IQ/24', 'top ar.wikipedia 2026-10-01'). */
  query: string;
  /** The channel, account or publisher the source names (never a concept's material: the originality check refuses
   *  a concept that names it). */
  creator?: string;
}

/** A topic the Trend Research Agent chose for this request, and why. */
export interface ResearchTopic { query: string; platforms: ResearchPlatform[]; categories: ResearchCategory[]; language: Language; region?: string; reason: string }

export interface ResearchRunSummary {
  id: string;
  /** COMPLETE: every relevant platform answered. PARTIAL: some did. UNAVAILABLE: none did (the concept is original
   *  only). DISABLED: research is off in Settings or for this request. */
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'DISABLED';
  topics: ResearchTopic[];
  coverage: ProviderCoverage[];
  itemIds: string[];
  /** Items served from cache instead of fetched again. */
  reusedFromCache: number;
  limitations: string[];
  startedAt: string;
  finishedAt: string;
}

/** The run's status from its coverage (contract §3): DISABLED when every platform is off, UNAVAILABLE when no
 *  relevant platform answered, COMPLETE when every relevant one did, PARTIAL otherwise. A platform that is DISABLED or
 *  SKIPPED is not relevant to the run; one without credentials or without a permitted path is relevant and did not
 *  answer — so this machine's runs are honestly PARTIAL. */
export function runStatusOf(coverage: ProviderCoverage[]): ResearchRunSummary['status'] {
  const relevant = coverage.filter((c) => c.status !== 'DISABLED' && c.status !== 'SKIPPED');
  if (!relevant.length) return 'DISABLED';
  const answered = relevant.filter((c) => ANSWERED_STATUSES.includes(c.status));
  if (!answered.length) return 'UNAVAILABLE';
  return answered.length === relevant.length ? 'COMPLETE' : 'PARTIAL';
}

/** A run that never queried anything: research off (DISABLED) or failed as a whole (UNAVAILABLE), every platform
 *  listed with the reason, in priority order. */
export function emptyRun(id: string, status: 'DISABLED' | 'UNAVAILABLE', reason: string, at = new Date().toISOString()): ResearchRunSummary {
  return {
    id, status, topics: [], itemIds: [], reusedFromCache: 0, startedAt: at, finishedAt: at,
    coverage: RESEARCH_PLATFORMS.map((platform) => ({ platform, provider: 'none', status: status === 'DISABLED' ? 'DISABLED' : 'FAILED', detail: reason, queries: 0, items: 0 })),
    limitations: [status === 'DISABLED' ? 'Original concept — no trend research was used.' : `Research was unavailable (${reason}); the concept is original and rests on storytelling craft only.`],
  };
}

// ------------------------------------------------------------------------------------------ analysis → story

export const PATTERN_KINDS = ['HOOK', 'CURIOSITY', 'EMOTION', 'PACING', 'CHARACTER', 'SUSPENSE', 'HUMOR', 'SURPRISE', 'ENDING', 'REPLAY', 'FORMAT', 'MUSIC', 'VISUAL', 'CULTURE'] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

/** A storytelling pattern the Audience Research Agent drew from the evidence. `measured` quotes only numbers present
 *  in the cited items; `interpretation` is the agent's reading and is labelled as such. A pattern with no evidence is
 *  craft knowledge (`evidenceIds` empty, confidence LOW at most MEDIUM) and says so. */
export interface AudiencePattern { id: string; kind: PatternKind; pattern: string; evidenceIds: string[]; measured?: string; interpretation: string; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; limitations?: string }

export interface AudienceAnalysis {
  audience: string;
  /** EVIDENCE: built on research items. CRAFT_ONLY: no evidence was reachable; the patterns are storytelling craft. */
  basis: 'EVIDENCE' | 'CRAFT_ONLY';
  patterns: AudiencePattern[];
  /** What the evidence does NOT show (e.g. "views measure reach, not whether the story worked"). */
  cautions: string[];
}

export interface Concept {
  id: string;
  /** In the story's language (an Iraqi story's title is Baghdadi Arabic); `gloss` carries the English for review. */
  title: string;
  logline: string;
  /** The first seconds: why a viewer keeps watching. */
  hook: string;
  whyItWorks: string;
  /** The patterns it builds on. */
  patternIds: string[];
  originalityNote: string;
  risks: string;
  score?: number;
  /** Arabic stories: the English gloss of title, logline and hook (written after the dialect, never before it). */
  gloss?: { title: string; logline: string; hook: string };
}

export interface OriginalityCheck { conceptId: string; ok: boolean; closest?: { itemId: string; title: string; similarity: number }; note?: string }
export interface ConceptSet { concepts: Concept[]; chosenId: string; rationale: string; originality: OriginalityCheck[] }

export const REVIEW_CRITERIA = ['OPENING', 'CLARITY', 'ORIGINALITY', 'EMOTION', 'CHARACTER', 'PACING', 'CONFLICT', 'CURIOSITY', 'VISUAL', 'PROGRESSION', 'ENDING', 'DIALOGUE', 'CONTINUITY', 'MUSIC_FIT'] as const;
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

/** `source`: MODEL (the reviewer's reading) or CODE (a check the studio computes, e.g. a show's language changed). */
export interface ReviewIssue { criterion: ReviewCriterion; severity: 'MINOR' | 'MAJOR'; where: string; note: string; fix: string; source?: 'MODEL' | 'CODE' }
export interface StoryReview {
  reviewer: 'STORY_EDITOR' | 'AUDIENCE_EXPERIENCE';
  agentId: string;
  /** 1 (poor) … 5 (excellent), only for the criteria that apply to the format. */
  scores: Partial<Record<ReviewCriterion, number>>;
  issues: ReviewIssue[];
  verdict: 'APPROVE' | 'REVISE';
  summary: string;
  /** Which draft it read (1 = first draft, 2 = the revision). */
  draft: number;
}

/** The storytelling strategy per format (§3 of the directive). */
export const STORY_STRATEGIES = ['SHORT_FOCUSED', 'SHOW_SERIAL', 'SEASON_CONTINUATION', 'EPISODE_CONTINUATION', 'MUSIC_FIRST'] as const;
export type StoryStrategy = (typeof STORY_STRATEGIES)[number];

export type IdeaKind = 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO';
export const STRATEGY_OF: Record<IdeaKind, StoryStrategy> = { SHORT: 'SHORT_FOCUSED', SHOW: 'SHOW_SERIAL', SEASON: 'SEASON_CONTINUATION', EPISODE: 'EPISODE_CONTINUATION', MUSIC_VIDEO: 'MUSIC_FIRST' };

export const DEVELOPMENT_STAGES = ['RESEARCH', 'AUDIENCE', 'CONCEPTS', 'WRITING', 'EDITING', 'AUDIENCE_REVIEW', 'REVISION', 'PROPOSAL'] as const;
export type DevelopmentStage = (typeof DEVELOPMENT_STAGES)[number];
/** The progress phase a stage reports (`progress.phase`): its name in lower case, words separated by a space. */
export const stagePhase = (s: DevelopmentStage) => s.toLowerCase().replace(/_/g, ' ');

/** A stage's outcome as the orchestrator reports it (job result `steps`, the same shape as CREATE_CHARACTER). */
export interface DevelopmentStep { stage: DevelopmentStage; status: 'done' | 'skipped' | 'failed'; jobId?: string; artifactId?: string; reason?: string; failureClass?: string }

/** Everything the development produced, attached to the proposal so the producer can see what it rests on. Large
 *  bodies live in `development_artifacts`; this is the summary the review page renders. */
export interface DevelopmentDossier {
  version: 1;
  ideaJobId: string;
  format: IdeaKind;
  strategy: StoryStrategy;
  audience: string;
  language: Language;
  dialect?: Dialect;
  research: { runId?: string; status: ResearchRunSummary['status']; coverage: ProviderCoverage[]; limitations: string[]; itemIds: string[]; reusedFromCache: number };
  /** The sources the review page lists (the run's items, as stored). */
  sources?: ResearchItem[];
  analysis?: AudienceAnalysis;
  concepts?: ConceptSet;
  reviews: StoryReview[];
  /** 0 or 1: the pipeline revises at most once, on the reviewers' notes; it never loops. */
  revisions: number;
  revisionNotes?: string[];
  steps: DevelopmentStep[];
  artifacts: Array<{ stage: DevelopmentStage; artifactId: string; version: number; agentId: string; jobId?: string }>;
  /** The story's promise: the first seconds and how it ends (production keeps both). */
  hook?: string;
  ending?: string;
  /** Arabic stories: the English gloss of what the proposal holds in the dialect. */
  gloss?: { title?: string; logline?: string; premise?: string; hook?: string; ending?: string; structure?: Array<{ title: string; summary: string }> };
  /** "Original concept — no trend research was used" when research was off, or the reason it was unavailable. */
  note?: string;
  /** What the studio's own checks still find in the FINAL draft (the revision is not re-reviewed): shown to the
   *  producer before anything is made, never fixed silently (D20: a character tied to a year before they were 16). */
  openIssues?: ReviewIssue[];
}

/** What production departments receive with an accepted Auto Idea (on `Brief.development`): the intent they must not
 *  rewrite — tone, audience, the hook, the ending — and where the full dossier is. */
export interface DevelopmentIntent { dossierProposalId?: string; ideaJobId?: string; audience: string; tone: string; hook: string; ending?: string; strategy: StoryStrategy }

/** The intent an accepted proposal hands to production (acceptProposal copies it into `Brief.development`); undefined
 *  for a proposal written before the pipeline or a bundled sample. Pure. */
export function developmentIntentOf(proposal: Pick<IdeaProposal, 'mood' | 'development'>, dossierProposalId?: string): DevelopmentIntent | undefined {
  const d = proposal.development;
  if (!d) return undefined;
  return { dossierProposalId, ideaJobId: d.ideaJobId, audience: d.audience, tone: proposal.mood, hook: d.hook ?? '', ending: d.ending, strategy: d.strategy };
}
