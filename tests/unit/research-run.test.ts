import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESEARCH_PLATFORMS, runStatusOf, emptyRun } from '@/domain/development';
import { cacheKey, getResearchItems, memoryStore, planTopics, regionOf, researchSources, runResearch, type ResearchRequest } from '@/server/research';
import { iso } from '@/server/research/store';
import { GDELT_TIMING } from '@/server/research/providers/gdelt';
import { resetSpacing } from '@/server/research/http';
import { CONTRACTS } from '@/server/org/contracts';

/** A WHOLE RESEARCH RUN with the network mocked and a memory store: every platform in priority order with an honest
 *  status, the cache reused inside its expiry (and bypassed by `refresh`), items upserted by (platform, url), Settings'
 *  switches, the run's status and limitations, and topic planning (a season researches its show's genre). */

let now = new Date('2026-10-03T06:00:00Z');
const clock = () => now;
let fetches = 0;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ENV = ['YOUTUBE_API_KEY', 'TIKTOK_RESEARCH_CLIENT_KEY', 'TIKTOK_RESEARCH_CLIENT_SECRET', 'INSTAGRAM_GRAPH_TOKEN', 'INSTAGRAM_BUSINESS_ID'];
const saved: Record<string, string | undefined> = {};

let views = 238832;
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  now = new Date('2026-10-03T06:00:00Z'); fetches = 0; views = 238832;
  resetSpacing(); GDELT_TIMING.spacingMs = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetches++;
    const u = String(url);
    if (u.includes('api.gdeltproject.org')) return json({ articles: [{ url: `https://news.example/${encodeURIComponent(u.slice(60, 80))}`, title: `A story about ${u.includes('comedy') ? 'comedy' : 'mystery'} films ${fetches}`, seendate: '20261002T120000Z', domain: 'news.example' }] });
    if (u.includes('/metrics/pageviews/top/')) return json({ items: [{ articles: [{ article: 'Main_Page', views: 1, rank: 1 }, { article: 'Some_Film', views, rank: 9 }] }] });
    if (u.includes('query.wikidata.org')) return json({ results: { bindings: [{ title: { value: 'Some Film' }, class: { value: 'http://www.wikidata.org/entity/Q11424' } }] } });
    throw new Error(`unexpected fetch ${u}`);
  }));
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });

const shortEn: ResearchRequest = { ideaJobId: 'idea-1', kind: 'SHORT', language: 'EN', style: 'REALISTIC', preferences: { genre: 'mystery' } };

describe('a research run on this machine’s access (no TikTok/Instagram/YouTube credentials, no Facebook path)', () => {
  it('covers all six platforms in priority order, each status explained; PARTIAL; items stored with ids; limitations stated', async () => {
    const store = memoryStore();
    const run = await runResearch(shortEn, { store, now: clock });
    expect(run.coverage.map((c) => [c.platform, c.status])).toEqual([['TIKTOK', 'NOT_CONFIGURED'], ['INSTAGRAM', 'NOT_CONFIGURED'], ['FACEBOOK', 'UNSUPPORTED'], ['YOUTUBE', 'NOT_CONFIGURED'], ['NEWS', 'OK'], ['WIKIPEDIA', 'OK']]);
    expect(run.coverage.every((c) => c.detail.length > 20)).toBe(true);
    expect(run.status).toBe('PARTIAL');
    expect(run.itemIds).toHaveLength(3); // two news queries + one film
    expect(run.reusedFromCache).toBe(0);
    expect(run.limitations.join(' ')).toMatch(/None of the priority platforms/);
    expect(run.limitations.join(' ')).toMatch(/not how many watched it/);
    const items = await getResearchItems(run.itemIds, store);
    expect(items.find((i) => i.platform === 'WIKIPEDIA')).toMatchObject({ title: 'Some Film', metrics: { pageviews: 238832, rank: 9, periodDays: 1 }, retrievedAt: '2026-10-03T06:00:00.000Z' });
    expect(store.runs.get(run.id)).toMatchObject({ ideaJobId: 'idea-1', request: { kind: 'SHORT', language: 'EN', genre: 'mystery' } });
    // the store tool's contract accepts the run as recorded
    expect(CONTRACTS['research.store_evidence'].output.safeParse(run).success).toBe(true);
  });
  it('a second run inside the expiry reuses the cache (CACHED, counted, no fetch); refresh fetches again and keeps item ids', async () => {
    const store = memoryStore();
    const first = await runResearch(shortEn, { store, now: clock });
    const before = fetches;
    now = new Date('2026-10-03T10:00:00Z');
    const second = await runResearch(shortEn, { store, now: clock });
    expect(fetches).toBe(before);
    expect(second.coverage.find((c) => c.platform === 'NEWS')!.status).toBe('CACHED');
    expect(second.coverage.find((c) => c.platform === 'WIKIPEDIA')!).toMatchObject({ status: 'CACHED', cachedUntil: '2026-10-04T06:00:00.000Z', fetchedAt: '2026-10-03T06:00:00.000Z' });
    expect(second.reusedFromCache).toBe(3);
    expect(second.coverage.find((c) => c.platform === 'NEWS')!.detail).toMatch(/reused from the fetch of 2026-10-03 06:00 UTC/);
    views = 250000;
    const third = await runResearch({ ...shortEn, refresh: true }, { store, now: clock });
    expect(fetches).toBeGreaterThan(before);
    const film = (await getResearchItems(third.itemIds, store)).find((i) => i.platform === 'WIKIPEDIA')!;
    // upserted by (platform, url): the same id, the new measurement
    expect(film.id).toBe((await getResearchItems(first.itemIds, store)).find((i) => i.platform === 'WIKIPEDIA')!.id);
    expect(film.metrics.pageviews).toBe(250000);
  });
  it('an expired entry is fetched again; Settings’ cacheHours sets the expiry (clamped to 1–168 h)', async () => {
    const store = memoryStore();
    await runResearch(shortEn, { store, now: clock, settings: { enabled: true, cacheHours: 1 } });
    const key = cacheKey('wikimedia-pageviews+wikidata', 'top en.wikipedia daily', 'EN', undefined);
    expect(store.cache.get(key)).toMatchObject({ expiresAt: '2026-10-03T07:00:00.000Z', status: 'OK' });
    now = new Date('2026-10-03T07:30:00Z');
    const before = fetches;
    const run = await runResearch(shortEn, { store, now: clock, settings: { enabled: true, cacheHours: 1 } });
    expect(fetches).toBeGreaterThan(before);
    expect(run.coverage.find((c) => c.platform === 'WIKIPEDIA')!.status).toBe('OK');
    await runResearch({ ...shortEn, refresh: true }, { store, now: clock, settings: { enabled: true, cacheHours: 9999 } });
    expect(Date.parse(store.cache.get(key)!.expiresAt) - Date.parse(store.cache.get(key)!.fetchedAt)).toBe(168 * 3_600_000);
  });
  it('Settings: a platform switched off is DISABLED; research switched off makes every platform DISABLED and the run DISABLED', async () => {
    const store = memoryStore();
    const one = await runResearch(shortEn, { store, now: clock, settings: { enabled: true, platforms: { NEWS: false } } });
    expect(one.coverage.find((c) => c.platform === 'NEWS')).toMatchObject({ status: 'DISABLED', detail: expect.stringMatching(/switched off in Settings/) });
    const before = fetches;
    const off = await runResearch(shortEn, { store, now: clock, settings: { enabled: false } });
    expect(fetches).toBe(before);
    expect(off.coverage.every((c) => c.status === 'DISABLED')).toBe(true);
    expect(off.status).toBe('DISABLED');
  });
  it('a source that fails is FAILED with its host and status, and the run continues', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { const u = String(url); if (u.includes('gdelt')) return new Response('down', { status: 503 }); if (u.includes('pageviews')) return json({ items: [{ articles: [{ article: 'Some_Film', views: 5, rank: 2 }] }] }); return json({ results: { bindings: [{ title: { value: 'Some Film' }, class: { value: 'http://www.wikidata.org/entity/Q11424' } }] } }); }));
    const run = await runResearch(shortEn, { store: memoryStore(), now: clock });
    expect(run.coverage.find((c) => c.platform === 'NEWS')).toMatchObject({ status: 'FAILED', detail: expect.stringMatching(/api\.gdeltproject\.org\/api\/v2\/doc\/doc answered HTTP 503/) });
    expect(run.status).toBe('PARTIAL');
  });
});

describe('a link that is not a web address is not evidence', () => {
  it('is dropped before it is stored, so the query contract never sees it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { const u = String(url); if (u.includes('gdelt')) return json({ articles: [{ url: 'javascript:alert(1)', title: 'Bad', seendate: '20261002T120000Z' }, { url: 'https://ok.example/a', title: 'Good', seendate: '20261002T120000Z' }] }); if (u.includes('pageviews')) return json({ items: [{ articles: [] }] }); return json({ results: { bindings: [] } }); }));
    const store = memoryStore();
    const run = await runResearch(shortEn, { store, now: clock });
    const urls = (await getResearchItems(run.itemIds, store)).map((i) => i.url);
    expect(urls).toEqual(['https://ok.example/a']);
  });
});

describe('dates from the database', () => {
  it('Postgres timestamps become ISO 8601 like the providers write them', () => {
    expect(iso('2026-10-03 04:43:44.024+00')).toBe('2026-10-03T04:43:44.024Z');
    expect(iso('2026-10-03 07:43:44+03')).toBe('2026-10-03T04:43:44.000Z');
    expect(iso('2026-10-02T12:00:00Z')).toBe('2026-10-02T12:00:00.000Z');
    expect(iso(null)).toBeUndefined();
  });
});

describe('run status and empty runs', () => {
  it('COMPLETE / PARTIAL / UNAVAILABLE / DISABLED from the coverage', () => {
    const c = (status: string) => ({ platform: 'NEWS' as const, provider: 'p', status: status as 'OK', detail: 'd', queries: 0, items: 0 });
    expect(runStatusOf([c('OK'), c('CACHED'), c('EMPTY')])).toBe('COMPLETE');
    expect(runStatusOf([c('OK'), c('NOT_CONFIGURED')])).toBe('PARTIAL');
    expect(runStatusOf([c('FAILED'), c('UNSUPPORTED'), c('DISABLED')])).toBe('UNAVAILABLE');
    expect(runStatusOf([c('DISABLED'), c('SKIPPED')])).toBe('DISABLED');
    const off = emptyRun('none-1', 'DISABLED', 'off');
    expect(off.coverage.map((x) => x.platform)).toEqual([...RESEARCH_PLATFORMS]);
    expect(off.limitations[0]).toBe('Original concept — no trend research was used.');
  });
});

describe('topic planning', () => {
  it('an Iraqi cartoon show researches Iraq, in Arabic words, with the reason for each topic', () => {
    expect(regionOf('AR', 'IRAQI_BAGHDADI')).toBe('IQ'); expect(regionOf('AR', 'EGYPTIAN')).toBe('EG'); expect(regionOf('AR', 'GULF')).toBe('AE'); expect(regionOf('AR', 'MSA')).toBe('SA'); expect(regionOf('EN')).toBe('US');
    const t = planTopics({ ideaJobId: 'i', kind: 'SHOW', language: 'AR', dialect: 'IRAQI_BAGHDADI', style: 'CARTOON', preferences: { genre: 'family comedy' } });
    expect(t.map((x) => x.query)).toEqual(['animated series | مسلسل كرتون', 'comedy series | مسلسل كوميدي', 'top ar.wikipedia']);
    expect(t[0]).toMatchObject({ region: 'IQ', categories: ['SERIES', 'ANIMATION'], reason: expect.stringMatching(/Iraq/) });
    expect(t[2].platforms).toEqual(['WIKIPEDIA']);
    expect(t[2].reason).toMatch(/not Iraq alone/);
    expect(t.every((x) => !x.platforms.includes('FACEBOOK'))).toBe(true);
  });
  it('a season researches its show’s own genre, never the producer’s trend of the day', () => {
    const t = planTopics({ ideaJobId: 'i', kind: 'SEASON', language: 'EN', style: 'REALISTIC', preferences: { genre: 'horror' }, show: { title: 'Night Market', genre: 'Comedy-drama', logline: 'x' } });
    expect(t[1]).toMatchObject({ query: 'comedy series', categories: ['COMEDY', 'SERIES'] });
    expect(t[1].reason).toMatch(/show's own genre/);
    expect(t[0].reason).toMatch(/not to replace it/);
  });
  it('a music video researches music videos and songs', () => {
    const t = planTopics({ ideaJobId: 'i', kind: 'MUSIC_VIDEO', language: 'EN', preferences: {} });
    expect(t[0]).toMatchObject({ query: 'music video', categories: ['MUSIC_VIDEO', 'MUSIC'] });
    expect(t.at(-1)!.categories).toEqual(['MUSIC', 'MUSIC_VIDEO']);
    expect(t.length).toBeLessThanOrEqual(3);
  });
});

describe('research sources (GET /api/research/sources)', () => {
  it('every platform in priority order with its access status; no secret ever appears', () => {
    process.env.YOUTUBE_API_KEY = 'very-secret';
    const s = researchSources({ enabled: true, platforms: { INSTAGRAM: false } });
    expect(s.map((x) => [x.platform, x.status])).toEqual([['TIKTOK', 'NOT_CONFIGURED'], ['INSTAGRAM', 'DISABLED'], ['FACEBOOK', 'UNSUPPORTED'], ['YOUTUBE', 'READY'], ['NEWS', 'READY'], ['WIKIPEDIA', 'READY']]);
    expect(JSON.stringify(s)).not.toContain('very-secret');
    expect(s.find((x) => x.platform === 'NEWS')!.ttlHours).toBe(24);
    expect(researchSources({ enabled: false }).every((x) => x.status === 'DISABLED')).toBe(true);
  });
});
