import type { ResearchCategory, ResearchTopic } from '@/domain/development';
import { credentials, missingEnv } from '../config';
import { call, clip, num, ResearchHttpError } from '../http';
import { topicWords, type FetchedItem, type ResearchProvider, type SourceAnswer, type SourceQuery } from './types';

/** YOUTUBE — the YouTube Data API v3 with the studio's own key (YOUTUBE_API_KEY): the region's most-popular chart in
 *  the format's category (`videos.list chart=mostPopular`), and a search for the topic among videos of the last 30
 *  days ordered by views (`search.list`, then `videos.list` for their statistics). Without the key: NOT_CONFIGURED. */

export const YT = 'https://www.googleapis.com/youtube/v3';
const SEARCH_WINDOW_DAYS = 30;

/** YouTube's video categories: 1 Film & Animation, 10 Music, 23 Comedy, 24 Entertainment. */
export function youtubeCategory(categories: ResearchCategory[]): number {
  if (categories.some((c) => c === 'MUSIC' || c === 'MUSIC_VIDEO')) return 10;
  if (categories.some((c) => c === 'ANIMATION' || c === 'ANIME' || c === 'FILM' || c === 'SHORT_FORM')) return 1;
  if (categories.includes('COMEDY')) return 23;
  return 24;
}

type Video = { id: string | { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string; defaultAudioLanguage?: string; defaultLanguage?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } };

function toItem(v: Video, q: SourceQuery, rank?: number): FetchedItem | null {
  const id = typeof v.id === 'string' ? v.id : v.id?.videoId;
  if (!id || !v.snippet?.title) return null;
  const s = v.statistics ?? {};
  const metrics = Object.fromEntries(Object.entries({ views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount), rank }).filter(([, x]) => x !== undefined));
  return { platform: 'YOUTUBE', provider: 'youtube-data-api-v3', url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, title: v.snippet.title, publishedAt: v.snippet.publishedAt, category: q.categories[0] ?? 'OTHER', language: v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage, region: q.region, metrics, excerpt: clip(v.snippet.description, 200), query: q.query, creator: v.snippet.channelTitle };
}

function refusal(e: unknown): SourceAnswer {
  if (e instanceof ResearchHttpError) {
    const reason = /"reason"\s*:\s*"([a-zA-Z]+)"/.exec(e.body ?? '')?.[1];
    if (e.status === 403 && (reason === 'quotaExceeded' || reason === 'rateLimitExceeded')) return { status: 'RATE_LIMITED', detail: `YouTube's daily quota for the studio's key is used up (${reason}).`, items: [] };
    if (e.status === 404 || reason === 'videoChartNotFound') return { status: 'EMPTY', detail: 'YouTube has no chart for this category in this region.', items: [] };
    if (e.status === 400 || e.status === 403) return { status: 'FAILED', detail: `YouTube refused the request (HTTP ${e.status}${reason ? `, ${reason}` : ''}); check YOUTUBE_API_KEY.`, items: [] };
  }
  return { status: 'FAILED', detail: `YouTube: ${(e as Error).message}.`, items: [] };
}

export const youtube: ResearchProvider = {
  platform: 'YOUTUBE',
  id: 'youtube-data-api-v3',
  access: () => (credentials('YOUTUBE') ? { status: 'READY', detail: 'YouTube Data API v3 with the studio\'s key.' } : { status: 'NOT_CONFIGURED', detail: `YouTube Data API v3 needs ${missingEnv('YOUTUBE').join(' and ')} in the server environment; none is set, so YouTube was not queried.` }),
  queries(topics: ResearchTopic[], kind) {
    const ts = topics.filter((t) => t.platforms.includes('YOUTUBE'));
    if (!ts.length) return [];
    const region = ts[0].region ?? (ts[0].language === 'AR' ? 'SA' : 'US');
    const cat = youtubeCategory(ts[0].categories);
    const out: SourceQuery[] = [{ query: `mostPopular ${region}/${cat}`, language: ts[0].language, region, categories: ts[0].categories, kind, params: { mode: 'chart', regionCode: region, videoCategoryId: cat } }];
    const s = ts[1] ?? ts[0];
    const { en, ar } = topicWords(s);
    const words = s.language === 'AR' ? ar ?? en : en;
    out.push({ query: `search "${words}" ${region} ${SEARCH_WINDOW_DAYS}d by views`, language: s.language, region, categories: s.categories, kind, params: { mode: 'search', q: words, regionCode: region, relevanceLanguage: s.language === 'AR' ? 'ar' : 'en' } });
    return out;
  },
  async fetch(q: SourceQuery, ctx): Promise<SourceAnswer> {
    const cred = credentials('YOUTUBE');
    if (!cred) return { status: 'FAILED', detail: 'YOUTUBE_API_KEY is not set.', items: [] };
    const key = `&key=${encodeURIComponent(cred.YOUTUBE_API_KEY)}`;
    try {
      if (q.params.mode === 'chart') {
        const r = await call(`${YT}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${q.params.regionCode}&videoCategoryId=${q.params.videoCategoryId}&maxResults=15${key}`, { signal: ctx.signal });
        const items = ((r.json as { items?: Video[] } | undefined)?.items ?? []).map((v, i) => toItem(v, q, i + 1)).filter((x): x is FetchedItem => Boolean(x));
        return items.length ? { status: 'OK', detail: `${items.length} video(s) from YouTube's most-popular chart ${q.query}, as of the fetch.`, items } : { status: 'EMPTY', detail: `YouTube's chart ${q.query} is empty.`, items: [] };
      }
      const after = new Date(ctx.now.getTime() - SEARCH_WINDOW_DAYS * 86_400_000).toISOString();
      const s = await call(`${YT}/search?part=snippet&type=video&order=viewCount&maxResults=10&publishedAfter=${encodeURIComponent(after)}&regionCode=${q.params.regionCode}&relevanceLanguage=${q.params.relevanceLanguage}&q=${encodeURIComponent(String(q.params.q))}${key}`, { signal: ctx.signal });
      const ids = ((s.json as { items?: Video[] } | undefined)?.items ?? []).map((v) => (typeof v.id === 'string' ? v.id : v.id?.videoId)).filter((x): x is string => Boolean(x));
      if (!ids.length) return { status: 'EMPTY', detail: `YouTube found no videos for ${q.query}.`, items: [] };
      const v = await call(`${YT}/videos?part=snippet,statistics&id=${ids.map(encodeURIComponent).join(',')}${key}`, { signal: ctx.signal });
      const since = Date.parse(after);
      const items = ((v.json as { items?: Video[] } | undefined)?.items ?? []).map((x) => toItem(x, q)).filter((x): x is FetchedItem => Boolean(x) && (!x!.publishedAt || Date.parse(x!.publishedAt) >= since));
      return items.length ? { status: 'OK', detail: `${items.length} video(s) for ${q.query}.`, items } : { status: 'EMPTY', detail: `YouTube found no recent videos for ${q.query}.`, items: [] };
    } catch (e) { return refusal(e); }
  },
};
