# Setup

Vewbox Studio runs as a Docker Compose stack on one machine with an NVIDIA GPU. This guide was written and exercised on
the reference machine (Windows 11, Docker Desktop with the WSL2 backend, RTX 5090 32 GB); Linux hosts with the NVIDIA
Container Toolkit work the same way.

## Requirements

| What | Why |
|---|---|
| Docker Engine 27+ / Docker Desktop 4.40+ with Compose v2.30+ | the stack is one `compose.yaml` |
| NVIDIA driver 570+ and the NVIDIA container runtime (Docker Desktop ships it; Linux installs `nvidia-container-toolkit`) | the GPU services (`comfyui`, `tts`, `tts-habibi`, `asr`, `llm`) request `driver: nvidia` |
| 32 GB VRAM (24 GB works with the smaller image models; the local MiniMax H3 needs the full 32 GB) | one model family is resident at a time |
| ~200 GB free disk for the models volume, plus your library | MiniMax H3 ≈ 42 GB, Qwen-Image stack ≈ 45 GB, Whisper ≈ 3 GB, music engines ≈ 20 GB, voices ≈ 10 GB |
| Internet for the first start (images, weights) | after that the studio contacts nothing unless you add a MiniMax key |

Verify the GPU is visible to containers before anything else:

```bash
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu24.04 nvidia-smi
```

## 1. Configure

```bash
cp .env.example .env
```

Edit `.env`:

- `POSTGRES_PASSWORD` — pick one; it never leaves the Compose network.
- `STUDIO_PASSWORD` — optional. Leave empty on a trusted LAN; set it to require a password on every page and API call.
- `MINIMAX_API_KEY` — optional. With it, video generation uses the hosted MiniMax API (H3) and the story engine can use
  MiniMax M3. Without it, video comes from the local MiniMax H3 (open weights) in ComfyUI and writing from the bundled
  local model. Nothing else changes.
- `LIBRARY_DIR` — where generated and uploaded media lives on the host (default `./var/library`).
- `MODEL_GROUPS` — which weight groups the fetcher downloads (default: everything the studio can use).

Secrets live only in `.env` (git-ignored). The web and worker log with redaction, so a key never appears in logs.

## 2. Fetch the weights (once)

```bash
docker compose --profile models run --rm models
```

The fetcher is resumable and verifies every file against the SHA-256 in `docker/models/manifest.json`; stop it and run
it again whenever you like. On a slow link this is the long step (the MiniMax H3 group alone is about 42 GB). The
studio starts without the weights; buttons whose engine lacks its model say so until the download finishes.

## 3. Start

```bash
docker compose up -d --build
```

First start builds five images (web, worker, ComfyUI, the two voice services and the transcriber are built from
`docker/`) and pulls Postgres and Ollama. Then:

```bash
docker compose ps
```

Everything should read `healthy`. The GPU services take a few minutes the first time (ComfyUI compiles nothing but
loads torch; the voice services download their own weights on first boot). The studio is at
<http://localhost:4200>; Settings → Engines shows which engines answer right now.

The database schema is applied automatically on boot (`drizzle/` migrations, under an advisory lock, so several
replicas can start together). An untouched database is seeded with the sample studio.

## 4. Check

- Settings → Engines: ComfyUI, voices, transcription and the story engine are green.
- Open **The Last Sip → S1E1 → Produce** and press **Prepare frames** on a shot: a job appears in Activity and
  images arrive in the shot a minute later.
- Open a character → **Voice → Build the voice**, then **Preview**: a line is spoken and checked by transcription.
- Press **Generate** on a shot: a MiniMax H3 take arrives (hosted or local), with its provenance on the take.

## Development on the host

The host needs Node 22 and pnpm. Start only the infrastructure in Docker and run web and worker with hot reload:

```bash
docker compose up -d db llm comfyui tts tts-habibi asr
pnpm install
pnpm dev            # web on :4200, reads .env + .env.local
pnpm worker         # the worker, same env
```

`.env.local` points the host processes at the published ports (`DATABASE_URL=postgres://…@127.0.0.1:5432/vewbox`,
`COMFYUI_URL=http://127.0.0.1:8188`, …); the Docker services talk to each other by service name.

Tests:

```bash
pnpm test           # unit: reducers, rules, story schemas
pnpm test:api       # live HTTP contracts against a running studio (STUDIO_URL, default :4200)
pnpm test:worker    # queue leases, retries, idempotency against the live database
pnpm e2e            # Playwright through the real interface (needs `pnpm exec playwright install chromium` once)
```

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations run on boot. Model files are pinned by name and hash; a new release that needs new weights says so in
`docs/MODELS.md`, and the fetcher downloads only what is missing.

## Stopping and removing

```bash
docker compose down            # stops everything; data stays in the volumes
docker compose down -v         # also removes the database and the models volume (not your LIBRARY_DIR)
```
