# Operations

## Services

| Service | Image | Port (host, loopback unless noted) | Role |
|---|---|---|---|
| `db` | postgres:17.6-alpine | 5432 | the authoritative studio: records, jobs, usage, continuity, metrics |
| `web` | vewbox/web | **4200 (all interfaces)** | Next.js: pages, command API, uploads, media streaming, event stream |
| `worker` | vewbox/worker | — | runs jobs: story engine, MiniMax video, images, voices, music, assembly |
| `comfyui` | vewbox/comfyui | 8188 | GPU: Qwen-Image, local MiniMax H3, ACE-Step, MiniMax Music 3 (hidden behind the worker) |
| `tts` | vewbox/tts-indextts | 8020 | GPU: IndexTTS 2.5 voices (English, Arabic) |
| `tts-habibi` | vewbox/tts-habibi | 8021 | GPU: Habibi-TTS IRQ voices (Iraqi Arabic) |
| `asr` | vewbox/asr | 8030 | GPU: faster-whisper large-v3 transcription |
| `llm` | ollama/ollama | 11434 | GPU: local story engine (qwen3:14b) when no hosted key is set |
| `models` (profile) | vewbox/models | — | one-shot weight fetcher |

Only `web` is published beyond the loopback interface. Everything else is reachable from the host for debugging and
from the other services by name.

### Voice services

- Both voice containers fetch their weights on first start into the `models` volume (`/models/tts/indextts-2.5`,
  10.1 GB; `/models/tts/habibi`, 1.3 GB) and only then serve; `start_period` of the healthcheck allows for it.
  `HF_HOME=/models/hf-home` keeps auxiliary downloads (vocoder, tokenizers) on the volume across recreates.
- `docker/tts/entrypoint.sh` and `docker/tts/app.py` are mounted from the repository over the copies baked into the
  images, so a fix to either takes effect on `docker compose up -d tts tts-habibi` without rebuilding 12 GB images.
  The images still carry the copies, so the stack also runs from the images alone.
- The worker transcribes a character's reference recording once with the `asr` service and passes the text to the
  Iraqi engine; Habibi would otherwise transcribe it with a Whisper it downloads on first use, blocking the service.
- A host-run worker needs `TTS_URL`, `TTS_HABIBI_URL` and `ASR_URL` in `.env.local` pointing at the published ports
  (`http://127.0.0.1:8020`, `:8021`, `:8030`); the compose defaults use the service names.

## Health

- `GET /api/health` — web process and database. Used by the container healthcheck; never requires the password.
- `GET /api/status` — live engine probes (ComfyUI, voices, transcription, story engine, MiniMax key present, video
  backend chosen). Settings → Engines shows the same.
- `docker compose ps` — every service has a healthcheck; `unhealthy` names the one to look at.

## Logs

All services log JSON lines to Docker (`json-file`, rotated at 20 MB × 5). Read them with:

```bash
docker compose logs -f --tail 200 worker
```

Every job log line carries `jobId`, `type`, `attempt` and, where relevant, `productionId` / `shotId`; a MiniMax call
carries its `requestId`. Secrets are redacted at the logger by key name (`apiKey`, `authorization`, `cookie`, `password`, `token`), and
provider clients never log request headers.
`LOG_LEVEL=debug` adds request bodies without secrets. `LOG_PRETTY=1` renders human-readable lines (host development).

## The organisation

The worker runs every job *as* a registered agent of a department (`src/server/org/model.ts`). On boot the web process
and the worker sync the organisation into the database with its version; the Studio area (`/studio`) reads it back with
each agent's real runs. Changing an agent, a tool or a skill is a code change: edit `model.ts` (and the skill's
`SKILL.md`), bump `ORG_VERSION`, restart the worker and the web process. A host-run worker (`tsx`) does not hot-reload:
restart it after any change under `src/worker` or `src/server`.

Two decisions are a person's and block the pipeline until given: the **story** (before "Produce every shot") and the
**cut** (before "Export"). Give them on the Produce / Final Cut tab or on `/production`; the worker refuses the gated
job with a message naming the gate, and the refusal is not retried.

A failed job carries a failure class (`INVALID_INPUT`, `MISSING_REFERENCE`, `INCONSISTENT_PLAN`, `PROMPT_AMBIGUITY`,
`WRONG_PARAMETERS`, `INFRASTRUCTURE`, `PROVIDER`, `RESOURCE_EXHAUSTION`, `OUTPUT_CORRUPTION`, `LIP_SYNC_FAILURE`, …).
Only the three transient classes are retried automatically; the others wait for a correction (fix the reference, the
plan or the parameter, then Retry). Every failure is a reliability event on `/studio`; a later success resolves it.

## Jobs

Production (`/production`) shows each production's position in the pipeline and, below it, Activity: every job with
its phase, attempt, error and log. From there:

- **Cancel** marks the job; a queued job stops at once, a running one at its next checkpoint (a MiniMax task that is
  already running is cancelled at MiniMax too, and nothing is billed twice).
- **Retry** re-queues a failed or cancelled job as a new attempt of the same row; a new MiniMax request is made only
  if none is in flight for it.
- A worker that dies mid-job loses its lease after 90 s without a heartbeat; the next worker picks the job up
  (`recovering`) and, for a MiniMax job with a stored task id, resumes polling rather than resubmitting.

Backoff after a retryable failure: 15 s, 1 min, 4 min, then 15 min, with jitter. Attempts per type are set in
`src/server/jobs/queue.ts` (`DEFAULT_ATTEMPTS`).

## Start, stop, migrate, recover

- **Start**: `docker compose up -d` (db, llm, comfyui, asr, tts, tts-habibi, web, worker). Migrations run on boot under
  an advisory lock (`runMigrations()`), then the organisation sync. During host development the worker runs on the
  host (`pnpm worker`, or detached as in `SETUP.md`) with the container worker stopped.
- **Stop**: `docker compose stop worker web` first (a running job finishes or is reclaimed later), then the rest.
  Nothing is lost: a job holds a 90 s lease; a stopped worker's job is reclaimed by the next worker as the next attempt,
  a ComfyUI prompt it had submitted is adopted rather than resubmitted, and an orchestrator adopts its in-flight
  children.
- **Migrate**: `pnpm db:generate` after a schema change writes `drizzle/NNNN_*.sql`; the next boot applies it, or
  `pnpm exec tsx --env-file=.env --env-file=.env.local src/server/db/cli.ts migrate` applies it now. A running dev web
  process keeps its cached bootstrap: restart it after adding a migration.
- **Recover**: a stuck job (no heartbeat) is reclaimed automatically; a job in `FAILED` with a non-transient class
  needs its correction and then Retry; the database is backed up with `docker exec vewbox-db-1 pg_dump -U vewbox vewbox
  > var/backups/<name>.sql`, the library by copying `var/library/`.

## Several workers

Any number of workers can share the queue (the host's `pnpm worker` beside the `worker` container, or several
containers). They must run the same code: during host development stop the container worker
(`docker compose stop worker`), or rebuild it (`docker compose build worker && docker compose up -d worker`) after
pulling, otherwise an older worker may handle a job with older rules.

## GPU

One model family holds the card at a time (image, video, voice, transcription, music). The worker's GPU lease asks
the other services to unload before switching; ComfyUI is asked to free its models, the voice and transcription
services unload on request. `GPU_VRAM_BUDGET_MB` (default 30000 on a 32 GB card) bounds what the worker will schedule.
Watch the card with `nvidia-smi -l 2` on the host. Measured holds and waits are recorded as metrics
(`gpu.wait_ms`, `gpu.hold_ms`, labelled by model family).

## Storage

| Volume / path | Contents | Backup |
|---|---|---|
| `pgdata` volume | the database | `docker compose exec db pg_dump -U vewbox vewbox > backup.sql` |
| `LIBRARY_DIR` (default `./var/library`) | every uploaded and generated file, by asset id | copy the directory |
| `models` volume | model weights (re-downloadable) | not needed |
| `comfyout`, `comfyin`, `workertmp` | scratch | not needed |
| `ollama` volume | the local story model | not needed |

Restore: `psql` the dump into a fresh `db`, put the library directory back, `docker compose up -d`.

## Resetting

Settings → **Reset sample data** returns the records to the bundled sample studio, removes added files from the
library and clears the job history. **Start with an empty studio** does the same with no sample content. Both keep the
interface settings. Model weights and the library directory itself stay.

## Updating models

`docker/models/manifest.json` pins every file (repository, revision, path, SHA-256). To add or change one, edit the
manifest and run the fetcher again; the registry page in Settings → Engines lists what is present. Workflows carry
a version hash that every take records, so a change in a workflow template is visible in the provenance of later takes.

## Security notes

- Secrets only in `.env`; the repository ships `.env.example` without values.
- Set `STUDIO_PASSWORD` when the machine is reachable by others; the studio then requires it on every request
  (HTTP Basic). Put a TLS-terminating proxy in front for anything beyond a trusted LAN.
- Uploads are sniffed (magic bytes), size-limited (`MAX_UPLOAD_MB`), probed with ffprobe and fully decoded before a
  record exists; library paths are derived from ids, never from client input. Media is served only through
  `/api/media/{id}` from the library root.
- Subprocesses (ffmpeg, ffprobe) are spawned with argument arrays, never a shell.
