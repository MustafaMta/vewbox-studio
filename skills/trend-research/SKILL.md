---
name: trend-research
description: Researching what audiences watch now for an Auto Idea through permitted access only — topic planning from the request, every platform in the producer's priority order (TikTok, Instagram, Facebook, YouTube, then news and Wikipedia), cache with expiry, evidence with real URLs, dates and only the metrics a source returned, and honest coverage when a platform cannot be reached. Use when running or checking IDEA_RESEARCH.
license: Proprietary to this studio
allowed-tools: research.plan_topics research.query_source research.store_evidence
metadata:
  version: "1.0.0"
  kind: "PROCEDURE"
  source: "src/server/research/ (topics.ts, providers/, index.ts, store.ts); run by the Trend Research Agent in src/worker/handlers/development.ts"
  models: "TikTok Research API, Instagram Graph API, YouTube Data API v3, GDELT DOC 2.0, Wikimedia pageviews + Wikidata"
---

# Permitted trend research

Research is evidence, never invention. Nothing is scraped, no platform restriction is bypassed, and no item, metric or
URL is ever made up. A platform the studio cannot legitimately reach is recorded with the reason, and the idea goes on.

## 1. Plan the topics (`research.plan_topics`, deterministic)

At most three topics, each with its platforms, region and the reason it was chosen:

- **the format** where its audience is ("animated series | مسلسل كرتون" in Iraq; "short film" in the United States);
- **the genre** — the producer's, or for a season or an episode **the show's own genre** (never what is trending in
  general: a continuation is informed by trends, never restarted by them);
- **measured attention** — what readers of the language's Wikipedia opened yesterday.

Region: Iraq for Baghdadi; Egypt, the Gulf or Saudi Arabia for other Arabic; the United States for English.

## 2. Query every platform in order (`research.query_source`, cache first)

| Order | Platform | Permitted access | Without it |
|---|---|---|---|
| 1 | TikTok | Research API (approved researchers): `TIKTOK_RESEARCH_CLIENT_KEY`, `TIKTOK_RESEARCH_CLIENT_SECRET` | NOT_CONFIGURED |
| 2 | Instagram | Graph API hashtag search (Business/Creator account): `INSTAGRAM_GRAPH_TOKEN`, `INSTAGRAM_BUSINESS_ID` | NOT_CONFIGURED |
| 3 | Facebook | none — Meta's Content Library is for approved researchers inside Meta only | UNSUPPORTED |
| 4 | YouTube | Data API v3 (`mostPopular` chart by region and category; search of the last 30 days by views): `YOUTUBE_API_KEY` | NOT_CONFIGURED |
| — | News | GDELT DOC 2.0, keyless, one request per 5 s, last 14 days, no per-article metric | RATE_LIMITED / FAILED recorded |
| — | Wikipedia | Wikimedia pageviews `top` (yesterday), classified by Wikidata P31 (film, series, anime, song, music video) | FAILED recorded |

- Cache key `sha256(provider + query + language + region)`; reused until it expires (charts 12 h, news and
  Wikipedia 24 h, or Settings' `cacheHours` 1–168); `refresh` fetches again. A reused item is counted.
- 15 s per call, an honest User-Agent, the job's AbortSignal; a source that refused for its rate limit is not asked
  again in the same run.
- Items keep: platform, provider, URL, title, published and retrieved dates, category, language, region, **only the
  metrics the source returned** (views, likes, comments, shares, pageviews, rank), at most 200 characters the source
  wrote about itself, the query, and the creator or publisher. Never a transcript, lyrics or a reproduced post.

## 3. Record the run (`research.store_evidence`)

Coverage of all six platforms in priority order, every status with a sentence a producer can read (OK, CACHED, EMPTY,
NOT_CONFIGURED, UNSUPPORTED, RATE_LIMITED, FAILED, DISABLED, SKIPPED); the run is COMPLETE, PARTIAL, UNAVAILABLE or
DISABLED; the limitations say what the evidence cannot show (pageviews are reading, not watching; Arabic Wikipedia is
pan-Arab, not Iraq alone; news has no audience measurement). If research fails as a whole, the idea continues as an
explicitly original concept.
