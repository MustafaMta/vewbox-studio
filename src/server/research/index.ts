import { RESEARCH_PLATFORMS, runStatusOf, type IdeaKind, type ProviderCoverage, type ResearchItem, type ResearchPlatform, type ResearchRunSummary, type ResearchTopic } from '@/domain/development';
import type { ResearchSettings } from '@/domain/types';
import { platformEnabled, researchEnabled, ttlHours } from './config';
import { PROVIDERS, providersInOrder } from './providers';
import { cacheKey, dbStore, newItemId, newRunId, type ResearchStore, type StoredRun } from './store';
import { planTopics } from './topics';
import type { ResearchOptions, ResearchRequest, ResearchSourceStatus } from './types';

/** THE RESEARCH MODULE — the Trend Research Agent's tools (docs/CONTRACTS-AUTO-IDEA.md §3): plan the topics, query
 *  every platform in the producer's priority order (cache first), store the evidence and the run.
 *
 *  Rules: only official APIs and permitted public access; no scraping, no bypassing a platform's restrictions; a
 *  platform without a permitted path is UNSUPPORTED and one without credentials NOT_CONFIGURED — recorded with the
 *  reason, never silently dropped and never filled with invented items. Cached per source with an expiry. */

export type { ResearchRequest, ResearchOptions, ResearchSourceStatus } from './types';
export { planTopics, regionOf } from './topics';
export { memoryStore, cacheKey } from './store';
export type { ResearchStore } from './store';

const LABEL: Record<ResearchPlatform, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', NEWS: 'news (GDELT)', WIKIPEDIA: 'Wikipedia' };

export interface SourceResult { coverage: ProviderCoverage; items: ResearchItem[]; reusedFromCache: number }

const webUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

interface QueryContext extends ResearchOptions { kind: IdeaKind; refresh?: boolean }

/** One platform, every query of it planned for these topics: cache first (unless `refresh`), then the source. Never
 *  throws for the platform's own answer (refused, rate-limited, unreachable): that is coverage. Throws only when the
 *  studio's own storage fails. */
export async function querySource(platform: ResearchPlatform, topics: ResearchTopic[], ctx: QueryContext): Promise<SourceResult> {
  const provider = PROVIDERS[platform];
  const store = ctx.store ?? dbStore();
  const now = ctx.now ?? (() => new Date());
  const base = { platform, provider: provider.id, queries: 0, items: 0 };
  if (!researchEnabled(ctx.settings) || !platformEnabled(platform, ctx.settings)) return { coverage: { ...base, status: 'DISABLED', detail: !researchEnabled(ctx.settings) ? 'Research is switched off in Settings.' : `${LABEL[platform]} is switched off in Settings.` }, items: [], reusedFromCache: 0 };
  const access = provider.access();
  if (access.status !== 'READY') return { coverage: { ...base, status: access.status, detail: access.detail }, items: [], reusedFromCache: 0 };
  const queries = provider.queries(topics, ctx.kind);
  if (!queries.length) return { coverage: { ...base, status: 'SKIPPED', detail: `No topic of this request is one ${LABEL[platform]} answers.` }, items: [], reusedFromCache: 0 };

  const results: Array<{ status: ProviderCoverage['status']; detail: string; items: ResearchItem[]; fetchedAt?: string; cachedUntil?: string; skipped?: boolean }> = [];
  let reused = 0;
  for (const q of queries) {
    const key = cacheKey(provider.id, q.query, q.language, q.region);
    if (!ctx.refresh) {
      const hit = await store.getCache(key);
      if (hit && Date.parse(hit.expiresAt) > now().getTime() && (hit.status === 'OK' || hit.status === 'EMPTY')) {
        const items = await store.getItems(hit.itemIds);
        reused += items.length;
        results.push({ status: 'CACHED', detail: `${hit.detail} (reused from the fetch of ${hit.fetchedAt.slice(0, 16).replace('T', ' ')} UTC)`, items, fetchedAt: hit.fetchedAt, cachedUntil: hit.expiresAt });
        await ctx.event?.(`${LABEL[platform]}: ${q.query} — reused ${items.length} item(s) from the cache`, { platform, query: q.query, cached: true });
        continue;
      }
    }
    // a source that just refused for its rate limit is not asked again in this run
    if (results.some((r) => r.status === 'RATE_LIMITED')) { results.push({ status: 'RATE_LIMITED', detail: `${q.query} not attempted after the rate-limit refusal`, items: [], skipped: true }); continue; }
    await ctx.progress?.(`Querying ${LABEL[platform]}: ${q.query}`);
    const answer = await provider.fetch(q, { signal: ctx.signal, now: now(), event: ctx.event ? (m) => ctx.event!(m, { platform }) : undefined });
    const fetchedAt = now().toISOString();
    // a link that is not a web address is not evidence: it is dropped, never repaired or guessed
    const fresh = Array.from(new Map(answer.items.filter((i) => webUrl(i.url) && i.title.trim()).map((i) => [i.url, i])).values()).map((i): ResearchItem => ({ ...i, id: newItemId(), retrievedAt: fetchedAt }));
    const stored = await store.upsertItems(fresh);
    let cachedUntil: string | undefined;
    if (answer.status === 'OK' || answer.status === 'EMPTY') {
      cachedUntil = new Date(Date.parse(fetchedAt) + ttlHours(platform, ctx.settings) * 3_600_000).toISOString();
      await store.putCache({ key, platform, provider: provider.id, query: q.query, status: answer.status, detail: answer.detail, itemIds: stored.map((s) => s.id), fetchedAt, expiresAt: cachedUntil });
    }
    results.push({ status: answer.status, detail: answer.detail, items: stored, fetchedAt, cachedUntil });
    await ctx.event?.(`${LABEL[platform]}: ${q.query} — ${answer.status} (${stored.length} item(s))`, { platform, query: q.query, status: answer.status, items: stored.length });
  }

  const items = Array.from(new Map(results.flatMap((r) => r.items).map((i) => [i.id, i])).values());
  const answered = results.filter((r) => r.status === 'OK' || r.status === 'CACHED' || r.status === 'EMPTY');
  const status: ProviderCoverage['status'] = !answered.length ? (results.some((r) => r.status === 'RATE_LIMITED') ? 'RATE_LIMITED' : 'FAILED')
    : answered.length === results.length && results.every((r) => r.status === 'CACHED') ? 'CACHED'
      : items.length ? 'OK' : 'EMPTY';
  const detail = results.map((r) => r.detail.replace(/\.$/, '')).join('; ').slice(0, 600);
  const fetched = results.map((r) => r.fetchedAt).filter((x): x is string => Boolean(x)).sort();
  const until = results.map((r) => r.cachedUntil).filter((x): x is string => Boolean(x)).sort();
  return { coverage: { platform, provider: provider.id, status, detail: `${detail}.`, queries: results.filter((r) => !r.skipped).length, items: items.length, fetchedAt: fetched.at(-1), cachedUntil: until[0] }, items, reusedFromCache: reused };
}

/** What the run cannot show, in sentences a producer reads next to the evidence. */
export function limitationsOf(coverage: ProviderCoverage[], language: string, dialect?: string): string[] {
  const ok = (p: ResearchPlatform) => coverage.some((c) => c.platform === p && (c.status === 'OK' || c.status === 'CACHED') && c.items > 0);
  const out: string[] = [];
  const priority: ResearchPlatform[] = ['TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'];
  const missing = priority.filter((p) => !ok(p));
  if (missing.length === priority.length) out.push('None of the priority platforms (TikTok, Instagram, Facebook, YouTube) could be researched from this studio; the evidence is limited to news coverage and Wikipedia reading.');
  else if (missing.length) out.push(`Not researched: ${missing.map((p) => LABEL[p]).join(', ')} (see the coverage for why).`);
  if (ok('WIKIPEDIA')) out.push('Wikipedia pageviews measure how many people read about a title, not how many watched it or whether they liked it.');
  if (ok('WIKIPEDIA') && language === 'AR') out.push(`Arabic Wikipedia is read across the Arab world${dialect === 'IRAQI_BAGHDADI' ? '; it is not an Iraq-only signal' : ''}.`);
  if (ok('NEWS')) out.push('News coverage shows what is being talked about; GDELT gives no audience measurement per article.');
  if (!coverage.some((c) => c.items > 0)) out.push('No evidence was reachable: the concept rests on storytelling craft only.');
  return out;
}

/** Records the run: the coverage of every platform in priority order (a platform no query reached is SKIPPED with the
 *  reason), the items it rests on, the limitations. */
export async function storeEvidence(input: { request: ResearchRequest; topics: ResearchTopic[]; results: SourceResult[]; startedAt: string }, opts: Pick<ResearchOptions, 'store' | 'now'> = {}): Promise<ResearchRunSummary> {
  const store = opts.store ?? dbStore();
  const coverage = RESEARCH_PLATFORMS.map((p) => input.results.find((r) => r.coverage.platform === p)?.coverage ?? { platform: p, provider: PROVIDERS[p].id, status: 'SKIPPED' as const, detail: 'Not queried in this run.', queries: 0, items: 0 });
  const itemIds = Array.from(new Set(input.results.flatMap((r) => r.items.map((i) => i.id))));
  const req = input.request;
  const run: StoredRun = {
    id: newRunId(), ideaJobId: req.ideaJobId, jobId: req.jobId, status: runStatusOf(coverage), topics: input.topics, coverage, itemIds,
    reusedFromCache: input.results.reduce((a, r) => a + r.reusedFromCache, 0), limitations: limitationsOf(coverage, req.language, req.dialect),
    startedAt: input.startedAt, finishedAt: (opts.now?.() ?? new Date()).toISOString(),
    request: { kind: req.kind, language: req.language, dialect: req.dialect, style: req.style, genre: req.preferences.genre, audience: req.preferences.audience, show: req.show?.title, refresh: Boolean(req.refresh) },
  };
  await store.saveRun(run);
  const { ideaJobId: _i, jobId: _j, request: _r, ...summary } = run;
  return summary;
}

/** The whole research in one call (the API, scripts): plan → every platform in order → store. The worker's Trend
 *  Research Agent runs the same three steps as recorded tool calls (src/worker/handlers/development.ts). */
export async function runResearch(req: ResearchRequest, opts: ResearchOptions = {}): Promise<ResearchRunSummary> {
  const startedAt = (opts.now?.() ?? new Date()).toISOString();
  const topics = planTopics(req);
  const results: SourceResult[] = [];
  for (const p of RESEARCH_PLATFORMS) results.push(await querySource(p, topics, { ...opts, kind: req.kind, refresh: req.refresh }));
  return storeEvidence({ request: req, topics, results, startedAt }, opts);
}

export async function getResearchRun(id: string, store: ResearchStore = dbStore()): Promise<ResearchRunSummary | undefined> {
  const r = await store.getRun(id);
  if (!r) return undefined;
  const { ideaJobId: _i, jobId: _j, request: _r, ...summary } = r;
  return summary;
}

export async function getResearchItems(ids: string[], store: ResearchStore = dbStore()): Promise<ResearchItem[]> {
  return store.getItems(ids);
}

/** Each platform's access path right now, in priority order (Settings switches applied); never a secret. */
export function researchSources(settings?: ResearchSettings): ResearchSourceStatus[] {
  return providersInOrder().map((p) => {
    const a = p.access();
    const off = !researchEnabled(settings) || !platformEnabled(p.platform, settings);
    return { platform: p.platform, provider: p.id, status: off ? 'DISABLED' : a.status, detail: off ? (researchEnabled(settings) ? `${LABEL[p.platform]} is switched off in Settings.` : 'Research is switched off in Settings.') : a.detail, ttlHours: ttlHours(p.platform, settings) };
  });
}
