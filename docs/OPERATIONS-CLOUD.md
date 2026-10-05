# Cloud work and the workstation (since 2026-10-05)

The code lives in the private GitHub repository `MustafaMta/vewbox-studio` (default branch `main`). Generation runs only
on the workstation (RTX 5090, Docker project `vewbox`: ComfyUI with MiniMax H3, the voice and ASR services, Ollama).

## What lives where

| Where | What |
|---|---|
| GitHub (private) | source, migrations, docs, reports/JSON/HTML evidence, app samples (`public/sample`), test fixtures |
| Workstation only | `.env`/`.env.local` (secrets), model weights (`vewbox_models`, `vewbox_ollama`), the database (`vewbox_pgdata`), the media library and backups (`var/`), and every generated image/voice/video, including evidence media under `docs/` (ignored by `.gitignore`) |

Generated media never enters Git. The original unfiltered history (with the old evidence media) is kept on the
workstation: branch `archive/main-before-media-filter` and `var/backups/git-original-history-20261005.bundle`. Tag
`pre-cloud-acceptance-2026-10-05` marks the stable state before cloud work.

## Cloud sessions (no GPU)

Work on branch `cloud-session`, push regularly. Allowed: frontend/backend engineering, typecheck, unit tests, browser
tests that need no inference (`pnpm test:e2e` needs only Postgres), orchestration/recovery logic, model-integration
code, acceptance tooling. Not allowed: running or simulating ComfyUI/MiniMax/voice generation, fake outputs, or
claiming GPU/video/media acceptance. Tests that read workstation-only media skip themselves when it is absent.

## Back on the workstation

**One command** (after step 1 below — merging the cloud work): `node scripts/resume-local.mjs` prints the plan;
`node scripts/resume-local.mjs --go` checks the repository, `.env` files, Docker/WSL memory (≥ 46 GiB), the RTX 5090
on the host and inside a container, backs up the database, applies migrations, verifies the model files on the volume,
starts ComfyUI (every node and model checked), the voice and ASR services, waits for the studio's health, reads the
acceptance checkpoint and prints what stays valid and the real-generation gates. It stops at the first failed step
(`--from <step>` resumes there), keeps job intake paused unless `--resume-intake`, starts the web server and the worker
only with `--start-app`, and writes `var/resume/resume-<time>.json`. The steps by hand:

1. `git fetch origin`; review `origin/cloud-session`; merge it into `main` (`git merge --no-ff origin/cloud-session`),
   `npx tsc --noEmit` and focused vitest; push `main`.
2. Back up the database before applying any new migration
   (`docker exec vewbox-db-1 pg_dump -U vewbox -Fc vewbox -f /tmp/x.dump; docker cp vewbox-db-1:/tmp/x.dump var/backups/redesign-20261003/`),
   then restart the dev server (migrations apply on start).
3. Start Docker Desktop; bring services up one family at a time (`docker compose -p vewbox up -d comfyui`, then voice/ASR
   as needed; see docs/research/GPU-STAGING-2026-10.md); `nvidia-smi`; `node scripts/check-comfy-nodes.mjs`.
4. Resume the acceptance run from `docs/evidence/acceptance-v1/resume.json` and `REPORT.md` ("Resume" section): do not
   redo completed steps unless a code change invalidates them.
