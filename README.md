# Vewbox Studio

An AI filmmaking studio for one machine: plan shows, shorts and music videos in the Screening Room interface, and
let the studio write, draw, record, generate video with **MiniMax**, assemble and export. English and Arabic (Iraqi
Baghdadi by default), three visual directions, characters who keep one face and one voice across everything.

Video comes from MiniMax H3 only — the hosted API when you have a key, the open weights on your own GPU when you don't.
No other video model is in the tree, by policy.

## Run it

Needs Docker with the NVIDIA runtime and a 32 GB GPU (built and exercised on an RTX 5090).

```bash
cp .env.example .env                                   # set POSTGRES_PASSWORD; add MINIMAX_API_KEY if you have one
docker compose --profile models run --rm models        # fetch the pinned weights (resumable; large)
docker compose up -d --build
```

Open <http://localhost:4200>. Settings → Engines shows which engines answer. The full guide is
[docs/SETUP.md](docs/SETUP.md); day-to-day care is [docs/OPERATIONS.md](docs/OPERATIONS.md).

Host development (web and worker with hot reload against the Docker infrastructure):

```bash
docker compose up -d db llm comfyui tts tts-habibi asr
pnpm install && pnpm dev          # web on :4200
pnpm worker                       # the job worker
```

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | unit tests: reducers, rules, story schemas, access gate |
| `pnpm test:api` | live HTTP contracts and negative paths against a running studio (`STUDIO_URL`, default :4200) |
| `pnpm test:worker` | queue leases, retries, idempotency and the MiniMax client, against the live database |
| `pnpm e2e` | Playwright through the real interface, desktop, phone and Arabic (needs `pnpm exec playwright install chromium` once) |
| `node scripts/check-comfy-nodes.mjs` | verifies the running ComfyUI exposes every node and model the workflows use |

## What is here

```
src/app/            pages (Screening Room UI) and /api route handlers
src/components/     the interface: kit, library, show, wizard, workspace, character, location, players, jobs
src/domain/         the studio's types, vocabularies, pure actions and rules, commands, job contracts, timeline, sample studio
src/studio/         the browser store (optimistic commands over the API, live updates) and selectors
src/server/         env, database (Drizzle + Postgres), studio engine, media library, job queue, providers (MiniMax,
                    ComfyUI, LLMs, speech), story engine and prompts, ComfyUI workflow templates, ffmpeg and assembly
src/worker/         the job worker: lanes, GPU lease, one handler per job type
docker/             web, worker, comfyui, tts (IndexTTS 2.5 + Habibi-TTS), asr (faster-whisper + Demucs), models fetcher
drizzle/            SQL migrations (applied on boot)
tests/              unit · api · worker · e2e, plus real media fixtures
docs/               architecture, setup, operations, models, producing, the implementation checklist with evidence
```

## How it works, in one paragraph

Postgres is the authoritative studio. Every change is a named command run as a pure function in the browser (so
the interface never waits) and again on the server under one lock (so the database is the truth); deterministic ids
and a state hash keep the two in step, and a change feed updates every open tab. Generation runs as durable jobs a
worker claims from Postgres with leases, heartbeats, bounded retries, cancellation and restart recovery; a MiniMax task
id is stored the moment it exists, so a restart resumes instead of resubmitting. The GPU holds one model family at a
time. Everything a take is made from is recorded on the take; accepted takes are never overwritten; a character's
appearance freezes the first time they appear in a generated video.

## Read next

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the shape of the system and why
- [docs/PRODUCTION.md](docs/PRODUCTION.md) — producing: Auto Idea, Manual Brief, story → script → storyboard → takes → export
- [docs/MODELS.md](docs/MODELS.md) — every model, where it runs, licence, VRAM plan
- [docs/IMPLEMENTATION-CHECKLIST.md](docs/IMPLEMENTATION-CHECKLIST.md) — what is verified, with evidence, and what is blocked
- [docs/CHARACTER-CONTINUITY.md](docs/CHARACTER-CONTINUITY.md) — the regeneration rule
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) and [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) — the interface
- [docs/research/](docs/research/) — the MiniMax, image, audio and local-engine research the stack rests on
