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

## Jobs

Activity (`/jobs`) lists every job with its phase, attempt, error and log. From there:

- **Cancel** marks the job; a queued job stops at once, a running one at its next checkpoint (a MiniMax task that is
  already running is cancelled at MiniMax too, and nothing is billed twice).
- **Retry** re-queues a failed or cancelled job as a new attempt of the same row; a new MiniMax request is made only
  if none is in flight for it.
- A worker that dies mid-job loses its lease after 90 s without a heartbeat; the next worker picks the job up
  (`recovering`) and, for a MiniMax job with a stored task id, resumes polling rather than resubmitting.

Backoff after a retryable failure: 15 s, 1 min, 4 min, then 15 min, with jitter. Attempts per type are set in
`src/server/jobs/queue.ts` (`DEFAULT_ATTEMPTS`).

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
