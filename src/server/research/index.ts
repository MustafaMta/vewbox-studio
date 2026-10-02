import type { Dialect, Language } from '@/domain/vocabulary';
import type { IdeaPreferences } from '@/domain/types';
import type { ResearchItem, ResearchRunSummary } from '@/domain/development';

/** THE RESEARCH MODULE — the Trend Research Agent's tools (docs/CONTRACTS-AUTO-IDEA.md §3). OWNED BY THE RESEARCH
 *  ENGINEER: this file is the interface the Story Development pipeline codes against; the implementation replaces
 *  the placeholder bodies below.
 *
 *  Rules: only official APIs and permitted public access; no scraping, no bypassing a platform's restrictions; a
 *  platform without a permitted path is UNSUPPORTED and one without credentials NOT_CONFIGURED — recorded with the
 *  reason, never silently dropped and never filled with invented items. Cached per source with an expiry. */

export interface ResearchRequest {
  ideaJobId: string;
  jobId?: string;
  kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO';
  language: Language;
  dialect?: Dialect;
  preferences: IdeaPreferences;
  brief?: string;
  /** For a season or an episode: the show's identity, so topics fit it instead of replacing it. */
  show?: { title: string; genre: string; logline: string };
  /** Bypass the cache. */
  refresh?: boolean;
}

export interface ResearchContext {
  /** Wraps each external call so it is recorded as a tool call of the running agent (allow-list + timeout). */
  tool?: <T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>) => Promise<T>;
  event?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => Promise<void>;
  signal?: AbortSignal;
}

/** Plans the topics, queries every relevant platform in priority order (cache first), stores the items and the run,
 *  and returns the run's summary. Never throws for an unreachable platform — that is coverage, not failure; throws
 *  only when the studio's own storage fails. */
export async function runResearch(req: ResearchRequest, ctx: ResearchContext = {}): Promise<ResearchRunSummary> {
  void req; void ctx;
  throw new Error('runResearch: implemented by the Research engineer (docs/CONTRACTS-AUTO-IDEA.md §3)');
}

export async function getResearchRun(id: string): Promise<ResearchRunSummary | undefined> {
  void id;
  throw new Error('getResearchRun: implemented by the Research engineer');
}

export async function getResearchItems(ids: string[]): Promise<ResearchItem[]> {
  void ids;
  throw new Error('getResearchItems: implemented by the Research engineer');
}

/** What each platform's access path is right now (Settings and the progress page show it); never a secret. */
export interface ResearchSourceStatus { platform: ResearchItem['platform']; provider: string; status: 'READY' | 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'DISABLED'; detail: string; ttlHours: number }
export async function researchSources(): Promise<ResearchSourceStatus[]> {
  throw new Error('researchSources: implemented by the Research engineer');
}
