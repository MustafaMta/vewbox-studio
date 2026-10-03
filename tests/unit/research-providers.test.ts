import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchTopic } from '@/domain/development';
import { facebook, FACEBOOK_REASON } from '@/server/research/providers/facebook';
import { gdelt, GDELT_TIMING, seenDate } from '@/server/research/providers/gdelt';
import { instagram, hashtagOf } from '@/server/research/providers/instagram';
import { resetTikTokToken, tiktok } from '@/server/research/providers/tiktok';
import { wikipedia } from '@/server/research/providers/wikipedia';
import { youtube, youtubeCategory } from '@/server/research/providers/youtube';
import { resetSpacing, spaced } from '@/server/research/http';
import { CONTRACTS } from '@/server/org/contracts';

/** THE PERMITTED SOURCES, with the network mocked: each provider maps exactly what its API returns (URL, dates, only
 *  the metrics the source gave), refuses honestly (NOT_CONFIGURED without credentials, UNSUPPORTED for Facebook,
 *  RATE_LIMITED / FAILED with the host and status, never a key), and never invents an item. */

const NOW = new Date('2026-10-03T06:00:00Z');
const ENV = ['YOUTUBE_API_KEY', 'TIKTOK_RESEARCH_CLIENT_KEY', 'TIKTOK_RESEARCH_CLIENT_SECRET', 'INSTAGRAM_GRAPH_TOKEN', 'INSTAGRAM_BUSINESS_ID'];
const saved: Record<string, string | undefined> = {};

type Route = (url: string, init?: RequestInit) => Response | undefined;
let routes: Route[] = [];
const calls: Array<{ url: string; init?: RequestInit }> = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body: string, status = 200) => new Response(body, { status });

beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  routes = []; calls.length = 0;
  resetSpacing(); resetTikTokToken(); GDELT_TIMING.spacingMs = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    for (const r of routes) { const res = r(String(url), init); if (res) return res; }
    throw new Error(`unexpected fetch ${url}`);
  }));
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });

const topic = (over: Partial<ResearchTopic> = {}): ResearchTopic => ({ query: 'animated series | مسلسل كرتون', platforms: ['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'NEWS'], categories: ['SERIES', 'ANIMATION'], language: 'AR', region: 'IQ', reason: 'For an Iraqi Arabic cartoon show: what audiences watch now.', ...over });
const ctx = { now: NOW };

describe('platforms without a permitted path or credentials', () => {
  it('Facebook is UNSUPPORTED, with the reason, and is never queried', () => {
    expect(facebook.access()).toEqual({ status: 'UNSUPPORTED', detail: FACEBOOK_REASON });
    expect(FACEBOOK_REASON).toMatch(/Content Library/);
    expect(facebook.queries([topic()], 'SHOW')).toEqual([]);
  });
  it('TikTok, Instagram and YouTube are NOT_CONFIGURED without their variables, naming them and nothing else', () => {
    expect(tiktok.access()).toMatchObject({ status: 'NOT_CONFIGURED', detail: expect.stringMatching(/TIKTOK_RESEARCH_CLIENT_KEY and TIKTOK_RESEARCH_CLIENT_SECRET/) });
    expect(instagram.access()).toMatchObject({ status: 'NOT_CONFIGURED', detail: expect.stringMatching(/INSTAGRAM_GRAPH_TOKEN and INSTAGRAM_BUSINESS_ID/) });
    expect(youtube.access()).toMatchObject({ status: 'NOT_CONFIGURED', detail: expect.stringMatching(/YOUTUBE_API_KEY/) });
    process.env.TIKTOK_RESEARCH_CLIENT_KEY = 'k-only';
    expect(tiktok.access().detail).toMatch(/TIKTOK_RESEARCH_CLIENT_SECRET is not set/);
    expect(tiktok.access().detail).not.toContain('k-only');
  });
});

describe('YouTube Data API v3 (with a key)', () => {
  beforeEach(() => { process.env.YOUTUBE_API_KEY = 'yt-secret-key'; });
  it('queries the region’s most-popular chart in the format’s category and a 30-day search by views', () => {
    expect(youtubeCategory(['ANIMATION'])).toBe(1); expect(youtubeCategory(['MUSIC_VIDEO'])).toBe(10); expect(youtubeCategory(['COMEDY'])).toBe(23); expect(youtubeCategory(['SERIES'])).toBe(24);
    const qs = youtube.queries([topic(), topic({ query: 'comedy series | مسلسل كوميدي', categories: ['COMEDY', 'SERIES'] })], 'SHOW');
    expect(qs.map((q) => q.query)).toEqual(['mostPopular IQ/1', 'search "مسلسل كوميدي" IQ 30d by views']);
  });
  it('maps the chart: URL, dates, channel, rank, and only the statistics YouTube returned', async () => {
    routes.push((u) => (u.includes('/videos?part=snippet,statistics&chart=mostPopular&regionCode=IQ&videoCategoryId=1') ? json({ items: [
      { id: 'abc123', snippet: { title: 'Episode one', description: 'A family cartoon.', publishedAt: '2026-09-30T12:00:00Z', channelTitle: 'Studio X', defaultAudioLanguage: 'ar' }, statistics: { viewCount: '120000', commentCount: '45' } },
      { id: 'def456', snippet: { title: 'Episode two', publishedAt: '2026-10-01T12:00:00Z' }, statistics: { viewCount: '9000', likeCount: '800' } },
    ] }) : undefined));
    const [chart] = youtube.queries([topic()], 'SHOW');
    const a = await youtube.fetch(chart, ctx);
    expect(a.status).toBe('OK');
    expect(a.items[0]).toMatchObject({ platform: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=abc123', title: 'Episode one', publishedAt: '2026-09-30T12:00:00Z', creator: 'Studio X', language: 'ar', region: 'IQ', metrics: { views: 120000, comments: 45, rank: 1 }, query: 'mostPopular IQ/1' });
    expect(a.items[0].metrics).not.toHaveProperty('likes'); // not returned → not invented
    expect(a.items[1].metrics).toEqual({ views: 9000, likes: 800, rank: 2 });
  });
  it('a used-up quota is RATE_LIMITED and a refused key FAILED — the key never appears in the detail', async () => {
    const [chart] = youtube.queries([topic()], 'SHOW');
    routes.push(() => json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403));
    const r = await youtube.fetch(chart, ctx);
    expect(r).toMatchObject({ status: 'RATE_LIMITED', items: [] });
    routes.unshift(() => json({ error: { errors: [{ reason: 'keyInvalid' }] } }, 400));
    const f = await youtube.fetch(chart, ctx);
    expect(f.status).toBe('FAILED');
    expect(JSON.stringify([r, f])).not.toContain('yt-secret-key');
  });
});

describe('TikTok Research API (with approved credentials)', () => {
  beforeEach(() => { process.env.TIKTOK_RESEARCH_CLIENT_KEY = 'ck'; process.env.TIKTOK_RESEARCH_CLIENT_SECRET = 'cs'; });
  it('takes a client-credentials token, queries the region and keyword for 14 days, and maps public videos', async () => {
    routes.push((u) => (u.includes('/oauth/token/') ? json({ access_token: 'tok', expires_in: 7200 }) : undefined));
    routes.push((u) => (u.includes('/research/video/query/') ? json({ data: { videos: [{ id: 7301, username: 'baghdad.toons', video_description: 'Grandma and the tea glass #cartoon', create_time: 1759300000, region_code: 'IQ', view_count: 51000, like_count: 4200, comment_count: 88, share_count: 310 }] }, error: { code: 'ok' } }) : undefined));
    const [q] = tiktok.queries([topic()], 'SHOW');
    expect(q.query).toBe('videos IQ "مسلسل كرتون" 14d');
    const a = await tiktok.fetch(q, ctx);
    expect(a.items[0]).toMatchObject({ platform: 'TIKTOK', url: 'https://www.tiktok.com/@baghdad.toons/video/7301', creator: '@baghdad.toons', region: 'IQ', metrics: { views: 51000, likes: 4200, comments: 88, shares: 310 } });
    const body = JSON.parse(String(calls.find((c) => c.url.includes('/research/video/query/'))!.init!.body));
    expect(body).toMatchObject({ start_date: '20260919', end_date: '20261003', query: { and: [{ field_name: 'region_code', field_values: ['IQ'] }, { field_name: 'keyword', field_values: ['مسلسل كرتون'] }] } });
    expect(calls.find((c) => c.url.includes('/research/'))!.init!.headers).toMatchObject({ authorization: 'Bearer tok' });
  });
  it('refused credentials are FAILED with the status', async () => {
    routes.push(() => json({ error: 'invalid_client' }, 401));
    const [q] = tiktok.queries([topic()], 'SHOW');
    expect(await tiktok.fetch(q, ctx)).toMatchObject({ status: 'FAILED', detail: expect.stringMatching(/HTTP 401/) });
  });
});

describe('Instagram Graph API hashtag search (with a Business account)', () => {
  beforeEach(() => { process.env.INSTAGRAM_GRAPH_TOKEN = 'igt'; process.env.INSTAGRAM_BUSINESS_ID = '1789'; });
  it('finds the hashtag, reads its top media, and drops posts older than 30 days', async () => {
    expect(hashtagOf('مسلسل كرتون')).toBe('مسلسلكرتون');
    routes.push((u) => (u.includes('/ig_hashtag_search?') ? json({ data: [{ id: 'h1' }] }) : undefined));
    routes.push((u) => (u.includes('/h1/top_media?') ? json({ data: [
      { id: 'm1', caption: 'New episode tonight', media_type: 'VIDEO', permalink: 'https://www.instagram.com/p/m1/', timestamp: '2026-09-28T10:00:00+0000', like_count: 1500, comments_count: 40 },
      { id: 'm2', caption: 'old', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/m2/', timestamp: '2026-06-01T10:00:00+0000', like_count: 99 },
    ] }) : undefined));
    const [q] = instagram.queries([topic()], 'SHOW');
    const a = await instagram.fetch(q, ctx);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ platform: 'INSTAGRAM', url: 'https://www.instagram.com/p/m1/', publishedAt: '2026-09-28T10:00:00.000Z', metrics: { likes: 1500, comments: 40 } });
  });
  it('Meta’s rate-limit codes are RATE_LIMITED', async () => {
    routes.push(() => json({ error: { code: 613, message: 'Calls to this api have exceeded the rate limit.' } }, 400));
    const [q] = instagram.queries([topic()], 'SHOW');
    expect((await instagram.fetch(q, ctx)).status).toBe('RATE_LIMITED');
  });
});

describe('GDELT DOC 2.0 (keyless news)', () => {
  it('searches the topic in the story’s language for 14 days; items keep URL, date, publisher; no invented metric', async () => {
    expect(seenDate('20261001T081500Z')).toBe('2026-10-01T08:15:00Z');
    const [q] = gdelt.queries([topic()], 'SHOW');
    expect(q.query).toBe('"animated series" sourcelang:arabic 14d');
    routes.push((u) => (u.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?query=%22animated%20series%22%20sourcelang%3Aarabic&mode=artlist') ? json({ articles: [
      { url: 'https://news.example/a', title: 'A new animated series premieres', seendate: '20261001T081500Z', domain: 'news.example', language: 'Arabic', sourcecountry: 'Iraq' },
      { url: 'https://other.example/a-copy', title: 'A new animated series premieres!', seendate: '20261001T091500Z', domain: 'other.example' },
      { url: 'https://news.example/old', title: 'An old story', seendate: '20260801T081500Z', domain: 'news.example' },
    ] }) : undefined));
    const a = await gdelt.fetch(q, ctx);
    expect(a.status).toBe('OK');
    expect(a.items).toHaveLength(1); // the syndicated copy and the item outside the 14-day window are gone
    expect(a.items[0]).toMatchObject({ platform: 'NEWS', url: 'https://news.example/a', publishedAt: '2026-10-01T08:15:00Z', creator: 'news.example', region: 'Iraq', metrics: {} });
  });
  it('a 429 is asked once more; twice is RATE_LIMITED; a text refusal with 200 is FAILED', async () => {
    routes.push(() => text('Please limit requests to one every 5 seconds', 429));
    const [q] = gdelt.queries([topic()], 'SHOW');
    const events: string[] = [];
    const r = await gdelt.fetch(q, { now: NOW, event: async (m) => { events.push(m); } });
    expect(r.status).toBe('RATE_LIMITED');
    expect(calls).toHaveLength(2);
    expect(events[0]).toMatch(/429/);
    routes.unshift(() => text('Your search contained a phrase that is too short.'));
    expect((await gdelt.fetch(q, ctx)).status).toBe('FAILED');
  });
  it('spacing: calls on one key run one after another at least the interval apart', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    await Promise.all([spaced('k', 5000, async () => 1, sleep), spaced('k', 5000, async () => 2, sleep), spaced('k', 5000, async () => 3, sleep)]);
    expect(waits).toHaveLength(2);
    expect(waits.every((w) => w > 4900)).toBe(true);
  });
});

describe('Wikipedia (Wikimedia pageviews + Wikidata, keyless)', () => {
  const day = (d: string, articles: Array<{ article: string; views: number; rank: number }>) => json({ items: [{ project: 'en.wikipedia', articles, year: d.slice(0, 4) }] });
  it('falls back to the latest published day, keeps only films/series by Wikidata class, with the day’s pageviews and rank', async () => {
    routes.push((u) => (u.endsWith('/top/en.wikipedia/all-access/2026/10/02') ? json({ detail: 'not loaded yet' }, 404) : undefined));
    routes.push((u) => (u.endsWith('/top/en.wikipedia/all-access/2026/10/01') ? day('2026-10-01', [
      { article: 'Main_Page', views: 5000000, rank: 1 }, { article: 'Special:Search', views: 900000, rank: 2 },
      { article: 'Some_Film_(2026_film)', views: 238832, rank: 9 }, { article: 'A_Politician', views: 200000, rank: 10 }, { article: 'Long_Show', views: 97669, rank: 27 }, { article: 'A_Song', views: 50000, rank: 40 },
    ]) : undefined));
    routes.push((u, init) => (u === 'https://query.wikidata.org/sparql' && init?.method === 'POST' ? json({ results: { bindings: [
      { title: { value: 'Some Film (2026 film)' }, class: { value: 'http://www.wikidata.org/entity/Q11424' }, desc: { value: '2026 film directed by someone' } },
      { title: { value: 'A Politician' }, class: { value: 'http://www.wikidata.org/entity/Q5' } },
      { title: { value: 'Long Show' }, class: { value: 'http://www.wikidata.org/entity/Q5398426' } },
      { title: { value: 'Long Show' }, class: { value: 'http://www.wikidata.org/entity/Q581714' } },
      { title: { value: 'A Song' }, class: { value: 'http://www.wikidata.org/entity/Q7366' } },
    ] } }) : undefined));
    const [q] = wikipedia.queries([topic({ query: 'top en.wikipedia', platforms: ['WIKIPEDIA'], language: 'EN', region: undefined, categories: ['FILM', 'SERIES'] })], 'SHORT');
    const a = await wikipedia.fetch(q, ctx);
    expect(a.status).toBe('OK');
    expect(a.items.map((i) => [i.title, i.category, i.metrics])).toEqual([
      ['Some Film (2026 film)', 'FILM', { pageviews: 238832, rank: 9, periodDays: 1 }],
      // an animated series is also a television series: the more specific class wins
      ['Long Show', 'ANIMATION', { pageviews: 97669, rank: 27, periodDays: 1 }],
    ]);
    expect(a.items[0]).toMatchObject({ url: 'https://en.wikipedia.org/wiki/Some_Film_(2026_film)', query: 'top en.wikipedia 2026-10-01', excerpt: '2026 film directed by someone' });
    const sparql = decodeURIComponent(String(calls.find((c) => c.url.includes('sparql'))!.init!.body));
    expect(sparql).not.toContain('Main Page'); expect(sparql).not.toContain('Special:Search');
  });
  it('an Arabic request reads ar.wikipedia and says it is pan-Arab, not Iraq alone', async () => {
    routes.push((u) => (u.includes('/top/ar.wikipedia/') ? day('2026-10-02', [{ article: 'مسلسل_ما', views: 2703, rank: 16 }]) : undefined));
    routes.push((u) => (u.includes('sparql') ? json({ results: { bindings: [{ title: { value: 'مسلسل ما' }, class: { value: 'http://www.wikidata.org/entity/Q5398426' }, desc: { value: 'مسلسل تلفزيوني' } }] } }) : undefined));
    const [q] = wikipedia.queries([topic({ query: 'top ar.wikipedia', platforms: ['WIKIPEDIA'], categories: ['SERIES'] })], 'SHOW');
    const a = await wikipedia.fetch(q, ctx);
    expect(a.items[0]).toMatchObject({ url: `https://ar.wikipedia.org/wiki/${encodeURIComponent('مسلسل_ما')}`, language: 'ar', metrics: { pageviews: 2703, rank: 16, periodDays: 1 } });
    expect(a.detail).toMatch(/no per-country list for Iraq/);
  });
  it('a classification failure is FAILED, not an empty success', async () => {
    routes.push((u) => (u.includes('/top/en.wikipedia/') ? day('2026-10-02', [{ article: 'X_Film', views: 10, rank: 3 }]) : undefined));
    routes.push((u) => (u.includes('sparql') ? text('busy', 503) : undefined));
    const [q] = wikipedia.queries([topic({ query: 'top en.wikipedia', platforms: ['WIKIPEDIA'], language: 'EN' })], 'SHORT');
    expect((await wikipedia.fetch(q, ctx)).status).toBe('FAILED');
  });
});

describe('the query contract refuses what a provider must never return', () => {
  const coverage = { platform: 'NEWS', provider: 'gdelt-doc-2', status: 'OK', detail: 'x', queries: 1, items: 1 };
  const item = { id: 'ri-1', platform: 'NEWS', provider: 'gdelt-doc-2', url: 'https://news.example/a', title: 'T', retrievedAt: '2026-10-03T06:00:00Z', category: 'SERIES', metrics: {}, query: 'q' };
  const out = CONTRACTS['research.query_source'].output;
  it('accepts a real answer', () => { expect(out.safeParse({ coverage, items: [item], reusedFromCache: 0 }).success).toBe(true); });
  it('refuses an item without a web URL, an invented metric, or items from a platform that did not answer', () => {
    expect(out.safeParse({ coverage, items: [{ ...item, url: 'not a url' }], reusedFromCache: 0 }).success).toBe(false);
    expect(out.safeParse({ coverage, items: [{ ...item, metrics: { engagementScore: 9 } }], reusedFromCache: 0 }).success).toBe(false);
    expect(out.safeParse({ coverage: { ...coverage, status: 'NOT_CONFIGURED' }, items: [item], reusedFromCache: 0 }).success).toBe(false);
    expect(out.safeParse({ coverage: { ...coverage, items: 3 }, items: [item], reusedFromCache: 0 }).success).toBe(false);
  });
});
