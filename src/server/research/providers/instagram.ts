import type { ResearchTopic } from '@/domain/development';
import { credentials, missingEnv } from '../config';
import { call, clip, num, ResearchHttpError } from '../http';
import { topicWords, type FetchedItem, type ResearchProvider, type SourceAnswer, type SourceQuery } from './types';

/** INSTAGRAM — the Instagram Graph API's hashtag search, which Meta opens to Business and Creator accounts:
 *  `ig_hashtag_search` for the hashtag's id, then `/{hashtag}/top_media` (public posts, with their like and comment
 *  counts). Posts older than 30 days are not presented as current. Without INSTAGRAM_GRAPH_TOKEN and
 *  INSTAGRAM_BUSINESS_ID: NOT_CONFIGURED. Nothing is scraped. */

export const GRAPH = 'https://graph.facebook.com/v21.0';
const WINDOW_DAYS = 30;
const MAX_QUERIES = 2;

/** A hashtag from the topic's words: letters and digits only (Arabic letters are valid in hashtags). */
export const hashtagOf = (words: string) => words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const instagram: ResearchProvider = {
  platform: 'INSTAGRAM',
  id: 'instagram-graph-hashtag',
  access: () => (credentials('INSTAGRAM') ? { status: 'READY', detail: 'Instagram Graph API hashtag search with the studio\'s Business account.' } : { status: 'NOT_CONFIGURED', detail: `Instagram's hashtag search needs a Business or Creator account: ${missingEnv('INSTAGRAM').join(' and ')} ${missingEnv('INSTAGRAM').length > 1 ? 'are' : 'is'} not set, so Instagram was not queried.` }),
  queries(topics: ResearchTopic[], kind) {
    return topics.filter((t) => t.platforms.includes('INSTAGRAM')).slice(0, MAX_QUERIES).map((t): SourceQuery => {
      const { en, ar } = topicWords(t);
      const tag = hashtagOf(t.language === 'AR' ? ar ?? en : en);
      return { query: `#${tag} top media`, language: t.language, region: t.region, categories: t.categories, kind, params: { tag } };
    });
  },
  async fetch(q: SourceQuery, ctx): Promise<SourceAnswer> {
    const cred = credentials('INSTAGRAM');
    if (!cred) return { status: 'FAILED', detail: 'Instagram credentials are not set.', items: [] };
    const auth = `user_id=${encodeURIComponent(cred.INSTAGRAM_BUSINESS_ID)}&access_token=${encodeURIComponent(cred.INSTAGRAM_GRAPH_TOKEN)}`;
    try {
      const h = await call(`${GRAPH}/ig_hashtag_search?q=${encodeURIComponent(String(q.params.tag))}&${auth}`, { signal: ctx.signal });
      const hid = (h.json as { data?: Array<{ id?: string }> } | undefined)?.data?.[0]?.id;
      if (!hid) return { status: 'EMPTY', detail: `Instagram knows no hashtag ${q.query.split(' ')[0]}.`, items: [] };
      const m = await call(`${GRAPH}/${encodeURIComponent(hid)}/top_media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=25&${auth}`, { signal: ctx.signal });
      const since = ctx.now.getTime() - WINDOW_DAYS * 86_400_000;
      const items: FetchedItem[] = [];
      for (const p of (m.json as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []) {
        const url = typeof p.permalink === 'string' ? p.permalink : '';
        const at = typeof p.timestamp === 'string' ? new Date(p.timestamp).toISOString() : undefined;
        if (!url || (at && Date.parse(at) < since)) continue;
        const caption = typeof p.caption === 'string' ? p.caption : '';
        const metrics = Object.fromEntries(Object.entries({ likes: num(p.like_count), comments: num(p.comments_count) }).filter(([, x]) => x !== undefined));
        items.push({ platform: 'INSTAGRAM', provider: 'instagram-graph-hashtag', url, title: clip(caption, 90) ?? `Instagram ${String(p.media_type ?? 'post').toLowerCase()}`, publishedAt: at, category: q.categories[0] ?? 'SHORT_FORM', region: q.region, metrics, excerpt: clip(caption, 200), query: q.query });
      }
      return items.length ? { status: 'OK', detail: `${items.length} recent public post(s) for ${q.query}.`, items } : { status: 'EMPTY', detail: `Instagram returned no posts of the last ${WINDOW_DAYS} days for ${q.query}.`, items: [] };
    } catch (e) {
      const code = /"code"\s*:\s*(\d+)/.exec(e instanceof ResearchHttpError ? e.body ?? '' : '')?.[1];
      if (code && ['4', '17', '32', '613'].includes(code)) return { status: 'RATE_LIMITED', detail: `Instagram's rate limit was reached (code ${code}; 30 hashtags per 7 days per account).`, items: [] };
      if (code === '190') return { status: 'FAILED', detail: 'Instagram refused the access token (code 190); renew INSTAGRAM_GRAPH_TOKEN.', items: [] };
      return { status: 'FAILED', detail: `Instagram: ${(e as Error).message}.`, items: [] };
    }
  },
};
