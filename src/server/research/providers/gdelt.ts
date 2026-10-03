import type { ResearchTopic } from '@/domain/development';
import { call, ResearchHttpError, spaced } from '../http';
import { topicWords, type FetchedItem, type ResearchProvider, type SourceAnswer, type SourceQuery } from './types';

/** NEWS — the GDELT DOC 2.0 API: keyless, worldwide news (machine-translated, so an English query finds Arabic
 *  articles too; `sourcelang:` narrows the language), the last 14 days only. GDELT asks for at most one request every
 *  5 s: calls are spaced process-wide, a 429 waits once and then is recorded as RATE_LIMITED. GDELT returns no
 *  measurement per article: the items carry none. */

export const GDELT_DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
/** GDELT's spacing (one request per 5 s, with a margin). Mutable for tests. */
export const GDELT_TIMING = { spacingMs: 5_500 };
export const NEWS_WINDOW_DAYS = 14;
const MAX_QUERIES = 2;
const KEEP = 12;

/** GDELT seendate "20261002T113000Z" → ISO. */
export function seenDate(s: string | undefined): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined;
}
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const gdelt: ResearchProvider = {
  platform: 'NEWS',
  id: 'gdelt-doc-2',
  access: () => ({ status: 'READY', detail: 'GDELT DOC 2.0 news search, keyless (at most one request every 5 s).' }),
  queries(topics: ResearchTopic[], kind) {
    return topics.filter((t) => t.platforms.includes('NEWS')).slice(0, MAX_QUERIES).map((t): SourceQuery => {
      const { en } = topicWords(t);
      const phrase = /\s/.test(en) ? `"${en}"` : en;
      const scope = t.language === 'AR' ? ' sourcelang:arabic' : ' sourcelang:english';
      const q = `${phrase}${scope}`;
      return { query: `${q} ${NEWS_WINDOW_DAYS}d`, language: t.language, region: t.region, categories: t.categories, kind, params: { q } };
    });
  },
  async fetch(q: SourceQuery, ctx): Promise<SourceAnswer> {
    const url = `${GDELT_DOC}?query=${encodeURIComponent(String(q.params.q))}&mode=artlist&format=json&maxrecords=50&timespan=${NEWS_WINDOW_DAYS}d&sort=hybridrel`;
    const once = () => spaced('gdelt', GDELT_TIMING.spacingMs, () => call(url, { signal: ctx.signal }));
    let r: Awaited<ReturnType<typeof call>>;
    try {
      try { r = await once(); } catch (e) {
        if (!(e instanceof ResearchHttpError && e.status === 429)) throw e;
        await ctx.event?.('GDELT asked to slow down (HTTP 429); waiting and asking once more');
        r = await once();
      }
    } catch (e) {
      if (e instanceof ResearchHttpError && e.status === 429) return { status: 'RATE_LIMITED', detail: 'GDELT refused the request twice for its rate limit (one request every 5 s); no news was used.', items: [] };
      return { status: 'FAILED', detail: `GDELT: ${(e as Error).message}.`, items: [] };
    }
    // GDELT answers some refusals as text with HTTP 200 ("Your search contained…")
    const articles = (r.json as { articles?: Array<{ url?: string; title?: string; seendate?: string; domain?: string; language?: string; sourcecountry?: string }> } | undefined)?.articles;
    if (!r.json) return { status: 'FAILED', detail: `GDELT did not answer with results: ${r.text.replace(/\s+/g, ' ').slice(0, 140)}`, items: [] };
    const since = ctx.now.getTime() - NEWS_WINDOW_DAYS * 86_400_000;
    const seen = new Set<string>();
    const items: FetchedItem[] = [];
    for (const a of articles ?? []) {
      const publishedAt = seenDate(a.seendate);
      if (!a.url || !a.title?.trim() || !publishedAt) continue;
      // an item outside the window is never presented as current
      if (Date.parse(publishedAt) < since) continue;
      const key = norm(a.title);
      if (seen.has(key)) continue; // syndicated copies of one story
      seen.add(key);
      items.push({ platform: 'NEWS', provider: 'gdelt-doc-2', url: a.url, title: a.title.trim().slice(0, 300), publishedAt, category: q.categories[0] ?? 'OTHER', language: a.language, region: a.sourcecountry, metrics: {}, query: q.query, creator: a.domain });
      if (items.length >= KEEP) break;
    }
    if (!items.length) return { status: 'EMPTY', detail: `GDELT found no articles for ${q.query} in the last ${NEWS_WINDOW_DAYS} days.`, items: [] };
    return { status: 'OK', detail: `${items.length} news article(s) for ${q.query} (GDELT gives no per-article measurement).`, items };
  },
};
