# Contract — Redesign backend (v1, 2026-10-03)

The backend items of docs/DESIGN-SYSTEM-V5.md §11.6 ("Backend follow-ups"), §6.7, §8.11 and §8.12, as page engineers
can code against them. Nothing here generates media, uses the GPU or changes how generation works; generation stayed
paused while this was built (intake paused, worker and inference containers stopped). Every existing contract and
reducer rule is kept; what is new is additive.

Migration: `drizzle/0012_redesign_backend.sql` (after B1's 0011) — `cut_notes` table; `takes.rating`,
`rating_reason`, `rated_by`, `rated_at`; `agent_runs.phases`; `assets.thumb`; `productions.frame_poster_asset_id`.
Applied on the copy `vewbox_b2`; apply on the studio with
`pnpm exec tsx --env-file=.env --env-file=.env.local src/server/db/cli.ts migrate` (a running dev web process does not
pick a new migration up).

Conventions: times are ISO strings; ids are the studio's `nid()` ids; every refusal is a `StudioError` with a code
(`INVALID` → 400, `NOT_FOUND` → 404, `CONFLICT` → 409) and a sentence a page can show.

---

## B8 — One source of truth for decisions

**Selector** `waitingDecisions(state, pipeline, jobs): Decisions` — `src/studio/selectors/decisions.ts` (pure; the
shell's `src/components/shell/decisions.ts` re-exports it, so F4's `Shell.tsx` reads the same function; the server runs
it in `src/server/studio/decisions.ts`).

```ts
type DecisionKind = 'stage' | 'image' | 'line' | 'take' | 'pass' | 'character';
interface DecisionSubject { productionId?; stage?; characterId?; shotId?; lineId?; takeId?; jobId? }
interface Decision { kind: DecisionKind; id: string; title: string; titleAr?: string; subject: DecisionSubject; since: string | null; href: string }
interface Decisions { items: Decision[]; count: number; complete: boolean }   // complete=false while the pipeline is unknown
decisionCounts(d): Record<DecisionKind, number>
```

| kind | what waits | subject | since | href (decide it here) | id |
|---|---|---|---|---|---|
| `stage` | a pipeline gate `AWAITING_APPROVAL` (STORY, EDIT) of an unfinished production | productionId, stage | the handoff's `at` | `/production#needs-you` | `stage:{production}:{stage}` |
| `image` | a draft canonical image the producer can approve now (not locked, nothing redrawing) | characterId | `canonicalImage.generatedAt` | `/characters/{id}` | `image:{character}` |
| `line` | a dialogue line to hear again: recorded by a `DIALOGUE_AUDIO` (or `GENERATE_TAKE`) job in `AWAITING_REVIEW`, whose recording's `provenance.check` is `null` (not heard back) or `ok: false` (drifted) | productionId, shotId, lineId, characterId, jobId | the job's finish | shot workspace `{productionHref}/shots/{shotId}` | `line:{job}:{line}` |
| `take` | a take with a REVIEW verdict (`GENERATE_TAKE` awaiting review with `result.takeUnverified`) | productionId, shotId, takeId, jobId | the job's finish | shot workspace | `take:{job}:{take}` |
| `pass` | a production pass parked for review (`PRODUCE` awaiting review) | productionId, jobId | the job's finish | production map `{productionHref}/production` | `pass:{job}` |
| `character` | a `CREATE_CHARACTER` run awaiting review — unless its draft image is already an `image` item, or the identity was approved or locked by use since (nothing left to decide) | characterId, jobId | the job's finish | `/characters/{id}` | `character:{job}` |

`title` is the production's title (`song.title` for a music video), the character's name, or `Speaker: “line”`;
`titleAr` when the record has Arabic. Items are in that order: gates, images, then the review jobs oldest first. A
`DIALOGUE_AUDIO` job whose recordings were replaced since still counts once (`line:{job}`, on the production map), so
nothing is lost.

**Route** `GET /api/decisions` → `Decisions & { at: string }` (no-store). Server inputs: the authoritative state,
`pipelinePositions()` of every production, `listJobs({ activeOnly: true, limit: 500 })` (active + AWAITING_REVIEW).
The shell's inputs are its snapshot, `/api/studio/org/pipeline` and its job list (the newest 300, kept live by the
event stream): the same records, so the count is identical. On the studio of 2026-10-03 the count is **5**: Hana Mori's
image, Salam's image, two lines of The Static Sky to hear again, and its first production pass (the design's "4"
counts the two lines as one; the selector counts lines, as asked).

Tests: `tests/unit/decisions.test.ts` (the real `result` shapes of the handlers, recordings with their `check`),
`tests/unit/f4-decisions.test.ts` (unchanged, still passing).

---

## B5 — Take judgement

**Fields** (`Take`, `takes`): `rating?: 'GOOD' | 'REJECTED'`, `ratingReason?: string`, `ratedBy?: string`,
`ratedAt?: string`. Apart from `status` (`READY | REJECTED`, the inspectors' verdict and the older `rejectTake`).

**Command** `rateTake(productionId, shotId, takeId, rating: 'GOOD' | 'REJECTED' | null, opts?: { reason?: string (≤ 1000); by?: string (≤ 80) })`
— zod-validated like the character commands (`INVALID` names the field). Rules:
- `REJECTED` keeps the take, its file and its provenance (never deletes), records reason/by/when, and deselects the
  take if it was the shot's choice; `GOOD` records the judgement; `null` withdraws it (all four fields cleared).
- `selectTake` refuses a take whose `rating` is `REJECTED`: *"This take was rejected (reason); a rejected take cannot
  be chosen for the cut."* (`INVALID`, `details.by: 'rating'`); a `status: REJECTED` take is still refused as before.
- A `status: REJECTED` take cannot be rated `GOOD` (*"…it cannot be called good."*); it can be rated `REJECTED`.
- The same judgement again changes nothing (no version bump). `ratedBy` defaults to `producer`.

Persist/snapshot: `takeRow` ↔ `takeFromRow` (round-trip tested); the DB round trip was run on `vewbox_b2` through the
command engine. `takeExpectations` (B9) leaves `rating: REJECTED` takes out.

---

## B6 — Quality tier

`GENERATE_TAKE` payload accepts `quality?: 'draft' | 'final'`. Every take the worker makes records
`params.quality: 'final'`; a `draft` request is recorded as `params.qualityRequested: 'draft'` and a job event says it
was made at final quality. **There is no draft path**: the local MiniMax H3 workflow has one tier (the official
template — turbo LoRA, 4 or 8 steps — which is the standard path, not a faster variant of it) and the hosted API has
none, so none was invented. Takes made before this have no `params.quality`; read absent as `final`.
Pure rule: `takeQuality()` in `src/worker/handlers/take.ts`.

---

## B9 — Phase events per run, and expectations

**Phases** (`src/domain/phases.ts`): `RunPhase = 'QUEUED' | 'PREPARING' | 'GENERATING' | 'CHECKING' | 'FINISHING'`;
`RunPhaseEvent { phase, at, message? }`. `runPhaseOf(status, progress.phase)` maps every progress report (QUEUED;
PREPARING incl. the `recording` of lines; GENERATING = GENERATING + DOWNLOADING; VALIDATING → CHECKING;
POSTPROCESSING → FINISHING). `runPhaseLabel(jobType, phase)`: for a take GENERATING reads **Filming**, PREPARING
**Preparing references** (Recording for voice jobs, Drawing for pictures, Rendering for the cut).
`phaseDurations(events, endAt)` gives each phase's ms.

**Record**: `agent_runs.phases: RunPhaseEvent[]` — `startRun` writes `QUEUED` (the job's creation, or the retry's
`runAfter`) and `PREPARING` (the claim); the worker appends on every change (`recordRunPhase`) and writes a studio event
`kind: 'RUN_PHASE'` (`data: { phase, label, shotId, runId, attempt }`) — every job type, so every `GENERATE_TAKE` run has
them. Readers: `AgentRunRow.phases` (the org routes already return runs), `runPhasesOf(jobId)` in
`src/server/org/runs.ts` (newest attempt first). Activity feeds should filter `RUN_PHASE` out of the human list.

**Expectations** (`src/studio/selectors/expectations.ts`, pure over `Production`):
```ts
takeExpectations(p, { shotId? }): { count; medianGenerationMs: number | null; lastGenerationMs: number | null; byModel: Array<{ model; count; medianGenerationMs }> }
expectationsByModel(productions): ModelExpectation[]
```
Accepted takes only: `status READY`, not `rating REJECTED`, not a bundled sample, `generationMs > 0`. Empty is `null`,
never a guess. ("takes here took about 3 min" = `medianGenerationMs`; "last take took 2 min 50 s" = `lastGenerationMs`.)

---

## B2 — Screening Room notes

**Table** `cut_notes`; **type** `CutNote` (`src/domain/types.ts`):
```ts
interface CutNote { id; productionId; cutAssetId?; cutVersion?; timecode: number /* s */; rangeEnd?: number; pin?: { x; y } /* 0–1 */; drawingAssetId?; text; author; status: 'open' | 'resolved'; sentToShotId?; producedTakeId?; createdAt; updatedAt }
```
Notes live beside the studio state (not in it, not in the state hash): `GET /api/studio` now returns `notes: CutNote[]`
(`SnapshotResponse.notes`), and every change notifies the studio change feed (origin `notes`) and writes an activity
event (`NOTE_ADDED | NOTE_UPDATED | NOTE_RESOLVED | NOTE_REOPENED | NOTE_SENT_TO_SHOT | NOTE_REMOVED`, department POST).

**Functions** (`src/server/studio/notes.ts`) and **routes**:

| call | route | body → answer |
|---|---|---|
| `listNotes({ productionId?, cutAssetId?, status? })` | `GET /api/notes?productionId=&cutAssetId=&status=open\|resolved` | `{ notes }` in timecode order |
| `addNote(NewNote)` | `POST /api/notes` | `{ productionId, cutAssetId?, cutVersion?, timecode, rangeEnd?, pin?, drawingAssetId?, text (1–4000), author? }` → 201 `{ note }`. `cutAssetId` defaults to the production's current cut and must be one of its cuts (`INVALID` otherwise); `cutVersion` is derived from the cut history when not given; a drawing must be a stored picture |
| `getNote(id)` | `GET /api/notes/{id}` | `{ note }` |
| `updateNote(id, NotePatch)` | `PATCH /api/notes/{id}` | `{ timecode?, rangeEnd?: n\|null, pin?: {x,y}\|null, drawingAssetId?: id\|null, text? }` (strict) → `{ note }` |
| `resolveNote(id, resolved = true)` | `POST /api/notes/{id}/resolve` | `{ resolved?: boolean }` → `{ note }` |
| `deleteNote(id)` | `DELETE /api/notes/{id}` | open and never sent only (`CONFLICT` otherwise) → `{ ok: true }` |
| `sendNoteToShot(id, shotId, { by? })` | `POST /api/notes/{id}/send-to-shot` | `{ shotId, by? }` → `{ note, shot }` |

*Send to shot* appends one line to the shot's `notes` through the ordinary `updateShot` command (so the browser's
copy, the history and the server agree): `Screening note at 00:51 (cut 3), producer: …` (range as `00:51–00:53`), records
`sentToShotId`, and **does not generate**. Sending the same note to the same shot again changes nothing. When a take is
later made for that shot, the take handler records it on every open note sent there (`producedTakeId`;
`recordProducedTake`). Pure helpers for pages: `timecodeText`, `noteLine`, `appendNoteToShotNotes`.

Tests: `tests/unit/cut-notes.test.ts` (contracts, row shape, the line); the database paths were run on `vewbox_b2`
(add → update → send → re-send unchanged → produced take → delete refused → resolve → wrong cut refused → cleanup).

---

## B3 — Cut versions

**Selector** `cutVersionsOf(production, assets): CutVersion[]` — `src/studio/selectors/cuts.ts` (pure; derived from the
assets ASSEMBLE already stores; nothing duplicated).
```ts
interface CutVersion { version: number /* 1-based, oldest first */; assetId; asset; current: boolean; createdAt; durationSeconds?; width?; height?; poster?: string; shots: number; shotIds: string[]; subtitleAssetIds: string[]; jobId? }
currentCutVersion(p, assets): { version, of } | null      // "Cut 3 of 3"
isCutOf(p, asset): boolean
```
A cut of the production is the current `cutAssetId`, or a DERIVED video tagged `cut` (not `export`) whose
`provenance.shots[].shotId` names a shot of the production. Subtitle sidecars are the SUBTITLE assets with
`provenance.for === cut.assetId`. On the copy: The Static Sky has 3 versions, the third current, each with 4 sidecars.

---

## B7 — Presentation additions, thumbnails, frame poster

**Presentation** (`src/domain/presentation.ts`) gains `portraitFocal?: { x, y }` (the point a 2:3 crop keeps when it
differs from `focal`) and `rtlFrameAssetId?: string` (the picture to show instead in an RTL interface). Both are set by
the producer or the poster step, never measured; absent means `focal` → `DEFAULT_FOCAL`, and the same picture.

**Thumbnails.** `Asset.thumb?: { src: string; path: string; width; height; bytes }` (`assets.thumb` jsonb without
`src`). A JPEG beside the original in the library (`…/{assetId}.thumb.jpg`): long side ≤ 960 px (2× of 480), never
upscaled; ≤ 120 KB for a figure (a character picture: `tier` set, a character tag, or taller than wide) and ≤ 160 KB for
a still; transparency flattened onto the measured edge colour. `src` is `/api/media/{id}?thumb=1` — the media route
serves the derivative when it exists and **falls back to the original** otherwise, so an `<img>` never breaks on an
older picture; pages should still prefer `thumb.src` only when present. Made at ingest for every picture
(`storeBuffer`/`adoptFile`, never failing the ingest) and by the backfill for older ones. `updateAsset` accepts `thumb`.
Removing an asset removes its thumbnail with it. Rules and maths: `src/server/media/thumbs.ts` (`THUMB_RULES`,
`thumbSize`, `isFigureLike`, `portraitCrop`, `posterSize`).

**Frame poster.** `Production.framePosterAssetId?: string` (`productions.frame_poster_asset_id`): a DERIVED IMAGE asset
(tags `poster`, `frame-poster`; `provenance.kind: 'FRAME_POSTER'`, `from`, `shotId`, `takeId`, `sceneNumber`,
`shotNumber`, `source`, `crop`, `focal`) — the production's best frame cropped 2:3 around the focal point, at most
960×1440, no text: the page renders the title and the readout ("Frame poster · shot 2.1"). It is made only for a
production with no key art (`posterAssetId`); key art always wins: `posterOf(p, assets)` → `{ asset, kind: 'KEY_ART' |
'FRAME_POSTER' } | null`. The best frame (`bestFrameFor(p, assets)`, `src/studio/selectors/poster.ts`) is the selected
take's poster frame of the first shot of the last scene — taken from the take's video at its native size — else the
first opening frame. The producer's own choice of frame is not wired yet (set `framePosterAssetId` to another derived
poster, or clear it and re-run the backfill after setting `portraitFocal` on the frame).

**Backfill** `scripts/presentation-backfill.ts` — prints the database first, **refuses `vewbox`** unless
`--allow-vewbox`, `--expect-db <name>`, `--dry-run`, `--only presentation|thumbs|posters`, `--verbose`. Three
idempotent passes (presentation → thumbs → posters); originals are read-only. On `vewbox_b2`: 57 thumbs made (11
figures, 46 stills, largest 93 KB), 1 frame poster (512×768 from the native 1344×768 frame of shot 2.1); the second run
made 0 and wrote nothing; every original's size and SHA-256 unchanged.

Tests: `tests/unit/thumbs.test.ts` (rules, crop maths, best frame, and two real ffmpeg encodes against the budgets).

---

## Files

- Domain: `src/domain/types.ts` (Take rating fields, `AssetThumb`, `CutNote`, `Production.framePosterAssetId`),
  `src/domain/presentation.ts`, `src/domain/phases.ts`, `src/domain/actions.ts` (`rateTake`, `selectTake`),
  `src/domain/commands.ts`, `src/domain/jobs.ts` (`quality`).
- Selectors (pure, shared): `src/studio/selectors/decisions.ts`, `cuts.ts`, `expectations.ts`, `poster.ts`.
- Server: `src/server/db/schema.ts`, `src/server/studio/{snapshot,persist,notes,decisions}.ts`,
  `src/server/org/runs.ts` (phases), `src/server/media.ts` (thumb at ingest), `src/server/media/thumbs.ts`.
- Worker: `src/worker/index.ts` (phase events), `src/worker/handlers/take.ts` (quality, produced take on notes).
- Routes: `GET /api/decisions`, `/api/notes`, `/api/notes/{id}`, `/api/notes/{id}/resolve`,
  `/api/notes/{id}/send-to-shot`, `GET /api/media/{id}?thumb=1`, `GET /api/studio` (+`notes`).
- Shell: `src/components/shell/decisions.ts` (re-export), `palette.ts` (the new kinds), i18n keys
  `shell.palette.kind.review`, `shell.palette.decide.{line,take,pass}`.
- Tests: `tests/unit/{take-rating,run-phases,cut-notes,cut-versions,decisions,thumbs}.test.ts`.
