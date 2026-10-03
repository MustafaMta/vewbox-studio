import type { IdeaKind, ResearchCategory, ResearchItem, ResearchPlatform, ResearchTopic } from '@/domain/development';
import type { Language } from '@/domain/vocabulary';

/** ONE PERMITTED SOURCE — how the studio may reach a platform (or why it may not), how a topic becomes this source's
 *  concrete query, and the fetch itself. A provider never invents an item, a metric or a URL: what it returns is what
 *  the source answered, mapped field by field. */

export interface SourceQuery {
  /** This source's query as recorded on the items and in the cache key (e.g. 'mostPopular IQ/24'). */
  query: string;
  language: Language;
  region?: string;
  categories: ResearchCategory[];
  kind: IdeaKind;
  /** The source-specific parameters the fetch uses. */
  params: Record<string, string | number | boolean | string[]>;
}

/** An item as a provider returns it: the store gives it its id and the time it was retrieved. */
export type FetchedItem = Omit<ResearchItem, 'id' | 'retrievedAt'>;

export interface SourceAnswer {
  status: 'OK' | 'EMPTY' | 'RATE_LIMITED' | 'FAILED';
  /** A sentence for the coverage: what was reached, or what went wrong (host and status, never a key). */
  detail: string;
  items: FetchedItem[];
}

export interface FetchContext { signal?: AbortSignal; now: Date; event?: (message: string) => Promise<void> }

export interface ResearchProvider {
  platform: ResearchPlatform;
  /** The access path, e.g. 'youtube-data-api-v3'. */
  id: string;
  /** READY: may be queried now. NOT_CONFIGURED: a permitted API exists, its credentials are not set. UNSUPPORTED: no
   *  permitted access path exists for this studio. The detail is one sentence, names variables, never values. */
  access(): { status: 'READY' | 'NOT_CONFIGURED' | 'UNSUPPORTED'; detail: string };
  /** The topics this source answers, as its own queries (at most a few: research is a handful of calls). */
  queries(topics: ResearchTopic[], kind: IdeaKind): SourceQuery[];
  fetch(q: SourceQuery, ctx: FetchContext): Promise<SourceAnswer>;
}

/** The words of a topic for a source that searches text: the English query, or the Arabic phrase the planner added
 *  for an Arabic request (topic.query may hold both as "english | عربي"). */
export function topicWords(t: ResearchTopic): { en: string; ar?: string } {
  const [en, ar] = t.query.split('|').map((s) => s.trim());
  return { en, ar: ar || undefined };
}
