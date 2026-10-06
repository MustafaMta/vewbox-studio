# Operations

## Services

| Service | Image | Port (host, loopback unless noted) | Role |
|---|---|---|---|
| `db` | postgres:17.6-alpine | 5432 | the authoritative studio: records, jobs, usage, continuity, metrics |
| `web` | vewbox/web | **4200 (all interfaces)** | Next.js: pages, command API, uploads, media streaming, event stream |
| `worker` | vewbox/worker | — | runs jobs: story engine, MiniMax video, images, voices, music, assembly |
| `comfyui` | vewbox/comfyui | 8188 | GPU: Qwen-Image-2512 (characters from text), Qwen-Image-Edit-2511 (characters from a picture, secondary material; FLUX.2 [klein] 4B only with `CANONICAL_REFERENCE_ENGINE=klein`), Qwen3.5-4B (reads uploaded pictures), local MiniMax H3, ACE-Step, MiniMax Music 3 (hidden behind the worker) |
| `tts` | vewbox/tts-indextts | 8020 | GPU: IndexTTS 2.5 voices (English, Arabic) |
| `tts-habibi` | vewbox/tts-habibi | 8021 | GPU: Habibi-TTS IRQ voices (Iraqi Arabic) |
| `tts-design` | vewbox/tts-design | 8022 | GPU: VoxCPM2 voice design from a description (EN, MSA); CPU: ECAPA speaker embeddings |
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

### Voice design service (`tts-design`, :8022)

VoxCPM2 (OpenBMB, Apache-2.0) designs a *synthetic* voice from a text description, with no audio input; ECAPA-TDNN
(SpeechBrain, Apache-2.0) embeds a recording as a 192-d speaker vector. Contract and rules:
`docs/research/VOICE-IDENTITY-V2.md` §2.2, §2.3 (Rule V-DESIGN), §3.3, §5.1. Client: `src/server/providers/voice-design.ts`.

| | |
|---|---|
| Endpoints | `POST /design` (description, text, language en\|ar, seed, n ≤ 3, cfg_value, inference_timesteps, design_id, loudness_target) → JSON: per candidate a 48 kHz original and a 24 kHz mono reference (base64 WAV, sha256, duration, LUFS, true peak, clipped samples) + ECAPA embedding + pairwise cosine; headers `x-engine-version`, `x-seed`, `x-seeds`, `x-design-id`, `x-params`. `POST /embed` (audio) → 192-d L2-normalised vector. `POST /similarity` (a, b) → cosine. `POST /unload`. `GET /health` |
| Output | peak-limited to ≤ −1 dBTP with the line engines' limiter (imported from `docker/tts/app.py`); every WAV tagged `ISFT=vewbox-tts voxcpm2`, `ICMT=synthetic speech; engine=voxcpm2; designId=…; candidate=…; seed=…; …; not a voice reference`. Candidate k uses seed + k |
| Refusals (400) | language other than en/ar (Iraqi has no designed path); text script ≠ language; text starting with `(`; descriptions with "sounds like", "the voice of", imitate/impersonate/mimic/clone, "in the style of" and the Arabic equivalents (Rule V-DESIGN §4; the job's LLM check stays the main gate) |
| Weights | `/models/tts/voxcpm2` (4.96 GB) and `/models/eval/spkrec-ecapa-voxceleb` (89 MB) in the model store (docs/MODELS-STORAGE.md), fetcher group `voice-design` (docs/MODELS.md). The service never downloads (`HF_HUB_OFFLINE=1`); without weights `/design` answers 503 → the client's `NOT_CONFIGURED` |
| Image | `vewbox/tts-design` = the `tts-habibi` image + one 251 MB layer (voxcpm 2.0.3 `--no-deps`, transformers 4.57.6, speechbrain 1.1.1). Build `tts-habibi` first on a fresh machine. `docker/tts-design/app.py` and `docker/tts/app.py` are bind-mounted: a fix needs a restart, not a rebuild |
| VRAM (measured 2026-10-03) | never loaded: 0. Loaded: 5.2 GB allocated, 6.4 GB reserved at peak (Arabic, 15 s candidate); the card's total rose by ≈ 7.0 GB. After `/unload` the process keeps its CUDA context, ≈ 0.63 GB, until the container restarts (the other voice services behave the same). ECAPA runs on the CPU (`TTS_DESIGN_ECAPA_DEVICE`): ~8 s first load, ~0.2 s per comparison. VoxCPM2 runs eagerly (`VOXCPM_OPTIMIZE=0`: torch.compile needs a C compiler the runtime image lacks) |
| Timing (measured) | first call loads the model (18 s from the page cache, 33 s cold); then 3.3–7.2 s per candidate for 6.6–15 s of audio (eager, RTF ≈ 0.4–0.6) |
| Seed length | a designed seed is a clone reference only if the line engine hears all of it: Habibi (F5) clips references over 12 s and then its reference text no longer matches (seen: the last reference word spoken at the start of the line), IndexTTS caps at 15 s. Keep the design text short enough (≈ 8–10 s) and reject candidates over 11.5 s for cloning |
| Sharing the card | ComfyUI's dynamic VRAM keeps ≈ 26–28 GB of Qwen-Image staged after image jobs. With its queue empty, `POST http://127.0.0.1:8188/free {"unload_models": true, "free_memory": true}` releases it (what the worker's GPU lease does); the next prompt restages in seconds |

```powershell
docker compose build tts-design                      # detached on this machine: see SETUP / the memory note on long builds
docker compose up -d --no-deps tts-design            # start (never touches tts / tts-habibi)
curl.exe -s http://127.0.0.1:8022/health             # engine_version, loaded, weights_present, gpu, torch (this process)
curl.exe -s -X POST http://127.0.0.1:8022/unload     # free the GPU after a design batch
pnpm exec tsx scripts/voice-design-eval.ts           # the evidence run (docs/evidence/voice-design/report.json)
```

A host-run worker needs `TTS_DESIGN_URL=http://127.0.0.1:8022` in `.env.local` (the env default is that host port
already; compose passes `http://tts-design:8022` to the containers). Empty `TTS_DESIGN_URL` = not configured.

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

- **Start**: `docker compose up -d` (db, llm, comfyui, asr, tts, tts-habibi, tts-design, web, worker). Migrations run on boot under
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
  needs its correction and then Retry; back up with `scripts/backup.ts` (a consistent pg_dump plus the library manifest)
  and restore with `scripts/restore.ts` into a new, verified database — the procedure is docs/OPERATIONS-BACKUP.md.

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

Image models, whole card measured with `nvidia-smi` during the 2026-10-03 comparison (docs/research/FLUX-VS-QWEN.md):

| Use | Engine | Card while drawing | Time per image |
|---|---|---|---|
| Character from text (Auto, Manual) | Qwen-Image-2512, quality mode | ≈ 31 GB (the card's limit) | ≈ 42 s warm |
| Character from a picture (Image Reference) | Qwen-Image-Edit-2511 (since 2026-10-06) | ≈ 30.4 GB | ≈ 100–120 s |
| Non-default fallback for pictures | FLUX.2 [klein] 4B (`CANONICAL_REFERENCE_ENGINE=klein`) | ≈ 22 GB | ≈ 4 s warm |

The FLUX.2 [klein] 4B Base weights (7.75 GB) were downloaded for the comparison only and are not used; they can be
removed from the models volume.

## Storage

| Volume / path | Contents | Backup |
|---|---|---|
| `pgdata` volume | the database | `scripts/backup.ts` (docs/OPERATIONS-BACKUP.md) |
| `LIBRARY_DIR` (default `./var/library`) | every uploaded and generated file, by asset id | copy the directory; `scripts/backup.ts` writes the manifest it is verified against |
| `models` volume | model weights (re-downloadable) | not needed |
| `comfyout`, `comfyin`, `workertmp` | scratch | not needed |
| `ollama` volume | the local story model | not needed |

Restore: `scripts/restore.ts` into a new database, verified against the library copy (docs/OPERATIONS-BACKUP.md).

## Resetting

A new database starts as an empty studio. The bundled sample studio is a test fixture only: the server loads it
(`POST /api/studio/reset {"kind":"sample"}`) only when it runs with `STUDIO_SAMPLE_FIXTURE=1`, which the browser
tests set. Never run the browser tests against a studio whose work you want to keep: every test resets it. Point
them at a copy (`DATABASE_URL` with another database name).

To pause new work before maintenance, close the intake: new jobs are refused and workers stop claiming.

```powershell
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts pause "maintenance"
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts status
pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts resume
```
 A full cleanup goes through
`scripts/studio-cleanup.ts plan`, which writes a manifest, and only then `execute` (a database dump first, files
moved rather than deleted). Model weights stay.

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
