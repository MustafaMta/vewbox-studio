# Contract — research-driven Auto Idea (wave 3)

Source: the producer's directive "AI Entertainment Research, Trend Discovery and Professional Story Development"
(2026-10-02). This contract turns it into shared types, job types, tables, file ownership and acceptance checks. The
shared pieces are already on `main` and are the ONLY interface between the three engineers:

| Piece | File (on main) |
|---|---|
| Domain types: research items, coverage, patterns, concepts, reviews, dossier, intent | `src/domain/development.ts` |
| Job types `IDEA_RESEARCH`, `IDEA_AUDIENCE`, `IDEA_CONCEPTS`, `IDEA_WRITE`, `IDEA_REVIEW` + payloads; `IdeaPreferences` gains `genre`, `audience`, `direction`, `research` | `src/domain/jobs.ts`, `src/domain/types.ts` |
| `IdeaProposal.development` (the dossier), `Brief.development` (the intent), `Settings.research` | `src/domain/types.ts`, `updateSettings` in `src/domain/actions.ts` |
| Tables `research_cache`, `research_items`, `research_runs`, `development_artifacts` | `src/server/db/schema.ts`, `drizzle/0004_research_development.sql` |
| Artifact store (versioned, never overwritten) | `src/server/development/artifacts.ts` |
| Research module interface (bodies are placeholders) | `src/server/research/index.ts` |

Do not change these shapes without writing the change here first; additive optional fields are fine.

## 1. The pipeline

`AUTO_IDEA` becomes an orchestrator owned by the **Head of Story** (like `CREATE_CHARACTER`): it runs each stage as a
durable child job (`parentId` = the AUTO_IDEA job id, payload `ideaJobId`, idempotency key
`idea:${ideaJobId}:${stage}:${n}`), waits for it, and records the step outcome. Each child job runs as its agent
(agent run, tool calls, failure class) and writes one versioned artifact.

| # | Stage (`DevelopmentStage`) | Job | Agent (new unless noted) | Reads | Writes (artifact `content`) |
|---|---|---|---|---|---|
| 1 | RESEARCH | `IDEA_RESEARCH` | `trend-research` Trend Research Agent | request (parent payload), show context | `{ run: ResearchRunSummary }` |
| 2 | AUDIENCE | `IDEA_AUDIENCE` | `audience-research` Audience Research Agent | research artifact + items | `AudienceAnalysis` |
| 3 | CONCEPTS | `IDEA_CONCEPTS` | `creative-concept` Creative Concept Agent | analysis, continuity, preferences | `ConceptSet` (3 concepts, originality checks, choice + rationale) |
| 4 | WRITING | `IDEA_WRITE` | `screenwriter` (existing) | chosen concept, strategy, continuity | `{ proposal: IdeaProposal (without development), strategy, draft: 1 }` |
| 5 | EDITING | `IDEA_REVIEW` reviewer STORY_EDITOR | `story-editor` (existing) | draft | `StoryReview` |
| 6 | AUDIENCE_REVIEW | `IDEA_REVIEW` reviewer AUDIENCE_EXPERIENCE | `audience-experience` Audience Experience Agent | draft | `StoryReview` |
| 7 | REVISION | `IDEA_WRITE` with `draftArtifactId` + `reviewArtifactIds` | `screenwriter` | draft + both reviews | `{ proposal, strategy, draft: 2, answered: string[] }` |
| 8 | PROPOSAL | (orchestrator) | `head-of-story` (existing) | everything | `proposals` row with `proposal.development` = `DevelopmentDossier` |

Rules:
- **Revision at most once**, only when a reviewer's verdict is REVISE or a MAJOR issue exists; the revised draft is not
  re-reviewed in a loop (the dossier records both reviews against draft 1 and `revisions: 1`).
- **No blind retries.** A child job that fails with a retryable class (INFRASTRUCTURE / PROVIDER / RESOURCE_EXHAUSTION)
  retries by the queue's own policy; any other failure fails the stage. RESEARCH failing never fails the idea: it is
  replaced by a `research.status: 'UNAVAILABLE'` dossier with the reason, and the pipeline continues CRAFT_ONLY. Any
  other stage failing fails the AUTO_IDEA with that stage's failure class and message.
- `preferences.research === 'OFF'` or `settings.research.enabled === false` → stage 1 is `skipped`, research status
  `DISABLED`, analysis basis `CRAFT_ONLY`, and the proposal says "Original concept — no trend research was used".
- The orchestrator's `progress` is `{ phase: <stage lowercase>, step, total, message }` with a real message from the
  running child ("Querying YouTube mostPopular IQ/24", "Reviewing draft 1 as the audience"), never a timer.
- Result: `{ proposalId, title, steps: DevelopmentStep[] }` (like `CreateCharacterResult`).
- Handoffs: RESEARCH→AUDIENCE→… are recorded with `recordHandoff` (stage `STORY`, producer/receiver `STORY`) and the
  final proposal hands STORY → CASTING when accepted (existing accept path). Activity events per stage.

## 2. Formats (strategy per kind — `StoryStrategy`)

- **SHORT_FOCUSED** (SHORT): one clear central character, a recognisable conflict, a hook in the first shot (the first
  3–5 s give a reason to keep watching), visual storytelling over exposition, escalation, a satisfying or deliberate
  ending; scenes and dialogue scaled to the duration.
- **SHOW_SERIAL** (SHOW): premise, recurring cast and relationships, the world, a season arc, per-episode conflicts,
  progressive development, a meaningful season end; cliffhangers only when justified.
- **SEASON_CONTINUATION** (SEASON) / **EPISODE_CONTINUATION** (EPISODE): retrieve the full show history
  (`showContinuity()` — seasons, episodes, last endings, bible timeline/unresolved/relationships, locked cast & places);
  continue from the last ending; keep language, dialect, voices and identities; reuse cast and places; newcomers only
  with a story purpose; trends may inform a direction but never restart the show or bolt on unrelated plots. Research
  topics for these come from the show's genre, not from what is trending generally.
- **MUSIC_FIRST** (MUSIC_VIDEO): the concept is built from the song's actual lyrics, mood, rhythm, structure, performers
  and emotional progression; sections map to song sections; performers sing their assigned sections on screen;
  research covers music-video storytelling, performance, cinematography, visual hooks, editing rhythm.

Engagement is a first-class rubric (OPENING, CLARITY, ORIGINALITY, EMOTION, CHARACTER, PACING, CONFLICT, CURIOSITY,
VISUAL, PROGRESSION, ENDING, DIALOGUE, CONTINUITY, MUSIC_FIT). Every scene must have a purpose; no artificial twists,
constant action or manipulative retention tricks.

**Language.** Arabic and Iraqi Arabic stories are *written* in the dialect from the concept stage on (titles, hooks,
dialogue in natural Baghdadi wording with Iraqi humour and references where research reached Iraqi sources), with an
English gloss for review — never an English story translated word for word. A show's language/dialect never changes.

## 3. Research (owned by the Research engineer)

Access policy — legitimate methods only; nothing is scraped, nothing is invented:

| Priority | Platform | Access path | Credential (server env, never in the UI/logs) | Without it |
|---|---|---|---|---|
| 1 | TIKTOK | TikTok Research API (`open.tiktokapis.com/v2/research/video/query/`, client-credentials token) — approved research access only | `TIKTOK_RESEARCH_CLIENT_KEY`, `TIKTOK_RESEARCH_CLIENT_SECRET` | NOT_CONFIGURED |
| 2 | INSTAGRAM | Instagram Graph API hashtag search (`ig_hashtag_search` → `/{hashtag}/top_media`), needs a Business/Creator account | `INSTAGRAM_GRAPH_TOKEN`, `INSTAGRAM_BUSINESS_ID` | NOT_CONFIGURED |
| 3 | FACEBOOK | Meta Content Library is available to approved researchers inside Meta's own environment; no public API this studio may call | — | UNSUPPORTED (stated) |
| 4 | YOUTUBE | YouTube Data API v3 `videos.list chart=mostPopular` (regionCode, videoCategoryId 1/10/23/24) and `search.list` (`publishedAfter`, `order=viewCount`) | `YOUTUBE_API_KEY` | NOT_CONFIGURED |
| — | NEWS | GDELT DOC 2.0 API (keyless; ≤1 request / 5 s; `sourcelang`), entertainment news | — | RATE_LIMITED/FAILED recorded |
| — | WIKIPEDIA | Wikimedia pageviews `top` per day for en/ar Wikipedia (measured attention), classified with Wikidata P31 (film, TV series, anime, song, music video, album…) | — | FAILED recorded |

Verified from this machine on 2026-10-02: Wikimedia pageviews 200, Wikidata 200, YouTube Data API 403 without a key,
GDELT reachable (429 when called faster than its limit), TikTok Research API requires credentials.

Behaviour:
- **Topic planning** (deterministic first, LLM optional): from kind, genre, language/dialect → region (`IQ` for Iraqi,
  `SA/EG/AE` for other Arabic, `US/GB` for English), audience, duration, preferences and the show's identity; at most
  ~6 queries per run; each topic records why it was chosen.
- **Cache**: key = sha256(provider + query + language + region). TTLs: platform charts 12 h, news 24 h, Wikipedia
  daily lists 24 h (`settings.research.cacheHours` overrides 1–168 h). Unexpired entries are reused (coverage status
  CACHED, `reusedFromCache` counts items); `refresh: true` bypasses. Item rows are upserted by (platform, url).
- **Recency**: news ≤ 14 days, charts as of the fetch; an item older than its window is never presented as trending.
- **Items** keep: platform, provider, URL, title, publishedAt, retrievedAt, category, language, region, only the
  metrics the source returned, ≤200-character self-description. No transcripts, lyrics or reproduced posts.
- **Rate limits & timeouts**: per-provider spacing (GDELT 5 s), 15 s timeout per call, honest User-Agent, `AbortSignal`.
- **Coverage** for every platform in priority order, every run — including UNSUPPORTED/NOT_CONFIGURED/DISABLED/SKIPPED
  with a one-sentence reason. Run status: COMPLETE / PARTIAL / UNAVAILABLE / DISABLED.
- **API**: `GET /api/research/sources` (ResearchSourceStatus[] — configured or not, no secrets),
  `GET /api/research/runs/:id` (summary + items), `GET /api/development/:ideaJobId` (artifacts of one idea, for the
  review page).

## 4. Story development (owned by the Story Development engineer)

- Orchestrator in `src/worker/handlers/development.ts` (AUTO_IDEA + the five stage handlers), prompts/strategies/
  rubric/originality in `src/server/story/development/`. The old single-prompt `proposeIdea` stays only as the writer's
  output schema and the cast/location resolution (reuse, don't duplicate), not as the Auto Idea path.
- Audience analysis: every pattern cites evidence ids that exist in the run; any number in `measured` must appear in a
  cited item's metrics (checked in code, a pattern that fails is downgraded to interpretation-only); views ≠ quality is
  stated in `cautions`.
- Concepts: 3 distinct concepts; originality check in code against every research item title (normalised token
  similarity) and a rule that no source title, creator name or franchise appears in the concept; a failing concept
  is not chosen; the choice rationale names the patterns it uses.
- Reviews: structured rubric per §2; a MAJOR issue or REVISE verdict triggers the single revision.
- Accept path: `acceptProposal` copies a `DevelopmentIntent` (audience, tone, hook, ending, strategy, ideaJobId) into
  `Brief.development`; DEVELOP_STORY / WRITE_SCRIPT / PLAN_SHOTS prompts include it as fixed intent ("do not change the
  hook, tone or ending"). Video agents never rewrite story (they already render shots from the plan).
- Org: add agents `trend-research`, `audience-research`, `creative-concept`, `audience-experience` to STORY (rename the
  old `creative-research` into `trend-research` or keep it as the reference collector — one responsibility each),
  JOB_AGENT mapping (`IDEA_REVIEW` reviewer AUDIENCE_EXPERIENCE → `audience-experience`, STORY_EDITOR →
  `story-editor`), tools (`research.plan_topics`, `research.query_source`, `research.store_evidence`,
  `story.structured_answer` exists), skills as `skills/<name>/SKILL.md`, bump `ORG_VERSION`.
- Engine: local `qwen3:14b` through the existing LLM provider (`json()` with zod schemas); temperature per stage
  (concepts high, reviews low); `maxTokens` sized; the 600 s story tool timeout applies.

## 5. Interface (owned by the Frontend engineer)

- Auto Idea start stays one action: kind → "Develop an idea" with no required fields. Optional preferences, collapsed:
  genre, language/dialect (locked to the show's for seasons/episodes, shown as such), audience, duration, style, mood,
  cast, locations, creative direction, and "Use trend research" (on by default when Settings allow; shows which
  platforms are reachable from `GET /api/research/sources`).
- Progress: the eight stages as a vertical stepper driven only by the real child jobs (`parentId`/`payload.ideaJobId`)
  and the orchestrator's progress message; each step names its agent, shows its live message, its outcome (done /
  skipped with reason / failed with the failure copy and Retry), and elapsed time. No simulated percentages.
- Review: the existing editable proposal (title, logline, premise, structure, cast, places, song) plus a "How this was
  developed" panel: research coverage per platform in priority order (status chip + reason), the sources (platform,
  title as a link opening in a new tab, published/retrieved dates, the source's metrics), the patterns (measured vs
  interpretation clearly separated, confidence), the three concepts with the chosen one and why, the two reviews
  (scores, issues, what the revision answered). Original-only ideas say so plainly.
- Settings: a Research section — on/off, per-platform switches with their access status, cache hours.
- EN + AR (RTL) for every string; phone width; reduced motion.

## 6. Acceptance (browser, real engines)

Short (EN), show (Iraqi AR), season continuation, episode continuation, music video; each: stages visibly ran as
agents, dossier present with coverage for all six platforms, sources link to real URLs with dates, no invented
metrics (every number traceable to an item), reviews present, story coherent with continuity (cast/places/language
kept), one proposal accepted and produced to video for story-to-video consistency. Unavailable-platform fallback:
TikTok/Instagram/YouTube NOT_CONFIGURED and Facebook UNSUPPORTED on this machine, recorded and continued; research OFF
gives an explicitly original concept. Subjective quality is reviewed by an independent creative review and the
producer — an API success is not proof a story is engaging.

## 7. Ownership (worktrees)

| Engineer | Owns | Must not edit |
|---|---|---|
| Research | `src/server/research/**`, `src/app/api/research/**`, `tests/unit/research-*.test.ts`, `docs/research/TREND-SOURCES.md`, `.env.example` research block | domain files, worker handlers, components |
| Story Development | `src/worker/handlers/development.ts`, `src/worker/handlers/index.ts` (registration), `src/worker/handlers/story.ts` (remove old autoIdea), `src/server/story/development/**`, `src/server/story/engine.ts` (intent in prompts), `src/domain/proposals.ts` + `acceptProposal` intent copy, `src/server/org/model.ts`, `skills/**` new skills, `src/app/api/development/**`, `tests/unit/development-*.test.ts` | research module internals, components |
| Frontend | `src/components/wizard/**`, `src/components/development/**`, settings page research section, `src/lib/i18n.ts`, `src/studio/api.ts` (fetchers), `tests/e2e/auto-idea.spec.ts` | server code |

Integration order: Research → Story Development → Frontend, then QA in the browser and the independent review.
