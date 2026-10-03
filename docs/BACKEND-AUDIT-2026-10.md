# Backend audit and redesign plan — 2026-10 (phase 1)

Scope: `src/server/**`, `src/worker/**`, `src/domain/**`, `src/studio/**`, `src/app/api/**`, `drizzle/**`, `compose.yaml`,
`docker/**`, `scripts/**`, `tests/unit`, `tests/e2e`, `tests/worker`. Every claim below was read in the code on `main`
(3d11958; no backend change since 0e8bf44). Line numbers are `file:line` on that commit. No source file was edited; the
`vewbox` database was only read (one read-only transaction: row counts, sizes, job statuses).

**Baseline on main (read only):** `npx tsc --noEmit` → exit 0, no errors. `npx vitest run` → 104 files, 1049 tests,
all passed (14 s). `tests/worker` and `tests/api` were not run: they write to the live database (finding C3).

**Scale today (measured):** 1 production, 8 shots, 15 takes, 5 characters, 146 assets, 73 jobs, 435 studio events;
`studio_meta.version` = 2026; intake paused since 2026-10-03 11:39 UTC. The design flaws below are latent at this size
and grow linearly with the studio.

---

## 1. Architecture map (as it is)

```
Browser ─ src/studio/store.tsx: a full StudioState copy, the SAME reducers (src/domain/actions.ts) applied optimistically
  │ GET /api/studio (whole state + notes)   POST /api/commands (batch of named reducers)   SSE /api/events
  ▼
Next.js 16 — 33 route files under src/app/api, src/proxy.ts (Basic auth only if STUDIO_PASSWORD is set)
  │ applyCommands  (src/server/studio/engine.ts:20)
  │   pg_advisory_xact_lock('vewbox-studio')  →  loadSnapshot: 12 full-table reads (snapshot.ts:77-91)
  │   →  runCommand × n (pure reducers, 62 commands)  →  persistState: hash every row, diff, write (persist.ts:39)
  │   →  studio_meta.version++  →  NOTIFY vewbox_studio  →  every tab refetches the whole state (store.tsx:172-177)
  │ enqueue (src/server/jobs/queue.ts:38)  →  jobs row (+ idempotency key)  →  NOTIFY vewbox_jobs
  │ some routes do real work inline: uploads ffprobe/decode (media.ts:156), voice reference → ASR on the GPU
  ▼
Postgres 17 — 38 tables, migrations 0000–0013 (drizzle-kit generated; applied on boot by web AND worker)
  studio "document": shows seasons productions scenes shots takes characters character_usage locations assets
                     settings studio_meta            (large JSON columns: voice, refs, beats, dialogue, brief, qa, params)
  queue:             jobs job_events
  org + audit:       departments agents tools skills (synced from code each boot) agent_runs studio_events handoffs
                     qa_reports approvals reliability_events metrics models workflows
  append-only:       world_revisions world_pins world_reads audio_timelines continuity_versions cut_notes proposals
                     research_cache research_items research_runs development_artifacts
  ▲
Worker — one tsx process (src/worker/index.ts), poll 1.5 s, lease 90 s, heartbeat 20 s
  lanes: HOSTED 4 · LLM 2 · CPU 2 · GPU 1 · ORCHESTRATION 6 (index.ts:35-41; queue.ts:29-31)
  26 job types → handlers (handlers/index.ts:53) running "as an agent": ctx.tool (allow-list, contract, timeout race),
  ctx.delegate (child agent_runs), ctx.gpu (in-process family lease, gpu.ts), ctx.progress (lease-fenced job row)
  results: command()/commands() (same global lock + full snapshot) + direct inserts (qa_reports, handoffs, world_*, …)
  orchestrators (PRODUCE, CREATE_CHARACTER, AUTO_IDEA) enqueue children and poll them every 3–5 s
  ▼
Engines — MiniMax hosted (no key on this machine) · ComfyUI :8188 (Qwen-Image, FLUX.2 klein, MiniMax H3, ACE-Step,
  MiniMax Music 3) · tts :8020 · tts-habibi :8021 · tts-design :8022 · asr :8030 · Ollama :11434 — one RTX 5090
Files — LIBRARY_ROOT/{kind}/{yyyy}/{mm}/{assetId}.{ext} (+ .thumb.jpg), served by /api/media/[id] (Range, id → row → path)
```

**Is the studio state one big JSON document?** Not in storage — it is normalised into rows — but it *behaves* as one
document: every command, every worker write and most reads assemble the entire studio in memory, run a reducer over
the whole `StudioState`, and diff it back (engine.ts:23-49). The browser holds and re-downloads the whole thing. The
real aggregate boundaries (a production with its scenes/shots/takes; a character with its voice; a location; an asset)
exist only as nesting inside that document. Everything outside the snapshot (jobs, runs, world, notes, research, QA,
approvals) is written directly, with its own ad-hoc consistency.

**What is good and should be kept:** Postgres as the single broker and source of truth; `FOR UPDATE SKIP LOCKED`
claims with leases and lease-fenced job-row writes (queue.ts:148-243); idempotency keys on enqueue; provider task
resume for takes (take.ts:281, comfy.ts:285-305); append-only world/research/development tables; pure, well-tested
reducers; paths built only from server-minted ids (media.ts:33-63); typed tool contracts (org/contracts.ts); explicit
human gates; rich take provenance (take.ts:407-411).

---

## 2. Findings, ranked

Severity: **Critical** = can lose or corrupt production data today; **High** = breaks a reliability requirement or
is an exploitable exposure; **Medium** = cost, drift or an operational trap; **Low** = hygiene.

### Critical

**C1 — A worker that lost its lease still writes results.** Fencing covers only the `jobs` row (queue.ts:179-188);
domain writes go through `command()` with no lease (engine.ts:60-65). GENERATE_TAKE adds assets, the take and selects it
(take.ts:409-420), ASSEMBLE sets the cut (assemble.ts:168), EXPORT records the export (assemble.ts:195) — all before the
fenced `complete()` discovers the loss (worker/index.ts:95-99). *Impact:* after a stall > 90 s the old and the new
attempt both add a take / cut / voice identity; duplicate MiniMax cost; a wrong take selected. *Fix:* a fenced
result commit: worker writes carry `{jobId, leaseToken}` and the command transaction re-checks the lease
(`select … from jobs where id=$1 and lease_token=$2 for share`) before applying (step 5).

**C2 — Result commits are neither atomic nor idempotent.** Files are adopted into the library first, then the poster
asset, the video asset, the take and the selection are four separate transactions with random ids
(take.ts:389-420; assemble.ts:130-147; voice/music/images follow the same pattern). *Impact:* a crash between them
leaves orphan files/assets; the retry re-runs and records a second take ("Take 3" and "Take 4" of one request).
*Fix:* one batch per job attempt with ids derived from `(jobId, output name)`; a re-run finds them and returns (step 6).

**C3 — Tests and the reset endpoint can wipe the producer's studio.** The browser suite resets the shared database
before every test (tests/e2e/helpers.ts:16-17, 39) against `http://localhost:4200` with `reuseExistingServer: true`
(playwright.config.ts:34); `kind:'empty'` needs no fixture flag (src/app/api/studio/reset/route.ts:20) and deletes
every non-sample library file (route.ts:22-26). Worker tests load `.env` (DATABASE_URL = `vewbox`,
vitest.worker.config.ts:7-15) and **claim and complete real queued jobs** (tests/worker/queue.test.ts:28-34).
*Fix:* a test database (`vewbox_test`) enforced in code: reset and the test configs refuse a database named `vewbox`;
reset needs `STUDIO_ALLOW_RESET=1` (step 1).

**C4 — Destructive reducers silently cascade-delete takes.** `replaceScript` drops every shot of a scene not in the new
list, takes included (domain/actions.ts:153-158); DEVELOP_STORY calls it whenever no scene has written lines
(worker/handlers/story.ts:185-186 — a music video's scenes never do), with new random scene ids (story.ts:181), and the
guard is computed from a read taken before a multi-minute LLM call. `deleteShot` / `deleteScene` / `deleteProduction`
(actions.ts:205, 147, 94) do the same; the take rows go by FK cascade (schema.ts:122) and the diff saver
(persist.ts:166-173). Asset rows and files of those takes stay as orphans; `character_usage` keeps pointing at them.
*Impact:* paid, verified takes disappear on a re-run or a click; provenance is broken. *Fix:* takes are never
hard-deleted — `deleted_at` tombstones; structural reducers refuse when a shot has takes unless `force` and then
tombstone; FK `RESTRICT` (step 10).

### High

**H1 — Open by default, with an unrestricted write API.** `STUDIO_PASSWORD` defaults to empty (env.ts:16,
compose.yaml:14; proxy.ts:19 lets everything through), the web port is published on all interfaces (compose.yaml:81;
`next dev -p 4200` also binds all), and `POST /api/commands` accepts all 62 reducers (commands.ts:11-28) — including
the worker-only ones `addTake`, `setCut`, `recordExport`, `setVoiceIdentity`, `setCanonicalImage`, `addAsset` with an
arbitrary `provenance.path`/`thumb.path` (persist.ts:28-30) — with argument schemas for only 16 of them
(commands.ts:138-155; the route only checks the name, src/app/api/commands/route.ts:18-27). The client also chooses
ids and timestamps (`seed`, `at`, commands/route.ts:11). Anyone on the
LAN can empty the studio, forge provenance or approve a stage. Path traversal on `/api/media` is **not** possible: the
id is pattern-checked (media.ts:33-37) and paths are confined to the root (media.ts:48-59); a forged asset can only
point at another library file. *Fix:* split commands into `CLIENT_COMMANDS` and system commands (system only
in-process); schema for every client command; server-minted ids/clock; bind 127.0.0.1 by default; refuse to start
on a non-loopback bind without a password (step 2).

**H2 — Whole-studio read-modify-write on every command.** `applyCommands` serialises every writer in the system behind
one advisory lock (engine.ts:17, 24), loads all 12 studio tables (snapshot.ts:77-91), canonical-hashes every row
(snapshot.ts:94, persist.ts:12) and diffs it back. `readState()` reads the same 12 tables on up to 8 pool connections
outside any transaction (engine.ts:87-90 → snapshot.ts:77 default `db()`), so a reader can see a torn state. Workers
call `readState()` 2–14 times per handler (images.ts 14, story.ts 11) and each worker command makes every open tab
re-download the whole studio (store.tsx:172-177). *Impact:* O(studio) per write, a single global write queue, torn
reads. *Fix:* per-aggregate repositories with optimistic versions; production-scoped loads; read APIs per aggregate
(steps 11–13).

**H3 — Lost updates from stale whole-value writes.** Workers compute full field values from a read taken minutes
earlier and write them unconditionally: the show bible (story.ts:82), the production's `castIds`/`locationIds`
(story.ts:182), the show's cast (story.ts:188), the take number (take.ts:395, so two concurrent takes of a shot are both
"Take N"). A producer's edit made meanwhile is overwritten. *Fix:* intent commands (`addCastMember`) plus
`expectedVersion` compare-and-set on the aggregate (step 11).

**H4 — Queue: poison loops, stuck cancellations, races.** `claim` reclaims a stale job whatever its attempts
(queue.ts:154-166: no `attempts < max_attempts`), so a job that kills the worker (OOM, a 1 GB `maxBuffer`,
assembly-joins.ts:43) is retried forever. A running job whose cancel was requested and whose worker died is excluded
from `claim` (queue.ts:161) and nothing else finalises it: it stays "running" forever. `requestCancel` reads, then
updates `where status='QUEUED'`; if a worker claims in between, neither branch sets the flag (queue.ts:113-122).
`ONE_PER_CHARACTER` is check-then-insert with no unique index (queue.ts:45-48). *Fix:* step 3.

**H5 — No job deadline and no real cancellation.** Agent `limits.timeoutMs` is enforced only by CREATE_CHARACTER
(character.ts:75; elsewhere it is only synced for display, org/registry.ts:105). The tool timeout is a `Promise.race` that leaves the work
running (org/tools.ts:36-40) — under `ctx.gpu` this releases the GPU lease while ComfyUI is still rendering. The ffmpeg
wrapper takes no AbortSignal (media/ffmpeg.ts:16-22) and at least ten `execFile` calls have no timeout (sync.ts:41,
assembly-joins.ts:36,43, image-check.ts:41, voice-check.ts:89, assembly.ts:152,161, media.ts:91,111). A hung child
heartbeats forever (worker/index.ts:56), so the job is never reclaimed and its lane slot is lost. *Fix:* `ctx.signal`
(job deadline + cancel) threaded into every provider, ffmpeg and fetch call (step 4).

**H6 — A transient database error cancels the job.** Any heartbeat failure sets `cancelRequested` (worker/index.ts:56);
the handler then stops at its next checkpoint and the job is recorded CANCELLED, not retried (index.ts:111-115).
*Fix:* only a lease CONFLICT stops the attempt; other errors back off and retry the heartbeat (step 3).

**H7 — The GPU budget is not actually enforced.** The lease is a module variable in one process (worker/gpu.ts:18-33):
a host worker plus the compose `worker` service, or a web route that transcribes on the GPU (voice reference:
src/app/api/characters/[id]/voice-reference/route.ts:76 → studio/voice-reference.ts:4), bypass it. Only TTS and ASR
register unloaders (handlers/voice.ts:39-41); `comfy.free()` is never registered; the LLM lane (Ollama, `keep_alive 2m`,
providers/llm.ts:60) is outside the lease. Same-family requests join a held lease while other families wait
(gpu.ts:24-26), so a stream of VIDEO work starves ASR/TTS. Prior audit C9 (docs/research/REPOS-AND-ORCHESTRATION.md:252)
is still open. *Fix:* a database-backed GPU lease with FIFO admission and unloaders for every engine (step 8).

**H8 — Restarted GPU jobs generate twice.** Only GENERATE_TAKE resumes its provider task (take.ts:281). Image, people
and music graphs are submitted with neither `promptKey` nor `resumePromptId` (images.ts:71, people.ts:46, music.ts:79)
although comfy.ts:285-305 supports both. *Fix:* `promptKey: \`${job.id}:${label}\`` everywhere (step 7).

**H9 — Approvals are not bound to what was approved.** `requireApproval` checks the latest approval row for
(production, stage) only (org/gates.ts:15-27). A redeveloped story, a replanned scene or a re-selected take keeps the
old STORY/EDIT approval; EXPORT renders the *current* selection (assemble.ts:193) under an approval given to an earlier
cut. The approver is free text from the client (src/app/api/studio/org/productions/[id]/route.ts:35). *Fix:* approvals record the
subject's content hash/version; the gate compares it (step 9).

**H10 — Command submission is not idempotent.** After a network error the store re-sends the in-flight batch
(store.tsx:141-147). If the first POST had committed, the batch is applied again (or fails as a whole with CONFLICT
when an id repeats). There is no command journal. *Fix:* `command_log` keyed by `(client_id, batch_id)`; a replay
returns the stored result (step 9).

### Medium

**M1 — Orchestration is polling code, not data.** PRODUCE and CREATE_CHARACTER (and AUTO_IDEA) hold an ORCHESTRATION slot
(limit 6, queue.ts:30) while polling children every 5 s / 3 s (produce.ts:175-187, character.ts:57-66); dependencies
(pilot → rest, predecessor → continuation, frames → takes) exist only in control flow (produce.ts:123-157). A crash
re-derives them. *Fix:* `job_dependencies` + a WAITING status woken by child completion (step 14).

**M2 — Derived results do not go stale.** `selectTake` leaves `productions.cut_asset_id` in place (actions.ts:249-258);
PRODUCE assembles only when no cut exists (produce.ts:162). The cut's provenance lists its takes (assemble.ts:135), so
staleness is computable but never computed. *Fix:* a `stale` flag set by reducers that change a cut's inputs (step 12).

**M3 — Failure classes come from message regexes** (org/runs.ts:27-55), and the retry policy is split between
runs.ts:58 and worker/index.ts:121. A provider wording change reclassifies failures. *Fix:* providers throw typed
errors carrying `failureClass`; regexes become a last resort with a metric.

**M4 — Five overlapping audit logs with write amplification.** `job_events`, `agent_runs`, `studio_events`,
`reliability_events` and `metrics` record the same moments; every tool call and phase appends to a JSONB array,
rewriting the whole run row (runs.ts:94, 115). No retention, no request id in API logs (http.ts:23-32). *Fix:* one
attempt table + one event log with typed kinds (steps 3, 15).

**M5 — Orphan files, no garbage collection.** Files are adopted before records exist (take.ts:390-391); the
`deleteAsset` command removes only the row — only `DELETE /api/assets/[id]` removes the file
(src/app/api/assets/[id]/route.ts:16-18); `deleteProduction`/`removeTake` leave asset rows and files. *Fix:* staged
outputs + a reference-counting sweep (step 15).

**M6 — Backup and recovery are a paragraph in a doc.** docs/OPERATIONS.md:128-129, 161-167: manual `pg_dump` and a
manual copy of `var/library`, not taken together, never restored in a drill. *Fix:* step 16.

**M7 — Shutdown abandons work.** The worker waits 25 s then exits without releasing leases (worker/index.ts:175-178);
jobs sit 90 s and burn an attempt. AWAITING_REVIEW jobs never get `finished_at` (queue.ts:203).

**M8 — The voice is an unqueryable blob.** `characters.voice` holds samples, designs, identity, consent and evaluations
(schema.ts:181); no FK to its assets, so `deleteAsset` must scan JSON to protect them (actions.ts:775-800). *Fix:*
`voice_samples` / `voice_identities` tables when the character aggregate is split out (step 13).

**M9 — Two registries rewritten on every boot.** `org/registry.ts` re-syncs departments/agents/tools/skills from
`org/model.ts`; `server/registry.ts:53-97` rewrites models/workflows. Code is the source of truth; the tables are copies.

### Low

**L1** Read routes do not validate query parameters (`limit=abc` → `NaN`, src/app/api/jobs/route.ts:14).
**L2** A dead ternary picks '1080' on both branches (worker/handlers/assemble.ts:167).
**L3** Bootstrap takes its lock on one connection and migrates on another (bootstrap.ts:27-29); web and worker both
migrate. Safe today, fragile.
**L4** `CODE_VERSION` defaults to `dev` (env.ts:55), so take provenance `codeVersion` is uninformative.
**L5** The development route derives the stage by splitting an idempotency key (src/app/api/development/[ideaJobId]/route.ts:23).

---

## 3. Reliability matrix

| Requirement | Status today | Gap (evidence) | Fix (step) |
|---|---|---|---|
| Durable state | **Mostly met**: all state in Postgres, files on disk | file and row not committed together (take.ts:390-411); tmp in worker volume | staged outputs (6, 15) |
| Idempotent submission | **Partial**: enqueue keys (queue.ts:56-64), take task resume | commands not idempotent (H10); ONE_PER_CHARACTER race (queue.ts:45-48); results re-created on retry (C2) | 3, 6, 9 |
| Dependency tracking | **Weak**: `parent_id` only | deps in code (M1); approvals and cuts never stale (H9, M2) | 9, 12, 14 |
| Explicit progress | **Met**: phases, honest `percent: null`, run phases (queue.ts:191-198, index.ts:69-76) | per-tool progress only for ComfyUI queue position | keep |
| Cancellation | **Partial**: cooperative checkpoints, children follow (queue.ts:111-129) | race (queue.ts:113-122); not propagated into ffmpeg/HTTP (H5); stuck after worker death (H4) | 3, 4 |
| Timeouts | **Partial**: tool race, provider timers | no job deadline; race leaves work running; untimed execFile (H5) | 4 |
| Restart recovery | **Partial**: lease reclaim, take resume, ghost runs closed (runs.ts:80) | images/music resubmit (H8); poison loop (H4); 25 s shutdown (M7) | 3, 7 |
| Safe concurrency | **Weak**: one global lock | stale whole-value writes (H3); torn reads (H2); take numbering race | 11 |
| Resource scheduling (GPU) | **Weak**: in-process lease, GPU lane 1 | cross-process, web, LLM, ComfyUI outside it; starvation (H7) | 8 |
| Failure classification | **Partial**: 16 classes recorded per run | regex-based (M3); DB blip → CANCELLED (H6) | 3, 15 |
| Auditable results | **Partial**: take provenance, QA reports, handoffs | no record of who changed state; approver is free text; client-chosen ids/time (H1, H9) | 2, 9 |
| Targeted regeneration | **Met for takes**: per-shot GENERATE_TAKE, PRODUCE `shotIds`, takes append (actions.ts:306-314) | re-running story development can delete filmed shots (C4); cut not marked stale (M2) | 10, 12 |
| Asset provenance | **Good** for takes/cuts (model, seed, prompt, refs, workflow hash) | `codeVersion=dev`; uploads' consent only in JSON; orphans (M5) | 15, L4 |
| Crash-safe in-progress productions | **Partial**: PRODUCE re-adopts active children (produce.ts:87-88) | duplicate outputs (C1, C2); polling parent (M1) | 5, 6, 14 |
| Fencing (lease, heartbeat, version, CAS) | **Job row only** (queue.ts:179-243) | domain writes unfenced (C1); no aggregate versions; heartbeat fenced on worker id only (queue.ts:174) | 5, 11 |

---

## 4. Target architecture

Same deployment: one Next.js process, one worker process, Postgres, the existing engine containers. No new services,
no new frameworks; Drizzle, zod and postgres.js stay.

### 4.1 Module boundaries

```
src/domain/            pure: aggregates and invariants, split per aggregate (catalog/ characters, voices; world/
                       locations; production/ productions, scenes, shots, takes; assets/; settings/); reducers keep
                       their signatures but take ONE aggregate, not StudioState
src/server/db/         schema split per module (schema/{studio,queue,audit,world,research}.ts), migrations
src/server/store/      repositories: loadProduction(tx,id) / saveProduction(tx, agg, expectedVersion) … ; the ONLY
                       writer of studio tables; optimistic versions; outbox insert in the same transaction
src/server/commands/   command bus: CLIENT_COMMANDS (allow-listed, zod-validated, server-minted ids/clock) and
                       SYSTEM_COMMANDS (in-process only); command_log for idempotency + audit
src/server/jobs/       queue (claim/lease/fence/reaper/deadline), dependencies, scheduler (lanes + GPU admission)
src/server/results/    commitResult(job, leaseToken, outputs, commands): one transaction, fenced, idempotent
src/server/gpu/        database-backed lease (resource_leases), engine unloaders (ComfyUI, Ollama, TTS, ASR, design)
src/server/media/      library (staged → committed), probes, ffmpeg with AbortSignal, GC sweep
src/server/providers/  unchanged surface + `signal` on every call + typed errors carrying failureClass
src/server/audit/      job_attempts + events (one log) + metrics; retention
src/worker/            loop + handlers; handlers return outputs instead of writing the studio directly
```

Rules: only `store/` touches studio tables; only `results/` turns a job's outputs into studio changes; the web never
calls a GPU engine (the voice reference measurement becomes a short job on the GPU lane).

### 4.2 Data model changes (migration sketches)

```sql
-- 0014 aggregate versions + tombstones (C4, H3)
ALTER TABLE productions ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE characters  ADD COLUMN version integer NOT NULL DEFAULT 0;   -- likewise shows, locations
ALTER TABLE takes  ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by text;
ALTER TABLE shots  ADD COLUMN deleted_at timestamptz;  ALTER TABLE scenes ADD COLUMN deleted_at timestamptz;
ALTER TABLE takes DROP CONSTRAINT takes_shot_id_shots_id_fk,
  ADD CONSTRAINT takes_shot_id_shots_id_fk FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE RESTRICT;
-- shots/scenes cascade from productions (schema.ts:82,98,99): productions get deleted_at too, so RESTRICT never fires
ALTER TABLE productions ADD COLUMN deleted_at timestamptz;
ALTER TABLE productions ADD COLUMN cut_stale boolean NOT NULL DEFAULT false;            -- M2

-- 0015 queue v2 (C1, H4, H5)
ALTER TABLE jobs ADD COLUMN lease_token bigint, ADD COLUMN lease_expires_at timestamptz,
                 ADD COLUMN deadline_at timestamptz, ADD COLUMN timeout_ms integer;
CREATE SEQUENCE job_lease_seq;      -- claim sets lease_token = nextval(...): a monotonic fencing token
CREATE UNIQUE INDEX jobs_one_active_per_character ON jobs (type, character_id)
  WHERE status IN ('QUEUED','PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')
    AND type IN ('VOICE_BUILD','VOICE_DESIGN','CHARACTER_APPEARANCE','CHARACTER_REFS');
CREATE TABLE job_attempts (job_id text REFERENCES jobs(id) ON DELETE CASCADE, attempt int, lease_token bigint,
  worker_id text, started_at timestamptz, finished_at timestamptz, outcome text, failure_class text, error jsonb,
  PRIMARY KEY (job_id, attempt));                                -- absorbs reliability_events

-- 0016 dependencies (M1)
CREATE TABLE job_dependencies (job_id text REFERENCES jobs(id) ON DELETE CASCADE,
  depends_on text REFERENCES jobs(id), required_outcome text NOT NULL DEFAULT 'COMPLETED',
  PRIMARY KEY (job_id, depends_on));                             -- + status 'WAITING' for parents

-- 0017 outputs, idempotent results (C2, M5)
CREATE TABLE job_outputs (job_id text, name text, asset_id text, state text NOT NULL,   -- STAGED | COMMITTED
  created_at timestamptz NOT NULL, PRIMARY KEY (job_id, name));
ALTER TABLE assets ADD COLUMN state text NOT NULL DEFAULT 'COMMITTED';                  -- STAGED | COMMITTED | DELETED

-- 0018 command journal + bound approvals (H9, H10)
CREATE TABLE command_log (client_id text, batch_id text, actor text, commands jsonb NOT NULL, result jsonb,
  studio_version int, created_at timestamptz NOT NULL, PRIMARY KEY (client_id, batch_id));
ALTER TABLE approvals ADD COLUMN subject_hash text, ADD COLUMN subject_version int;

-- 0019 GPU lease shared by every process (H7)
CREATE TABLE resource_leases (resource text PRIMARY KEY, family text, holder_job_id text, lease_token bigint,
  expires_at timestamptz, waiting jsonb NOT NULL DEFAULT '[]');

-- 0020 (later) voice split (M8): voice_samples(id, character_id, asset_id FK RESTRICT, source, consent jsonb, …),
-- voice_identities(character_id, revision, …) — backfilled from characters.voice, column kept read-only one release
```

### 4.3 Key mechanisms

- **Claim** = `UPDATE jobs SET lease_token = nextval('job_lease_seq'), lease_expires_at = now()+90s, attempts = attempts+1
  … WHERE id = (SELECT id … AND attempts < max_attempts … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. A stale job at
  its attempt limit becomes FAILED (`INFRASTRUCTURE: worker lost`). A **reaper** in the worker loop finalises stale
  `cancel_requested` jobs as CANCELLED and stale WAITING parents whose children all settled.
- **Fenced writes**: every job-row write and every `commitResult` carries `lease_token`; the transaction does
  `SELECT 1 FROM jobs WHERE id=$1 AND lease_token=$2 FOR SHARE` first and aborts otherwise.
- **Aggregate CAS**: `UPDATE productions SET …, version = version+1 WHERE id=$1 AND version=$2`; a 0-row update is a
  CONFLICT the command bus retries once by re-running the reducer on the fresh aggregate (intent commands make that safe).
- **GPU admission**: one `resource_leases` row (`gpu0`); holders renew with the job heartbeat; a family switch calls
  that family's unloader; waiters are FIFO by request time (no overtaking).

---

## 5. Implementation plan (small, independently mergeable)

Each step lands with its tests green and the baseline (`tsc` 0 errors, 1049 unit tests) intact; database tests run on
`vewbox_test` only.

1. **Test isolation and a guarded reset.** `assertTestDatabase()` in vitest.worker/api configs and Playwright global
   setup (refuse `vewbox`); reset needs `STUDIO_ALLOW_RESET=1` and refuses `kind:'empty'` otherwise. *Tests:* unit
   for the guard; reset route test. *Rollback:* revert; no schema change.
2. **Command allow-list and bind.** `CLIENT_COMMANDS` (≈ 40) vs system commands; zod schema for every client command;
   ids/clock minted from the server's seed for client batches; compose binds `127.0.0.1:4200`; refuse a non-loopback
   bind without `STUDIO_PASSWORD`. *Tests:* `POST /api/commands` with `addTake` → 403; schema coverage test listing
   every client command. *Rollback:* env flag `STUDIO_LEGACY_COMMANDS=1` for one release.
3. **Queue hardening.** `attempts < max_attempts` in claim; reaper for stale cancel/AWAITING_REVIEW `finished_at`;
   single-statement cancel; partial unique index for one-active-per-character (migration 0015 part 1); heartbeat
   errors other than CONFLICT retried, not cancelled. *Tests:* tests/worker/queue.test.ts cases for poison job,
   stale cancel, cancel-vs-claim race, duplicate character job. *Rollback:* index drop; code revert.
4. **Deadlines and real cancellation.** `ctx.signal` = cancel ∪ job deadline (`timeout_ms` from the agent limit);
   ffmpeg/execFile/fetch/comfy/minimax accept it; tool timeouts abort instead of racing. *Tests:* a handler that
   ignores the signal is killed at the deadline; ffmpeg child is killed on cancel. *Rollback:* deadline off by env.
5. **Fenced result writes.** Lease token (0015 part 2); `command(…, { lease })` re-checks it inside the command
   transaction. *Tests:* a reclaimed attempt's `addTake` is refused and recorded. *Rollback:* fence check behind a flag.
6. **Atomic, idempotent take/cut commit.** Deterministic output ids `hash(jobId, name)`; one `commands()` batch for
   assets + take + selection; a re-run that finds the take returns it. Same for ASSEMBLE/EXPORT/voice/music.
   *Tests:* crash injection between adopt and commit → one take, no orphan. *Rollback:* per-handler revert.
7. **ComfyUI prompt keys everywhere.** `promptKey` on images, people, music. *Tests:* comfy-client unit (same key →
   same prompt id) + handler test that a reclaimed job adopts the prompt. *Rollback:* trivial.
8. **Shared GPU lease.** `resource_leases` (0019), FIFO admission, unloaders for ComfyUI (`/free`) and Ollama
   (`keep_alive: 0`), LLM jobs take the lease when the provider is local; voice-reference ASR moves into a short job.
   *Tests:* two worker instances in one test process cannot hold different families; starvation test. *Rollback:*
   `GPU_LEASE=memory`.
9. **Command journal and bound approvals.** `command_log` (0018) with replay; approvals store `subject_hash`; gates
   compare. *Tests:* replayed batch returns the stored result; approval invalidated by a scene edit. *Rollback:*
   tables are additive; gate check behind a flag.
10. **No more cascading take loss.** Tombstones + RESTRICT (0014 part 1); `replaceScript` keeps scene ids by match and
    refuses to drop shots with takes; DEVELOP_STORY re-reads before replacing. *Tests:* reducer tests for each
    destructive command; persist round trip with tombstones. *Rollback:* the column is additive; FK change reversible.
11. **Aggregate versions and intent commands.** `version` columns (0014 part 2); `addCastMember`/`updateShowBible`
    patch commands; `expectedVersion` on worker writes. *Tests:* concurrent edit vs worker write keeps both.
12. **Stale derivatives.** `cut_stale` set by selectTake/rateTake/removeTake/shot edits; PRODUCE assembles when stale;
    UI reads the flag. *Tests:* reducer tests. *Rollback:* additive column.
13. **Scoped persistence (the big one, in three merges).** (a) classify every command by aggregate; (b) `store/`
    repositories load one production/character/location and save with CAS — the global lock stays as a safety net;
    (c) remove the global lock and the full snapshot from the write path; `GET /api/studio` stays as a read model,
    plus `GET /api/productions/:id`. *Tests:* the existing 1049 unit tests (reducers unchanged) + a persistence
    equivalence test (old saver vs new repositories on the sample fixture). *Rollback:* each merge is behind
    `STUDIO_STORE=v1|v2`.
14. **Orchestration as data.** `job_dependencies` (0016), WAITING parents woken by `complete/fail`; PRODUCE and
    CREATE_CHARACTER become planners that enqueue a DAG and finish; the ORCHESTRATION lane disappears.
    *Tests:* produce-pilot/orchestrator tests rewritten on the DAG; crash mid-DAG resumes. *Rollback:* old handlers
    kept one release behind a flag.
15. **One audit log, outputs and GC.** `job_attempts` replaces `reliability_events`; tool calls become events rows
    (no JSONB array append); `job_outputs` + asset `state`; nightly sweep of STAGED > 24 h and unreferenced files
    (dry-run report first); typed provider errors. *Tests:* sweep dry-run on a fixture library.
16. **Backup and restore drill.** `scripts/backup.ts`: `pg_dump -Fc` + a library manifest (path, sha256) taken under
    intake pause, kept N days; `scripts/restore-drill.ts` restores into `vewbox_restore` and verifies every asset row
    has its file. *Tests:* the drill itself, run before every migration.
17. **Deletions** (section 6) — one PR, after step 2 so nothing it removes is still wired.

---

## 6. Deletion list

Verified with a TypeScript-AST import scan over `src`, `tests`, `scripts`, `tools` and the root configs (a re-export
alone is not a use), confirmed by grep. `ts-prune`/`knip`/`depcheck` are not installed and were not added. Migrations
are never deleted; a table goes with a new migration.

**6.1 Delete now — no reference outside the declaration (high confidence)**

| Item | Evidence |
|---|---|
| `src/lib/i18n.ts` (whole file, `type Locale = 'en'\|'ar'`) | zero importers; Arabic-UI leftover (English-only since 2026-10-03) |
| `src/server/org/runs.ts:98` `runPhasesOf` | only its definition |
| `src/server/world/store.ts:29` `listRevisions` (+ its name in `world/index.ts:13`) | re-exported, never called |
| `src/server/story/prompts.ts:156` `continuityLine` | only its definition |
| `src/server/story/development/rubric.ts:22` `FOCUS`; `development/schemas.ts:51` `type ConceptsOut` | only their definitions |
| `src/server/workflows/canonical-image.ts:446` `FACE_CROP_OUTPUT`; `workflows/minimax-h3.ts:16` `H3_MAX_REF_VIDEOS`, `:34` `h3Seconds` | only definitions (+ a barrel line) |
| `src/server/providers/comfy.ts:410` `export { log as comfyLog }` | zero hits for `comfyLog` |
| `src/app/api/studio/org/events/route.ts` | no caller in src, tests or scripts (update `tests/unit/activity-noise.test.ts:33-37`, which lists it) |
| `src/worker/handlers/assemble.ts:167` the `'1080' : '1080'` ternary | both branches equal |
| `src/lib/format.ts:134,141,168` unused `_ignored` locale parameters; `src/domain/vocabulary.ts:59-60` "TEMPORARY" index signature on `DIALECT_LABELS` | no caller passes the argument; `format.ts:168` reads `.en` only |

**6.2 Unused re-exports — delete the line, the symbol stays (high)**
`worker/handlers/index.ts:39` (`step`), `worker/handlers/produce.ts:189` (`listJobs`), `worker/handlers/voice.ts:97`
(types), `studio/selectors.ts:18` (`canonicalStatusOf`, `isCanonicalApproved`, `primaryImageSourceOf`),
`lib/hooks.ts:60`, `server/workflows/index.ts:66` (seven H3 helpers; consumers import `./minimax-h3`),
`server/research/index.ts:16,18,19`, `server/research/providers/index.ts:15`, `server/media/assembly.ts:17`,
`domain/sample.ts:253` (`STATE_VERSION`), `server/media/voice-check.ts:20`, `studio/org.ts:18,29` (medium).
About 358 further symbols are used only inside their own file; drop the `export` keyword in batches with `tsc`.

**6.3 Test- or script-only code — delete with its test after a product decision (medium unless noted)**
- `server/story/engine.ts:85` `proposeIdea` — the old single-prompt Auto Idea, superseded by
  `story/development/engine.ts`; only `tests/unit/skill-prompt.test.ts:95` calls it (high).
- `server/research/index.ts:120` `runResearch` — only `tests/unit/research-run.test.ts`; the worker uses
  `querySource`/`storeEvidence` (high).
- `server/world/index.ts:122` `setAudioPolicy`, `world/store.ts:88` `latestAudioTimeline` — tests only (high).
- `studio/selectors/expectations.ts` (whole file) — only `tests/unit/run-phases.test.ts`; contracted in
  `docs/CONTRACTS-REDESIGN-BACKEND.md` B9 but unused by any page.
- `domain/phases.ts:40` `phaseDurations`, `studio/selectors/cuts.ts:53` `currentCutVersion`,
  `studio/selectors/decisions.ts:151` `decisionCounts`, `domain/identity.ts:8` `canonicalStatusOf`,
  `lib/format.ts:63,128`, `workflows/minimax-h3.ts:38` `h3GuideClipFrames` — tests only.
- API routes with no page caller yet: `notes/**` (4 routes, B2 Screening Room), `research/sources`,
  `research/runs/[id]`, `development/[ideaJobId]` — keep if the redesign's pages will call them; otherwise delete.

**6.4 Obsolete workflows and scripts — archive under `docs/evidence/` or delete (medium)**
`tools/flux-vs-qwen-gpu.ts`, `tools/flux-vs-qwen-identity.py` (A/B decided, docs/research/FLUX-VS-QWEN.md §0);
`tools/canonical-image-gpu.ts` (acceptance driver; it alone keeps `workflows/canonical-image.ts:618-623`
`STYLE_CHECK_PROMPT`/`EXPECTED_MEDIUM`/`parseStyleJudgement` alive); `scripts/minimax-p1-experiments.ts`,
`scripts/minimax-join-metrics.mjs` (only docs/evidence/minimax-p1); `scripts/arabic-coverage-evidence.ts` (one-shot);
`scripts/capture-character-fixtures.mjs` (only docs/AUDIT-CODEBASE.md); `scripts/studio-cleanup.ts` (Phase-0 cleanup,
superseded by step 16's backup script). Keep: v4/v5 lint and contrast scripts (imported by tests), `qa-journeys*`,
`check-comfy-nodes.mjs`, `presentation-backfill.ts`, `studio-intake.ts`, `home-acceptance.mjs`, the voice/Iraqi
evaluation scripts, `tools/sample-media.mjs` (package.json).

**6.5 Tables written but never read**
`continuity_versions` (schema.ts:338) — inserted only at persist.ts:155, never read anywhere (high): drop with a
migration, or give it a reader. `world_reads` and `audio_timelines` have production writers but test-only readers
(medium): keep — they are provenance the redesign's take/cut pages should read.

**6.6 Duplicate services — consolidate, do not delete**
- ffmpeg/ffprobe called ad hoc in seven modules instead of `media/ffmpeg.ts`/`media.ts` `ffprobe` (thumbs.ts:111,
  presentation.ts:165,178, image-check.ts:41, voice-check.ts:89, assembly-joins.ts:43, sync.ts:41) — one helper with
  timeout + signal (fixes part of H5).
- Two hand-written orchestration loops (produce.ts:175-187 `waitFor`, character.ts:43-66 `runStep`) → step 14.
- `story/development/context.ts:46-47` vs private `castSummary`/`locationSummary` in `story/engine.ts:44-49`.
- Five overlapping audit logs (M4) → step 15. The two "registries" (`server/registry.ts`, `server/org/registry.ts`)
  are distinct in purpose (models/workflows vs organisation) and stay, renamed `registry/models.ts` and
  `registry/org.ts`.

**6.7 Dependencies:** none unused. Every package in package.json is imported or used by a config (react-dom is a peer
of next; `@axe-core/playwright` by f4-shell.spec.ts; tailwind via postcss.config.mjs and globals.css). `tsx` is
correctly a runtime dependency (worker.Dockerfile:24). `postcss` (dev) is redundant with `@tailwindcss/postcss`'s own
dependency but harmless. `pino-pretty` is loaded only by a transport string when `LOG_PRETTY=1` (log.ts:12) and is
absent from the standalone web image — keep `LOG_PRETTY=0` in containers.

---

## 7. Risks

- **The persistence rewrite (step 13) touches every write path.** Mitigation: reducers stay pure and unchanged; an
  equivalence test compares old and new savers on fixtures; a version flag; done after the cheap safety steps.
- **Frontend coupling.** The browser runs the same reducers on a full `StudioState` (store.tsx:154-159). Scoped
  persistence keeps that read model; splitting `/api/studio` must be coordinated with the frontend team, who are
  editing `src/app/(app)/**` and `src/components/**` now. The command allow-list (step 2) may refuse commands a page
  still sends; the schema coverage test lists them first.
- **Migrations on a live studio.** Each migration is additive first (columns, tables, indexes `CONCURRENTLY` where
  needed), backfilled, then enforced; the FK change in step 10 runs after a backup (step 16 moves earlier if the
  producer resumes generation before it).
- **GPU lease regressions** can stall all generation. Mitigation: `GPU_LEASE=memory` fallback; lease rows expire.
- **Deadlines may kill legitimate long jobs** (a 90-min local MiniMax H3 render). Mitigation: per-type deadlines from
  measured p95 × 2 (metrics already hold `take.generation_ms`), logged before enforced.
- **Generation is paused**; nothing here needs it resumed. Steps 1–3 should land before any resumption.
