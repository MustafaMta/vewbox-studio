# Architecture

Vewbox Studio is a filmmaking application: a producer plans shows, shorts and music videos in the Screening Room
interface, and the system writes, draws, records, generates video with MiniMax, assembles and exports. This
document describes the system as built; abandoned experiments are not here.

## Shape

```
browser (Next.js app, Screening Room UI)
   │  GET /api/studio  ·  POST /api/commands  ·  POST /api/assets  ·  GET /api/media/{id}  ·  GET /api/events (SSE)  ·  /api/jobs
   ▼
web (Next.js 16 server) ──────────────── Postgres 17 ──────────────── worker (Node, tsx)
   • command engine (same pure reducers      • shows … takes, characters,       • claims jobs (SKIP LOCKED), heartbeats
     as the browser; one advisory lock)        locations, assets, jobs,          • story engine (LLM)  · MiniMax video
   • snapshot + change feed (LISTEN/NOTIFY)    usage records, continuity         • ComfyUI (images, local MiniMax H3, music)
   • library on a volume, ffprobe on upload    versions, metrics, proposals      • voice + transcription services · ffmpeg
                                                                                 • GPU lease: one model family at a time
local GPU services (RTX 5090, Docker, NVIDIA runtime)          hosted (MiniMax, when MINIMAX_API_KEY is set)
   comfyui  : Qwen-Image / Qwen-Image-Edit, MiniMax H3 (open weights), ACE-Step, MiniMax Music 3
   tts      : IndexTTS 2.5          tts-habibi : Habibi-TTS IRQ         asr : faster-whisper large-v3
   llm      : Ollama (qwen3:14b) as the OpenAI-compatible story engine when no hosted key exists
```

## The one rule of state

The database is authoritative. Every change to the studio is a **command**: a named pure function
(`src/domain/actions.ts`) applied to the whole studio state. The browser runs it immediately on its copy (so the
interface never waits) and sends `{name, args, seed, at}` in small batches; the server runs the same function on the
state it loads from Postgres under one advisory lock, persists only the rows that changed (`src/server/studio/persist.ts`),
bumps a version and NOTIFYs. The command's `seed` fixes the ids it mints and `at` fixes its clock, so both sides
produce identical results; the response carries a hash of the authoritative state and the browser re-reads the
snapshot only when its copy drifted or another process (a worker) changed something. Workers write through the same
commands (`command('addTake', …)`), so a take arriving while the producer edits a shot cannot be lost.

Refusals are part of the contract: a command that breaks a rule throws a `StudioError` with a code
(`APPEARANCE_LOCKED`, `ASSET_PROTECTED`, `CONFLICT`, …). The browser shows the reason; the server returns 409/423 and
rolls the whole batch back.

## Production records

Show → Season → Episode (a Production of kind EPISODE) / Short / Music Video → Scene (beats with lines) → Shot →
Take. Characters and Locations are shared libraries. A Take is immutable provenance: provider, model, request id,
prompt, references, seed, parameters, size, duration, generation time, cost, QA report, code and workflow versions.
Regeneration adds a take; nothing overwrites an accepted one. A Shot carries its versioned continuity state
(characters' wardrobe/pose/position/screen direction/eyeline/emotion, props and owners, environment, camera, and how
it relates to the previous shot: continuation, cut or story transition); every change writes a `continuity_versions`
row.

The continuity rule for characters (appearance frozen once a take contains them) is enforced in the reducers the
server runs, which is why the UI's disabled buttons are a convenience and not the protection.

## Jobs

Generation never depends on a browser request staying open. `POST /api/jobs` inserts a row; a worker claims it with
`FOR UPDATE SKIP LOCKED`, renews a 90 s lease by heartbeat, reports phases (`PREPARING → GENERATING → DOWNLOADING →
VALIDATING → POSTPROCESSING → COMPLETED | AWAITING_REVIEW | FAILED | CANCELLED`), retries with exponential backoff up to
`maxAttempts`, and stops at the next checkpoint when cancellation is requested. Stale leases are reclaimed. Idempotency
keys stop a double submission (or an orchestrator restart) from becoming a second MiniMax request; a hosted task id is
stored on the job as soon as MiniMax returns it, so a restart resumes polling instead of resubmitting. Percentages are
shown only when the engine reports real progress.

Lanes: HOSTED (MiniMax, several at once), LLM (a few), CPU (ffmpeg), GPU (one at a time). The GPU lease
(`src/worker/gpu.ts`) keeps one model family resident on the 32 GB card and asks the other services to unload before a
switch; waits and holds are recorded as metrics.

## Video: MiniMax, two ways

`src/server/providers/video.ts` has one request shape and two backends: the hosted MiniMax H3 API (`/v2/video_generation`,
first/last frame or up to nine reference images and three reference audio clips, native stereo audio with dialogue in
Arabic and English) and the open-weights MiniMax H3 running in ComfyUI on the local GPU (same prompt grammar,
first/last frame or references, native audio). `VIDEO_BACKEND=auto` picks the API when a key exists. There is no third
model and no fallback to another family.

Take pipeline (`src/worker/handlers/take.ts`): gather references (opening frame drawn by Qwen-Image-Edit from the
location plate and the character sheets; or portraits and plate as subject references; the character's chosen voice
recording as audio reference for speaking shots) → compose the prompt (production direction's visual language,
setting, people by appearance never by name, action, camera, light, dialogue tags) → generate → download → ffprobe +
full decode → quality checks (duration, size, black frames, frozen video, flicker, silence, true peak) → web-ready MP4
+ poster → library assets → `addTake` (status READY, or REJECTED with the failed checks named) → first clean take of a
shot is pre-selected.

## Story

`src/server/story/engine.ts` turns briefs into productions through one LLM interface with three providers (MiniMax
M3, Anthropic, any OpenAI-compatible server) and strict JSON schemas with repair. Three production directions
(`style.ts`) shape writing, design, camera and the visual language of every prompt. Arabic productions are written in
the dialect (Iraqi Baghdadi by default) with an English gloss for review.

## Sound

Voices: one persistent identity per character (engine, reference recording, revision). IndexTTS 2.5 for English and
Arabic, Habibi-TTS IRQ for Iraqi Arabic, MiniMax speech when chosen and a key exists. Every generated line is
transcribed back (faster-whisper large-v3) and compared with the script; a drifting line is regenerated once and
flagged. Music: MiniMax Music API when the account has it, ACE-Step 1.5 XL (local) otherwise, MiniMax Music 3 open
weights as the second local engine. Assembly mixes the takes' own audio, the recorded lines where a take is silent,
the song, and normalises to EBU R128.

## Where things live

| Path | Contents |
|---|---|
| `src/domain` | types, vocabulary, pure actions, rules, commands, ids/hash, job contracts, sample studio, lyrics |
| `src/studio` | browser store (API-backed), API client, selectors |
| `src/server` | env, db (schema/migrations), studio engine (snapshot/persist/commands/seed), media, jobs queue, providers (minimax, comfy, llm, speech, video), story engine, workflows, ffmpeg/assembly |
| `src/worker` | the worker loop, GPU lease, handlers per job type |
| `src/app/api` | route handlers |
| `docker/` | web, worker, comfyui, tts, asr, models (fetcher + manifest) |
| `drizzle/` | SQL migrations |
| `tests/unit`, `tests/api`, `tests/e2e` | reducers and rules; live API contracts; Playwright against the running studio |
