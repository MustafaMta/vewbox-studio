import type { ResearchCategory, ResearchTopic } from '@/domain/development';
import { call, clip, ResearchHttpError } from '../http';
import type { FetchedItem, ResearchProvider, SourceAnswer, SourceQuery } from './types';

/** WIKIPEDIA — measured attention, keyless: Wikimedia's daily list of the most-read articles of a language's
 *  Wikipedia (pageviews API `top`), classified by Wikidata (instance of, P31) so only films, series, anime, songs and
 *  music videos remain. The numbers are the source's own: the day's pageviews and rank. Readers of Arabic Wikipedia
 *  are spread over the Arab world, and Wikimedia publishes no per-country list for Iraq, so it is pan-Arabic attention
 *  — the coverage says so. */

export const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top';
export const SPARQL = 'https://query.wikidata.org/sparql';

/** Wikidata classes (P31 values, ids checked against Wikidata on 2026-10-03) → the research category they evidence. */
export const CLASS_CATEGORY: Record<string, ResearchCategory> = {
  Q11424: 'FILM', Q24856: 'FILM', Q506240: 'FILM',
  Q202866: 'ANIMATION', Q581714: 'ANIMATION', Q117467246: 'ANIMATION', Q17517379: 'ANIMATION',
  Q20650540: 'ANIME', Q63952888: 'ANIME', Q21198342: 'ANIME', Q1107: 'ANIME',
  Q5398426: 'SERIES', Q1259759: 'SERIES', Q526877: 'SERIES', Q15416: 'SERIES', Q23739: 'SERIES', Q3464665: 'SERIES', Q21191270: 'SERIES', Q1366112: 'SERIES',
  Q170238: 'COMEDY',
  Q24862: 'SHORT_FORM',
  Q7366: 'MUSIC', Q134556: 'MUSIC', Q482994: 'MUSIC', Q105543609: 'MUSIC',
  Q193977: 'MUSIC_VIDEO',
};
const SCREEN: ResearchCategory[] = ['FILM', 'SERIES', 'ANIMATION', 'ANIME', 'SHORT_FORM', 'COMEDY'];
const MUSICAL: ResearchCategory[] = ['MUSIC', 'MUSIC_VIDEO'];
/** A more specific class wins when an article has several (an animated series is also a television series). */
const SPECIFICITY: ResearchCategory[] = ['MUSIC_VIDEO', 'ANIME', 'ANIMATION', 'COMEDY', 'SHORT_FORM', 'SERIES', 'FILM', 'MUSIC'];

const KEEP = 15;
const CANDIDATES = 200;

const ymd = (d: Date) => [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')] as const;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const wikipedia: ResearchProvider = {
  platform: 'WIKIPEDIA',
  id: 'wikimedia-pageviews+wikidata',
  access: () => ({ status: 'READY', detail: 'Wikimedia pageviews (the daily most-read list) and Wikidata (what each article is), keyless.' }),
  queries(topics: ResearchTopic[], kind) {
    const t = topics.find((x) => x.platforms.includes('WIKIPEDIA'));
    if (!t) return [];
    const lang = t.language === 'AR' ? 'ar' : 'en';
    return [{ query: `top ${lang}.wikipedia daily`, language: t.language, region: undefined, categories: kind === 'MUSIC_VIDEO' ? MUSICAL : SCREEN, kind, params: { lang } }];
  },
  async fetch(q: SourceQuery, ctx): Promise<SourceAnswer> {
    const lang = String(q.params.lang);
    const project = `${lang}.wikipedia`;
    // the latest complete day: yesterday (UTC), or the day before when yesterday is not published yet
    let articles: Array<{ article: string; views: number; rank: number }> | undefined;
    let day = '';
    for (const back of [1, 2, 3]) {
      const d = new Date(ctx.now.getTime() - back * 86_400_000);
      const [y, m, dd] = ymd(d);
      try {
        const r = await call(`${PAGEVIEWS}/${project}/all-access/${y}/${m}/${dd}`, { signal: ctx.signal });
        const items = (r.json as { items?: Array<{ articles?: Array<{ article: string; views: number; rank: number }> }> } | undefined)?.items;
        if (items?.[0]?.articles?.length) { articles = items[0].articles; day = `${y}-${m}-${dd}`; break; }
      } catch (e) {
        if (e instanceof ResearchHttpError && e.status === 404) continue;
        if (e instanceof ResearchHttpError && e.status === 429) return { status: 'RATE_LIMITED', detail: `Wikimedia pageviews asked the studio to slow down (HTTP 429).`, items: [] };
        return { status: 'FAILED', detail: `Wikimedia pageviews: ${(e as Error).message}.`, items: [] };
      }
    }
    if (!articles) return { status: 'EMPTY', detail: `Wikimedia has not published a most-read list for ${project} in the last three days.`, items: [] };
    // content articles only (no Main Page, Special:, File: …)
    const candidates = articles.filter((a) => !a.article.includes(':') && a.rank > 1).slice(0, CANDIDATES);
    const titles = candidates.map((a) => a.article.replace(/_/g, ' '));
    const sparql = `SELECT ?title ?item ?class ?desc WHERE { VALUES ?title { ${titles.map((t) => `"${esc(t)}"@${lang}`).join(' ')} } ?article schema:about ?item ; schema:isPartOf <https://${lang}.wikipedia.org/> ; schema:name ?title . ?item wdt:P31 ?class . OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "${lang}") } }`;
    let rows: Array<{ title: string; cls: string; desc?: string }>;
    try {
      const r = await call(SPARQL, { method: 'POST', signal: ctx.signal, accept: 'application/sparql-results+json', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `query=${encodeURIComponent(sparql)}`, timeoutMs: 20_000 });
      const b = (r.json as { results?: { bindings?: Array<Record<string, { value: string }>> } } | undefined)?.results?.bindings ?? [];
      rows = b.map((x) => ({ title: x.title?.value ?? '', cls: (x.class?.value ?? '').split('/').pop() ?? '', desc: x.desc?.value }));
    } catch (e) {
      return { status: 'FAILED', detail: `The most-read list of ${project} for ${day} was fetched, but Wikidata could not classify it: ${(e as Error).message}.`, items: [] };
    }
    const categoryOf = new Map<string, { category: ResearchCategory; desc?: string }>();
    for (const r of rows) {
      const c = CLASS_CATEGORY[r.cls];
      if (!c) continue;
      const prev = categoryOf.get(r.title);
      if (!prev || SPECIFICITY.indexOf(c) < SPECIFICITY.indexOf(prev.category)) categoryOf.set(r.title, { category: c, desc: r.desc ?? prev?.desc });
    }
    const items: FetchedItem[] = [];
    for (const a of candidates) {
      const title = a.article.replace(/_/g, ' ');
      const hit = categoryOf.get(title);
      if (!hit || !q.categories.includes(hit.category)) continue;
      items.push({ platform: 'WIKIPEDIA', provider: 'wikimedia-pageviews', url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`, title, category: hit.category, language: lang, metrics: { pageviews: a.views, rank: a.rank, periodDays: 1 }, excerpt: clip(hit.desc, 200), query: `top ${project} ${day}` });
      if (items.length >= KEEP) break;
    }
    const scope = lang === 'ar' ? ' (readers across the Arab world; Wikimedia publishes no per-country list for Iraq)' : '';
    if (!items.length) return { status: 'EMPTY', detail: `The most-read ${project} list for ${day} holds no ${q.kind === 'MUSIC_VIDEO' ? 'songs or music videos' : 'films or series'} among its top ${candidates.length} articles${scope}.`, items: [] };
    return { status: 'OK', detail: `${items.length} ${q.kind === 'MUSIC_VIDEO' ? 'songs and music videos' : 'films and series'} among the ${candidates.length} most-read ${project} articles of ${day}${scope}.`, items };
  },
};
