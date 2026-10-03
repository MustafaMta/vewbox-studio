import { createHash } from 'node:crypto';
import { eq, inArray, sql as dsql } from 'drizzle-orm';
import { nid } from '@/domain/ids';
import type { ResearchItem, ResearchPlatform, ResearchRunSummary } from '@/domain/development';

/** WHERE EVIDENCE IS KEPT — the cache (one entry per source query, with its expiry), the items (unique per platform +
 *  URL: a later fetch refreshes the measurements and keeps the id, so earlier runs still resolve), and the runs. The
 *  database store is the studio's; the memory store serves tests and a dry run that must not write anywhere. */

export interface CacheEntry { key: string; platform: ResearchPlatform; provider: string; query: string; status: string; detail: string; itemIds: string[]; fetchedAt: string; expiresAt: string }
export interface StoredRun extends ResearchRunSummary { ideaJobId?: string; jobId?: string; request: Record<string, unknown> }

export interface ResearchStore {
  getCache(key: string): Promise<CacheEntry | undefined>;
  putCache(entry: CacheEntry): Promise<void>;
  /** Insert or refresh by (platform, url); returns the stored items (an existing item keeps its id). */
  upsertItems(items: ResearchItem[]): Promise<ResearchItem[]>;
  getItems(ids: string[]): Promise<ResearchItem[]>;
  saveRun(run: StoredRun): Promise<void>;
  getRun(id: string): Promise<StoredRun | undefined>;
}

/** sha256(provider + query + language + region) (contract §3). */
export const cacheKey = (provider: string, query: string, language: string, region?: string) => createHash('sha256').update([provider, query, language, region ?? ''].join('\u0000')).digest('hex');

export const newItemId = () => nid('ri');
export const newRunId = () => nid('rr');

// ---------------------------------------------------------------------------------------------------- database

type ItemRow = { id: string; platform: string; provider: string; url: string; title: string; publishedAt: string | null; retrievedAt: string; category: string; language: string | null; region: string | null; metrics: ResearchItem['metrics']; excerpt: string | null; query: string; creator: string | null };
const rowToItem = (r: ItemRow): ResearchItem => ({ id: r.id, platform: r.platform as ResearchPlatform, provider: r.provider, url: r.url, title: r.title, publishedAt: r.publishedAt ?? undefined, retrievedAt: r.retrievedAt, category: r.category as ResearchItem['category'], language: r.language ?? undefined, region: r.region ?? undefined, metrics: r.metrics ?? {}, excerpt: r.excerpt ?? undefined, query: r.query, creator: r.creator ?? undefined });

/** The studio's database (the client is imported lazily so a memory-only caller never opens a connection). */
export function dbStore(): ResearchStore {
  const client = async () => import('@/server/db/client');
  return {
    async getCache(key) {
      const { db, schema } = await client();
      const [r] = await db().select().from(schema.researchCache).where(eq(schema.researchCache.key, key));
      return r ? { ...r, platform: r.platform as ResearchPlatform } : undefined;
    },
    async putCache(e) {
      const { db, schema } = await client();
      await db().insert(schema.researchCache).values(e).onConflictDoUpdate({ target: schema.researchCache.key, set: { status: e.status, detail: e.detail, itemIds: e.itemIds, fetchedAt: e.fetchedAt, expiresAt: e.expiresAt, query: e.query } });
    },
    async upsertItems(list) {
      // one row per (platform, url) per statement: Postgres refuses to update the same row twice in one upsert
      const items = Array.from(new Map(list.map((i) => [`${i.platform}\u0000${i.url}`, i])).values());
      if (!items.length) return [];
      const { db, schema } = await client();
      const t = schema.researchItems;
      const rows = items.map((i) => ({ id: i.id, platform: i.platform, provider: i.provider, url: i.url, title: i.title, publishedAt: i.publishedAt ?? null, retrievedAt: i.retrievedAt, category: i.category, language: i.language ?? null, region: i.region ?? null, metrics: i.metrics, excerpt: i.excerpt ?? null, query: i.query, creator: i.creator ?? null }));
      const out = await db().insert(t).values(rows).onConflictDoUpdate({ target: [t.platform, t.url], set: { title: dsql`excluded.title`, publishedAt: dsql`excluded.published_at`, retrievedAt: dsql`excluded.retrieved_at`, category: dsql`excluded.category`, language: dsql`excluded.language`, region: dsql`excluded.region`, metrics: dsql`excluded.metrics`, excerpt: dsql`excluded.excerpt`, query: dsql`excluded.query`, creator: dsql`excluded.creator` } }).returning();
      const byUrl = new Map(out.map((r) => [`${r.platform}\u0000${r.url}`, rowToItem(r as ItemRow)]));
      return items.map((i) => byUrl.get(`${i.platform}\u0000${i.url}`)!).filter(Boolean);
    },
    async getItems(ids) {
      if (!ids.length) return [];
      const { db, schema } = await client();
      const rows = await db().select().from(schema.researchItems).where(inArray(schema.researchItems.id, ids));
      const byId = new Map(rows.map((r) => [r.id, rowToItem(r as ItemRow)]));
      return ids.map((id) => byId.get(id)).filter((x): x is ResearchItem => Boolean(x));
    },
    async saveRun(r) {
      const { db, schema } = await client();
      await db().insert(schema.researchRuns).values({ id: r.id, ideaJobId: r.ideaJobId ?? null, jobId: r.jobId ?? null, status: r.status, request: r.request, topics: r.topics, coverage: r.coverage, itemIds: r.itemIds, reusedFromCache: r.reusedFromCache, limitations: r.limitations, startedAt: r.startedAt, finishedAt: r.finishedAt }).onConflictDoNothing();
    },
    async getRun(id) {
      const { db, schema } = await client();
      const [r] = await db().select().from(schema.researchRuns).where(eq(schema.researchRuns.id, id));
      return r ? { id: r.id, ideaJobId: r.ideaJobId ?? undefined, jobId: r.jobId ?? undefined, status: r.status as ResearchRunSummary['status'], request: r.request, topics: r.topics, coverage: r.coverage, itemIds: r.itemIds, reusedFromCache: r.reusedFromCache, limitations: r.limitations, startedAt: r.startedAt, finishedAt: r.finishedAt ?? r.startedAt } : undefined;
    },
  };
}

// ------------------------------------------------------------------------------------------------------ memory

export function memoryStore(): ResearchStore & { cache: Map<string, CacheEntry>; items: Map<string, ResearchItem>; runs: Map<string, StoredRun> } {
  const cache = new Map<string, CacheEntry>();
  const items = new Map<string, ResearchItem>();
  const runs = new Map<string, StoredRun>();
  return {
    cache, items, runs,
    getCache: async (key) => cache.get(key),
    putCache: async (e) => { cache.set(e.key, e); },
    upsertItems: async (list) => list.map((i) => {
      const existing = [...items.values()].find((x) => x.platform === i.platform && x.url === i.url);
      const stored = existing ? { ...i, id: existing.id } : i;
      items.set(stored.id, stored);
      return stored;
    }),
    getItems: async (ids) => ids.map((id) => items.get(id)).filter((x): x is ResearchItem => Boolean(x)),
    saveRun: async (r) => { runs.set(r.id, r); },
    getRun: async (id) => runs.get(id),
  };
}
