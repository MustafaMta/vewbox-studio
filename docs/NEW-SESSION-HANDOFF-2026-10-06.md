# New-session handoff — 2026-10-06

Read this first. It replaces the history of the 2026-10-02..06 session; details live in the docs listed in
`docs/README.md`.

## 1. Where things are

| What | Where |
|---|---|
| Code (canonical) | `D:\vewbox`, branch `main` (base `3dad9376` + this handoff commit), GitHub private `MustafaMta/vewbox-studio` |
| Studio library (productions, uploads, exports; DB rows hold paths relative to it) | `D:\vewbox-data\library` (`LIBRARY_DIR` / `LIBRARY_ROOT`) — empty: the studio was reset to fresh on 2026-10-06 |
| Previous studio (before the fresh reset; restorable) | DB dump `D:\vewbox-data\backups\vewbox-db-before-fresh-2026-10-06.dump` (pg_dump -Fc, test-restored: 6 productions, 39 takes, 400 assets, 167 jobs, 11 characters; SHA-256 `DB8C1601…F1247B`) + its library `D:\vewbox-data\archive\library-before-fresh-2026-10-06\` (538 files, 687 MB). Restore: recreate DB `vewbox`, `pg_restore -U vewbox -d vewbox --no-owner <dump>`, move the library folder back |
| Archived docs and evidence (818 files) | `D:\vewbox-data\archive\repo-docs-2026-10-06\` (also in git history) |
| Old checkout (read-only archive: old worktrees, evidence media, `var/backups`, unfiltered-history bundle) | `D:\volexar-studio\volexar-studio` — nothing runs from it; remove only on the producer's word |
| Model weights (all of them) | `D:\models\vewbox-models.vhdx` (ext4), attached by `wsl --mount --vhd … --name models`; Docker sees `/run/desktop/mnt/host/wsl/models` (`VEWBOX_MODELS_ROOT`) — docs/MODELS-STORAGE.md |
| Database | PostgreSQL 17, container `vewbox-db-1`, volume `vewbox_pgdata`, 127.0.0.1:5432, DB `vewbox` — FRESH, empty studio (migrated and seeded 2026-10-06). Test DBs kept: `vewbox_e2e`, `vewbox_test`, `vewbox_test_backend` (suites reset them) |
| Web / worker | :4200 and the host worker, started by the watchdog outside the Claude app's job; logs `var/web-detached.log`, `var/worker-detached.log`, `var/docker-watchdog.log` |
| Sign-in task | "Vewbox watchdog" → `cmd.exe /c "D:\vewbox\scripts\watchdog-at-logon.cmd"` (start in `D:\vewbox`) |
| Secrets | `.env` / `.env.local` (git-ignored; HF_TOKEN etc. — never print or commit) |
| Unmerged branches on origin | `wip/planner-qwen3.8-vllm` (Phase 1 start), `preserve/music-stack-2026-10-06` (Phase 3 input), `preserve/qa-2026-10-06` (QA scripts and reports), `deferred/auto-idea-research`, `cloud-session` |

Workstation: Intel Core Ultra 9 285K, 95.5 GiB RAM (WSL/Docker capped at 80 GB + 32 GB swap), NVIDIA RTX 5090 32,607 MiB
(driver 591.86), Docker 29.8.1, Windows 11 Pro. Internet ≈ 5 MB/s and Norton re-signs HTTPS (builds trust
`var/certs/extra-ca.pem` via the compose secret `extra_ca`). Node `D:\tools\node`, pnpm store `D:\.pnpm-store`.

Storage migration is complete: every weight is in the D: store; the C: copies (246.8 GB + the 54.1 GB Ollama volume)
were deleted after verification and Docker's disk compacted (C: free 532 GB). Old volume names `vewbox_models` /
`vewbox_ollama` are tombstones. Docker images stay in Docker's own disk on C: (images, not weights).

## 2. State right now

- The studio is **fresh and empty** (no productions, characters, takes or jobs). Intake is **paused** ("Fresh studio
  2026-10-06; waiting for Phase 1"). `scripts/studio-intake.ts status|resume`.
- Everything is stopped except the database container: no web server, no worker, no inference container; GPU idle.
  The "Vewbox watchdog" sign-in task starts Docker, worker and web from `D:\vewbox` at the next sign-in, or now with
  `pnpm exec tsx scripts/docker-watchdog.ts --fix --worker --web`.
- Configuration: provider `openai-compatible`, video `MiniMax-H3` (local only; no hosted keys in `.env`).
- The model registry reports 0 models present while ComfyUI is stopped (it reads ComfyUI's listings; 42 when it runs).

## 3. Frozen model stack

| Role | Model | State |
|---|---|---|
| Brain (ideas, stories, scripts, shot plans) | **Qwen3.8-27B-FP8** (`Qwen/Qwen3.8-27B-FP8` @ `017b9c7a`, Apache-2.0, 30.89 GB) | weights downloaded and sha256-verified into the store `llm/qwen3.8-27b-fp8` (manifest group `llm-qwen3.8-27b-fp8`); **not yet served** — Phase 1 |
| Images | Qwen-Image-2512 (fp8) · Qwen-Image-Edit-2511 (also "character from a picture") | in use (ComfyUI) |
| Video | MiniMax H3 (local, ComfyUI), FINAL tier default | in use; the only video engine |
| English voice | MOSS-TTS (Delay-8B v1.5, `tts-moss` :8023) | wired; to be re-established step by step in Phase 2 |
| ASR / alignment | Whisper large-v3 / CTC `/align` in the asr service (WhisperX-style) | in use |
| Lip-sync | LatentSync 1.6, realistic speech repair only (`lipsync` :8045) | cartoon/anime/singing no-go; realistic go/no-go pending |
| Music | ACE-Step 1.5 (+ HTDemucs, MOSS-SoundEffect) | Phase 3; XL weights only partly fetched (9.9 of 43.9 GB) |

Today's live planner setting is still Ollama `qwen3.6:27b-q8_0` (`.env` OPENAI_COMPATIBLE_*), because Qwen3.8 has no
server yet. Qwen3.6 and Gemma 4 weights stay in the store until the producer approves removal; the FLUX klein route was
removed (its manifest group `images-flux2-klein` is unreferenced; weights await the producer).

## 4. Known unresolved defects

- **Terms gate is client-only (major):** `POST /api/jobs` queues work with the terms un-accepted. Enforce on the server.
- **/production layout shift 0.055 (limit 0.02):** the skeleton reserves one row of decision cards; the page has two.
  Minor: /assets at 390 shifts 0.035; several 390 controls are 20 px high; shot page 0.0175; the first shot's
  disabled-option reason printed twice. The 1920 page sweep stopped at 44/53 pages.
- Film findings below come from the previous studio (now in the backup/archive above); they describe pipeline behaviour
  to re-check in Phase 6, not data in the fresh studio.
- **Tea at Mutanabbi** (export `gen-c4161f13c5bf330c7a21`, in the archived library; PASS WITH OPEN DEFECTS): blink pop at the continuous join;
  ~1.5 s push-in in shot 1.2; the vendor missing in 1.3; background level drops ~18 dB at the 1.2→1.3 cut; the room
  bed's 1.5 s loop needs a listen.
- Gwenllian ("The Last Ferry") cheek artifact; her framing fix (crop clamp, `c3f003b0`) is unproven on a real take.
- Gate 5 "The Second Glass" stopped before any take (resume steps in the archive:
  `acceptance-v1/the-second-glass/stop-2026-10-06.json`).
- Worker suite: 4 failures that also fail on main (3 voice/transcription cases in `engine-faults`, 1 in
  `failure-recovery`); `production-recovery` is flaky.
- LatentSync weights are OpenRAIL++-M: its use restrictions are in the terms; realistic correction not yet proven.
- Hosted-provider code (MiniMax API, Anthropic) still exists behind `LLM_PROVIDER` / `VIDEO_BACKEND`; `.env` pins
  local. Removing it touches many files — do it with or after Phase 1's provider work.
- MiniMax H3 territory licence: the producer is applying (outputs not to be displayed in US/EU/UK/KR until granted).

## 5. Intentionally postponed

Voice, music, Iraqi Arabic, films (Shorts, Music Videos, Shows), MiniMax acceptance, the music fetch, the music
branch merge, Qwen3.6/Gemma/FLUX-klein weight cleanup, removal of the old checkout — each waits for its phase or for
the producer.

## 6. The plan (work strictly in this order; prove each phase, report, wait)

**Phase 1** — Integrate and prove **Qwen3.8-27B-FP8** as the Vewbox brain.
Start from `origin/wip/planner-qwen3.8-vllm` (vLLM OpenAI server `llm-vllm` on the store's `llm/qwen3.8-27b-fp8`, read-only,
offline; non-thinking via `chat_template_kwargs {"enable_thinking": false}`; sleep/wake as the lease unloader). Pull the
vLLM image (≈ 20 GB on Docker's C: disk was approved), fit it on the card (single-5090 notes: `--enforce-eager`,
`--max-model-len` ~16k, FP8 KV), run `scripts/planner-focused-test.ts` (concept → outline → scene → 3-shot plan,
JSON validity, continuity, one image+text input), measure load time, VRAM, RAM, tok/s, first-token latency; then one
real-UI planning run with intake resumed only for that run. Promote, remove Qwen3.6 from routing (files kept), merge.
Before the first start: pin the vLLM image by digest in compose and create the store folder `cache/vllm` (compose
mounts it as a subfolder). Open risk: 28.8 GiB of weights on ~31.4 GiB usable VRAM leaves ~2.5 GiB for KV cache and
activations — if 16k context does not fit, try text-only mode or a shorter context, and report before any 4-bit
variant. Measure wake-from-sleep time and the VRAM a sleeping vLLM keeps; if H3 cannot run beside it, stop/start the
container instead of sleeping it. The branch's lease estimate (31,500 MB) and speed (25 tok/s) are placeholders. The
focused test's image+text step uses Najm's canonical image, now at
`D:\vewbox-data\library\image\2026\10\gen-f90820998a.png` (the script still names `var/library/...`).
Download record: 79/79 files sha256-verified, 30,890,048,027 bytes, revision `017b9c7af6b5689d5dd426a76e0bc077eb5ca20a`.
Resume/verify the download if ever needed: `docker compose -p vewbox --profile models run --rm models --manifest
manifest.json --root /models --groups llm-qwen3.8-27b-fp8`.

**Phase 2** — Establish the English voice stack and test persistent character speech.

**Phase 3** — Establish the music pipeline in ComfyUI: LLM → song concept/lyrics → ACE-Step → final song → test playback.

**Phase 4** — Establish a high-quality Iraqi Arabic voice. Test Baghdadi pronunciation, natural speech, persistent
identity, short and long dialogue.

**Phase 5** — Generate an actual Iraqi Arabic song and test Iraqi lyrics, pronunciation, singing quality, rhythm,
music generation and lyric timing.

**Phase 6** — After these foundations are individually proven, return to character/image consistency, MiniMax H3
filmmaking, continuity, lip-sync, Shorts, Music Videos and long-form Shows/Episodes.

## 7. Working rules that cost time to learn

- One GPU workload at a time, through the machine-wide DB lease (`scripts/gpu-hold.ts` for work outside the worker).
- One large download at a time (`var/locks/download.lock`); budget ~1 h per 18 GB.
- Never `docker compose up/create` a shared service from a worktree; never Docker "Reset to factory defaults".
- Restart worker/web via the watchdog (`pnpm exec tsx scripts/docker-watchdog.ts --fix --worker --web`), not
  Start-Process; the worker does not hot-reload.
- Browser e2e (`pnpm test:e2e`) and reset scripts use their own DB, never `vewbox`.
- Acceptance is in the real UI, watching the films; tests are not acceptance. Commercial-safe licences only.
