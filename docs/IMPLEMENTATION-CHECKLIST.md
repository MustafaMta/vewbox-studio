# Implementation checklist — Vewbox Studio, MiniMax-only production build

Status values: `NOT_STARTED` · `IN_PROGRESS` · `IMPLEMENTED` (code exists, not exercised) · `TESTING` · `FAILED` ·
`BLOCKED_EXTERNAL` · `VERIFIED` (actually exercised, evidence linked). Nothing is VERIFIED because code exists.

Machine (recorded 2026-10-02): Windows 11 Pro 10.0.26300 · Intel Core Ultra 9 285K (24 cores) · 95.5 GB RAM ·
NVIDIA GeForce RTX 5090 32607 MiB · driver 591.86 · CUDA 13.1 capable · Docker 29.8.1 / Compose v5.5.1 (Docker
Desktop, WSL2 backend Ubuntu-24.04, 24 CPUs / 46.8 GB visible) · NVIDIA runtime registered · GPU visible inside
`nvidia/cuda:12.8.1-base-ubuntu24.04` (`nvidia-smi` in container: RTX 5090, 32607 MiB) · disk C: 767 GB free, D: 974 GB
free · host ffmpeg 9.0.2, node 22.23.3, pnpm 10.34.5, no host Python (everything ML runs in containers).

Starting point: a frontend-only Next.js 16 prototype with zero git commits, no backend, no Docker, no model code; all
generation buttons open a "not connected" dialog. No LTX/Wan code exists in the tree (removed 2026-09-26, see
REMOVAL-MANIFEST.md); this build must not reintroduce any. No MiniMax API key is present on this machine.

| # | Component | Requirement | Status | Evidence / tests | Bugs / blockers | Fix / retest |
|---|---|---|---|---|---|---|
| 0.1 | Baseline | Inspect repo + machine, commit baseline | VERIFIED | commit `7940236`; typecheck clean; 24 unit tests pass | — | — |
| 0.2 | Research | MiniMax video/music/speech/text API brief | VERIFIED | docs/research/MINIMAX-API.md (official docs, 2026-10-02) | Music API closed to new accounts since 2026-08-20 | local music engines chosen |
| 0.3 | Research | Image stack for RTX 5090 | VERIFIED | docs/research/IMAGE-STACK.md | — | — |
| 0.4 | Research | TTS / ASR / lipsync / audio tooling | VERIFIED | docs/research/AUDIO-STACK.md, LOCAL-ENGINES.md | — | — |
| 1.1 | Database | Postgres schema + migrations (shows→takes, characters, locations, voices, assets, jobs, continuity, metrics) | VERIFIED | `drizzle/0000_initial.sql`; seeded 210 rows on first boot; `tests/api` | duplicate take ids in fixtures (fixed: per-shot ids) | — |
| 1.2 | API | Typed command API (every studio action), snapshot, SSE change feed | VERIFIED | `tests/api/studio.test.ts` 13/13; browser round trip (season added, no resync needed) | — | — |
| 1.3 | Media | Upload (MIME sniff, size limits, ffprobe), serve with Range, library on volume | VERIFIED | API tests: real MP4 upload probed (320×180, 2 s), 206 Range, 416, fake/exe rejected 400, protected delete 423 | — | — |
| 1.4 | Frontend store | Replace localStorage store with API-backed store, keep pages | VERIFIED | `src/studio/store.tsx`; optimistic commands + hash check; pages unchanged except call sites | — | — |
| 1.5 | Continuity rule | Enforce appearance lock in service layer + DB, not only UI | VERIFIED | server refuses `updateCharacter` on Layla with 409 APPEARANCE_LOCKED (API test); unit tests | — | — |
| 2.1 | Jobs | Durable Postgres queue: states, leases, heartbeats, retries, backoff, cancel, stale recovery, idempotency | VERIFIED | `tests/worker/queue.test.ts` 6/6 against the live DB: stale lease reclaimed by a second worker (first loses it), backoff schedule, non-retryable never retries, idempotency key collapses duplicates, cancel flag via heartbeat; take job retried with backoff after engine unavailable (negative test) | worker crashed when a reset deleted a job it was finishing (FK on job_events) | fixed: outcome recording never throws; events for gone jobs ignored; process-level rejection handlers |
| 2.2 | Jobs UI | Jobs / Activity page, per-production progress, cancel/retry/regenerate | VERIFIED | `/jobs` shows the failed take job with reason, attempt 2/3, retry; in-place JobButton states | — | — |
| 3.1 | MiniMax video | Client: create task, poll, retrieve, download; model/param mapping; error table | IMPLEMENTED | `src/server/providers/minimax.ts` (v2 H3 + v1 envelope) | cannot be exercised without a key | — |
| 3.2 | MiniMax video | Take generation job: first frame + subject refs → download → ffprobe → proxy/thumb → QA → take | IMPLEMENTED | `src/worker/handlers/take.ts`; two backends (hosted API, local H3 in ComfyUI) | awaiting H3 weights (fetching) | — |
| 3.3 | MiniMax video | Real request evidence (model, refs, duration, cost, consistency) | BLOCKED_EXTERNAL | — | No `MINIMAX_API_KEY` on this machine; local H3 path pending weights | needs key, or local H3 |
| 3.4 | Music | Song generation job (MiniMax Music API, ACE-Step 1.5 local, MiniMax Music 3 local) + stems (Demucs htdemucs in the audio service) as derived assets | IMPLEMENTED | `src/worker/handlers/music.ts` (`makeStems`), `docker/asr/app.py` `/separate` | weights pending; audio image not yet rebuilt with Demucs | — |
| 4.1 | LLM | Story engine provider abstraction (MiniMax text / Anthropic / OpenAI-compatible local) | VERIFIED | `src/server/providers/llm.ts`; Ollama qwen3:14b on the 5090 | — | — |
| 4.2 | Auto Idea | Real proposal generation (format, premise, cast, locations, style, duration, structure) | VERIFIED | API job 64 s → proposal "The Forgotten Observatory" (Iraqi, reused library cat + café); UI job → review rendered, generated notice | — | — |
| 4.3 | Manual Brief | Brief → concept, characters, locations, synopsis, scenes, beats, lines | VERIFIED | API run on a one-line brief ("The Last Bus to Karrada", AR Iraqi, cartoon, 90 s): `DEVELOP_STORY` created Naji (full design) + "Bus Route to Karrada", reused Abu Samir/Karim/Basbousa and the café by name, 2 scenes; `WRITE_SCRIPT` 3 beats + 6/4 lines per scene; `PLAN_SHOTS` 6 shots (first attempt failed validation, retry succeeded) | model put Arabic in the English slot; shots lost their cast list; forgotten lines piled on one shot | gloss rule in the prompt + Arabic moved to `textAr`; cast falls back to continuity/speakers; forgotten lines spread across shots |
| 7.1a | Music video | Performer-aware shots: each shot learns its song window, performers/listeners, sung lines; take prompts carry "X sings <d>…</d>", listeners keep lips closed; the shot's stretch of the real song is passed as reference audio | IMPLEMENTED | `src/domain/timeline.ts` (unit-tested 4/4), `singingTags` in prompts, `take.ts` song segment via ffmpeg | needs a real song + video engine to verify | — |
| 4.4 | Shot planning | Scenes → shots with framing, action, continuity entry/exit state | VERIFIED | `PLAN_SHOTS`: 11 shots over 5 scenes with continuity (CUT/CONTINUATION, wardrobe, screen direction) and prompts; first attempt failed strict validation 3× then succeeded on retry → tolerant schemas added (`lenient.ts`, unit-tested) → scene re-planned first try in 19 s; Karrada short re-planned after the fallbacks: 7 shots in 73 s, first attempt, cast on every shot, lines spread 5/1/0 + 1/1/1/1, STORY_TRANSITION at the scene change | — | — |
| 4.5 | Story schemas | Model output normalised (nulls, synonyms, near-miss keys) before strict validation | VERIFIED | `tests/unit/lenient.test.ts` uses the exact failures seen from Qwen3-14B | — | — |
| 5.1 | Images | ComfyUI container (GPU) with pinned models; workflow templates versioned | VERIFIED | `vewbox/comfyui:dev` (16.1 GB; ComfyUI v0.38.1, torch 2.13.0+cu130) healthy; `/system_stats`: cuda:0 RTX 5090 32607 MB, 30.9 GB free; `scripts/check-comfy-nodes.mjs`: "every class and input the workflows use is present" (969 classes) after two fixes read from the node source (`EmptyAceStep1.5LatentAudio`; Music 3 encoder loads under CLIP type `minimax`); Autogrow reference inputs confirmed as `ref_image_N` / `ref_audio_N` | image build took 62 min on this link (apt/pip retries) | weights still downloading (generation itself tracked in 5.2–5.4, 3.3) |
| 5.2 | Images | Character appearance + reference pack generation | NOT_STARTED | | | |
| 5.3 | Images | Location master + views generation | NOT_STARTED | | | |
| 5.4 | Images | Shot opening frames from character refs + location plate | NOT_STARTED | | | |
| 6.1 | Voice | TTS service (GPU) with cloning; EN/AR evaluation incl. Iraqi | NOT_STARTED | | | |
| 6.2 | Voice | Persistent voice identity per character; preview; dialogue lines | NOT_STARTED | | | |
| 6.3 | ASR | Whisper large-v3-turbo service; transcript validation, subtitle alignment | NOT_STARTED | | | |
| 7.1 | Music video | Performance plan (singer per section, mode), performer-aware shot generation | NOT_STARTED | | | |
| 7.2 | Lipsync | Evaluate MiniMax-native audio / standalone lipsync (no LatentSync, no Wan/LTX) | NOT_STARTED | | | |
| 8.1 | Assembly | ffmpeg concat of chosen takes, audio mix (dialogue/music/ambience), loudness | NOT_STARTED | | | |
| 8.2 | Export | MP4 H.264/H.265 at 720/1080/2160, subtitles AR/EN burn-in + sidecar | NOT_STARTED | | | |
| 8.3 | Validation | ffprobe-based acceptance of every generated and exported file | NOT_STARTED | | | |
| 9.1 | Docker | Compose: web, worker, db, comfyui, tts, asr (+ optional local LLM); healthchecks, volumes, GPU | NOT_STARTED | | | |
| 9.2 | Docker | Clean start / stop / restart; migrations on boot; `.env.example` | NOT_STARTED | | | |
| 9.3 | GPU scheduling | VRAM budget, model unload between services, measurements | NOT_STARTED | | | |
| 10.1 | Tests | Unit (reducers, rules), API, worker, media validation | VERIFIED | unit 38/38 (actions, commands, lenient schemas, password gate); API 13/13 live; worker 6/6 live | — | — |
| 10.2 | Tests | Playwright E2E against the real stack | VERIFIED | run 1: 41/54 (stale copy, fake-audio fixture, external fonts, jobs/settings leaking between tests, aborted reset); run 2: 49/54; run 3 (full, clean): **54/54 in 2.3 min** incl. two real Auto Idea proposals from the local model and the phone/RTL projects | reset request aborted by navigation (trace) | keepalive writes; reset clears jobs; fonts self-hosted (OFL files in `src/app/fonts`) |
| 10.4 | Security | Access gate when `STUDIO_PASSWORD` is set (HTTP Basic on pages + API, health exempt, constant-time) | VERIFIED | `src/proxy.ts`; `tests/unit/proxy.test.ts` 3/3; proxy seen in request timing logs | was declared in env but not enforced before | — |
| 10.3 | Negative tests | Invalid key, timeout, rate limit, bad media, restart mid-job, duplicate submit | TESTING | `tests/api/negative.test.ts` 9/9: truncated MP4 refused after decode, SVG-with-script refused, empty/no-file/non-multipart refused, hostile media ids, take job without an engine fails with a reason and no fake take, wrong payloads per type, cancel/retry in wrong states, batch atomicity, oversized batches; `tests/worker/minimax.test.ts`: real api.minimax.io request with a wrong key → terminal PROVIDER error (never retried); missing key → NOT_CONFIGURED; stale-lease/restart in `queue.test.ts` | found: NOT_CONFIGURED was wrapped as a retryable provider error (fixed); SVG uploads were accepted (fixed) | rate limit / timeout against the real API need a key |
| 11.1 | Acceptance | Stage 1–8 ladder | NOT_STARTED | | | |
| 12.1 | Docs | Setup, operations, models, production, architecture, final report | IN_PROGRESS | ARCHITECTURE.md, SETUP.md, OPERATIONS.md, MODELS.md written; PRODUCTION.md, README rewrite and final report pending | — | — |
