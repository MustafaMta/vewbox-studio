import type { ResearchTopic } from '@/domain/development';
import { credentials, missingEnv } from '../config';
import { call, clip, num, ResearchHttpError } from '../http';
import { topicWords, type FetchedItem, type ResearchProvider, type SourceAnswer, type SourceQuery } from './types';

/** TIKTOK — the TikTok Research API, open only to researchers TikTok approved: a client-credentials token, then
 *  `research/video/query` for public videos of the region whose description matches the topic in the last 14 days.
 *  Without approved credentials (TIKTOK_RESEARCH_CLIENT_KEY / _SECRET): NOT_CONFIGURED. Nothing is scraped. */

export const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_QUERY = 'https://open.tiktokapis.com/v2/research/video/query/';
const FIELDS = 'id,video_description,create_time,region_code,share_count,view_count,like_count,comment_count,username';
const WINDOW_DAYS = 14;
const MAX_QUERIES = 2;

let token: { value: string; until: number } | undefined;
/** Tests: forget the cached token. */
export const resetTikTokToken = () => { token = undefined; };

const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

async function accessToken(key: string, secret: string, signal?: AbortSignal): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const r = await call(TIKTOK_TOKEN, { method: 'POST', signal, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: key, client_secret: secret, grant_type: 'client_credentials' }).toString() });
  const j = r.json as { access_token?: string; expires_in?: number; error?: string } | undefined;
  if (!j?.access_token) throw new ResearchHttpError(401, `TikTok issued no token${j?.error ? ` (${j.error})` : ''}`);
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

export const tiktok: ResearchProvider = {
  platform: 'TIKTOK',
  id: 'tiktok-research-api',
  access: () => (credentials('TIKTOK') ? { status: 'READY', detail: 'TikTok Research API with the studio\'s approved research credentials.' } : { status: 'NOT_CONFIGURED', detail: `TikTok's Research API is open only to approved researchers; ${missingEnv('TIKTOK').join(' and ')} ${missingEnv('TIKTOK').length > 1 ? 'are' : 'is'} not set, so TikTok was not queried.` }),
  queries(topics: ResearchTopic[], kind) {
    return topics.filter((t) => t.platforms.includes('TIKTOK')).slice(0, MAX_QUERIES).map((t): SourceQuery => {
      const { en, ar } = topicWords(t);
      const keyword = t.language === 'AR' ? ar ?? en : en;
      const region = t.region ?? (t.language === 'AR' ? 'SA' : 'US');
      return { query: `videos ${region} "${keyword}" ${WINDOW_DAYS}d`, language: t.language, region, categories: t.categories, kind, params: { keyword, region } };
    });
  },
  async fetch(q: SourceQuery, ctx): Promise<SourceAnswer> {
    const cred = credentials('TIKTOK');
    if (!cred) return { status: 'FAILED', detail: 'TikTok research credentials are not set.', items: [] };
    try {
      const bearer = await accessToken(cred.TIKTOK_RESEARCH_CLIENT_KEY, cred.TIKTOK_RESEARCH_CLIENT_SECRET, ctx.signal);
      const body = { query: { and: [{ operation: 'IN', field_name: 'region_code', field_values: [String(q.params.region)] }, { operation: 'IN', field_name: 'keyword', field_values: [String(q.params.keyword)] }] }, start_date: ymd(new Date(ctx.now.getTime() - WINDOW_DAYS * 86_400_000)), end_date: ymd(ctx.now), max_count: 20 };
      const r = await call(`${TIKTOK_QUERY}?fields=${FIELDS}`, { method: 'POST', signal: ctx.signal, headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 15_000 });
      const j = r.json as { data?: { videos?: Array<Record<string, unknown>> }; error?: { code?: string; message?: string } } | undefined;
      if (j?.error?.code && j.error.code !== 'ok') return { status: 'FAILED', detail: `TikTok refused the query (${j.error.code}).`, items: [] };
      const items: FetchedItem[] = [];
      for (const v of j?.data?.videos ?? []) {
        const id = String(v.id ?? ''); const user = String(v.username ?? '');
        if (!id || !user) continue;
        const created = num(v.create_time);
        const metrics = Object.fromEntries(Object.entries({ views: num(v.view_count), likes: num(v.like_count), comments: num(v.comment_count), shares: num(v.share_count) }).filter(([, x]) => x !== undefined));
        const desc = typeof v.video_description === 'string' ? v.video_description : '';
        items.push({ platform: 'TIKTOK', provider: 'tiktok-research-api', url: `https://www.tiktok.com/@${encodeURIComponent(user)}/video/${encodeURIComponent(id)}`, title: clip(desc, 90) ?? `TikTok video by @${user}`, publishedAt: created ? new Date(created * 1000).toISOString() : undefined, category: q.categories[0] ?? 'SHORT_FORM', region: typeof v.region_code === 'string' ? v.region_code : q.region, metrics, excerpt: clip(desc, 200), query: q.query, creator: `@${user}` });
      }
      return items.length ? { status: 'OK', detail: `${items.length} public TikTok video(s) for ${q.query}.`, items } : { status: 'EMPTY', detail: `TikTok returned no videos for ${q.query}.`, items: [] };
    } catch (e) {
      if (e instanceof ResearchHttpError && e.status === 429) return { status: 'RATE_LIMITED', detail: 'TikTok\'s daily research quota is used up (HTTP 429).', items: [] };
      if (e instanceof ResearchHttpError && (e.status === 401 || e.status === 403)) return { status: 'FAILED', detail: `TikTok refused the research credentials (HTTP ${e.status}).`, items: [] };
      return { status: 'FAILED', detail: `TikTok: ${(e as Error).message}.`, items: [] };
    }
  },
};
